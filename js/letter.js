/*
 * letter.js — the writing sequence on the letter the envelope opens into.
 *
 * play() is called by render.js at the hand-off, the moment the grown
 * envelope has been swapped for the real #letter underneath it. Four beats,
 * in order: the title writes itself on, the body appears, the sign-off and
 * the names write themselves on, then the scroll hint fades up.
 *
 * The stagger between lines is pure CSS (animation-delay off a --i custom
 * property, see .letter .ink in style.css). This file only advances between
 * the four beats, so there is one place that owns timing rather than two
 * that can drift apart.
 *
 * Every wait is an animationend/transitionend listener with a timer behind
 * it. The event is what actually drives the chain; the timer exists because
 * a transition whose value never really changes fires no event at all, and
 * a guest stuck on a half-written letter has no way out.
 */
window.WeddingLetter = (function () {
  "use strict";

  var done = false;
  var started = false;
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

  // The last line of a block is the one whose animation ending means the
  // whole block has been written.
  function lastLine(container) {
    var inks = container.querySelectorAll(".ink");
    return inks.length ? inks[inks.length - 1] : container;
  }

  // How long the staggered lines in a block take, worst case. Read off the
  // CSS rather than hard-coded here so the two cannot disagree.
  function blockMs(container) {
    var inks = container.querySelectorAll(".ink");
    if (!inks.length) return 0;
    var style = window.getComputedStyle(inks[inks.length - 1]);
    var dur = parseFloat(style.animationDuration) || 0;
    var delay = parseFloat(style.animationDelay) || 0;
    return (dur + delay) * 1000;
  }

  // Sacramento is the whole point of the effect, so writing in a fallback
  // face and reflowing mid-animation would be worse than a short wait. The
  // timeout is the important half: a font that never arrives must not
  // strand the guest on a blank page.
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
      document.fonts.load("1em Sacramento", text),
      document.fonts.load("300 1em 'Cormorant Garamond'"),
    ]).then(function () {
      window.clearTimeout(timer);
      go();
    }, go);
  }

  // Jump to the end: every line written, everything visible, nothing
  // animating. Used by the skip, by reduced motion, and by a language
  // switch that rebuilds the lines after the guest has already watched it.
  function finish() {
    var letter = el("letter");
    if (!letter) return;
    done = true;
    timers.forEach(window.clearTimeout);
    timers = [];
    letter.classList.add("is-done");
    letter.classList.remove("is-writing", "is-body-in", "is-signing", "is-hinting");
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

      after(lastLine(title), "animationend", blockMs(title) + 250, function () {
        letter.classList.add("is-body-in");

        // The last paragraph, not the block: the paragraphs are staggered,
        // so a transitionend on the container would arrive with the first
        // one and cut the beat short.
        after(body.lastElementChild || body, "transitionend", 1600, function () {
          letter.classList.add("is-signing");

          after(lastLine(names), "animationend", blockMs(names) + 900, function () {
            letter.classList.add("is-hinting");
            done = true;
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
