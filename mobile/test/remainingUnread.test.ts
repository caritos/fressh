import { expect, test } from 'bun:test';
import { getRemainingUnreadAhead } from '../src/reader/remainingUnread';

test('getRemainingUnreadAhead: counts unread articles after the current one', () => {
  const articles = [
    { id: 1, read: 0 },
    { id: 2, read: 0 },
    { id: 3, read: 0 },
    { id: 4, read: 0 },
  ];
  expect(getRemainingUnreadAhead(articles, 2, 'unread')).toBe(2);
});

test('getRemainingUnreadAhead: excludes already-read articles ahead (Today filter case)', () => {
  const articles = [
    { id: 1, read: 1 },
    { id: 2, read: 0 },
    { id: 3, read: 1 },
    { id: 4, read: 0 },
    { id: 5, read: 0 },
  ];
  expect(getRemainingUnreadAhead(articles, 2, 'today')).toBe(2);
});

test('getRemainingUnreadAhead: is 0 for the last article in the list', () => {
  const articles = [
    { id: 1, read: 0 },
    { id: 2, read: 0 },
  ];
  expect(getRemainingUnreadAhead(articles, 2, 'unread')).toBe(0);
});

test('getRemainingUnreadAhead: is 0 when the current article is not found in the list', () => {
  const articles = [
    { id: 1, read: 0 },
    { id: 2, read: 0 },
  ];
  expect(getRemainingUnreadAhead(articles, 999, 'unread')).toBe(0);
});

test('getRemainingUnreadAhead: is 0 for filters other than unread/today', () => {
  const articles = [
    { id: 1, read: 0 },
    { id: 2, read: 0 },
    { id: 3, read: 0 },
  ];
  expect(getRemainingUnreadAhead(articles, 1, 'all')).toBe(0);
  expect(getRemainingUnreadAhead(articles, 1, 'starred')).toBe(0);
  expect(getRemainingUnreadAhead(articles, 1, '42')).toBe(0);
});

test('getRemainingUnreadAhead: empty list returns 0', () => {
  expect(getRemainingUnreadAhead([], 1, 'unread')).toBe(0);
});
