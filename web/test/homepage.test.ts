import { describe, expect, test } from 'bun:test'
import app from '../src/index'

describe('GET /', () => {
  async function getHome() {
    const res = await app.fetch(new Request('http://localhost/'))
    return { res, html: await res.text() }
  }

  test('returns 200', async () => {
    const { res } = await getHome()
    expect(res.status).toBe(200)
  })

  test('contains App Store link', async () => {
    const { html } = await getHome()
    expect(html).toContain('apps.apple.com/app/id6770117291')
  })

  test('headline copy', async () => {
    const { html } = await getHome()
    expect(html).toContain('Read.')
    expect(html).toContain('Nothing')
    expect(html).toContain('extra.')
  })

  test('contains all 6 feature labels', async () => {
    const { html } = await getHome()
    expect(html).toContain('RSS &amp; Atom')
    expect(html).toContain('Import OPML')
    expect(html).toContain('Star articles')
    expect(html).toContain('No account')
    expect(html).toContain('Full articles')
    expect(html).toContain('Auto-read')
  })

  test('logo has Braun orange treatment', async () => {
    const { html } = await getHome()
    expect(html).toContain('logo-rss')
    expect(html).toContain('#FF6200')
  })

  test('phone mockup screenshot img present', async () => {
    const { html } = await getHome()
    expect(html).toContain('/public/screenshots/screenshot-1.png')
  })
})
