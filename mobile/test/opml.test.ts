import { expect, test, describe } from 'bun:test';
import { parseOpml, buildOpml } from '../src/fetcher/opml';

const SIMPLE_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Test</title></head>
  <body>
    <outline type="rss" text="Feed One" title="Feed One"
      xmlUrl="https://example.com/feed.xml" htmlUrl="https://example.com"/>
    <outline type="rss" text="Feed Two" title="Feed Two"
      xmlUrl="https://other.com/rss"/>
  </body>
</opml>`;

const NESTED_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Nested</title></head>
  <body>
    <outline text="Tech">
      <outline type="rss" text="Inner Feed" title="Inner Feed"
        xmlUrl="https://inner.com/feed.xml"/>
    </outline>
    <outline type="rss" text="Top Feed" title="Top Feed"
      xmlUrl="https://top.com/feed.xml"/>
  </body>
</opml>`;

describe('parseOpml', () => {
  test('parses flat list of feeds', () => {
    const feeds = parseOpml(SIMPLE_OPML);
    expect(feeds).toHaveLength(2);
    expect(feeds[0]).toEqual({
      url: 'https://example.com/feed.xml',
      title: 'Feed One',
      siteUrl: 'https://example.com',
    });
    expect(feeds[1]).toEqual({
      url: 'https://other.com/rss',
      title: 'Feed Two',
      siteUrl: undefined,
    });
  });

  test('flattens nested category outlines', () => {
    const feeds = parseOpml(NESTED_OPML);
    expect(feeds).toHaveLength(2);
    const urls = feeds.map(f => f.url);
    expect(urls).toContain('https://inner.com/feed.xml');
    expect(urls).toContain('https://top.com/feed.xml');
  });

  test('returns empty array for OPML with no feeds', () => {
    const xml = `<?xml version="1.0"?><opml version="2.0"><head/><body/></opml>`;
    expect(parseOpml(xml)).toEqual([]);
  });

  test('throws on invalid XML', () => {
    expect(() => parseOpml('not xml at all <unclosed')).toThrow();
  });
});

describe('buildOpml', () => {
  test('produces valid OPML with feed entries', () => {
    const xml = buildOpml([
      { url: 'https://a.com/feed', title: 'A Feed', site_url: 'https://a.com' },
      { url: 'https://b.com/rss', title: null, site_url: null },
    ]);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<opml');
    expect(xml).toContain('xmlUrl="https://a.com/feed"');
    expect(xml).toContain('xmlUrl="https://b.com/rss"');
    expect(xml).toContain('text="A Feed"');
  });

  test('escapes special characters in titles and URLs', () => {
    const xml = buildOpml([
      { url: 'https://a.com/feed?x=1&y=2', title: 'A & B <feed>', site_url: null },
    ]);
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&lt;');
    expect(xml).not.toContain('A & B');
  });

  test('round-trips through parseOpml', () => {
    const original = [
      { url: 'https://a.com/feed', title: 'Alpha', site_url: 'https://a.com' },
      { url: 'https://b.com/rss', title: 'Beta', site_url: null },
    ];
    const xml = buildOpml(original);
    const parsed = parseOpml(xml);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].url).toBe('https://a.com/feed');
    expect(parsed[0].title).toBe('Alpha');
    expect(parsed[1].url).toBe('https://b.com/rss');
  });
});
