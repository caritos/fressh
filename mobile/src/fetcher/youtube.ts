export function getYouTubeVideoId(url: string | null): string | null {
  if (!url) return null;
  const m =
    url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) ||
    url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) ||
    url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export async function fetchYouTubeAspectRatio(
  url: string
): Promise<{ width: number; height: number } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oembedUrl, { signal: controller.signal });
    if (!res.ok) return null;

    const data = (await res.json()) as { width?: unknown; height?: unknown };
    const { width, height } = data;
    if (typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0) {
      return { width, height };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
