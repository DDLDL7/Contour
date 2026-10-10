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
- Add offline notebook notes with inline LaTeX and live variables, calculations, editable linked graph/table cells, graph checkboxes, parameter inputs, and fixed action buttons. Choose from ten guided activity templates in one dropdown without replacing existing work. Author bounded action sequences as one undoable workspace edit.
- Undo and redo project edits, including equation typing, title changes, slider moves, and adding or removing expressions.
- Save work automatically on the device, export and import project files, and export graph images as PNG, JPEG, WebP or SVG snapshots.
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

The **Maths tools** tab offers quick calculations, an offline SymPy engine with explicit domains/assumptions, and an adaptive differential-equation explorer. Exact tools include equation/system/inequality solving, calculus, matrices, worked equation/derivative steps, asymptotes and envelope candidates. See [Offline mathematics](docs/OFFLINE_MATH.md) for inputs, supported operations, numerical limits, statistical assumptions and runtime installation.

## Scope of this version

The offline mathematical feature families are implemented with documented bounds. Sampled graphs and mesh intersections may miss small features; conditional symbolic answers remain conditional. General proof generation, unrestricted construction/programming, online sync, classrooms, resource publishing and mobile/AR apps remain outside this version. Shared scalar definitions use single lowercase letters with reserved graphing variables. Local autosave uses device storage; export a project file for a durable backup.

## Verify

```sh
npm run test:release
npm run build
npm run benchmark
```

Run tests separately from builds so compilation does not compete with the bundled symbolic runtime. [Release testing](docs/RELEASE_TESTING.md) records actual coverage and remaining checks. [Mac distribution](docs/MAC_DISTRIBUTION.md) describes signing/notarisation, and [student testing](docs/STUDENT_TESTING.md) provides task scripts and result sheets.

If a stored project is damaged or from an unsupported version, autosave pauses and the previous valid save loads when available. Use **Export stored data** to keep the original bytes before choosing **Keep this workspace**. Recovery copies remain on the device; exported project files are still the durable backup.

### Notebook activity authoring

In **Notebook**, use the **Activity templates** dropdown to append one of ten guided activities to your current project. The list includes quadratic exploration, data modelling, slope/intercept, trigonometry, limits, derivatives, integration, inequalities, parametric curves and 3D surfaces. Each insertion is one undoable edit. You can edit the prompts, change linked equations, create a new equation from a graph cell, and apply a saved preview window. Previews support explicit functions, vertical lines, polar and parametric curves, implicit contours and shaded inequalities. Polar/parametric sampling uses 0–2π. Supported 3D graphs have an on-demand interactive preview. Sampling may miss small features. Answer-check cells save a prompt, expected expression and response, then run a symbolic equivalence check when requested.

Table cells link to a saved sheet. Enable **Edit linked cells** to enter raw values or formulas, then disable editing to read evaluated values. All eight spreadsheet columns are available, with a saved visible range of 1–18 rows. Formula errors are shown per cell. Editing a non-active sheet preserves which sheet supplies cell-address values to graphs. Notebook links, graph windows, table ranges and starter content survive autosave and project-file export/reopen.

### Welch two-sample inference

In **Spreadsheet & Stats**, select **Welch two-sample test / interval**, choose two different sample columns, and enter the null mean difference, alternative and confidence level. Rows 2–18 supply finite numeric observations independently from each column; blanks and non-numeric cells are omitted. Results show sample summaries, mean difference, standard error, fractional degrees of freedom, p-value and a two-sided confidence interval. The interval remains two-sided even when the test alternative is one-sided.

The selected procedure and Welch inputs save with the project; click **Calculate** after reopening to recompute results. Changes to the data or inputs hide stale results. These procedures assume independent samples and approximately normal populations for small samples. Choose the separate paired-t procedure for matched observations. Welch does not check normality or identify outliers. Both constant samples are rejected. Formulas follow [NIST’s two-sample test](https://www.itl.nist.gov/div898/handbook/eda/section3/eda353.htm) and [mean-difference confidence limits](https://itl.nist.gov/div898/software/dataplot/refman1/auxillar/diffmean.htm). Student-t critical values use a bounded expanding numerical search; unsupported extreme quantiles report an error instead of being capped at ±64.


### Activity sequences and exports

Add an **action sequence** to run up to twenty ordered parameter-setting or graph show/hide steps. Author each step using the controls; imported text is never executed. All targets and parameter ranges are checked before any edit is applied. The sequence runs only when its button is pressed, and one Undo restores the previous workspace.

Open **Export** in the header. Graph workspaces offer PNG, JPEG, WebP and SVG snapshots; JPEG uses white behind transparent pixels. SVG snapshots embed the rendered image. Browser support for WebP varies and unsupported encoding reports an error.

Notebook documents export as standalone HTML or Markdown, or through **Print / PDF**. Expected answers are omitted unless **Include expected answers** is selected. Exported worksheets contain current variable values, tables, calculations and sampled 2D graph previews; they are static, and interactive controls remain in the JSON project file. 3D formulas and a project-viewing note are included. Inline LaTeX is retained as source notation. When printing is unavailable, export HTML and open it in a browser to print or save as PDF.
