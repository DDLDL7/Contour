# Contour

Contour is an offline-capable graphing calculator for students, built for the web and macOS. It combines live mathematical notation, interactive 2D and 3D graphs, a parameter slider, and local project saving in one workspace. This is an early version; the broader product roadmap is in [GRAPHING_CALCULATOR_PLAN.md](GRAPHING_CALCULATOR_PLAN.md).

## What works today

- Plot explicit 2D functions, vertical lines, polar and parametric curves, implicit equations, and shaded inequalities.
- Explore explicit 3D surfaces and parametric space curves with rotation and zoom controls.
- Trace 2D functions and inspect approximate roots, turning points, intersections, and tangent slopes in the visible view.
- Edit expressions in mathematical notation, and vary the parameter `a` with a slider.
- Define shared variables such as `b = 2a` and reuse them in 2D or 3D graphs; circular definitions show an error.
- Undo and redo project edits, including equation typing, title changes, slider moves, and adding or removing expressions.
- Save work automatically on the device, export and import project files, and export graph images.
- Use the packaged macOS app offline. The production web app caches its assets after an initial visit for later offline use.

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
- Supported functions include trigonometry, roots, logarithms, absolute value, rounding, minimum, and maximum.

Drag the 2D graph to pan, or the 3D graph to rotate. Scroll to zoom. Move the `a` slider to update any expression that uses it. Projects autosave in the current browser or app installation; **Save project** downloads a portable JSON copy, and **Open** imports one.

Use the toolbar buttons or `⌘Z` / `⌘⇧Z` on macOS to undo and redo. On Windows and Linux, use `Ctrl+Z` / `Ctrl+Shift+Z` or `Ctrl+Y`. Consecutive typing and slider changes are grouped into undo steps. History lasts for the current app session; export a project file to keep a durable copy.

On the 2D graph, click near a `y =` function to trace its coordinates and estimated slope. Select **ƒ′** to mark approximate roots, minima, maxima, and intersections of visible `y =` functions. The analysis is numerical, limited to the current view, and may miss features closer together than its sampling resolution.

The 2D zoom now extends well beyond ±30 on both axes. Use the crosshair button to reset a graph that has been panned away from its origin.

## Scope of this version

This version does not yet solve equations symbolically, draw parametric or implicit 3D surfaces, support custom parameter ranges or additional sliders, or sync projects between devices. Shared variables are currently single lowercase letters; `a` remains the built-in slider, and `x`, `y`, `z`, `r`, and `t` retain their graphing roles. Implicit curves and inequality boundaries are sampled over the visible viewport, so features smaller than the sampling grid may be missed. Graph analysis currently covers explicit 2D functions only. Local autosave is stored in browser storage, so export a project file for a durable backup.

## Verify

```sh
npm test
npm run build
```
