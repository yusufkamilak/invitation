# Invitation site

A private, personalized invitation site covering two occasions: a dinner
and a friends' getaway. The link opens onto a sealed envelope addressed to
the guest; one tap turns it over and grows it into a letter, which writes
itself on and then scrolls away onto the rest of the page. Hosted free on
GitHub Pages, live through at least October 2027. This file is the
day-to-day operator's manual.

Deliberately generic: this file is committed to the public repo, so it
avoids naming cities, dates, or guests — all of that lives only in the
gitignored `content/` files, never here.

## How the privacy model works

The repo is **public** (required for free GitHub Pages), but nothing
readable is ever committed. Every guest's name, the dates, the Airbnb
address, the plan — all of it — is encrypted (AES-256-GCM) into one opaque
file per guest under `d/*.bin`. The only thing that can decrypt a given
file is the key carried in that guest's own link, after the `#`. That
fragment never gets sent to any server, so it's never logged anywhere.

Anyone without a link — or with a wrong/broken one — sees an identical
neutral "check your link" card, in all three languages. There is no way to
tell from the outside whether a link is wrong, expired, or was revoked.

**Guests invited to only one part never receive the other part's content at
all.** `tools/build-invites.mjs` prunes each guest's bundle to their
event(s) *before* it's ever encrypted — a Denmark-only guest's decrypted
bundle has no Spain city, dates, cost, or Airbnb link in it, not even in
devtools; a Spain-only guest's has nothing about Denmark. This is stricter
than just hiding sections in the UI: the facts genuinely aren't in the file
that reaches their browser. A `b` (both) guest's bundle is unpruned. The
build fails loudly if a pruned bundle still contains a fact it shouldn't
(see the leak assertion in `build-invites.mjs`).

Every guest sees the card, the RSVP section and the FAQ. What differs:

| event | extra sections shown | content NOT present in the decrypted bundle |
|---|---|---|
| `s` Spain only | `place`, `plan`, `practical` | `denmark`; `details.denmark` |
| `d` Denmark only | `denmark` | `place`, `plan`, `practical`; `details.spain`, `details.airbnb`, `details.paypal` |
| `b` both | all four | nothing, a both-guest's bundle is unpruned |

The letter on the first screen is the one thing every guest gets
identically, whatever they were invited to. That is only safe because it
names no place and no date, and the build enforces it: the letter may only
use the `{{name}}`, `{{partnerA}}` and `{{partnerB}}` tokens, and
`build-invites.mjs` fails if it finds any other. Don't relax that. A
`{{spainCity}}` in the letter would render as an empty string for a
Denmark-only guest, so it would leak nothing the leak assertion could
catch and still ship visibly broken copy.

Adding a section means touching three places, or the gating silently
breaks: the `sectionForKey` map in `js/render.js`, the matching entry in
`CONTENT_PRUNE` in `tools/build-invites.mjs`, and the `<section id="...">`
in `index.html`. Forget the prune entry and content leaks; forget
`sectionForKey` and the wrong guest sees an empty section.

Caveat: the repo itself is public, so everything under `assets/` is
browsable on GitHub regardless of event. The `fl-*.webp` florals on the
letter are generic watercolours and say nothing about anyone, but the two
`ph-*.jpg` photos are real. Pruning hides which guest's page
*references* which photo — it can't hide that the files exist. Don't put
anything identifying (e.g. a recognisable venue) in a gated photo slot.

**What this means day to day:**
- To add, edit, or remove a guest: edit `tools/guests.csv`, then rebuild.
- To revoke one guest's access: delete their file from `d/` and push —
  everyone else is unaffected.
- The real content — `content/*.json`, `tools/guests.csv` — is gitignored
  and lives **only on this laptop**. Back these up. If they're lost, the
  live site keeps working, but you'd have to re-write all the copy from
  scratch to make further changes or add guests.

## Making a change

1. Edit whichever of these needs it:
   - `content/en.json`, `content/tr.json`, `content/de.json` — the copy, in
     each language. Keep the same keys across all three files. Content that
     belongs to only one event lives under an event-specific key so pruning
     can find it — see the table above.
   - `content/details.json` — facts: dates, Airbnb, PayPal link, names, and
     `photos` (paths under `assets/` for the two photo insets, see "Photos"
     below).
   - `tools/guests.csv` — the guest list (`name,lang,event,id,key` — leave
     `id`/`key` blank for new guests, the build script fills them in).
2. Run:
   ```
   npm install        # first time only
   npm run build       # regenerates QR + all guest bundles
   ```
3. Check `tools/links.csv` for the guest's link (new or unchanged for
   existing guests — re-running never breaks a link already sent out).
4. Commit and push `d/*.bin` (and nothing else — everything else is
   gitignored):
   ```
   git add d/
   git commit -m "Update guest bundles"
   git push
   ```
   GitHub Pages redeploys automatically, usually within a minute.

`guests.csv` format — plain values only, no commas inside a field:
```
name,lang,event,id,key
Bilgehan,tr,s,,
Anna,de,b,,
```
`lang`: `en` / `tr` / `de` — their default, they can switch on the page.
`event`: `s` Spain only, `d` Denmark only, `b` both.

## Photos

