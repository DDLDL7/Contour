# Release testing — 10 October 2026

This report records the first testing pass after the activity-authoring and export increment (`d3b2449`) and the checklist follow-through after `57446cc`. It records checks actually performed and the repairs they prompted. It does not mark the release phase complete. The later results below supersede earlier counts and remaining-work entries where stated.

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

## Remaining checks after the first pass

- Broader Safari offline/export/visual coverage, Firefox and Edge, and a documented supported-browser matrix.
- Actual packaged Mac authoring, print and export interactions; signing, notarisation and distribution installation checks.
- Complete keyboard-only workflows, VoiceOver results and dynamic announcements, focus order, 200%/400% reflow, and all control/error/graph contrast states.
- Real touch devices and baseline student hardware; latency, 2D interaction, 3D frame rate, memory, battery and sustained workloads.
- Broader independent numerical/reference cases, workload limits, cancellation, upgrade/recovery and long-running persistence checks.
- Student usability sessions covering graphing, parameters, data import and activity completion.

Online features remain outside this work.

## Checklist follow-through

The user selected the release checklist, excluding online features and separate AI/curriculum/mobile extensions. Testing uses existing Chrome and Safari. Temporary Edge software was removed and the Firefox download cancelled; neither browser is included in verified coverage.

### Automated results and repairs

- `npm run test:release`: **206 tests across 36 files pass**, run separately from compilation. Production TypeScript/web and `npm run desktop:build -- --bundles app` pass; the application bundle is 20.73 MiB. Existing large-chunk and dependency-directive warnings remain.
- Added 27 numerical references: shifted repeated roots and poles, analytic derivatives, forward/backward logistic initial values, Cauchy/Poisson distributions, sphere mesh coordinates, degree-eight regression with large offsets and linked spreadsheet updates. Existing bundled SymPy, cancellation, timeout and project-round-trip checks also pass.
- Eight recovery cases cover malformed and unsupported-version records, previous-save restoration, exact-byte preservation, repeated recovery copies and quota failure before/after archiving. Damaged saves now pause autosave until explicit recovery instead of being overwritten by a startup fallback. Valid previous saves are backed up before replacement. Imports do not execute actions.
- Automated axe checks cover application semantics in all five workspaces, with canvas/MathLive mocked and colour contrast disabled. They establish no violations within that scope, not full WCAG conformance. Help focus containment/Escape/restoration, workspace arrows/Home/End and keyboard geometry have interaction tests.
- Repaired Help focus and inert background handling, workspace/sheet tab semantics, row headings and header reflow. Added keyboard 2D construction/selection/pan/zoom/reset and 3D camera movement. Clipped graph instructions and cursor status remain in the accessibility tree. An experienced screen-reader user's announcements still need verification.
- Deferred the approximately 593 KB Three.js scene chunk until 3D is opened. The initial main chunk is approximately 1.96 MB; this reduces startup JavaScript, not the complete offline download. The lazy chunk remains in the precache manifest. A local error boundary and rejected-chunk regression keep surrounding workspace controls available after a load failure.
- The final source repair review returned **`disposition: ship`**. This applies to the reviewed repairs, not all release gates.

### Additional manual evidence

These checks used an immutable copy of the final web build on a fresh local origin. Stopping that origin's preview server makes all same-origin app/runtime requests unavailable; it does not disable the Mac's networking or prove a zero-byte network trace. The preceding first-pass Chrome checks did use browser networking disabled and measured zero transferred bytes.

