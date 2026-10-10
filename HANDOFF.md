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
  - Image > Mode > Indexed Color (flattens first, CS6 dialog with preview: Web / Local Perceptual / Selective / Adaptive palettes, colors, transparency, diffusion dither amount; mode shows as Index; `config.ps_color_table`) and Image > Mode > Color Table (read-only swatches). RGB Color returns to RGB mode. Indexed mode does not yet restrict layers/tools like CS6.
  - Image > Mode > Bitmap (requires Grayscale; flattens; 50% Threshold / Pattern Dither / Diffusion Dither / Halftone Screen with frequency, angle, shape; output resolution) and Image > Mode > Duotone (requires Grayscale; Monotone..Quadtone inks with colors; mode shows in title). RGB Color converts back from any mode.
  - Save for Web GIF and PNG-8 (`ps/indexed.js`): Perceptual / Selective / Adaptive (median cut) and Restrictive (Web) palettes, 2-256 colors, Diffusion dither with amount, 1-bit transparency; own GIF89a (LZW) and PNG-8 (pako deflate, PLTE/tRNS) encoders; GIF/PNG-8 presets. Pattern/Noise dither, Lossy, Interlaced and WBMP are greyed.
  - Mixer Brush (`retouch` mode `mixer`): reservoir paint loaded from the foreground color (or Alt+click the canvas), Load / Clean after each stroke, Wet (picks up canvas paint), Load (how long the paint lasts), Mix (canvas vs reservoir color), Flow, the 13 CS6 presets; current-load swatch in the options bar.
  - Layer Style Contour and Texture (Bevel & Emboss sub-items: contour preset + Range; pattern, scale, depth, invert) and Quality > Contour for Drop Shadow, Inner Shadow, Outer Glow, Inner Glow; 12 CS6 contour presets (Linear, Cone, Cone - Inverted, Cove - Deep/Shallow, Gaussian, Half Round, Ring, Ring - Double, Rolling Slope - Descending, Rounded Steps, Sawtooth 1).
  - Smart Filters (`ps/smart-filters.js`): filters run on a smart object become `ps_smart.filters` (applied to the source before the transform, so Free Transform keeps them); dialog filters, Ctrl+F and Actions all add smart filters; the Layers panel lists Smart Filters under the layer (eye per filter and for all, double-click edits on the result of the filters below, right-click Edit/Delete); Layer > Smart Filter > Disable/Enable, Clear; Filter > Convert for Smart Filters. Adjustments and other destructive edits on smart objects show CS6's 'not directly editable' error.
  - Custom Shape Tool (`ps/custom-shapes.js`): 20 CS6-style shapes (arrows, card suits, stars, talk bubbles, checkmark, cross, plus, envelope, crescent, lightning, registration target, tile) as SVG paths fitted to the dragged box; options bar Shape picker (dropdown, no thumbnails); Shape/Path/Pixels modes; shapes with holes use the even-odd rule. The drag preview is a rectangle.
  - File > Automate > Batch and File > Scripts > Image Processor (`ps/batch.js`): choose files, each is opened as a document, the chosen action plays (prompts auto-confirmed during playback, like CS6), optional Resize to Fit (Image Processor), then saved as JPEG (quality 0-12) / PNG / PSD to the browser's downloads and closed.
  - Smaller commands (`ps/extras.js`): Edit > Define Custom Shape (user shapes in localStorage `pshot_custom_shapes_v1`, listed in the Custom Shape picker), Purge > Undo / Clipboard, File > Automate > Fit Image, Scripts > Flatten All Layer Effects / Flatten All Masks / Load Files into Stack, File > Open as Smart Object, Layer > Lock Layers..., Layer Style > Global Light / Hide-Show All Effects (`config.ps_fx_hidden`) / Scale Effects, View > Show > All / None, Image > Analysis > Ruler Tool / Count Tool.
  - File > Scripts > Export Layers to Files (prefix, visible only, PNG-24 / JPEG, Trim Layers) and Layer Comps to Files (each comp applied and saved as PNG / JPEG / PSD, History restored afterwards).
  - History Brush source: the History panel's left column sets it on the opened state, any History state (captured by stepping through History and back, `Documents.set_brush_source`) or a snapshot; the brush icon marks it. The History Brush and Art History Brush paint from it.
  - Freeform Pen Tool (`ps_pen` mode `freeform`): drag draws a trail that becomes a smooth path (Douglas-Peucker with Curve Fit px, Catmull-Rom handles; ending near the start closes it); Path or Shape mode; Magnetic is greyed.
  - Pen tool Shape mode (options bar): a new path starts a shape layer filled with the foreground color, later anchors add to it; Make: Mask (vector mask from the path) and Make: Shape (shape layer from the path).
  - Layer paths: the active layer's shape path or vector mask is listed first in the Paths panel (`config.ps_path_active = 'layer'`, targeted automatically after drawing a shape); the path tools edit it (`Paths.editable()` marks the copy `_layer_path`, `commit` writes it back to the layer as one History step; Path/Direct Selection drags preview live on the layer).
  - Shape layers (`ps/shape-layers.js`, `type: 'ps_shape'`): Rectangle / Rounded Rectangle / Ellipse / Polygon (Sides) / Line tools in Shape mode make CS6 shape layers (fill color + stroke through a path; named Rectangle 1, Ellipse 1, ...; one History step named after the tool). Free Transform scales/rotates them; Layers panel shows the fill swatch and the vector mask thumbnail; Layer Content Options picks the fill color; Rasterize > Shape works; PSD export/import as real shape layers (vectorFill, vectorStroke, vectorMask).
  - Vector masks (`ps/vector-mask.js`, `layer.ps_vmask`): Layer > Vector Mask > Reveal All / Hide All / Current Path / Delete / Disable-Enable, Layer > Rasterize > Vector Mask (into the pixel mask), Layers panel thumbnail (Shift+click toggles), Add-mask button adds a vector mask when the layer already has a pixel mask (or with Ctrl). Rendered as an antialiased clip in `render_object`; follows the layer when it moves; PSD `vectorMask` round trip (pixels saved unmasked).
  - Brush panel / dab engine: Shape Dynamics (size, angle, roundness jitter, minimum roundness), Scattering (scatter, Both Axes, Count, Count Jitter), Color Dynamics (foreground/background, hue, saturation, brightness jitter, purity; the stroke keeps the background color it was painted with), Transfer, Noise and Wet Edges (in the stamp). Per-dab randomness is deterministic so strokes re-render identically.
  - Pattern Overlay in PSD: written as `patternOverlay` with the used patterns embedded (document `patterns`, stable UUID-shaped ids from the name); patterns found in an opened PSD are added to the pattern list.
  - Paths in PSD (`ps/psd-paths.js`): saved paths (image resources 2000+) and the Work Path (1025) are written into the PSD's Image Resources section after ag-psd builds the file, and read back on open (8.24 fixed-point path records; linked/unlinked knots).
  - Lighting Effects (Filter > Render, `ps/lighting-effects.js`): workspace with preview, Spot/Point/Infinite lights with on-canvas gizmos (drag center, drag the square handle for radius/direction), Properties (color, on, intensity, hotspot, colorize, exposure, gloss, metallic, ambience, texture channel bump map, height), Lights list with visibility, Delete removes a light; Lambert + Phong shading; Presets greyed.
  - Lens Blur (depth map from Transparency / Layer Mask / alpha channel, focal distance, invert, radius, specular highlights, noise; iris shape is listed but the blur is round), Shape Blur (Circle, Ring, Square, Diamond, Star, Heart, Cross kernels; ~3 s at 1024x768 r20), Displace (asks for a map image like CS6; red = horizontal, green = vertical, Stretch/Tile, Wrap/Repeat).
  - Lens Correction (Shift+Ctrl+R, `ps/filters.lens_correction`): the CS6 Custom tab controls (Remove Distortion, Red/Cyan and Blue/Yellow fringe, Vignette amount/midpoint, Vertical/Horizontal Perspective, Angle, Scale, Edge) in a standard filter dialog with on-canvas preview; no Auto Correction profiles or grid.
  - Filter Gallery (`ps/filter-gallery.js`, effects in `ps/filter-gallery-effects.js`): preview, the six CS6 folders with live thumbnails of the layer, filter dropdown, settings, effect layer stack (new/delete/visibility, applied bottom to top), last stack remembered; all 47 CS6 gallery filters as approximations of the CS6 look with the CS6 controls (Sketch filters use the foreground/background colors). One History step named after the top filter.
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
  - Type > Anti-Alias and the Type options bar method (`ps/text-aa.js`): `layer.ps_aa` (None thresholds alpha, Crisp sharpens edge alpha, Strong thickens it, Smooth softens it, Sharp is the plain render), undoable, PSD `antiAlias` round trip.
  - Type > Convert to Shape (`ps/commands.type_to_shape`): the text layer becomes a shape layer in place (same id, effects and masks kept) from its traced outline (`Paths.trace_mask`), filled with the text color.
  - Type > Convert to Paragraph Text / Convert to Point Text (dynamic menu label): toggles the text layer's `params.boundary` between `dynamic` and `box`; undoable. Point conversion does not yet insert hard returns at the wrap points like CS6.
  - View > Snap To > Guides / Grid / Layers / Document Bounds / All / None (`config.ps_snap_to`, checked in the menu); grid snapping works while the grid is shown, guide snapping while guides are shown. Slices is not built.
  - Filter > Video > De-Interlace (odd/even fields, duplication/interpolation) and NTSC Colors (YIQ composite kept in broadcast range).
  - View > Print Size (and the Hand/Zoom options bar button): zoom = 72 / document ppi.
  - Type > Update All Text Layers; Type > Replace All Missing Fonts (fonts the browser lacks, by width detection, become Arial; undoable).
  - Edit > Find and Replace Text (Change All; Search All Layers, Case Sensitive, Whole Word Only; replaces within each style run). No Find Next / Change single yet.
  - Help > System Info (read-only report).
  - View > Show > Layer Edges (blue pixel bounds of the selected layer, overlay) and Target Path (Shift+Ctrl+H hides/shows the active path).
  - Layer > Layer Mask / Vector Mask > Unlink / Link (menu label switches; the chain between thumbnails toggles it): `layer.ps_mask_unlinked` / `ps_vmask.unlinked`; `Update_layer_action` keeps an unlinked mask in place when x/y change. Not saved to PSD yet.
  - Layer > Combine Shapes (Unite / Subtract Front / Unite at Overlap / Subtract at Overlap): selected shape layers merge into the top one; subpaths carry `op` (combine/subtract/intersect/exclude) starting a component, rendered by compositing (`Shapes.components`), saved/loaded as PSD path `operation`.
  - Shape tools options bar > Path operations (Shape mode): New Layer / Combine / Subtract Front / Intersect / Exclude (`ws.shape_op`; the next shape joins the selected shape layer as a component, `Shapes.add_component`), Merge Shape Components (raster-traced outline, `Shapes.merge_components`). Path-mode ops for the Pen/Paths are still greyed.
  - Clone Stamp rebuilt on the retouch dab engine (`mode: 'clone'`, `retouch.clone_dab`): Alt+click source, Aligned, Sample Current Layer / Current & Below / All Layers (paints onto empty layers), Opacity; Window > Clone Source panel (`ps/clone-source.js`, icon strip popout): 5 source slots, Offset X/Y, W/H %, rotation (bilinear sampling when transformed), Show Overlay (opacity, Clipped, Auto Hide, Invert) drawn under the brush. Frame Offset / Lock Frame greyed (no video). The old miniPaint `clone` tool module is no longer used by the toolbox.
  - Image > Analysis > Record Measurements (Shift+Ctrl+M; Selection: area, perimeter of the traced outline, circularity, width, height, mean gray, integrated density; Ruler: length, angle; Count), Set Measurement Scale (Default / Custom), Select Data Points (Default / Custom); Window > Measurement Log docks in the bottom bar (`ps/measure-log.js`, `.ps_app.bottom_open`), select rows, Export CSV, Delete. Image > Analysis > Place Scale Marker: a 'Measurement Scale Marker' group with a shape-layer bar of the logical length and a text label (Bottom/Top, Black/White), one History step.
  - Brush presets (`ps/brush-presets.js`, `ps/brush-tips.js`): CS6-style default set (Soft/Hard Round sizes, Spatter, Chalk, Star, Dune Grass, Grass, Scattered Maple Leaves, Scattered Leaves, Flowing Stars, Fuzzball; sampled tips drawn procedurally) in the options bar Brush Preset picker grid and the Window > Brush Presets panel (size slider, new preset from the current brush, delete user presets; Brush panel's Brush Presets button opens it). Sampled tips go through the brush dab engine (`brush.attributes.tip`). Edit > Define Brush Preset makes a tip from the selection (or image; dark = paint, white trimmed) stored in localStorage. The brush cursor stays a circle for sampled tips.
  - Tool presets (`ps/tool-presets.js`): the options bar Tool Preset picker (left button) and Window > Tool Presets panel; New Tool Preset saves the toolbox member + its options (localStorage), Current Tool Only filter, Delete, Reset All Tools. No CS6 default presets are shipped.
  - View > Proof Setup (Working CMYK, C/M/Y/K plates, CMY plates, Legacy Mac RGB, sRGB, Monitor RGB, Protanopia, Deuteranopia), Proof Colors (Ctrl+Y, title gets '/<setup>') and Gamut Warning (Shift+Ctrl+Y, gray): display only (`ps/proof.js`, applied in `base-layers.render_frame` after the layers). CMYK is an approximation (SWOP-like Lab chroma limits per hue with a cusp lightness), not an ICC conversion; Custom... is greyed.
  - Layer > Layer Style > Create Layer (`Styles.create_layers`): each enabled effect rendered alone (fill 0) into a pixel layer named "<layer>'s <effect>" with the effect's blend mode; drop shadow / outer glow / outer bevel below the layer, overlays / satin / inner effects / inner bevel / stroke above; the style is cleared. Same composite as before (verified max diff 1), one History step. Inner effects are pre-clipped pixels, not clipping layers (pshot clipping is `source-atop`, which can't carry a blend mode).
  - Edit > Auto-Align Layers (`ps/auto-align.js`; Auto / Reposition = translation by a coarse-to-fine SAD search against the bottom selected layer; Perspective / Collage / Cylindrical / Spherical not offered) and Edit > Auto-Blend Layers (Panorama: seams where each layer is farthest from its edge, feathered masks, optional Seamless Tones = mean color gain; Stack Images: per-pixel sharpest layer by local |Laplacian|). Both one History step; blends set layer masks like CS6.
  - File > Automate > Photomerge (`ps/automate.js`; Auto / Reposition: files chained by a full coarse-to-fine offset search, new document sized to the union, optional Blend Images Together = Auto-Blend Panorama with Seamless Tones), Crop and Straighten Photos (border-median background, connected components > 1%, min-area rectangle by angle search, each photo a new straightened document), Contact Sheet II (W/H px, columns, rows, filename captions, flatten or one layer per image; one document per page), Conditional Mode Change (Bitmap/Grayscale/Duotone/Indexed/RGB sources to RGB/Grayscale/Indexed); File > Scripts > Statistics (Mean, Median, Max, Min, Range, Sum, Std Dev, Variance; optional auto-align).
  - File > Automate > PDF Presentation (open documents and/or files; Multi-Page Document or Presentation = full screen with advance time and transition; background, filename caption) and File > Scripts > Layer Comps to PDF; written by the minimal JPEG-per-page writer `ps/pdf.js` (validated with pdfinfo / mutool).
  - File > Automate > Merge to HDR Pro: 8-bit exposure fusion (`ps/hdr.js`, Mertens contrast/saturation/well-exposedness weights blended through Laplacian pyramids); optional alignment on top-10% log-gradient edge bitmaps (exposure independent, ±5% search). 32-bit HDR, tone-mapping controls and Remove Ghosts are not built.
  - File > Import > Video Frames to Layers (`ps/import-export.js`; browser-decodable video, whole clip or a range, every N frames at 30 fps, max 500 layers, new document), File > Import > Notes (a PSD's annotations added to the document's notes, undoable), File > Export > Paths to Illustrator (Document Bounds / All Paths / one path as an AI3 PostScript file, y up, unpainted).
  - Window > Workspace > New Workspace / Delete Workspace / Reset <current>: user workspaces save the icon strip, active dock tabs and closed groups (localStorage `pshot_workspaces_v1`) and are listed in the Window > Workspace submenu (a `children` getter in config-menu.js) and the options bar workspace switcher.
  - Options bar audit pass (2026-10-09): Marquee Style Fixed Ratio / Fixed Size with Width/Height; Refine Edge buttons work; Eyedropper Sample Size, Sample (Current & Below, No Adjustments variants), Show Sampling Ring; Magic Wand Sample Size (averaged seed).
  - Eraser rebuilt on the retouch dab engine (`mode: 'erase'`): Brush / Pencil / Block (16 screen px), Opacity caps a stroke, Flow builds up, brush hardness, Erase to History (and Alt-drag), Background layer paints the background color.
  - Gradients (`ps/gradients.js`): CS6 model with color stops ('fg'/'bg' or hex) and opacity stops, the CS6 default preset set + user presets (localStorage), preset picker (options bar caret) and Gradient Editor (presets, name, stops bar: click a track to add, drag to move, color / opacity / location, Delete, New). Gradient Tool rebuilt: Linear, Radial, Angle, Reflected, Diamond from drag start to end (Shift = 45 degrees), Reverse, Dither, Transparency; low-res preview while dragging. Gradient Map now uses full gradients too (presets, editor, Dither, Reverse; multi-stop PSD round trip). Gradient Overlay (layer style) uses full gradients too: gradient swatch (editor) + presets caret, Dither, Reverse, Style (5 types), Align with Layer (layer pixel bounds), Angle, Scale; multi-stop PSD round trip; older two-color styles still render. Shared `render` / `render_centered` in gradients.js.
  - Paint Bucket rebuilt (Foreground / Pattern, Mode, Opacity, Tolerance 0-255, real Contiguous, Anti-alias, All Layers, inside the selection; the old miniPaint fill had Contiguous inverted). Blur / Sharpen moved to the retouch dab engine (Strength, Mode Normal/Darken/Lighten/Hue/Saturation/Color/Luminosity, Sample All Layers, Protect Detail); Smudge Mode + Finger Painting. Sponge moved into the dodge/burn tool (Desaturate / Saturate, Flow, Vibrance); Dodge/Burn Protect Tones (HSL lightness) vs unprotected gain/clip.
  - Crop tool: ratio presets fill W / H (kept while dragging and after clamping), swap and Clear; View overlays Rule of Thirds / Grid / Diagonal / Triangle / Golden Ratio / Golden Spiral (`base-selection` crop_lines); crop shield darkens the outside (was miniPaint's green tint); Delete Cropped Pixels off keeps pixels outside the canvas; Straighten (drag a line: canvas rotated level, crop box = largest rectangle inside the rotated image). Option changes no longer trigger the crop commit (`on_params_update(change)`).
  - All CS6 layer blend modes: Dissolve, Linear Burn, Darker Color, Lighter Color, Vivid Light, Linear Light, Pin Light, Hard Mix, Subtract, Divide are composition ids 'ps-...' composited per pixel (`ps/blend.js`, `base-layers.render_custom_blend`, used by display, flatten and export); PSD blend mode round trip. `blend_rgb(mode, base, src)` covers every CS6 mode for tools.
  - Pencil Auto Erase. Brush / pencil / gradient strokes can use every CS6 mode (per-pixel composite in `commit_stroke` for the modes canvas lacks).
  - Clone Stamp / Pattern Stamp / History Brush: Mode (any CS6 mode via `retouch.mix`) and Flow; Pattern Stamp Aligned (off = pattern starts at each stroke). Impressionist stays greyed.
  - Per-tool options: toolbox members sharing one engine (retouch, dodge/burn, ps_select, ...) each keep their own options (`select_member` saves `member._opts`, restores them or the startup defaults from `snapshot_tool_defaults`).
  - Shape tools: CS6 defaults (fill = foreground, no stroke, 3 pt); Stroke Options menu (Solid / Dashed / Dotted, Align Inside / Center / Outside, Caps, Corners) rendered by `Shapes.stroke_path` and saved to PSD (lineAlignment, lineCapType, lineJoinType, lineDashSet); Fill / Stroke / stroke options / W / H in the options bar edit the selected shape layer (one History step each, `Shapes.option_changed`, `sync_options`); Align Edges snaps new shapes to whole pixels; a click without dragging opens Create Rectangle / Ellipse / Polygon / Custom Shape (Width, Height, From Center).
  - Healing Brush: Mode (Normal / Replace = raw source / Multiply ... Luminosity, blended with the pre-stroke pixels), Source Sampled or Pattern, Aligned, Sample Current Layer / Current & Below / All Layers; Clone Source panel button. Spot Healing Brush Mode. Spot Healing Type and Sample All Layers stay greyed.
  - Magic Eraser rebuilt (Tolerance 0-255, real Contiguous, Anti-alias, Sample All Layers, Opacity; Background becomes Layer 0). Quick Selection Auto-Enhance (smoothed, re-thresholded, slightly softened edge).
  - Patch: Normal / Content-Aware (seam band rebuilt by inpainting), Source / Destination, Transparent (50% texture), Use Pattern (+ pattern picker). Content-Aware Move: Move / Extend, Adaptation (edge feather 0-10 px), Sample All Layers.
  - Slices (`ps/slices.js`, `tools/ps_slice.js`): Slice Tool (Style Normal / Fixed Aspect Ratio / Fixed Size, Slices From Guides) and Slice Select Tool (select, move, resize handles, Delete, double-click Slice Options, stacking order, Promote, Divide, Hide Auto Slices); user, layer-based (Layer > New Layer Based Slice) and auto slices numbered as in CS6; View > Show > Slices, Snap To > Slices, Lock Slices, Clear Slices; per document; History steps. Save for Web with slices writes a zip (HTML + images/, slice names, URLs, targets, alt; `ps/zip.js`). PSD round trip of user slices (layer slices are saved at their bounds).
  - View > Show > Smart Guides (on by default): the Move tool's alignment lines drawn magenta; off hides them (snapping still follows Snap To).
  - Character Styles / Paragraph Styles panels (`ps/type-styles.js`, per document `config.ps_char_styles` / `ps_para_styles`): new style from the current type settings, click to apply to the type layer (or selected text) and the Type tool, double-click for Style Options, Redefine, Delete; paragraph styles also set alignment; Type > Panels and Window menu items. Not saved to PSD. Character panel anti-alias select now works.
  - Live fill layers (`ps/fill-layers.js`, `type: 'ps_fill'`): Layer > New Fill Layer > Solid Color / Gradient (gradient, Linear/Radial/Angle/Reflected/Diamond, angle, scale, reverse, dither) / Pattern (pattern, scale); fill the whole document at any size; double-click the thumbnail or Layer Content Options to edit (live preview, one History step); Layer > Rasterize > Fill Content; painting asks to rasterize; PSD round trip as fill layers (vectorFill without vector mask). The selection becomes the fill layer's mask.
  - Layers panel: thumbnail double-clicks are detected from two quick presses (the first click re-renders the rows, so the browser's dblclick could land on a detached element).
  - Auto-Blend masks: a layer reveals what it or any upper layer owns, so only its seam with lower layers is feathered (alphas add to 1), and the feather is kept off the outer edges / document border.
  - Fixed: a new or opened document that fits the canvas kept the previous document's view offset (content cut off); `render_frame` now snaps the position to 0 on any axis where the document fits. New / opened / generated documents open at 100% when they fit (`GUI_preview.zoom_open`); crop / rotate / image size still keep the zoom.
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
- **Filters**: Liquify (Shift+Ctrl+X: Forward Warp, Reconstruct, Pucker, Bloat, Push Left; size/density/pressure; Restore All; Show Backdrop; `ps/liquify.js`), Gaussian Blur, Motion Blur, Average, Unsharp Mask, Smart Sharpen, Add Noise, Median, Dust & Scratches, High Pass, Minimum, Maximum, Offset, Twirl, Pinch, Spherize, Polar Coordinates, Ripple, Clouds, Difference Clouds, Diffuse, Surface Blur, Smart Blur, Sharpen Edges, Wave, ZigZag, Shear, Crystallize, Pointillize, Facet, Fragment, Mezzotint, Fibers, Lens Flare, Tiles, Trace Contour, Wind, Extrude, Custom. Also Blur, Blur More, Sharpen, Sharpen More, Despeckle, Find Edges, Solarize (one-step), Box Blur, Radial Blur, Reduce Noise, Mosaic, Emboss, Color Halftone, Oil Paint. Tilt-Shift is the Blur Gallery; Filter Gallery is pshot's own (below).
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
  - Edit > Presets > Preset Manager (Brushes, Gradients, Patterns, Custom Shapes, Tools; rename/delete user presets) and Export/Import Presets (one JSON file).
  - Layers panel right-click menus (ps/layer-context.js): layer row (Layer Properties / Layer From Background, Blending Options, Duplicate/Delete, Smart Object, Rasterize, mask enable/disable, Clipping Mask, Link, layer styles, Merge, Flatten, color labels), thumbnail (Select Pixels / transparency ops), layer mask and vector mask thumbnails. The clicked layer is selected first; popup menu items ignore the right-button release.
  - Canvas right-click (ps/canvas-context.js), by tool: Free Transform menu (modes, Rotate 180/90, Flip — Transform.orient), selection tools (Deselect/Select All, Inverse, Feather, Refine Edge, Save Selection, Make Work Path, Layer via Copy/Cut, Free Transform, Fill/Stroke, Last Filter, Fade), painting tools open the brush picker at the pointer, Move lists the layers under the pointer, Hand/Zoom views, Eyedropper sample sizes + copy color, pen tools path commands.
  - Layer context menus also cover: type layers (Rasterize Type, Create Work Path, Convert to Shape, Horizontal/Vertical, anti-alias, Paragraph/Point, Warp Text), smart objects (via Copy, Edit/Export/Replace Contents), the fx badge and Effects rows (layer style items, Global Light, Create Layer, Hide All Effects, Scale Effects), Smart Filters header and rows, and the eye column (hide this / all others, color labels).
  - Fix: per-tool option memory and tool presets restore only `.value` of { value, values() } attributes (`Ps_workspace.restore_attributes`); before, the Type tool's font list was lost and its options bar threw.

## Known gaps / next

- FOLLOW-UP (Josh, 2026-10-10): Help > About still shows miniPaint branding — rebrand as pshot (CS6-style About box), keep a 'based on miniPaint (MIT)' credit line.
- Right-click audit (2026-10-10) remaining: see the list under 'Right-click audit' below as items get done.

- Scope (Josh, 2026-10-09): image editing only. Video-only CS6 features (Timeline, Layer > Video Layers, Render Video, Filter > Video, frame animation) are not needed; leave them greyed.
- Filters: Adaptive Wide Angle, Vanishing Point.
- Actions: droplets and recording of tool strokes, Freeform Pen's Magnetic option, Slice tools, 3D.  Make Work Path traces corner points only (no curve fitting).
- Adjustments: Color Lookup's built-in looks are procedural approximations named like the CS6 presets (Adobe's LUT files are not redistributable); Abstract / Device Link profiles are greyed. HDR Toning has no Toning Curve (presets are approximations). Match Color has no selection-based statistics or Save/Load Statistics.
- Styles: Contour/Texture/quality contours are not written to PSD; bevel techniques other than Smooth (Pillow and Stroke Emboss render as Emboss). PSD placed layers (smart objects and their smart filters save as pixels).
- Brush panel: Texture, Dual Brush, Brush Pose, Build-up, Smoothing, Protect Texture sections; Brush Presets.
- Chrome reserves Ctrl+N, Ctrl+W and Ctrl+T in a normal window, so those commands work from the menus there. The full screen modes (F) also take the browser full screen and call the Keyboard Lock API, so the shortcuts reach pshot (not verifiable in headless tests).

## Testing
- Test layers built in page code must have an `Image` as `link` (Update_layer_image_action reads `link.src`); a canvas `link` makes every later adjustment silently do nothing.
- Menu sweep: dump the `config-menu.js` targets to `public/targets.json`, then in Playwright stub file inputs, confirm/alert/prompt and anchor clicks with addInitScript and call every target (432 targets, 430 run after skipping Close / Close All; 0 errors on 2026-10-09, late evening).
- Menu sweep: run every enabled menu target via `pshot.GUI.modules[...]` and dismiss its dialog (close popouts with `Ps_workspace.close_popout()`, never by removing them: they hold panel hosts).
- Feature checks run through the Playwright MCP browser. Screenshots are in `docs/screens/`.
