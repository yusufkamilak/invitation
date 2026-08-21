#!/usr/bin/env node
/*
 * make-qr.mjs — generates a QR code for the PayPal link at build time and
 * writes it straight into content/details.json as an inline SVG string.
 *
 * This runs once on your laptop, not in the browser — there's no runtime
 * call to any QR-generating API, so nothing here can go offline before
 * October 2027. The SVG travels inside the same encrypted per-guest
 * bundle as everything else, so it's as private as the rest of the site.
 *
 * Usage: node tools/make-qr.mjs
 * (build-invites.mjs picks up the result automatically on its next run)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import QRCode from "qrcode";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DETAILS_PATH = path.join(ROOT, "content", "details.json");

if (!existsSync(DETAILS_PATH)) {
  console.error("✗ content/details.json not found.");
  process.exit(1);
}

const details = JSON.parse(readFileSync(DETAILS_PATH, "utf8"));
const link = details?.paypal?.link;

if (!link || link.includes("TBD")) {
  console.log("→ Skipping QR generation: content/details.json still has a placeholder PayPal link.");
  process.exit(0);
}

const svg = await QRCode.toString(link, {
  type: "svg",
  margin: 1,
  color: { dark: "#201d1a", light: "#00000000" },
});

details.paypal.qrSvg = svg;
writeFileSync(DETAILS_PATH, JSON.stringify(details, null, 2) + "\n");

console.log("✓ QR code generated for " + link + " and saved into content/details.json");
console.log("  Run `node tools/build-invites.mjs` next to bake it into guest bundles.");
