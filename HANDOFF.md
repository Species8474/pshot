# pshot — HANDOFF

## What this is
pshot is a **Photoshop CS6 clone** that runs in the browser. It's built on [miniPaint](https://github.com/viliusle/miniPaint) (MIT, vanilla JS, webpack).
`Species8474/pshot` started as a fork of `photopea/photopea`. That repo has no source because Photopea is closed-source, so on 2026-10-09 pshot was rebuilt on miniPaint.

Live (tailnet only): **https://js1.swallow-census.ts.net:8830/**

## Hard rules
- **Photoshop CS6 is the spec**: UI placement, naming, tool order, shortcuts and behaviour. Josh is a Photoshop expert, so any drift is a defect. Photopea is a fallback only when CS6's behaviour is unclear.
- CS6 menu items, tools and panels that aren't built yet still appear in their exact CS6 position, **greyed out**.
- **Desktop only**: mobile is not a goal, which overrides the global responsive rule.
- Keep miniPaint's `MIT-LICENSE.txt` and attribution.

## Repo, build, hosting
- `origin` = `Species8474/pshot`, branch **`main`**; `upstream` = `viliusle/miniPaint`.
- `./publish.sh` builds (`npm run build` → `dist/bundle.js`) and rsyncs `index.html`, `dist/` and `images/` into `public/`, which is gitignored.
- `sudo tailscale serve --bg --https=8830 ~/projects/pshot/public` serves `public/` directly, with no daemon.
  - Changes go live as soon as `publish.sh` finishes.
  - Rollback: `sudo tailscale serve --https=8830 off`.
- There's a Portal tile, and inventory entries in `~/js1-system.md`.
- Dependency added: `ag-psd@31.0.2`, pinned exactly, for PSD read/write.
- Debug build: `npm run dev` (unminified). `window.pshot` exposes the app object for automation.

## Architecture
pshot keeps miniPaint's engine: layers in `config.layers`, actions and undo in `core/base-state.js`, and tools in `src/js/tools`. It replaces the GUI and adds CS6 behaviour.

| Area | Files |
|---|---|
| CS6 frame (menu bar, options bar, toolbox, doc tabs, status bar, icon strip, dock) | `index.html`, `src/css/cs6.css` |
| Menus (compact notation; no target means greyed out) | `src/js/config-menu.js`, renderer `core/gui/gui-menu.js` |
| Toolbox groups, icons and CS6 shortcuts | `src/js/ps/tools-def.js` |
| Workspace: toolbox, dock, popouts, History/Color/Swatches/Adjustments/Channels panels, status bar, screen modes | `src/js/ps/workspace.js` |
| Keyboard: one capture listener that also blocks miniPaint's old single-letter keys | `src/js/ps/keymap.js` |
| Options bar, with a CS6 layout per tool | `src/js/ps/options-bar.js` |
| CS6 commands miniPaint lacked | `src/js/modules/ps/commands.js` (targets `ps/commands.*`) |
| Layers panel (CS6) | `src/js/core/gui/gui-layers.js` |
| Document tabs: swap miniPaint's global state per document | `src/js/ps/documents.js` |
| Open, Place, Save; PSD in and out | `src/js/ps/document.js` |
| File > New dialog | `src/js/ps/new-dialog.js` |
| Selections: mask, marching ants, Select menu | `src/js/ps/selection.js`, tool `src/js/tools/ps_select.js` |
| Move the selected pixels | `src/js/ps/move-selection.js` |
| Free Transform | `src/js/ps/transform.js` |
| Layer masks | `src/js/ps/mask.js` (rendered in `core/base-layers.js` `render_object`) |
| Layer groups | `src/js/ps/groups.js` |
| Layer styles (fx) | `src/js/ps/styles.js` |
| Adjustment dialogs and adjustment layers | `src/js/ps/adjust.js`, `src/js/ps/adjustment-layers.js` |
| CS6 painting model: strokes go into the active pixel layer | `src/js/ps/stroke.js` |
| Pixel-tool guards: rasterize prompt, hidden, group, adjustment and locked layers; empty layer becomes pixels | `src/js/ps/pixel-layer.js` |
| Guides from rulers | `src/js/ps/guides.js` |
| Multiple layer selection | `src/js/ps/multi-select.js` |
| Paths, Pen, Path/Direct Selection | `src/js/ps/paths.js`, `src/js/tools/ps_pen.js`, `src/js/tools/ps_path_select.js` |
| CS6 filters (dialogs with live preview; Ctrl+F repeats) | `src/js/modules/ps/filters.js` (targets `ps/filters.*`) |
| Hand and Zoom tools | `src/js/tools/hand.js`, `src/js/tools/zoom.js` |

