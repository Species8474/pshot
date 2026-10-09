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
  - Warp styles (Warp options bar): None, Custom, Arc ... Twist with orientation, Bend, H / V distortion; each style's displacement is sampled at thirds of the bounds and fitted to the 4x4 Bezier patch (interpolating), so the shapes are close to CS6 but not exact. Dragging a handle switches to Custom. Styles work in same-unit coordinates (X across the width, Y in the same unit), so wide text bends like CS6 rather than shearing.
  - Puppet Warp (Edit > Puppet Warp, `ps/puppet-warp.js`): triangle mesh over the layer's pixels (Density, Expansion, Show Mesh), click to add pins, drag to warp, Alt+click or Delete removes a pin, Remove all pins; moving least squares per mesh vertex (Rigid / Normal = similarity / Distort = affine); live preview per triangle, exact barycentric resampling on commit; Enter/Esc. Pin Depth and Rotate are greyed.
  - Note Tool (I, `ps_measure` mode `note`, `ps/notes.js`) and Notes panel (Window > Notes): click adds a note (author and color from the options bar), drag moves, the panel edits the text with prev/next/delete; View > Show > Notes; Clear All. `config.ps_notes` per document, History steps for add/move/delete, saved to and loaded from PSD annotations.
  - Rotate View Tool (R, `tools/ps_rotate_view.js`): drag rotates the document window (Shift: 15 degree steps) with the CS6 compass; options bar Rotation Angle and Reset View; Esc resets. The canvas wrapper is CSS-rotated and `Base_layers.get_world_coords` un-rotates, so every tool maps the mouse correctly. Stored per document (view state). The rotated document is clipped to the window area.
  - Shadows/Highlights: CS6 Show More Options (Shadows / Highlights Amount, Tone Width, Radius; Color Correction, Midtone Contrast, Black Clip, White Clip).
  - Blur Gallery (Filter > Blur > Field Blur / Iris Blur / Tilt-Shift, `ps/blur-gallery.js`): modal workspace with preview, pins (click to add, drag, Delete removes), iris ellipse/feather/rotation handles, tilt-shift solid/dashed lines and rotation dots, Blur Tools panel (enable per blur, Blur px), P toggles preview. Rendered by mixing 6 blur levels per pixel from the blur map; selection-restricted; one History step. Distortion, Blur Effects (bokeh), Selection Bleed/Focus/Save Mask/High Quality are greyed.
  - Keyboard Shortcuts (Alt+Shift+Ctrl+K, `ps/shortcuts.js`): Application Menus tree and Tools list; click a shortcut to record a combo, CS6 conflict warning (Accept removes it from the other command), Ctrl/F-key validation, Use Default, Delete Shortcut. Changes live in localStorage `pshot_shortcuts_v1`, are applied to the menu definitions and rebuild the keymap (`Keymap.build_map()`). Sets, the Menus tab, Panel Menus and Summarize are greyed.
  - Disabled buttons are shown greyed everywhere (miniPaint's reset.css hid them).
  - Preferences (Ctrl+K and Edit > Preferences > each pane, `ps/preferences.js`): CS6 pane list with Prev/Next; live settings: interface Color Theme (all four CS6 brightness themes; cs6.css colors are `--ps-*` variables, set per theme in `THEMES`), History States (default 20 like CS6), transparency Grid Size and Grid Colors (CSS checkerboard), ruler units, Gridline Every. Other controls are shown with CS6 defaults, greyed. Stored in localStorage `pshot_prefs_v1`.
  - Art History Brush (`retouch` mode `art_history`): stylized strokes (the 10 CS6 styles) in the History Brush source's colors, following edges, within Area; Tolerance limits painting to areas that differ from the source.
  - Calculations (Image > Calculations, `ps/calculations.js`): two sources (Merged or a layer; Red/Green/Blue/Gray/Transparency/Selection/alpha channels; Invert), 20 blend modes, Opacity, result to New Channel / New Document (Grayscale) / Selection, with a preview thumbnail. Source is the active document only; Mask is greyed.
  - Warp Text (Type > Warp Text, Type options bar button, `ps/warp-text.js`): `layer.ps_warp` on the text layer, which stays editable; it is rendered through the warp patch (exact resampling, cached per layer state) and saved to and loaded from PSD (`text.warp`).
  - Color Lookup (dialog and adjustment layer): built-in looks with the CS6 3DLUT names, Load 3D LUT... reads .CUBE files (trilinear lookup; stored in the layer state), Dither.
  - HDR Toning: flattens first (confirm), Local Adaptation (Edge Glow radius/strength, Gamma, Exposure, Detail, Shadow, Highlight, Vibrance, Saturation), Equalize Histogram, Exposure and Gamma, Highlight Compression, presets.
  - Match Color: Reinhard-style transfer of the YCbCr mean and spread from another open document (its merged image is cached as `flat` on the document entry when switching away) or the active document's merged image; Luminance, Color Intensity, Fade, Neutralize.
  - Variations (Image > Adjustments): CS6 thumbnail ring (Original / Current Pick, More Green..More Magenta, Lighter / Darker), Shadows / Midtones / Highlights / Saturation, Fine..Coarse step, Show Clipping (neon) in the thumbnails.
  - Content-Aware Scale (Alt+Shift+Ctrl+C, `ps/seam-carve.js`): Free Transform box, applied by seam carving (removing or duplicating the lowest-energy seams) on commit. There is no Protect alpha / Protect Skin Tones, and the preview while dragging is a plain scale.
  - Actions panel (Alt+F9, `ps/actions-panel.js`): sets, record/stop/play, new/delete; records menu commands and shortcuts (hook in `ps/commands.remember_filter`); filters replay with their recorded settings, other dialogs open during playback; stored in localStorage; Default Actions set.
  - Histogram panel (Window > Histogram: channel, source, Mean/Std Dev/Median/Pixels).
  - Workspaces (Window > Workspace and the switcher): Essentials, Painting, Photography, Typography.
  - Layer Comps panel (Window > Layer Comps, `ps/layer-comps.js`): new/apply/update/delete, previous/next; records visibility, position, layer style per layer; per document.
  - History panel: snapshots (full layer copies; click to restore as a History step) and Create New Document from Current State.
- **Documents**
  - Tabs.
  - File > New (CS6 dialog).
  - Open and Place for PSD and images. PSD keeps layers, groups, masks, effects, adjustment layers, blend modes, opacity and fill. Type layers are written and read as real PSD text (font, size, faux bold/italic, underline, strikethrough, tracking, color, alignment, orientation; style runs per span), so they stay editable in both pshot and Photoshop (`invalidateTextLayers` makes Photoshop re-render them).
  - Save, Save As (CS6 format list; JPEG Options with 0-12 quality and size estimate; PNG Options) and Save for Web (CS6 dialog, `ps/save-for-web.js`: Original/Optimized/2-Up with encoded size, presets, JPEG quality, matte, PNG-24 transparency, image size; GIF/PNG-8 greyed).
- **Painting**
  - Brush, pencil and gradient paint into the active layer, with Opacity and Mode. Brush panel (F5, `ps/brush-panel.js`): Size, Angle, Roundness, Hardness, Spacing, Size Jitter, Scatter, Opacity Jitter, Flow; non-default tips switch the brush to a dab engine (`brush.js render_dabs`).
  - Eraser, bucket, clone (Alt+click sets the source), blur, sharpen, sponge, dodge, burn and smudge.
  - Retouching: Spot Healing Brush, Healing Brush (Alt+click source), Patch, Content-Aware Move and Red Eye (`tools/retouch.js`, `tools/ps_patch.js`, `ps/inpaint.js`).
  - All of them respect the selection, layer locks and mask targeting.
  - Patterns (`ps/patterns.js`): Edit > Define Pattern, Edit > Fill > Pattern, Pattern Stamp Tool (S), Pattern Overlay style, Pattern fill layers. Six built-in patterns; shared by all documents.
  - Background Eraser (E): sampling, limits, tolerance, Protect Foreground Color; erasing the Background turns it into Layer 0.
  - Color Replacement Tool (B): Hue/Saturation/Color/Luminosity, Continuous/Once/Background Swatch sampling, Contiguous/Discontiguous, Tolerance.
  - History Brush (Y): paints back the document's opening snapshot, which is captured just before the first edit (`Documents.before_action`, hooked in `base-state.js`).
  - Quick Mask (Q): painting edits the selection, shown as a red overlay.
- **Measuring** (`tools/ps_measure.js`): Ruler (X/Y/W/H/A/L1 in the options bar, Shift constrains, Straighten Layer), Color Sampler (up to 4, Info panel readouts, Alt+click deletes, sample size), Count tool. Markers are not History states.
- **Shape tool modes** (`ps/shape-modes.js`): Shape (miniPaint vector layer), Path (adds the rectangle/rounded rectangle/ellipse/line exactly, polygons traced, to the Work Path), Pixels (paints with the foreground color into the active layer).
- **Paths** (`ps/paths.js`, tools `ps_pen.js`, `ps_path_select.js`)
  - Pen (P): click for corners, drag for smooth points, click the first point to close, Enter/Esc to end; Auto Add/Delete. Add/Delete Anchor Point and Convert Point tools.
  - Path Selection and Direct Selection (A): drag subpaths, anchors and handles (smooth points stay smooth; Alt breaks them); Delete removes an anchor or subpath.
  - Paths panel: Work Path (replaced when a new one is drawn), Save/Rename (double-click), New, Duplicate, Delete; Fill Path, Stroke Path (Brush size/hardness), Load as Selection (Ctrl+Enter; Shift adds, Alt subtracts), Make Work Path from selection.
  - `config.ps_paths` is per document and every change is an undoable `Update_config_action`.
- **Type**: Horizontal and Vertical Type (vertical columns run right to left; miniPaint's vertical layout bugs fixed in `tools/text.js`); Horizontal/Vertical Type Mask tools type over a 50% red overlay and turn the text into a selection when editing ends (History shows only "Type Mask"). Character and Paragraph panels.
- **Selections**
  - Rect, Ellipse, Row and Column marquees (Space while dragging moves the marquee); Lasso, Polygonal Lasso, Magnetic Lasso (snaps to the strongest edge within Width; Contrast threshold; Frequency sets anchor spacing; Backspace removes back to the last anchor); Quick Selection; Magic Wand.
  - Quick Mask mode.
  - Color Range (Sampled Colors with Fuzziness, color families, Highlights/Midtones/Shadows; click the preview to sample), Grow, Similar, Modify > Smooth, Transform Selection (all Free Transform modes), Save/Load Selection with alpha channels in the Channels panel (`ps/alpha-channels.js`; Ctrl+click a channel thumbnail loads it).
  - Select > All Layers / Deselect Layers / Similar Layers.
  - Add, subtract and intersect; Inverse, Feather, Expand, Contract, Border; Reselect.
  - Move the selected pixels (Alt copies).
  - Edit > Fill: Foreground/Background/Color…/Content-Aware (diffusion inpainting)/Pattern/History/Black/50% Gray/White.
  - Refine Edge (Alt+Ctrl+R): Smooth, Feather, Contrast, Shift Edge, view modes, output to Selection / Layer Mask / New Layer / New Layer with Layer Mask.
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
  - New Layer dialog (Shift+Ctrl+N: name, clipping, color label, mode, opacity), Layer Properties (panel menu), color labels in the eye column, Duplicate Layer dialog (name, destination document). Duplicate layers are named "X copy"; Layer via Copy/Cut.
  - Multiple layer selection (`ps/multi-select.js`): Ctrl+click and Shift+click in the Layers panel. Move, Group (Ctrl+G), Delete, Merge Layers (Ctrl+E), Align and Distribute act on all selected layers. The set is valid only while it contains `config.layer`.
  - Smart Objects (`ps_smart`: original pixels + box/quad): Convert to Smart Object, New Smart Object via Copy, Edit Contents (opens a .psb tab; Ctrl+S there updates the smart object in its parent), Replace Contents, Export Contents, Rasterize; Free Transform (incl. distort/perspective) resamples from the original each time; painting asks to rasterize; thumbnail badge.
  - Link Layers (chain button / Layer menu, label toggles to Unlink): linked layers move together; Select Linked Layers. (`ps_link` token; not saved to PSD.)
  - As in CS6, selecting a layer and toggling visibility are not History states (`base-state.js`).
- **Image**
  - Levels, Curves, Hue/Saturation, Brightness/Contrast, Exposure, Vibrance, Color Balance, Photo Filter, Channel Mixer, Gradient Map, Selective Color, Black & White (6 sliders + Tint), Replace Color (sample + Fuzziness, Hue/Saturation/Lightness), Threshold (histogram), Posterize, Shadows/Highlights, Equalize, Invert and Desaturate (one step) (destructive here, as in CS6); Auto Tone / Auto Contrast / Auto Color (distinct CS6 algorithms).
  - Image > Mode: RGB Color / Grayscale ("Discard color information?"; all layers to luminosity, colors kept gray, Gray channel, tab shows Gray/8; undoable). Other modes are greyed.
  - Image and Canvas Size, rotation (incl. Arbitrary: canvas grows, Background fills with the background color, masks rotate), Trim (transparent / corner color, per side), crop, Perspective Crop tool (`tools/ps_pcrop.js`: every layer and mask rectified; type/shape layers are rasterized), trim, Reveal All, Duplicate (new tab, optionally merged), Apply Image (layer or merged source, invert, blend mode, opacity; RGB channel only). File > Revert (back to the opened state, undoable).
- **Filters**: Liquify (Shift+Ctrl+X: Forward Warp, Reconstruct, Pucker, Bloat, Push Left; size/density/pressure; Restore All; Show Backdrop; `ps/liquify.js`), Gaussian Blur, Motion Blur, Average, Unsharp Mask, Smart Sharpen, Add Noise, Median, Dust & Scratches, High Pass, Minimum, Maximum, Offset, Twirl, Pinch, Spherize, Polar Coordinates, Ripple, Clouds, Difference Clouds, Diffuse, Surface Blur, Smart Blur, Sharpen Edges, Wave, ZigZag, Shear, Crystallize, Pointillize, Facet, Fragment, Mezzotint, Fibers, Lens Flare, Tiles, Trace Contour, Wind, Extrude, Custom. Also Blur, Blur More, Sharpen, Sharpen More, Despeckle, Find Edges, Solarize (one-step), Box Blur, Radial Blur, Reduce Noise, Mosaic, Emboss, Color Halftone, Oil Paint. Filter Gallery still uses miniPaint's effects browser; Tilt-Shift is the Blur Gallery.
- **Other**
  - Free Transform (Ctrl+T works in the full screen modes; otherwise use the menu, since Chrome reserves the key). On pixel layers Ctrl-drag a handle = Distort, Ctrl+Shift = Skew, Ctrl+Alt+Shift = Perspective; Edit > Transform > Skew/Distort/Perspective/Warp/Again. The options bar switches to the CS6 transform bar while transforming (X, Y, W %, H % with link, angle, Warp toggle, Cancel, Commit; Enter in a field applies it). Warp is a 4x4 Bezier patch (drag points/handles or the surface), previewed as a mesh and committed by Newton-inverting the patch per pixel. The quad is previewed as a triangle mesh and committed with an exact inverse-homography resample.
  - Guides from the rulers. Pixel Grid at 500%+ (View > Show > Pixel Grid).
  - Type > Create Work Path (traces the glyphs).
  - Move tool: Alt+drag duplicates the layer and moves the copy; arrows nudge 1 px (Shift 10 px) — the selected pixels when there is a selection; selection tools nudge the outline.
  - Temporary tools: Alt with Brush/Pencil/Bucket/Gradient/shapes samples the foreground color (all layers); Ctrl+drag with painting/selection tools moves with the Move tool and returns.
  - Hand, Zoom and Space-to-pan.
  - CS6 zoom steps.
  - Ctrl+Z toggles a single undo; Alt+Ctrl+Z and Shift+Ctrl+Z step through History.
  - Layers panel: Ctrl+click a layer/mask thumbnail loads it as a selection (Shift add, Alt subtract, Shift+Alt intersect); Alt+click an eye shows only that layer (again to restore). Hidden shortcuts: Shift+Ctrl+Alt+E Stamp Visible, Shift+Ctrl+Alt+N new layer, Alt+[ / Alt+] select layer below/above, Alt/Ctrl+Backspace fill FG/BG.
  - Number keys set brush opacity; [ and ] change brush size; Shift+[ and Shift+] change hardness (brush picker has Size and Hardness).

## Known gaps / next
- Tools: Mixer Brush.
- Filters: Filter Gallery (still miniPaint), Adaptive Wide Angle, Lens Correction, Vanishing Point, Lens Blur, Shape Blur, Displace, Lighting Effects.
- Mixer Brush, Actions: batch/droplets and recording of tool strokes, setting the History Brush source to a later state, Freeform Pen, Slice tools, 3D. Real shape layers with vector paths / vector masks (shape tools' Shape mode uses miniPaint vector layers; Pen 'Shape' and 'Mask' buttons are greyed). Paths are not saved in PSD yet. Make Work Path traces corner points only (no curve fitting).
- Adjustments: Color Lookup's built-in looks are procedural approximations named like the CS6 presets (Adobe's LUT files are not redistributable); Abstract / Device Link profiles are greyed. HDR Toning has no Toning Curve (presets are approximations). Match Color has no selection-based statistics or Save/Load Statistics.
- Styles: Contour, Texture; Pattern Overlay is not written to PSD; bevel techniques other than Smooth (Pillow and Stroke Emboss render as Emboss). Vector masks. Smart filters, and PSD placed layers (smart objects save as pixels).
- Brush panel sections other than Tip Shape / Shape Dynamics (size jitter) / Scattering / Transfer; Brush Presets.
- Chrome reserves Ctrl+N, Ctrl+W and Ctrl+T in a normal window, so those commands work from the menus there. The full screen modes (F) also take the browser full screen and call the Keyboard Lock API, so the shortcuts reach pshot (not verifiable in headless tests).

## Testing
- Test layers built in page code must have an `Image` as `link` (Update_layer_image_action reads `link.src`); a canvas `link` makes every later adjustment silently do nothing.
- Menu sweep: dump the `config-menu.js` targets to `public/targets.json`, then in Playwright stub file inputs, confirm/alert/prompt and anchor clicks with addInitScript and call every target (320 targets, 318 run after skipping print/fullscreen; 0 errors on 2026-10-09).
- Menu sweep: run every enabled menu target via `pshot.GUI.modules[...]` and dismiss its dialog (close popouts with `Ps_workspace.close_popout()`, never by removing them: they hold panel hosts). 303 targets, 0 errors at last run.
- Feature checks run through the Playwright MCP browser. Screenshots are in `docs/screens/`.
