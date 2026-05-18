# Fressh Marketing Page — Design Spec

**Date:** 2026-05-18  
**Scope:** `web/src/index.tsx` — replace the existing sparse homepage with a full marketing page

---

## Goal

Replace the current minimal homepage at `fressh.caritos.com` with a proper marketing page that shows what the app looks like (screenshot) and drives App Store downloads. The design must match the Bauhaus/Braun aesthetic already used in the app itself.

---

## Design Language

**Bauhaus/Braun** — the same design language as the app:

- **Palette:** `#F5F5F0` (warm off-white background), `#0D1B2A` (dark navy for all text, borders, UI elements)
- **Typography:** System sans-serif (`-apple-system`, `Helvetica Neue`). Headlines: heavy weight (800), tight negative letter-spacing. Labels: uppercase, wide tracking (0.15–0.2em), low opacity. Body: regular weight, 0.45–0.5 opacity.
- **Borders:** 1px lines at `rgba(13,27,42,0.08–0.12)` — visible structural grid, not decorative
- **CTA button:** Solid `#0D1B2A` fill, `#F5F5F0` text, uppercase via `text-transform: uppercase`, wide letter-spacing, `border-radius: 0`
- **No drop shadows, gradients, icons, or decorative elements** — everything must serve a structural purpose

---

## Layout: Centered Stack (Option B)

All content is centered on a single column, stacking vertically. Naturally mobile-first.

---

## Sections

### 1. Nav
- Logo left: `Fressh` with the R and SS letters highlighted in Braun orange `#FF6200` — rendered as `F<span>r</span>e<span>ss</span>h` — communicates RSS reader at a glance
- Links right: `Support` · `Privacy` — uppercase, 0.35 opacity
- 1px bottom border

### 2. Hero
- **Label:** `FRESSH · iOS · FREE` — 9px, uppercase, wide tracking, 0.3 opacity
- **Headline:** `Read. / Nothing / extra.` — 52px, weight 800, letter-spacing -2.5px, line-height 1.0. (Three short lines, left-aligned on mobile, centered on desktop)
- **Subhead:** One line, 16–18px, 0.45 opacity. Copy: `RSS for iPhone. No algorithms, no ads, no account required.`
- **Phone mockup:** Centered. Outlined phone shape (2px `#0D1B2A` border, no heavy shadow). Screenshot fills the screen area. Placeholder blocks used until real screenshots are dropped in at `web/public/screenshots/screenshot-1.png`.
- **CTA:** `DOWNLOAD ON THE APP STORE` — links to `https://apps.apple.com/app/id6770117291`
- Bottom 1px border separates from features

### 3. Features
- Section label: `FEATURES` — 9px uppercase, wide tracking, 0.3 opacity
- 2-column grid with exposed 1px cell borders (the Braun product-sheet grid)
- 6 cells:

| Label | Description |
|---|---|
| RSS & Atom | Subscribe to any feed by URL |
| Import OPML | Bring your existing subscriptions |
| Star articles | Save anything to read later |
| No account | All data stays on your device |
| Full articles | Open in Safari with one tap |
| Auto-read | Articles mark read as you scroll |

- Bottom 1px border separates from footer

### 4. Footer
- Left: `© 2026 Eladio Caritos` — 13px, 0.4 opacity
- Right: `Privacy · Support` links
- No top border (section above already has bottom border)

---

## Screenshot Handling

The phone mockup uses a placeholder until real screenshots are available. Implementation should:

1. Render an `<img>` tag pointing to `/public/screenshots/screenshot-1.png`
2. If the image doesn't exist, a CSS placeholder (the grey block rows) is shown via an `onerror` fallback or by checking at build time
3. When real screenshots arrive at `web/public/screenshots/`, no code change is needed — just drop the file

---

## Responsive Behavior

- **Mobile (<600px):** Single column, padding 24px. Headline ~36px. Phone mockup width 140px.
- **Desktop (≥600px):** Max-width 640px centered. Headline 52px. Phone mockup width 160px.
- The centered-stack layout requires no structural change between breakpoints — only sizing adjusts.

---

## Files Changed

- `web/src/index.tsx` — update the `app.get('/')` route only. All other routes (`/support`, `/privacy`) are unchanged.
- `web/public/screenshots/` — directory created, placeholder used until real screenshots arrive.

---

## Out of Scope

- `/support` and `/privacy` pages — unchanged
- Multiple screenshots / carousel
- App Store badge SVG (text link is sufficient for now)
- Dark mode