Two slots, both real photos. To swap one, keep the same filename (or update
the path in `content/details.json`'s `photos` block) and re-run
`node tools/build-invites.mjs`:

- `ph-house.jpg` — `photos.place`, the inset in the Spain section (Spain
  guests only).
- `ph-denmark.jpg` — `photos.denmark`, the inset in the Denmark section
  (Denmark guests only).

Both are shown 16:10 inside a thin gold mat, so anything with the subject
near the top or bottom edge will get cropped. There is deliberately no
photo on the card itself: it is type only.

Size them before committing. 1400px wide at quality 60 is about 250 to
300 KB and still sharp at 2x in a frame that never renders wider than
~552 CSS px:

```
sips -s format jpeg -s formatOptions 60 --resampleWidth 1400 in.jpg --out assets/ph-house.jpg
```

Any slot left blank in `content/details.json` (`"place": ""`, etc.) is
simply skipped — no broken image, the section just renders without a
photo.

## House style for the copy

Three rules the current copy follows. Breaking any of them is the kind of
thing that only shows up once links are already out:

- **No em dashes or en dashes** anywhere in `content/*.json`. Use a comma,
  a colon, or a full stop. Check with
  `grep -n '[—–]' content/*.json` before building.
- **No wedding vocabulary.** This is a dinner and a getaway, not a wedding.
  That covers `Hochzeit`/`Trauung` and `düğün`/`nikah` too.
- **One or two short sentences per body.** Nothing over about 25 words.
- **The letter names no place and no date.** It is the one block that goes
  to every guest unpruned. The build enforces the token rule; the wording
  is on you. "the coast" or "five days in the sun" would pass every
  automated check and still tell a Denmark-only guest what they weren't
  invited to.
- **The letter's lines are authored, not wrapped.** `letter.title` and
  `letter.body` are arrays, and each entry in `title` is written as its own
  line. That is what keeps the German title, which is much longer than the
  English one, breaking where it should.

Also keep `en.json`, `tr.json` and `de.json` key-identical. A key present in
one file and missing in another renders as an empty string with no error, so
a missing translation is invisible until a guest switches language.

## Fonts

`css/fonts-embedded.css` is generated, not hand-written. Every face is
inlined as a base64 woff2 so the site makes no third-party requests: a
guest's visit is never visible to anyone but GitHub Pages. To change or
re-fetch them:

```
node tools/make-fonts.mjs
```

Three families, `latin` and `latin-ext` subsets only. latin carries the
German umlauts, latin-ext the Turkish g-breve, s-cedilla and dotted
capital I; everything else Google offers is dead weight for three
languages. Playfair Display does the green page, Sacramento is the
handwriting on the letter, Cormorant Garamond is the letter's body.

Google now serves these as variable fonts, so asking for two weights
returns two `@font-face` blocks pointing at the *same* file. The script
groups faces by URL and emits each one once with a weight range; without
that it inlines every byte twice and the file doubles.

## Revoking a guest

Delete their `.bin` file from `d/`, commit, push. Their link now shows the
same neutral card as a broken link — indistinguishable from the outside.
Everyone else's link is untouched.

## The RSVP backend

RSVPs and questions post to a Google Apps Script web app tied to a Google
Sheet, using a shared auth token embedded in each guest's encrypted
bundle — so the public `/exec` URL rejects anything that isn't a request
from an actual decrypted invite. See "One-time setup" below if this hasn't
been wired up yet, or if the script ever needs to change.

If you edit `apps-script/Code.gs`: paste the new version into the Apps
Script editor, then **Deploy → Manage deployments → (pencil) → Version:
New version → Deploy**. Do NOT create a *new* deployment — that issues a
new URL and breaks the live site until `js/config.js` is updated to match.

## One-time setup (already done, for reference)

1. [sheets.new](https://sheets.new) → name it *Wedding RSVPs*.
2. **Extensions → Apps Script** → delete the placeholder code → paste in
   `apps-script/Code.gs`.
3. **Project Settings (gear) → Script Properties → Add property**:
   `AUTH_TOKEN` = the value printed by `build-invites.mjs` (also saved
   locally, gitignored, at `tools/.auth.secret`).
4. **Deploy → New deployment → Web app**. Execute as **Me**, access
   **Anyone**. Deploy, authorize (Advanced → go to the app anyway).
5. Copy the `/exec` URL into `js/config.js`'s `APPS_SCRIPT_URL`.
6. Commit, push, send a real test RSVP from the live site, confirm the row
   lands in the Sheet and the email arrives, then delete the test row.

## Why the RSVP fetch uses `text/plain`

Apps Script web apps can't answer a CORS preflight request. Sending the
payload as `Content-Type: text/plain` keeps the browser's request a
"simple request", which skips the preflight entirely — this is the
standard, documented workaround and it's why `js/main.js` builds the
`fetch` call the way it does. Don't change this content type without
re-testing an RSVP from the live (not local) site.

## Local preview

```
python3 -m http.server 8000
```
Then open `http://localhost:8000/#<id>.<key>` using a link from
`tools/links.csv`. The bare URL with no fragment shows the fallback card,
same as it will for anyone without a link.

## What's committed vs. what isn't

| Committed (public) | Never committed (local only) |
|---|---|
| `index.html`, `css/`, `js/` (structure & logic, no facts) | `content/*.json` (all real copy & facts) |
| `d/*.bin` (opaque ciphertext) | `tools/guests.csv`, `tools/links.csv` |
| `apps-script/Code.gs` (no secret inside) | `tools/.auth.secret` |

## Longevity notes (why this should still work in October 2027)

- GitHub Pages: free, no expiry, 100 GB/month bandwidth — 30 concurrent
  guests is a rounding error.
- No build step, no npm dependency ships to the browser — `qrcode` is a
  devDependency used once at build time on this laptop, never fetched by a
  guest.
- WebCrypto (`crypto.subtle`) is a native browser API, not a library —
  nothing to go out of date.
- Google Apps Script web app deployments don't expire and have no
  submission cap.
