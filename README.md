# Clutch website

Static, multi-page site for Clutch ("Your controller. Super-powered."). No build step: plain HTML, CSS and JavaScript. Drop the folder on any static host (GitHub Pages, Vercel, Netlify, Cloudflare Pages).

## Pages

| File | What it is |
|---|---|
| `index.html` | Home: hero, feature reel, pack wall, parent trust strip, pricing preview, community teaser |
| `features.html` | Every feature with a screenshot slot and a one-line explanation |
| `packs.html` | Searchable grid of the 48 game packs (`js/packs-data.js`) |
| `parents.html` | Online-safe mode, PIN, quiet hours, privacy, FAQ |
| `pricing.html` | Plans, comparison table, checkout notes |
| `console-kit.html` | Coming soon + waitlist form |
| `download.html` | Installer button, requirements, 3-step setup, SmartScreen note |
| `guides.html` | Searchable help center (`js/guides-data.js`) |
| `community.html` | Forum prototype: categories, threads, feature requests with votes, profiles, reports |
| `changelog.html` | Releases + dev posts (`js/changelog-data.js`) |
| `support.html` | Contact form |
| `terms.html`, `privacy.html`, `refunds.html`, `guidelines.html` | Legal placeholders, marked for lawyer review |
| `account.html` | Age-gated sign-up, login, licenses, downloads, profile, forum settings |
| `admin.html` | Founder/mod dashboard: moderation queue, users, request statuses, settings, CMS for guides and posts |

## Go-live checklist (edit `js/site.js` → `CLUTCH_CONFIG`)

1. **Store.** Create products in Lemon Squeezy (or Paddle): Clutch Pro $19.99, Clutch Family $29.99. Paste the checkout links into `STORE.pro` and `STORE.family`. Test-mode links work as-is; the 18+/parent-or-guardian confirmation runs before checkout either way. Set up the "license key" email in the store's order confirmation, and turn on license keys (Lemon Squeezy: product → License keys, activation limit 1 for Pro, 3 for Family).
2. **Forms.** Deploy the Apps Script lead handler (same pattern as the MTF/HAAS/APS scripts) and paste its web-app URL into `FORM_ENDPOINT`. Waitlist, support and report submissions arrive as JSON with a `type` field.
3. **Discord (optional).** Set `DISCORD_URL` to show the Discord button on the community page.
4. **Support email.** Replace `SUPPORT_EMAIL`.
5. **Legal.** Replace the placeholder text in the four legal pages after a lawyer reviews them, and remove the "Draft for review" notices.
6. **Screenshots.** Replace each `.shot` placeholder on `features.html` with a real app screenshot (`<img>` with alt text).
7. **Code signing.** Once the installer is signed, remove the "Windows protected your PC" notice on `download.html`.

## Community, accounts and admin: what's a prototype

The forum, account area and admin dashboard are complete front-ends with every screen and control working against browser localStorage (seeded from `js/community-data.js`). To make them multi-user, swap the `ClutchDB` adapter at the top of `js/community-data.js` for API calls to a backend (Supabase is the easiest fit: Postgres + auth + row-level security). What the backend needs to enforce server-side, because a browser can't:

- 13+ age gate at sign-up and no under-13 accounts (COPPA)
- no private messages (simply don't build the table)
- profanity and personal-info filter on post create
- reports table + moderator roles (founder, mod), mute/ban checked on every write
- feature-request votes unique per user
- license keys: verified against the store's API, activation counts per key

## Local preview

Open `index.html` in a browser, or run `python3 -m http.server` in this folder.
