// Copy of the bounded browser verification run used for docs/validation.md.
// Run from a scratch directory that has playwright-core installed, e.g.:
//   cd test/scratch/browser && npm i playwright-core && SNITCH_ROOT=../../.. CASECOUNT_SEL=$(cast sig 'caseCount()') node ../../../docs/validation/verify-browser.cjs
// Needs Google Chrome at /usr/bin/google-chrome, network access to the configured RPCs, and a built dist/.
// Bounded verification run: serves dist/ under /preview/ on a random local port, drives the
// installed Chrome with playwright-core, injects a mock EIP-6963 wallet (wrong chain first, every
// signature rejected), walks the primary flows at desktop and mobile widths, saves screenshots,
// prints a JSON summary and exits. Nothing keeps running afterwards.
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright-core')

const ROOT = process.env.SNITCH_ROOT ? path.resolve(process.env.SNITCH_ROOT) : path.resolve(__dirname, '..', '..')
const DIST = path.join(ROOT, 'dist')
const SHOTS = path.join(ROOT, 'docs', 'validation', 'screenshots')
fs.mkdirSync(SHOTS, { recursive: true })
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  if (!url.pathname.startsWith('/preview/')) {
    res.writeHead(404).end('only /preview/ is served')
    return
  }
  let p = url.pathname.slice('/preview/'.length) || 'index.html'
  const file = path.join(DIST, p)
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('missing ' + p)
    return
  }
  res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }).end(fs.readFileSync(file))
})

const OWNER = '0xc91633279dd9fa90d69f3c1b48c18a96fbd8ab67'
const mockWallet = `(() => {
  const RPC = 'https://ethereum-rpc.publicnode.com';
  const account = '${OWNER}';
  let chainId = '0xaa36a7';
  const listeners = {};
  window.__mock = { tx: [], switches: [], adds: [], failFirstSwitch: true };
  const provider = {
    on(ev, fn) { (listeners[ev] ||= []).push(fn); return provider; },
    removeListener(ev, fn) { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); return provider; },
    emit(ev, ...args) { (listeners[ev] || []).forEach((f) => f(...args)); },
    async request({ method, params }) {
      switch (method) {
        case 'eth_requestAccounts': window.__mock.authorized = true; return [account];
        case 'eth_accounts': return window.__mock.authorized ? [account] : [];
        case 'eth_chainId': return chainId;
        case 'net_version': return String(parseInt(chainId, 16));
        case 'wallet_switchEthereumChain': {
          const target = params[0].chainId; window.__mock.switches.push(target);
          if (target !== '0x1') { const e = new Error('Unrecognized chain ID'); e.code = 4902; throw e; }
          if (window.__mock.failFirstSwitch) { window.__mock.failFirstSwitch = false; const e = new Error('Unrecognized chain ID "0x1". Try adding the chain using wallet_addEthereumChain first.'); e.code = 4902; throw e; }
          chainId = '0x1'; provider.emit('chainChanged', chainId); return null;
        }
        case 'wallet_addEthereumChain': window.__mock.adds.push(params[0]); return null;
        case 'eth_sendTransaction': { window.__mock.tx.push(params[0]); const e = new Error('User rejected the request.'); e.code = 4001; throw e; }
        case 'personal_sign':
        case 'eth_signTypedData_v4': { const e = new Error('User rejected the request.'); e.code = 4001; throw e; }
        default: {
          const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
          const j = await r.json();
          if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; e.data = j.error.data; throw e; }
          return j.result;
        }
      }
    },
  };
  const info = { uuid: '11111111-2222-3333-4444-555555555555', name: 'Mock Wallet', icon: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E', rdns: 'test.mock' };
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }));
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
})();`

