import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { useLocalSearchParams, Stack, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import YoutubePlayer from 'react-native-youtube-iframe';
import { getDb } from '../../../src/db/database';
import { getArticle, toggleStar, getArticles, type ArticleRow } from '../../../src/db/queries';
import { FONTS, COLORS } from '../../../src/constants';
import NavBar from '../../../src/components/ui/NavBar';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function stripHtml(html: string): string {
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

function getYouTubeId(url: string | null): string | null {
  if (!url) return null;
  const m =
    url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) ||
    url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) ||
    url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function getBody(article: ArticleRow): string {
  if (article.content_text?.trim()) return article.content_text;
  if (article.content_html?.trim()) return stripHtml(article.content_html);
  if (article.summary?.trim()) return article.summary;
  return '(No content available — open in browser to read the full article.)';
}

export default function ArticleReaderScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { feedId, articleId } = useLocalSearchParams<{ feedId: string; articleId: string }>();
  if (Array.isArray(feedId) || Array.isArray(articleId)) return null;

  const [article, setArticle] = useState<ArticleRow | null>(null);
  const [articleList, setArticleList] = useState<ArticleRow[]>([]);

  const loadArticle = useCallback(async () => {
    try {
      const db = getDb();
      const a = await getArticle(db, Number(articleId));
      setArticle(a);
    } catch (e) {
      console.error('ArticleReader load error:', e);
    }
  }, [articleId]);

  const loadList = useCallback(async () => {
    try {
      const db = getDb();
      const feedIdParam =
        feedId === 'unread' || feedId === 'starred' || feedId === 'today'
          ? feedId
          : Number(feedId);
      const list = await getArticles(db, feedIdParam);
      setArticleList(list);
    } catch (e) {
      console.error('ArticleReader loadList error:', e);
    }
  }, [feedId]);

  useFocusEffect(useCallback(() => { loadArticle(); loadList(); }, [loadArticle, loadList]));

  if (!article) return null;

  const youtubeId = getYouTubeId(article.url);
  const videoHeight = Math.round((width - 40) * (9 / 16));
  const currentIndex = articleList.findIndex((a) => a.id === article.id);
  const prevArticle = currentIndex > 0 ? articleList[currentIndex - 1] : null;
  const nextArticle = currentIndex < articleList.length - 1 ? articleList[currentIndex + 1] : null;

  const onStar = async () => {
    try {
      const db = getDb();
      await toggleStar(db, article.id);
      await loadArticle();
    } catch (e) {
      console.error('toggleStar error:', e);
    }
  };

  const onShare = async () => {
    if (!article.url) return;
    try {
      await Share.share({ message: `${article.title ?? ''}\n${article.url}` });
    } catch (e) {
      console.error('share error:', e);
    }
  };

  const onOpenBrowser = async () => {
    if (!article.url) return;
    try {
      await WebBrowser.openBrowserAsync(article.url);
    } catch (e) {
      console.error('openBrowser error:', e);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <Stack.Screen
        options={{
          title: article.feed_title ?? '',
          headerBackButtonDisplayMode: 'minimal',
          headerRight: () => (
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={onStar} hitSlop={8}>
                <Text style={styles.headerActionBtn}>
                  {article.starred === 1 ? '★' : '☆'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onShare} hitSlop={8}>
                <Text style={styles.headerActionBtn}>↑</Text>
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: 20 }]}
      >
        <Text style={styles.meta}>
          {article.feed_title}{'  ·  '}{formatDate(article.published_at)}
        </Text>
        <Text style={styles.title}>{article.title ?? 'Untitled'}</Text>
        {article.author ? (
          <Text style={styles.author}>by {article.author}</Text>
        ) : null}

        {youtubeId ? (
          <YoutubePlayer height={videoHeight} videoId={youtubeId} play={false} />
        ) : (
          <>
            <Text style={styles.body}>{getBody(article)}</Text>
            {article.url ? (
              <TouchableOpacity style={styles.browserBtn} onPress={onOpenBrowser}>
                <Text style={styles.browserBtnText}>Open in Browser</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </ScrollView>

      <NavBar
        onPrev={() => prevArticle && router.replace(`/feeds/${feedId}/${prevArticle.id}`)}
        onNext={() => nextArticle && router.replace(`/feeds/${feedId}/${nextArticle.id}`)}
        prevDisabled={!prevArticle}
        nextDisabled={!nextArticle}
        paddingBottom={insets.bottom}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20 },
  meta: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.textSecondary,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    fontFamily: FONTS.sansBold,
    fontSize: 22,
    color: COLORS.text,
    lineHeight: 30,
    marginBottom: 8,
  },
  author: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 20,
  },
  body: {
    fontFamily: FONTS.sans,
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 26,
    marginBottom: 32,
  },
  browserBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 3,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  browserBtnText: { fontFamily: FONTS.sansBold, fontSize: 15, color: '#fff' },
  headerActions: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  headerActionBtn: {
    fontFamily: FONTS.sans,
    fontSize: 18,
    color: COLORS.accent,
  },
});
