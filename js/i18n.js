/*
 * i18n.js — the three-way language switcher. Persists the guest's choice
 * to localStorage so a reload keeps their pick; falls back to the
 * language baked into their invite link.
 */
window.WeddingI18n = (function () {
  "use strict";

  var STORAGE_KEY = "wedding-lang";
  var SUPPORTED = ["en", "tr", "de"];

  function preferredLang(defaultLang) {
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;
    } catch (err) {
      /* localStorage unavailable (private mode etc.) — fall through */
    }
    return SUPPORTED.indexOf(defaultLang) !== -1 ? defaultLang : "en";
  }

  function markActive(lang) {
    document.querySelectorAll("#lang-switch button").forEach(function (btn) {
      var isActive = btn.getAttribute("data-lang") === lang;
      btn.setAttribute("aria-current", isActive ? "true" : "false");
    });
  }

  function bindSwitcher() {
    var group = document.getElementById("lang-switch");
    if (!group) return;
    group.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-lang]");
      if (!btn) return;
      var lang = btn.getAttribute("data-lang");
      try {
        window.localStorage.setItem(STORAGE_KEY, lang);
      } catch (err) {
        /* ignore */
      }
      window.WeddingRender.setLanguage(lang);
    });
  }

  document.addEventListener("DOMContentLoaded", bindSwitcher);

  return { preferredLang: preferredLang, markActive: markActive };
})();
