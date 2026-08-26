/*
 * i18n.js — the three-way language switcher. The pick is held in
 * sessionStorage, so it survives a reload but dies with the tab: every
 * fresh visit starts in the language baked into the guest's invite link,
 * which is their own. One curious tap on EN should not follow them
 * around for the next year.
 */
window.WeddingI18n = (function () {
  "use strict";

  var STORAGE_KEY = "wedding-lang";
  var SUPPORTED = ["en", "tr", "de"];

  function preferredLang(defaultLang) {
    try {
      var saved = window.sessionStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;
    } catch (err) {
      /* sessionStorage unavailable (private mode etc.) — fall through */
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
        window.sessionStorage.setItem(STORAGE_KEY, lang);
      } catch (err) {
        /* ignore */
      }
      window.WeddingRender.setLanguage(lang);
    });
  }

  document.addEventListener("DOMContentLoaded", bindSwitcher);

  return { preferredLang: preferredLang, markActive: markActive };
})();
