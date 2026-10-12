# SNITCH revision 2: offline installation and share preview

Worker evidence, 2026-10-12. This revision evaluates the two reopened findings against baseline
commit `24a45bc`. It preserves the accepted application, wallet/contract flows, source dependencies
and design. The only runtime changes are the static social metadata and its PNG asset.
This record is worker evidence, not independent certification or a publication result.

## Findings and decisions

**`fd0914bf…` — disputed requirement; the reported failure reproduces.** `web/README.md:42`
accurately states that installation needs registry access. Copied only `package.json` and
`package-lock.json` to `test/scratch/revision-2/offline/web`, verified zero cache entries, and ran:

```sh
npm ci --offline --cache ../cache --ignore-scripts --no-audit --no-fund
```

Exit 1, `ENOTCACHED`, request to `https://registry.npmjs.org/react`. The full output and cache
precondition are in [revision-2-before.json](revision-2-before.json). The finding says the
assignment requires committed installed dependencies; this assignment contains no such requirement.
Its overriding rules state:

> You may reach the network and install frontend dependencies to build and check this task.

> Do not commit node_modules, package-manager caches, registry mirrors or unnecessary dependency archives such as web/vendor/npm/*.tgz. Offline service verification does not require a vendored npm registry.

Kept the accepted source installation behavior, package manifest, lockfile and ignore rules.
No dependency payload was added. The existing fully bundled export still serves without npm or a
build. This decision does **not** claim an empty-cache offline source build works. Online
`npm ci` succeeded with 566 packages, followed by the build and checks below.

**`9a54f2df…` — fixed.** At baseline `web/index.html:11`, the source/static head and Chromium at
390px and 1440px had no `og:image` or `twitter:image`, used `twitter:card=summary`, and the 11-file
asset inventory contained no raster card. These results are also in
[revision-2-before.json](revision-2-before.json).

- `web/public/share-card.png` / `dist/share-card.png`: a 1200×630 PNG, 296,905 bytes. It reuses the
  home example's `ReportCard`, production CSS/fonts, SNITCH title, tagline and description. The
  visible **Example** label distinguishes the sample from a live finding.
- `web/scripts/share-card.cjs:35`: reproducible browser rendering from the existing export. It
  blocks external requests, renders with reduced motion, waits for both local fonts and checks
  the frame's safe margins. The first render exposed a font-origin problem in the new generator;
  using a same-origin local frame fixed it before the PNG was exported. No application source
  or styling change was needed.
- `web/index.html:12`: static OG/Twitter image paths, dimensions/type, matching descriptive alt
  text and `summary_large_image`. The paths stay relative until the publisher knows the final
  public URL; `web/README.md:66` records the URL replacement and manifest regeneration steps.
- Final export: the image resolves from `/preview/` at both requested widths, decodes at its
  declared size, and is served as `image/png`. Static HTML contains the metadata before scripts
  execute. The two fixture report links still carry their individual claim, verdict and hash URL.

Both complete finding IDs and verdicts are in the required root `.imd-responses.json`.

## Build and interaction checks

From `web/`, all exited 0:

```sh
npm ci --cache /tmp/snitch-revision-2-npm-cache --no-audit --no-fund
npm run typecheck
npm test
npm run build
npm run manifest
```

Node 24.21.0, npm 11.19.0, Vite 7.3.7. **40 unit tests passed** in four files. The build includes
typechecking again and retains the existing dependency annotation and main-chunk size warnings.
The PNG was generated before this final build; normal builds just copy it from `public/`.
The exported JS, CSS, fonts, favicon and ABIs are byte-identical to the accepted baseline.

Browser tooling was installed only in disposable scratch storage:

```sh
npm install --prefix test/scratch/revision-2/browser --cache /tmp/snitch-revision-2-npm-cache --no-audit --no-fund playwright@1.64.0
PLAYWRIGHT_BROWSERS_PATH=/tmp/snitch-revision-2-browsers node test/scratch/revision-2/browser/node_modules/playwright/cli.js install chromium
NODE_PATH="$PWD/test/scratch/revision-2/browser/node_modules" PLAYWRIGHT_BROWSERS_PATH=/tmp/snitch-revision-2-browsers node docs/validation/revision-browser.cjs --output-dir test/scratch/revision-2/final-browser
node docs/validation/revision-2-audit.cjs
```

The browser and audit exited 0. Chromium 156.0.8078.4, Playwright 1.64.0: **49 deterministic
browser checks passed**; [full results](revision-2-browser.json). They include share metadata and
image decoding at 390/1440px, report sharing, event ordering, disconnected/wrong-chain handling,
unknown-chain add/switch, approvals, fee-capped case opening, configured-router swaps, filing,
owner settings, retries, rejection/errors, keyboard skip/menu focus, reduced motion and reflow.
Wallets and RPCs are mocked; no transaction was signed or broadcast. No page/console errors,
failed local assets or unhandled mock requests were recorded. The bounded script closed its
browser and server. Fresh screenshots were inspected from its scratch output; the delivered
[share card](../../dist/share-card.png) is also the exact rendered visual artifact.

The [independent audit](revision-2-audit.json) verifies every exported asset's SHA-256, all allowed
manifest keys, exact handoff identifiers/contracts/poolKey/network/wallet-add parameters, all four
ABIs against pinned commit `13de1c8a9975a6dcab5202f6b01c9a9363d76b29`, and each attested ABI's canonical
Keccak hash. **12 assets, 1,036,599 bytes**, plus the **4,346-byte manifest**. Source and exported
PNGs are identical. No contract source, root build configuration, package manifest, lockfile or
ignore file changed. Submission scope and size evidence is in [revision-2-package.json](revision-2-package.json).

## Better Interface review

Read the pinned workflow, core principles of all six domains, frontend UX adapter/reference and
design-documentation method. The final source is documented in `docs/DESIGN.md`; root `DESIGN.md`
remains outside the explicit path budget.

| Domain | Coverage for this revision |
| --- | --- |
| Accessibility | **Checked:** both social image descriptions identify the example. CLEAN remains a visible word, not colour alone. Existing keyboard skip/menu focus and reduced-motion behavior passed again. Screen-reader and native zoom checks were not performed. |
| Layout | **Checked:** inspected the full 1200×630 PNG; its title, description and sample fit with 48px safe margins. Example, stamp and panel remain separate. App reflow passed at 320/390/850/1440px; wallet menu bounds passed at 320/350/390/640/850/1440px. The share asset has a fixed aspect ratio; app breakpoints are unchanged. |
| Writing | **Checked:** reused approved title, tagline and explanatory copy; retained the visible Example label and described it in metadata. Documentation distinguishes the prepared asset from the remaining publication URL/crawler step. |
| Typography | **Checked:** generator loaded Archivo Narrow 700 and IBM Plex Mono 400 from the export and inspected text wrapping in the raster result. Headline, body and numerical roles match the app; no fonts were added. |
| Colors | **Checked:** production paper/fiber, ink and green verdict tokens are reused and the PNG was visually inspected. No new colour tokens or themes. A fresh measured contrast audit was not performed; the existing token-pair calculations remain in `docs/DESIGN.md`. |
| UI | **Checked:** the preview preserves the existing flat borders and stamped report with a clearly marked sample. No new controls, animations or transaction states. Existing primary interactions and error recovery passed against the rebuilt export. |

Complete for this revision's worker scope. Real social crawler rendering, the final absolute image
URL, published CID/name checks, physical devices, screen readers, native zoom, and live-chain writes
remain untested or pending. All hash routes use the same site preview; the X intent text remains
report-specific. Earlier live-read evidence is historical and was not rerun for this metadata-only
change. The confirmed offline-install limitation remains intentionally documented under the
assignment's network-installation rules.
