/*
 * render.js — takes a decrypted guest bundle and paints the page.
 *
 * Everything here reads from window.__WEDDING_BUNDLE__ (set by unlock.js).
 * setLanguage() re-renders in place, so switching EN/TR/DE never re-fetches
 * or re-decrypts anything — the whole bundle was already local.
 *
 * Event scoping: tools/build-invites.mjs prunes each guest's bundle to only
 * the part(s) they're invited to *before* it's ever encrypted — a Denmark-
 * only guest's decrypted bundle simply has no `content.*.place/plan/practical`
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
      denmarkDate: hasDenmark ? (d.denmark.date ? fmtDate(d.denmark.date, lang) : c.card.tbc) : "",
      spainCity: hasSpain ? d.spain.city : "",
      checkin: hasSpain ? fmtDate(d.spain.checkin, lang) : "",
      checkout: hasSpain ? fmtDate(d.spain.checkout, lang) : "",
      nights: nights != null ? nights : "",
      cost: hasSpain ? fmtCost(d.spain.costPerPerson, d.spain.currency, lang) : "",
    };
  }

  function setText(el, value) {
    if (el) el.textContent = value;
  }

  function lookup(c, path) {
    return path.split(".").reduce(function (o, k) { return o && o[k]; }, c);
  }

  // bindPass walks the whole document, not just #app: the envelope's
  // "tap to open" hint lives outside it and still needs translating.
  function bindPass(root, ctx, c) {
    // data-bind="a.b.c" -> textContent from content[lang], template-substituted
    root.querySelectorAll("[data-bind]").forEach(function (el) {
      setText(el, t(lookup(c, el.getAttribute("data-bind")) || "", ctx));
    });
    // data-bind-text="a.b.c" -> same, for elements whose textContent alone should update
    root.querySelectorAll("[data-bind-text]").forEach(function (el) {
      setText(el, t(lookup(c, el.getAttribute("data-bind-text")) || "", ctx));
    });
    // data-bind-attr-placeholder="a.b.c" -> placeholder attribute
    root.querySelectorAll("[data-bind-attr-placeholder]").forEach(function (el) {
      el.setAttribute("placeholder", t(lookup(c, el.getAttribute("data-bind-attr-placeholder")) || "", ctx));
    });
  }

  // ---- the card ----

  // "Yusuf & Toni" — the names in Playfair italic, the ampersand in the
  // script face. Built here rather than in the HTML so it stays driven by
  // details.json.
  function renderNames(ctx) {
    var el = document.getElementById("card-names");
    el.innerHTML = "";
    var a = document.createElement("span");
    a.textContent = ctx.partnerA;
    var amp = document.createElement("span");
    amp.className = "amp";
    amp.textContent = "&";
    var b = document.createElement("span");
    b.textContent = ctx.partnerB;
    el.appendChild(a);
    el.appendChild(amp);
    el.appendChild(b);
  }

  // The at-a-glance block under the greeting: one column per place the
  // guest is actually invited to, so a Denmark-only guest sees one column
  // and a both-parts guest sees two.
  function renderCardMeta(ctx, c) {
    var wrap = document.getElementById("card-meta");
    var d = bundle.details;
    wrap.innerHTML = "";

    var places = [];
    if (d.denmark) {
      places.push({
        place: d.denmark.city,
        rows: [{ label: c.card.dateLabel, value: ctx.denmarkDate }],
      });
    }
    if (d.spain) {
      places.push({
        place: d.spain.city,
        rows: [
          { label: c.card.arriveLabel, value: ctx.checkin },
          { label: c.card.departLabel, value: ctx.checkout },
        ],
      });
    }

    places.forEach(function (p, i) {
      var item = document.createElement("div");
      item.className = "card-meta-item";
      item.style.setProperty("--i", i);
      var head = document.createElement("p");
      head.className = "meta-place";
      head.textContent = p.place;
      item.appendChild(head);
      p.rows.forEach(function (row) {
        var line = document.createElement("p");
        line.className = "meta-row";
        var l = document.createElement("span");
        l.className = "meta-label";
        l.textContent = row.label;
        var v = document.createElement("span");
        v.className = "meta-value";
        v.textContent = row.value;
        line.appendChild(l);
        line.appendChild(v);
        item.appendChild(line);
      });
      wrap.appendChild(item);
    });
  }

  // ---- sections ----

  function renderTimeline(ol, steps, ctx) {
    if (!ol) return;
    ol.innerHTML = "";
    (steps || []).forEach(function (step, i) {
      var li = document.createElement("li");
      li.className = "timeline-item";
      li.style.setProperty("--i", i);
      var label = document.createElement("p");
      label.className = "timeline-label";
      label.textContent = t(step.label, ctx);
      var title = document.createElement("p");
      title.className = "timeline-title";
      title.textContent = t(step.title, ctx);
      var body = document.createElement("p");
      body.className = "timeline-body";
      body.textContent = t(step.body, ctx);
      li.appendChild(label);
      li.appendChild(title);
      li.appendChild(body);
      ol.appendChild(li);
    });
  }

  function renderDenmark(ctx, c) {
    if (!c.denmark) return;
    renderTimeline(document.getElementById("denmark-timeline"), c.denmark.steps, ctx);
  }

  function renderPlace(ctx, c) {
    if (!c.place) return;
    var d = bundle.details;
    setText(document.getElementById("place-name"), d.airbnb.name || c.place.nameTBD);
    setText(document.getElementById("place-address"), d.airbnb.address || c.place.addressTBD);

    var list = document.getElementById("place-amenities");
    list.innerHTML = "";
    (c.place.amenities || []).forEach(function (a, i) {
      var li = document.createElement("li");
      li.style.setProperty("--i", i);
      li.textContent = a;
      list.appendChild(li);
    });

    document.getElementById("place-listing").href = d.airbnb.listingUrl;
    document.getElementById("place-map").href = d.airbnb.mapUrl;
  }

  function renderPlan(ctx, c) {
    if (!c.plan) return;
    renderTimeline(document.getElementById("plan-timeline"), c.plan.days, ctx);
  }

  function renderPractical(ctx, c) {
    if (!c.practical) return;
    var d = bundle.details;
    setText(document.getElementById("cost-amount"), ctx.cost);
    if (d.paypal) document.getElementById("paypal-link").href = d.paypal.link;
    document.getElementById("qr-wrap").innerHTML = (d.paypal && d.paypal.qrSvg) || "";

    var list = document.getElementById("bring-list");
    list.innerHTML = "";
    (c.practical.bringList || []).forEach(function (item, i) {
      var li = document.createElement("li");
      li.style.setProperty("--i", i);
      li.textContent = t(item, ctx);
      list.appendChild(li);
    });
  }

  function renderFaq(ctx, c) {
    var list = document.getElementById("faq-list");
    list.innerHTML = "";
    var items = [].concat(c.faq.spain || [], c.faq.denmark || [], c.faq.shared || []);
    items.forEach(function (item, i) {
      var wrap = document.createElement("div");
      wrap.className = "faq-item";
      wrap.style.setProperty("--i", i);
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
    setPhoto(document.getElementById("place-photo"), photos.place);
    setPhoto(document.getElementById("denmark-photo"), photos.denmark);
  }

  // Removes (not just hides) every section whose content didn't survive the
  // build-time prune for this guest's event. Runs once, before the first
  // render — content structure doesn't change on a language switch, only
  // its translated text does.
  function applyEventScope() {
    var c = bundle.content[bundle.guest.lang] || bundle.content.en;
    var sectionForKey = {
      denmark: "denmark",
      place: "place",
      plan: "plan",
      practical: "practical",
    };
    Object.keys(sectionForKey).forEach(function (contentKey) {
      var section = document.getElementById(sectionForKey[contentKey]);
      if (!section) return;
      if (c[contentKey]) section.hidden = false;
      else section.remove();
    });

    // The scroll cue points at whatever section actually follows the card.
    var next = document.querySelector("#card ~ .section, main .section:not(#card)");
    var cue = document.getElementById("scroll-cue");
    if (next && cue) cue.href = "#" + next.id;
    else if (cue) cue.hidden = true;
  }

  function setLanguage(lang) {
    if (!bundle || !bundle.content[lang]) return;
    currentLang = lang;
    var c = bundle.content[lang];
    var ctx = buildCtx(lang);

    document.documentElement.lang = lang;

    // bindPass runs first: it resolves data-bind="card.lead" against c.card
    // directly, which has no plain "lead" key (only the leadSpain /
    // leadDenmark / leadBoth variants) — so it clears it to "". The
    // event-specific override below MUST run after bindPass, the same order
    // every other event-scoped renderer already follows, or it would be
    // immediately blanked out again.
    bindPass(document.body, ctx, c);

    var leadKey = { s: "leadSpain", d: "leadDenmark", b: "leadBoth" }[bundle.guest.event] || "leadBoth";
    setText(document.querySelector('[data-bind="card.lead"]'), t(c.card[leadKey], ctx));

    renderNames(ctx);
    renderCardMeta(ctx, c);
    renderDenmark(ctx, c);
    renderPlace(ctx, c);
    renderPlan(ctx, c);
    renderPractical(ctx, c);
    renderFaq(ctx, c);

    if (window.WeddingI18n) window.WeddingI18n.markActive(lang);
  }

  function init(b) {
    bundle = b;
    applyEventScope();
    applyPhotos();
    var startLang = (window.WeddingI18n && window.WeddingI18n.preferredLang(bundle.guest.lang)) || bundle.guest.lang || "en";
    setLanguage(startLang);

    // The page is painted but sealed behind the envelope. Nothing animates
    // and nothing scrolls until the guest opens it.
    var app = document.getElementById("app");
    app.hidden = false;
    app.setAttribute("aria-hidden", "true");

    window.WeddingEnvelope.show(bundle, function () {
      app.removeAttribute("aria-hidden");
      if (window.WeddingMain) window.WeddingMain.start(bundle);
    });
  }

  return { init: init, setLanguage: setLanguage, getLang: function () { return currentLang; } };
})();

window.addEventListener("bundle:ready", function (e) {
  window.WeddingRender.init(e.detail);
});
