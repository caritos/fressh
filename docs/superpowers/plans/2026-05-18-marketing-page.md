# Fressh Marketing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sparse homepage at `fressh.caritos.com` with a Bauhaus/Braun-styled marketing page featuring a phone mockup with screenshot, feature grid, and App Store CTA.

**Architecture:** Single file change — `web/src/index.tsx`. The `Layout` component gets an updated logo (Braun orange on R+SS). The `app.get('/')` route is replaced entirely with the new marketing page JSX. All CSS lives in the existing inline `css` template literal. Other routes (`/support`, `/privacy`) are untouched.

**Tech Stack:** Hono 4.x with JSX renderer, Bun runtime, deployed via `web/deploy.sh` over rsync+SSH.

---

### Task 1: Add tests for the homepage route

**Files:**
- Create: `web/test/homepage.test.ts`

No test runner config needed — Bun discovers `*.test.ts` files automatically.

- [ ] **Step 1: Create the test file**

```ts
// web/test/homepage.test.ts
import { describe, expect, test } from 'bun:test'
import app from '../src/index'

describe('GET /', () => {
  async function getHome() {
    const res = await app.fetch(new Request('http://localhost/'))
    return { res, html: await res.text() }
  }

  test('returns 200', async () => {
    const { res } = await getHome()
    expect(res.status).toBe(200)
  })

  test('contains App Store link', async () => {
    const { html } = await getHome()
    expect(html).toContain('apps.apple.com/app/id6770117291')
  })

  test('headline copy', async () => {
    const { html } = await getHome()
    expect(html).toContain('Read.')
    expect(html).toContain('Nothing')
    expect(html).toContain('extra.')
  })

  test('contains all 6 feature labels', async () => {
    const { html } = await getHome()
    expect(html).toContain('RSS &amp; Atom')
    expect(html).toContain('Import OPML')
    expect(html).toContain('Star articles')
    expect(html).toContain('No account')
    expect(html).toContain('Full articles')
    expect(html).toContain('Auto-read')
  })

  test('logo has Braun orange treatment', async () => {
    const { html } = await getHome()
    expect(html).toContain('logo-rss')
    expect(html).toContain('#FF6200')
  })

  test('phone mockup screenshot img present', async () => {
    const { html } = await getHome()
    expect(html).toContain('/public/screenshots/screenshot-1.png')
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd web && bun test test/homepage.test.ts
```

Expected: several failures — headline/feature copy not yet present, `logo-rss` not yet present.

---

### Task 2: Update CSS — add Braun orange logo + marketing page styles

**Files:**
- Modify: `web/src/index.tsx` — update the `css` template literal and the `Layout` component

- [ ] **Step 1: Replace the `css` template literal**

Replace the entire `const css = \`...\`` block (lines 6–216) with:

