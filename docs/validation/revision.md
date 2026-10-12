# SNITCH revision validation

Worker evidence, 2026-10-12. This is not independent certification or a publication result.
The accepted design and contract implementation are preserved. Changes are limited to the
reported defects, their regression checks, rebuilt `dist/`, and documentation. The required root
response file is `.imd-responses.json`; design documentation remains at `docs/DESIGN.md` because
the assignment's explicit write budget excludes root `DESIGN.md`.

## Reproduction and decisions

The original committed export was copied to `test/scratch/baseline-dist` before editing. The
browser script served it at `/preview/`, with ABI-valid RPC fixtures and an EIP-6963 wallet that
rejects every signing request. Results: [revision-before.json](revision-before.json).
The fixtures do not alter the deployed manifest or its ABI files.

| Finding (ID prefix) | Reproduction | Decision and final source |
| --- | --- | --- |
| `63da93a0` offline source install | Copied only the manifests to `test/scratch/offline/web`; `npm ci --offline --cache ../cache --ignore-scripts --no-audit --no-fund` failed with `ENOTCACHED` for `https://registry.npmjs.org/react`, exit 1. | **Disputed requirement.** The assignment permits network installation and explicitly says offline service verification does not require a vendored npm registry; it forbids committing dependency/cache directories and unnecessary registry archives. Kept the locked dependencies and self-contained export. `web/README.md:57` now explicitly distinguishes network source installation from serving the export. No dependency payload, ignore rule or lockfile change. |
| `ab3b6f7b` stamp overlap | At 390px the settled stamp bottom was 831.16px; panel top was 811.25px. Screenshots confirmed painted overlap; also reproduced at 1440px. | **Fixed**, `web/src/styles.css:437`: SVG view-box transform coordinates with origin `0 0`. Final example gap is 32.84px at 390px and 35.21px at 1440px before stroke allowance. CLEAN and SNITCHED report cards both clear their panel/date. |
| `0662f03a` report history | Six answered cases; case 1 answered last. Home showed 6,5,4,3,2; Case files sent no `eth_getLogs`. | **Fixed**, `web/src/hooks/useDesk.ts:48`, `web/src/lib/history.ts:19`, `web/src/lib/cases.ts:94`: scan the desk's events, sort by answer block/log position, preserve that order through filtering, and populate cards with `getCase` at the scanned block. Home now shows 1,6,5,4,3; Case files includes all six in event order. Later filing does not reorder an answer. |
| `474eaf94` clipped wallet menu | At 320px the open menu started at x = −63.47px. | **Fixed**, `web/src/styles.css:374`: a separate wallet row below 22rem, menu anchored to inline start with a viewport width cap. It now spans x = 16–304px; also checked at 350,390,640,850,1440px. |
| `4021c420` skip route | Keyboard Enter on Skip changed `#/open` to `#main` and rendered “No such page”. | **Fixed**, `web/src/components/Layout.tsx:26`: prevent hash navigation, focus/scroll the existing main. Checked Open with an entered token and How. |
| `9d58a931` share image | `og:image` absent from original and final static head. | **Disputed prerequisite.** No public domain/gateway is supplied; the pinned `eth-frontend-ux.md` adapter explicitly defers absolute Open Graph URLs until one exists. Kept the existing metadata and documented the pending preview. Did not invent a URL, publish a site, or add an unreferenced image. |
| `b79af290` unknown allowances | Disconnected Trade showed “IMD approved to Permit2” and “Router allowed”. | **Fixed**, `web/src/hooks/useDesk.ts:116`, `web/src/pages/Open.tsx:108`, `web/src/pages/Trade.tsx:105`: allowance needs are tri-state. Reads are enabled only for the connected account on the deployment chain. Loading/failure states cannot claim completion or submit. Both pages offer retry after read failures, verified through recovery to a known sufficient allowance. |
| `5d69303b` reciprocal price | Fixture sqrt price `128792602073356601575926592` displayed `0.000002` and `500000`. | **Fixed**, `web/src/lib/swap.ts:86`, `web/src/pages/Trade.tsx:132`: compute both rational directions from the unrounded square and token decimals; round only final displays. Now `0.00000264254667967 IMD/SNITCH` and `378422.832676 SNITCH/IMD`. Unit coverage includes different decimals, tiny prices and an uninitialized pool. |
| `df02597d` range overwrite | With delayed `eth_getCode`, chosen 26176200–26176300 became 26176091–26176591. | **Fixed**, `web/src/pages/Open.tsx:56`: per-field edit flags scoped to the token. Successful defaults and error fallback preserve edited fields; changing token resets the flags. Checked both edited, one edited, new-token and failed-lookup cases. |
| `0ab184a7` stale wallet client | Connected on Sepolia, waited 3.5s, switched to Ethereum: approve showed “Connect a wallet first”, with zero wallet sends. | **Fixed**, `web/src/hooks/useTx.ts:28`, `web/src/hooks/useEnsureChain.ts:41`: gate the wallet-client query on the account chain, invalidate it after switching, and keep write controls disabled until ready. On the same Open page the approval now reaches the wallet immediately after switching; the fixture rejects it with 4001. All write consumers use the readiness state. |
| `6615106f` stuck quote | Clear amount 50ms into the debounce; after 1.5s the empty input still showed “Quoting…”. | **Fixed**, `web/src/pages/Trade.tsx:67`: reset loading in the no-quote branch. Both debounce cancellation and an already running quote now return to “Enter an amount”; late results remain ignored. |