| Platform / check | Observed result |
|---|---|
| Chrome: final project import/reload | Imported a valid fixture with three graphs and fifteen notebook cells; reload retained it. A temporarily disabled Open button was resolved by bringing the test file dialog forward; no product filter defect was established. |
| Chrome: 200%/400% zoom | All workspace tabs and header actions remain reachable in the new wrapped header. Notebook text reflows; Help Escape restores its trigger. These are spot checks, not exhaustive zoomed workflows. Restored 100%. |
| Chrome: final offline reload and first 3D launch | After offline readiness and cache activation, stopped the preview server, reloaded, opened 3D for the first time and inspected the rendered paraboloid/grid. The deferred chunk loaded from cache. |
| Chrome: final first symbolic worker launch offline | With the server stopped, checked the previously unchecked `x^2+2*x+1` against `(x+1)^2`; reported equivalence where both expressions are defined. |
| Chrome: WebP and SVG graph exports offline | Downloaded both actual files. Inspected the 1630 × 1680 WebP: grid, parabola and line are painted. SVG snapshot download succeeded; full rendered SVG inspection remains open. |
| Safari: final project import and offline reload | Imported the same fixture, activated the cache, stopped the preview server and reloaded successfully with saved content and offline readiness. |
| Safari: first deferred 3D and symbolic worker offline | 3D exposes its loaded canvas and camera controls. The unchecked polynomial answer reports equivalence after first worker initialization. These are functional results; Safari screenshot/visual coverage remains open. |
| Packaged Mac: baseline save and HTML export | In an isolated copy of the preceding build, downloaded an actual project JSON and a quadratic activity HTML worksheet. This does not establish every final native export path. |
| Packaged Mac: Print / PDF fallback | Displays “Print / PDF is unavailable here” with instructions to export HTML and print from a browser. Native printing did not pass; the documented fallback is observable. |

### Computation baseline

`npm run benchmark` warms each workload five times, then records thirty samples. The baseline machine is an Apple M1 MacBook Air with 8 GiB RAM, Node v26.7.0. The [machine-readable result](COMPUTATION_BENCHMARK.json) records the run. Local budgets are 100 ms for ordinary computations and 1000 ms for meshing/ODE work; they are computation budgets, not measured browser interaction targets.

| Workload | p95 milliseconds |
|---|---:|
| Compile 20 expressions | 0.700 |
| Sample 10 notebook previews | 7.271 |
| Evaluate 144 linked cells | 1.159 |
| Degree-eight regression | 0.108 |
| Implicit sphere, 36 cells | 33.244 |
| Parametric torus, 64 cells | 5.871 |
| Ten oscillator cycles | 1.165 |
| Validate all-ten-template project | 0.058 |

All budgets pass. Two thousand compile/project-validation cycles retain approximately 0.059 MiB additional heap after forced garbage collection. That limited Node computation soak does not establish browser/native memory stability, GPU frame rate, input-to-paint latency or battery behaviour during a 30-minute student session.

### Current release gates

| Gate | Status / remaining evidence |
|---|---|
| Automated mathematics, recovery and builds | Pass for the documented cases; representative coverage does not prove arbitrary mathematics. |
| Chrome desktop compatibility | Offline runtime/3D, authoring, representative exports and zoom spot checks pass. Actual PDF saving, rendered SVG and exhaustive keyboard/error/contrast workflows remain open. |
| Safari desktop compatibility | Import, templates and offline runtime/3D functional checks pass. Visual, print and every-format export coverage remain open. |
| Native Mac compatibility | Build passes; baseline project/HTML downloads and print fallback observed. Final native interaction/export matrix and installation on another Mac remain open. |
| Firefox and Edge | Unverified; no additional browsers will be installed as part of this work. |
| VoiceOver / full accessibility | Source/automated repairs pass; experienced-user spoken output, complete graph access and all dynamic states remain open. |
| Device performance and touch | Node computation baseline passes. Real touch hardware, browser/GPU measurements and sustained memory/battery remain open. |
| Student usability | [Task scripts/result sheets](STUDENT_TESTING.md) prepared; no participants tested or results supplied. |
| Public Mac distribution | [Script and runbook](MAC_DISTRIBUTION.md) prepared. Preflight correctly refuses to proceed without Developer ID credentials. The user does not yet have them; signing, notarisation, Gatekeeper and second-Mac installation remain blocked. |

No public signed release, full browser matrix, complete accessibility audit or completed student study is claimed.
