# Offline mathematics

Contour's math runs on the device. Exact symbolic tools use a bundled SymPy 1.14 runtime through Pyodide 314.0.7. No calculation calls a server. Online accounts, sync, classrooms and publishing are outside this increment.

## Choose a tool

| Workspace | Supported work |
| --- | --- |
| Maths → Exact symbolic tools | Exact fractions and radicals; real/complex simplification; expansion and factorisation; rational/trigonometric simplification; substitution; equation and nonlinear-system solving; real inequalities; derivatives, gradients and Hessians; indefinite and definite/improper integrals; one-sided/two-sided limits; series; exact matrix rank, row reduction, determinant, inverse and eigen information; first-order ODE initial values; asymptotes; implicit-family envelope candidates |
| Maths → Worked steps | Linear/quadratic equation steps and derivative rules for supported sums, products, powers and function chains |
| Maths → Differential equations | Adaptive numerical scalar initial-value solutions and two-variable systems, slope fields, phase portraits, trajectory plots and local error tolerance |
| Maths → Quick & numerical tools | Existing lightweight calculations, matrix arithmetic, statistics, bounded numerical integration and root searches; numerical roots also refine isolated even roots |
| Spreadsheet & Stats | Linear, exponential and polynomial regression (degrees 2–8); residuals/R²; descriptive plots; distribution densities/masses and inclusive interval probabilities; one/two-sample mean inference, Welch, paired t, ANOVA, Bonferroni comparisons, chi-squared tests and Wilson proportion intervals/score tests |
| 2D geometry | Editable free-point coordinates; intersections and points constrained to constructed paths; linked transformations including arbitrary-line reflection and 2×2 matrices; saved tangents; parametric curve loci; existing conics, polygons, measurements and line-family envelopes |
| 3D | Sampled explicit, implicit and parametric surfaces and curves; transverse surface intersections; x/y/z plane sections of meshes and solids; vector fields; cube, pyramid, tetrahedron, cylinder and cone nets |
| Notebook | Saved symbolic answer checks; implicit/inequality graph previews; on-demand 3D previews preserving the active theme; existing linked editable tables, equations, variables and activity controls |

## Exact symbolic input

Use `^` for powers, `*` for multiplication, `pi`, `e`, `i` and `oo` for constants. Examples:

- Exact value: `1/3 + 1/6` → `1/2`.
- Solve equation: `x^3-x=0` → `{-1, 0, 1}` over the reals.
- Solve system: `x+y=3; x-y=1` → `{(2, 1)}`; the result names the tuple's variable order.
- Solve inequalities: `x^2<4; x>0` → `(0, 2)`.
- Antiderivative: `exp(-x^2)` may return a special function. The integration constant is described separately.
- Definite integral: `exp(-x)` with bounds `0`, `oo` → `1`.
- Limit: `sin(x)/x` approaching `0` → `1`; choose left, right or both.
- Matrix: `1,2;3,4` (commas separate columns, semicolons separate rows).
- First-order ODE: `y` means `dy/dx=y`; choose initial x and y.
- Family envelope: `y-t*x+t^2`, variable `t`, solves `F=0` and `dF/dt=0` for x,y. Candidates require checking for the intended family.

The chosen real/complex domain and assumptions affect symbolic results. Workspace numeric definitions are substituted except for the chosen variable. Restrictions of the original expression are reported where SymPy can determine them: simplifying `x/x` does not erase its undefined point. Unevaluated integrals, derivatives and conditional solution sets are shown explicitly. A result containing `oo`, `I`, `Abs` or an interval is symbolic notation rather than a decimal.

Input is parsed into a restricted mathematical syntax tree. User text is never executed as Python or JavaScript. Expressions are limited to 2,000 characters, 300 nodes, depth 40, eight input rows and 8×8 matrices; constant exponents are bounded. Symbolic jobs terminate after 90 seconds and **Stop** terminates the worker. Changing inputs hides outdated output. Starting a new calculation discards any prior job.

## Numerical interpretation

Plots and mesh intersections approximate finite samples. Small features, nearby roots, discontinuities and features outside the sampling window can be missed. Mesh intersections omit coincident faces and tangencies; they are not a symbolic intersection solver. Pair calculations are bounded to eight visible surfaces and explicit workload limits. Plane sections omit triangles coplanar with the plane. Parametric loci are sampled curves, not a general constraint-locus theorem engine.

