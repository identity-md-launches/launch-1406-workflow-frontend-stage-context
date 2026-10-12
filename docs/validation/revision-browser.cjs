// Deterministic production-export regression checks. No live RPC or signed transactions.
// Requires Node 24, web dependencies, and Playwright (installed in test/scratch/browser).
// NODE_PATH="$PWD/test/scratch/browser/node_modules" PLAYWRIGHT_BROWSERS_PATH=/tmp/snitch-browsers \
//   node docs/validation/revision-browser.cjs [--baseline]
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { chromium } = require('playwright')
const ROOT = path.resolve(__dirname, '../..')
const fromWeb = createRequire(path.join(ROOT, 'web/package.json'))
const { decodeFunctionData, encodeFunctionResult, encodeEventTopics, encodeAbiParameters, erc20Abi, toHex } = fromWeb('viem')
const { permit2Abi, quoterAbi, stateViewAbi, universalRouterAbi } = require(path.join(ROOT, 'web/src/config.ts'))
const baseline = process.argv.includes('--baseline')
const liveReads = process.argv.includes('--live-reads')
const DIST = path.join(ROOT, baseline ? 'test/scratch/baseline-dist' : 'dist')
const manifest = JSON.parse(fs.readFileSync(path.join(DIST, 'imd-deployment.json')))
const handoff = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/deployment/deployment.json')))
const desk = manifest.contracts.find(c => c.name === 'SnitchDesk')
const token = manifest.contracts.find(c => c.name === 'LaunchToken').address
const deskAbi = JSON.parse(fs.readFileSync(path.join(DIST, desk.abiPath)))
const uni = manifest.network.uniswapV4
const firstBlock = BigInt(handoff.contracts[0].blockNumber)
const latest = firstBlock + 500n
// These account/NFT addresses are mock-only; the runtime manifest is served unchanged.
const account = '0x1111111111111111111111111111111111111111'
const reports = '0x2222222222222222222222222222222222222222'
const word = '0x' + 'ab'.repeat(32)
const sqrt = 128792602073356601575926592n
const unit = 10n ** 18n
const logs = []
function makeLog(eventName, args, blockNumber, logIndex) {
  const event = deskAbi.find(e => e.type === 'event' && e.name === eventName)
  const nonindexed = event.inputs.filter(i => !i.indexed)
  return {
    address: desk.address, blockNumber: toHex(blockNumber), logIndex: toHex(logIndex),
    transactionIndex: '0x0', transactionHash: word, blockHash: word, removed: false,
    topics: encodeEventTopics({ abi: deskAbi, eventName, args }),
    data: encodeAbiParameters(nonindexed, nonindexed.map(i => args[i.name])),
  }
}
for (let id = 1n; id <= 6n; id++) {
  logs.push(makeLog('CaseOpened', { caseId: id, opener: account, kind: 0, token, wallet: account, fromBlock: firstBlock, toBlock: firstBlock + 1n, symbol: 'SNITCH', fee: 200000n * unit, oraclePrice: unit / 2n, requestId: word }, firstBlock + id, 0))
  logs.push(makeLog('CaseAnswered', { caseId: id, verdict: id % 2n === 1n, figure: 0n, panelSize: 12, agreed: 11, oracleRequestId: word, questionHash: word }, firstBlock + (id === 1n ? 106n : 100n + id), id === 1n ? 2 : 1))
}
// Filing an older report later must not make it a newer answer.
logs.push(makeLog('ReportFiled', { caseId: 3n, to: account }, firstBlock + 200n, 0))

