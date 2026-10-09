# Contour

Contour is an offline-capable graphing calculator for students, built for the web and macOS. It combines mathematical notation, interactive 2D and 3D graphs, geometry, a spreadsheet, maths tools, and local project saving. The broader product roadmap is in [GRAPHING_CALCULATOR_PLAN.md](GRAPHING_CALCULATOR_PLAN.md).

## What works today

- Plot explicit 2D functions, vertical lines, polar and parametric curves, implicit equations, and shaded inequalities.
- Plot piecewise 2D functions and functions with a domain condition.
- Explore explicit, parametric, and implicit 3D surfaces, plus parametric space curves, with rotation and zoom controls. Advanced surface meshing runs in a cancellable worker.
- Trace 2D functions and inspect approximate roots, turning points, intersections, and tangent slopes in the visible view.
- Edit expressions in mathematical notation, create parameter sliders with custom ranges and animation, and use them across graphs.
- Define shared variables such as `b = 2a` and reuse them in 2D or 3D graphs; circular definitions show an error.
- Construct and transform linked 2D geometry, including points, paths, polygons, circles, ellipses, measurements, and selected loci and envelopes.
- Enter formulas on multiple spreadsheet sheets; link active-sheet cells to graphs, chart data, run regressions and supported statistical tests.
- Explore supported 3D solids, vector fields, surface intersections, cross-sections, and printable nets.
- Add offline notebook notes with inline LaTeX and live variables, calculations, editable linked graph/table cells, graph checkboxes, parameter inputs, and fixed action buttons. Append quadratic and data-model activity starters without replacing existing work.
- Undo and redo project edits, including equation typing, title changes, slider moves, and adding or removing expressions.
- Save work automatically on the device, export and import project files, and export graph images.
- Use Maths tools for calculations, supported symbolic algebra and calculus, bounded numerical solving, matrix operations, statistics, regression, and an initial-value ODE estimate. Results display in mathematical notation where supported.
- Use the packaged macOS app offline. The production web app caches its assets after an initial visit for later offline use.

New installations and **New project** open a blank workspace. Example equations are available only when selected. Projects previously autosaved with the untouched original sample equations are migrated to a blank workspace; edited projects are preserved. Browser and desktop autosaves are local to that installation.

## Run the web app

Install Node.js, then run:

```sh
npm install
npm run dev
```

Open the local address printed by Vite. Run `npm run build` to create the production web app in `dist/`.

## Run the macOS app

Install Rust and the Xcode command line tools, then run:

```sh
npm install
npm run desktop:dev
```

Run `npm run desktop:build` to package the app. The Mac app uses the same interface and maths code as the web version. Public Mac distribution requires a separate signing and notarisation setup.

## Current inputs

Expressions are editable in live maths notation. Type `/` for a stacked fraction, `^` for a superscript, or names such as `sin` and `sqrt` for functions. The editor and its fonts are bundled locally, so equation entry also works offline. Existing project files with plain-text expressions still open.

- `y = a*sin(x)` for a 2D curve.
- `b = 2a`, followed by `y = b*sin(x)`, to share a variable across expressions. Definitions can appear before or after the graphs that use them.
- `y = 3sin + 5` graphs as `y = 3sin(x) + 5`; the expression row shows when `x` was inferred.
- `x = 2` for a vertical 2D line.
- `z = sin(sqrt(x^2 + y^2))` for an explicit 3D surface.
- `x = 2a*cos(t), y = 2a*sin(t), z = t/2` for a 3D helix, with t from 0 to 4π.
- `r = 2*sin(3*theta)` for a polar rose, with θ from 0 to 2π radians.
- `x = 3*cos(t), y = 3*sin(t)` for a parametric circle, with t from 0 to 2π.
- `x^2 + y^2 = 9` for an implicit circle.
- `x^2 + y^2 <= 9` for a shaded disk; strict inequalities use a dashed boundary.
- `y = x^2 {x >= 0}` to restrict a function's domain.
- `y = {x < 0: -x, x >= 0: x^2}` for a piecewise function.
- `x = (2 + cos(v))*cos(u), y = (2 + cos(v))*sin(u), z = sin(v)` for a parametric torus, with u and v from 0 to 2π.
- `x^2 + y^2 + z^2 = 9` for an implicit sphere; the 3D mesh is sampled within ±6 on each axis.
- Supported functions include trigonometry, roots, logarithms, absolute value, rounding, minimum, and maximum.