```ts
const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
    background: #F5F5F0;
    color: #0D1B2A;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  a { color: inherit; }

  /* ---- NAV ---- */
  nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24px 40px;
    border-bottom: 1px solid rgba(13,27,42,0.08);
  }

  nav .logo {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.5px;
    text-decoration: none;
  }

  .logo-rss { color: #FF6200; }

  nav .nav-links {
    display: flex;
    gap: 32px;
    list-style: none;
  }

  nav .nav-links a {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-decoration: none;
    opacity: 0.4;
  }

  nav .nav-links a:hover { opacity: 1; }

  /* ---- HERO ---- */
  .hero {
    max-width: 640px;
    margin: 0 auto;
    padding: 64px 40px 56px;
    text-align: center;
    border-bottom: 1px solid rgba(13,27,42,0.08);
  }

  .hero-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    opacity: 0.3;
    margin-bottom: 24px;
  }

  .hero h1 {
    font-size: 52px;
    font-weight: 800;
    letter-spacing: -2.5px;
    line-height: 1.0;
    margin-bottom: 20px;
  }

  .hero p {
    font-size: 17px;
    opacity: 0.45;
    margin-bottom: 40px;
  }

  /* ---- PHONE MOCKUP ---- */
  .phone-wrap {
    display: flex;
    justify-content: center;
    margin-bottom: 40px;
  }

  .phone {
    width: 160px;
    background: #fff;
    border: 2px solid #0D1B2A;
    border-radius: 28px;
    padding: 10px 8px;
  }

  .phone-notch {
    width: 36px;
    height: 6px;
    background: #0D1B2A;
    border-radius: 4px;
    margin: 0 auto 8px;
    opacity: 0.15;
  }

  .phone-screen {
    background: #F5F5F0;
    border-radius: 12px;
    overflow: hidden;
    min-height: 280px;
    position: relative;
  }

  .screenshot-img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
    position: absolute;
    top: 0; left: 0;
    border-radius: 12px;
  }

  .screenshot-placeholder {
    padding: 12px 10px;
  }

  .placeholder-nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }

  .placeholder-nav-title {
    width: 56px; height: 8px;
    background: #0D1B2A; border-radius: 2px; opacity: 0.6;
  }

  .placeholder-nav-icon {
    width: 14px; height: 14px;
    background: #0D1B2A; border-radius: 50%; opacity: 0.12;
  }

  .placeholder-row {
    padding: 9px 0;
    border-bottom: 1px solid rgba(13,27,42,0.07);
  }

  .placeholder-row:last-child { border-bottom: none; }

  .pr-source { width: 44px; height: 5px; background: #0D1B2A; border-radius: 2px; opacity: 0.18; margin-bottom: 5px; }
  .pr-title  { height: 7px; background: #0D1B2A; border-radius: 2px; opacity: 0.5; margin-bottom: 4px; }
  .pr-title-short { width: 72%; }
  .pr-meta   { width: 52px; height: 5px; background: #0D1B2A; border-radius: 2px; opacity: 0.15; }

  .phone-home {
    width: 32px; height: 4px;
    background: #0D1B2A; border-radius: 3px;
    margin: 8px auto 0; opacity: 0.12;
  }

  /* ---- CTA ---- */
  .cta-btn {
    display: inline-block;
    background: #0D1B2A;
    color: #F5F5F0;
    text-decoration: none;
    padding: 14px 32px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    border-radius: 0;
    transition: opacity 0.15s;
  }

  .cta-btn:hover { opacity: 0.75; }

  /* ---- FEATURES ---- */
  .features {
    max-width: 640px;
    margin: 0 auto;
    border-bottom: 1px solid rgba(13,27,42,0.08);
  }

  .features-label {
    padding: 24px 40px 0;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    opacity: 0.3;
  }

  .feature-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin-top: 16px;
  }

  .feature-cell {
    padding: 18px 24px;
    border-right: 1px solid rgba(13,27,42,0.08);
    border-bottom: 1px solid rgba(13,27,42,0.08);
  }

  .feature-cell:nth-child(even) { border-right: none; }
  .feature-cell:nth-last-child(-n+2) { border-bottom: none; }

  .fc-label {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: -0.2px;
    margin-bottom: 4px;
  }

  .fc-desc {
    font-size: 12px;
    opacity: 0.45;
    line-height: 1.5;
  }

  /* ---- FOOTER ---- */
  footer {
    max-width: 640px;
    margin: 0 auto;
    padding: 28px 40px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
    opacity: 0.4;
  }

  footer a { text-decoration: none; }
  footer a:hover { opacity: 0.7; }

  /* ---- INNER PAGES (/support, /privacy) ---- */
  .page {
    max-width: 640px;
    margin: 0 auto;
    padding: 80px 40px;
  }

  .page h1 {
    font-size: 36px;
    font-weight: 700;
    letter-spacing: -1px;
    margin-bottom: 48px;
  }

  .page h2 {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.4;
    margin: 40px 0 16px;
  }

  .page p {
    font-size: 16px;
    opacity: 0.75;
    margin-bottom: 16px;
    line-height: 1.7;
  }

  .page ul {
    list-style: none;
    margin-bottom: 16px;
  }

  .page ul li {
    font-size: 16px;
    opacity: 0.75;
    padding: 8px 0;
    border-bottom: 1px solid rgba(13,27,42,0.06);
    display: flex;
    gap: 12px;
  }

  .page ul li::before {
    content: '·';
    opacity: 0.3;
    font-weight: 700;
  }

  .contact-link {
    display: inline-block;
    margin-top: 32px;
    background: #0D1B2A;
    color: #F5F5F0;
    text-decoration: none;
    padding: 12px 24px;
    font-size: 14px;
    font-weight: 600;
  }

  /* ---- RESPONSIVE ---- */
  @media (max-width: 600px) {
    nav { padding: 20px 24px; }
    .hero { padding: 48px 24px 48px; }
    .hero h1 { font-size: 36px; letter-spacing: -1.5px; }
    .hero p { font-size: 15px; }
    .phone { width: 140px; }
    .phone-screen { min-height: 240px; }
    .features-label { padding: 20px 24px 0; }
    .feature-cell { padding: 14px 16px; }
    footer { padding: 24px; flex-direction: column; gap: 12px; text-align: center; }
    .page { padding: 60px 24px; }
  }
`
```

- [ ] **Step 2: Update the `Layout` component logo**

Find:
```tsx
        <a href="/" class="logo">Fressh</a>
```

Replace with:
```tsx
        <a href="/" class="logo">F<span class="logo-rss">r</span>e<span class="logo-rss">ss</span>h</a>
