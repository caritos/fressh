import Parser from 'rss-parser';

const rssParser = new Parser({
  customFields: {
    item: [
      ['content:encoded', 'contentEncoded'],
      ['description', 'description'],
      ['summary', 'summary'],
    ],
  },
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

function isHtmlPage(content: string): boolean {
  const t = content.trim().slice(0, 500).toLowerCase();
  return t.startsWith('<!doctype html') || t.startsWith('<html') || t.includes('<head>') || t.includes('<body>');
}

function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(value: string | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function parseFeed(content: string): Promise<ParsedFeed | null> {
  if (isHtmlPage(content)) return null;

  try {
    const feed = await rssParser.parseString(content);
    if (!feed) return null;

    const articles: ParsedArticle[] = (feed.items ?? []).map((item) => {
      const any = item as any;
      const contentHtml = any.contentEncoded || item.content || any.description || '';
      const summary = any.summary || item.contentSnippet || '';
      const guid = item.guid || any.id || item.link || item.title || String(Math.random());

      return {
        guid,
        title: item.title ?? null,
        url: item.link ?? null,
        author: item.creator || any.author || null,
        content_html: contentHtml || null,
        content_text: stripHtml(contentHtml) || null,
        summary: summary || null,
        published_at: parseDate(item.pubDate || item.isoDate),
      };
    });

    return {
      title: feed.title ?? null,
      siteUrl: feed.link ?? null,
      articles,
    };
  } catch {
    return null;
  }
}
