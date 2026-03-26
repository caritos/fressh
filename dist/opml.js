import { readFileSync, writeFileSync } from 'fs';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { database } from './database.js';
import { logger } from './logger.js';
export function importOpml(filePath) {
    try {
        const content = readFileSync(filePath, 'utf-8');
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
        });
        const opml = parser.parse(content);
        if (!opml.opml || !opml.opml.body) {
            throw new Error('Invalid OPML structure');
        }
        const feeds = [];
        extractFeeds(opml.opml.body.outline, feeds);
        logger.info(`Found ${feeds.length} feeds in OPML`);
        let imported = 0;
        let skipped = 0;
        let errors = 0;
        for (const feed of feeds) {
            try {
                // Check if feed already exists
                const existing = database.getFeed(feed.url);
                if (existing) {
                    skipped++;
                    logger.debug(`Skipping existing feed: ${feed.url}`);
                    continue;
                }
                database.addFeed({
                    url: feed.url,
                    title: feed.title,
                    site_url: feed.siteUrl,
                });
                imported++;
                logger.debug(`Imported: ${feed.title || feed.url}`);
            }
            catch (error) {
                errors++;
                logger.error(`Error importing ${feed.url}:`, error);
            }
        }
        return { imported, skipped, errors };
    }
    catch (error) {
        logger.error('Error parsing OPML:', error);
        throw error;
    }
}
function extractFeeds(outline, feeds) {
    const outlines = Array.isArray(outline) ? outline : [outline];
    for (const item of outlines) {
        // If this outline has an xmlUrl, it's a feed
        if (item['@_xmlUrl']) {
            feeds.push({
                url: item['@_xmlUrl'],
                title: item['@_title'] || item['@_text'],
                siteUrl: item['@_htmlUrl'],
            });
        }
        // Recursively process nested outlines (categories)
        if (item.outline) {
            extractFeeds(item.outline, feeds);
        }
    }
}
export function exportOpml(outputPath) {
    const feeds = database.getAllFeeds();
    const outlines = feeds.map((feed) => ({
        '@_type': 'rss',
        '@_text': feed.title || feed.url,
        '@_title': feed.title || feed.url,
        '@_xmlUrl': feed.url,
        '@_htmlUrl': feed.site_url || '',
    }));
    const opml = {
        opml: {
            head: {
                title: 'RSS Daemon Subscriptions',
                dateCreated: new Date().toUTCString(),
            },
            body: {
                outline: outlines,
            },
        },
    };
    const builder = new XMLBuilder({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        format: true,
    });
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + builder.build(opml);
    writeFileSync(outputPath, xml, 'utf-8');
    logger.info(`Exported ${feeds.length} feeds to ${outputPath}`);
    return feeds.length;
}
//# sourceMappingURL=opml.js.map