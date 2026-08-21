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
 *   name,lang,event,id,key
 *   Bilgehan,tr,s,,
 *   Anna,de,b,,
 *
 *   lang  = en | tr | de     (guest's default language; they can switch)
 *   event = s (Spain only) | d (Denmark only) | b (both)
 *   id/key are auto-filled on first run — leave blank for new guests.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { randomBytes, createCipheriv } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SITE_BASE = process.env.SITE_BASE || "https://yusufkamilak.github.io/wedding/";

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

// ---- setup ----
if (!existsSync(D_DIR)) mkdirSync(D_DIR, { recursive: true });

if (!existsSync(GUESTS_CSV)) {
  writeFileSync(
    GUESTS_CSV,
    "name,lang,event,id,key\n" +
      "Example Guest,en,s,,\n"
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

  if (!name) continue;
  if (!["en", "tr", "de"].includes(lang)) fail(`Guest "${name}": lang must be en/tr/de, got "${lang}"`);
  if (!["s", "d", "b"].includes(event)) fail(`Guest "${name}": event must be s/d/b, got "${event}"`);

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

  const bundle = {
    guest: { name, lang, event },
    content: contentByLang,
    details,
    auth: authToken,
  };

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

  outRows.push({ name, lang, event, id, key });
  links.push({
    name,
    event,
    lang,
    url: `${SITE_BASE}#${id}.${key}`,
  });
}

writeFileSync(GUESTS_CSV, toCSV(["name", "lang", "event", "id", "key"], outRows));
writeFileSync(LINKS_CSV, toCSV(["name", "event", "lang", "url"], links));

console.log(`✓ Wrote ${refreshed} bundle(s) to d/ (${created} new).`);
console.log(`✓ Links for sending to guests: ${path.relative(ROOT, LINKS_CSV)}`);
console.log("  (this file is gitignored — never commit it)");
