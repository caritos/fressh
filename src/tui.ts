import blessed from 'blessed';
import { database } from './database.js';
import type { Article } from './types.js';
import { spawn } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdir, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';

const execAsync = promisify(exec);

interface ArticleWithFeed extends Article {
  feed_title?: string;
}

interface FeedListItem {
  id: number | null; // null for "All" feed
  title: string;
  unreadCount: number;
}

export class ArticleViewer {
  private screen: blessed.Widgets.Screen;
  private feedList: blessed.Widgets.ListElement;
  private articleList: blessed.Widgets.ListElement;
  private articleDetail: blessed.Widgets.BoxElement;
  private statusBar: blessed.Widgets.BoxElement;
  private helpBox: blessed.Widgets.BoxElement;
  private searchBox: blessed.Widgets.TextboxElement;
  private feeds: FeedListItem[] = [];
  private articles: ArticleWithFeed[] = [];
  private selectedFeedIndex = 0;
  private selectedArticleIndex = 0;
  private showUnreadOnly = true;
  private showingHelp = false;
  private searchMode = false;
  private searchQuery = '';
  private currentPane: 'feeds' | 'articles' = 'articles';

  constructor() {
    // Create screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'fressh - RSS Article Viewer',
    });

    // Create feed list (left pane - 25% width)
    this.feedList = blessed.list({
      parent: this.screen,
      label: ' Feeds ',
      tags: true,
      top: 0,
      left: 0,
      width: '25%',
      height: '100%-1',
      border: {
        type: 'line',
      },
      style: {
        fg: 'white',
        selected: {
          bg: 'black',
          fg: 'yellow',
          bold: true,
        },
        border: {
          fg: 'cyan',
        },
      },
      keys: true,
      vi: true,
      mouse: true,
      scrollbar: {
        ch: '█',
        style: {
          fg: 'cyan',
        },
      },
    });

    // Create article list (middle pane - 35% width)
    this.articleList = blessed.list({
      parent: this.screen,
      label: ' Articles ',
      tags: true,
      top: 0,
      left: '25%',
      width: '35%',
      height: '100%-1',
      border: {
        type: 'line',
      },
      style: {
        fg: 'white',
        selected: {
          bg: 'black',
          fg: 'yellow',
          bold: true,
        },
        border: {
          fg: 'cyan',
        },
      },
      keys: true,
      vi: true,
      mouse: true,
      scrollbar: {
        ch: '█',
        style: {
          fg: 'cyan',
        },
      },
    });

    // Create article detail panel (right pane - 40% width)
    this.articleDetail = blessed.box({
      parent: this.screen,
      label: ' Article Details ',
      top: 0,
      left: '60%',
      width: '40%',
      height: '100%-1',
      border: {
        type: 'line',
      },
      style: {
        border: {
          fg: 'cyan',
        },
      },
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      mouse: true,
      scrollbar: {
        ch: '█',
        style: {
          fg: 'cyan',
        },
      },
      tags: true,
    });

    // Create status bar
    this.statusBar = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      tags: true,
      style: {
        fg: 'black',
        bg: 'white',
        bold: true,
      },
    });

    // Create help overlay (hidden by default)
    this.helpBox = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '80%',
      height: '80%',
      label: ' Help (Press ? or ESC to close) ',
      border: {
        type: 'line',
      },
      style: {
        border: {
          fg: 'yellow',
        },
        bg: 'black',
      },
      hidden: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      mouse: true,
      scrollbar: {
        ch: '█',
        style: {
          fg: 'yellow',
        },
      },
      tags: true,
      content: this.getHelpContent(),
    });

    // Create search box (hidden by default)
    this.searchBox = blessed.textbox({
      parent: this.screen,
      top: 0,
      left: '25%',
      width: '35%',
      height: 3,
      label: ' Search (ESC to cancel) ',
      border: {
        type: 'line',
      },
      style: {
        border: {
          fg: 'green',
        },
        bg: 'black',
        focus: {
          border: {
            fg: 'green',
          },
        },
      },
      hidden: true,
      inputOnFocus: true,
    });

    // Set up event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Feed selection - load articles for selected feed
    this.feedList.on('select', (item, index) => {
      this.selectedFeedIndex = index;
      this.loadArticlesForFeed();
    });

    // Feed navigation with j/k
    this.feedList.key(['j', 'down'], () => {
      setImmediate(() => {
        const index = this.feedList.selected;
        this.selectedFeedIndex = index;
        this.loadArticlesForFeed();
      });
    });

    this.feedList.key(['k', 'up'], () => {
      setImmediate(() => {
        const index = this.feedList.selected;
        this.selectedFeedIndex = index;
        this.loadArticlesForFeed();
      });
    });

    // Article selection - update detail view
    this.articleList.on('select', (item, index) => {
      this.selectedArticleIndex = index;
      this.showArticleDetail(index);
    });

    // Navigation updates - no delay for responsiveness
    this.articleList.on('select item', () => {
      const index = this.articleList.selected;
      this.selectedArticleIndex = index;
      this.showArticleDetail(index);
    });

    // Page up/down navigation
    this.screen.key(['pagedown', 'C-f'], () => {
      if (!this.showingHelp) {
        this.pageDown();
      }
    });

    this.screen.key(['pageup', 'C-b'], () => {
      if (!this.showingHelp) {
        this.pageUp();
      }
    });

    // Keyboard shortcuts - use screen level to ensure they always work
    this.screen.key(['q', 'Q'], () => {
      if (!this.showingHelp) {
        this.quit();
      }
    });

    this.screen.key(['escape'], () => {
      if (this.showingHelp) {
        this.toggleHelp();
      } else if (this.searchMode) {
        this.exitSearch();
      } else {
        this.quit();
      }
    });

    this.screen.key(['r', 'R'], () => {
      this.refresh();
    });

    this.screen.key(['t', 'T'], () => {
      this.showUnreadOnly = !this.showUnreadOnly;
      this.refresh();
      this.updateStatusBar();
    });

    this.screen.key(['tab'], () => {
      this.switchPane();
    });

    this.screen.key(['delete', 'backspace'], () => {
      this.unsubscribeFromFeed();
    });

    this.screen.key(['space'], () => {
      this.toggleRead();
    });

    this.screen.key(['s', 'S'], () => {
      this.toggleStar();
    });

    this.screen.key(['m', 'M'], () => {
      this.markFeedAsRead();
    });

    this.screen.key(['enter'], () => {
      if (!this.showingHelp) {
        this.openInBrowser();
      }
    });

    this.screen.key(['?', 'h'], () => {
      this.toggleHelp();
    });

    this.screen.key(['a', 'A'], () => {
      if (!this.showingHelp) {
        this.markAllAsRead();
      }
    });

    this.screen.key(['i', 'I'], () => {
      if (!this.showingHelp) {
        this.summarizeArticle();
      }
    });

    this.screen.key(['/'], () => {
      if (!this.showingHelp && !this.searchMode) {
        this.enterSearch();
      }
    });

    // Search box events
    this.searchBox.on('submit', (value) => {
      this.performSearch(value);
    });

    this.searchBox.key(['escape'], () => {
      this.exitSearch();
    });
  }

  private loadFeeds(): void {
    // @ts-ignore
    const db = database['db'];
    if (!db) {
      this.feeds = [];
      return;
    }

    // Get all feeds with unread counts
    let query: string;
    if (this.showUnreadOnly) {
      // Only show feeds with unread articles
      query = `SELECT f.id, f.title, COUNT(CASE WHEN a.read = 0 THEN 1 END) as unread_count
               FROM feeds f
               LEFT JOIN articles a ON f.id = a.feed_id
               WHERE f.enabled = 1
               GROUP BY f.id
               HAVING unread_count > 0
               ORDER BY f.title`;
    } else {
      // Show all feeds
      query = `SELECT f.id, f.title, COUNT(CASE WHEN a.read = 0 THEN 1 END) as unread_count
               FROM feeds f
               LEFT JOIN articles a ON f.id = a.feed_id
               WHERE f.enabled = 1
               GROUP BY f.id
               ORDER BY f.title`;
    }

    const feedResults = db.prepare(query).all() as Array<{id: number; title: string; unread_count: number}>;

    // Calculate total unread for "All" feed
    const totalUnread = db.prepare('SELECT COUNT(*) as count FROM articles WHERE read = 0').get() as {count: number};

    // Add "All" feed at the top
    this.feeds = [
      { id: null, title: 'All', unreadCount: totalUnread.count },
      ...feedResults.map(f => ({ id: f.id, title: f.title || 'Untitled', unreadCount: f.unread_count }))
    ];
  }

  private loadArticlesForFeed(): void {
    // If in search mode, use search results instead
    if (this.searchMode && this.searchQuery) {
      this.performSearch(this.searchQuery);
      return;
    }

    const selectedFeed = this.feeds[this.selectedFeedIndex];
    if (!selectedFeed) {
      this.articles = [];
      return;
    }

    // @ts-ignore
    const db = database['db'];
    if (!db) {
      this.articles = [];
      return;
    }

    let query: string;
    let params: any[] = [];

    if (selectedFeed.id === null) {
      // "All" feed - show all articles
      query = this.showUnreadOnly
        ? `SELECT a.*, f.title as feed_title
           FROM articles a
           LEFT JOIN feeds f ON a.feed_id = f.id
           WHERE a.read = 0
           ORDER BY a.published_at DESC
           LIMIT 500`
        : `SELECT a.*, f.title as feed_title
           FROM articles a
           LEFT JOIN feeds f ON a.feed_id = f.id
           ORDER BY a.published_at DESC
           LIMIT 500`;
    } else {
      // Specific feed
      query = this.showUnreadOnly
        ? `SELECT a.*, f.title as feed_title
           FROM articles a
           LEFT JOIN feeds f ON a.feed_id = f.id
           WHERE a.feed_id = ? AND a.read = 0
           ORDER BY a.published_at DESC
           LIMIT 500`
        : `SELECT a.*, f.title as feed_title
           FROM articles a
           LEFT JOIN feeds f ON a.feed_id = f.id
           WHERE a.feed_id = ?
           ORDER BY a.published_at DESC
           LIMIT 500`;
      params = [selectedFeed.id];
    }

    this.articles = db.prepare(query).all(...params) as ArticleWithFeed[];

    // Update article list
    const items = this.articles.map(a => this.formatArticleListItem(a));
    this.articleList.setItems(items);

    if (this.articles.length > 0) {
      this.articleList.select(0);
      this.selectedArticleIndex = 0;
      this.showArticleDetail(0);
    } else {
      this.articleDetail.setContent('\n\n  No articles\n\n  No articles found for this feed.');
    }

    this.updateStatusBar();
    this.screen.render();
  }

  private enterSearch(): void {
    this.searchMode = true;
    this.searchBox.setValue('');
    this.searchBox.show();
    this.searchBox.focus();
    this.updateStatusBar('Enter search query and press Enter...');
    this.screen.render();
  }

  private exitSearch(): void {
    this.searchMode = false;
    this.searchQuery = '';
    this.searchBox.hide();
    this.searchBox.setValue('');

    // Return focus to article list
    if (this.currentPane === 'articles') {
      this.articleList.focus();
    } else {
      this.feedList.focus();
    }

    // Reload normal articles
    this.loadArticlesForFeed();
    this.updateStatusBar();
    this.screen.render();
  }

  private performSearch(query: string): void {
    this.searchQuery = query.trim();

    if (!this.searchQuery) {
      this.exitSearch();
      return;
    }

    const selectedFeed = this.feeds[this.selectedFeedIndex];
    const feedId = selectedFeed?.id;

    // Use database search function
    this.articles = database.searchArticles(this.searchQuery, feedId, this.showUnreadOnly) as ArticleWithFeed[];

    // Update article list
    const items = this.articles.map(a => this.formatArticleListItem(a));
    this.articleList.setItems(items);

    if (this.articles.length > 0) {
      this.articleList.select(0);
      this.selectedArticleIndex = 0;
      this.showArticleDetail(0);
    } else {
      this.articleDetail.setContent('\n\n  No results\n\n  No articles found matching your search.');
    }

    // Hide search box and return focus
    this.searchBox.hide();
    this.articleList.focus();

    this.updateStatusBar(`Search: "${this.searchQuery}" (${this.articles.length} results) - ESC to clear`);
    this.screen.render();
  }

  private formatArticleListItem(article: ArticleWithFeed): string {
    // Fast text cleaning - just remove non-ASCII
    const title = (article.title || 'Untitled').replace(/[^\x20-\x7E]/g, '');

    const readIndicator = article.read ? ' ' : '*';
    const starIndicator = article.starred ? 'S' : ' ';

    // Truncate title - adjust for smaller pane
    const maxTitleLength = 30;
    const truncatedTitle = title.length > maxTitleLength
      ? title.substring(0, maxTitleLength - 3) + '...'
      : title;

    return `${readIndicator} ${starIndicator} ${truncatedTitle}`;
  }

  private formatFeedListItem(feed: FeedListItem): string {
    const title = feed.title.replace(/[^\x20-\x7E]/g, '');
    const maxTitleLength = 20;
    const truncatedTitle = title.length > maxTitleLength
      ? title.substring(0, maxTitleLength - 3) + '...'
      : title;

    if (feed.unreadCount > 0) {
      return `${truncatedTitle} {cyan-fg}(${feed.unreadCount}){/cyan-fg}`;
    }
    return truncatedTitle;
  }

  private switchPane(): void {
    if (this.currentPane === 'feeds') {
      this.currentPane = 'articles';
      this.articleList.focus();
      this.feedList.style.border.fg = 'cyan';
      this.articleList.style.border.fg = 'yellow';
    } else {
      this.currentPane = 'feeds';
      this.feedList.focus();
      this.feedList.style.border.fg = 'yellow';
      this.articleList.style.border.fg = 'cyan';
    }
    this.screen.render();
  }

  private cleanText(text: string): string {
    if (!text) return '';

    return text
      // Smart quotes and Unicode punctuation
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\u2013/g, '-')
      .replace(/\u2014/g, '--')
      .replace(/\u2026/g, '...')
      // HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&mdash;/g, '--')
      .replace(/&ndash;/g, '-')
      .replace(/&ldquo;/g, '"')
      .replace(/&rdquo;/g, '"')
      .replace(/&lsquo;/g, "'")
      .replace(/&rsquo;/g, "'")
      // Remove problematic characters
      .replace(/[^\x00-\x7F]/g, '')
      .trim();
  }

  private showArticleDetail(index: number): void {
    const article = this.articles[index];
    if (!article) return;

    // Use simpler date formatting for speed
    const publishedDate = article.published_at
      ? new Date(article.published_at).toLocaleDateString() + ' ' + new Date(article.published_at).toLocaleTimeString()
      : 'Unknown date';

    // Minimal text cleaning for performance
    const title = (article.title || 'Untitled').replace(/[^\x20-\x7E]/g, '');
    const feed = (article.feed_title || 'Unknown').replace(/[^\x20-\x7E]/g, '');
    const author = (article.author || 'Unknown').replace(/[^\x20-\x7E]/g, '');

    // Simplified content - don't process large text blocks
    let contentPreview = article.content_text || article.summary || 'No content available';
    // Just remove non-printable ASCII, keep it simple
    contentPreview = contentPreview.replace(/[^\x20-\x7E\n]/g, '').substring(0, 2000);

    const content = `{bold}${title}{/bold}

{cyan-fg}Feed:{/cyan-fg} ${feed}
{cyan-fg}Author:{/cyan-fg} ${author}
{cyan-fg}Published:{/cyan-fg} ${publishedDate}
{cyan-fg}URL:{/cyan-fg} ${article.url || 'No URL'}
{cyan-fg}Status:{/cyan-fg} ${article.read ? 'Read' : 'Unread'} ${article.starred ? '[STARRED]' : ''}

========================================

${contentPreview}`;

    this.articleDetail.setContent(content);
    this.articleDetail.setScrollPerc(0);
  }

  private stripHtmlTags(html: string): string {
    if (!html) return '';

    return html
      .replace(/<[^>]*>/g, '')
      // HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&mdash;/g, '--')
      .replace(/&ndash;/g, '-')
      .replace(/&hellip;/g, '...')
      .replace(/&ldquo;/g, '"')
      .replace(/&rdquo;/g, '"')
      .replace(/&lsquo;/g, "'")
      .replace(/&rsquo;/g, "'")
      // Replace smart quotes and other Unicode punctuation
      .replace(/[\u2018\u2019]/g, "'")  // Smart single quotes
      .replace(/[\u201C\u201D]/g, '"')  // Smart double quotes
      .replace(/\u2013/g, '-')          // En dash
      .replace(/\u2014/g, '--')         // Em dash
      .replace(/\u2026/g, '...')        // Ellipsis
      .replace(/[\u2018-\u201F]/g, "'") // Various quote marks
      // Remove other problematic Unicode characters
      .replace(/[^\x00-\x7F]/g, (char) => {
        // Keep common printable characters, replace others
        const code = char.charCodeAt(0);
        if (code >= 0x0080 && code <= 0x00FF) {
          // Latin-1 supplement
          return char;
        }
        return ''; // Remove other non-ASCII
      })
      .trim();
  }

  private toggleRead(): void {
    const index = this.articleList.selected;
    const article = this.articles[index];
    if (!article || !article.id) return;
    this.selectedArticleIndex = index;

    const newReadStatus = article.read ? 0 : 1;

    // @ts-ignore
    const db = database['db'];
    if (!db) return;

    db.prepare('UPDATE articles SET read = ? WHERE id = ?').run(newReadStatus, article.id);

    // Update local state
    article.read = newReadStatus;

    // Update article list display
    const items = this.articles.map(a => this.formatArticleListItem(a));
    this.articleList.setItems(items);
    this.articleList.select(this.selectedArticleIndex);

    // Refresh feed list to update unread counts
    this.loadFeeds();
    const feedItems = this.feeds.map(f => this.formatFeedListItem(f));
    this.feedList.setItems(feedItems);
    this.feedList.select(this.selectedFeedIndex);

    this.updateStatusBar();
    this.screen.render();
  }

  private toggleStar(): void {
    const index = this.articleList.selected;
    const article = this.articles[index];
    if (!article || !article.id) return;
    this.selectedArticleIndex = index;

    const newStarStatus = article.starred ? 0 : 1;

    // @ts-ignore
    const db = database['db'];
    if (!db) return;

    db.prepare('UPDATE articles SET starred = ? WHERE id = ?').run(newStarStatus, article.id);

    // Update local state
    article.starred = newStarStatus;

    // Update list display
    const items = this.articles.map(a => this.formatArticleListItem(a));
    this.articleList.setItems(items);
    this.articleList.select(this.selectedArticleIndex);

    // Update detail view
    this.showArticleDetail(this.selectedArticleIndex);

    this.updateStatusBar();
    this.screen.render();
  }

  private openInBrowser(): void {
    const index = this.articleList.selected;
    const article = this.articles[index];
    if (!article || !article.url) {
      this.updateStatusBar('No URL available for this article');
      return;
    }
    this.selectedArticleIndex = index;

    // Mark as read when opening
    if (!article.read && article.id) {
      // @ts-ignore
      const db = database['db'];
      if (db) {
        db.prepare('UPDATE articles SET read = 1 WHERE id = ?').run(article.id);
        article.read = 1;
      }
    }

    // Open in default browser (macOS)
    spawn('open', [article.url], { detached: true, stdio: 'ignore' }).unref();

    this.updateStatusBar(`Opened in browser: ${article.url}`);

    // Update displays
    const items = this.articles.map(a => this.formatArticleListItem(a));
    this.articleList.setItems(items);
    this.articleList.select(this.selectedArticleIndex);

    // Refresh feed list to update unread counts
    this.loadFeeds();
    const feedItems = this.feeds.map(f => this.formatFeedListItem(f));
    this.feedList.setItems(feedItems);
    this.feedList.select(this.selectedFeedIndex);

    this.screen.render();
  }

  private markFeedAsRead(): void {
    const selectedFeed = this.feeds[this.selectedFeedIndex];
    if (!selectedFeed) {
      this.updateStatusBar('No feed selected');
      setTimeout(() => this.updateStatusBar(), 3000);
      return;
    }

    if (selectedFeed.id === null) {
      this.updateStatusBar('Cannot mark "All" feed as read. Use A to mark all articles as read.');
      setTimeout(() => this.updateStatusBar(), 3000);
      return;
    }

    const feedTitle = selectedFeed.title;

    // @ts-ignore
    const db = database['db'];
    if (!db) {
      this.updateStatusBar('Database error');
      setTimeout(() => this.updateStatusBar(), 3000);
      return;
    }

    // Mark all unread articles from this feed as read
    const result = db.prepare('UPDATE articles SET read = 1 WHERE feed_id = ? AND read = 0').run(selectedFeed.id);
    const count = result.changes;

    this.updateStatusBar(`Marked ${count} articles as read from: ${feedTitle}`);
    setTimeout(() => this.updateStatusBar(), 5000);

    // Refresh everything
    this.refresh();
  }

  private unsubscribeFromFeed(): void {
    const selectedFeed = this.feeds[this.selectedFeedIndex];

    if (!selectedFeed || selectedFeed.id === null) {
      this.updateStatusBar('Cannot unsubscribe from "All" feed');
      setTimeout(() => this.updateStatusBar(), 3000);
      return;
    }

    const feedTitle = selectedFeed.title;

    // @ts-ignore
    const db = database['db'];
    if (!db) {
      this.updateStatusBar('Error: Database not available');
      setTimeout(() => this.updateStatusBar(), 3000);
      return;
    }

    try {
      // Count articles before deletion for feedback
      const articleCount = db.prepare('SELECT COUNT(*) as count FROM articles WHERE feed_id = ?').get(selectedFeed.id) as { count: number };

      // Delete the feed (this will cascade delete all articles due to foreign key constraint)
      const result = db.prepare('DELETE FROM feeds WHERE id = ?').run(selectedFeed.id);

      if (result.changes > 0) {
        this.updateStatusBar(`Unsubscribed from "${feedTitle}" (removed ${articleCount.count} articles)`);
        setTimeout(() => this.updateStatusBar(), 5000);

        // Refresh everything - go back to "All" feed
        this.selectedFeedIndex = 0;
        this.refresh();
      } else {
        this.updateStatusBar('Error: Failed to delete feed');
        setTimeout(() => this.updateStatusBar(), 3000);
      }
    } catch (error) {
      this.updateStatusBar(`Error unsubscribing: ${error}`);
      setTimeout(() => this.updateStatusBar(), 3000);
    }
  }

  private refresh(): void {
    this.loadFeeds();
    this.loadArticlesForFeed();

    // Update feed list
    const feedItems = this.feeds.map(f => this.formatFeedListItem(f));
    this.feedList.setItems(feedItems);
    this.feedList.select(Math.min(this.selectedFeedIndex, this.feeds.length - 1));

    this.screen.render();
  }

  private updateStatusBar(message?: string): void {
    if (message) {
      this.statusBar.setContent(` ${message}`);
    } else {
      const selectedFeed = this.feeds[this.selectedFeedIndex];
      const feedName = selectedFeed ? selectedFeed.title : 'No feed';
      const totalCount = this.articles.length;
      const unreadCount = this.articles.filter(a => !a.read).length;
      const filter = this.showUnreadOnly ? 'Unread' : 'All';

      if (this.searchMode && this.searchQuery) {
        this.statusBar.setContent(
          ` Search: "${this.searchQuery}" (${totalCount} results) | ESC to clear | ? help | Q quit `
        );
      } else {
        this.statusBar.setContent(
          ` ${feedName} | Articles: ${totalCount} | Unread: ${unreadCount} | Filter: ${filter} | / search | Tab switch | ? help | Q quit `
        );
      }
    }
  }

  private quit(): void {
    this.screen.destroy();
    process.exit(0);
  }

  private toggleHelp(): void {
    this.showingHelp = !this.showingHelp;

    if (this.showingHelp) {
      this.helpBox.show();
      this.helpBox.focus();
    } else {
      this.helpBox.hide();
      this.articleList.focus();
    }

    this.screen.render();
  }

  private pageDown(): void {
    const pageSize = 10;
    const currentIndex = this.articleList.selected;
    const newIndex = Math.min(currentIndex + pageSize, this.articles.length - 1);

    this.articleList.select(newIndex);
    this.selectedArticleIndex = newIndex;
  }

  private pageUp(): void {
    const pageSize = 10;
    const currentIndex = this.articleList.selected;
    const newIndex = Math.max(currentIndex - pageSize, 0);

    this.articleList.select(newIndex);
    this.selectedArticleIndex = newIndex;
  }

  private markAllAsRead(): void {
    // @ts-ignore
    const db = database['db'];
    if (!db) {
      this.updateStatusBar('Error: Database not available');
      setTimeout(() => this.updateStatusBar(), 3000);
      return;
    }

    try {
      const result = db.prepare('UPDATE articles SET read = 1 WHERE read = 0').run();
      const count = result.changes;

      this.updateStatusBar(`Marked ${count} articles as read`);
      setTimeout(() => this.updateStatusBar(), 5000);

      // Refresh everything
      this.refresh();
    } catch (error) {
      this.updateStatusBar(`Error marking all as read: ${error}`);
      setTimeout(() => this.updateStatusBar(), 3000);
    }
  }

  private async summarizeArticle(): Promise<void> {
    const index = this.articleList.selected;
    const article = this.articles[index];

    if (!article) {
      this.updateStatusBar('No article selected');
      setTimeout(() => this.updateStatusBar(), 3000);
      return;
    }

    if (!article.url) {
      this.updateStatusBar('No URL available for this article');
      setTimeout(() => this.updateStatusBar(), 3000);
      return;
    }

    this.updateStatusBar('Fetching content...');
    this.screen.render();

    try {
      // Check if it's a YouTube video
      const isYouTube = this.isYouTubeUrl(article.url);
      let content: string;
      let contentType: 'video' | 'article' = 'article';

      if (isYouTube) {
        contentType = 'video';
        this.updateStatusBar('Fetching YouTube transcript...');
        this.screen.render();
        content = await this.fetchYouTubeTranscript(article.url);
      } else {
        this.updateStatusBar('Fetching article content...');
        this.screen.render();
        content = await this.fetchArticleContent(article.url);
      }

      this.updateStatusBar('Generating AI summary...');
      this.screen.render();

      // Generate summary using Claude Code CLI
      const { summary, tags } = await this.generateAISummary(content, {
        title: article.title,
        author: article.author,
        url: article.url,
      }, contentType);

      // Display summary in detail pane
      this.displaySummary(article, summary, tags);

      this.updateStatusBar('AI summary generated successfully');
      setTimeout(() => this.updateStatusBar(), 3000);

      // Mark as read when summarizing
      if (!article.read && article.id) {
        const db = (database as any)['db'];
        if (db) {
          db.prepare('UPDATE articles SET read = 1 WHERE id = ?').run(article.id);
          article.read = 1;

          // Update displays
          const items = this.articles.map(a => this.formatArticleListItem(a));
          this.articleList.setItems(items);
          this.articleList.select(this.selectedArticleIndex);

          // Refresh feed list to update unread counts
          this.loadFeeds();
          const feedItems = this.feeds.map(f => this.formatFeedListItem(f));
          this.feedList.setItems(feedItems);
          this.feedList.select(this.selectedFeedIndex);
        }
      }

      this.screen.render();
    } catch (error: any) {
      this.updateStatusBar(`Error: ${error.message}`);
      setTimeout(() => this.updateStatusBar(), 5000);
    }
  }

  private isYouTubeUrl(url: string): boolean {
    const youtubeRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/;
    return youtubeRegex.test(url);
  }

  private extractYouTubeVideoId(url: string): string | null {
    const youtubeRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(youtubeRegex);
    return match ? match[1] : null;
  }

  private escapeShellArg(arg: string): string {
    return arg
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$')
      .replace(/!/g, '\\!');
  }

  private async fetchYouTubeTranscript(url: string): Promise<string> {
    const tempDir = join(tmpdir(), 'rss-daemon');
    const videoId = this.extractYouTubeVideoId(url);

    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    try {
      // Check if yt-dlp is installed
      try {
        await execAsync('which yt-dlp', { timeout: 5000 });
      } catch {
        throw new Error('yt-dlp not installed. Run: brew install yt-dlp');
      }

      // Create temp directory
      await mkdir(tempDir, { recursive: true });

      const outputPath = join(tempDir, `transcript-${videoId}`);

      // Escape arguments properly
      const escapedOutput = this.escapeShellArg(outputPath);
      const escapedUrl = this.escapeShellArg(url);

      // Download transcript using yt-dlp
      const command = `yt-dlp --write-auto-sub --skip-download --sub-format vtt --output "${escapedOutput}" "${escapedUrl}"`;

      const { stderr } = await execAsync(command, { timeout: 60000 });

      // Check if subtitles were not available
      if (stderr && stderr.toLowerCase().includes('no subtitles')) {
        throw new Error('No transcript available for this video');
      }

      // Read the transcript file (yt-dlp creates .en.vtt or .vtt)
      let transcriptText: string;
      const vttPathEn = `${outputPath}.en.vtt`;
      const vttPath = `${outputPath}.vtt`;

      try {
        transcriptText = await readFile(vttPathEn, 'utf-8');
        await unlink(vttPathEn).catch(() => {});
      } catch {
        transcriptText = await readFile(vttPath, 'utf-8');
        await unlink(vttPath).catch(() => {});
      }

      // Clean transcript text (remove VTT formatting)
      return this.cleanTranscript(transcriptText);
    } catch (error: any) {
      if (error.message?.includes('No transcript available')) {
        throw error;
      }
      if (error.message?.includes('yt-dlp not installed')) {
        throw error;
      }
      if (error.code === 'ENOENT') {
        throw new Error('No transcript available for this video');
      }
      throw new Error(`Failed to download transcript: ${error.message}`);
    }
  }

  private cleanTranscript(text: string): string {
    const lines = text.split('\n');
    const transcriptLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip WEBVTT header, metadata, timestamps, and empty lines
      if (
        line === '' ||
        line.startsWith('WEBVTT') ||
        line.startsWith('Kind:') ||
        line.startsWith('Language:') ||
        line.match(/^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}/)
      ) {
        continue;
      }

      // Remove inline timestamps like <00:00:19.039>
      const cleanedLine = line
        .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '')
        .replace(/<c>/g, '')
        .replace(/<\/c>/g, '')
        .trim();

      if (cleanedLine.length > 0) {
        transcriptLines.push(cleanedLine);
      }
    }

    // Join lines and clean up extra whitespace
    return transcriptLines.join(' ').replace(/\s+/g, ' ').trim();
  }

  private async fetchArticleContent(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      const $ = cheerio.load(response.data);

      // Remove script, style, nav, footer, header tags
      $('script, style, nav, footer, header, iframe, noscript').remove();

      // Try to find main content (common article selectors)
      const contentSelectors = [
        'article',
        '[role="main"]',
        'main',
        '.post-content',
        '.article-content',
        '.entry-content',
        '.content',
      ];

      let content = '';
      for (const selector of contentSelectors) {
        const element = $(selector);
        if (element.length > 0) {
          content = element.text();
          break;
        }
      }

      // Fallback to body if no main content found
      if (!content) {
        content = $('body').text();
      }

      // Clean up whitespace
      content = content
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, '\n')
        .trim();

      return content;
    } catch (error: any) {
      throw new Error(`Failed to fetch article: ${error.message}`);
    }
  }

  private async generateAISummary(
    content: string,
    metadata: { title?: string; author?: string; url?: string },
    contentType: 'video' | 'article' = 'article'
  ): Promise<{ summary: string; tags: string[] }> {
    const tempDir = join(tmpdir(), 'rss-daemon');
    const tempFile = join(tempDir, `prompt-${Date.now()}.txt`);

    try {
      // Ensure temp directory exists
      await mkdir(tempDir, { recursive: true });

      // Truncate content if too long
      const words = content.split(/\s+/);
      const maxWords = contentType === 'video' ? 10000 : 15000;
      const truncated = words.length > maxWords;
      const contentText = truncated
        ? words.slice(0, maxWords).join(' ') + '\n\n[... content truncated ...]'
        : content;

      // Build prompt based on content type
      let prompt: string;

      if (contentType === 'video') {
        prompt = `You are summarizing a YouTube video transcript.

${metadata.title ? `Video Title: ${metadata.title}` : ''}
${metadata.author ? `Channel: ${metadata.author}` : ''}
${metadata.url ? `URL: ${metadata.url}` : ''}
Transcript Word Count: ${words.length}${truncated ? ` (truncated to ${maxWords} words)` : ''}

Transcript:
${contentText}

Please provide:
1. A concise summary (2-3 paragraphs) of the video content
2. 2-3 relevant subject tags (single words or short phrases, lowercase, like 'technology', 'programming', 'tutorial')

Format your response exactly like this:
SUMMARY:
[your summary here]

TAGS:
tag1, tag2, tag3`;
      } else {
        prompt = `You are summarizing an article.

${metadata.title ? `Article Title: ${metadata.title}` : ''}
${metadata.author ? `Author: ${metadata.author}` : ''}
${metadata.url ? `URL: ${metadata.url}` : ''}
Content Word Count: ${words.length}${truncated ? ` (truncated to ${maxWords} words)` : ''}

Article Content:
${contentText}

Please provide:
1. A concise summary (2-4 paragraphs) of the article content
2. 2-3 relevant subject tags (single words or short phrases, lowercase, like 'technology', 'personal-finance', 'productivity')

Format your response exactly like this:
SUMMARY:
[your summary here]

TAGS:
tag1, tag2, tag3`;
      }

      // Write prompt to file
      await writeFile(tempFile, prompt, 'utf-8');

      // Get Claude Code CLI path from environment or use default
      const claudeCodePath = process.env.CLAUDE_CODE_PATH || 'claude';

      // Invoke Claude Code CLI (5 minute timeout for summaries)
      const command = `${claudeCodePath} < "${tempFile}"`;

      const { stdout, stderr } = await execAsync(command, {
        timeout: 300000, // 5 minutes
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      if (stderr && !stderr.includes('Success')) {
        console.warn('⚠️  Claude Code stderr:', stderr);
      }

      const response = this.cleanAIResponse(stdout);
      return this.parseAISummaryResponse(response);
    } catch (error: any) {
      // Check for timeout
      if (error.code === 'ETIMEDOUT' || (error.killed && error.signal === 'SIGTERM')) {
        throw new Error('AI summary timed out after 5 minutes');
      }

      // Check for rate limit
      const output = error.stdout || error.stderr || '';
      if (output.includes("You've hit your limit")) {
        const resetMatch = output.match(/resets\s+(.+?)(\n|$)/);
        const resetTime = resetMatch ? resetMatch[1].trim() : 'later today';
        throw new Error(`Claude Code rate limit reached (resets ${resetTime})`);
      }

      throw new Error(`AI summary failed: ${error.message}`);
    } finally {
      // Clean up temp file
      try {
        await unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private cleanAIResponse(output: string): string {
    let cleaned = output.trim();

    // Remove ANSI color codes
    cleaned = cleaned.replace(/\x1b\[[0-9;]*m/g, '');

    // Remove CLI artifacts
    const lines = cleaned.split('\n');
    const contentLines: string[] = [];

    for (const line of lines) {
      // Skip system lines
      if (
        line.startsWith('claude>') ||
        line.startsWith('$') ||
        line.startsWith('[') ||
        line.match(/^\s*✓/) ||
        line.match(/^\s*›/)
      ) {
        continue;
      }
      contentLines.push(line);
    }

    return contentLines.join('\n').trim();
  }

  private parseAISummaryResponse(response: string): { summary: string; tags: string[] } {
    try {
      // Extract summary (text after "SUMMARY:" until "TAGS:")
      const summaryMatch = response.match(/SUMMARY:\s*([\s\S]*?)\s*TAGS:/i);
      const summary = summaryMatch ? summaryMatch[1].trim() : response;

      // Extract tags (comma-separated list after "TAGS:")
      const tagsMatch = response.match(/TAGS:\s*(.+)$/im);
      const tags = tagsMatch
        ? tagsMatch[1]
            .split(',')
            .map(tag => tag.trim().toLowerCase().replace(/\s+/g, '-'))
            .filter(tag => tag.length > 0)
        : [];

      return { summary, tags };
    } catch (error) {
      // Fallback: use entire response as summary, no tags
      return {
        summary: response.trim(),
        tags: [],
      };
    }
  }

  private displaySummary(article: ArticleWithFeed, summary: string, tags: string[]): void {
    const publishedDate = article.published_at
      ? new Date(article.published_at).toLocaleDateString() + ' ' + new Date(article.published_at).toLocaleTimeString()
      : 'Unknown date';

    const title = (article.title || 'Untitled').replace(/[^\x20-\x7E]/g, '');
    const feed = (article.feed_title || 'Unknown').replace(/[^\x20-\x7E]/g, '');
    const author = (article.author || 'Unknown').replace(/[^\x20-\x7E]/g, '');

    const tagsDisplay = tags.length > 0 ? tags.join(', ') : 'none';

    const content = `{bold}${title}{/bold}

{cyan-fg}Feed:{/cyan-fg} ${feed}
{cyan-fg}Author:{/cyan-fg} ${author}
{cyan-fg}Published:{/cyan-fg} ${publishedDate}
{cyan-fg}URL:{/cyan-fg} ${article.url || 'No URL'}
{cyan-fg}Status:{/cyan-fg} ${article.read ? 'Read' : 'Unread'} ${article.starred ? '[STARRED]' : ''}
{cyan-fg}Tags:{/cyan-fg} ${tagsDisplay}

========================================
{yellow-fg}AI SUMMARY{/yellow-fg}
========================================

${summary}`;

    this.articleDetail.setContent(content);
    this.articleDetail.setScrollPerc(0);
  }

  private getHelpContent(): string {
    return `
{bold}{cyan-fg}fressh - RSS Article Viewer - Keyboard Shortcuts{/cyan-fg}{/bold}

{yellow-fg}Layout{/yellow-fg}
  Left Pane     Feed list (select a feed to view its articles)
  Middle Pane   Article list for selected feed
  Right Pane    Article details
  Tab           Switch between Feeds and Articles pane

{yellow-fg}Navigation{/yellow-fg}
  j, Down       Move down one item
  k, Up         Move up one item
  PageDown/C-f  Jump down one page (10 items)
  PageUp/C-b    Jump up one page (10 items)
  Mouse         Click to select items

{yellow-fg}Search{/yellow-fg}
  /             Search articles (title, content, summary)
  ESC           Clear search and return to normal view
                Search works within the current feed
                (searches all feeds when "All" is selected)

{yellow-fg}Reading Articles{/yellow-fg}
  Enter         Open article in browser (marks as read)
  I             Generate AI summary of article (marks as read)
  Space         Toggle read/unread status
  S             Toggle starred status

{yellow-fg}Feed Management{/yellow-fg}
  M             Mark all articles from current feed as read
  A             Mark ALL articles as read (all feeds)
  Delete/Bksp   Unsubscribe from the current feed
                (removes feed and all its articles)

{yellow-fg}View Options{/yellow-fg}
  T             Toggle filter (Unread Only / All Articles)
  R             Refresh feed and article lists

{yellow-fg}General{/yellow-fg}
  ?             Show this help screen
  Q, Escape     Quit the application

{yellow-fg}Status Indicators{/yellow-fg}
  *             Unread article
  S             Starred article
  (no marker)   Read article
  (number)      Unread count next to feed name

{yellow-fg}Tips{/yellow-fg}
  - Select "All" feed to see articles from all feeds
  - Unread counts update automatically as you read
  - Use / to quickly clear all articles from a noisy feed
  - Delete key unsubscribes from the selected feed

{cyan-fg}Press ? or ESC to close this help screen{/cyan-fg}
`;
  }

  start(): void {
    // Load feeds first
    this.loadFeeds();
    const feedItems = this.feeds.map(f => this.formatFeedListItem(f));
    this.feedList.setItems(feedItems);

    if (this.feeds.length > 0) {
      this.feedList.select(0);
      this.selectedFeedIndex = 0;

      // Load articles for the first feed (All)
      this.loadArticlesForFeed();
    }

    this.updateStatusBar();

    // Focus on article list by default
    this.articleList.focus();

    // Render the screen
    this.screen.render();
  }
}
