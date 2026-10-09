# pshot — HANDOFF

## What this is
pshot is a Photopea-style image editor. It's a fork of [miniPaint](https://github.com/viliusle/miniPaint) (MIT, vanilla JS, webpack).
`Species8474/pshot` began as a fork of `photopea/photopea`. That repo has no source because Photopea is closed-source, so on 2026-10-09 the project was rebased onto miniPaint instead.

## Hard rules
- **pshot must be an identical clone of Photoshop CS6**: UI placement, features and functionality. CS6 itself is the spec, not Photopea, and no Photopea comparison is needed. Josh is a Photoshop expert, so any drift in layout, naming, tool order, shortcuts or behaviour is a defect.
- Unbuilt CS6 menu items, tools and panels still appear in their exact CS6 position, **greyed out**, until they are implemented.
- **Desktop only. Mobile is not a goal**, which overrides the global responsive-by-default rule.
- Keep miniPaint's `MIT-LICENSE.txt` and attribution.

## Repo
- `origin` = `Species8474/pshot`, working branch **`main`**. The old README-only `master` is left untouched.
- `upstream` = `viliusle/miniPaint`. Pull upstream changes with `git fetch upstream && git merge upstream/master`.

## Build & hosting (js1)
- `./publish.sh` runs `npm run build` (output in `dist/bundle.js`), then rsyncs `index.html`, `dist/` and `images/` into `public/`, which is gitignored.
- `sudo tailscale serve --bg --https=8830 ~/projects/pshot/public` serves https://js1.swallow-census.ts.net:8830/. It's tailnet-only, has no daemon, and changes go live immediately.
- Only `public/` is served, so `src/` and `.git` are not exposed.
- There's a Portal tile, and js1 inventory entries in `~/js1-system.md` §2/§5/§6/§11.
- Rollback: `sudo tailscale serve --https=8830 off`.

## State / next
- 2026-10-09: a stock miniPaint 4.14.3 build is live and the smoke test passed (no console errors).
- Next: reskin miniPaint to be identical to Photoshop CS6: menus, toolbox, options bar, panel dock and shortcuts. The page title still reads "miniPaint".

## Progress log (autonomous run, 2026-10-09)
Phase 1 (CS6 workspace) is built:
- `index.html` is the CS6 frame: menu bar, options bar, Tools panel, document tab, status bar, icon strip, panel dock, Mini Bridge/Timeline tabs.
- `src/css/cs6.css` is the theme. Menu dropdowns are light Windows-native style, as CS6 draws them on Windows.
- `src/js/config-menu.js` holds the full CS6 menu tree in a compact notation. Items with no target render greyed out.
- `src/js/ps/`:
  - `tools-def.js`: CS6 toolbox groups and the custom SVG icons
  - `workspace.js`: the dock, popouts, History, Color, Swatches, Adjustments and Channels panels, the status bar and screen modes
  - `keymap.js`: the CS6 shortcuts, plus a capture listener that blocks miniPaint's old single-letter keys
  - `popup-menu.js`
  - `adjustments-def.js`
  - `stroke.js`: brush and pencil strokes are rasterized into the active pixel layer, as in CS6
- `src/js/modules/ps/commands.js` implements the CS6 commands miniPaint lacked.
- `src/js/core/gui/gui-layers.js` was rewritten as the CS6 Layers panel.
- New tools: `tools/hand.js` and `tools/zoom.js`.
- New documents get a white "Background" layer; new layers are named "Layer N".
- **Options bar**: `ps/options-bar.js` has a CS6 layout per tool. Controls bound to miniPaint attributes work; the rest are greyed out. Tools without a layout fall back to miniPaint's renderer.
- **PSD**: `ps/document.js` uses ag-psd 31.0.2, pinned. Open, Place, Save and Save As handle .psd, keeping layer names, positions, opacity, visibility, blend modes and clipping. Vector, text and filtered layers are rasterized on save. Groups are flattened on open.
- **Document tabs**: `ps/documents.js` stores each tab's miniPaint global state (layers, size, history, view, selection) and swaps it in and out. New and Open create tabs, × or Ctrl+W closes one, and the Window menu lists open documents.
- **CS6 behaviours added**:
  - Gradients paint into the active layer.
  - Empty layers become pixel layers when a pixel tool touches them.
  - "Rasterize the type?" prompt.
  - Hidden-layer alert.
  - Type layers are named after their text.
  - Esc and Ctrl+Enter commit text.
  - Layer bounds show only with the Move tool.
- **Testing**: `window.pshot` exposes the app. The menu sweep (every enabled target) runs with no errors.

### Known gaps (next)
- Lasso, Magic Wand and Quick Selection; elliptical marquee; add/subtract selection modes.
- Layer groups, masks, adjustment layers, layer styles beyond Drop Shadow.
- Real Levels and Curves dialogs.
- Brush hardness, opacity and flow (the controls exist but are greyed out).
- Free Transform handles for pixel layers.
- Chrome reserves Ctrl+N, Ctrl+W and Ctrl+T, so use the menus for New, Close and Free Transform.
