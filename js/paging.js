/*
 * paging.js — the one snap between the letter and the green page.
 *
 * The letter is a page, not the top of a long scroll: it should sit still
 * while it is read and then be left in one move, rather than being dragged
 * halfway off the screen. So the page is locked while the guest is on it,
 * and the first gesture in any modality releases the lock and scrolls the
 * card into place. From there scrolling is free, in both directions, and
 * this file is done: it never re-arms and never snaps again.
 *
 * CSS scroll-snap would have been the obvious tool and is the wrong one: it
 * governs the whole scroller, so it would also snap the sections below the
 * card, and desktop trackpads land unpredictably between two mandatory
 * points.
 *
 * Two rules keep the lock from becoming a trap:
 *
 *   - It is only ever held over a letter that fits the screen. Longer copy
 *     on a short phone pushes the letter past one screen, and locking that
 *     would put the sign-off somewhere the guest cannot reach.
 *   - It only starts listening once the letter has finished arriving
 *     (the `letter:done` event from js/letter.js). js/letter.js binds the
 *     same gestures to skip the sequence, and one flick must not both skip
 *     the letter and page off it.
 */
window.WeddingPaging = (function () {
  "use strict";

  var LOCK = "is-paged";
  // Far enough that a thumb resting on the glass is not a swipe, short
  // enough that a flick registers before the finger leaves the screen.
  var SWIPE_PX = 24;

  var locked = false;
  var spent = false;
  var touchY = null;
  var unbinders = [];

  function el(id) {
    return document.getElementById(id);
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // Whether holding the guest here is a pagination or a trap. innerHeight
  // rather than a CSS unit: this has to agree with what actually scrolls.
  function fitsOneScreen() {
    var letter = el("letter");
    if (!letter) return false;
    return letter.getBoundingClientRect().height <= window.innerHeight + 2;
  }

  function setLock(on) {
    locked = on;
    document.documentElement.classList.toggle(LOCK, on);
    document.body.classList.toggle(LOCK, on);
  }

  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    unbinders.push(function () {
      target.removeEventListener(type, fn, opts);
    });
  }

  function unbindAll() {
    unbinders.forEach(function (off) { off(); });
    unbinders = [];
  }

  // Give up without moving: used when the letter turns out not to fit, so
  // the guest simply gets an ordinary scrolling page.
  function standDown() {
    if (spent) return;
    spent = true;
    unbindAll();
    setLock(false);
  }

  function go() {
    if (spent) return;
    spent = true;
    unbindAll();

    var card = el("card");
    if (!card) return setLock(false);

    // The lock stays on across the snap, and that is the point: overflow:
    // hidden stops the *guest* scrolling, not the page being scrolled, so
    // the move below still runs. Release it first and the rest of the
    // gesture that triggered it keeps arriving - the tail of a swipe, the
    // momentum of a trackpad fling - and lands the guest somewhere past the
    // top of the card instead of on it.
    //
    // Explicit behavior rather than leaning on html { scroll-behavior:
    // smooth }: the reduced-motion block overrides that property, but not
    // this argument.
    card.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });

    // scrollend is the honest signal and is not everywhere yet (Safari 17,
    // Firefox 109). The timer is the fallback, and long enough to outlast a
    // smooth scroll of one screen.
    var released = false;
    function release() {
      if (released) return;
      released = true;
      document.removeEventListener("scrollend", release);
      setLock(false);
    }
    document.addEventListener("scrollend", release, { once: true });
    window.setTimeout(release, 1200);
  }

  function bindTriggers() {
    on(window, "wheel", function (e) {
      if (e.deltaY > 0) go();
    }, { passive: true });

    on(window, "touchstart", function (e) {
      touchY = e.touches && e.touches.length ? e.touches[0].clientY : null;
    }, { passive: true });

    // Not passive, and it prevents default: once the first touchmove of a
    // gesture is cancelled the browser will not scroll for the rest of it,
    // so the swipe that asks to page down cannot also fling the page.
    on(window, "touchmove", function (e) {
      if (touchY === null || !e.touches || !e.touches.length) return;
      if (e.cancelable) e.preventDefault();
      if (touchY - e.touches[0].clientY > SWIPE_PX) go();
    }, { passive: false });

    on(window, "keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === "End" ||
          e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        go();
      }
    });

    var hint = el("letter-hint");
    if (hint) {
      on(hint, "click", go);
      // Space and the arrows are already caught above; Enter is not, and it
      // is what a screen reader will send to a role="button".
      on(hint, "keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          go();
        }
      });
    }

    // Tab out of the letter and the browser will try to scroll the newly
    // focused control into view, against a locked page. Page down properly
    // instead, so keyboard and pointer land in the same place.
    on(document, "focusin", function (e) {
      var letter = el("letter");
      if (letter && e.target !== letter && !letter.contains(e.target)) go();
    });
  }

  // Called by render.js at the hand-off, in the same frame js/envelope.js
  // drops its own lock, so there is no gap where the page can be scrolled.
  // The lock is taken unconditionally here and re-examined in arm(): the
  // letter is measured properly once its two faces have loaded, and until
  // then the only thing the guest could do with a free page is scroll past
  // the letter they just opened.
  function start() {
    if (spent || !el("card") || !el("letter")) return;
    setLock(true);
    // Bound for the whole locked period, not just once armed: a rotate can
    // turn a letter that fit into one that does not, and nothing is worth
    // snapping at that point. Hand the page back instead.
    on(window, "resize", function () {
      if (!fitsOneScreen()) standDown();
    });
    document.addEventListener("letter:done", arm, { once: true });
  }

  function arm() {
    if (spent) return;
    if (!fitsOneScreen()) return standDown();
    bindTriggers();
  }

  return { start: start, isLocked: function () { return locked; } };
})();
