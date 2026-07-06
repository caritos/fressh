export function getRemainingUnreadAhead(
  articles: Array<{ id: number; read: number }>,
  currentArticleId: number,
  feedId: string
): number {
  if (feedId !== 'unread' && feedId !== 'today') return 0;

  const currentIndex = articles.findIndex((a) => a.id === currentArticleId);
  if (currentIndex === -1) return 0;

  return articles.slice(currentIndex + 1).filter((a) => a.read === 0).length;
}
