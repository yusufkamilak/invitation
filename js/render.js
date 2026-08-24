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

  // ---- the letter ----

  // The letter the envelope opens into. Its markup is built here rather
  // than bound with data-bind, and that is not a style choice: bindPass()
  // walks the whole document and sets textContent, which would flatten the
  // per-line spans below and kill the stagger running through them. So
  // the letter carries no data-bind attributes at all, and this runs from
  // setLanguage() alongside the other renderers.
  //
  // Lines are authored as arrays in content/*.json rather than measured and
  // split at runtime. A runtime splitter would have to re-run on font load,
  // on resize and on every language switch, and it would rag the lines by
  // measurement; for a script heading the ragging is an authorial choice.
  //
  // One span per line. It used to be two, an inner one for the wipe that
  // drew the line on to clip and an outer one for the pen tip to ride
  // outside that clip. Both are gone, and a line only has to fade now.
  function writtenLine(text, index) {
    var line = document.createElement("span");
    line.className = "ln";
    line.style.setProperty("--i", index);
    line.textContent = text;
    return line;
  }

  function renderLetter(ctx, c) {
    if (!c.letter) return;

    var title = document.getElementById("letter-title");
    title.innerHTML = "";
    (c.letter.title || []).forEach(function (line, i) {
      title.appendChild(writtenLine(t(line, ctx), i));
    });

    var body = document.getElementById("letter-body");
    body.innerHTML = "";
    (c.letter.body || []).forEach(function (para, i) {
      var p = document.createElement("p");
      // Same --i stagger idiom the timeline and FAQ lists already use.
      p.style.setProperty("--i", i);
      p.textContent = t(para, ctx);
      body.appendChild(p);
    });

    setText(document.getElementById("letter-signoff"), t(c.letter.signoff || "", ctx));

    // Built from details.json like renderNames, not from a content key:
    // the couple's names are a fact, not copy, and should not need
    // translating three times.
    var names = document.getElementById("letter-names");
    names.innerHTML = "";
    names.appendChild(writtenLine(ctx.partnerA + " & " + ctx.partnerB, 0));

    setText(document.getElementById("letter-hint"), t(c.letter.scrollHint || "", ctx));

    // A language switch part-way through the sequence rebuilds every line
    // from scratch, which would otherwise restart the writing from nothing.
    // If the guest has already watched it, put the new lines straight into
    // their finished state.
    if (window.WeddingLetter && window.WeddingLetter.isDone()) {
      window.WeddingLetter.finish();
    }
  }

  // ---- the card ----

  // "Yusuf & Toni", set in Playfair italic. Built here rather than in the
  // HTML so it stays driven by details.json.
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
      // t() hands back a non-string unchanged, so a step with no label
      // would render the literal text "undefined" rather than nothing.
      var label = document.createElement("p");
      label.className = "timeline-label";
      label.textContent = step.label ? t(step.label, ctx) : "";
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

  // ---- Copenhagen: a composed section rather than a list ----

  // The design interleaves two photographs and three drawn connectors
  // between five named steps, alternating left and right down the page.
  // That arrangement lives here rather than in content/*.json, because it
  // is layout and would otherwise have to be kept identical in three
  // languages by hand.
  //
  // It degrades on its own. An entry whose step or photo is missing from
  // this guest's bundle is skipped, and any step the table doesn't place
  // is appended alternating, so adding a sixth step to the copy makes the
  // page longer rather than making it wrong.
  var CPH_FLOW = [
    { kind: "step",  step: 0, side: "left" },
    { kind: "link",  shape: "a" },
    { kind: "photo", photo: "denmarkCar", side: "left", id: "denmark-photo" },
    { kind: "step",  step: 1, side: "right" },
    { kind: "link",  shape: "b" },
    { kind: "step",  step: 2, side: "right" },
    { kind: "link",  shape: "c" },
    { kind: "step",  step: 3, side: "left" },
    { kind: "photo", photo: "denmarkTable", side: "right", id: "denmark-photo-2" },
    { kind: "step",  step: 4, side: "left" },
  ];

  // The connectors. Each is one unbroken pen stroke with a loop in it, and
  // no two repeat, which is what makes them read as drawn rather than
  // placed. Two variants apiece: a viewBox cannot be changed from a
  // stylesheet, so the wide loop the zig-zag uses and the tall one the
  // single column needs have to be separate elements, shown by the
  // breakpoint.
  var CPH_PATHS = {
    // Falls out of the first step, ties a knot, runs away to the right.
    a: {
      wide: { box: "0 0 120 64", d: "M6 4C20 16 6 27 14 39c6 9 19 10 21 2 1-6-7-8-8-1-1 9 11 18 25 17 22-2 40-10 62-5" },
      tall: { box: "0 0 44 96", d: "M20 3c4 14-2 24-9 31-7 7-4 18 5 17 9-1 10-12 2-13-9-1-15 9-11 20 4 12 17 16 15 26-1 6-6 9-10 12" },
    },
    // The short one: a loop at the top, then a lazy S down.
    b: {
      wide: { box: "0 0 44 96", d: "M22 4c9 2 12 11 5 14-8 3-11-6-4-9 8-3 13 6 10 17-4 14-20 19-18 34 2 15 15 21 11 32" },
      tall: { box: "0 0 44 96", d: "M22 4c9 2 12 11 5 14-8 3-11-6-4-9 8-3 13 6 10 17-4 14-20 19-18 34 2 15 15 21 11 32" },
    },
    // The long ribbon: rises left to right, opens into a wide loop, S back.
    c: {
      wide: { box: "0 0 130 60", d: "M4 52c14-8 22-22 40-26 16-4 26 8 40 8 14 0 28-10 32-20 3-8-6-12-12-6-7 7 0 18 12 22 8 3 12 8 10 14" },
      tall: { box: "0 0 44 96", d: "M20 3c-6 12 4 20 12 18 8-2 9-13 1-14-8-1-12 9-6 17 8 11 4 24-8 32-12 8-12 20-2 27" },
    },
  };

  function cphStep(step, side, i, ctx) {
    var li = document.createElement("li");
    li.className = "cph-step side-" + side;
    li.style.setProperty("--i", i);
    var h = document.createElement("h3");
    h.className = "cph-title";
    h.textContent = t(step.title, ctx);
    var body = document.createElement("p");
    body.className = "cph-body";
    body.textContent = t(step.body, ctx);
    li.appendChild(h);
    li.appendChild(body);
    return li;
  }

  function cphPhoto(url, side, id, i) {
    var li = document.createElement("li");
    li.className = "cph-photo side-" + side;
    li.id = id;
    li.setAttribute("aria-hidden", "true");
    li.style.setProperty("--i", i);
    li.style.backgroundImage = "url('" + url + "')";
    return li;
  }

  function svgLink(cls, spec) {
    return (
      '<svg class="' + cls + '" viewBox="' + spec.box + '" fill="none" ' +
      'focusable="false" aria-hidden="true" preserveAspectRatio="xMidYMid meet">' +
      '<path d="' + spec.d + '"/></svg>'
    );
  }

  // The draw-on needs a dash exactly as long as the line it hides. The
  // tidy way to get that is pathLength="1" on the path and a dasharray of
  // 1 in the stylesheet, but Chrome does not scale the dash by pathLength,
  // so that leaves a 1px dash on a 174px path: a dotted line, not a drawn
  // one. Measure the real geometry instead and hand it to the CSS. Works
  // on the hidden variant too, since getTotalLength() reads the `d`
  // attribute rather than the layout.
  function measureLinks(root) {
    root.querySelectorAll(".cph-link path").forEach(function (path) {
      path.style.setProperty("--len", path.getTotalLength());
    });
  }

  function cphLink(shape, i) {
    var li = document.createElement("li");
    li.className = "cph-link shape-" + shape;
    li.setAttribute("aria-hidden", "true");
    li.style.setProperty("--i", i);
    li.innerHTML = svgLink("link-wide", CPH_PATHS[shape].wide) +
                   svgLink("link-tall", CPH_PATHS[shape].tall);
    return li;
  }

  function renderDenmark(ctx, c) {
    if (!c.denmark) return;
    var ol = document.getElementById("denmark-flow");
    if (!ol) return;
    var steps = c.denmark.steps || [];
    var photos = (bundle.details && bundle.details.photos) || {};
    var placed = {};
    var i = 0;
    ol.innerHTML = "";

    CPH_FLOW.forEach(function (entry) {
      if (entry.kind === "step") {
        if (!steps[entry.step]) return;
        placed[entry.step] = true;
        ol.appendChild(cphStep(steps[entry.step], entry.side, i++, ctx));
      } else if (entry.kind === "photo") {
        if (!photos[entry.photo]) return;
        ol.appendChild(cphPhoto(photos[entry.photo], entry.side, entry.id, i++));
      } else {
        ol.appendChild(cphLink(entry.shape, i++));
      }
    });

    steps.forEach(function (step, n) {
      if (placed[n]) return;
      ol.appendChild(cphStep(step, n % 2 ? "right" : "left", i++, ctx));
    });

    measureLinks(ol);
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
    // Copenhagen's two insets are part of its composed flow and are set by
    // renderDenmark. This runs from init(), before the first setLanguage(),
    // so those elements do not exist yet: looking them up here would find
    // nothing and silently leave the section without its photographs.
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

    bindPass(document.body, ctx, c);

    renderLetter(ctx, c);
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
    // and nothing scrolls until the guest opens it. The letter needs to be
    // laid out from the start even so: envelope.js measures it to work out
    // how far the envelope has to grow.
    var app = document.getElementById("app");
    app.hidden = false;
    app.setAttribute("aria-hidden", "true");

    // Called by envelope.js at the hand-off, once the grown envelope has
    // been swapped for the real letter underneath it. aria-hidden comes off
    // here rather than when the writing finishes, or the whole sequence
    // would play inside a subtree screen readers cannot see.
    window.WeddingEnvelope.show(bundle, function () {
      app.removeAttribute("aria-hidden");
      // Started here, not after the letter finishes: one gesture takes the
      // guest off the letter whenever they like, and everything below it has
      // to be bound and observing by the time they land.
      if (window.WeddingMain) window.WeddingMain.start(bundle);
      // Before the letter plays: paging.js takes the scroll lock in the same
      // frame the envelope releases its own, so there is never a frame in
      // between where the page can be scrolled.
      if (window.WeddingPaging) window.WeddingPaging.start();
      if (window.WeddingLetter) window.WeddingLetter.play();
    });
  }

  return { init: init, setLanguage: setLanguage, getLang: function () { return currentLang; } };
})();

window.addEventListener("bundle:ready", function (e) {
  window.WeddingRender.init(e.detail);
});
