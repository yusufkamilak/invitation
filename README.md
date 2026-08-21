# Wedding invitation site

A private, personalized wedding invitation site, in two parts — the legal
act and a friends' getaway. Hosted free on GitHub Pages, live through at
least October 2027. Full design rationale is in the original plan; this
file is the day-to-day operator's manual.

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

| event | sections shown | content NOT present in the decrypted bundle |
|---|---|---|
| `s` Spain only | Where, When, How, Around, What to bring, Notes | Denmark, The day, Travel; `details.denmark` |
| `d` Denmark only | Denmark, The day, Travel | Where, When, How, Around, What to bring, Notes; `details.spain`, `details.airbnb`, `details.paypal` |
| `b` both | everything | only the unused single-event hero/intro copy variants |

Caveat: the repo itself is public, so all four `assets/ph-*.jpg` files are
browsable on GitHub regardless of event. Pruning hides which guest's page
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
     `photos` (paths under `assets/` for the hero photo and the two photo
     bands — see "Photos" below).
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

`assets/ph-hero.jpg`, `ph-spain.jpg`, `ph-house.jpg`, `ph-denmark.jpg` are
currently **stock placeholders** (picsum.photos) — swap them for real photos
before sending out any more links. Keep the same filenames (or update the
paths in `content/details.json`'s `photos` block) and re-run
`node tools/build-invites.mjs`:

- `ph-hero.jpg` — behind the "Dear {name}" hero text, everyone sees it.
  Sits behind a feathered dark stripe (not a full-screen overlay) so the
  text stays readable while most of the photo shows through. Pick something
  that reads fine both cropped tight (mobile) and wide (desktop) — the
  stripe centers over the text block regardless of viewport.
- `ph-house.jpg` — the photo band in "Where" (Spain guests only).
- `ph-denmark.jpg` — the photo band in the Denmark section (Denmark guests
  only).
- `ph-spain.jpg` — the photo band in "Around" (Spain guests only).

Any slot left blank in `content/details.json` (`"hero": ""`, etc.) is simply
skipped — no broken image, the section just renders without a photo.

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