```

- [ ] **Step 3: Run tests — confirm logo test now passes, others still fail**

```bash
cd web && bun test test/homepage.test.ts
```

Expected: `logo has Braun orange treatment` passes. Others still fail (homepage content not updated yet).

- [ ] **Step 4: Commit**

```bash
cd web && git add src/index.tsx && git commit -m "feat: update CSS and logo for Bauhaus marketing page"
```

---

### Task 3: Replace homepage route with marketing page

**Files:**
- Modify: `web/src/index.tsx` — replace `app.get('/')` route body

- [ ] **Step 1: Replace the `app.get('/')` route**

Find the entire `app.get('/', ...)` block (from `app.get('/', (c) =>` through its closing `)`  before `app.get('/support'`) and replace with:

```tsx
app.get('/', (c) =>
  c.html(
    <Layout title="Fressh — Clean RSS for your iPhone">
      <main>
        <div class="hero">
          <div class="hero-label">Fressh · iOS · Free</div>
          <h1>Read.<br />Nothing<br />extra.</h1>
          <p>RSS for iPhone. No algorithms, no ads, no account required.</p>

          <div class="phone-wrap">
            <div class="phone">
              <div class="phone-notch"></div>
              <div class="phone-screen">
                <img
                  src="/public/screenshots/screenshot-1.png"
                  alt="Fressh app screenshot"
                  class="screenshot-img"
                  onerror="this.style.display='none'"
                />
                <div class="screenshot-placeholder">
                  <div class="placeholder-nav">
                    <div class="placeholder-nav-title"></div>
                    <div class="placeholder-nav-icon"></div>
                  </div>
                  <div class="placeholder-row">
                    <div class="pr-source"></div>
                    <div class="pr-title"></div>
                    <div class="pr-title pr-title-short"></div>
                    <div class="pr-meta"></div>
                  </div>
                  <div class="placeholder-row">
                    <div class="pr-source"></div>
                    <div class="pr-title"></div>
                    <div class="pr-title pr-title-short" style="width:80%"></div>
                    <div class="pr-meta"></div>
                  </div>
                  <div class="placeholder-row">
                    <div class="pr-source"></div>
                    <div class="pr-title"></div>
                    <div class="pr-title pr-title-short" style="width:65%"></div>
                    <div class="pr-meta"></div>
                  </div>
                  <div class="placeholder-row">
                    <div class="pr-source"></div>
                    <div class="pr-title"></div>
                    <div class="pr-title pr-title-short"></div>
                    <div class="pr-meta"></div>
                  </div>
                </div>
              </div>
              <div class="phone-home"></div>
            </div>
          </div>

          <a href="https://apps.apple.com/app/id6770117291" class="cta-btn">
            Download on the App Store
          </a>
        </div>

        <div class="features">
          <div class="features-label">Features</div>
          <div class="feature-grid">
            <div class="feature-cell">
              <div class="fc-label">RSS &amp; Atom</div>
              <div class="fc-desc">Subscribe to any feed by URL</div>
            </div>
            <div class="feature-cell">
              <div class="fc-label">Import OPML</div>
              <div class="fc-desc">Bring your existing subscriptions</div>
            </div>
            <div class="feature-cell">
              <div class="fc-label">Star articles</div>
              <div class="fc-desc">Save anything to read later</div>
            </div>
            <div class="feature-cell">
              <div class="fc-label">No account</div>
              <div class="fc-desc">All data stays on your device</div>
            </div>
            <div class="feature-cell">
              <div class="fc-label">Full articles</div>
              <div class="fc-desc">Open in Safari with one tap</div>
            </div>
            <div class="feature-cell">
              <div class="fc-label">Auto-read</div>
              <div class="fc-desc">Articles mark read as you scroll</div>
            </div>
          </div>
        </div>
      </main>

      <footer>
        <span>© {new Date().getFullYear()} Eladio Caritos</span>
        <span>
          <a href="/privacy">Privacy</a>
          &nbsp;·&nbsp;
          <a href="/support">Support</a>
        </span>
      </footer>
    </Layout>
  )
)
```

- [ ] **Step 2: Run all tests — confirm all pass**

```bash
cd web && bun test test/homepage.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 3: Verify dev server renders correctly**

```bash
cd web && bun run dev
```

Open `http://localhost:8020` in a browser. Check:
- Logo shows `Fressh` with r+ss in orange
- Headline: `Read. / Nothing / extra.`
- Phone outline visible with placeholder article rows inside
- `Download on the App Store` button below phone
- Features grid: 2 columns, visible cell borders, 6 cells
- Footer: copyright left, Privacy · Support right
- Resize to mobile width — headline shrinks, layout stays centered

- [ ] **Step 4: Commit**

```bash
cd web && git add src/index.tsx && git commit -m "feat: replace homepage with Bauhaus marketing page"
```

---

### Task 4: Create screenshots directory and deploy

**Files:**
- Create: `web/public/screenshots/.gitkeep`

- [ ] **Step 1: Create screenshots directory**

```bash
mkdir -p web/public/screenshots && touch web/public/screenshots/.gitkeep
```

- [ ] **Step 2: Commit**

```bash
git add web/public/screenshots/.gitkeep && git commit -m "chore: add screenshots directory for app mockup images"
```

- [ ] **Step 3: Deploy**

```bash
cd web && bash deploy.sh
```

Expected output ends with: `✓ Done — https://fressh.caritos.com`

- [ ] **Step 4: Verify live**

Open `https://fressh.caritos.com` in a browser (after DreamHost panel nginx reload is confirmed). Check the same items from Task 3 Step 3 against the live site.
