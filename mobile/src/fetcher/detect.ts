export type DetectResult =
  | { type: 'rss'; url: string }
  | { type: 'reddit'; url: string }
  | { type: 'youtube'; originalUrl: string };

export function detectFeedType(input: string): DetectResult {
  const url = input.trim();

  // Already a YouTube RSS feed — pass through
  if (url.includes('youtube.com/feeds/videos.xml')) {
    return { type: 'rss', url };
  }

  // Reddit subreddit URL
  const redditMatch = url.match(/reddit\.com\/r\/([a-zA-Z0-9_]+)\/?$/);
  if (redditMatch) {
    return {
      type: 'reddit',
      url: `https://www.reddit.com/r/${redditMatch[1]}/top/.rss?t=month&limit=10`,
    };
  }

  // YouTube channel URL (handle, /c/, or /channel/)
  if (url.includes('youtube.com') && !url.includes('/feeds/')) {
    return { type: 'youtube', originalUrl: url };
  }

  return { type: 'rss', url };
}
