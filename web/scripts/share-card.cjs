// Optional design-asset regeneration, using the existing production CSS and example ReportCard.
// Run after build + manifest. See README for the separate Playwright tooling installation.
// Normal builds copy the committed PNG from public/ and do not need a browser.
const { chromium } = require('playwright')
const { createServer } = require('node:http')
const { readFileSync, existsSync } = require('node:fs')
const path = require('node:path')

const dist = path.resolve(__dirname, '../../dist')
const output = path.resolve(__dirname, '../public/share-card.png')
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }
const server = createServer((request, response) => {
  const pathname = new URL(request.url, 'http://local').pathname
  if (pathname === '/preview/share-frame') {
    response.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>Share card renderer</title>')
    return
  }
  const file = path.resolve(dist, pathname.slice('/preview/'.length) || 'index.html')
  if (!pathname.startsWith('/preview/') || !file.startsWith(dist + path.sep) || !existsSync(file)) {
    response.writeHead(404).end()
    return
  }
  response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }).end(readFileSync(file))
})

async function main() {
  let browser
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}/preview/`
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
    // The sample is local. No live RPC, wallet, external fonts or scripts are needed.
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort())
    const source = await context.newPage()
    await source.goto(base)
    await source.locator('.card--example').waitFor()
    const content = await source.evaluate(() => ({
      css: document.querySelector('link[rel="stylesheet"]').href,
      card: document.querySelector('.card--example').outerHTML,
      brand: document.querySelector('.brand').textContent.trim(),
      title: document.querySelector('.hero > h1').textContent,
      description: document.querySelector('.hero > .lede').textContent,
    }))
    await source.close()
    const page = await context.newPage()
    await page.goto(base + 'share-frame')
    await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8">
      <link rel="stylesheet" href="${content.css}">
      <style>
        body { width: 1200px; height: 630px; }
        .share { width: 1200px; height: 630px; padding: 48px; display: grid;
          grid-template-columns: minmax(0, 1fr) 372px; gap: 48px; align-items: center; }
        .share__kicker { font-family: var(--font-mono); font-size: 16px;
          text-transform: uppercase; letter-spacing: .06em; margin-bottom: 16px; }
        .share__brand { font-family: var(--font-headline); font-weight: 700;
          font-size: 144px; line-height: .95; letter-spacing: -.01em; margin-bottom: 24px; }
        .share__title { font-size: 52px; line-height: 1.1; text-wrap: balance;
          margin-bottom: 24px; max-width: 640px; }
        .share__description { font-size: 24px; line-height: 1.5; max-width: 620px; margin: 0; }
        .share .card { max-width: none; }
        .share .card__tag { font-size: 20px; }
      </style></head><body><main class="share"><section>
      <p class="share__kicker">On-chain case files</p>
      <div class="share__brand"></div><h1 class="share__title"></h1>
      <p class="share__description"></p></section><div class="share__report"></div>
      </main></body></html>`)
    await page.evaluate(content => {
      document.querySelector('.share__brand').textContent = content.brand
      document.querySelector('.share__title').textContent = content.title
      document.querySelector('.share__description').textContent = content.description
      document.querySelector('.share__report').innerHTML = content.card
    }, content)
    await page.evaluate(async () => {
      await Promise.all([document.fonts.load('700 52px "Archivo Narrow"'), document.fonts.load('400 16px "IBM Plex Mono"')])
      await document.fonts.ready
    })
    const fontsLoaded = await page.evaluate(() => document.fonts.check('700 52px "Archivo Narrow"') && document.fonts.check('400 16px "IBM Plex Mono"'))
    if (!fontsLoaded) throw new Error('Bundled share-card fonts did not load')
    const fits = await page.evaluate(() => {
      const elements = document.querySelectorAll('.share > *, .share__title, .share__description, .card__tag')
      return [...elements].every(element => {
        const box = element.getBoundingClientRect()
        return box.left >= 48 && box.right <= 1152 && box.top >= 48 && box.bottom <= 582
      })
    })
    if (!fits) throw new Error('Share-card content exceeds its safe margins')
    await page.screenshot({ path: output, type: 'png' })
    console.log(`Wrote ${path.relative(process.cwd(), output)} (1200×630, ${readFileSync(output).length} bytes). Rebuild and regenerate the manifest.`)
  } finally {
    if (browser) await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
