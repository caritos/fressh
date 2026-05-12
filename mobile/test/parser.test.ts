import { expect, test } from 'bun:test';
import { parseFeed } from '../src/fetcher/parser';

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <item>
      <title>First Article</title>
      <link>https://example.com/1</link>
      <guid>https://example.com/1</guid>
      <pubDate>Mon, 12 May 2026 10:00:00 GMT</pubDate>
      <author>Alice</author>
      <description>A short summary</description>
    </item>
    <item>
      <title>Second Article</title>
      <link>https://example.com/2</link>
      <guid>guid-2</guid>
      <pubDate>Sun, 11 May 2026 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <link href="https://atom.example.com"/>
  <entry>
    <id>urn:atom:1</id>
    <title>Atom Article</title>
    <link href="https://atom.example.com/1"/>
    <published>2026-05-12T10:00:00Z</published>
    <author><name>Bob</name></author>
    <summary>Atom summary</summary>
  </entry>
</feed>`;

const EMPTY_FEED = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Empty</title></channel></rss>`;

const MALFORMED_DATE_FEED = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Bad Dates</title>
    <item>
      <title>No date</title>
      <link>https://example.com/noddate</link>
      <guid>no-date-1</guid>
    </item>
  </channel>
</rss>`;

test('parses RSS 2.0 feed title and site URL', async () => {
  const result = await parseFeed(RSS_FIXTURE);
  expect(result).not.toBeNull();
  expect(result!.title).toBe('Test Feed');
  expect(result!.siteUrl).toBe('https://example.com');
});

test('parses RSS 2.0 articles', async () => {
  const result = await parseFeed(RSS_FIXTURE);
  expect(result!.articles).toHaveLength(2);
  const first = result!.articles[0];
  expect(first.title).toBe('First Article');
  expect(first.url).toBe('https://example.com/1');
  expect(first.guid).toBe('https://example.com/1');
  expect(first.author).toBeTruthy();
  expect(first.summary).toBeTruthy();
  expect(first.published_at).not.toBeNull();
});

test('falls back to link as guid when guid is missing', async () => {
  const feed = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
    <item><title>X</title><link>https://example.com/x</link></item>
  </channel></rss>`;
  const result = await parseFeed(feed);
  expect(result!.articles[0].guid).toBe('https://example.com/x');
});

test('parses Atom feed', async () => {
  const result = await parseFeed(ATOM_FIXTURE);
  expect(result).not.toBeNull();
  expect(result!.title).toBe('Atom Feed');
  expect(result!.articles).toHaveLength(1);
  expect(result!.articles[0].title).toBe('Atom Article');
  expect(result!.articles[0].url).toBe('https://atom.example.com/1');
  expect(result!.articles[0].guid).toBe('urn:atom:1');
});

test('returns empty articles array for feed with no items', async () => {
  const result = await parseFeed(EMPTY_FEED);
  expect(result).not.toBeNull();
  expect(result!.articles).toHaveLength(0);
});

test('returns null for non-feed content', async () => {
  const result = await parseFeed('<!DOCTYPE html><html><body>not a feed</body></html>');
  expect(result).toBeNull();
});

test('handles articles with no pubDate gracefully', async () => {
  const result = await parseFeed(MALFORMED_DATE_FEED);
  expect(result).not.toBeNull();
  expect(result!.articles).toHaveLength(1);
  // published_at is null or a Date string — should not throw
});

test('strips HTML from content_text', async () => {
  const feed = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
    <item><title>X</title><link>https://example.com/x</link><guid>x</guid>
      <description>&lt;p&gt;Hello &lt;b&gt;world&lt;/b&gt;&lt;/p&gt;</description>
    </item></channel></rss>`;
  const result = await parseFeed(feed);
  expect(result!.articles[0].content_text).not.toContain('<');
  expect(result!.articles[0].content_text).toContain('Hello');
});
