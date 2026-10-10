# Release testing — 10 October 2026

This is the first release testing pass after the activity-authoring and export increment (`d3b2449`). It records checks actually performed and the repairs they prompted. It does not mark the release phase complete.

## Environment and automated checks

- macOS 27.0.1 (26A434), Chrome 154.0.8037.98, Safari 27.0.1.
- `npm test -- --maxWorkers=2`: **160 tests across 31 files pass**. Run separately from builds; concurrent compilation previously caused the bundled symbolic-runtime test to exceed its timeout.
- `npm run desktop:build -- --bundles app`: **passes**, including runtime preparation, TypeScript, the production web build and the packaged Mac application.
- The production snapshot contains all 25 listed bundled assets and seven local mathematics-runtime files. Runtime sizes and SHA-256 hashes were verified; the runtime totals 18,147,759 bytes.
- Existing large-chunk and dependency-directive build warnings remain. Performance targets have not been established by these successful builds.

## Manual checks

Browser checks used local production previews, separate from the development workspace. The final offline checks used an immutable copy of the final build on a fresh origin, so an earlier service worker or a rebuild could not mask the result.

| Platform / check | Observed result |
|---|---|
| Chrome: 2D JPEG export | Downloaded a 1630 × 1680 JPEG; inspected the grid and plotted line in the actual image. |
| Chrome: 3D PNG export with networking disabled | Downloaded an 800 × 912 PNG; inspected the rendered paraboloid and grid. |
| Chrome: action sequence editing | Decimal `0.201` and negative `-2.5` values run correctly. A blank draft is rejected without changing the parameter. Each successful run is undone with one Undo action. |
| Chrome: saved sequence reload | Reload preserves the authored step without executing it; workspace parameter remains at its separately saved value. |
| Chrome: Print / PDF | Browser print preview contains two worksheet pages, graph, prompts and the static action sequence. Expected answers are omitted by default. Preview was cancelled; no PDF file or physical print was produced. |
| Chrome: 400px responsive viewport | Action fields and step buttons wrap; the single template dropdown contains all ten options; the export popover fits the viewport. This is viewport emulation, not a real touch-device test. |
| Chrome: export keyboard handling | Escape closes the popover and returns focus to its summary; Enter reopens it. |
| Chrome: fresh offline reload | After “Offline maths ready,” disabled networking and reloaded successfully. Network panel reports zero bytes transferred. |
| Chrome: first symbolic worker launch offline | Saved an unchecked answer, reloaded offline, then checked `x²+2x+1` against `(x+1)^2`. The first worker/runtime initialization succeeds and reports equivalence, with zero bytes transferred. |
| Chrome: light and dark error states | Rendered “Unknown symbol ‘q’” and primary action labels are readable in both themes after the contrast repair. |
| Chrome: 200% zoom spot check | Calculation view switches to its method dropdown and wraps engine choices. Header space is constrained and some tabs are outside the visible strip; full zoomed navigation and reflow coverage remain outstanding. Zoom restored to 100%. |
| Safari: functional smoke check | Notebook loads, exposes ten templates, appends slope/intercept content and checks `-0.5` against `-1/2` successfully. Native screenshot capture was incomplete, so this is functional evidence, not a Safari visual audit. |

The previous authoring increment also checked template insertion and HTML download in Chrome. The checks above supersede its “visually unverified” status specifically for the inspected mobile sequence layout, Chrome print preview and painted 2D/3D image exports. They do not establish every export format on every browser.

## Repairs from testing

### Offline public assets

The preview server sends `Vary: Origin`. Precache fetches omit the Origin header, while later module-worker requests can include it. Normal Cache API matching therefore missed an already-cached file, and the first symbolic calculation after an offline reload failed. A fresh-origin check also reproduced the mismatch for the app's JavaScript and CSS.

The service worker now ignores Vary only for same-origin public files under `assets/` and `math-runtime/`, whose content does not depend on Origin. Other paths retain normal matching. Runtime integrity checks still run before offline readiness is recorded.

Four regression cases execute the actual service-worker source: cached runtime and app assets remain available across the Origin mismatch; other paths retain Vary matching; corrupted runtime files never mark offline readiness. The cached-asset cases failed before the repair and pass after it. The fresh-origin offline checks in the table verify the repair in Chrome as well.

### Theme contrast

Primary foreground and error colours now come from theme-specific tokens. Removed an older `!important` error colour that prevented the theme from applying. Spreadsheet tooltips keep their existing white-on-red treatment.

These ratios were calculated from the CSS colour pairs using sRGB relative luminance; they are representative pairs, not an exhaustive audit of every rendered state.

| Text / background pair | Before | After |
|---|---:|---:|
| Light primary action | 2.36:1 | 5.82:1 |
| Light error on white | 1.70:1 | 7.74:1 |
| Dark notebook error on panel | 3.53:1 | 10.06:1 |
| Dark primary action | 8.09:1 | 8.09:1 |

The final source interface review returned **`disposition: ship`**, with no material source findings remaining. This applies to the reviewed repairs; it is not a full WCAG conformance verdict.

## Remaining release checks

- Broader Safari offline/export/visual coverage, Firefox and Edge, and a documented supported-browser matrix.
- Actual packaged Mac authoring, print and export interactions; signing, notarisation and distribution installation checks.
- Complete keyboard-only workflows, VoiceOver results and dynamic announcements, focus order, 200%/400% reflow, and all control/error/graph contrast states.
- Real touch devices and baseline student hardware; latency, 2D interaction, 3D frame rate, memory, battery and sustained workloads.
- Broader independent numerical/reference cases, workload limits, cancellation, upgrade/recovery and long-running persistence checks.
- Student usability sessions covering graphing, parameters, data import and activity completion.

Online features remain outside this work.
