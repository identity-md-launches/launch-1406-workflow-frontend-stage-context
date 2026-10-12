# SNITCH frontend: validation record

**Current revision:** [reproduction, repairs and final checks](validation/revision.md). All 11
review findings have responses in the repository-root `.imd-responses.json`: nine fixed and two
disputed against explicit assignment guidance. The current export passed typecheck, build, 40 unit
tests, 45 deterministic browser checks, four live browser checks, and the manifest/ABI audit.

The record below describes the original accepted implementation and its original checks. In
particular, the original case-number index and pool-price display are superseded by this revision;
its screenshots are historical, not evidence of the corrected export.

Worker-side validation of the static export in `dist/` built from `web/` on 2026-10-12. This is the
worker's report, not an independent certification; the publication checks (CID, asset hashes,
deployment configuration, RPC chain id, contract code) run after submission and are not claimed
here.

## 1. Scope and assumptions

- Pages and flows: Home, Case files, Report, Open a case (approve SNITCH, approve IMD, open),
  Trade SNITCH (quote, Permit2 approvals, swap), How it works + FAQ, Owner settings, wallet connect
  and network switching, footer addresses. Export: `dist/` (Vite, base `./`, hash routes).
- Deployment handoff `.imd/reads/deployment.json` (launch `4957b27c-…`, chain 1, three contracts,
  pool key with hook `0x784f…6000`) and `.imd/reads/network.json` (Ethereum, two public RPCs,
  Uniswap v4 addresses, IMD pair token). Copies live in `web/deployment/` for rebuilds.
- Inferred choices: cases are read with `caseCount()` + `getCase(id)` (batched `eth_call`) rather
  than log scans, because the chain table's free RPCs limit `eth_getLogs` ranges and batch sizes;
  the data is the same stored state the events describe. The example card on the home page is a
  fixed, labelled sample. USD context is deliberately absent: the site reads no price source.
  `openCaseWithLimits` is used for every opening with the quoted fee and price as caps.
- Design documentation is `docs/DESIGN.md`. The acceptance text names the repository root, but
  this assignment's write scope is `web/**`, `dist/**` and `docs/**` and places documentation
  under `docs/` or `web/`; the path rule takes precedence, so the file lives in `docs/`.
- No case exists on chain yet (`caseCount() = 0` at validation time), so the Report page and
  the lists were checked in their empty and missing-case states, plus with the example data in
  the card component. Owner-only controls were exercised with a mocked wallet whose address is the
  launch owner; nothing was signed or broadcast.

## 2. Commands and outcomes

| Step | Command (in `web/`) | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Unit tests | `npx vitest run` | 3 files, 34 tests passed (swap encoding and pool id, slippage and price math, SnitchArt-compatible formatting, share text, case filtering/search, hash routing, deployment-block binary search, default window, manifest validation, error translation) |
| Build | `npx vite build` | exit 0, `dist/` 11 files, 718 KiB total (main bundle 652 KB, 199 KB gzip) |
| Manifest | `node scripts/manifest.mjs` | all three handoff `abiHash` values match `keccak256(canonical JSON)` of `docs/abi/*.json`; 11 assets hashed |
| Manifest audit | `sha256sum -c` over `assets[]`, `diff` of `network`, `walletAddChain`, `poolKey` and the contract set against the handoff files, top-level key list | every hash OK, blocks identical, keys = version, launchId, chainId, sourceCommit, attestationHash, contracts, assets, poolKey, network, walletAddChain |
| Browser | `node test/scratch/browser/verify.cjs` (bounded foreground run: local server for `dist/` under `/preview/`, playwright-core 1.64 driving Google Chrome 154 headless, mocked EIP-6963 wallet, live mainnet RPC reads); the script is kept as `docs/validation/verify-browser.cjs` with run instructions in its header | see §4; results in `docs/validation/browser-results.json`, screenshots in `docs/validation/screenshots/` |

## 3. Better Interface review

Guide: `.imd/reads/skills/better-interface/REFERENCE.md`, workflow section plus the core principles
of all six domains; supporting sections consulted for forms, focus, contrast and motion. Applied
while building; one consolidated review of the export afterwards. The browser tool assigned to this
session (Playwright MCP) had no managed preview and its page-context code tool was not permitted,
so rendered checks ran through the bounded script above; the MCP tool itself was used only to
confirm it launches.

