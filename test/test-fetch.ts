import { fetchFeed } from '../src/fetcher.js';
import { parseFeed } from '../src/parser.js';
import { logger } from '../src/logger.js';

logger.setLevel('debug');

const testUrl = process.argv[2] || 'https://daringfireball.net/feeds/json';

console.log(`🧪 Testing Feed Fetcher & Parser\n`);
console.log(`Fetching: ${testUrl}\n`);

try {
  const result = await fetchFeed(testUrl);

  if (!result) {
    console.error('❌ Failed to fetch feed');
    process.exit(1);
  }

  console.log(`✓ Fetched successfully (${result.data.length} bytes)`);
  console.log(`  Status: ${result.status}`);
  console.log(`  ETag: ${result.etag || 'none'}`);
  console.log(`  Last-Modified: ${result.lastModified || 'none'}\n`);

  console.log('Parsing feed...\n');

  const parsed = await parseFeed(result.data);

  if (!parsed) {
    console.error('❌ Failed to parse feed');
    process.exit(1);
  }

  console.log(`✓ Parsed successfully`);
  console.log(`  Title: ${parsed.title}`);
  console.log(`  Site URL: ${parsed.siteUrl}`);
  console.log(`  Articles: ${parsed.articles.length}\n`);

  if (parsed.articles.length > 0) {
    console.log('First article:');
    const first = parsed.articles[0];
    console.log(`  Title: ${first.title}`);
    console.log(`  URL: ${first.url}`);
    console.log(`  Author: ${first.author || 'unknown'}`);
    console.log(`  Published: ${first.published_at}`);
    console.log(`  GUID: ${first.guid}`);
    console.log(`  Content length: ${first.content_html?.length || 0} chars`);
  }

  console.log('\n✅ Fetch and parse test passed!');
} catch (error) {
  console.error('❌ Test failed:', error);
  process.exit(1);
}
