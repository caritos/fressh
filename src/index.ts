#!/usr/bin/env bun

import { Command } from 'commander';
import {
  handleImport,
  handleExport,
  handleAdd,
  handleRemove,
  handleStats,
  handleMarkAllRead,
  handleMarkFeedRead,
  handleCleanup,
  handleDeleteShorts,
  handleRemoveDuplicates,
  handleRebuildSearchIndex,
  handleRefresh,
  handleStart,
  handleTest,
  handleLogs,
  handleList,
  handleView,
  handleRead
} from './cli.js';

const program = new Command();

program
  .name('fressh')
  .description('Fresh RSS - Lightweight RSS daemon and TUI reader for macOS')
  .version('1.0.0');

program
  .command('start')
  .description('Start the RSS daemon')
  .action(handleStart);

program
  .command('import <file>')
  .description('Import feeds from OPML file')
  .action(handleImport);

program
  .command('export [file]')
  .description('Export feeds to OPML file (defaults to subscriptions.opml)')
  .action(handleExport);

program
  .command('add <url>')
  .description('Add a single feed')
  .action(handleAdd);

program
  .command('remove <url>')
  .description('Remove a feed')
  .action(handleRemove);

program
  .command('stats')
  .description('Show feed and article statistics')
  .action(handleStats);

program
  .command('mark-all-read')
  .description('Mark all articles as read')
  .action(handleMarkAllRead);

program
  .command('mark-feed-read <url>')
  .description('Mark all articles from a specific feed as read')
  .action(handleMarkFeedRead);

program
  .command('cleanup')
  .description('Delete old read articles')
  .option('-d, --days <days>', 'Delete articles older than N days', '30')
  .action((options) => handleCleanup(parseInt(options.days, 10)));

program
  .command('delete-shorts')
  .description('Delete all YouTube Shorts from the database')
  .action(handleDeleteShorts);

program
  .command('remove-duplicates')
  .description('Remove duplicate URLs from the database')
  .action(handleRemoveDuplicates);

program
  .command('refresh')
  .description('Force refresh all feeds')
  .action(handleRefresh);

program
  .command('test <url>')
  .description('Test if an RSS feed is valid')
  .action(handleTest);

program
  .command('list')
  .description('List all feeds')
  .action(handleList);

program
  .command('logs')
  .description('View daemon logs')
  .option('-f, --follow', 'Follow log output (like tail -f)')
  .option('-n, --lines <number>', 'Number of lines to show', '50')
  .action((options) => handleLogs({
    follow: options.follow,
    lines: parseInt(options.lines, 10)
  }));

program
  .command('view')
  .description('Interactive TUI for browsing articles')
  .action(handleView);

program
  .command('read')
  .description('List recent articles in the terminal')
  .option('-l, --limit <number>', 'Number of articles to show', '20')
  .option('-u, --unread', 'Show only unread articles', true)
  .action((options) => handleRead({
    limit: parseInt(options.limit, 10),
    unread: options.unread
  }));

program
  .command('rebuild-search')
  .description('Rebuild the full-text search index')
  .action(handleRebuildSearchIndex);

program.parse();
