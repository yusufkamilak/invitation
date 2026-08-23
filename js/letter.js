/*
 * letter.js — the entrance sequence on the letter the envelope opens into.
 *
 * play() is called by render.js at the hand-off, the moment the grown
 * envelope has been swapped for the real #letter underneath it. Four beats,
 * in order: the title fades up, the body follows, then the sign-off and the
 * names, then the scroll hint.
 *
 * The stagger inside a beat is pure CSS (transition-delay off a --i custom
 * property, see .letter .ln in style.css). This file only advances between
 * the four beats, so there is one place that owns timing rather than two
 * that can drift apart.
 *
 * Every wait is a transitionend listener with a timer behind it. The event
 * is what actually drives the chain; the timer exists because a transition
 * whose value never really changes fires no event at all, and a guest stuck
 * on a half-shown letter has no way out.
 *
 * When the last beat lands, or the guest skips to it, a `letter:done` event
 * is dispatched on document. js/paging.js waits on it before arming.
 */
window.WeddingLetter = (function () {
  "use strict";

  var done = false;
  var started = false;
  var announced = false;
  var timers = [];

  function el(id) {
    return document.getElementById(id);
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // Waits for `event` on `node`, or `ms`, whichever comes first, and never
  // both. `ms` should sit just above the real CSS duration.
  function after(node, event, ms, cb) {
    var fired = false;
    function go() {
      if (fired || done) return;
      fired = true;
      node.removeEventListener(event, onEvent);
      cb();
    }
    function onEvent(e) {
      if (e.target === node || node.contains(e.target)) go();
    }
    node.addEventListener(event, onEvent);
    timers.push(window.setTimeout(go, ms));
  }

  // The last line of a block is the one whose transition ending means the
  // whole block has arrived: it carries the longest --i delay.
  function lastLine(container) {
    var lines = container.querySelectorAll(".ln");
    return lines.length ? lines[lines.length - 1] : container;
  }

  // How long the staggered lines in a block take, worst case. Read off the
  // CSS rather than hard-coded here so the two cannot disagree. Only
  // meaningful once the beat's class is on the letter, since that is what
  // puts the delay on the line.
  function blockMs(container) {
    var lines = container.querySelectorAll(".ln");
    if (!lines.length) return 0;
    var style = window.getComputedStyle(lines[lines.length - 1]);
    var dur = parseFloat(style.transitionDuration) || 0;
    var delay = parseFloat(style.transitionDelay) || 0;
    return (dur + delay) * 1000;
  }

  // The letter is set in two faces the rest of the site does not use, and
  // fading a line up in a fallback face only to reflow it mid-beat is worse
  // than a short wait. The timeout is the important half: a font that never
  // arrives must not strand the guest on a blank page.
  function whenFontsReady(cb) {
    var called = false;
    function go() {
      if (called) return;
      called = true;
      cb();
    }
    var timer = window.setTimeout(go, 2000);
    if (!document.fonts || !document.fonts.load) {
      window.clearTimeout(timer);
      return go();
    }
    // The title text is passed so the right subset is fetched: a Turkish or
    // German name pulls in latin-ext, which the latin file does not cover.
    var title = el("letter-title");
    var text = title ? title.textContent : "";
    Promise.all([
      document.fonts.load("1em 'Ms Madi'", text),
      document.fonts.load("1em Alegreya"),
    ]).then(function () {
      window.clearTimeout(timer);
      go();
    }, go);
  }

  // Announced once, whichever way the letter got to the end. paging.js
  // arms on this: without it, the same flick that skips the sequence would
  // also page the guest off the letter they just asked to see.
  function announceDone() {
    if (announced) return;
    announced = true;
    document.dispatchEvent(new CustomEvent("letter:done"));
  }

  // Jump to the end: every line shown, nothing transitioning. Used by the
  // skip, by reduced motion, and by a language switch that rebuilds the
  // lines after the guest has already watched them arrive.
  function finish() {
    var letter = el("letter");
    if (!letter) return;
    done = true;
    timers.forEach(window.clearTimeout);
    timers = [];
    letter.classList.add("is-done");
    letter.classList.remove("is-writing", "is-body-in", "is-signing", "is-hinting");
    announceDone();
  }

  function bindSkip() {
    var events = ["pointerdown", "wheel", "keydown", "touchstart"];
    function skip() {
      events.forEach(function (e) {
        window.removeEventListener(e, skip);
      });
      finish();
    }
    events.forEach(function (e) {
      window.addEventListener(e, skip, { passive: true });
    });
  }

  function play() {
    var letter = el("letter");
    if (!letter || started) return;
    started = true;

    if (prefersReducedMotion()) {
      // The global reduced-motion block zeroes every duration, so replaying
      // the choreography here would be a strobe of four states rather than
      // a sequence. Show the finished letter instead.
      return finish();
    }

    whenFontsReady(function () {
      if (done) return;

      // Bound after the first frame of the sequence, not before: the same
      // tap that opened the envelope is still in flight and would otherwise
      // skip the letter it just asked for.
      timers.push(window.setTimeout(bindSkip, 400));

      var title = el("letter-title");
      var body = el("letter-body");
      var names = el("letter-names");

      letter.classList.add("is-writing");

      after(lastLine(title), "transitionend", blockMs(title) + 250, function () {
        letter.classList.add("is-body-in");

        // The last paragraph, not the block: the paragraphs are staggered,
        // so a transitionend on the container would arrive with the first
        // one and cut the beat short.
        after(body.lastElementChild || body, "transitionend", 1600, function () {
          letter.classList.add("is-signing");

          after(lastLine(names), "transitionend", blockMs(names) + 900, function () {
            letter.classList.add("is-hinting");
            done = true;
            announceDone();
          });
        });
      });
    });
  }

  return {
    play: play,
    finish: finish,
    isDone: function () {
      return done;
    },
  };
})();
