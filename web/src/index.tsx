import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'

const app = new Hono()

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

  nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24px 40px;
    border-bottom: 1px solid rgba(13,27,42,0.08);
  }

  nav .logo {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.5px;
    text-decoration: none;
  }

  nav .nav-links {
    display: flex;
    gap: 32px;
    list-style: none;
  }

  nav .nav-links a {
    font-size: 14px;
    text-decoration: none;
    opacity: 0.6;
  }

  nav .nav-links a:hover { opacity: 1; }

  .hero {
    max-width: 680px;
    margin: 0 auto;
    padding: 100px 40px 80px;
    text-align: center;
  }

  .hero .app-icon {
    width: 96px;
    height: 96px;
    border-radius: 22px;
    margin-bottom: 32px;
    box-shadow: 0 4px 24px rgba(13,27,42,0.12);
  }

  .hero h1 {
    font-size: 52px;
    font-weight: 700;
    letter-spacing: -2px;
    line-height: 1.1;
    margin-bottom: 20px;
  }

  .hero p {
    font-size: 20px;
    opacity: 0.6;
    max-width: 480px;
    margin: 0 auto 40px;
  }

  .app-store-btn {
    display: inline-block;
    background: #0D1B2A;
    color: #F5F5F0;
    text-decoration: none;
    padding: 14px 28px;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.2px;
    transition: opacity 0.15s;
  }

  .app-store-btn:hover { opacity: 0.8; }

  .features {
    max-width: 680px;
    margin: 0 auto;
    padding: 60px 40px;
    border-top: 1px solid rgba(13,27,42,0.08);
  }

  .features h2 {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.4;
    margin-bottom: 32px;
  }

  .feature-list {
    list-style: none;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  .feature-list li {
    font-size: 16px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .feature-list li::before {
    content: '·';
    font-weight: 700;
    opacity: 0.3;
    flex-shrink: 0;
  }

  footer {
    border-top: 1px solid rgba(13,27,42,0.08);
    padding: 32px 40px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
    opacity: 0.4;
    max-width: 680px;
    margin: 0 auto;
  }

  footer a { text-decoration: none; }
  footer a:hover { opacity: 0.7; }

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
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
  }

  @media (max-width: 600px) {
    nav { padding: 20px 24px; }
    .hero { padding: 60px 24px 60px; }
    .hero h1 { font-size: 36px; }
    .hero p { font-size: 17px; }
    .features { padding: 48px 24px; }
    .feature-list { grid-template-columns: 1fr; }
    footer { padding: 24px; flex-direction: column; gap: 12px; text-align: center; }
    .page { padding: 60px 24px; }
  }
`

const Layout = ({ title, children }: { title: string; children: any }) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{title}</title>
      <style dangerouslySetInnerHTML={{ __html: css }} />
    </head>
    <body>
      <nav>
        <a href="/" class="logo">Fressh</a>
        <ul class="nav-links">
          <li><a href="/support">Support</a></li>
          <li><a href="/privacy">Privacy</a></li>
        </ul>
      </nav>
      {children}
    </body>
  </html>
)

app.get('/public/*', serveStatic({ root: './' }))

app.get('/', (c) =>
  c.html(
    <Layout title="Fressh — Clean RSS for your iPhone">
      <main>
        <div class="hero">
          <img src="/public/icon.png" alt="Fressh" class="app-icon" />
          <h1>Fresh RSS for your iPhone.</h1>
          <p>No algorithms. No ads. Just the feeds you subscribed to, in the order they were published.</p>
          <a href="https://apps.apple.com/app/id6770117291" class="app-store-btn">Download on the App Store</a>
        </div>
        <div class="features">
          <h2>Features</h2>
          <ul class="feature-list">
            <li>Subscribe to any RSS or Atom feed</li>
            <li>Import subscriptions via OPML</li>
            <li>Star articles to save for later</li>
            <li>Open full articles in Safari</li>
            <li>Share with the system share sheet</li>
            <li>Navigate articles without leaving the reader</li>
            <li>Mark articles read as you scroll</li>
            <li>No account required</li>
          </ul>
        </div>
      </main>
      <footer>
        <span>© {new Date().getFullYear()} Eladio Caritos</span>
        <span>
          <a href="/privacy">Privacy Policy</a>
          &nbsp;·&nbsp;
          <a href="/support">Support</a>
        </span>
      </footer>
    </Layout>
  )
)

app.get('/support', (c) =>
  c.html(
    <Layout title="Support — Fressh">
      <div class="page">
        <h1>Support</h1>

        <h2>Frequently Asked Questions</h2>
        <ul>
          <li>How do I add a feed? — Tap the + button and paste any RSS or Atom feed URL.</li>
          <li>How do I import from another reader? — Tap + and choose Import OPML, then select your .opml file.</li>
          <li>How do I star an article? — Open the article and tap the star icon in the top right.</li>
          <li>Can I read the full article? — Yes, tap the link icon to open it in Safari.</li>
          <li>Does Fressh require an account? — No. All your data stays on your device.</li>
          <li>How do I sync with the Fressh terminal app? — On first launch, choose Custom Path and point to a shared SQLite database.</li>
        </ul>

        <h2>Contact</h2>
        <p>For bugs, feature requests, or anything else, email me directly.</p>
        <a href="mailto:eladio@caritos.com" class="contact-link">eladio@caritos.com</a>
      </div>
    </Layout>
  )
)

app.get('/privacy', (c) =>
  c.html(
    <Layout title="Privacy Policy — Fressh">
      <div class="page">
        <h1>Privacy Policy</h1>

        <h2>Data Collection</h2>
        <p>Fressh does not collect, store, or transmit any personal information. There are no analytics, no crash reporting, and no third-party SDKs that track your usage.</p>

        <h2>Your Data</h2>
        <p>All data — including your feed subscriptions, articles, and starred items — is stored locally on your device and never sent to any server operated by us.</p>

        <h2>RSS Feeds</h2>
        <p>RSS feeds are fetched directly from the URLs you provide. Your device connects to those feed servers directly, and those servers may log your IP address as part of normal web server operation. We have no control over third-party servers.</p>

        <h2>Changes</h2>
        <p>If this policy changes, the updated version will be posted at this URL.</p>

        <h2>Contact</h2>
        <p>Questions about privacy: <a href="mailto:eladio@caritos.com">eladio@caritos.com</a></p>

        <p style="opacity: 0.4; font-size: 13px; margin-top: 48px;">Last updated: May 2026</p>
      </div>
    </Layout>
  )
)

export default {
  port: 8020,
  fetch: app.fetch,
}
