/*
 * stamp-assets.mjs — puts a content hash on every stylesheet and script
 * reference in index.html.
 *
 *   node tools/stamp-assets.mjs
 *
 * GitHub Pages serves everything with `Cache-Control: max-age=600` and no
 * other handle on it. The guest bundles are fine: js/unlock.js fetches them
 * with `cache: "no-store"`, so the text is always current. Nothing else was,
 * and the failure is a quiet one: a browser holding an old css/style.css
 * while the fresh bundle arrives over the wire renders the new words in the
 * old design, which looks like a half-finished deploy rather than a cache.
 * Safari held on to them for far longer than Chrome did.
 *
 * A hash in the query string is enough to fix that: the URL changes when the
 * file changes, so the old entry is never consulted again.
 *
 * index.html itself is still cached for up to ten minutes, and there is no
 * way to say otherwise on Pages. That window is the floor for how stale a
 * returning guest can be, and it heals itself. It is also why this runs at
 * build time and is committed: there is no server here to stamp anything.
 *
 * Idempotent. An existing ?v= is stripped before the new one goes on, so
 * running it twice on unchanged files leaves the file byte-identical.
 */
import fs from "node:fs/promises";
import crypto from "node:crypto";

const root = new URL("../", import.meta.url);
const htmlPath = new URL("index.html", root);

// Only local css/ and js/ assets. Anything absolute or cross-origin is left
// alone, and there is none of either: the site makes no third-party requests.
const REF = /(\b(?:href|src)=")((?:css|js)\/[A-Za-z0-9._-]+\.(?:css|js))(?:\?v=[0-9a-f]+)?(")/g;

const before = await fs.readFile(htmlPath, "utf8");
const seen = [];

const matches = [...before.matchAll(REF)];
const hashes = new Map();
for (const [, , asset] of matches) {
  if (hashes.has(asset)) continue;
  const bytes = await fs.readFile(new URL(asset, root));
  hashes.set(asset, crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 8));
}

const after = before.replace(REF, (_, lead, asset, tail) => {
  const v = hashes.get(asset);
  seen.push(`${asset}?v=${v}`);
  return `${lead}${asset}?v=${v}${tail}`;
});

if (after === before) {
  console.log(`index.html already stamped, ${seen.length} reference(s) unchanged`);
} else {
  await fs.writeFile(htmlPath, after);
  console.log(`index.html stamped:`);
  for (const s of seen) console.log(`  ${s}`);
}
