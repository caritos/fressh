import { expect, test } from 'bun:test';
import { detectFeedType } from '../src/fetcher/detect';

test('passes through a plain RSS URL unchanged', () => {
  const result = detectFeedType('https://xkcd.com/rss.xml');
  expect(result).toEqual({ type: 'rss', url: 'https://xkcd.com/rss.xml' });
});

test('trims whitespace from input', () => {
  const result = detectFeedType('  https://xkcd.com/rss.xml  ');
  expect(result).toEqual({ type: 'rss', url: 'https://xkcd.com/rss.xml' });
});

test('converts reddit subreddit URL to RSS', () => {
  const result = detectFeedType('https://www.reddit.com/r/programming');
  expect(result).toEqual({
    type: 'reddit',
    url: 'https://www.reddit.com/r/programming/top/.rss?t=month&limit=10',
  });
});

test('converts reddit subreddit URL with trailing slash', () => {
  const result = detectFeedType('https://www.reddit.com/r/tennis/');
  expect(result).toEqual({
    type: 'reddit',
    url: 'https://www.reddit.com/r/tennis/top/.rss?t=month&limit=10',
  });
});

test('detects YouTube handle URL', () => {
  const result = detectFeedType('https://www.youtube.com/@veritasium');
  expect(result).toEqual({
    type: 'youtube',
    originalUrl: 'https://www.youtube.com/@veritasium',
  });
});

test('detects YouTube channel URL', () => {
  const result = detectFeedType('https://www.youtube.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA');
  expect(result).toEqual({
    type: 'youtube',
    originalUrl: 'https://www.youtube.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA',
  });
});

test('detects YouTube /c/ URL', () => {
  const result = detectFeedType('https://www.youtube.com/c/Kurzgesagt');
  expect(result).toEqual({ type: 'youtube', originalUrl: 'https://www.youtube.com/c/Kurzgesagt' });
});

test('passes through an already-converted YouTube feed URL', () => {
  const feedUrl = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsXVk37bltHxD1rDPwtNM8Q';
  const result = detectFeedType(feedUrl);
  expect(result).toEqual({ type: 'rss', url: feedUrl });
});
