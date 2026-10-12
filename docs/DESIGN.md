# SNITCH design

Documentation of the implemented site in `web/src/`, extracted from the source after the final
build. Use it to add a page that belongs to the same product.

## Overview

The audience is crypto-Twitter readers checking a claim about a wallet, on a phone first (the brief
asks for mobile first at 390 px). The visual character is a manila case folder, not a dashboard:
one paper colour with a faint fibre texture, ink-black text, flat controls with a 2 px ink border,
no gradients, glow, pills or shadows, and a single animation (the verdict stamp dropping onto a
card). Hierarchy comes from bold condensed uppercase headlines against a plain system sans body,
with a monospace face reserved for numbers, addresses and hashes.

System-wide rules: all colours and spacing come from the custom properties in
`web/src/styles.css`; headings are uppercase Archivo Narrow; every control is a bordered box on
the lighter surface colour; one filled (ink) primary action per step. One page's arrangement
(the home hero's card-plus-folders grid, the report page's card-plus-facts grid) is not a rule.

## Colors

Defined once in `web/src/styles.css` (`:root`). Primitives are named by hue; components only use
the semantic tokens.

| Semantic token | Value (primitive) | Job |
| --- | --- | --- |
| `--color-paper` | `#E9D8A6` (`--paper-500`) | page background (with `--fiber`, an inline SVG noise at ~7 % opacity) and the card |
| `--color-surface` | `#F4EBD0` (`--paper-300`) | controls, inputs, list rows, panels, folders |
| `--color-surface-inset` | `#DCC98F` (`--paper-600`) | hover of surfaces, the active kind tab |
| `--color-ink` | `#1C1A17` (`--ink-900`) | primary text, borders, the filled primary button |
| `--color-text-secondary` | `#4A443A` (`--ink-700`) | hints, captions, `dt` labels, folder body copy |
| `--color-on-ink` | `#E9D8A6` | text on an ink fill (primary button, pressed segment, Example tag) |
| `--color-focus` | `#1C1A17` | 3 px focus ring, 2 px offset (`:focus-visible`) |
| `--color-verdict-clean` / `--color-verdict-snitched` | `#23784A` / `#C62A1F` | the stamp (large bold text and a 6 px stroke) and the invalid-field border only |
| `--color-verdict-clean-text` / `--color-verdict-snitched-text` | `#17512F` (`--green-700`) / `#8A2219` (`--red-700`) | small verdict text in lists and facts |
| `--color-error-text` | `#8A2219` | inline errors and transaction failures |

Computed WCAG 2 contrast from the declared pairs (not rendered measurements): ink on paper 12.27:1,
ink on surface 14.59:1, secondary text on paper 6.81:1, paper on ink 12.27:1, clean text
`#17512F` on paper 6.58:1, snitched/error text `#8A2219` on paper 6.39:1. The brief's brand red and
green on paper measure 3.95:1 and 3.85:1, which passes the 3:1 large-text threshold for the stamp
(56–58 px bold) but not 4.5:1, so they are never used for small text. No dark theme exists; the
page declares `color-scheme: light`.

## Typography

| Role | Family and file | Size, weight, spacing |
| --- | --- | --- |
| Headlines, buttons, nav, verdict words | `--font-headline`: Archivo Narrow 700, `@fontsource/archivo-narrow` latin woff2 bundled by Vite; fallbacks Arial Narrow, Helvetica, Arial | uppercase; `--text-display` `clamp(2.5rem, 7vw, 4.5rem)`, `--text-page` `clamp(2rem, 5vw, 3rem)`, `--text-section` 1.5rem, `--text-small-head` 1rem with 0.04em tracking; line-height 1.1; `text-wrap: balance` |
| Body | `--font-body`: system-ui stack | 1rem, line-height 1.5, `text-wrap: pretty`; lede 1.125rem; captions `--text-caption` 0.875rem |
| Numbers, addresses, hashes, block numbers | `--font-mono`: IBM Plex Mono 400, `@fontsource/ibm-plex-mono` latin woff2 bundled; fallbacks Menlo, Consolas | inherits size; `font-variant-numeric: tabular-nums` through `.mono` |

Only the two font files above ship (no italics, no other weights); synthesis is left on. Inputs
are 16 px at every width. Long-form text is capped at `--measure: 68ch`. Addresses and ids use
`overflow-wrap: anywhere`. Underlines use `text-underline-position: from-font` and
`text-decoration-thickness: from-font`. Headlines are stored in natural case and transformed in CSS.

## Layout

Spacing is a 4 px scale: `--space-1` 0.25rem through `--space-12` 3rem. Pages sit in a 72rem
column (`.site-header`, `.site-main`, `.site-footer`) with 1rem inline padding that respects
`env(safe-area-inset-*)`. Groups are separated by space first (1.5–3rem between sections, 0.75–1rem
inside a group) and by the 2 px border only where a control or panel needs a shape.

