# Photoshop CS6 reference spec (pshot UI source of truth)

Target: **Photoshop CS6 Extended (13.x), Windows, Essentials (Default) workspace, default interface color theme.**
Anything in CS6 that pshot hasn't built yet still appears in its CS6 position, **disabled/greyed**.
Shortcut notation uses Windows (Ctrl/Alt/Shift).

## 1. Application frame (top → bottom)

1. **Menu bar** (dark, same theme as the panels): `Ps` logo, then File, Edit, Image, Layer, Type, Select, Filter, 3D, View, Window, Help. The window controls sit at the far right.
2. **Options bar**: tool-preset picker (the current tool's icon plus ▾) on the left, then that tool's own options. The far right has the workspace switcher (`Essentials ▾`).
3. **Body**:
   - **Left:** the Tools panel. It's a single column docked to the left edge, with a `»` collapse/expand-to-two-columns toggle in its header strip.
   - **Centre:** document tabs, then the canvas on the pasteboard, then the status bar at the bottom of the document window. The status bar has a zoom % field and `Doc: 0K/0K ▸`.
   - **Right:** the panel dock. Next to the canvas is a collapsed **icon strip**: History, then Properties. To its right are the expanded panel groups, top to bottom:
     1. **Color | Swatches**
     2. **Adjustments | Styles**
     3. **Layers | Channels | Paths**, which takes the remaining height
4. **Bottom of the frame**: collapsed **Mini Bridge | Timeline** tabs.

## 2. Theme (CS6 default, the second-darkest interface colour)

| token | value |
|---|---|
| panel background | `#535353` |
| pasteboard | `#282828` |
| panel tab strip / inactive tab | `#424242` |
| active tab | `#535353` |
| field background | `#3a3a3a` (inset, `#2a2a2a` border) |
| menu bar / menus | `#535353` bg, `#e6e6e6` text, hover `#2d6ac1`-ish highlight |
| text | `#e6e6e6` primary, `#a8a8a8` disabled |
| dividers | `#383838` dark, `#636363` light bevel |
| selected layer row | `#4f78a8`-ish blue |
| font | Segoe UI / Tahoma, 11–12px |

## 3. Tools panel (single column, top → bottom; groups = flyouts; ▸ = has flyout)

Separators between groups: **[1–4] | [5–6] | [7–14] | [15–18] | [19–20]**

| # | Default tool (shortcut) | Flyout members (all share the shortcut; Shift+key cycles) |
|---|---|---|
| 1 | Move (V) | none |
| 2 | Rectangular Marquee (M) | Elliptical Marquee (M), Single Row Marquee, Single Column Marquee |
| 3 | Lasso (L) | Polygonal Lasso (L), Magnetic Lasso (L) |
| 4 | Quick Selection (W) | Magic Wand (W) |
| 5 | Crop (C) | Perspective Crop (C), Slice (C), Slice Select (C) |
| 6 | Eyedropper (I) | 3D Material Eyedropper (I), Color Sampler (I), Ruler (I), Note (I), Count (I) |
| 7 | Spot Healing Brush (J) | Healing Brush (J), Patch (J), Content-Aware Move (J), Red Eye (J) |
| 8 | Brush (B) | Pencil (B), Color Replacement (B), Mixer Brush (B) |
| 9 | Clone Stamp (S) | Pattern Stamp (S) |
| 10 | History Brush (Y) | Art History Brush (Y) |
| 11 | Eraser (E) | Background Eraser (E), Magic Eraser (E) |
| 12 | Gradient (G) | Paint Bucket (G), 3D Material Drop (G) |
| 13 | Blur | Sharpen, Smudge (no shortcut) |
| 14 | Dodge (O) | Burn (O), Sponge (O) |
| 15 | Pen (P) | Freeform Pen (P), Add Anchor Point, Delete Anchor Point, Convert Point |
| 16 | Horizontal Type (T) | Vertical Type (T), Horizontal Type Mask (T), Vertical Type Mask (T) |
| 17 | Path Selection (A) | Direct Selection (A) |
| 18 | Rectangle (U) | Rounded Rectangle (U), Ellipse (U), Polygon (U), Line (U), Custom Shape (U) |
| 19 | Hand (H) | Rotate View (R) |
| 20 | Zoom (Z) | none |

Below the tools:
- the foreground/background swatches, with the small Default Colors (D) and Switch (X) icons
- Quick Mask (Q)
- Screen Mode (F), which has a flyout: Standard, Full Screen With Menu Bar, Full Screen

## 4. Menus (— = separator, ▸ = submenu, ✓ = checkable)

**File:** New… Ctrl+N · Open… Ctrl+O · Browse in Bridge… Alt+Ctrl+O · Browse in Mini Bridge… · Open As… Alt+Shift+Ctrl+O · Open as Smart Object… · Open Recent ▸ — Close Ctrl+W · Close All Alt+Ctrl+W · Close and Go to Bridge… Shift+Ctrl+W · Save Ctrl+S · Save As… Shift+Ctrl+S · Check In… · Save for Web… Alt+Shift+Ctrl+S · Revert F12 — Place… — Import ▸ (Variable Data Sets…, Video Frames to Layers…, Notes…, WIA Support…) · Export ▸ (Data Sets as Files…, Paths to Illustrator…, Render Video…, Zoomify…) — Automate ▸ (Batch…, PDF Presentation…, Create Droplet…, Crop and Straighten Photos, Contact Sheet II…, Conditional Mode Change…, Fit Image…, Lens Correction…, Merge to HDR Pro…, Photomerge…) · Scripts ▸ (Image Processor…, Delete All Empty Layers, Flatten All Layer Effects, Flatten All Masks, — Layer Comps to Files…, Layer Comps to PDF…, Layer Comps to WPG…, Export Layers to Files…, — Script Events Manager…, — Load Files into Stack…, Load Multiple DICOM Files…, Statistics…, — Browse…) — File Info… Alt+Shift+Ctrl+I — Print… Ctrl+P · Print One Copy Alt+Shift+Ctrl+P — Exit Ctrl+Q

**Edit:** Undo Ctrl+Z · Step Forward Shift+Ctrl+Z · Step Backward Alt+Ctrl+Z — Fade… Shift+Ctrl+F — Cut Ctrl+X · Copy Ctrl+C · Copy Merged Shift+Ctrl+C · Paste Ctrl+V · Paste Special ▸ (Paste in Place Shift+Ctrl+V, Paste Into Alt+Shift+Ctrl+V, Paste Outside) · Clear — Check Spelling… · Find and Replace Text… — Fill… Shift+F5 · Stroke… — Content-Aware Scale Alt+Shift+Ctrl+C · Puppet Warp · Free Transform Ctrl+T · Transform ▸ (Again Shift+Ctrl+T, — Scale, Rotate, Skew, Distort, Perspective, Warp, — Rotate 180°, Rotate 90° CW, Rotate 90° CCW, — Flip Horizontal, Flip Vertical) · Auto-Align Layers… · Auto-Blend Layers… — Define Brush Preset… · Define Pattern… · Define Custom Shape… — Purge ▸ (Undo, Clipboard, Histories, Video Cache, All) — Adobe PDF Presets… · Presets ▸ (Preset Manager…, Migrate Presets, Export/Import Presets…) · Remote Connections… — Color Settings… Shift+Ctrl+K · Assign Profile… · Convert to Profile… — Keyboard Shortcuts… Alt+Shift+Ctrl+K · Menus… Alt+Shift+Ctrl+M · Preferences ▸ (General… Ctrl+K, Interface…, File Handling…, Performance…, Cursors…, Transparency & Gamut…, Units & Rulers…, Guides, Grid & Slices…, Plug-Ins…, Type…, 3D…, — Camera Raw…)

**Image:** Mode ▸ (Bitmap…, Grayscale, Duotone…, Indexed Color…, ✓RGB Color, CMYK Color, Lab Color, Multichannel, — ✓8 Bits/Channel, 16 Bits/Channel, 32 Bits/Channel, — Color Table…) — Adjustments ▸ (Brightness/Contrast…, Levels… Ctrl+L, Curves… Ctrl+M, Exposure…, — Vibrance…, Hue/Saturation… Ctrl+U, Color Balance… Ctrl+B, Black & White… Alt+Shift+Ctrl+B, Photo Filter…, Channel Mixer…, Color Lookup…, — Invert Ctrl+I, Posterize…, Threshold…, Gradient Map…, Selective Color…, — Shadows/Highlights…, HDR Toning…, Variations…, — Desaturate Shift+Ctrl+U, Match Color…, Replace Color…, Equalize) — Auto Tone Shift+Ctrl+L · Auto Contrast Alt+Shift+Ctrl+L · Auto Color Shift+Ctrl+B — Image Size… Alt+Ctrl+I · Canvas Size… Alt+Ctrl+C · Image Rotation ▸ (180°, 90° CW, 90° CCW, Arbitrary…, — Flip Canvas Horizontal, Flip Canvas Vertical) · Crop · Trim… · Reveal All — Duplicate… · Apply Image… · Calculations… — Variables ▸ (Define…, Data Sets…) · Apply Data Set… — Trap… — Analysis ▸ (Set Measurement Scale ▸, Select Data Points ▸, Record Measurements Shift+Ctrl+M, — Ruler Tool, Count Tool, — Place Scale Marker…)

**Layer:** New ▸ (Layer… Shift+Ctrl+N, Background from Layer, Group…, Group from Layers…, — Layer via Copy Ctrl+J, Layer via Cut Shift+Ctrl+J) · Duplicate Layer… · Delete ▸ (Layer, Hidden Layers) — Layer Style ▸ (Blending Options…, — Bevel & Emboss…, Stroke…, Inner Shadow…, Inner Glow…, Satin…, Color Overlay…, Gradient Overlay…, Pattern Overlay…, Outer Glow…, Drop Shadow…, — Copy Layer Style, Paste Layer Style, Clear Layer Style, — Global Light…, Create Layer, Hide All Effects, Scale Effects…) · Smart Filter ▸ — New Fill Layer ▸ (Solid Color…, Gradient…, Pattern…) · New Adjustment Layer ▸ (Brightness/Contrast…, Levels…, Curves…, Exposure…, — Vibrance…, Hue/Saturation…, Color Balance…, Black & White…, Photo Filter…, Channel Mixer…, Color Lookup…, — Invert…, Posterize…, Threshold…, Gradient Map…, Selective Color…) · Layer Content Options… — Layer Mask ▸ (Reveal All, Hide All, Reveal Selection, Hide Selection, From Transparency, — Delete, Apply, — Disable, Unlink) · Vector Mask ▸ (Reveal All, Hide All, Current Path, — Delete, — Disable, Unlink) · Create Clipping Mask Alt+Ctrl+G — Smart Objects ▸ (Convert to Smart Object, New Smart Object via Copy, Edit Contents, Export Contents…, Replace Contents…, Stack Mode ▸, Rasterize) · Video Layers ▸ · Rasterize ▸ (Type, Shape, Fill Content, Vector Mask, Smart Object, Video, 3D, — Layer, All Layers) — New Layer Based Slice — Group Layers Ctrl+G · Ungroup Layers Shift+Ctrl+G · Hide Layers Ctrl+, — Arrange ▸ (Bring to Front Shift+Ctrl+], Bring Forward Ctrl+], Send Backward Ctrl+[, Send to Back Shift+Ctrl+[, — Reverse) · Combine Shapes ▸ (Unite Shapes, Subtract Front Shape, Unite Shapes at Overlap, Subtract Shapes at Overlap) — Align ▸ (Top Edges, Vertical Centers, Bottom Edges, — Left Edges, Horizontal Centers, Right Edges) · Distribute ▸ (Top Edges, Vertical Centers, Bottom Edges, — Left Edges, Horizontal Centers, Right Edges) — Lock Layers… Ctrl+/ — Link Layers · Select Linked Layers — Merge Down Ctrl+E · Merge Visible Shift+Ctrl+E · Flatten Image — Matting ▸ (Defringe…, Remove Black Matte, Remove White Matte)

**Type:** Panels ▸ (Character Panel, Paragraph Panel, Character Styles Panel, Paragraph Styles Panel) · Anti-Alias ▸ (None, Sharp, Crisp, Strong, Smooth) · Orientation ▸ (Horizontal, Vertical) · OpenType ▸ — Extrude to 3D — Create Work Path · Convert to Shape — Rasterize Type Layer · Convert to Paragraph Text · Warp Text… — Font Preview Size ▸ (None, Small, Medium, Large, Extra Large, Huge) · Language Options ▸ — Update All Text Layers · Replace All Missing Fonts — Paste Lorem Ipsum — Load Default Type Styles · Save Default Type Styles

**Select:** All Ctrl+A · Deselect Ctrl+D · Reselect Shift+Ctrl+D · Inverse Shift+Ctrl+I — All Layers Alt+Ctrl+A · Deselect Layers · Similar Layers — Color Range… — Refine Edge… Alt+Ctrl+R · Modify ▸ (Border…, Smooth…, Expand…, Contract…, Feather… Shift+F6) — Grow · Similar — Transform Selection — Edit in Quick Mask Mode — Load Selection… · Save Selection… — New 3D Extrusion

**Filter:** Last Filter Ctrl+F — Convert for Smart Filters — Filter Gallery… · Adaptive Wide Angle… Alt+Shift+Ctrl+A · Lens Correction… Shift+Ctrl+R · Liquify… Shift+Ctrl+X · Oil Paint… · Vanishing Point… Alt+Ctrl+V — Blur ▸ (Field Blur…, Iris Blur…, Tilt-Shift…, — Average, Blur, Blur More, Box Blur…, Gaussian Blur…, Lens Blur…, Motion Blur…, Radial Blur…, Shape Blur…, Smart Blur…, Surface Blur…) · Distort ▸ (Displace…, Pinch…, Polar Coordinates…, Ripple…, Shear…, Spherize…, Twirl…, Wave…, ZigZag…) · Noise ▸ (Add Noise…, Despeckle, Dust & Scratches…, Median…, Reduce Noise…) · Pixelate ▸ (Color Halftone…, Crystallize…, Facet, Fragment, Mezzotint…, Mosaic…, Pointillize…) · Render ▸ (Clouds, Difference Clouds, Fibers…, Lens Flare…, Lighting Effects…) · Sharpen ▸ (Sharpen, Sharpen Edges, Sharpen More, Smart Sharpen…, Unsharp Mask…) · Stylize ▸ (Diffuse…, Emboss…, Extrude…, Find Edges, Solarize, Tiles…, Trace Contour…, Wind…) · Video ▸ (De-Interlace…, NTSC Colors) · Other ▸ (Custom…, High Pass…, Maximum…, Minimum…, Offset…) — Digimarc ▸ (Embed Watermark…, Read Watermark…) — Browse Filters Online…

**3D:** New 3D Layer from File… · Merge 3D Layers — Export 3D Layer… — New 3D Extrusion from Selected Layer · New 3D Extrusion from Selected Path · New 3D Extrusion from Current Selection — New Mesh from Layer ▸ (Postcard, Mesh Preset ▸, Depth Map to ▸, Volume…) — Split Extrusion — Apply Cross Section to Scene — Paint on Target Texture ▸ · Paint Falloff… · Select Paintable Areas — Create UV Overlays ▸ (Wireframe, Shaded, Normal Map) · Reparameterize UVs… — New Tiled Painting — Make Work Path from 3D Layer — Render · Sketch With Current Brush — Browse 3D Content Online…

**View:** Proof Setup ▸ · Proof Colors Ctrl+Y · Gamut Warning Shift+Ctrl+Y · Pixel Aspect Ratio ▸ · Pixel Aspect Ratio Correction · 32-bit Preview Options… — Zoom In Ctrl++ · Zoom Out Ctrl+- · Fit on Screen Ctrl+0 · Actual Pixels Ctrl+1 · Print Size — Screen Mode ▸ (✓Standard Screen Mode, Full Screen Mode With Menu Bar, Full Screen Mode) — ✓Extras Ctrl+H · Show ▸ (Layer Edges, ✓Selection Edges, Target Path Shift+Ctrl+H, Grid Ctrl+', ✓Guides Ctrl+;, Count, ✓Smart Guides, Slices, Notes, Pixel Grid, 3D Secondary View, 3D Ground Plane, 3D Lights, 3D Selection, UV Overlay, Mesh, Edit Pins, — All, None, — Show Extra Options…) — Rulers Ctrl+R — ✓Snap Shift+Ctrl+; · Snap To ▸ (Guides, Grid, Layers, Slices, Document Bounds, — All, None) — Lock Guides Alt+Ctrl+; · Clear Guides · New Guide… — Lock Slices · Clear Slices

**Window:** Arrange ▸ (Tile All Vertically, Tile All Horizontally, 2-up Horizontal, 2-up Vertical, 3-up Horizontal, 3-up Vertical, 3-up Stacked, 4-up, 6-up, Consolidate All to Tabs, — Cascade, Tile, Float in Window, Float All in Windows, — Match Zoom, Match Location, Match Rotation, Match All, — New Window for <doc>) · Workspace ▸ (✓Essentials (Default), 3D, Motion, Painting, Photography, Typography, — Reset Essentials, New Workspace…, Delete Workspace…, — Keyboard Shortcuts & Menus…) — Extensions ▸ (Adobe Exchange, Kuler, Mini Bridge) — 3D · Actions Alt+F9 · ✓Adjustments · Brush F5 · Brush Presets · Channels · Character · Character Styles · Clone Source · ✓Color F6 · Histogram · History · Info F8 · Layer Comps · ✓Layers F7 · Measurement Log · Navigator · Notes · Paragraph · Paragraph Styles · Paths · Properties · Styles · Swatches · Timeline · Tool Presets — ✓Options · ✓Tools — (open documents, ✓ on the active one)

**Help:** Photoshop Online Help… F1 · Photoshop Support Center… — About Photoshop… · About Plug-In ▸ · Legal Notices… — Manage Extensions… — System Info… — Product Registration… · Deactivate… · Updates… — Photoshop Online… · Photoshop Resources Online… · Adobe Product Improvement Program…

## 5. Layers panel (CS6)

From top to bottom:
1. Tab strip: **Layers | Channels | Paths**, with the panel menu (≡) at the right.
2. Filter row: `Kind ▾` dropdown, then filter icons (pixel, adjustment, type, shape, smart object), then the filter on/off toggle.
3. Blend mode dropdown (`Normal`), then `Opacity: 100% ▾`.
4. `Lock:` icons (transparent pixels, image pixels, position, all), then `Fill: 100% ▾`.
5. Layer rows. Each row has an eye toggle, a thumbnail, the name, and a fx/link/lock indicator. The Background layer is in italics and shows a lock.
6. Bottom buttons, left to right: Link layers, Add a layer style (fx ▾), Add layer mask, Create new fill or adjustment layer (◐ ▾), Create a new group, Create a new layer, Delete layer.