Drag the 2D graph to pan, or the 3D graph to rotate. Scroll to zoom. Move the `a` slider to update any expression that uses it. Projects autosave in the current browser or app installation; **Save project** downloads a portable JSON copy, and **Open** imports one.

Use the toolbar buttons or `⌘Z` / `⌘⇧Z` on macOS to undo and redo. On Windows and Linux, use `Ctrl+Z` / `Ctrl+Shift+Z` or `Ctrl+Y`. Consecutive typing and slider changes are grouped into undo steps. History lasts for the current app session; export a project file to keep a durable copy.

On the 2D graph, click near a `y =` function to trace its coordinates and estimated slope. Select **ƒ′** to mark approximate roots, minima, maxima, and intersections of visible `y =` functions. The analysis is numerical, limited to the current view, and may miss features closer together than its sampling resolution.

The 2D zoom now extends well beyond ±30 on both axes. Use the crosshair button to reset a graph that has been panned away from its origin.

The **Maths tools** tab accepts expressions in mathematical notation and can use valid workspace variables. Symbolic commands cover a supported subset; higher-degree and non-polynomial root search is numerical over a chosen interval. Matrix operations accept rectangular arrays where applicable; statistics accepts comma-separated numbers; regression accepts `x,y` pairs separated by semicolons. Numerical integration uses a fixed 512-interval Simpson approximation, unsupported symbolic limit forms fall back to nearby numerical samples, and the ODE tool uses a 500-step fourth-order Runge–Kutta estimate. Tool results are temporary and are not saved in the project; notebook calculation cells save their inputs and recompute on reopen.

## Scope of this version

This version does not yet offer a general-purpose symbolic CAS, arbitrary geometry constructions, general surface intersections and nets, programmable activity scripts, cloud sync, classroom collaboration, a resource library, or mobile/AR apps. Shared scalar definitions currently use single lowercase letters, and `x`, `y`, `z`, `r`, and `t` retain graphing roles. Implicit curves and surfaces are sampled, so small or distant features may be missed. Graph analysis primarily covers explicit 2D functions. Local autosave uses device storage; export a project file for a durable backup.

## Verify

```sh
npm test
npm run build
```

### Notebook activity authoring

In **Notebook**, choose **Explore a quadratic** or **Build a data model** to append an activity to your current project. Each insertion is one undoable edit. You can edit the prompts, change linked equations, create a new equation from a graph cell, and apply a saved preview window. Previews support explicit functions, vertical lines, polar curves and parametric curves; polar/parametric sampling uses 0–2π. Sampling may miss small features. Other graph kinds display guidance to use the dedicated graph workspace.

Table cells link to a saved sheet. Enable **Edit linked cells** to enter raw values or formulas, then disable editing to read evaluated values. All eight spreadsheet columns are available, with a saved visible range of 1–18 rows. Formula errors are shown per cell. Editing a non-active sheet preserves which sheet supplies cell-address values to graphs. Notebook links, graph windows, table ranges and starter content survive autosave and project-file export/reopen.

### Welch two-sample inference

In **Spreadsheet & Stats**, select **Welch two-sample test / interval**, choose two different sample columns, and enter the null mean difference, alternative and confidence level. Rows 2–18 supply finite numeric observations independently from each column; blanks and non-numeric cells are omitted. Results show sample summaries, mean difference, standard error, fractional degrees of freedom, p-value and a two-sided confidence interval. The interval remains two-sided even when the test alternative is one-sided.

The selected procedure and Welch inputs save with the project; click **Calculate** after reopening to recompute results. Changes to the data or inputs hide stale results. These procedures assume independent samples and approximately normal populations for small samples. They do not handle paired observations, check normality or identify outliers. Both constant samples are rejected. Formulas follow [NIST’s two-sample test](https://www.itl.nist.gov/div898/handbook/eda/section3/eda353.htm) and [mean-difference confidence limits](https://itl.nist.gov/div898/software/dataplot/refman1/auxillar/diffmean.htm). Student-t critical values use a bounded expanding numerical search; unsupported extreme quantiles report an error instead of being capped at ±64.