## Commands and final results

From `web/`:

```sh
npm ci --cache /tmp/snitch-npm-cache --no-audit --no-fund
npm run typecheck
npm test
npm run build
npm run manifest
```

- Installation: exit 0, 566 packages; existing transitive peer/deprecation warnings. No package or
  lockfile changes. Dependency files and caches remain untracked.
- Typecheck: exit 0, including the new history tests. The final build also ran typecheck.
- Unit tests: **40 passed, four files**. Added regression cases for event ordering, equal-block
  log position, bounded ranges, provider range limits, retry without losing history, recent reorgs,
  and reciprocal precision.
- Build: exit 0. Existing Rollup dependency annotation warnings and the main-chunk size warning
  remain; final main bundle is about 656 KB (200 KB gzip).
- Manifest: **11 assets, 739,014 asset bytes**, plus 4,218 bytes for the manifest. Independent
  Node assertions compared every asset SHA-256, exact allowed key set, identifiers, full contract
  set, pool key, network and wallet-add parameters with the supplied handoffs. Each exported ABI
  also matches `git show 13de1c8a9975a6dcab5202f6b01c9a9363d76b29:docs/abi/<Contract>.json`
  and its canonical Keccak hash. All passed. No contract source was changed.

Browser setup (test-only installation in the disposable scratch directory):

```sh
mkdir -p test/scratch/browser
cd test/scratch/browser
npm init -y
npm install playwright@1.58.2
PLAYWRIGHT_BROWSERS_PATH=/tmp/snitch-browsers npx playwright install chromium
cd ../../..
NODE_PATH="$PWD/test/scratch/browser/node_modules" PLAYWRIGHT_BROWSERS_PATH=/tmp/snitch-browsers \
  node docs/validation/revision-browser.cjs
NODE_PATH="$PWD/test/scratch/browser/node_modules" PLAYWRIGHT_BROWSERS_PATH=/tmp/snitch-browsers \
  node docs/validation/revision-browser.cjs --live-reads
```

Node 24.21.0, Chromium 145.0.7632.6. Both commands exit 0. The script owns and closes its local
server and browser; no service remains running. To repeat the baseline, copy the original
commit's export into `test/scratch/baseline-dist` and use `--baseline`.

- **45 deterministic checks passed**: [revision-after.json](revision-after.json). Tests cover the
  reproduced states plus retry recovery, fee-capped opening, both Permit2 approval steps, swap
  encoding routed to the configured Universal Router, report filing, owner fee setting, menu
  Escape/focus return, reflow and reduced motion. No page/console errors, failed local assets,
  unexpected RPC destinations or unhandled mock calls. The wallet rejects all sends; its fixture
  account and report address exist only in test data.
