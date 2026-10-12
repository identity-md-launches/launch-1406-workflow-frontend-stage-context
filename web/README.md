# SNITCH web

The static site for SNITCH: open a case on a wallet, follow it, file the report NFT, drop an
unanswered case, trade SNITCH against IMD in the launch pool, and (for the owner) change the desk's
settings. Vite, React 19, TypeScript, wagmi 2 and viem 2. One page with hash routing, a relative
base, every script and font bundled, no backend and no trackers. The export is committed at the
repository root `dist/` and is what the publisher pins.

## Configuration: one place

The app has no address, chain id, ABI or RPC URL in its source. At startup it fetches
`imd-deployment.json` from the directory that serves `index.html`, validates it
(`src/config.ts`, `validateManifest`), then fetches every `abiPath` it lists plus
`abi/SnitchReports.json`. That file is generated from the deployment handoff by
`scripts/manifest.mjs` and committed as `dist/imd-deployment.json`:

| Key | Source | Used for |
| --- | --- | --- |
| `chainId`, `contracts[]` (name, address, abiHash, abiPath) | handoff | the wagmi chain, every contract read and write |
| `poolKey` | handoff | the SNITCH/IMD Uniswap v4 pool: quotes, swaps, pool price |
| `network` | `.imd/reads/network.json`, copied unchanged | public RPC URLs, explorer links, Uniswap v4 addresses (`universalRouter`, `quoter`, `stateView`, `permit2`), the IMD pair token |
| `walletAddChain` | `.imd/reads/network.json`, copied unchanged | `wallet_addEthereumChain` when a wallet does not know the chain |
| `assets[]` | computed after the build | SHA-256 of every exported file except the manifest |

Protocol ABIs for the Uniswap v4 contracts (quoter, universal router, Permit2, StateView) and the
non-secret UX settings (poll interval, default slippage, 30-day block fallback, optional
WalletConnect project id) are the only constants, also in `src/config.ts`. No WalletConnect project
id is configured: the wallet menu offers browser wallets discovered through EIP-6963 (and
`window.ethereum` when present). To add WalletConnect, set `settings.walletConnectProjectId` and
add the `walletConnect` connector in `src/chain.ts`.

`SnitchReports` is not a handoff contract (SnitchDesk deploys it), so its address is read from
`SnitchDesk.reports()` at runtime and only its ABI ships in `dist/abi/`.

`web/deployment/deployment.json` and `web/deployment/network.json` are byte copies of the
assignment's handoff inputs, kept so the manifest can be regenerated when `.imd/reads/` is absent.

## Install, preview, rebuild

```sh
cd web
npm ci                      # dependencies (node_modules is not committed)
npm run typecheck           # tsc --noEmit
npm test                    # vitest: swap encoding, formatting, routing, config validation, errors
npm run build               # typecheck + vite build → ../dist (relative base ./)
npm run manifest            # writes ../dist/imd-deployment.json after verifying ABI hashes
npm run preview             # serves ../dist locally (vite preview)
```

Rebuild order matters: `build` empties `dist/`, so run `manifest` after every build and commit
`dist/` together with the source. `manifest` reads the handoff from `../.imd/reads/` when present,
else from `web/deployment/`, verifies each handoff `abiHash` against
`keccak256(canonical JSON of docs/abi/<Contract>.json)` (sorted keys, no whitespace), copies the
ABIs into `dist/abi/`, hashes every exported file and refuses more than 128 assets or an 8 MiB file.

The export works from any gateway subpath or ENS name: all asset URLs are relative, routes are
hashes (`#/cases`, `#/report/42`, `#/open?kind=1`, `#/trade`, `#/how`, `#/owner`), and the manifest
is resolved against `document.baseURI`.

## What the pages do

- **Home**: tagline, example card (never read from the chain), the two case kinds as folder
  tabs, the five latest reports.
- **Case files**: every answered or filed case, filters All / Clean / Snitched, search by wallet,
  token address, symbol or case number; the connected wallet's own cases; open cases.
- **Report**: the card (client-side SVG with the same geometry as `SnitchArt.svg`), claim,
  verdict, panel numbers, Etherscan links, "Post it on X", `File the report` (anyone, answered
  case), `Drop the case` (opener, after 72 hours or a recorded oracle failure), and the on-chain
  `tokenURI` image once filed.
- **Open a case**: kind, token, wallet, block range defaulting to the token's deployment block
  (binary search over `eth_getCode`) or the last ~30 days, up to the latest block; live case fee
  and oracle price; approve exactly those amounts; `openCaseWithLimits` with them as caps.
- **Trade SNITCH**: pool price from `StateView.getSlot0`, quote from `quoteExactInputSingle`
  through `eth_call`, slippage, then `approve(permit2)`, `permit2.approve(token, router, amount,
  expiration)` and `universalRouter.execute(0x10, …)` with actions `0x060c0f`, each simulated
  before the wallet opens. IMD is an ERC-20, so no ETH value is ever sent.
- **How it works + FAQ** and **Owner settings** (case fee, panel, failure hook, intake, action,
  signer; visible to the connected owner).

Reads refresh every 12 seconds through the configured public RPCs with fallback; the wallet only
signs. Every write is simulated with `simulateContract` first and its revert reason is translated
(`src/lib/errors.ts`). Amounts use each token's decimals; USD context is deliberately absent
because the site reads no price source.

## Validation

See `docs/validation.md` for the build, typecheck, unit-test and browser results (mocked wallet,
live RPC reads), the Better Interface review, and what was not tested on a live chain.
`docs/DESIGN.md` documents the implemented tokens, typography, components and responsive
behaviour for anyone adding a page.