Layer properties pshot adds (all changed through `Update_layer_action`, so they're undoable):
- `ps_mask`, `ps_mask_x`, `ps_mask_y`, `ps_mask_disabled`, `ps_mask_editing`
- `ps_parent`, `ps_collapsed` (groups; layer type `ps_group`)
- `ps_styles`, `ps_fill`
- `ps_adjust` (layer type `ps_adjust`)
- `ps_lock`

## What works (CS6 behaviour)
- **Interface**
  - The full CS6 menu bar.
  - The toolbox with flyouts and Shift+letter cycling.
  - Per-tool options bars.
  - The dock: Color, Swatches, Adjustments, Styles, Layers, Channels, Paths. The icon strip holds History and Properties; Navigator and Info open from the Window menu.
  - Character and Paragraph panels (Window menu, Type > Panels): font, style, size, leading, tracking, colour, faux styles, alignment. With a type layer selected but not being edited, changes apply to all its text.
  - Screen modes (F) and Tab to hide panels.
- **Documents**
  - Tabs.
  - File > New (CS6 dialog).
  - Open and Place for PSD and images. PSD keeps layers, groups, masks, effects, adjustment layers, blend modes, opacity and fill.
  - Save, Save As and Save for Web.
- **Painting**
  - Brush, pencil and gradient paint into the active layer, with Opacity and Mode.
  - Eraser, bucket, clone (Alt+click sets the source), blur, sharpen, sponge, dodge, burn and smudge.
  - Retouching: Spot Healing Brush, Healing Brush (Alt+click source), Patch, Content-Aware Move and Red Eye (`tools/retouch.js`, `tools/ps_patch.js`, `ps/inpaint.js`).
  - All of them respect the selection, layer locks and mask targeting.
  - Patterns (`ps/patterns.js`): Edit > Define Pattern, Edit > Fill > Pattern, Pattern Stamp Tool (S), Pattern Overlay style, Pattern fill layers. Six built-in patterns; shared by all documents.
  - Color Replacement Tool (B): Hue/Saturation/Color/Luminosity, Continuous/Once/Background Swatch sampling, Contiguous/Discontiguous, Tolerance.
  - History Brush (Y): paints back the document's opening snapshot, which is captured just before the first edit (`Documents.before_action`, hooked in `base-state.js`).
  - Quick Mask (Q): painting edits the selection, shown as a red overlay.
- **Paths** (`ps/paths.js`, tools `ps_pen.js`, `ps_path_select.js`)
  - Pen (P): click for corners, drag for smooth points, click the first point to close, Enter/Esc to end; Auto Add/Delete. Add/Delete Anchor Point and Convert Point tools.
  - Path Selection and Direct Selection (A): drag subpaths, anchors and handles (smooth points stay smooth; Alt breaks them); Delete removes an anchor or subpath.
  - Paths panel: Work Path (replaced when a new one is drawn), Save/Rename (double-click), New, Duplicate, Delete; Fill Path, Stroke Path (Brush size/hardness), Load as Selection (Ctrl+Enter; Shift adds, Alt subtracts), Make Work Path from selection.
  - `config.ps_paths` is per document and every change is an undoable `Update_config_action`.
- **Type**: Horizontal and Vertical Type (vertical columns run right to left; miniPaint's vertical layout bugs fixed in `tools/text.js`); Horizontal/Vertical Type Mask tools type over a 50% red overlay and turn the text into a selection when editing ends (History shows only "Type Mask"). Character and Paragraph panels.
- **Selections**
  - Rect, Ellipse, Row and Column marquees; Lasso, Polygonal Lasso, Magnetic Lasso (snaps to the strongest edge within Width; Contrast threshold; Frequency sets anchor spacing; Backspace removes back to the last anchor); Quick Selection; Magic Wand.
  - Quick Mask mode.
  - Color Range (Sampled Colors with Fuzziness, color families, Highlights/Midtones/Shadows; click the preview to sample), Grow, Similar, Modify > Smooth, Transform Selection (all Free Transform modes), Save/Load Selection with alpha channels in the Channels panel (`ps/alpha-channels.js`; Ctrl+click a channel thumbnail loads it).
  - Select > All Layers / Deselect Layers / Similar Layers.
  - Add, subtract and intersect; Inverse, Feather, Expand, Contract, Border; Reselect.
  - Move the selected pixels (Alt copies).
  - Fill, Clear, Cut, Copy, Copy Merged, Paste, Paste in Place, Paste Into / Paste Outside (new layer masked by the selection).
  - Edit > Stroke (Inside/Center/Outside; without a selection it outlines the layer's pixels) and Edit > Fade (Shift+Ctrl+F: opacity and mode of the last step).
- **Layers**
  - New layers go above the active layer.
  - Groups (Ctrl+G and Shift+Ctrl+G; drag into and out of groups; the Move tool moves the whole group).
  - Masks, styles (Bevel & Emboss, Stroke Outside/Inside/Center, Inner Shadow, Inner Glow, Satin, Color/Gradient/Pattern Overlay, Outer Glow, Drop Shadow; stacked in CS6 order) and Fill Opacity.
  - Fill layers: Solid Color, Gradient (Linear/Radial/Reflected, angle, scale, reverse), Pattern; a selection becomes the fill layer's mask.
  - Adjustment layers: Brightness/Contrast, Levels, Curves, Exposure, Vibrance, Hue/Saturation, Color Balance, Black & White, Photo Filter, Channel Mixer, Invert, Posterize, Threshold, Gradient Map, Selective Color.
  - Locks; clipping mask; blend modes.
  - Layer Mask > From Transparency; New > Background from Layer; Arrange > Reverse; Matting (Defringe, Remove Black/White Matte); Scripts > Delete All Empty Layers.
  - Duplicate layers are named "X copy"; Layer via Copy/Cut.
  - Multiple layer selection (`ps/multi-select.js`): Ctrl+click and Shift+click in the Layers panel. Move, Group (Ctrl+G), Delete, Merge Layers (Ctrl+E), Align and Distribute act on all selected layers. The set is valid only while it contains `config.layer`.
  - As in CS6, selecting a layer and toggling visibility are not History states (`base-state.js`).
- **Image**
  - Levels, Curves, Hue/Saturation, Brightness/Contrast, Exposure, Vibrance, Color Balance, Photo Filter, Channel Mixer, Gradient Map, Selective Color, Shadows/Highlights and Equalize (destructive here, as in CS6).
  - Image and Canvas Size, rotation, crop, trim, Reveal All, Duplicate (new tab, optionally merged). File > Revert (back to the opened state, undoable).
- **Filters**: Liquify (Shift+Ctrl+X: Forward Warp, Reconstruct, Pucker, Bloat, Push Left; size/density/pressure; Restore All; Show Backdrop; `ps/liquify.js`), Gaussian Blur, Motion Blur, Average, Unsharp Mask, Smart Sharpen, Add Noise, Median, Dust & Scratches, High Pass, Minimum, Maximum, Offset, Twirl, Pinch, Spherize, Polar Coordinates, Ripple, Clouds, Difference Clouds, Diffuse, Surface Blur, Smart Blur, Sharpen Edges, Wave, ZigZag, Shear, Crystallize, Pointillize, Facet, Fragment, Mezzotint, Fibers, Lens Flare, Tiles, Trace Contour, Wind, Extrude, Custom. Some others still use miniPaint effects (Box Blur, Tilt-Shift, Oil Paint, Emboss, Find Edges, Solarize, Mosaic, Color Halftone, Despeckle).
- **Other**
  - Free Transform (Ctrl+T; use the menu, since Chrome reserves the key). On pixel layers Ctrl-drag a handle = Distort, Ctrl+Shift = Skew, Ctrl+Alt+Shift = Perspective; Edit > Transform > Skew/Distort/Perspective/Again. The quad is previewed as a triangle mesh and committed with an exact inverse-homography resample.
  - Guides from the rulers.
  - Hand, Zoom and Space-to-pan.
  - CS6 zoom steps.
  - Ctrl+Z toggles a single undo; Alt+Ctrl+Z and Shift+Ctrl+Z step through History.
  - Number keys set brush opacity; [ and ] change brush size; Shift+[ and Shift+] change hardness (brush picker has Size and Hardness).

## Known gaps / next
- Warp transform. Mixer Brush, Art History Brush, setting the History Brush source to a later state, Freeform Pen, Slice tools, 3D. Shape layers / vector masks (Pen 'Shape' and 'Mask' modes are greyed). Paths are not saved in PSD yet. Make Work Path traces corner points only (no curve fitting).
- Adjustments: Color Lookup, HDR Toning, Variations, Match Color. Shadows/Highlights has only the basic two sliders (no Show More Options).
- Styles: Contour, Texture; Pattern Overlay is not written to PSD; bevel techniques other than Smooth (Pillow and Stroke Emboss render as Emboss). Vector masks. Smart Objects.
- Brush flow and the Brush panel.
- Chrome reserves Ctrl+N, Ctrl+W and Ctrl+T, so those commands only work from the menus.

## Testing
- Menu sweep: run every enabled menu target via `pshot.GUI.modules[...]` and dismiss its dialog (close popouts with `Ps_workspace.close_popout()`, never by removing them: they hold panel hosts). 260 targets, 0 errors at last run.
- Feature checks run through the Playwright MCP browser. Screenshots are in `docs/screens/`.