- **Four live browser checks passed**: [revision-live-browser.json](revision-live-browser.json).
  The final export loaded the actual empty report history through `eth_getLogs`, read the live
  pool price and quoted 1 IMD using `eth_call`. No page errors or broken local assets. Publicnode
  rejected archive code probes with HTTP 403; the configured fallback served them successfully.
  These network-layer console errors are preserved in the result, not presented as an error-free
  live console.
- Independent public-RPC reads: [revision-live.json](revision-live.json), chain 1, code present
  at all three attested addresses, desk events read from block 26176091 through 26176683. At that
  check `caseCount()` was 0; fixture history is not represented as real reports.

## Better Interface review of changed surfaces

Read the pinned workflow, all six domains' core principles, focus/keyboard guidance and the
design-documentation method. Applied the existing tokens, fonts and component patterns.

| Domain | Coverage and findings |
| --- | --- |
| Accessibility | **Checked**: keyboard skip on Open/How preserves the route and main focus; wallet Escape returns focus; invalid Open submission focuses its first field. Readiness and allowance labels are truthful, disabled controls have nearby reasons, failures offer retry. Reduced-motion stamp has no animation. Not verified: screen-reader session, native browser zoom, automated accessibility audit. |
| Layout | **Checked**: fixed stamp/panel overlap and clipped menu. Measured menu bounds at 320,350,390,640,850,1440px; Home reflow at 320,390,850,1440px. Viewed example and CLEAN/SNITCHED card screenshots and the open 320px menu. Not verified: physical devices or RTL. |
| Writing | **Checked**: preserved voice; “Checking allowance…”, “Allowance unavailable” and retry describe observed states. Known sufficient reads alone show approved/allowed. One actionable network-switch control remains. Public social image metadata is explicitly pending. |
| Typography | **Checked**: existing local fonts/size hierarchy retained. Viewed 390px pool-price wrapping and report text; panel/date are legible and clear of stamp strokes. No new font or scale. Not verified: every content length or text enlargement setting. |
| Colors | **Checked in source**: no color/token changes. Verdict text and glyph cues retained. Prior declared-pair measurements remain in `docs/DESIGN.md`; this revision makes no new rendered-contrast measurement claim. Not verified: texture-composited contrast or color-vision emulation. |
| UI | **Checked**: existing flat controls and single stamp motion retained. Walked disconnected/wrong-chain/loading/read-failure/approval/wallet-rejection states, known allowance recovery and quote cancellation. Inspected final screenshots. Not verified: animation replay at 10% speed or actual wallet hardware. |

Final inspected images in [revision-screenshots/](revision-screenshots/): `card-390.png`,
`card-1440.png`, `menu-320.png`, `report-1-390.png`, `report-2-390.png`, `trade-390.png`.
They show mock cases/balances where applicable. Original `screenshots/` files are historical.

## Limits and completion

Complete for this bounded revision: nine confirmed defects repaired, two requirement disputes
documented. Source and export stay within `web/`, `dist/`, `docs/`, plus the explicitly requested
root response file. No ignore file, root build configuration, contracts, library, submodule or
CI change. No dependency/cache/archive payload is included.

Packaging audit: [revision-package.json](revision-package.json). The entire present submission
file set, including unchanged tracked files and the root response file, is about 6.15 MB, below
8 MiB; the production export is about 743 KB including its manifest. Git staging failed because
`.git` is mounted read-only (`index.lock` cannot be created). A full-history bundle check also
needed an unavailable promisor object that cannot be fetched into that mount. Consequently no
commit or actual final Git bundle was created/measured on this worker; the edited files and
explicitly requested response file are saved for collection. No Git metadata workaround was used.

No transaction was broadcast. Live approvals, successful receipts, actual oracle answers,
minting and swaps with funds remain untested. The event cache refreshes 12 recent blocks; an
older reorg requires reload. Public RPC availability and archive support remain external
dependencies. No new WebKit, screen-reader, device or publication test was run. Hosting URLs,
CIDs and a public social preview remain publisher-stage work.
