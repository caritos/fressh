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

## Guideline 2.1 Resubmission — Issue #7 (second rejection, RESOLVED)

Apple requested additional information before continuing the review. This was a second request; the notes below superseded the issue #6 notes. **Resubmitted and passed review — app is ready for distribution.** See also: [GitHub issue #7](https://github.com/caritos/fressh/issues/7) (closed).

### Checklist

- [x] **Screen recording on a physical iPhone** (not Simulator), latest iOS
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
  - Recorded on iPhone 13 Pro, iOS 26.5. File must use a lowercase `.mp4` extension — App Store Connect's upload validator rejected an uppercase `.MP4`.

- [x] **Document test device** — iPhone 13 Pro, iOS 26.5

- [x] **Update Notes field** in App Store Connect → App Review Information with the full text below
  - Original draft was 4385 characters — over App Store Connect's 4000-char limit. Trimmed to 2676 chars while keeping all 7 requested items; see below.

- [x] **Screenshots** — iPhone 17 Pro Max Simulator screenshots are natively 1320×2868, which App Store Connect rejected ("dimensions are wrong"). Resized to 1284×2778 (accepted 6.7" size) via `sips -z 2778 1284`; aspect ratio is close enough (0.4603 vs 0.4622) that the resize is visually lossless. See `docs/screenshots/20260708-resized/`.

---

### Notes for Reviewer — Issue #7 (paste into App Store Connect)

```
1. SCREEN RECORDING
The attached recording (iPhone 13 Pro, iOS 26.5) shows the full typical flow: launch, add a feed by URL, refresh, read an article, star, share, navigate with prev/next, and Settings (OPML import/export).

The app has no account/login, no paid content, subscriptions, or in-app purchases, and no user-generated content. It never requests camera, location, contacts, microphone, or other sensitive data, and does not use App Tracking Transparency.

2. DEVICES TESTED
iPhone 13 Pro, iOS 26.5 — tested on physical device before submission.

3. APP PURPOSE AND TARGET AUDIENCE
Fressh is a clean, minimal RSS/Atom feed reader for iPhone. It solves the problem of staying informed without algorithmic curation, ads, or engagement manipulation — users subscribe directly to sources they trust and read new articles in published order.

Audience: news readers, bloggers, developers, and anyone who prefers a private, account-free alternative to algorithmic news apps. Appropriate for all ages (4+). All data stays on-device — no server, no account, no tracking.

4. SETUP AND ACCESSING MAIN FEATURES
No login or account is required.

a. Open the app — feed list loads with Smart Feeds (All Unread, Starred, Today) and any added feeds.
b. Tap + → paste an RSS/Atom, YouTube channel, or Reddit subreddit URL → Add.
   Example: https://feeds.arstechnica.com/arstechnica/index
c. Pull to refresh to fetch new articles.
d. Tap a feed → tap an article to read it. Use ‹ › to navigate.
e. Use ★ (star) and ↑ (share) in the article header.
f. Swipe a row left (Star/Share) or right (Read/Unread).
g. Gear icon → Settings for OPML import/export.

No demo credentials needed.

5. EXTERNAL SERVICES
Direct network requests only, no Fressh server involved:
a. RSS/Atom feed servers — fetches feed XML from the subscribed URL directly.
b. YouTube RSS (youtube.com/feeds/videos.xml) — derived from the channel's public page; no API key or OAuth.
c. Reddit RSS (reddit.com/r/{subreddit}/top/.rss) — public feed, no account/API key.
d. Google Favicons API — display-only site icon lookup, no user data sent.

No analytics, crash reporting, ads, authentication, payments, or AI services are used.

NSAllowsArbitraryLoads is true because some RSS servers still serve HTTP; no user data is transmitted over these connections.

6. REGIONAL DIFFERENCES
None — identical functionality in all regions, no localization (English only).

7. REGULATED INDUSTRY / PROTECTED MATERIAL
Not applicable. No financial, medical, or legal content, and no third-party protected material beyond publicly accessible RSS/Atom feeds served directly from their publishers.
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
