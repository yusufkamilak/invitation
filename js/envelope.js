/*
 * envelope.js — the sealed envelope that covers the page until the guest
 * taps it.
 *
 * It is shown by render.js *after* the bundle has been decrypted and the
 * page underneath has already been painted, so opening it reveals a
 * finished card rather than a half-rendered one. Opening is also what
 * starts the page's own entrance: WeddingMain.start() is deliberately
 * deferred until this point, otherwise every scroll reveal would fire
 * while the page was still hidden behind the envelope and the effect
 * would be spent by the time anyone saw it.
 */
window.WeddingEnvelope = (function () {
  "use strict";

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function show(bundle, onOpen) {
    var el = document.getElementById("envelope");
    var paper = document.getElementById("env-paper");
    var to = document.getElementById("env-to");
    // Not auto-focused: a programmatic focus paints the focus ring on every
    // load, which reads as a permanent border rather than a focus state. The
    // envelope is the first focusable thing on the page, so Tab reaches it
    // immediately anyway.

    if (!el || !paper) {
      // No envelope markup for some reason — never strand the guest.
      onOpen();
      return;
    }

    to.textContent = bundle.guest.name;
    document.body.classList.add("is-sealed");
    el.hidden = false;

    var opened = false;

    function open() {
      if (opened) return;
      opened = true;

      // Under reduced motion the CSS transitions are already zeroed out, so
      // waiting on them would just be dead time. Collapse to a single tick.
      var flapMs = prefersReducedMotion() ? 0 : 950;
      var fadeMs = prefersReducedMotion() ? 0 : 500;

      el.classList.add("is-opening");

      window.setTimeout(function () {
        el.classList.add("is-gone");
        window.setTimeout(function () {
          el.hidden = true;
          document.body.classList.remove("is-sealed");
          onOpen();
        }, fadeMs);
      }, flapMs);
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

  return { show: show };
})();
