import { XMLParser } from 'fast-xml-parser';
import { isHtmlPage, stripHtml } from '../../../shared/html';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => ['item', 'entry'].includes(name),
  cdataPropName: '__cdata',
  parseTagValue: false,
  trimValues: true,
});

export interface ParsedArticle {
  guid: string;
  title: string | null;
  url: string | null;
  author: string | null;
  content_html: string | null;
  content_text: string | null;
  summary: string | null;
  published_at: string | null;
}

export interface ParsedFeed {
  title: string | null;
  siteUrl: string | null;
  articles: ParsedArticle[];
}

function parseDate(value: string | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function textOf(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    const v = val as Record<string, unknown>;
    if (v['__cdata']) return String(v['__cdata']);
    if (v['#text']) return String(v['#text']);
  }
  return String(val);
}

function parseRss(channel: Record<string, unknown>): ParsedFeed {
  const items: Record<string, unknown>[] = (channel['item'] as Record<string, unknown>[]) ?? [];
  const articles: ParsedArticle[] = items.map((item) => {
    const contentHtml = textOf(item['content:encoded']) || textOf(item['description']) || '';
    const summary = textOf(item['summary']) || textOf(item['description']) || '';
    const guid = textOf(item['guid']) || textOf(item['link']) || textOf(item['title']) || String(Math.random());
    const authorObj = item['author'] ?? item['dc:creator'];
    const author = textOf(authorObj);

    return {
      guid,
      title: textOf(item['title']) || null,
      url: textOf(item['link']) || null,
      author: author || null,
      content_html: contentHtml || null,
      content_text: stripHtml(contentHtml) || null,
      summary: summary || null,
      published_at: parseDate(textOf(item['pubDate']) || textOf(item['dc:date']) || undefined),
    };
  });

  return {
    title: textOf(channel['title']) || null,
    siteUrl: textOf(channel['link']) || null,
    articles,
  };
}

function atomLink(linkVal: unknown): string | null {
  if (!linkVal) return null;
  if (Array.isArray(linkVal)) {
    const alt = (linkVal as Record<string, unknown>[]).find(
      (l) => !l['@_rel'] || l['@_rel'] === 'alternate'
    );
    return textOf(alt?.['@_href']) || null;
  }
  if (typeof linkVal === 'object') {
    return textOf((linkVal as Record<string, unknown>)['@_href']) || null;
  }
  return textOf(linkVal) || null;
}

function parseAtom(feed: Record<string, unknown>): ParsedFeed {
  const entries: Record<string, unknown>[] = (feed['entry'] as Record<string, unknown>[]) ?? [];
  const articles: ParsedArticle[] = entries.map((entry) => {
    // YouTube feeds store description in media:group/media:description
    const mediaGroup = entry['media:group'] as Record<string, unknown> | undefined;
    const mediaDesc = mediaGroup ? textOf(mediaGroup['media:description']) : '';

    const contentObj = entry['content'] ?? entry['summary'];
    const contentHtml = textOf(contentObj) || mediaDesc;
    const summary = textOf(entry['summary']) || mediaDesc;

    // YouTube feeds: use yt:videoId to build a canonical watch URL
    const ytVideoId = textOf(entry['yt:videoId']);
    const linkUrl = atomLink(entry['link']);
    const url = ytVideoId
      ? `https://www.youtube.com/watch?v=${ytVideoId}`
      : linkUrl;

    const authorObj = entry['author'];
    const author = authorObj
      ? textOf((authorObj as Record<string, unknown>)['name']) || textOf(authorObj)
      : null;

    const guid =
      textOf(entry['id']) || url || textOf(entry['title']) || String(Math.random());

    return {
      guid,
      title: textOf(entry['title']) || null,
      url,
      author: author || null,
      content_html: contentHtml || null,
      content_text: stripHtml(contentHtml) || null,
      summary: summary || null,
      published_at: parseDate(textOf(entry['published']) || textOf(entry['updated']) || undefined),
    };
  });

  const siteUrl = atomLink(feed['link']);

  return {
    title: textOf(feed['title']) || null,
    siteUrl,
    articles,
  };
}

export async function parseFeed(content: string): Promise<ParsedFeed | null> {
  if (isHtmlPage(content)) return null;

  try {
    const doc = xmlParser.parse(content) as Record<string, unknown>;

    // RSS 2.0 / RSS 1.0
    const rss = doc['rss'] as Record<string, unknown> | undefined;
    if (rss) {
      const channel = rss['channel'] as Record<string, unknown> | undefined;
      if (channel) return parseRss(channel);
    }

    // RSS 1.0 (RDF)
    const rdf = (doc['rdf:RDF'] ?? doc['RDF']) as Record<string, unknown> | undefined;
    if (rdf) {
      const channel = rdf['channel'] as Record<string, unknown> | undefined;
      if (channel) return parseRss({ ...channel, item: rdf['item'] });
    }

    // Atom
    const feed = doc['feed'] as Record<string, unknown> | undefined;
    if (feed) return parseAtom(feed);

    return null;
  } catch {
    return null;
  }
}