| Domain | Coverage | Evidence |
| --- | --- | --- |
| Accessibility | Checked | Native elements throughout (`button`, `a href`, `label for`, radio tabs, `dialog` for the wallet menu with Escape and focus return); skip link first in tab order and visible on focus; 3 px `:focus-visible` ring measured on the Connect button; every input labelled with `aria-invalid` + `aria-describedby`; submit validates and focuses the first invalid field; status regions per action (`role=status`, `role=alert` on failure); verdicts carry ✓/✕ glyphs and words, never colour alone; stamp motion gated by `prefers-reduced-motion` and verified static under `reduce`; hit targets 44 px (32×44 px copy buttons). Not verified: screen-reader session, automated audit (no axe available), forced-colors rendering, native 200 % zoom (only reflow at 320 px). |
| Layout | Checked | Space-first grouping with the 2 px border only on controls and panels; logical properties for inline spacing; content-driven rem breakpoints; no horizontal overflow at 320, 390 and 1280 px on Home and Open; fixed the stretched From-block input (`.field-row { align-items: start }`). Not verified: RTL mirror, widths between 390 and 1280 other than the breakpoints read from source. |
| Writing | Checked (source) | Verb-first labels ("Connect wallet", "Approve 200,000 SNITCH", "Open the case", "File the report", "Drop the case", "Post it on X"); errors state the fix beside the field; empty states point forward and name the query; sentence case everywhere except the brand's uppercase headlines (rendered via `text-transform`); one vocabulary for the three-step flows. |
| Typography | Checked | Two bundled woff2 files (Archivo Narrow 700, IBM Plex Mono 400), system sans body; semantic size tokens; headings tighter (1.1) than body (1.5); `text-wrap: balance`/`pretty`; 16 px inputs; tabular numbers on changing values; 68ch measure; `overflow-wrap: anywhere` on addresses. Rendered: fonts load from the bundle (requests observed under `/preview/assets/`), the headline face renders in screenshots. Not verified: widows at every content length. |
| Colors | Checked (computed) | Tokens in `web/src/styles.css`; contrast computed from declared pairs (ink/paper 12.27:1, secondary/paper 6.81:1, clean text 6.58:1, snitched/error text 6.39:1, paper on ink 12.27:1); the brief's red and green (3.95:1 and 3.85:1 on paper) are restricted to the large stamp text and borders. Not verified: rendered measurement over the fibre texture (7 % noise overlay; a measured pair there could differ by a few hundredths). |
| UI | Checked | Flat surfaces, borders for structure, concentric radius not applicable (`--radius: 0`); press feedback `scale(0.96)`; transitions name their properties and stay at 120 ms; one staged animation (stamp drop, 420 ms, `cubic-bezier(0.2, 0, 0, 1)`), interruptible interactions use transitions. Not verified: the drop replayed at 10 % speed; the drop on a real status change (no case has been answered on chain yet; the code path triggers when a case moves from Open to Answered while the Report page is open). |

### Findings and fixes (all fixed before the final build; rechecked in the final browser run)

| Severity | Source | Evidence | Change |
| --- | --- | --- | --- |
| HIGH | `web/src/pages/Open.tsx` deployment-block effect | Browser: the "Looking up its deployment block…" hint never resolved (90 s); the effect depended on the live block number, so each new block cancelled the search | Search reads the latest block itself, 45 s timeout with the 30-day fallback; rechecked: PEPE's deployment block 17,046,105 found in 18 s |
| HIGH | `web/src/chain.ts` transport | RPC probe: `eth.drpc.org` returns 500 for batches over 3 and `ethereum-rpc.publicnode.com` 403 for archive `eth_getCode`; a 40-call batch falling back would fail outright | `batchSize: 3` on every transport; fallback now serves archive probes from the second RPC |
| MEDIUM | `web/src/pages/Open.tsx`, `web/src/pages/Trade.tsx` submit buttons | Source + guide: submit disabled until valid, so validation and the "what is missing" message never showed | Submit stays enabled when connected on the right chain; validates on submit, focuses the first invalid field, and names the blocking step (rechecked in browser) |
| MEDIUM | `web/src/components/Connect.tsx` + `Layout.tsx` | Screenshot `wrong-network-1280.jpg` (earlier run): two "Switch to Ethereum" controls | One control, in the banner; the header shows the account with a "wrong network" note (rechecked: exactly one switch button on the page) |
| LOW | `web/src/styles.css` `.field-row` | Screenshot: From-block input stretched taller than To-block | `align-items: start` (rechecked: both inputs 44 px) |
| LOW | `web/src/components/Connect.tsx` wallet list | Source: a generic "Injected" entry with no provider could appear | Listed only when `window.ethereum` exists |

