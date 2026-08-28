#!/usr/bin/env node
/*
 * build-invites.mjs — turns the plaintext guest list + copy into one
 * encrypted .bin file per guest under d/, plus a links.csv you send out.
 *
 * Nothing this script reads is ever committed: content/*.json,
 * tools/guests.csv, tools/links.csv and tools/.auth.secret are all
 * gitignored. Only the resulting ciphertext in d/*.bin gets committed.
 *
 * Idempotent: re-running after editing content or adding guest rows keeps
 * every existing guest's id and key (so links already sent out keep
 * working) and only fills in blanks / adds new bundles.
 *
 * Usage:
 *   node tools/build-invites.mjs
 *
 * guests.csv format (header row required), values may NOT contain commas:
 *   name,lang,event,covered,id,key
 *   Bilgehan,tr,s,,,
 *   Anna,de,b,,,
 *
 *   lang    = en | tr | de   (guest's default language; they can switch)
 *   event   = s (Spain only) | d (Denmark only) | b (both)
 *   covered = blank | yes    (yes = we are paying their share; see
 *                             applyCovered below for what that removes)
 *   id/key are auto-filled on first run, leave blank for new guests.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { randomBytes, createCipheriv } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SITE_BASE = process.env.SITE_BASE || "https://yusufkamilak.github.io/invitation/";

const GUESTS_CSV = path.join(ROOT, "tools", "guests.csv");
const LINKS_CSV = path.join(ROOT, "tools", "links.csv");
const AUTH_SECRET_FILE = path.join(ROOT, "tools", ".auth.secret");
const D_DIR = path.join(ROOT, "d");
const CONTENT_DIR = path.join(ROOT, "content");

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fail(msg) {
  console.error("✗ " + msg);
  process.exit(1);
}

function readJSON(p, label) {
  if (!existsSync(p)) fail(`Missing ${label}: ${p}`);
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (err) {
    fail(`Could not parse ${label} as JSON: ${err.message}`);
  }
}

// ---- simple CSV (no quoting — names must not contain commas) ----
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const row = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
  return { header, rows };
}

function toCSV(header, rows) {
  const lines = [header.join(",")];
  for (const row of rows) lines.push(header.map((h) => row[h] ?? "").join(","));
  return lines.join("\n") + "\n";
}

// ---- per-event pruning ----
// A guest's bundle is decrypted client-side, so *anything* left in it is
// readable in devtools regardless of what the UI chooses to hide. A
// Denmark-only guest must never receive Barcelona facts (or vice versa) —
// so we delete the other part's content before it's ever encrypted, per
// guest, per language.
function deletePath(obj, path) {
  const parts = path.split(".");
  let node = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (node == null || typeof node !== "object") return;
    node = node[parts[i]];
  }
  if (node && typeof node === "object") delete node[parts[parts.length - 1]];
}

// keys removed from content/{lang}.json depending on which event(s) a guest
// is invited to. "b" (both) loses nothing: a both-guest sees both parts.
//
// The `letter` block is deliberately absent here. It is the same letter for
// everyone, which is only safe because it names no place and no date — see
// the letter-token assertion below, which is what actually holds that line.
const CONTENT_PRUNE = {
  s: ["denmark", "faq.denmark"],
  d: ["place", "plan", "practical", "faq.spain"],
  b: [],
};

// keys removed from content/details.json the same way.
const DETAILS_PRUNE = {
  s: ["denmark", "photos.denmarkCar", "photos.denmarkTable"],
  d: ["spain", "airbnb", "paypal", "photos.map", "photos.house"],
  b: [],
};

// facts that must never appear in a pruned bundle for a given event — a
// cheap leak assertion run on every build, on the exact plaintext that gets
// encrypted.
// A photo path is a fact like any other: assets/ is browsable on the public
// repo, so a path left in the wrong bundle tells that guest exactly which
// file to go and look at. The map is the sharpest case of that, since a map
// with a pin on it does not need a caption to say where the house is.
// Listing them here is what stops DETAILS_PRUNE above from quietly rotting
// the next time a photo slot is added.
//
// The tr/de copy hardcodes localized city spellings, because the shared
// {{...City}} tokens can only carry one spelling. Those exonyms are facts
// like any other, so they are needles too.
const CITY_ALIASES = {
  Copenhagen: ["Kopenhag", "Kopenhagen"],
  Barcelona: ["Barselona"],
};
const LEAK_CHECK = {
  s: (details) => [
    details.denmark?.city,
    ...(CITY_ALIASES[details.denmark?.city] || []),
    details.photos?.denmarkCar,
    details.photos?.denmarkTable,
  ].filter(Boolean),
  d: (details) => [
    details.spain?.city,
    ...(CITY_ALIASES[details.spain?.city] || []),
    ...(details.airbnb?.addressLines || []),
    details.airbnb?.listingUrl,
    details.airbnb?.mapUrl,
    details.paypal?.link,
    details.photos?.map,
    // The house photos are a list, so spread it: a fifth one added to
    // details.json is checked without anyone remembering to come here.
    ...(details.photos?.house || []),
    details.spain?.costPerPerson != null ? String(details.spain.costPerPerson) : null,
  ].filter(Boolean),
  // Deliberately not in that list: spain.airportMinutes. It is the number
  // 30, and a two-digit needle matched against the whole plaintext bundle
  // would hit a date, a QR path or a word count and fail the build for a
  // guest who was never in any danger. The whole spain block is deleted
  // for "d" anyway; the needles here are the strings distinctive enough
  // to be evidence.
  b: () => [],
};

// The letter is unpruned, so every guest gets the same one whatever they
// were invited to. LEAK_CHECK alone cannot keep that safe: it matches
// literal strings, and buildCtx() in js/render.js resolves {{spainCity}} to
// an empty string for a Denmark-only guest, so a letter written with that
// token would leak nothing detectable while rendering as broken copy. Only
// the three tokens that exist for every guest are allowed.
const LETTER_TOKENS_OK = new Set(["name", "partnerA", "partnerB"]);

function checkLetter(content, name) {
  for (const lang of Object.keys(content)) {
    const letter = content[lang]?.letter;
    if (!letter) continue;
    for (const [, token] of JSON.stringify(letter).matchAll(/\{\{(\w+)\}\}/g)) {
      if (!LETTER_TOKENS_OK.has(token)) {
        fail(
          `Guest "${name}": content/${lang}.json letter uses {{${token}}}. ` +
            `The letter goes to every guest unpruned, so it must stay event-neutral: ` +
            `only ${[...LETTER_TOKENS_OK].join(", ")} are allowed.`
        );
      }
    }
  }
}

// ---- per-guest "this one is on us" variant ----
// A guest whose share we are covering must not be shown an amount, a
// PayPal button or a QR, and must not be asked to cover their own stay.
// That is two things at once: copy, swapped for the practicalCovered
// block authored beside practical in each language file, and facts,
// deleted exactly the way the event prune deletes them.
//
// The swap is an overlay, not a second whole section. practicalCovered
// carries only the keys that differ, so bringList, weatherNote and the
// rest cannot drift between a paying guest and a covered one.
//
// practicalCovered is deleted for *everyone*, covered or not. That one
// delete is what keeps "this part is on us" out of a paying guest's
// bundle, and it guards a leak the event prune above cannot see: not
// Spain content reaching a Denmark guest, but one guest's arrangement
// reaching another. checkCovered() below is what turns it into a build
// failure rather than a convention.
const COVERED_DROP = ["perNight", "paypalLabel", "paypalNote", "travelNote"];
const COVERED_DETAILS_DROP = ["paypal", "spain.costPerPerson"];

function applyCovered(content, details, covered, name) {
  for (const lang of Object.keys(content)) {
    const c = content[lang];
    if (covered && c.practical) {
      if (!c.practicalCovered) {
        fail(
          `Guest "${name}" is covered, but content/${lang}.json has no practicalCovered block. ` +
            `Write it in all three languages: the bundle carries every language and the ` +
            `switcher works offline, so a missing one shows them the paying copy.`
        );
      }
      Object.assign(c.practical, c.practicalCovered);
      for (const key of COVERED_DROP) delete c.practical[key];
    }
    delete c.practicalCovered;
  }
  if (covered) for (const p of COVERED_DETAILS_DROP) deletePath(details, p);
}

// The covered copy itself, pulled from the *original* content, to be used
// as needles against every paying guest's plaintext.
function coveredNeedles(contentByLang) {
  const out = [];
  for (const lang of Object.keys(contentByLang)) {
    const v = contentByLang[lang].practicalCovered;
    if (v && v.costBody) out.push(v.costBody);
  }
  return out;
}

function checkCovered(bundle, covered, name, needles, details) {
  for (const lang of Object.keys(bundle.content)) {
    if (bundle.content[lang].practicalCovered) {
      fail(`Guest "${name}": practicalCovered survived into the bundle for ${lang}.`);
    }
  }
  const plain = JSON.stringify(bundle);
  if (covered) {
    // Structural, not a search for "225". The note on airportMinutes above
    // says why a short numeric needle is a bad idea, and the same applies
    // here. The PayPal URL is long enough to be worth matching literally.
    if (bundle.details.paypal) fail(`Guest "${name}" is covered but still carries details.paypal.`);
    if (bundle.details.spain && bundle.details.spain.costPerPerson != null) {
      fail(`Guest "${name}" is covered but still carries details.spain.costPerPerson.`);
    }
    if (details.paypal?.link && plain.includes(details.paypal.link)) {
      fail(`Guest "${name}" is covered but the PayPal link is still somewhere in their bundle.`);
    }
  } else {
    for (const needle of needles) {
      if (plain.includes(needle)) {
        fail(
          `Guest "${name}" is not covered, but their bundle contains the covered copy ` +
            `("${needle.slice(0, 40)}..."). They would read that someone else is not paying.`
        );
      }
    }
  }
}

function pruneForEvent(contentByLang, details, event) {
  const content = JSON.parse(JSON.stringify(contentByLang));
  const prunedDetails = JSON.parse(JSON.stringify(details));
  for (const lang of Object.keys(content)) {
    for (const path of CONTENT_PRUNE[event] || []) deletePath(content[lang], path);
  }
  for (const path of DETAILS_PRUNE[event] || []) deletePath(prunedDetails, path);
  return { content, details: prunedDetails };
}

// ---- setup ----
if (!existsSync(D_DIR)) mkdirSync(D_DIR, { recursive: true });

if (!existsSync(GUESTS_CSV)) {
  writeFileSync(
    GUESTS_CSV,
    "name,lang,event,covered,id,key\n" +
      "Example Guest,en,s,,,\n"
  );
  console.log(`→ Created ${GUESTS_CSV} with a placeholder row. Edit it, then re-run.`);
  process.exit(0);
}

let authToken;
if (existsSync(AUTH_SECRET_FILE)) {
  authToken = readFileSync(AUTH_SECRET_FILE, "utf8").trim();
} else {
  authToken = b64url(randomBytes(24));
  writeFileSync(AUTH_SECRET_FILE, authToken + "\n");
  console.log("→ Generated a new RSVP auth token. Paste it into the Apps Script");
  console.log("  Script Properties as AUTH_TOKEN (see README for the exact steps):");
  console.log("  " + authToken);
}

const contentByLang = {};
for (const lang of ["en", "tr", "de"]) {
  contentByLang[lang] = readJSON(path.join(CONTENT_DIR, `${lang}.json`), `content/${lang}.json`);
}
const details = readJSON(path.join(CONTENT_DIR, "details.json"), "content/details.json");
const COVERED_NEEDLES = coveredNeedles(contentByLang);

const { rows } = parseCSV(readFileSync(GUESTS_CSV, "utf8"));
if (rows.length === 0) fail("guests.csv has no guest rows.");

const outRows = [];
const links = [];
let created = 0;
let refreshed = 0;

for (const row of rows) {
  const name = row.name?.trim();
  const lang = (row.lang || "en").trim().toLowerCase();
  const event = (row.event || "b").trim().toLowerCase();
  const covered = (row.covered || "").trim().toLowerCase();

  if (!name) continue;
  if (!["en", "tr", "de"].includes(lang)) fail(`Guest "${name}": lang must be en/tr/de, got "${lang}"`);
  if (!["s", "d", "b"].includes(event)) fail(`Guest "${name}": event must be s/d/b, got "${event}"`);
  if (!["", "yes"].includes(covered)) fail(`Guest "${name}": covered must be blank or "yes", got "${covered}"`);
  if (covered === "yes" && event === "d") {
    fail(`Guest "${name}": covered="yes" means nothing with event "d". There is no Practical section to cover.`);
  }

  let id = row.id?.trim();
  let key = row.key?.trim();

  if (!id) {
    id = b64url(randomBytes(6));
    created++;
  }
  if (!key) {
    key = b64url(randomBytes(32)); // 256-bit AES-GCM key
  }

  const keyBytes = Buffer.from(key.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (keyBytes.length !== 32) fail(`Guest "${name}": stored key is not 32 bytes — delete its id/key cells and re-run.`);

  const pruned = pruneForEvent(contentByLang, details, event);
  applyCovered(pruned.content, pruned.details, covered === "yes", name);

  const bundle = {
    guest: { name, lang, event },
    content: pruned.content,
    details: pruned.details,
    auth: authToken,
  };

  // Leak assertion: the exact plaintext we're about to encrypt must not
  // contain any fact belonging to the part(s) this guest wasn't invited to.
  // Checked against the *original* (unpruned) details — checking the pruned
  // copy would trivially always pass, since pruning already deleted the facts.
  checkLetter(pruned.content, name);
  checkCovered(bundle, covered === "yes", name, COVERED_NEEDLES, details);

  const plainCheck = JSON.stringify(bundle);
  for (const needle of LEAK_CHECK[event](details)) {
    if (needle && plainCheck.includes(needle)) {
      fail(`Guest "${name}" (event "${event}"): pruned bundle still contains "${needle}" — fix CONTENT_PRUNE/DETAILS_PRUNE before shipping.`);
    }
  }

  const plaintext = Buffer.from(JSON.stringify(bundle), "utf8");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Layout: 12-byte IV ‖ ciphertext ‖ 16-byte GCM tag — matches exactly
  // what browser WebCrypto's AES-GCM decrypt expects as one buffer.
  const out = Buffer.concat([iv, ciphertext, tag]);
  writeFileSync(path.join(D_DIR, `${id}.bin`), out);
  refreshed++;

  outRows.push({ name, lang, event, covered, id, key });
  links.push({
    name,
    event,
    lang,
    url: `${SITE_BASE}#${id}.${key}`,
  });
}

writeFileSync(GUESTS_CSV, toCSV(["name", "lang", "event", "covered", "id", "key"], outRows));
writeFileSync(LINKS_CSV, toCSV(["name", "event", "lang", "url"], links));

console.log(`✓ Wrote ${refreshed} bundle(s) to d/ (${created} new).`);
console.log(`✓ Links for sending to guests: ${path.relative(ROOT, LINKS_CSV)}`);
console.log("  (this file is gitignored — never commit it)");
