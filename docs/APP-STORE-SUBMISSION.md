# App Store Submission — Fressh

Copy-paste reference for App Store Connect forms.

---

## App Information

**Name**
```
Fressh
```

**Subtitle** _(30 chars max)_
```
Clean RSS reader & news feeds
```

**Primary Category**
```
News
```

**Secondary Category**
```
Productivity
```

---

## 1.0 Prepare for Submission

### Promotional Text _(170 chars max, can be updated anytime without a new submission)_
```
No algorithms. No ads. Just the feeds you chose. Fressh is a clean, fast RSS reader for the news you actually care about.
```

### Description _(4000 chars max)_
```
Fressh is a clean, minimal RSS reader for iPhone. No algorithms deciding what you see. No ads. No engagement tricks. Just the feeds you subscribed to, in the order they were published.

Add any RSS or Atom feed by URL, or import your existing subscriptions from any reader using an OPML file. Fressh gets out of your way so you can read.

FEATURES

· Subscribe to any RSS or Atom feed
· Import subscriptions via OPML
· Star articles to save them for later
· Mark articles read as you scroll
· Open the full article in Safari with one tap
· Share articles with the system share sheet
· Navigate between articles without leaving the reader

DESIGNED FOR READING

Fressh uses a clean typographic layout built around legibility. No sidebars, no clutter, no dark patterns. Just headlines, summaries, and your feeds.

YOUR DATA, YOUR WAY

All data stays on your device. Export your subscriptions as an OPML file to back them up or move to another reader anytime. No account required, ever.
```

### Keywords _(100 chars max, comma-separated)_
```
rss,feed reader,news,atom,opml,headlines,blog,subscribe,aggregator,minimal,clean,news reader,tech
```

### Support URL
```
https://fressh.caritos.com/support
```

### Marketing URL _(optional)_
```
https://fressh.caritos.com
```

### Privacy Policy URL
```
https://fressh.caritos.com/privacy
```

---

## Guideline 2.1 Resubmission (review rejection 2026-05-21)

Apple requested additional information before continuing the review. All items below must be completed before resubmitting. See also: [GitHub issue #6](https://github.com/caritos/fressh/issues/6)

### Checklist

- [ ] **Screen recording on a physical iPhone** (not Simulator), latest iOS
  - Start from launching the app from the home screen
  - Show feed list with Smart Feeds and unread counts
  - Tap **+** → paste an RSS URL (e.g. `https://xkcd.com/rss.xml`) → confirm
  - Pull-to-refresh → show progress bar and new article count alert
  - Tap a feed → tap an article to read it
  - Navigate back → gear icon → Settings → show OPML Import and Export
  - Upload the recording in App Store Connect → App Review Information → Attachments

- [ ] **Document the test device** — note the iPhone model and iOS version used

- [ ] **Update the Notes field** in App Store Connect → App Review Information with the full text below

---

### Notes for Reviewer (full text — paste into App Store Connect)

```
PURPOSE
Fressh is a clean, minimal RSS reader for iPhone. Users subscribe to RSS, Atom, YouTube channel, and Reddit subreddit feeds and read new articles in a distraction-free interface. All data is stored locally on device — no server, no account, no tracking. Target audience: news readers, bloggers, and tech users who prefer a private, account-free alternative to algorithmic news apps.

SETUP
No login or account is required. To access the app's main features:
1. Open the app — the feed list loads immediately.
2. Tap + to add a feed. Paste any RSS/Atom URL, YouTube channel URL, or Reddit subreddit URL.
3. Pull down to refresh and fetch new articles.
4. Tap any feed to see its articles; tap an article to read it.
5. Tap the gear icon → Settings for OPML import/export.
No demo credentials are needed.

EXTERNAL SERVICES
- Direct HTTPS requests to RSS/Atom/JSON feed URLs (fetches feeds the user subscribed to from their source servers)
- YouTube RSS API (youtube.com/feeds/videos.xml) — resolves YouTube channel URLs to their RSS feed
- Reddit RSS feeds (reddit.com/r/[subreddit]/.rss) — used when the user adds a Reddit subreddit URL
- Google Favicons API (google.com/s2/favicons) — displays feed icons in the list
No analytics, crash reporting, advertising, authentication, or payment services are used.

REGIONAL DIFFERENCES
None. The app functions identically in all regions.

NSAllowsArbitraryLoads
NSAllowsArbitraryLoads is set because some RSS feed servers only support HTTP. The app does not collect or transmit any user data over these connections.
```

---

## App Review Information

**First Name**
```
Eladio
```

**Last Name**
```
Caritos
```

**Email**
```
eladio@caritos.com
```

**Phone** _(required — include country code)_
```

```

**Demo Account** _(username/password if login required)_
```
N/A — no account required
```

**Notes for Reviewer**
```
Fressh is an RSS reader. To test:
1. Tap the + button and add any RSS feed URL, e.g. https://feeds.arstechnica.com/arstechnica/index
2. Tap the feed to browse articles
3. Tap an article to open the reader view
4. Use the star icon to save an article
5. Use the share icon to share

No account or login is required. All data is stored locally on device.
```

---

## Pricing & Availability

**Price**
```
$0.99
```

**Availability**
```
All territories
```

---

## Version Release

**Version**
```
1.0
```

**Release type**
```
Manually release this version
```
_(Change to "Automatically release" once you're ready to go live)_

---

## Age Rating Questionnaire

Answer **No** to all questions → **4+** rating.

| Question | Answer |
|----------|--------|
| Made for Kids | No |
| Cartoon or Fantasy Violence | No |
| Realistic Violence | No |
| Sexual Content or Nudity | No |
| Profanity or Crude Humor | No |
| Medical/Treatment Information | No |
| Alcohol, Tobacco, or Drug Use | No |
| Simulated Gambling | No |
| Horror/Fear Themes | No |
| Mature/Suggestive Themes | No |
| Unrestrained Web Access | No |

---

## Checklist

- [ ] Subtitle filled in
- [ ] Category set (News / Productivity)
- [ ] Promotional text pasted
- [ ] Description pasted
- [ ] Keywords pasted
- [ ] Support URL: https://fressh.caritos.com/support
- [ ] Marketing URL: https://fressh.caritos.com
- [ ] Privacy Policy URL: https://fressh.caritos.com/privacy
- [ ] Screenshots uploaded (6.5" iPhone — at least 1 required)
- [ ] Age rating questionnaire completed
- [ ] App Review contact info filled in
- [ ] Build selected
- [ ] Submit for Review
