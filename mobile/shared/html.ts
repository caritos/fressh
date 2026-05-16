export function isHtmlPage(content: string): boolean {
  const t = content.trim().slice(0, 500).toLowerCase();
  return (
    t.startsWith('<!doctype html') ||
    t.startsWith('<html') ||
    t.includes('<head>') ||
    t.includes('<body>')
  );
}

export function stripHtml(html: string): string {
  if (!html) return '';
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