The differential explorer uses adaptive RK4 step doubling for one to three state variables (the interface exposes one and two). Tolerance controls local scaled error, not total solution error. Jobs run in a stoppable worker, have a 30-second time budget, and reject excessive steps, non-finite derivatives and divergent values. The plot window is fixed at ±5. A system field is shown at the initial time; only autonomous fields remain the same throughout the trajectory.

Polynomial fitting uses centered/scaled coordinates and reorthogonalized QR rather than normal equations. The displayed normalized polynomial avoids cancellation for large x offsets. Singular fits are rejected. Numerical root search uses 900 samples and returns at most 64 roots; this is not an exhaustive guarantee. The older quick integration and ODE commands retain their fixed-step algorithms.

Statistical results describe the selected assumptions. Paired tests use matched finite rows; unmatched rows are reported as omitted. Wilson intervals allow zero/all successes, while the normal score test warns when expected counts are small. Distribution interval probability is inclusive for discrete outcomes. These additions use [NIST's Wilson interval definition](https://www.itl.nist.gov/div898/software/dataplot/refman1/auxillar/propconf.htm) and [paired t procedure](https://www.itl.nist.gov/div898/handbook/prc/section3/prc311.htm).

Notebook answer checking compares expressions on their common defined domain. It does not prove the student's reasoning or establish that two original expressions have identical domains. Expected answers remain visible in this authoring interface. Checking is explicit; importing a notebook never executes a calculation or user script.

Printable nets use the dimensions written on each PDF-printable SVG, not the currently selected solid's size. Print at 100% scale; join edges with tape. Cut and fold guides are distinguished.

## Offline installation and development

`npm run build` prepares the local runtime and verifies SymPy/mpmath wheel hashes against the pinned Pyodide lock file. A first build may download those wheels from the official Pyodide distribution; subsequent builds reuse verified local copies. The runtime and its licenses are committed under `public/math-runtime/`. Deployment follows [Pyodide's local hosting guidance](https://pyodide.org/en/stable/usage/downloading-and-deploying.html).

The production web service worker caches application chunks, workers, equation fonts and all seven runtime files. It verifies runtime byte counts and SHA-256 hashes before reporting **Offline maths ready**. Wait for that status after the initial visit before disconnecting. A failed/incomplete install is not marked ready. The packaged Mac app includes the same runtime and can calculate without a first online visit. Development mode does not install the production offline cache.

Results in Maths tools are temporary. Notebook answer inputs, geometry objects, regression model/degree and linked notebook previews save with the project; calculated outputs are recomputed. Export a project file for a durable backup.

## Validation boundaries

Automated tests cover real bundled SymPy execution, input rejection, worker cancellation/timeout, singular/domain cases, analytic ODE solutions, reference inference/probability cases, stable polynomial fits, geometry dependencies and sampled 3D intersections/sections. Those checks establish representative correctness, not a guarantee for every formula. General proof generation, arbitrary constraint constructions, unrestricted activity scripting and exact intersections of arbitrary 3D surfaces are not supported claims.

The current increment passes 136 tests across 25 files, the production web build and `desktop:build -- --bundles app`. Chrome desktop and 400px layouts were inspected. Production Chrome was reloaded with network disabled and calculated an exact result with zero transferred bytes. The new Mac package also calculated `sqrt(2)+3/4` as `3/4 + sqrt(2)`. Finishing UI review returned `disposition: ship`. These checks do not replace Safari testing or a wider hardware/accessibility/release audit.

## Activity authoring

Notebook's single **Activity templates** dropdown contains ten editable guided activities. Author action sequences of at most twenty parameter/visibility steps; the app validates every step before applying the sequence as one undoable edit. Export worksheets through the header's **Export** menu as HTML, Markdown or browser Print / PDF. Expected answers are excluded by default. Graph snapshots support PNG, JPEG, WebP and SVG; SVG snapshots contain a raster image. Static worksheets preserve current numeric values and sampled 2D previews, with 3D formulas and source LaTeX notation rather than live controls.
