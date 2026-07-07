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

## Guideline 2.1 Resubmission — Issue #7 (second rejection)

Apple requested additional information before continuing the review. This is a second request; the notes below supersede the issue #6 notes. See also: [GitHub issue #7](https://github.com/caritos/fressh/issues/7)

### Checklist

- [ ] **Screen recording on a physical iPhone** (not Simulator), latest iOS
  - Start from launching the app cold from the home screen
  - Show the feed list (Smart Feeds + user feeds, unread counts)
  - Tap **+** → paste an RSS URL (e.g. `https://feeds.arstechnica.com/arstechnica/index`) → confirm
  - Pull-to-refresh → show progress bar and new article count
  - Tap a feed → tap an article → read it → use prev/next nav buttons
  - Show the star and share buttons in the article header
  - Go back → swipe an article row left (Star / Share) and right (Read/Unread)
  - Gear icon → Settings → show OPML Import and Export rows
  - **Note for reviewer screen capture:** explicitly show that there is NO login screen, NO purchase flow, NO camera/location/contacts prompt at any point
  - Upload in App Store Connect → App Review Information → Attachments

- [x] **Document test device** — iPhone 13 Pro, iOS 26.5

- [ ] **Update Notes field** in App Store Connect → App Review Information with the full text below

---

### Notes for Reviewer — Issue #7 (paste into App Store Connect)

```
1. SCREEN RECORDING
The attached screen recording was captured on iPhone 13 Pro, iOS 26.5 and shows the complete typical user flow: launching the app, adding a feed by URL, refreshing to fetch new articles, reading an article, starring an article, sharing, navigating between articles with the prev/next bar, and accessing Settings for OPML import/export.

The app has no account registration or login flow. There is no paid content, no subscription, and no in-app purchase. There is no user-generated content. The app never requests access to camera, location, contacts, microphone, or any sensitive data, and does not use App Tracking Transparency.

2. DEVICES TESTED
iPhone 13 Pro, iOS 26.5 — tested on physical device before submission

3. APP PURPOSE AND TARGET AUDIENCE
Fressh is a clean, minimal RSS/Atom feed reader for iPhone. It solves the problem of staying informed without algorithmic curation, advertising, or engagement manipulation: users subscribe directly to sources they trust and read new articles in the order they were published.

Target audience: news readers, bloggers, developers, and anyone who prefers a private, account-free alternative to algorithmic news apps. The app is appropriate for all ages (4+).

The core value Fressh provides:
- Full control over what you read — no algorithm, no feed manipulation
- Privacy — all data is stored locally on-device; no server, no account, no tracking
- Supports any public RSS, Atom, YouTube channel, or Reddit subreddit feed
- Clean reading experience with no ads, notifications, or dark patterns

4. SETUP AND ACCESSING MAIN FEATURES
No login or account is required at any point.

To access all core features:
a. Open the app — the feed list loads immediately with Smart Feeds (All Unread, Starred, Today) and any user-added feeds.
b. Tap the + button (top right) → paste any RSS/Atom feed URL, a YouTube channel URL, or a Reddit subreddit URL → tap Add.
   Example RSS feeds: https://feeds.arstechnica.com/arstechnica/index / https://xkcd.com/rss.xml
c. Pull down on the feed list to refresh all feeds and fetch new articles.
d. Tap any feed to see its article list.
e. Tap an article to read it. Use the ‹ › bar at the bottom to navigate between articles.
f. Use the ★ star and ↑ share buttons in the article header to save or share.
g. Swipe an article row left to Star/Share; swipe right to toggle Read/Unread.
h. Tap the gear icon (⚙) → Settings to import subscriptions via OPML or export them.

No demo credentials are needed.

5. EXTERNAL SERVICES
The app makes direct network requests only to the following services:

a. RSS/Atom feed servers — the app fetches feed XML directly from the URL the user subscribed to (e.g. arstechnica.com, xkcd.com). These are public feeds hosted by the content publishers. No Fressh server is involved.

b. YouTube RSS endpoint (youtube.com/feeds/videos.xml) — when a user adds a YouTube channel URL, the app fetches the channel's public HTML page to extract the channel ID, then constructs the standard YouTube RSS feed URL. No YouTube API key or OAuth is used; these are publicly accessible RSS feeds.

c. Reddit RSS endpoint (reddit.com/r/{subreddit}/top/.rss) — when a user adds a Reddit subreddit URL, the app requests Reddit's public RSS feed for that subreddit. No Reddit account or API key is required.

d. Google Favicons API (google.com/s2/favicons) — used to display the website icon (favicon) next to each feed in the list. This is a display-only request; no user data is transmitted.

No analytics, crash reporting, advertising networks, authentication services, payment processors, or AI services are used.

NSAllowsArbitraryLoads is set to true because some RSS feed servers still serve content over HTTP rather than HTTPS. The app does not collect, store, or transmit any user data over these connections.

6. REGIONAL DIFFERENCES
None. The app functions identically in all regions. There is no region-specific content, no geo-restricted features, and no localization — all UI is in English.

7. REGULATED INDUSTRY / PROTECTED MATERIAL
Fressh is not in a regulated industry. It does not offer financial advice, medical information, legal services, or any other regulated content. It does not display third-party protected material beyond publicly accessible RSS/Atom feeds served directly from their publishers' servers.
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
