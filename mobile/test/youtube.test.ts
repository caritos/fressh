import { expect, test, beforeEach, afterEach, mock } from 'bun:test';
import { getYouTubeVideoId, fetchYouTubeAspectRatio } from '../src/fetcher/youtube';

test('getYouTubeVideoId: extracts id from a watch URL', () => {
  expect(getYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
});

test('getYouTubeVideoId: extracts id from a youtu.be short link', () => {
  expect(getYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
});

test('getYouTubeVideoId: extracts id from an embed URL', () => {
  expect(getYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
});

test('getYouTubeVideoId: returns null for a non-YouTube URL', () => {
  expect(getYouTubeVideoId('https://example.com/article')).toBeNull();
});

test('getYouTubeVideoId: returns null for null input', () => {
  expect(getYouTubeVideoId(null)).toBeNull();
});

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = originalFetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

test('fetchYouTubeAspectRatio: returns width/height from a successful oEmbed response', async () => {
  global.fetch = mock(async () =>
    new Response(JSON.stringify({ width: 113, height: 200 }), { status: 200 })
  ) as unknown as typeof fetch;

  const result = await fetchYouTubeAspectRatio('https://www.youtube.com/watch?v=abc');
  expect(result).toEqual({ width: 113, height: 200 });
});

test('fetchYouTubeAspectRatio: returns null on a non-OK response', async () => {
  global.fetch = mock(async () => new Response('Not Found', { status: 404 })) as unknown as typeof fetch;

  const result = await fetchYouTubeAspectRatio('https://www.youtube.com/watch?v=missing');
  expect(result).toBeNull();
});

test('fetchYouTubeAspectRatio: returns null when width/height are missing from the response', async () => {
  global.fetch = mock(async () => new Response(JSON.stringify({ title: 'no dims' }), { status: 200 })) as unknown as typeof fetch;

  const result = await fetchYouTubeAspectRatio('https://www.youtube.com/watch?v=abc');
  expect(result).toBeNull();
});

test('fetchYouTubeAspectRatio: returns null when fetch throws', async () => {
  global.fetch = mock(async () => {
    throw new Error('network error');
  }) as unknown as typeof fetch;

  const result = await fetchYouTubeAspectRatio('https://www.youtube.com/watch?v=abc');
  expect(result).toBeNull();
});

test('fetchYouTubeAspectRatio: returns null on malformed JSON', async () => {
  global.fetch = mock(async () => new Response('not json', { status: 200 })) as unknown as typeof fetch;

  const result = await fetchYouTubeAspectRatio('https://www.youtube.com/watch?v=abc');
  expect(result).toBeNull();
});