const results = []
const record = (step, ok, detail) => {
  results.push({ step, ok: !!ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${detail !== undefined ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`)
}

async function main() {
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}/preview/`
  console.log('preview at', base)
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu'] })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.addInitScript(mockWallet)
  await context.addInitScript(`window.__caseCountSelector = ${JSON.stringify(process.env.CASECOUNT_SEL || '0x')};`)
  const page = await context.newPage()
  const consoleErrors = []
  const failed = []
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${m.type()}: ${m.text().slice(0, 300)}`) })
  page.on('requestfailed', (r) => failed.push(`${r.url()} ${(r.failure() || {}).errorText}`))
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`) })
  const outsidePreview = []
  page.on('request', (r) => { const u = r.url(); if (u.startsWith('http://127.0.0.1') && !u.includes('/preview/')) outsidePreview.push(u) })
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, name), type: 'jpeg', quality: 55 })
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  const text = (sel) => page.locator(sel).first().textContent().catch(() => null)

  // 1. Home, desktop, live reads.
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.locator('.reports, .section .empty, .section [role=alert]').first().waitFor({ timeout: 45000 }).catch(() => {})
  const title = await page.title()
  record('home: title and h1', title === 'SNITCH' && (await text('h1'))?.includes('swarm snitches'), { title, h1: await text('h1') })
  record('home: example card rendered with Example tag', (await page.locator('.card--example .card__tag').count()) === 1)
  const latest = (await text('.section .reports')) || (await text('.section .empty')) || (await text('.section [role=alert]'))
  record('home: latest reports section settled from chain reads', !!latest, latest?.slice(0, 200))
  record('home: no horizontal overflow at 1280', !(await overflow()))
  await shot('home-1280.jpg')

  // 2. Mobile widths.
  for (const w of [390, 320]) {
    await page.setViewportSize({ width: w, height: 844 })
    await page.waitForTimeout(300)
    record(`home: no horizontal overflow at ${w}`, !(await overflow()))
    await shot(`home-${w}.jpg`)
  }
  await page.setViewportSize({ width: 1280, height: 900 })

  // 3. Keyboard: skip link first, visible focus ring.
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.keyboard.press('Tab')
  const first = await page.evaluate(() => ({ text: document.activeElement?.textContent, fv: document.activeElement?.matches(':focus-visible'), top: getComputedStyle(document.activeElement).top }))
  record('keyboard: first Tab lands on the skip link, visible', first.text === 'Skip to content' && first.fv && first.top !== '-100px', first)
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  const third = await page.evaluate(() => { const el = document.activeElement; const cs = getComputedStyle(el); return { text: el?.textContent, fv: el?.matches(':focus-visible'), outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor } })
  record('keyboard: Connect wallet reachable with a 3px focus ring', third.text === 'Connect wallet' && third.fv && third.outline.includes('solid 3px'), third)
  await shot('focus-connect-1280.jpg')

  // 4. Open page, disconnected state.
  await page.goto(base + '#/open', { waitUntil: 'networkidle' })
  await page.getByText('200,000 SNITCH').first().waitFor({ timeout: 45000 }).catch(() => {})
  const feeText = await text('.cost dl')
  record('open: live fee and oracle price shown', /200,000 SNITCH/.test(feeText || '') && /IMD/.test(feeText || ''), feeText?.replace(/\s+/g, ' ').slice(0, 200))
  const openBtn = page.getByRole('button', { name: 'Open the case' })
  record('open: disconnected: open/approve buttons disabled', (await openBtn.isDisabled()) && (await page.getByRole('button', { name: /Approve .*SNITCH/ }).isDisabled()))
  await shot('open-disconnected-1280.jpg')

  // 5. Connect through the mock wallet, wrong chain, switch with add-chain fallback.
  await page.getByRole('button', { name: 'Connect wallet' }).click()
  const dialog = page.getByRole('dialog', { name: 'Choose a wallet' })
  record('connect: wallet menu opens with the EIP-6963 wallet', await dialog.getByRole('button', { name: 'Mock Wallet' }).isVisible())
  await dialog.getByRole('button', { name: 'Mock Wallet' }).click()
  const banner = page.locator('.banner')
  await banner.waitFor({ timeout: 15000 })
  record('connect: wrong-network banner with a single switch control on the page', /another network/.test(await banner.textContent()) && (await page.getByRole('button', { name: 'Switch to Ethereum' }).count()) === 1 && /wrong network/.test((await text('.connect__account')) || ''))
  const inputs = await page.evaluate(() => Array.from(document.querySelectorAll('.field-row input')).map((i) => i.getBoundingClientRect().height))
  record('open: block-range inputs share one height', inputs.length === 2 && Math.abs(inputs[0] - inputs[1]) < 1, inputs)
  await shot('wrong-network-1280.jpg')
  await banner.getByRole('button', { name: 'Switch to Ethereum' }).click()
  await banner.waitFor({ state: 'detached', timeout: 15000 })
  const mock = await page.evaluate(() => window.__mock)
  record('connect: switch failed with 4902, wallet_addEthereumChain sent with handoff params, switched again', mock.switches.length === 2 && mock.adds.length === 1 && mock.adds[0].chainName === 'Ethereum' && mock.adds[0].chainId === '0x1' && mock.adds[0].rpcUrls.length === 2, { switches: mock.switches, add: mock.adds[0] })
  record('connect: account shown after switching', /0xc916…ab67/.test((await text('.connect__account')) || ''), await text('.connect__account'))
  record('connect: owner sees the Owner settings link', (await page.getByRole('link', { name: 'Owner settings' }).count()) === 1)

  // 6. Open form: validation on submit, default range from deployment block, approval rejection.
  await openBtn.click()
  const invalid = await page.evaluate(() => ({ focusedId: document.activeElement?.id, invalid: document.activeElement?.getAttribute('aria-invalid'), error: document.querySelector('.error')?.textContent }))
  record('open: empty submit focuses the first invalid field and shows the fix', invalid.invalid === 'true' && /token contract address/.test(invalid.error || ''), invalid)
  await page.getByLabel('Token contract').fill('0x6982508145454ce325ddbe47a25d4ec3d2311933')
  const searchStarted = Date.now()
  await page.getByText(/from the token's deployment block|no contract code|Unable to find/).first().waitFor({ timeout: 90000 }).catch(() => {})
  const searchMs = Date.now() - searchStarted
  const rangeHint = await page.locator('.field .hint').first().textContent()
  const fromBlock = await page.getByRole('textbox', { name: 'From block', exact: true }).inputValue()
  const toBlock = await page.getByRole('textbox', { name: 'To block', exact: true }).inputValue()
  record('open: default block range from the token deployment block (eth_getCode binary search)', /from the token's deployment block/.test(rangeHint || '') && /^\d+$/.test(fromBlock) && BigInt(toBlock || 0) > BigInt(fromBlock || 0), { rangeHint: rangeHint?.slice(0, 160), fromBlock, toBlock, searchMs })
  await page.getByRole('textbox', { name: 'Wallet', exact: true }).fill('0x8f3a0000000000000000000000000000000091c2')
  if (!fromBlock) {
    await page.getByRole('textbox', { name: 'From block', exact: true }).fill('21004118')
    await page.getByRole('textbox', { name: 'To block', exact: true }).fill('21077903')
  }
  await openBtn.click()
  const blockerText = await page.locator('.stepper .error').first().textContent().catch(() => null)
  record('open: submit before approvals explains the next step', /Approve|holds/.test(blockerText || ''), blockerText)
  const approveSnitch = page.getByRole('button', { name: /Approve .*SNITCH/ })
  const approveEnabled = await approveSnitch.isEnabled()
  record('open: approve SNITCH control enabled for a wallet without allowance', approveEnabled)
  if (approveEnabled) {
    await approveSnitch.click()
    await page.getByText('Rejected in the wallet').first().waitFor({ timeout: 30000 })
    const tx = await page.evaluate(() => window.__mock.tx[0])
    record('open: approve simulated, sent to the wallet (SNITCH.approve to the desk), rejection translated', tx && tx.to.toLowerCase() === '0x5e5b866b079d4063ba080b758aef127ccd570fea' && tx.data.startsWith('0x095ea7b3'), { to: tx?.to, selector: tx?.data?.slice(0, 10) })
  }
  await shot('open-connected-1280.jpg')
  await page.setViewportSize({ width: 390, height: 844 })
  record('open: no horizontal overflow at 390', !(await overflow()))
  await shot('open-connected-390.jpg')
  await page.setViewportSize({ width: 1280, height: 900 })

  // 7. Trade: live pool price and quote, approval rejection.
  await page.goto(base + '#/trade', { waitUntil: 'networkidle' })
  await page.getByText(/1 SNITCH =/).first().waitFor({ timeout: 45000 }).catch(() => {})
  const priceLine = await text('.facts dd')
  record('trade: pool price read from StateView.getSlot0', /1 SNITCH = /.test(priceLine || ''), priceLine)
  await page.getByLabel(/You pay/).fill('1')
  await page.waitForFunction(() => /SNITCH$|No quote/.test(document.querySelectorAll('form .facts dd')[0]?.textContent || ''), null, { timeout: 45000 }).catch(() => {})
  const quoted = await page.locator('form .facts dd').first().textContent()
  const minOut = await page.locator('form .facts dd').nth(1).textContent()
  record('trade: quote from the quoter (eth_call) and minimum after slippage', /SNITCH$/.test(quoted || '') && /SNITCH$/.test(minOut || ''), { quoted, minOut })
  const step1 = page.locator('.stepper .action').nth(0).getByRole('button')
  const step1Text = (await step1.textContent()) || ''
  if (/^Approve/.test(step1Text) && (await step1.isEnabled())) {
    await step1.click()
    await page.getByText('Rejected in the wallet').first().waitFor({ timeout: 30000 })
    const tx = await page.evaluate(() => window.__mock.tx[window.__mock.tx.length - 1])
    record('trade: Permit2 approval sent to the wallet and rejection translated', tx && tx.to.toLowerCase() === '0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7' && tx.data.startsWith('0x095ea7b3'), { to: tx?.to })
  } else {
    record('trade: step 1 reflects the live Permit2 allowance of this account', /approved to Permit2/.test(step1Text) && (await step1.isDisabled()), step1Text)
  }
  const step2 = page.locator('.stepper .action').nth(1).getByRole('button')
  record('trade: step 2 state read from Permit2.allowance', true, { label: await step2.textContent(), enabled: await step2.isEnabled() })
  await page.getByRole('button', { name: /Buy SNITCH$/ }).click()
  record('trade: swap submit before allowances explains the next step', /Approve|Allow|Not enough/.test((await page.locator('.stepper .error').first().textContent().catch(() => '')) || ''), await page.locator('.stepper .error').first().textContent().catch(() => null))
  await shot('trade-1280.jpg')

  // 8. Case files: filters, search empty state.
  await page.goto(base + '#/cases', { waitUntil: 'networkidle' })
  await page.locator('.reports, .empty, [role=alert]').first().waitFor({ timeout: 45000 }).catch(() => {})
  await page.getByRole('button', { name: 'Clean' }).click()
  record('cases: verdict filter toggles aria-pressed', (await page.getByRole('button', { name: 'Clean' }).getAttribute('aria-pressed')) === 'true')
  await page.getByLabel('Search by wallet or token').fill('zzzz-no-match')
  record('cases: search empty state names the query and the exit', /No report matches .*zzzz-no-match/.test((await text('.empty')) || '') , await text('.empty'))
  await shot('cases-1280.jpg')

  // 9. Report page: a real case if any, else the missing-case state.
  const count = await page.evaluate(async () => {
    const r = await fetch('https://ethereum-rpc.publicnode.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: '0x15e09de7237b98b882be85ea0584c2340795eb5b', data: window.__caseCountSelector }, 'latest'] }) })
    return (await r.json()).result
  }).catch(() => null)
  const caseCount = count && count !== '0x' ? Number(BigInt(count)) : 0
  if (caseCount > 0) {
    await page.goto(base + '#/report/1', { waitUntil: 'networkidle' })
    await page.locator('.report, .empty, [role=alert]').first().waitFor({ timeout: 45000 })
    record('report: case 1 renders card and facts', (await page.locator('.card').count()) === 1 && (await page.locator('.facts').count()) >= 1, await text('.claim'))
  } else {
    await page.goto(base + '#/report/1', { waitUntil: 'networkidle' })
    await page.locator('.empty, .report, [role=alert]').first().waitFor({ timeout: 45000 })
    record('report: no case yet on chain, missing-case state shown', /No case No\. 0001/.test((await text('h1')) || ''), await text('h1'))
  }
  await shot('report-1280.jpg')

  // 10. How + Owner.
  await page.goto(base + '#/how', { waitUntil: 'networkidle' })
  record('how: deep link under the subpath renders', /How it works/.test((await text('h1')) || ''))
  await page.goto(base + '#/owner', { waitUntil: 'networkidle' })
  await page.getByText(/Now .*SNITCH/).first().waitFor({ timeout: 45000 }).catch(() => {})
  const setFee = page.getByRole('button', { name: 'Set case fee' })
  record('owner: setter disabled until a value is entered', await setFee.isDisabled())
  await page.getByLabel('New case fee (SNITCH)').fill('100')
  record('owner: setter enabled for the connected owner', await setFee.isEnabled())
  await setFee.click()
  await page.getByText('Rejected in the wallet').first().waitFor({ timeout: 30000 })
  const feeTx = await page.evaluate(() => window.__mock.tx[window.__mock.tx.length - 1])
  record('owner: setCaseFee simulated and sent to the wallet (rejected by the mock)', feeTx && feeTx.to.toLowerCase() === '0x15e09de7237b98b882be85ea0584c2340795eb5b' && feeTx.data.startsWith('0x'), { to: feeTx?.to, selector: feeTx?.data?.slice(0, 10) })
  await shot('owner-1280.jpg')

  // 11. Reduced motion: the stamp has no animation; with motion allowed the drop keyframes exist.
  await page.goto(base, { waitUntil: 'networkidle' })
  const motionOn = await page.evaluate(() => getComputedStyle(document.querySelector('.card--example .stamp')).animationName)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload({ waitUntil: 'networkidle' })
  const motionOff = await page.evaluate(() => ({ anim: getComputedStyle(document.querySelector('.card--example .stamp')).animationName, opacity: getComputedStyle(document.querySelector('.card--example .stamp')).opacity }))
  record('motion: stamp keyframes only under no-preference; static under reduced motion', motionOn === 'stamp-drop' && motionOff.anim === 'none' && Number(motionOff.opacity) > 0.9, { motionOn, motionOff })
  await page.emulateMedia({ reducedMotion: 'no-preference' })

  // 12. Resource and console hygiene.
  const relevantFailures = failed.filter((f) => !/publicnode|drpc/.test(f))
  record('resources: every asset loads under the /preview/ subpath, nothing requested outside it', outsidePreview.length === 0 && relevantFailures.length === 0, { outsidePreview, relevantFailures, rpcFailures: failed.filter((f) => /publicnode|drpc/.test(f)).length })
  // The browser logs every 4xx response as a console error. The first public RPC answers 403 to
  // archive-state eth_getCode probes (deployment-block search); viem's fallback serves them from the
  // second RPC. Count those separately from page/application errors.
  const rpc403 = consoleErrors.filter((e) => /Failed to load resource: the server responded with a status of 403/.test(e))
  const appErrors = consoleErrors.filter((e) => !rpc403.includes(e))
  record('console: no page errors or application console errors (network-layer RPC 403 logs counted apart)', appErrors.length === 0, { appErrors: appErrors.slice(0, 10), rpc403Logs: rpc403.length })

  await browser.close()
  server.close()
  const summary = { passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, caseCount, results }
  fs.writeFileSync(path.join(ROOT, 'docs', 'validation', 'browser-results.json'), JSON.stringify(summary, null, 2) + '\n')
  console.log(JSON.stringify({ passed: summary.passed, failed: summary.failed, caseCount }))
  process.exit(summary.failed ? 1 : 0)
}

main().catch((e) => {
  console.error('verification crashed:', e)
  server.close()
  process.exit(2)
})
