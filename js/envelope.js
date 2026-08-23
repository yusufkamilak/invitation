/*
 * envelope.js — the sealed envelope, and the move that turns it into the
 * letter.
 *
 * It is shown by render.js *after* the bundle has been decrypted and the
 * page underneath has already been painted, so the letter it grows into is
 * already laid out and measurable.
 *
 * Tapping it runs one continuous gesture: the paper turns over, and part
 * way through the turn it starts growing until it covers exactly the box
 * .letter-paper occupies. By the end it is a blank cream rectangle sitting
 * on top of an identical blank cream rectangle, so the overlay can simply be
 * hidden. No cross-fade: two identical opaque rectangles only fade
 * invisibly if the lower one is already fully painted, and a hard swap has
 * no such precondition.
 *
 * The overlay's own beige and the beige around .letter-paper are the same
 * gradient, so the surround does not have to be matched frame by frame: it
 * is already the same picture before and after the swap.
 *
 * The growth has to be measured in JS. .env-paper is sized
 * `min(84vw, 24rem)` with `max-height: 60svh` and `aspect-ratio: 3/2`, so
 * on a short viewport it is not 3:2 at all and its box cannot be derived
 * from the viewport; and CSS cannot divide one length by another anyway.
 */
window.WeddingEnvelope = (function () {
  "use strict";

  // Match the transitions in style.css (.env-paper 0.8s, .env-grow 0.7s).
  // The growth starts ~58% into the turn, once the card is past edge-on and
  // already coming back toward the viewer, so the anisotropic scale never
  // lands on a face that is still steeply foreshortened.
  var GROW_START_MS = 460;
  var GROW_MS = 700;
  // No overshoot. It used to be 2px, to stop a fractional scale leaving a
  // hairline of beige along an edge of a full-bleed letter. The letter has
  // visible margins now, so the same overshoot would instead make the card
  // jump 2px smaller at the swap, against an edge the guest can see.
  var BLEED = 0;

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function show(bundle, onOpen) {
    var el = document.getElementById("envelope");
    var paper = document.getElementById("env-paper");
    var grow = document.getElementById("env-grow");
    // The paper, not the section: the section is a full screen of beige
    // with the paper inset in it, and growing to the section would put the
    // cream back out to the edges the inset exists to create.
    var letter = document.getElementById("letter-paper");
    var to = document.getElementById("env-to");
    // Not auto-focused: a programmatic focus paints the focus ring on every
    // load, which reads as a permanent border rather than a focus state. The
    // envelope is the first focusable thing on the page, so Tab reaches it
    // immediately anyway.

    if (!el || !paper || !grow || !letter) {
      // No envelope markup for some reason — never strand the guest.
      handOver(el, onOpen);
      return;
    }

    to.textContent = bundle.guest.name;
    document.documentElement.classList.add("is-sealed");
    document.body.classList.add("is-sealed");
    el.hidden = false;

    var opened = false;
    var timers = [];

    function open() {
      if (opened) return;
      opened = true;

      if (prefersReducedMotion()) {
        // Every duration is already zeroed by the global reduced-motion
        // block, so playing the move would be a strobe rather than a
        // sequence. Go straight to the letter.
        handOver(el, onOpen);
        return;
      }

      // overflow: hidden does not reset scrollTop, so a reload that restores
      // a scroll position would leave #letter off-screen and the measurement
      // below pointing at nothing.
      if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
      window.scrollTo(0, 0);

      // Measure the destination element, not the viewport. On iOS a
      // position: fixed overlay is sized to the *large* viewport while
      // #letter's 100svh is the small one, and they differ by the height of
      // the address bar. The inset paper makes this more true, not less.
      var from = paper.getBoundingClientRect();
      var target = letter.getBoundingClientRect();

      var sx = (target.width + BLEED * 2) / from.width;
      var sy = (target.height + BLEED * 2) / from.height;
      // Centre to centre: transform-origin stays at its 50% 50% default, so
      // the card expands outward into the page rather than growing out of a
      // corner the way a 0 0 origin would.
      var tx = target.left + target.width / 2 - (from.left + from.width / 2);
      var ty = target.top + target.height / 2 - (from.top + from.height / 2);

      el.classList.add("is-flipping");

      timers.push(
        window.setTimeout(function () {
          grow.style.transform =
            "translate(" + tx + "px, " + ty + "px) scale(" + sx + ", " + sy + ")";
        }, GROW_START_MS)
      );

      timers.push(
        window.setTimeout(function () {
          // One frame, no fade: by now the overlay is a cream rectangle
          // exactly over the cream letter.
          window.requestAnimationFrame(function () {
            handOver(el, onOpen);
          });
        }, GROW_START_MS + GROW_MS)
      );

      // A rotate part way through invalidates the measurement above, and
      // there is no honest way to re-target mid-flight. Land immediately.
      window.addEventListener("resize", function onResize() {
        window.removeEventListener("resize", onResize);
        timers.forEach(window.clearTimeout);
        handOver(el, onOpen);
      });
    }

    // The whole overlay is the target, not just the paper, so a slightly
    // off tap still opens it. The `opened` guard absorbs the duplicate
    // event when the click starts on the paper and bubbles up.
    el.addEventListener("click", open);
    paper.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        open();
      }
    });
  }

  // The hand-off. The sealed lock comes off here, and js/paging.js takes
  // its own in the same frame (render.js calls WeddingPaging.start() from
  // onOpen below). That is not the guest being held still: the letter is
  // one page rather than the top of a scroll, and the first gesture in any
  // modality releases it and snaps to the card. A letter too tall to fit
  // the screen is never locked at all; see js/paging.js.
  function handOver(el, onOpen) {
    if (el) el.hidden = true;
    document.documentElement.classList.remove("is-sealed");
    document.body.classList.remove("is-sealed");
    document.body.classList.add("app-ready");
    // The letter is what the guest is looking at, by definition. Set here
    // rather than left to main.js's observer, which would otherwise paint
    // the language switch in its green colours for a frame first.
    document.body.classList.add("over-letter");

    // Focus has to be moved deliberately. #env-paper was the only focusable
    // thing while sealed, so hiding it drops focus to <body>, and the next
    // Tab would jump straight into the green page below.
    var letter = document.getElementById("letter");
    if (letter) letter.focus({ preventScroll: true });

    onOpen();
  }

  return { show: show };
})();
