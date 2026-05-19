import { XMLParser } from 'fast-xml-parser';

interface OpmlOutline {
  '@_xmlUrl'?: string;
  '@_htmlUrl'?: string;
  '@_title'?: string;
  '@_text'?: string;
  outline?: OpmlOutline | OpmlOutline[];
}

export function parseOpml(xml: string): { url: string; title?: string; siteUrl?: string }[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'outline',
  });
  const result = parser.parse(xml);
  if (!result?.opml?.body?.outline) return [];
  const feeds: { url: string; title?: string; siteUrl?: string }[] = [];
  extractFeeds(result.opml.body.outline, feeds);
  return feeds;
}

function extractFeeds(
  outlines: OpmlOutline | OpmlOutline[],
  feeds: { url: string; title?: string; siteUrl?: string }[]
): void {
  const list = Array.isArray(outlines) ? outlines : [outlines];
  for (const item of list) {
    if (item['@_xmlUrl']) {
      feeds.push({
        url: item['@_xmlUrl'],
        title: item['@_title'] || item['@_text'] || undefined,
        siteUrl: item['@_htmlUrl'] || undefined,
      });
    }
    if (item.outline) {
      extractFeeds(item.outline, feeds);
    }
  }
}

export function buildOpml(
  feeds: { url: string; title?: string | null; site_url?: string | null }[]
): string {
  const outlines = feeds
    .map((f) => {
      const text = escapeXml(f.title || f.url);
      const xmlUrl = escapeXml(f.url);
      const htmlUrl = f.site_url ? ` htmlUrl="${escapeXml(f.site_url)}"` : '';
      return `    <outline type="rss" text="${text}" title="${text}" xmlUrl="${xmlUrl}"${htmlUrl}/>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Fressh Subscriptions</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${outlines}
  </body>
</opml>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