## 4. Browser verification (final run, 37 checks, all passed)

Viewports 1280×900, 390×844 and 320×844; mocked wallet starting on chain `0xaa36a7`, every
`eth_sendTransaction` rejected with code 4001; reads and simulations against the configured public
RPCs on Ethereum mainnet.

- Home: title "SNITCH", h1 tagline, example card with its tag, latest-reports section settled from
  chain reads ("No report has been stamped yet"), no overflow at 1280/390/320
  (`home-1280.jpg`, `home-390.jpg`, `home-320.jpg`).
- Keyboard: first Tab reaches the visible skip link; Connect wallet reachable with a `solid 3px`
  ink ring (`focus-connect-1280.jpg`).
- Open, disconnected: live case fee 200,000 SNITCH and oracle price 0.5 IMD; open and approve
  controls disabled (`open-disconnected-1280.jpg`).
- Connect: EIP-6963 wallet listed; wrong-network banner; first `wallet_switchEthereumChain` fails
  with 4902, the app sends `wallet_addEthereumChain` with the handoff's exact parameters and
  switches again; account `0xc916…ab67` shown; owner sees "Owner settings"
  (`wrong-network-1280.jpg`).
- Open, connected: empty submit focuses the token field with its message; default window from
  the deployment block to the latest block; submit before approvals explains the blocker
  ("This wallet holds 0 SNITCH; the case fee is 200,000 SNITCH"); approve SNITCH simulated and
  sent to the wallet (`approve` selector to the desk), rejection translated; no overflow at 390
  (`open-connected-1280.jpg`, `open-connected-390.jpg`).
- Trade: pool price from `StateView.getSlot0` ("1 SNITCH = 0.000004 IMD · 1 IMD = 250000 SNITCH"),
  quote from the quoter for 1 IMD (≈221,439 SNITCH, minimum after 0.5 % slippage shown), step 1
  reflects this account's existing Permit2 allowance, step 2 enabled, submit explains the next
  step (`trade-1280.jpg`).
- Case files: filter `aria-pressed`, search empty state (`cases-1280.jpg`). Report: missing-case
  state for No. 0001 (`report-1280.jpg`). How: deep link under the subpath. Owner: setter disabled
  until a value is entered, enabled for the owner, `setCaseFee` simulated and sent to the wallet
  (`owner-1280.jpg`).
- Motion: stamp keyframes present under `no-preference`, none under `reduce` (opacity 0.92).
- Resources: every request stayed under `/preview/`; no failed asset. Console: no page or
  application errors; the browser logged network-layer 403 lines for archive `eth_getCode`
  probes refused by the first RPC and answered by the second (expected with the chain table's free
  endpoints).

## 5. Not tested on a live chain

- No transaction was broadcast: approvals, `openCaseWithLimits`, `fileReport`, `dropCase`,
  Permit2 `approve`, `universalRouter.execute` and the owner setters were simulated with
  `eth_call` (`simulateContract`) and then rejected by the mock wallet. The exact `execute`
  calldata is covered by unit tests against the prescribed layout, and its simulation against the
  live router could not run without a real Permit2 allowance for the router.
- The oracle answer path (stamp animation on a real `CaseAnswered`, "File the report" on an
  answered case, "Drop the case" after 72 hours, the on-chain `tokenURI` image) has no case on
  chain to exercise yet.
- Not run: screen reader, automated accessibility audit, forced-colors mode, native browser zoom,
  RTL, a physical mobile device, WalletConnect (not configured).

## 6. Completion

Complete for the stated scope, with the live-chain limitations above. Build, typecheck, unit tests
and the bounded browser run all pass on the final export; `dist/imd-deployment.json` was
regenerated after the last build and verified against the handoff.
