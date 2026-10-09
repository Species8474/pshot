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

- **Selections**: `ps/selection.js` keeps one document-sized mask per document and records changes in History. The `tools/ps_select.js` tool covers Rect, Ellipse, Row and Column marquees, Lasso, Polygonal Lasso and Magic Wand.
  - Shift adds, Alt subtracts, Shift+Alt intersects; the options-bar mode buttons do the same.
  - Marching ants are drawn on a separate overlay canvas.
  - Fill, Clear/Delete, Copy, Copy Merged, Cut, Layer via Copy/Cut and Crop respect the mask, and so do brush, pencil and gradient strokes.
  - Select menu: All, Deselect, Reselect, Inverse; Modify > Border, Expand, Contract, Feather.

- **Layer masks** (`ps/mask.js`): the Add Mask button (Alt hides), the Layer > Layer Mask menu, the mask thumbnail and editing target, Shift+click to disable, and Apply all work.
  - Brush, pencil, gradient and fill paint the mask in grayscale.
  - Masks are rendered in `render_object` and survive PSD open and save.
- **More CS6 behaviour**:
  - Levels, Curves, Hue/Saturation and Brightness/Contrast dialogs (`ps/adjust.js`) preview live, respect the selection and create one History state each.
  - With a selection, the Move tool moves the selected pixels; Alt+drag moves a copy.
  - Pixel tools only change pixels inside the selection.
  - The eraser on the Background layer paints the background colour.
  - Brush, pencil and gradient have working Opacity and Mode.
- **Robustness**: the render loop survives exceptions, and the zoomView scale is resynced to `config.ZOOM` (it used to stay clamped after the canvas shrank).

- **Layer groups** (`ps/groups.js`):
  - Groups are `ps_group` header layers; members carry `ps_parent`, and `normalize()` keeps the stack in panel order.
  - Ctrl+G groups, Shift+Ctrl+G ungroups, New Group works, and deleting a group deletes its contents.
  - The panel shows disclosure triangles and indented members; drag-and-drop moves layers into and out of groups.
  - A group's visibility and opacity apply to its members. PSD groups (nested, hidden, collapsed) survive open and save.
- **CS6 insertion**: new layers go directly above the active layer (inside its group), not at the top of the stack.
- **Other CS6 behaviour**:
  - File > New is a CS6 dialog (`ps/new-dialog.js`).
  - Free Transform (`ps/transform.js`).
  - Paste centres on the canvas; Paste in Place keeps the original position.
  - Duplicates are named "X copy".
  - Crop commits with Enter.
- **Startup**: the first document always has a white Background (miniPaint's transparency cookie is ignored).

- **Layer styles** (`ps/styles.js`):
  - The CS6 Layer Style dialog (list plus settings) covers Drop Shadow, Inner Shadow, Outer Glow, Inner Glow, Stroke, Color Overlay, Gradient Overlay and Blending Options (blend, opacity, Fill Opacity).
  - Effects are drawn at render time from the layer's alpha. They show in the panel's Effects list, and double-clicking a layer opens the dialog.
  - Copy, Paste and Clear Layer Style work, and effects survive PSD open and save.

### Known gaps (next)
- Quick Selection and Magnetic Lasso. The bucket, eraser, blur and clone tools don't respect the selection yet.
- Adjustment layers; Bevel & Emboss, Satin and Pattern Overlay styles; vector masks.
- Real Levels and Curves dialogs.
- Brush hardness, opacity and flow (the controls exist but are greyed out).
- Free Transform handles for pixel layers.
- Chrome reserves Ctrl+N, Ctrl+W and Ctrl+T, so use the menus for New, Close and Free Transform.
