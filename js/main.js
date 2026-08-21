/*
 * main.js — scroll reveals, the countdown, the FAQ accordion, and the two
 * forms (RSVP + Questions). Everything here is wired up once by
 * WeddingMain.start(bundle), called from render.js after the first paint.
 */
window.WeddingMain = (function () {
  "use strict";

  var bundle = null;

  // ---------------------------------------------------------------
  // Scroll reveal — sections fade/rise in; repeated list items (story
  // cards, plan steps, FAQ rows, ...) stagger via CSS nth-child delays
  // once their parent section picks up .is-visible, so no per-item JS
  // bookkeeping is needed here.
  // ---------------------------------------------------------------
  function initReveal() {
    var sections = document.querySelectorAll(".section:not(.hero)");
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
      { threshold: 0.12 }
    );
    sections.forEach(function (s) { io.observe(s); });
  }

  // ---------------------------------------------------------------
  // Hero entrance — plays once, right after the page unlocks
  // ---------------------------------------------------------------
  function initHeroEntrance() {
    requestAnimationFrame(function () {
      document.getElementById("hero").classList.add("is-ready");
    });
  }

  // ---------------------------------------------------------------
  // Nav — subtle stronger border/backdrop once the page has scrolled
  // ---------------------------------------------------------------
  function initNavScroll() {
    var nav = document.getElementById("site-nav");
    function tick() {
      nav.classList.toggle("is-scrolled", window.scrollY > 40);
    }
    tick();
    window.addEventListener("scroll", tick, { passive: true });
  }

  // ---------------------------------------------------------------
  // Countdown — to the Denmark date for a Denmark-only guest, to Spain
  // arrival otherwise. Hidden entirely when there's no date to count to
  // yet (e.g. Denmark's date is still TBC), and counts up from 0 the
  // first time it scrolls into view rather than snapping to the value.
  // ---------------------------------------------------------------
  var countdownTimer = null;
  function initCountdown() {
    var d = bundle.details;
    var iso = d.spain ? d.spain.checkin : (d.denmark && d.denmark.date);
    var el = document.getElementById("countdown");
    if (!iso) {
      el.hidden = true;
      return;
    }
    var target = new Date(iso + "T00:00:00");
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
    initHeroEntrance();
    initNavScroll();
    initReveal();
    initCountdown();
    bindFaq();
    bindRsvpForm();
    bindQuestionForm();
  }

  return { start: start, bindFaq: bindFaq };
})();
