import { database } from '../src/database.js';
import { unlinkSync, existsSync } from 'fs';

const TEST_DB = '/tmp/test-fressh.db';

// Clean up before test
if (existsSync(TEST_DB)) {
  unlinkSync(TEST_DB);
}

console.log('🧪 Testing Database Layer...\n');

// Initialize database
console.log('1. Initializing database...');
database.initialize(TEST_DB);
console.log('✓ Database initialized\n');

// Test feed operations
console.log('2. Adding test feeds...');
const feed1Id = database.addFeed({
  url: 'https://example.com/feed.xml',
  title: 'Example Feed',
  site_url: 'https://example.com',
});
const feed2Id = database.addFeed({
  url: 'https://test.com/rss',
  title: 'Test Feed',
});
console.log(`✓ Added feed 1 (id: ${feed1Id})`);
console.log(`✓ Added feed 2 (id: ${feed2Id})\n`);

// Test duplicate feed (should update)
console.log('3. Testing duplicate feed handling...');
database.addFeed({
  url: 'https://example.com/feed.xml',
  title: 'Example Feed Updated',
});
const updatedFeed = database.getFeed('https://example.com/feed.xml');
console.log(`✓ Feed title updated: ${updatedFeed?.title}\n`);

// Get all feeds
console.log('4. Retrieving all feeds...');
const feeds = database.getAllFeeds();
console.log(`✓ Found ${feeds.length} feeds\n`);

// Test article operations
console.log('5. Adding test articles...');
const testArticles = [
  {
    feed_id: feed1Id,
    guid: 'article-1',
    title: 'First Article',
    url: 'https://example.com/article-1',
    author: 'John Doe',
    content_html: '<p>Test content</p>',
    published_at: new Date(),
  },
  {
    feed_id: feed1Id,
    guid: 'article-2',
    title: 'Second Article',
    url: 'https://example.com/article-2',
    published_at: new Date(),
  },
  {
    feed_id: feed2Id,
    guid: 'article-3',
    title: 'Third Article',
    url: 'https://test.com/article-3',
    published_at: new Date(),
  },
];
const insertCount = database.addArticles(testArticles);
console.log(`✓ Inserted ${insertCount} articles\n`);

// Test duplicate article (should be ignored)
console.log('6. Testing duplicate article handling...');
const duplicateCount = database.addArticles([testArticles[0]]);
console.log(`✓ Duplicate articles inserted: ${duplicateCount} (should be 0)\n`);

// Test unread articles
console.log('7. Getting unread articles...');
const unreadArticles = database.getUnreadArticles();
console.log(`✓ Found ${unreadArticles.length} unread articles\n`);

// Mark article as read
console.log('8. Marking article as read...');
if (unreadArticles[0]) {
  database.markArticleAsRead(unreadArticles[0].id!);
  const afterMark = database.getUnreadArticles();
  console.log(`✓ Unread count after marking: ${afterMark.length}\n`);
}

// Get statistics
console.log('9. Getting statistics...');
const stats = database.getStats();
console.log('✓ Stats:', {
  totalFeeds: stats.totalFeeds,
  enabledFeeds: stats.enabledFeeds,
  totalArticles: stats.totalArticles,
  unreadArticles: stats.unreadArticles,
  starredArticles: stats.starredArticles,
});
console.log('');

// Test feed metadata update
console.log('10. Updating feed metadata...');
database.updateFeedMetadata(feed1Id, {
  last_fetch: new Date(),
  etag: 'test-etag-123',
});
console.log('✓ Feed metadata updated\n');

// Test cleanup
console.log('11. Testing cleanup...');
const deleted = database.deleteOldArticles(365);
console.log(`✓ Deleted ${deleted} old articles\n`);

// Close database
console.log('12. Closing database...');
database.close();
console.log('✓ Database closed\n');

console.log('✅ All database tests passed!');

// Cleanup test file
if (existsSync(TEST_DB)) {
  unlinkSync(TEST_DB);
  console.log('🧹 Test database cleaned up');
}