Breakpoints come from the content and are written in rem: two-column field rows and kind tabs from
40rem, the hero grid (card 24rem + folders) from 52rem, the report grid and owner grid from 56rem,
and the facts list collapses to one column below 30rem. All grids use `minmax(0, …)` so long
addresses wrap instead of overflowing; verified in the browser at 320, 390 and 1280 px with no
horizontal scroll. Logical properties (`inset-inline-*`, `padding-inline-*`) are used for
direction-dependent spacing; RTL was not rendered.

Primitives: `.form` (grid, max 44rem), `.field` / `.field-row`, `.facts` (definition list),
`.cost` and `.stepper` panels, `.section` / `.section__head`.

## Elevation & Depth

Deliberately flat. Structure is carried by the 2 px ink border (`--border`) and by the two paper
tones (page vs surface). The only overlay is the wallet menu (`.menu`), a bordered surface
positioned under the connect button at `z-index: 5`; the skip link sits above everything at
`z-index: 10`. The on-chain image gets a 1 px `rgb(0 0 0 / 0.1)` outline. There are no box
shadows.

## Shapes

`--radius: 0`: every box is square, including inputs and buttons. The only rounded form is the
rubber stamp's `rx='6'`, inherited from the on-chain SVG. Folder tabs are a bordered rectangle
hung on the top edge of a bordered panel (`.folder__tab`), and the active nav item is a tab
whose bottom border merges with the header rule.

## Components

- **Buttons** (`.btn`, `.btn--primary`, `.btn--small`; `web/src/styles.css`): 44 px minimum
  height, headline face, 2 px border. One `--primary` (ink fill) per step. Press feedback is
  `scale: 0.96`; hover darkens the surface only under `@media (hover: hover)`. Disabled is native
  `disabled` at 45 % opacity, used only when the action is genuinely unavailable (not connected,
  wrong chain, already approved, in flight). Submit buttons stay enabled and validate on submit.
- **Segmented control** (`.segmented`, `.segmented__item[aria-pressed]`): verdict filters and swap
  direction; pressed state is an ink fill.
- **Kind tabs** (`.tabs`, `.tab`, `.tab--active`; `web/src/pages/Open.tsx`): radio inputs inside
  bordered labels; the focused radio draws the ring on the whole tab via `:has(:focus-visible)`.
- **Fields** (`.field`, `label`, `input`, `.hint`, `.error`): visible label, 16 px input,
  `aria-invalid` plus `aria-describedby` to the inline error; the first invalid field is focused
  on submit.
- **Report card** (`web/src/components/ReportCard.tsx`, `.card`, `.stamp`): inline SVG with the
  on-chain geometry (480×640), `role="img"` with the claim as its name; `example` adds the
  "Example" tag; `animateStamp` plays the single drop animation (420 ms, `cubic-bezier(0.2,0,0,1)`)
  only under `prefers-reduced-motion: no-preference`.
- **Address chip** (`web/src/components/AddressChip.tsx`, `.chip`): checksummed address, explorer
  link, copy button with an accessible name; `full` shows the whole address.
- **Transaction status** (`web/src/components/TxStatus.tsx`, `.tx`, `.tx--error`): a stable
  `role="status"` region per action (`role="alert"` on failure) with the explorer link.
- **Connect** (`web/src/components/Connect.tsx`): connect button, wallet dialog (Escape closes,
  focus returns to the trigger) and the connected account (`.connect__account`, with a
  `.connect__note` "wrong network" suffix). The single "Switch to Ethereum" control is the
  `.banner` in `web/src/components/Layout.tsx`, shown only while the wallet is on another chain.
- **Report list row** (`.report-row__link` in `web/src/pages/Cases.tsx`): number, claim and verdict
  with a ✓/✕ glyph so the verdict is not colour-only.
- **Folders** (`.folder`) on the home page link to the open form with the kind preselected.

## Do's and Don'ts

- Start a new page from `.site-main` content with an `h1.h-page`, sections as `.section` with
  `h2.h-section`, and `.form`/`.facts` for inputs and data. Register its hash route in
  `web/src/router.ts` and the nav in `web/src/components/Layout.tsx`.
- Use `.btn--primary` for the one action that moves the task forward in a step; everything else
  is `.btn`. Never colour a button red or green: those hues mean verdicts.
- Put numbers, addresses and hashes in `.mono`; put secondary copy in `.hint`; never use
  `--color-text-secondary` for a border or `--color-border` for text.
- Keep every control a bordered box on `--color-surface`; do not add shadows, radii, gradients or
  a typewriter font.
- Keep motion to the stamp. Any new transition must name its properties and stay under 150 ms.
- Keep addresses, chain ids, ABIs and RPCs out of the source: read them from the deployment
  context (`useDeployment`), which comes from `dist/imd-deployment.json`.