function rawCase(id) {
  return { opener: account, openedAt: 1760000000n, kind: 0, status: id === 3n ? 3 : 2,
    verdict: id % 2n === 1n, token, fromBlock: firstBlock, askedPanelSize: 12, askedQuorum: 8,
    wallet: account, toBlock: firstBlock + 1n, fee: 200000n * unit,
    issuedAt: id === 1n ? 1760000100n : 1760000000n + id, panelSize: 12, agreed: 11,
    figure: 0n, symbol: 'SNITCH' }
}
const requests = []
const unhandled = []
const scenario = { codeDelay: 0, codeError: false, quoteDelay: 0, allowance: 0n, allowanceDelay: 0, allowanceError: false, permitAllowance: null }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function rpc(payload) {
  const { id, method, params = [] } = payload
  requests.push({ method, params })
  try {
    let result
    if (method === 'eth_chainId') result = '0x1'
    else if (method === 'eth_blockNumber') result = toHex(latest)
    else if (method === 'eth_getCode') {
      if (scenario.codeDelay) await pause(scenario.codeDelay)
      if (scenario.codeError) throw new Error('fixture archive unavailable')
      result = params[1] === 'latest' || BigInt(params[1]) >= firstBlock ? '0x60006000' : '0x'
    } else if (method === 'eth_getLogs') {
      const f = params[0]
      result = logs.filter(l => l.address.toLowerCase() === f.address.toLowerCase() &&
        BigInt(l.blockNumber) >= BigInt(f.fromBlock ?? 0) && BigInt(l.blockNumber) <= (f.toBlock === 'latest' ? latest : BigInt(f.toBlock)) &&
        (!f.topics?.[0] || (Array.isArray(f.topics[0]) ? f.topics[0].includes(l.topics[0]) : f.topics[0] === l.topics[0])))
    } else if (method === 'eth_call') {
      const { to, data } = params[0]
      const target = to.toLowerCase()
      const abi = target === desk.address.toLowerCase() ? deskAbi
        : target === uni.permit2.toLowerCase() ? permit2Abi
        : target === uni.stateView.toLowerCase() ? stateViewAbi
        : target === uni.quoter.toLowerCase() ? quoterAbi
        : target === uni.universalRouter.toLowerCase() ? universalRouterAbi : erc20Abi
      const { functionName: name, args } = decodeFunctionData({ abi, data })
      if (name === 'allowance') {
        if (scenario.allowanceDelay) await pause(scenario.allowanceDelay)
        if (scenario.allowanceError) throw new Error('fixture allowance unavailable')
      }
      if (name === 'quoteExactInputSingle' && scenario.quoteDelay) await pause(scenario.quoteDelay)
      const values = {
        caseCount: 6n, caseFee: 200000n * unit, oraclePrice: unit / 2n, owner: account,
        reports, intake: handoff.manifest.contracts.find(c => c.contract === 'SnitchDesk').constructorArgs[3],
        panelSize: 12, quorum: 8, failureHook: false, action: word, oracleSigner: account,
        pendingOwner: reports, failed: false, balanceOf: 1000000n * unit, decimals: 18,
        symbol: 'SNITCH', approve: abi === erc20Abi ? true : undefined,
        getSlot0: [sqrt, -100, 0, 12500], quoteExactInputSingle: [300000n * unit, 120000n],
        allowance: abi === permit2Abi ? [scenario.permitAllowance ?? scenario.allowance, 2000000000, 0] : scenario.allowance,
        getCase: name === 'getCase' ? rawCase(args[0]) : undefined,
        openCaseWithLimits: 7n, fileReport: undefined, dropCase: undefined, execute: undefined,
        setCaseFee: undefined, setPanel: undefined, setIntake: undefined, setAction: undefined,
        setOracleSigner: undefined, setFailureHook: undefined,
      }
      if (!(name in values)) throw new Error(`unhandled call ${name}`)
      result = encodeFunctionResult({ abi, functionName: name, result: values[name] })
    } else throw new Error(`unhandled method ${method}`)
    return { jsonrpc: '2.0', id, result }
  } catch (e) {
    if (!String(e.message).startsWith('fixture')) unhandled.push(e.message)
    return { jsonrpc: '2.0', id, error: { code: -32602, message: e.message } }
  }
}
const wallet = `(() => {
  let chain = '0xaa36a7'; const listeners = {}; let authorized = false;
  window.__wallet = { tx: [], switches: [], adds: [], first: true };
  const provider = {
    on(e, fn) { (listeners[e] ||= []).push(fn); },
    removeListener(e, fn) { listeners[e] = (listeners[e] || []).filter(f => f !== fn); },
    async request({method, params}) {
      if (method === 'eth_requestAccounts') { authorized = true; return ['${account}']; }
      if (method === 'eth_accounts') return authorized ? ['${account}'] : [];
      if (method === 'eth_chainId') return chain;
      if (method === 'wallet_switchEthereumChain') {
        window.__wallet.switches.push(params[0]);
        if (window.__wallet.first) { window.__wallet.first = false; throw Object.assign(new Error('Unknown chain'), {code:4902}); }
        chain = params[0].chainId; (listeners.chainChanged || []).forEach(f => f(chain)); return null;
      }
      if (method === 'wallet_addEthereumChain') { window.__wallet.adds.push(params[0]); return null; }
      if (method === 'eth_sendTransaction') { window.__wallet.tx.push(params[0]); throw Object.assign(new Error('User rejected the request'), {code:4001}); }
      throw new Error('Unexpected wallet method ' + method);
    }
  };
  const info = { uuid: '11111111-2222-3333-4444-555555555555', name:'Fixture Wallet', icon:'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E', rdns:'test.snitch' };
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {detail:{info,provider}}));
  window.addEventListener('eip6963:requestProvider', announce); announce();
})();`
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://local')
  const relative = url.pathname.slice('/preview/'.length) || 'index.html'
  const file = path.resolve(DIST, relative)
  if (!url.pathname.startsWith('/preview/') || !file.startsWith(DIST + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end()
  res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }).end(fs.readFileSync(file))
})
const checks = []
function record(check, ok, detail) {
  checks.push({ check, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${check}: ${JSON.stringify(detail)}`)
}
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}/preview/`
  const browser = await chromium.launch({ headless: true })
  const errors = []
  const consoleErrors = []
  const resources = []
  const contexts = []
  const shots = path.join(ROOT, baseline ? 'test/scratch/baseline-shots' : 'docs/validation/revision-screenshots')
  fs.mkdirSync(shots, { recursive: true })
  async function newPage(withWallet = false) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    contexts.push(context)
    if (!liveReads) await context.route('https://**', async route => {
      if (!manifest.network.rpcUrls.includes(route.request().url().replace(/\/$/, ''))) {
        unhandled.push(`outside configured RPCs: ${route.request().url()}`); return route.abort()
      }
      const body = route.request().postDataJSON()
      const result = Array.isArray(body) ? await Promise.all(body.map(rpc)) : await rpc(body)
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) }).catch(() => {})
    })
    if (withWallet) await context.addInitScript(wallet)
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
    page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) resources.push(r.url()) })
    if (liveReads) page.on('request', r => {
      if (manifest.network.rpcUrls.includes(r.url().replace(/\/$/, '')) && r.postData()) {
        const body = r.postDataJSON()
        requests.push(...(Array.isArray(body) ? body : [body]))
      }
    })
    return page
  }
  const page = await newPage()
  try {
    if (liveReads) {
      await page.goto(base)
      await page.locator('.section .empty, .section .reports, .section [role=alert]').first().waitFor({ timeout: 60000 })
      const historyText = await page.locator('.section').last().textContent()
      record('live browser loads event history', !historyText.includes('Unable to read') && requests.some(r => r.method === 'eth_getLogs'), historyText)
      await page.goto(base + '#/trade')
      await page.getByText(/1 SNITCH =/).waitFor({ timeout: 30000 })
      record('live browser loads pool price', true, await page.locator('.facts dd').first().textContent())
      await page.getByLabel(/You pay/).fill('1')
      await page.waitForFunction(() => /SNITCH$|No quote/.test(document.querySelector('form .facts dd')?.textContent ?? ''), null, { timeout: 30000 })
      record('live public quote', /SNITCH$/.test(await page.locator('form .facts dd').first().textContent()), await page.locator('form .facts dd').first().textContent())
      record('live browser has no page errors or broken local assets', !errors.length && !resources.length, { errors, resources, consoleErrors })
      if (checks.some(c => !c.ok)) process.exitCode = 1
      return
    }
    await page.goto(base)
    await page.locator('.reports .report-row').first().waitFor()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(600)
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const bounds = await page.evaluate(() => {
        const svg = document.querySelector('.card__svg')
        const panel = [...svg.querySelectorAll('text')].find(e => e.textContent.includes('Checked by'))
        return { stamp: svg.querySelector('.stamp').getBoundingClientRect().toJSON(), panel: panel.getBoundingClientRect().toJSON() }
      })
      record(`stamp clears panel at ${width}`, bounds.stamp.bottom + 2 < bounds.panel.top, bounds)
      await page.locator('.card--example').screenshot({ path: path.join(shots, `card-${width}.png`) })
    }
    const history = await page.locator('.section .report-row__no').allTextContents()
    record('latest five follow answer events', history.join(',') === 'No. 0001,No. 0006,No. 0005,No. 0004,No. 0003', history)
    await page.goto(base + '#/cases')
    await page.locator('.reports .report-row').first().waitFor()
    const all = await page.locator('.reports').first().locator('.report-row__no').allTextContents()
    record('case files preserve event order and read logs', all[0] === 'No. 0001' && requests.some(r => r.method === 'eth_getLogs'), { all, logRequests: requests.filter(r => r.method === 'eth_getLogs').length })
    await page.setViewportSize({ width: 320, height: 700 })
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).click()
    const menu = await page.locator('.menu').boundingBox()
    record('wallet menu fits 320px', menu.x >= 16 && menu.x + menu.width <= 304, menu)
    await page.screenshot({ path: path.join(shots, 'menu-320.png') })
    await page.keyboard.press('Escape')
    if (!baseline) {
      for (const width of [350, 390, 640, 850, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        await page.getByRole('button', { name: 'Connect wallet', exact: true }).click()
        const box = await page.locator('.menu').boundingBox()
        record(`wallet menu fits ${width}px`, box.x >= 16 && box.x + box.width <= width - 16, box)
        await page.keyboard.press('Escape')
      }
      record('wallet menu Escape returns focus', await page.getByRole('button', { name: 'Connect wallet', exact: true }).evaluate(e => e === document.activeElement))
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(base + '#/open')
    await page.getByLabel('Token contract').fill(token)
    await page.locator('.skip').focus()
    await page.keyboard.press('Enter')
    record('skip retains open route, input and main focus', page.url().endsWith('#/open') && await page.getByLabel('Token contract').count() === 1 && await page.evaluate(() => document.activeElement.id === 'main'), { url: page.url(), heading: await page.locator('h1').textContent() })
    await page.goto(base + '#/trade')
    await page.getByLabel(/You pay/).fill('1')
    await page.waitForTimeout(700)
    const approvalLabels = await page.locator('.stepper .action button').allTextContents()
    record('disconnected allowances are unknown', !approvalLabels.slice(0, 2).some(s => /approved|allowed/i.test(s)), approvalLabels)
    const price = await page.locator('.facts dd').first().textContent()
    record('pool price retains precision before reciprocal', /378422\.832676/.test(price), price)
    await page.getByLabel(/You pay/).fill('2')
    await page.waitForTimeout(50)
    await page.getByLabel(/You pay/).fill('')
    await page.waitForTimeout(1500)
    const quoted = await page.locator('form .facts dd').first().textContent()
    record('cleared pending quote resets loading', quoted === 'Enter an amount', quoted)
    scenario.codeDelay = 150
    await page.goto(base + '#/open')
    await page.getByLabel('Token contract').fill(token)
    await page.getByText(/Looking up its deployment block/).waitFor()
    await page.getByRole('textbox', { name: 'From block', exact: true }).fill('26176200')
    await page.getByRole('textbox', { name: 'To block', exact: true }).fill('26176300')
    await page.getByText(/Looking up its deployment block/).waitFor({ state: 'hidden' })
    const range = { from: await page.getByRole('textbox', { name: 'From block', exact: true }).inputValue(), to: await page.getByRole('textbox', { name: 'To block', exact: true }).inputValue() }
    record('late defaults preserve edited window', range.from === '26176200' && range.to === '26176300', range)
    if (!baseline) {
      await page.getByLabel('Token contract').fill(manifest.network.pairToken.address)
      await page.getByText(/Looking up its deployment block/).waitFor()
      await page.getByRole('textbox', { name: 'From block', exact: true }).fill('26176250')
      await page.getByText(/Looking up its deployment block/).waitFor({ state: 'hidden' })
      record('new token defaults only the untouched field', await page.getByRole('textbox', { name: 'From block', exact: true }).inputValue() === '26176250' && await page.getByRole('textbox', { name: 'To block', exact: true }).inputValue() === latest.toString())
      scenario.codeError = true
      await page.getByLabel('Token contract').fill(token)
      await page.getByText(/Looking up its deployment block/).waitFor()
      await page.getByRole('textbox', { name: 'From block', exact: true }).fill('26176210')
      await page.getByRole('textbox', { name: 'To block', exact: true }).fill('26176310')
      await page.getByText(/Unable to find the deployment block/).waitFor({ timeout: 30000 })
      record('failed lookup fallback also preserves both edits', await page.getByRole('textbox', { name: 'From block', exact: true }).inputValue() === '26176210' && await page.getByRole('textbox', { name: 'To block', exact: true }).inputValue() === '26176310')
      scenario.codeError = false
      await page.goto(base + '#/how')
      await page.locator('.skip').focus()
      await page.keyboard.press('Enter')
      record('skip retains how route and main focus', page.url().endsWith('#/how') && await page.evaluate(() => document.activeElement.id === 'main'))
      scenario.quoteDelay = 900
      await page.goto(base + '#/trade')
      await page.getByLabel(/You pay/).fill('1')
      await page.waitForTimeout(500)
      await page.getByLabel(/You pay/).fill('')
      await page.waitForTimeout(1100)
      record('clearing an in-flight quote ignores the late response', await page.locator('form .facts dd').first().textContent() === 'Enter an amount')
      scenario.quoteDelay = 0
    }
    scenario.codeDelay = 0
    const connected = await newPage(true)
    await connected.goto(base + '#/open')
    await connected.getByRole('button', { name: 'Connect wallet', exact: true }).click()
    await connected.getByRole('button', { name: 'Fixture Wallet', exact: true }).click()
    await connected.locator('.banner').waitFor()
    await connected.waitForTimeout(3500)
    if (!baseline) {
      record('only one network switch control', await connected.getByRole('button', { name: 'Switch to Ethereum', exact: true }).count() === 1)
      scenario.allowanceDelay = 1800
    }
    await connected.getByRole('button', { name: 'Switch to Ethereum', exact: true }).click()
    await connected.locator('.banner').waitFor({ state: 'hidden' })
    if (!baseline) {
      const labels = await connected.locator('.stepper .action button').allTextContents()
      record('open loading allowances cannot claim approval or submit', labels.slice(0, 2).every(s => s === 'Checking allowance…') && await connected.getByRole('button', { name: 'Open the case', exact: true }).isDisabled(), labels)
    }
    const approve = connected.getByRole('button', { name: /Approve 200,000 SNITCH/ })
    await approve.click()
    await connected.waitForTimeout(2600)
    const walletState = await connected.evaluate(() => window.__wallet)
    scenario.allowanceDelay = 0
    record('approve reaches wallet after unsupported-chain switch', walletState.tx.length === 1, { tx: walletState.tx, errors: await connected.locator('.tx--error').allTextContents() })
    record('unknown chain add uses exact handoff', JSON.stringify(walletState.adds[0]) === JSON.stringify(manifest.walletAddChain), walletState.adds)
    if (!baseline) {
      await connected.getByRole('button', { name: 'Open the case', exact: true }).click()
      record('open invalid submit focuses token field', await connected.getByLabel('Token contract').evaluate(e => e === document.activeElement && e.getAttribute('aria-invalid') === 'true'))
      await connected.getByLabel('Token contract').fill(token)
      await connected.getByRole('textbox', { name: 'Wallet', exact: true }).fill(account)
      await connected.getByText(/from the token's deployment block/).waitFor()
      await connected.getByRole('button', { name: 'Open the case', exact: true }).click()
      record('known insufficient allowance blocks opening', (await connected.locator('.stepper .error').allTextContents()).some(s => /Approve the SNITCH fee/.test(s)) && (await connected.evaluate(() => window.__wallet.tx.length)) === 1)

      for (const route of ['open', 'trade']) {
        // Fresh document clears read caches; failed reads must never inherit an approved label.
        scenario.allowanceError = true
        await connected.goto(base + '#/' + route)
        await connected.reload()
        if (route === 'trade') await connected.getByLabel(/You pay/).fill('1')
        await connected.getByRole('button', { name: 'Connect wallet', exact: true }).click()
        await connected.getByRole('button', { name: 'Fixture Wallet', exact: true }).click()
        await connected.getByRole('button', { name: 'Switch to Ethereum', exact: true }).click()
        await connected.getByRole('button', { name: 'Retry allowance checks' }).waitFor({ timeout: 30000 })
        const labels = await connected.locator('.stepper .action button').allTextContents()
        record(`${route} failed allowances stay unknown and block submit`, labels.slice(0, 2).every(s => s === 'Allowance unavailable') && await connected.locator('.stepper button[type=submit]').isDisabled(), labels)
        scenario.allowanceError = false
        scenario.allowance = 1000000n * unit
        await connected.getByRole('button', { name: 'Retry allowance checks' }).click()
        await connected.waitForFunction(() => [...document.querySelectorAll('.stepper .action button')].slice(0, 2).every(e => /approved|allowed/i.test(e.textContent)))
        record(`${route} recovered known allowances show completion`, (await connected.locator('.stepper .action button').allTextContents()).slice(0, 2).every(s => /approved|allowed/i.test(s)))
        if (route === 'open') {
          await connected.getByLabel('Token contract').fill(token)
          await connected.getByRole('textbox', { name: 'Wallet', exact: true }).fill(account)
          await connected.getByText(/from the token's deployment block/).waitFor()
          await connected.getByRole('button', { name: 'Open the case', exact: true }).click()
          await connected.getByText(/Rejected in the wallet/).waitFor()
          const tx = await connected.evaluate(() => window.__wallet.tx.at(-1))
          const decoded = decodeFunctionData({ abi: deskAbi, data: tx.data })
          record('open simulates capped fees and reaches wallet', decoded.functionName === 'openCaseWithLimits' && decoded.args[5] === 200000n * unit && decoded.args[6] === unit / 2n)
        } else {
          await connected.getByRole('button', { name: 'Buy SNITCH', exact: true }).click()
          await connected.getByText(/Rejected in the wallet/).waitFor()
          const tx = await connected.evaluate(() => window.__wallet.tx.at(-1))
          const decoded = decodeFunctionData({ abi: universalRouterAbi, data: tx.data })
          record('swap reaches configured universal router after simulation', tx.to.toLowerCase() === uni.universalRouter.toLowerCase() && decoded.functionName === 'execute' && decoded.args[0] === '0x10' && (!tx.value || BigInt(tx.value) === 0n))
          await connected.screenshot({ path: path.join(shots, 'trade-390.png'), fullPage: true })
        }
      }

      // Exercise both approval steps independently, using the configured token and Permit2 addresses.
      scenario.allowance = 0n
      await connected.getByRole('button', { name: /Sell SNITCH for/ }).click()
      let txCount = await connected.evaluate(() => window.__wallet.tx.length)
      await connected.getByRole('button', { name: 'Approve SNITCH to Permit2', exact: true }).click()
      await connected.waitForFunction(n => window.__wallet.tx.length > n, txCount)
      let tx = await connected.evaluate(() => window.__wallet.tx.at(-1))
      let decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data })
      record('token approval uses network Permit2', tx.to.toLowerCase() === token.toLowerCase() && decoded.args[0].toLowerCase() === uni.permit2.toLowerCase())
      scenario.allowance = 1000000n * unit
      scenario.permitAllowance = 0n
      await connected.getByRole('button', { name: /Buy SNITCH with/ }).click()
      // Wait for the normal polling refresh of this previously used allowance query.
      txCount = await connected.evaluate(() => window.__wallet.tx.length)
      await connected.getByRole('button', { name: 'Allow the universal router (30 days)', exact: true }).click({ timeout: 20000 })
      await connected.waitForFunction(n => window.__wallet.tx.length > n, txCount)
      tx = await connected.evaluate(() => window.__wallet.tx.at(-1))
      decoded = decodeFunctionData({ abi: permit2Abi, data: tx.data })
      record('Permit2 approval uses network router', tx.to.toLowerCase() === uni.permit2.toLowerCase() && decoded.args[1].toLowerCase() === uni.universalRouter.toLowerCase())
      scenario.permitAllowance = null

      for (const reportId of [1, 2]) {
        await connected.goto(base + '#/report/' + reportId)
        await connected.locator('.report .card, .report__grid .card').first().waitFor()
        await connected.waitForTimeout(600)
        const geometry = await connected.evaluate(() => {
          const svg = document.querySelector('.card__svg')
          const stamp = svg.querySelector('.stamp').getBoundingClientRect()
          const panel = [...svg.querySelectorAll('text')].find(e => e.textContent.includes('Checked by')).getBoundingClientRect()
          return { stampBottom: stamp.bottom, panelTop: panel.top }
        })
        record(`answered report ${reportId} stamp clears panel`, geometry.stampBottom + 2 < geometry.panelTop, geometry)
        await connected.locator('.card').screenshot({ path: path.join(shots, `report-${reportId}-390.png`) })
      }
      await connected.getByRole('button', { name: 'File the report', exact: true }).click()
      await connected.getByText(/Rejected in the wallet/).waitFor()
      tx = await connected.evaluate(() => window.__wallet.tx.at(-1))
      record('fileReport still reaches wallet', decodeFunctionData({ abi: deskAbi, data: tx.data }).functionName === 'fileReport')
      await connected.goto(base + '#/owner')
      await connected.getByLabel('New case fee (SNITCH)').fill('100')
      await connected.getByRole('button', { name: 'Set case fee', exact: true }).click()
      await connected.getByText(/Rejected in the wallet/).waitFor()
      tx = await connected.evaluate(() => window.__wallet.tx.at(-1))
      record('owner setter still reaches wallet', decodeFunctionData({ abi: deskAbi, data: tx.data }).functionName === 'setCaseFee')
      await connected.goto(base)
      for (const width of [320, 390, 850, 1440]) {
        await connected.setViewportSize({ width, height: 900 })
        record(`home reflows at ${width}`, await connected.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      }
      await connected.emulateMedia({ reducedMotion: 'reduce' })
      record('stamp honors reduced motion', await connected.locator('.stamp').evaluate(e => getComputedStyle(e).animationName === 'none'))
    }
    record('static metadata has no invented public image URL', await page.locator('meta[property="og:image"]').count() === 0, { imageCount: await page.locator('meta[property="og:image"]').count(), note: 'No public hosting URL supplied; metadata deferred per the pinned adapter.' })
    record('no page errors, console errors, failed assets or unhandled fixture requests', !errors.length && !consoleErrors.length && !resources.length && !unhandled.length, { errors, consoleErrors, resources, unhandled })
  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
    fs.writeFileSync(path.join(ROOT, 'docs/validation', liveReads ? 'revision-live-browser.json' : baseline ? 'revision-before.json' : 'revision-after.json'), JSON.stringify({ baseline, liveReads, browser: browser.version(), checks, rpcRequests: requests.length }, null, 2) + '\n')
  }
  if (!baseline && checks.some(c => !c.ok)) process.exitCode = 1
}
main().catch(e => { console.error(e); server.close(); process.exitCode = 1 })
