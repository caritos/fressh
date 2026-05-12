import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { useLocalSearchParams, Stack, useRouter, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { getDb } from '../../../src/db/database';
import { getArticle, toggleStar, getArticles, type ArticleRow } from '../../../src/db/queries';
import { FONTS, COLORS } from '../../../src/constants';

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

function getBody(article: ArticleRow): string {
  if (article.content_text?.trim()) return article.content_text;
  if (article.content_html?.trim()) return stripHtml(article.content_html);
  if (article.summary?.trim()) return article.summary;
  return '(No content available — open in browser to read the full article.)';
}

export default function ArticleReaderScreen() {
  const router = useRouter();
  const { feedId, articleId } = useLocalSearchParams<{ feedId: string; articleId: string }>();
  const [article, setArticle] = useState<ArticleRow | null>(null);
  const [articleList, setArticleList] = useState<ArticleRow[]>([]);

  const load = useCallback(async () => {
    try {
      const db = getDb();
      const a = await getArticle(db, Number(articleId));
      setArticle(a);
      const feedIdParam =
        feedId === 'unread' || feedId === 'starred' || feedId === 'today'
          ? feedId
          : Number(feedId);
      const list = await getArticles(db, feedIdParam);
      setArticleList(list);
    } catch (e) {
      console.error('ArticleReader load error:', e);
    }
  }, [articleId, feedId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!article) return null;

  const currentIndex = articleList.findIndex((a) => a.id === article.id);
  const prevArticle = currentIndex > 0 ? articleList[currentIndex - 1] : null;
  const nextArticle = currentIndex < articleList.length - 1 ? articleList[currentIndex + 1] : null;

  const onStar = async () => {
    try {
      const db = getDb();
      await toggleStar(db, article.id);
      await load();
    } catch (e) {
      console.error('toggleStar error:', e);
    }
  };

  const onShare = async () => {
    if (article.url) await Share.share({ url: article.url, message: article.title ?? '' });
  };

  const onOpenBrowser = async () => {
    if (article.url) await WebBrowser.openBrowserAsync(article.url);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: article.feed_title ?? '',
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
              {prevArticle && (
                <TouchableOpacity onPress={() => router.replace(`/feeds/${feedId}/${prevArticle.id}`)}>
                  <Text style={styles.navBtn}>‹ Prev</Text>
                </TouchableOpacity>
              )}
              {nextArticle && (
                <TouchableOpacity onPress={() => router.replace(`/feeds/${feedId}/${nextArticle.id}`)}>
                  <Text style={styles.navBtn}>Next ›</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onStar}>
                <Text style={styles.navBtn}>{article.starred ? '★' : '☆'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onShare}>
                <Text style={styles.navBtn}>↑</Text>
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.meta}>
          {article.feed_title}{'  ·  '}{formatDate(article.published_at)}
        </Text>
        <Text style={styles.title}>{article.title ?? 'Untitled'}</Text>
        {article.author ? (
          <Text style={styles.author}>by {article.author}</Text>
        ) : null}
        <Text style={styles.body}>{getBody(article)}</Text>
        <TouchableOpacity style={styles.browserBtn} onPress={onOpenBrowser}>
          <Text style={styles.browserBtnText}>Open in Browser</Text>
        </TouchableOpacity>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  navBtn: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.accent },
  scroll: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, paddingBottom: 60 },
  meta: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.text,
    lineHeight: 30,
    marginBottom: 8,
  },
  author: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 20,
  },
  body: {
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 26,
    marginBottom: 32,
  },
  browserBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  browserBtnText: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
});
