/*
 * render.js — takes a decrypted guest bundle and paints the page.
 *
 * Everything here reads from window.__WEDDING_BUNDLE__ (set by unlock.js).
 * setLanguage() re-renders in place, so switching EN/TR/DE never re-fetches
 * or re-decrypts anything — the whole bundle was already local.
 *
 * Event scoping: tools/build-invites.mjs prunes each guest's bundle to only
 * the part(s) they're invited to *before* it's ever encrypted — a Denmark-
 * only guest's decrypted bundle simply has no `content.*.where/when/how/...`
 * keys and no `details.spain/airbnb/paypal`. applyEventScope() below trusts
 * that pruning completely: it removes a section from the DOM whenever the
 * content it would need isn't present, rather than keeping a second,
 * separately-maintained list of "which sections belong to which event". One
 * source of truth, so the two can't drift apart.
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
    var c = bundle.content[lang];
    var hasSpain = !!d.spain;
    var hasDenmark = !!d.denmark;
    var nights = hasSpain ? nightsBetween(d.spain.checkin, d.spain.checkout) : null;
    return {
      name: bundle.guest.name,
      partnerA: d.couple.partnerA,
      partnerB: d.couple.partnerB,
      denmarkCity: hasDenmark ? d.denmark.city : "",
      denmarkDate: hasDenmark ? (d.denmark.date ? fmtDate(d.denmark.date, lang) : c.denmark.tbcLabel) : "",
      spainCity: hasSpain ? d.spain.city : "",
      checkin: hasSpain ? fmtDate(d.spain.checkin, lang) : "",
      checkout: hasSpain ? fmtDate(d.spain.checkout, lang) : "",
      nights: nights != null ? nights : "",
      cost: hasSpain ? fmtCost(d.spain.costPerPerson, d.spain.currency, lang) : "",
      monogram: (d.couple.partnerA || "").charAt(0) + " & " + (d.couple.partnerB || "").charAt(0),
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

  function renderIntro(ctx, c) {
    var kicker = document.querySelector('[data-bind="intro.title"]');
    var titleKey = bundle.guest.event === "b" ? "titleBoth" : bundle.guest.event === "s" ? "titleSpain" : "titleDenmark";
    setText(kicker, t(c.intro[titleKey], ctx));

    var grid = document.getElementById("story-grid");
    grid.innerHTML = "";
    ["denmark", "spain"].forEach(function (key) {
      var card = c.intro[key];
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
    if (!c.where) return;
    var d = bundle.details;
    setText(document.querySelector('[data-bind="where.name"]'), d.airbnb.name || c.where.nameTBD);
    setText(document.querySelector('[data-bind="where.address"]'), d.airbnb.address || c.where.addressTBD);

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
    if (!c.when) return;
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

  function renderTimeline(ol, days, ctx) {
    ol.innerHTML = "";
    (days || []).forEach(function (day) {
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

  function renderPlan(ctx, c) {
    if (!c.how) return;
    renderTimeline(document.getElementById("plan-timeline"), c.how.days, ctx);
  }

  function renderDenmarkDay(ctx, c) {
    if (!c.denmarkDay) return;
    renderTimeline(document.getElementById("denmark-day-timeline"), c.denmarkDay.steps, ctx);
  }

  function renderAround(ctx, c) {
    if (!c.around) return;
    var grid = document.getElementById("around-grid");
    grid.innerHTML = "";
    (c.around.items || []).forEach(function (item) {
      var div = document.createElement("div");
      div.className = "around-card";
      var h3 = document.createElement("h3");
      h3.textContent = t(item.title, ctx);
      var p = document.createElement("p");
      p.textContent = t(item.body, ctx);
      div.appendChild(h3);
      div.appendChild(p);
      grid.appendChild(div);
    });
  }

  function renderBring(ctx, c) {
    if (!c.bring) return;
    var list = document.getElementById("bring-list");
    list.innerHTML = "";
    (c.bring.list || []).forEach(function (item) {
      var li = document.createElement("li");
      li.textContent = t(item, ctx);
      list.appendChild(li);
    });
  }

  function renderNotes(ctx, c) {
    if (!c.notes) return;
    var d = bundle.details;
    setText(document.getElementById("cost-amount"), ctx.cost);
    var link = document.getElementById("paypal-link");
    if (d.paypal) link.href = d.paypal.link;
    var qrWrap = document.getElementById("qr-wrap");
    qrWrap.innerHTML = (d.paypal && d.paypal.qrSvg) || "";
  }

  function renderFaq(ctx, c) {
    var list = document.getElementById("faq-list");
    list.innerHTML = "";
    var items = [].concat(c.faq.spain || [], c.faq.denmark || [], c.faq.shared || []);
    items.forEach(function (item, i) {
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

  function setPhoto(el, url) {
    if (!el) return;
    if (url) {
      el.style.backgroundImage = "url('" + url + "')";
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }

  function applyPhotos() {
    var photos = (bundle.details && bundle.details.photos) || {};
    setPhoto(document.getElementById("hero-photo"), photos.hero);
    setPhoto(document.getElementById("where-photo"), photos.house);
    setPhoto(document.getElementById("denmark-photo"), photos.denmark);
    setPhoto(document.getElementById("around-photo"), photos.spain);
    // Toggled on the section itself (rather than relying on :has() support)
    // so the scrim + on-photo text colors only apply once there's actually
    // a photo behind them.
    document.getElementById("hero").classList.toggle("has-photo", !!photos.hero);
  }

  // Removes (not just hides) every section/nav-item whose content didn't
  // survive the build-time prune for this guest's event. Runs once, before
  // the first render — content structure doesn't change on a language
  // switch, only its translated text does.
  function applyEventScope() {
    var c = bundle.content[bundle.guest.lang] || bundle.content.en;
    var sectionForKey = {
      denmark: "denmark",
      denmarkDay: "denmark-day",
      denmarkTravel: "denmark-travel",
      where: "where",
      when: "when",
      how: "how",
      around: "around",
      bring: "bring",
      notes: "notes",
    };
    Object.keys(sectionForKey).forEach(function (contentKey) {
      var present = !!c[contentKey];
      var sectionId = sectionForKey[contentKey];
      var navId = "nav-li-" + contentKey;
      var section = document.getElementById(sectionId);
      var navLi = document.getElementById(navId);
      if (!present) {
        if (section) section.remove();
        if (navLi) navLi.remove();
      } else if (section) {
        section.hidden = false;
      }
    });
  }

  function setLanguage(lang) {
    if (!bundle || !bundle.content[lang]) return;
    currentLang = lang;
    var c = bundle.content[lang];
    var ctx = buildCtx(lang);

    document.documentElement.lang = lang;
    setText(document.getElementById("nav-monogram"), ctx.monogram);

    // bindPass runs first: it resolves data-bind="hero.eyebrow"/"hero.lead"
    // against c.hero directly, which has no plain "eyebrow"/"lead" key
    // (only the eyebrowSpain/eyebrowDenmark/eyebrowBoth and
    // leadSpain/leadDenmark/leadBoth variants) — so it clears them to "".
    // The event-specific overrides below MUST run after bindPass, the same
    // order every other event-scoped renderer (renderIntro, etc.) already
    // follows, or they'd be immediately blanked out again.
    bindPass(document.getElementById("app"), ctx, c);

    var eyebrowKey = { s: "eyebrowSpain", d: "eyebrowDenmark", b: "eyebrowBoth" }[bundle.guest.event] || "eyebrowBoth";
    var leadKey = { s: "leadSpain", d: "leadDenmark", b: "leadBoth" }[bundle.guest.event] || "leadBoth";
    setText(document.querySelector('[data-bind="hero.eyebrow"]'), t(c.hero[eyebrowKey], ctx));
    setText(document.querySelector('[data-bind="hero.lead"]'), t(c.hero[leadKey], ctx));

    renderIntro(ctx, c);
    renderWhere(ctx, c);
    renderWhen(ctx, c);
    renderPlan(ctx, c);
    renderDenmarkDay(ctx, c);
    renderAround(ctx, c);
    renderBring(ctx, c);
    renderNotes(ctx, c);
    renderFaq(ctx, c);

    if (window.WeddingI18n) window.WeddingI18n.markActive(lang);
  }

  function init(b) {
    bundle = b;
    applyEventScope();
    applyPhotos();
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
