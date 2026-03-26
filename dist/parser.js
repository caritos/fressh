import Parser from 'rss-parser';
import { logger } from './logger.js';
const parser = new Parser({
    customFields: {
        item: [
            ['content:encoded', 'contentEncoded'],
            ['description', 'description'],
            ['summary', 'summary'],
        ],
    },
});
export async function parseFeed(feedContent) {
    try {
        const feed = await parser.parseString(feedContent);
        if (!feed || !feed.items) {
            logger.error('Invalid feed structure - no items found');
            return null;
        }
        const articles = [];
        for (const item of feed.items) {
            const anyItem = item;
            // Generate guid - prefer item.id, fallback to link, then title
            const guid = item.guid || anyItem.id || item.link || item.title || `${Date.now()}-${Math.random()}`;
            // Extract content in order of preference
            const contentHtml = anyItem.contentEncoded || item.content || anyItem.description || '';
            const summary = anyItem.summary || item.contentSnippet || '';
            // Parse published date
            let publishedAt;
            if (item.pubDate) {
                publishedAt = new Date(item.pubDate);
                // Validate date
                if (isNaN(publishedAt.getTime())) {
                    publishedAt = undefined;
                }
            }
            if (!publishedAt && item.isoDate) {
                publishedAt = new Date(item.isoDate);
                if (isNaN(publishedAt.getTime())) {
                    publishedAt = undefined;
                }
            }
            articles.push({
                guid,
                title: item.title,
                url: item.link,
                author: item.creator || anyItem.author,
                content_html: contentHtml,
                content_text: stripHtml(contentHtml),
                summary,
                published_at: publishedAt || new Date(),
            });
        }
        return {
            title: feed.title,
            siteUrl: feed.link,
            articles,
        };
    }
    catch (error) {
        if (error instanceof Error) {
            logger.error(`Error parsing feed: ${error.message}`);
        }
        else {
            logger.error('Error parsing feed:', error);
        }
        return null;
    }
}
function stripHtml(html) {
    if (!html)
        return '';
    // Simple HTML stripping - remove tags
    return html
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
}
//# sourceMappingURL=parser.js.map