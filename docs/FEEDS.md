# Supported Feed Types

The RSS daemon automatically detects and converts URLs from popular platforms.

## YouTube Channels

**Any of these formats work:**

```bash
./rss add "https://www.youtube.com/@username"
./rss add "https://www.youtube.com/c/ChannelName"
./rss add "https://www.youtube.com/channel/UCxxxxxxxxxx"
```

**Auto-converts to:**
```
https://www.youtube.com/feeds/videos.xml?channel_id=UCxxxxxxxxxx
```

**Example:**
```bash
$ ./rss test "https://www.youtube.com/@kurzgesagt"

🎥 YouTube channel detected: https://www.youtube.com/@kurzgesagt
Converting to RSS feed URL...
✅ Correct RSS feed URL:
   https://www.youtube.com/feeds/videos.xml?channel_id=UCsXVk37bltHxD1rDPwtNM8Q
```

---

## Reddit Subreddits

**Any of these formats work:**

```bash
./rss add "https://www.reddit.com/r/subreddit"
./rss add "https://www.reddit.com/r/subreddit/"
```

**Auto-converts to:**
```
https://www.reddit.com/r/subreddit/top/.rss?t=week
```

**Example:**
```bash
$ ./rss test "https://www.reddit.com/r/programming"

🔴 Reddit subreddit detected: https://www.reddit.com/r/programming
Converting to RSS feed URL...
✅ Correct RSS feed URL:
   https://www.reddit.com/r/programming/top/.rss?t=week
```

**What you get:**
- **Top 25 most upvoted posts from this week**
- Only popular content - filters out noise
- Includes title, link, and post metadata
- Perfect for staying current without information overload

---

## Regular RSS/Atom Feeds

**Standard RSS feeds work as-is:**

```bash
./rss add "https://example.com/feed.xml"
./rss add "https://example.com/rss"
./rss add "https://example.com/atom.xml"
```

**Supported formats:**
- RSS 2.0
- RSS 1.0
- Atom 1.0
- JSON Feed (limited support)

**Example:**
```bash
$ ./rss add "https://xkcd.com/rss.xml"

Checking for duplicates... ✓ Not found
Validating feed...
✅ Added feed: xkcd.com
```

---

## Testing Before Adding

Always test a feed first to see what you'll get:

```bash
# Test any URL
./rss test "https://www.reddit.com/r/10s"

# Shows:
# - Detected platform (YouTube/Reddit/Regular)
# - Correct RSS feed URL
# - Feed title and site URL
# - Number of articles available
# - Preview of recent articles
```

---

## Common Feed Sources

### News Sites
```bash
./rss add "https://feeds.npr.org/1001/rss.xml"        # NPR News
./rss add "https://feeds.arstechnica.com/arstechnica/index"  # Ars Technica
./rss add "https://news.ycombinator.com/rss"         # Hacker News
```

### Blogs
```bash
./rss add "https://daringfireball.net/feeds/main"   # Daring Fireball
./rss add "https://xkcd.com/rss.xml"                  # XKCD
```

### YouTube Channels
```bash
./rss add "https://www.youtube.com/@3blue1brown"     # Math videos
./rss add "https://www.youtube.com/@veritasium"      # Science
./rss add "https://www.youtube.com/@kurzgesagt"      # Explanations
```

### Reddit Communities
```bash
./rss add "https://www.reddit.com/r/programming"     # Programming
./rss add "https://www.reddit.com/r/technology"      # Tech news
./rss add "https://www.reddit.com/r/science"         # Science
```

---

## Troubleshooting

### Feed Not Working?

1. **Test it first:**
   ```bash
   ./rss test "https://feed.url"
   ```

2. **Common issues:**
   - **YouTube**: Make sure it's a channel URL, not a video URL
   - **Reddit**: Must be a subreddit URL (`/r/name`), not user profile
   - **Regular feeds**: Some sites don't offer RSS feeds

3. **Check the error:**
   - `404` = Feed URL doesn't exist
   - `Parse error` = Not a valid RSS/Atom feed
   - `Timeout` = Site is slow or blocking requests

### Finding RSS Feeds

Most sites have RSS feeds but don't advertise them:

```bash
# Try common patterns:
https://example.com/feed
https://example.com/rss
https://example.com/feed.xml
https://example.com/atom.xml

# Look in page source for:
<link rel="alternate" type="application/rss+xml" href="...">
```

---

## Performance Notes

**Feed Refresh Rates:**
- YouTube: Every 10 minutes (daemon interval)
- Reddit: Every 10 minutes (daemon interval)
- Regular RSS: Every 10 minutes (daemon interval)

**HTTP Caching:**
The daemon uses HTTP caching (ETags, Last-Modified) to avoid re-downloading unchanged feeds:
- If feed hasn't changed: "Not Modified" (fast, no download)
- If feed has new content: Download and parse (normal speed)

**Concurrent Fetching:**
- Max 5 feeds fetched in parallel
- Prevents overwhelming servers
- All 561 feeds fetched in ~10-15 seconds
