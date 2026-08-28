/*
 * main.js — scroll reveals, the countdown, the FAQ accordion, and the two
 * forms (RSVP + Questions).
 *
 * start(bundle) is called by js/envelope.js the moment the guest opens the
 * envelope, not by render.js when the page is first painted. Everything in
 * here is entrance behaviour, and firing it while the page was still hidden
 * behind the envelope would spend it on an audience of nobody.
 */
window.WeddingMain = (function () {
  "use strict";

  var bundle = null;

  // ---------------------------------------------------------------
  // Scroll reveal — sections fade/rise in; repeated list items (plan
  // steps, FAQ rows, ...) stagger off the --i index the renderers set on
  // each one, once their parent section picks up .is-visible.
  // ---------------------------------------------------------------
  function initReveal() {
    var sections = document.querySelectorAll(".section:not(.card)");
    if (!("IntersectionObserver" in window)) {
      sections.forEach(function (s) { s.classList.add("is-visible"); });
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      // threshold is a fraction of the *target*, not of the viewport, so a
      // section taller than about eight screens can never reach 0.12 and
      // would sit at opacity 0 for ever. The Copenhagen section is now
      // easily that tall on a phone. Trip on the top edge crossing into
      // the lower 88% of the viewport instead, which does not care how
      // tall the section is.
      { threshold: 0, rootMargin: "0px 0px -12% 0px" }
    );
    sections.forEach(function (s) { io.observe(s); });
  }

  // ---------------------------------------------------------------
  // Card entrance — plays once, when the card is actually on screen.
  //
  // It used to fire on a bare rAF, because the card was the first thing
  // the envelope opened onto. The letter holds that position now and the
  // card sits a full screen below it, so an immediate rAF would spend the
  // whole entrance (the inner fade, the rule drawing itself out, the meta
  // stagger) before anyone had scrolled far enough to see it.
  // ---------------------------------------------------------------
  function initCardEntrance() {
    var card = document.getElementById("card");
    if (!card) return;
    if (!("IntersectionObserver" in window)) {
      card.classList.add("is-ready");
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-ready");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    io.observe(card);
  }

  // ---------------------------------------------------------------
  // The language switch is fixed over whatever is behind it, and it is
  // hidden entirely while that is the letter: a floating control over the
  // paper breaks the only illusion the first screen has. This tracks which
  // surface it is over; the hiding itself is the .over-letter rule in
  // css/style.css.
  // ---------------------------------------------------------------
  function initSurfaceWatch() {
    var letter = document.getElementById("letter");
    if (!letter) return;
    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          // isIntersecting alone is not enough: it goes true on a zero-height
          // touch, so scrolling exactly one viewport leaves the letter's
          // bottom edge grazing the band and the switch stuck in its cream
          // colours over the green page.
          var over = entry.isIntersecting && entry.intersectionRect.height > 8;
          document.body.classList.toggle("over-letter", over);
        });
      },
      // The switch sits in the top corner, so what matters is whether the
      // letter still reaches the top of the screen, not whether any part of
      // it is visible at all. On the way down that means it fades in as the
      // snap in js/paging.js carries the guest onto the card.
      //
      // The -2px at the top is what makes that snap work. It lands the guest
      // at exactly one viewport, where the letter's bottom edge would sit
      // precisely on the band's top edge. An observer notifies on threshold
      // crossings, and a ratio falling from 0.05 to a grazing 0 crosses
      // nothing, so no entry is delivered at all and the guard below never
      // gets to run. Pulling the band off the edge by two pixels turns that
      // graze into a clean miss, which does notify.
      { rootMargin: "-2px 0px -70% 0px", threshold: [0, 0.05, 0.25, 0.5, 0.9] }
    );
    io.observe(letter);
  }

  // ---------------------------------------------------------------
  // The house carousel — the dots under it, and nothing else.
  //
  // The scrolling, the snapping and the momentum are all CSS; see the
  // carousel block in css/style.css. This is only the read-out: which
  // photograph you are on, and a way to jump to another one. Without it
  // the peek at the edge is the sole affordance, which is enough on a
  // phone and easy to miss with a trackpad.
  //
  // The observer's root is the strip itself, so "which slide is showing"
  // is a question about the strip and not about the page, and the answer
  // stays right through a resize, a language switch or a rotate without
  // anything having to be recomputed.
  // ---------------------------------------------------------------
  function initCarousel() {
    var track = document.getElementById("place-photos");
    var dots = document.getElementById("place-dots");
    if (!track || !dots) return;
    var slides = [].slice.call(track.children);
    // One photograph is not a carousel, and a row of one dot is furniture.
    if (slides.length < 2) return;

    // The read-out is rebuilt, not added to. Nothing should call this
    // twice: js/envelope.js hands over once, and start() runs once off the
    // back of it. But appending was the one way this could go wrong
    // silently, and it did. A doubled hand-off left eight dots under four
    // photographs, two of them marked current.
    dots.innerHTML = "";

    var buttons = slides.map(function (slide, i) {
      var b = document.createElement("button");
      b.type = "button";
      // Out of the tab order, which is what lets the container carry
      // aria-hidden honestly: a focusable child inside an aria-hidden
      // subtree is a trap. The strip itself is the labelled, keyboard
      // scrollable control; these are a pointer convenience on top of it.
      b.tabIndex = -1;
      b.style.setProperty("--i", i);
      b.onclick = function () {
        slide.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          block: "nearest",
          inline: "start",
        });
      };
      dots.appendChild(b);
      return b;
    });

    function mark(i) {
      buttons.forEach(function (b, n) {
        if (n === i) b.setAttribute("aria-current", "true");
        else b.removeAttribute("aria-current");
      });
    }
    mark(0);
    dots.hidden = false;

    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) mark(slides.indexOf(entry.target));
      });
    }, { root: track, threshold: 0.6 });
    slides.forEach(function (s) { io.observe(s); });
  }

  // ---------------------------------------------------------------
  // Countdown — to the soonest date this guest actually has. Hidden
  // entirely when they have none yet (Denmark's date is still TBC), and
  // counts up from 0 the first time it scrolls into view rather than
  // snapping to the value.
  //
  // It used to take Spain's arrival whenever Spain was in the bundle,
  // which is only right while Denmark has no date. Fill that date in and a
  // both-parts guest would have been counting to the second of their two
  // dates while the first one came and went.
  //
  // Which part that is comes from WeddingRender.nextPart(), not from a
  // second copy of the rule here: render.js moves this element into that
  // part's own column, and a number sitting in one column while counting
  // to the other is the exact confusion the move was meant to end.
  // ---------------------------------------------------------------
  var countdownTimer = null;
  function initCountdown() {
    var el = document.getElementById("countdown");
    var next = window.WeddingRender && window.WeddingRender.nextPart();
    if (!next) {
      el.hidden = true;
      return;
    }

    var target = new Date(next.iso + "T00:00:00");
    var numEl = document.getElementById("cd-days");

    function daysLeft() {
      var diff = Math.ceil((target - new Date()) / 86400000);
      return diff > 0 ? diff : 0;
    }

    function countUpTo(value) {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !value) {
        numEl.textContent = value;
        return;
      }
      var start = null;
      var duration = 900;
      function step(ts) {
        if (start === null) start = ts;
        var progress = Math.min((ts - start) / duration, 1);
        numEl.textContent = Math.round(progress * value);
        if (progress < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    el.hidden = false;
    var animated = false;
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !animated) {
            animated = true;
            countUpTo(daysLeft());
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.6 });
      io.observe(el);
    } else {
      numEl.textContent = daysLeft();
    }

    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(function () { numEl.textContent = daysLeft(); }, 60 * 60 * 1000);
  }

  // ---------------------------------------------------------------
  // FAQ accordion — re-bound each time render.js rebuilds the list
  // (on init and on every language switch)
  // ---------------------------------------------------------------
  function bindFaq() {
    document.querySelectorAll(".faq-item").forEach(function (item) {
      var btn = item.querySelector(".faq-q");
      var answer = item.querySelector(".faq-a");
      answer.style.maxHeight = "0px";
      btn.onclick = function () {
        var isOpen = item.classList.toggle("is-open");
        btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
        answer.style.maxHeight = isOpen ? answer.scrollHeight + "px" : "0px";
      };
    });
  }

  // ---------------------------------------------------------------
  // The plan's idea drawer — the FAQ's mechanics on one static button.
  // Re-run by renderPlanIdeas after every rebuild: the open state lives
  // on the wrapper and survives a language switch, so all this has to do
  // then is re-measure the new copy's height.
  // ---------------------------------------------------------------
  function bindIdeas() {
    var wrap = document.getElementById("plan-ideas");
    if (!wrap || wrap.hidden) return;
    var btn = document.getElementById("ideas-toggle");
    var body = document.getElementById("ideas-body");
    body.style.maxHeight = wrap.classList.contains("is-open")
      ? body.scrollHeight + "px"
      : "0px";
    btn.onclick = function () {
      var isOpen = wrap.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
      body.style.maxHeight = isOpen ? body.scrollHeight + "px" : "0px";
    };
  }

  // ---------------------------------------------------------------
  // Forms
  // ---------------------------------------------------------------
  function setStatus(el, key, textFallback) {
    el.hidden = false;
    el.dataset.state = key;
    el.textContent = textFallback;
  }

  async function send(payload) {
    var url = window.WEDDING_CONFIG && window.WEDDING_CONFIG.APPS_SCRIPT_URL;
    if (!url || url.indexOf("REPLACE_WITH") === 0) {
      throw new Error("RSVP endpoint not configured yet");
    }
    // text/plain keeps this a CORS "simple request" — Apps Script cannot
    // answer a preflight OPTIONS request, so a JSON content-type here
    // would fail silently. See README for the full explanation.
    await fetch(url, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    // Apps Script's CORS response headers are not something the client can
    // reliably parse cross-origin, so we treat "fetch did not throw" as
    // success — a real network failure (offline, DNS, etc.) still throws
    // and is caught by the caller. The row lands in the Sheet either way.
  }

  function bindRsvpForm() {
    var form = document.getElementById("rsvp-form");
    var status = document.getElementById("rsvp-status");
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(form);

      if (fd.get("website")) return; // honeypot tripped — silently drop

      var attending = fd.get("attending");
      if (!attending) return;

      // Look up copy for whatever language is active *now* — the guest may
      // have switched since the page first loaded.
      var lang = window.WeddingRender.getLang();
      var c = bundle.content[lang];

      var submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      try {
        await send({
          type: "rsvp",
          auth: bundle.auth,
          name: bundle.guest.name,
          lang: lang,
          event: bundle.guest.event,
          attending: attending,
          dietary: fd.get("dietary") || "",
          activities: fd.get("activities") || "",
          message: fd.get("message") || "",
        });
        setStatus(status, "ok", c.rsvp.successBody);
        form.reset();
      } catch (err) {
        setStatus(status, "err", c.rsvp.errorBody);
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  function bindQuestionForm() {
    var form = document.getElementById("question-form");
    var status = document.getElementById("question-status");
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(form);

      if (fd.get("website")) return; // honeypot

      var message = (fd.get("message") || "").trim();
      if (!message) return;

      var lang = window.WeddingRender.getLang();
      var c = bundle.content[lang];

      var submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      try {
        await send({
          type: "question",
          auth: bundle.auth,
          name: bundle.guest.name,
          lang: lang,
          event: bundle.guest.event,
          message: message,
        });
        setStatus(status, "ok", c.questions.successBody);
        form.reset();
      } catch (err) {
        setStatus(status, "err", c.questions.errorBody);
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  function start(b) {
    bundle = b;
    initCardEntrance();
    initSurfaceWatch();
    initReveal();
    initCarousel();
    initCountdown();
    bindFaq();
    bindIdeas();
    bindRsvpForm();
    bindQuestionForm();
  }

  return { start: start, bindFaq: bindFaq, bindIdeas: bindIdeas };
})();
