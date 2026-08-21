/*
 * render.js — takes a decrypted guest bundle and paints the page.
 *
 * Everything here reads from window.__WEDDING_BUNDLE__ (set by unlock.js).
 * setLanguage() re-renders in place, so switching EN/TR/DE never re-fetches
 * or re-decrypts anything — the whole bundle was already local.
 */
window.WeddingRender = (function () {
  "use strict";

  var bundle = null;
  var currentLang = "en";

  // ---- tiny {{token}} template substitution ----
  function t(str, ctx) {
    if (typeof str !== "string") return str;
    return str.replace(/\{\{(\w+)\}\}/g, function (_, key) {
      return Object.prototype.hasOwnProperty.call(ctx, key) ? ctx[key] : "";
    });
  }

  function fmtDate(iso, lang) {
    if (!iso) return "";
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) return iso;
    var locale = { en: "en-GB", tr: "tr-TR", de: "de-DE" }[lang] || "en-GB";
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(d);
  }

  function fmtCost(amount, currency, lang) {
    var locale = { en: "en-GB", tr: "tr-TR", de: "de-DE" }[lang] || "en-GB";
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency: currency, maximumFractionDigits: 0 }).format(amount);
    } catch (err) {
      return amount + " " + currency;
    }
  }

  function nightsBetween(checkin, checkout) {
    var a = new Date(checkin + "T00:00:00");
    var b = new Date(checkout + "T00:00:00");
    var diff = Math.round((b - a) / 86400000);
    return diff > 0 ? diff : 0;
  }

  function buildCtx(lang) {
    var d = bundle.details;
    var nights = nightsBetween(d.spain.checkin, d.spain.checkout);
    return {
      name: bundle.guest.name,
      partnerA: d.couple.partnerA,
      partnerB: d.couple.partnerB,
      denmarkCity: d.denmark.city,
      denmarkDate: fmtDate(d.denmark.date, lang),
      spainCity: d.spain.city,
      checkin: fmtDate(d.spain.checkin, lang),
      checkout: fmtDate(d.spain.checkout, lang),
      nights: nights,
      cost: fmtCost(d.spain.costPerPerson, d.spain.currency, lang),
    };
  }

  function setText(el, value) {
    if (el) el.textContent = value;
  }

  function bindPass(root, ctx, c) {
    // data-bind="a.b.c" -> textContent from content[lang], template-substituted
    root.querySelectorAll("[data-bind]").forEach(function (el) {
      var path = el.getAttribute("data-bind");
      var val = path.split(".").reduce(function (o, k) { return o && o[k]; }, c);
      setText(el, t(val || "", ctx));
    });
    // data-bind-text="a.b.c" -> same, for elements whose textContent alone should update
    root.querySelectorAll("[data-bind-text]").forEach(function (el) {
      var path = el.getAttribute("data-bind-text");
      var val = path.split(".").reduce(function (o, k) { return o && o[k]; }, c);
      setText(el, t(val || "", ctx));
    });
    // data-bind-attr-placeholder="a.b.c" -> placeholder attribute
    root.querySelectorAll("[data-bind-attr-placeholder]").forEach(function (el) {
      var path = el.getAttribute("data-bind-attr-placeholder");
      var val = path.split(".").reduce(function (o, k) { return o && o[k]; }, c);
      el.setAttribute("placeholder", t(val || "", ctx));
    });
    // data-i18n="a.b.c" -> textContent from content[lang] (no templating, static UI strings)
    root.querySelectorAll("[data-i18n]").forEach(function (el) {
      var path = el.getAttribute("data-i18n");
      var val = path.split(".").reduce(function (o, k) { return o && o[k]; }, c);
      if (val) setText(el, val);
    });
  }

  function renderStory(ctx, c) {
    var grid = document.getElementById("story-grid");
    grid.innerHTML = "";
    ["denmark", "spain"].forEach(function (key) {
      var card = c.story[key];
      if (!card) return;
      var div = document.createElement("div");
      div.className = "story-card";
      var h3 = document.createElement("h3");
      h3.textContent = t(card.title, ctx);
      var p = document.createElement("p");
      p.textContent = t(card.body, ctx);
      div.appendChild(h3);
      div.appendChild(p);
      grid.appendChild(div);
    });
  }

  function renderWhere(ctx, c) {
    var d = bundle.details;
    setText(document.querySelector('[data-bind="where.name"]'), d.airbnb.name);
    setText(document.querySelector('[data-bind="where.address"]'), d.airbnb.address);

    var list = document.getElementById("where-amenities");
    list.innerHTML = "";
    (c.where.amenities || []).forEach(function (a) {
      var li = document.createElement("li");
      li.textContent = a;
      list.appendChild(li);
    });

    var listingBtn = document.getElementById("where-listing");
    listingBtn.href = d.airbnb.listingUrl;
    var mapBtn = document.getElementById("where-map");
    mapBtn.href = d.airbnb.mapUrl;
  }

  function renderWhen(ctx, c) {
    var el = document.getElementById("when-dates");
    el.innerHTML = "";
    [
      { label: c.when.arrivalLabel, value: ctx.checkin },
      { label: c.when.departureLabel, value: ctx.checkout },
    ].forEach(function (item) {
      var div = document.createElement("div");
      div.className = "when-date";
      var l = document.createElement("p");
      l.className = "when-label";
      l.textContent = item.label;
      var v = document.createElement("p");
      v.className = "when-value";
      v.textContent = item.value;
      div.appendChild(l);
      div.appendChild(v);
      el.appendChild(div);
    });
    var nightsDiv = document.createElement("div");
    nightsDiv.className = "when-date";
    var l2 = document.createElement("p");
    l2.className = "when-label";
    l2.textContent = c.when.nightsLabel;
    var v2 = document.createElement("p");
    v2.className = "when-value";
    v2.textContent = ctx.nights;
    nightsDiv.appendChild(l2);
    nightsDiv.appendChild(v2);
    el.appendChild(nightsDiv);
  }

  function renderPlan(ctx, c) {
    var ol = document.getElementById("plan-timeline");
    ol.innerHTML = "";
    (c.how.days || []).forEach(function (day) {
      var li = document.createElement("li");
      li.className = "plan-item";
      var label = document.createElement("p");
      label.className = "plan-label";
      label.textContent = t(day.label, ctx);
      var title = document.createElement("p");
      title.className = "plan-title";
      title.textContent = t(day.title, ctx);
      var body = document.createElement("p");
      body.className = "plan-body";
      body.textContent = t(day.body, ctx);
      li.appendChild(label);
      li.appendChild(title);
      li.appendChild(body);
      ol.appendChild(li);
    });
  }

  function renderNotes(ctx) {
    setText(document.getElementById("cost-amount"), ctx.cost);
    var d = bundle.details;
    var link = document.getElementById("paypal-link");
    link.href = d.paypal.link;
    var qrWrap = document.getElementById("qr-wrap");
    qrWrap.innerHTML = d.paypal.qrSvg || "";
  }

  function renderFaq(ctx, c) {
    var list = document.getElementById("faq-list");
    list.innerHTML = "";
    (c.faq.items || []).forEach(function (item, i) {
      var wrap = document.createElement("div");
      wrap.className = "faq-item";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "faq-q";
      btn.setAttribute("aria-expanded", "false");
      btn.id = "faq-q-" + i;
      var span = document.createElement("span");
      span.textContent = t(item.q, ctx);
      btn.appendChild(span);
      var answer = document.createElement("div");
      answer.className = "faq-a";
      answer.setAttribute("aria-labelledby", btn.id);
      var ap = document.createElement("p");
      ap.textContent = t(item.a, ctx);
      answer.appendChild(ap);
      wrap.appendChild(btn);
      wrap.appendChild(answer);
      list.appendChild(wrap);
    });
    if (window.WeddingMain) window.WeddingMain.bindFaq();
  }

  function applyEventVisibility() {
    var event = bundle.guest.event; // 's' | 'd' | 'b'
    var denmarkSection = document.getElementById("denmark");
    denmarkSection.hidden = !(event === "d" || event === "b");
  }

  function setLanguage(lang) {
    if (!bundle || !bundle.content[lang]) return;
    currentLang = lang;
    var c = bundle.content[lang];
    var ctx = buildCtx(lang);

    document.documentElement.lang = lang;

    // hero greeting + event-specific lead line
    var leadKey = { s: "leadSpain", d: "leadDenmark", b: "leadBoth" }[bundle.guest.event] || "leadBoth";
    setText(document.querySelector('[data-bind="hero.greeting"]'), t(c.hero.greeting, ctx));
    setText(document.querySelector('[data-bind="hero.lead"]'), t(c.hero[leadKey], ctx));

    bindPass(document.getElementById("app"), ctx, c);
    renderStory(ctx, c);
    renderWhere(ctx, c);
    renderWhen(ctx, c);
    renderPlan(ctx, c);
    renderNotes(ctx);
    renderFaq(ctx, c);

    if (window.WeddingI18n) window.WeddingI18n.markActive(lang);
  }

  function init(b) {
    bundle = b;
    applyEventVisibility();
    var startLang = (window.WeddingI18n && window.WeddingI18n.preferredLang(bundle.guest.lang)) || bundle.guest.lang || "en";
    setLanguage(startLang);

    document.getElementById("app").hidden = false;
    if (window.WeddingMain) window.WeddingMain.start(bundle);
  }

  return { init: init, setLanguage: setLanguage, getLang: function () { return currentLang; } };
})();

window.addEventListener("bundle:ready", function (e) {
  window.WeddingRender.init(e.detail);
});
