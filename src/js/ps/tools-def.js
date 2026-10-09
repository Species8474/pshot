/*
 * pshot - Photoshop CS6 Tools panel (docs/cs6-spec.md §3).
 *
 * groups: one toolbox slot each, members open in the flyout.
 *   id     pshot tool id (unique)
 *   name   CS6 tool name
 *   key    CS6 shortcut letter (Shift+key cycles the group)
 *   tool   miniPaint tool (config.TOOLS name) that implements it; null = not built yet (greyed)
 *   icon   SVG body for a 0 0 18 18 viewBox
 * separator: true starts a new section (CS6 draws a divider line above it).
 */

const S = 'fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"';
const D = 'fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 1.6"';

const I = {
	move: `<path d="M3 2v10l2.6-2.4L7.4 14l1.7-.8-1.8-4.2H11z" fill="currentColor"/><path d="M14 8v8M10 12h8M14 8l-1.3 1.4M14 8l1.3 1.4M14 16l-1.3-1.4M14 16l1.3-1.4" ${S} transform="translate(-1 -1)"/>`,
	rect_marquee: `<rect x="2.5" y="3.5" width="13" height="11" ${D}/>`,
	ellipse_marquee: `<ellipse cx="9" cy="9" rx="6.5" ry="5.5" ${D}/>`,
	row_marquee: `<path d="M1.5 9h15" ${D}/><path d="M1.5 6.5v5M16.5 6.5v5" ${S}/>`,
	col_marquee: `<path d="M9 1.5v15" ${D}/><path d="M6.5 1.5h5M6.5 16.5h5" ${S}/>`,
	lasso: `<path d="M5.5 11.5C2 10 2 5 7 3.6c4.5-1.3 9 .8 8.5 4-.5 3.2-6 4.2-9 3.4" ${S}/><path d="M6.4 11c-.6 1.6-.2 3 1.2 3.8 1.2.7 1.4 1.8.6 2.7" ${S}/>`,
	polygon_lasso: `<path d="M3 12L5 3.5l6 2.2 4.5-2.7L14 12.5 8 10.5z" ${S}/><path d="M3 12l-.5 4" ${S}/>`,
	magnetic_lasso: `<path d="M5 10C2 8.5 2.5 4 7 3s8 1 7.5 3.5" ${S}/><path d="M9 9.5h6v3.2a3 3 0 0 1-6 0z" ${S}/><path d="M9 11h2M13 11h2" ${S}/>`,
	quick_selection: `<circle cx="7" cy="7" r="5" ${D}/><path d="M9.5 9.5l6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`,
	magic_wand: `<path d="M3 15L11 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M13 1.5v3M13 8v1.5M9.5 5h-1.5M16.5 5H18M10.6 2.6l1 1M15.4 2.6l-1 1M15.4 7.4l-1-1" ${S}/>`,
	crop: `<path d="M5 1.5V13h11.5M1.5 5H13v11.5" ${S} stroke-width="1.6"/>`,
	perspective_crop: `<path d="M5.5 2l-1 11h11.5M2 5.5l11.5-1 1 11.5" ${S}/><path d="M7 7l5 0 0 5" ${D}/>`,
	slice: `<path d="M2.5 15.5L13 5l1.8 1.8L4.3 17.3z" fill="currentColor"/><path d="M13 5l2.5-2.5" ${S} stroke-width="2"/>`,
	slice_select: `<path d="M2.5 13.5L10 6l1.6 1.6-7.5 7.5z" fill="currentColor"/><path d="M11 9v7.5l1.8-1.7 1.2 2.4 1.2-.6-1.2-2.4H16z" fill="currentColor"/>`,
	eyedropper: `<path d="M12.2 2.3a2 2 0 0 1 2.8 2.8l-1.8 1.8.9.9-1.2 1.2-.9-.9-6.4 6.4H3.5v-2.1l6.4-6.4-.9-.9 1.2-1.2.9.9z" ${S}/>`,
	material_eyedropper: `<path d="M13 2.5a1.8 1.8 0 0 1 2.5 2.5L14 6.5l.8.8-1 1-.8-.8L8 12.5H6.5V11l5-5-.8-.8 1-1 .8.8z" ${S}/><path d="M1.5 12.5l3-1.5 3 1.5v3l-3 1.5-3-1.5zM1.5 12.5l3 1.5 3-1.5M4.5 14v3" ${S}/>`,
	color_sampler: `<path d="M12.2 2.3a2 2 0 0 1 2.8 2.8l-1.8 1.8.9.9-1.2 1.2-.9-.9-4.5 4.5" ${S}/><circle cx="5" cy="13" r="3" ${S}/><path d="M5 9v2M5 15v2M1 13h2M7 13h2" ${S}/>`,
	ruler: `<path d="M1.5 12.5l11-11 4 4-11 11z" ${S}/><path d="M4.5 9.5l1.5 1.5M6.5 7.5l2 2M8.5 5.5l1.5 1.5M10.5 3.5l2 2" ${S}/>`,
	note: `<path d="M3 2.5h9l3 3v10H3z" ${S}/><path d="M12 2.5v3h3M5.5 8h7M5.5 10.5h7M5.5 13h4.5" ${S}/>`,
	count: `<text x="9" y="13" font-size="8.5" font-family="Arial, sans-serif" font-weight="bold" text-anchor="middle" fill="currentColor">123</text>`,
	spot_healing: `<rect x="1.5" y="6" width="15" height="6" rx="3" transform="rotate(-45 9 9)" ${S}/><path d="M7.5 7.5h3v3h-3z" fill="currentColor" transform="rotate(-45 9 9)"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="12.5" cy="16.3" r=".7" fill="currentColor"/>`,
	healing: `<rect x="1.5" y="6" width="15" height="6" rx="3" transform="rotate(-45 9 9)" ${S}/><path d="M7.5 7.5h3v3h-3z" fill="currentColor" transform="rotate(-45 9 9)"/>`,
	patch: `<path d="M3 6.5C3 4 5 2.5 7.5 3.5S12 2 14.5 4 15 9 15 11.5 12 15.5 9 14.5 3 15 3 12z" ${S}/><path d="M6 7.5h6M6 10.5h6" ${D}/>`,
	content_aware_move: `<rect x="2" y="2" width="7" height="7" ${D}/><path d="M7 12h9M16 12l-2-2M16 12l-2 2M12 7v9M12 16l-2-2M12 16l2-2" ${S}/>`,
	red_eye: `<path d="M1.5 9s3-5 7.5-5 7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5z" ${S}/><circle cx="9" cy="9" r="2.6" fill="currentColor"/><path d="M2 2l2 2M16 2l-2 2" ${S}/>`,
	brush: `<path d="M15.6 1.8c.5.5-4.8 7.6-6.6 9.2l-1.7-1.7C8.9 7.5 15.1 1.3 15.6 1.8z" fill="currentColor"/><path d="M6.6 10c-1.7 0-3 1-3.2 2.8-.2 1.6-.9 2.3-2.1 2.8 2.7 1.3 6.6.6 7.2-2.2.2-1-.3-2.4-1.9-3.4z" fill="currentColor"/>`,
	pencil: `<path d="M12.5 2l3.5 3.5-9.5 9.5L2 16l1-4.5z" ${S}/><path d="M10.5 4l3.5 3.5M3 11.5l3.5 3.5" ${S}/><path d="M2 16l.8-3.2 2.4 2.4z" fill="currentColor"/>`,
	color_replacement: `<path d="M15.6 1.8c.5.5-4.8 7.6-6.6 9.2l-1.7-1.7C8.9 7.5 15.1 1.3 15.6 1.8z" fill="currentColor"/><path d="M6.6 10c-1.7 0-3 1-3.2 2.8-.2 1.6-.9 2.3-2.1 2.8 2.7 1.3 6.6.6 7.2-2.2.2-1-.3-2.4-1.9-3.4z" fill="currentColor"/><path d="M11 15.5h5.5M14.5 13.5l2 2-2 2" ${S}/>`,
	mixer_brush: `<path d="M15.6 1.8c.5.5-4.8 7.6-6.6 9.2l-1.7-1.7C8.9 7.5 15.1 1.3 15.6 1.8z" fill="currentColor"/><path d="M6.6 10c-1.7 0-3 1-3.2 2.8-.2 1.6-.9 2.3-2.1 2.8 2.7 1.3 6.6.6 7.2-2.2.2-1-.3-2.4-1.9-3.4z" fill="currentColor"/><path d="M14 11.5c1 1.5 1.8 2.5 1.8 3.4a1.8 1.8 0 0 1-3.6 0c0-.9.8-1.9 1.8-3.4z" fill="currentColor"/>`,
	clone_stamp: `<path d="M6.5 2.5h5v3.5c0 1.5-1.5 2-1.5 3.5h4.5v3h-11v-3H8C8 8 6.5 7.5 6.5 6z" fill="currentColor"/><path d="M3 14.5h12v1.5H3z" fill="currentColor"/>`,
	pattern_stamp: `<path d="M6.5 2.5h5v3.5c0 1.5-1.5 2-1.5 3.5h4.5v3h-11v-3H8C8 8 6.5 7.5 6.5 6z" fill="currentColor"/><path d="M3 14.5h2v2H3zM7 14.5h2v2H7zM11 14.5h2v2h-2zM15 14.5h1v2h-1z" fill="currentColor"/>`,
	history_brush: `<path d="M15.6 1.8c.5.5-4.8 7.6-6.6 9.2l-1.7-1.7C8.9 7.5 15.1 1.3 15.6 1.8z" fill="currentColor"/><path d="M6.6 10c-1.7 0-3 1-3.2 2.8-.2 1.6-.9 2.3-2.1 2.8 2.7 1.3 6.6.6 7.2-2.2.2-1-.3-2.4-1.9-3.4z" fill="currentColor"/><path d="M2.5 7.5A5 5 0 0 1 9.5 2.6M2.5 7.5V4.5M2.5 7.5h3" ${S}/>`,
	art_history_brush: `<path d="M15.6 1.8c.5.5-4.8 7.6-6.6 9.2l-1.7-1.7C8.9 7.5 15.1 1.3 15.6 1.8z" fill="currentColor"/><path d="M6.6 10c-1.7 0-3 1-3.2 2.8-.2 1.6-.9 2.3-2.1 2.8 2.7 1.3 6.6.6 7.2-2.2.2-1-.3-2.4-1.9-3.4z" fill="currentColor"/><path d="M2 6c1-3 4-4 6-2.5S6 7 4.5 5.5" ${S}/>`,
	eraser: `<path d="M10.5 2.5l5 5-7 7H5L2.5 12z" ${S}/><path d="M6 7l5 5" ${S}/><path d="M10.5 2.5l5 5-4.5 4.5-5-5z" fill="currentColor"/><path d="M8.5 16h7.5" ${S}/>`,
	background_eraser: `<path d="M10.5 2.5l5 5-7 7H5L2.5 12z" ${S}/><path d="M10.5 2.5l5 5-4.5 4.5-5-5z" fill="currentColor"/><path d="M2 4.5l3-3M1.5 1.5l3 3" ${S}/>`,
	magic_eraser: `<path d="M10.5 4.5l4 4-6 6H5.5l-2.5-2.5z" ${S}/><path d="M10.5 4.5l4 4-3.5 3.5-4-4z" fill="currentColor"/><path d="M3.5 1v3M2 2.5h3M15.5 13v3M14 14.5h3" ${S}/>`,
	gradient: `<defs><linearGradient id="psgr" x1="0" x2="1"><stop offset="0" stop-color="currentColor" stop-opacity="1"/><stop offset="1" stop-color="currentColor" stop-opacity="0.08"/></linearGradient></defs><rect x="2" y="4" width="14" height="10" fill="url(#psgr)" stroke="currentColor" stroke-width="1"/>`,
	paint_bucket: `<path d="M8 2.5l6.5 6.5-5.5 5.5L2.5 8z" ${S}/><path d="M2.5 8h12" ${S}/><path d="M2.5 8l6.5 6.5 5.5-5.5z" fill="currentColor"/><path d="M15.8 11.5c.9 1.4 1.4 2.3 1.4 3a1.4 1.4 0 0 1-2.8 0c0-.7.5-1.6 1.4-3z" fill="currentColor"/><path d="M8 2.5L6 .8" ${S}/>`,
	material_drop: `<path d="M9 2.5l5 5-4 4-5-5z" fill="currentColor"/><path d="M15.5 10c.8 1.2 1.2 2 1.2 2.6a1.2 1.2 0 0 1-2.4 0c0-.6.4-1.4 1.2-2.6z" fill="currentColor"/><path d="M1.5 12.5l3-1.5 3 1.5v3l-3 1.5-3-1.5zM1.5 12.5l3 1.5 3-1.5M4.5 14v3" ${S}/>`,
	blur: `<path d="M9 2c2.5 3.6 4.5 6.2 4.5 8.8a4.5 4.5 0 0 1-9 0C4.5 8.2 6.5 5.6 9 2z" fill="currentColor"/>`,
	sharpen: `<path d="M9 1.5l4.5 15h-9z" fill="currentColor"/>`,
	smudge: `<path d="M7 16.5V9.5L4.5 7.8c-.8-.5-.5-1.8.5-1.6L7 7V2.8a1 1 0 0 1 2 0V7l.1-1.6a1 1 0 0 1 1.9.2V7.5l.2-1a1 1 0 0 1 1.9.4V8l.2-.5a.9.9 0 0 1 1.7.5L13.5 13l-1 3.5z" ${S}/>`,
	dodge: `<circle cx="11" cy="6.5" r="4.5" fill="currentColor"/><path d="M8 9.5L2.5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
	burn: `<path d="M5.5 16.5V10L3 8.2c-.8-.6-.4-1.8.6-1.6L5.5 7.5V4a1 1 0 0 1 2 0v4" ${S}/><path d="M7.5 7.5c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5-2 4.5-4.5 4.5c-1.3 0-2.6-.5-3.4-1.4" ${S}/><path d="M7.5 9.5v3.5l-2 3.5" ${S}/>`,
	sponge: `<path d="M3.5 6.5c0-2.5 2.5-4 5.5-4s5.5 1.5 5.5 4v6c0 2-2.5 3-5.5 3s-5.5-1-5.5-3z" fill="currentColor"/><circle cx="7" cy="7" r=".9" fill="#535353"/><circle cx="10.5" cy="9" r="1.1" fill="#535353"/><circle cx="7.5" cy="11.5" r=".8" fill="#535353"/><circle cx="11" cy="5.5" r=".7" fill="#535353"/>`,
	pen: `<path d="M9 1.5l4.5 7-2.5 5.5H7L4.5 8.5z" fill="currentColor"/><path d="M9 1.5v6" stroke="#535353" stroke-width="1"/><circle cx="9" cy="8.3" r="1" fill="#535353"/><path d="M6.5 15.5h5v1.5h-5z" fill="currentColor"/>`,
	freeform_pen: `<path d="M10 1.5l4 6.2-2.2 4.8H8.2L6 7.7z" fill="currentColor"/><path d="M10 1.5v5.4" stroke="#535353" stroke-width="1"/><path d="M1.5 16c2-3 3-1 5-3" ${S}/>`,
	add_anchor: `<path d="M10 1.5l4 6.2-2.2 4.8H8.2L6 7.7z" fill="currentColor"/><path d="M10 1.5v5.4" stroke="#535353" stroke-width="1"/><path d="M1.5 14h5M4 11.5v5" ${S} stroke-width="1.5"/>`,
	delete_anchor: `<path d="M10 1.5l4 6.2-2.2 4.8H8.2L6 7.7z" fill="currentColor"/><path d="M10 1.5v5.4" stroke="#535353" stroke-width="1"/><path d="M1.5 14h5" ${S} stroke-width="1.5"/>`,
	convert_point: `<path d="M2 15.5L9 3l7 12.5" ${S} stroke-width="1.5"/><rect x="7.8" y="1.8" width="2.4" height="2.4" fill="currentColor"/>`,
	type: `<path d="M3 2.5h12v3h-1l-.6-1.6H10V14l1.8.6v1H6.2v-1L8 14V3.9H4.6L4 5.5H3z" fill="currentColor"/>`,
	vertical_type: `<path d="M2 2.5h9v2.3h-.8l-.4-1.1H7.3V12l1.3.5v.8H4.4v-.8L5.7 12V3.7H3.2l-.4 1.1H2z" fill="currentColor"/><path d="M14.5 3v12M14.5 15l-1.8-2M14.5 15l1.8-2" ${S}/>`,
	type_mask: `<path d="M3 2.5h12v3h-1l-.6-1.6H10V14l1.8.6v1H6.2v-1L8 14V3.9H4.6L4 5.5H3z" ${D} stroke-width="1"/>`,
	vertical_type_mask: `<path d="M2 2.5h9v2.3h-.8l-.4-1.1H7.3V12l1.3.5v.8H4.4v-.8L5.7 12V3.7H3.2l-.4 1.1H2z" ${D} stroke-width="1"/><path d="M14.5 3v12M14.5 15l-1.8-2M14.5 15l1.8-2" ${S}/>`,
	path_selection: `<path d="M5 1.5v13.5l3.3-3.2 2.4 5 2-.9-2.4-5h4.5z" fill="currentColor"/>`,
	direct_selection: `<path d="M5 1.5v13.5l3.3-3.2 2.4 5 2-.9-2.4-5h4.5z" ${S}/>`,
	rectangle: `<rect x="2.5" y="4" width="13" height="10" fill="currentColor"/>`,
	rounded_rectangle: `<rect x="2.5" y="4" width="13" height="10" rx="3" fill="currentColor"/>`,
	ellipse: `<ellipse cx="9" cy="9" rx="6.5" ry="5.5" fill="currentColor"/>`,
	polygon: `<path d="M9 2l6.5 4.7-2.5 7.8H5L2.5 6.7z" fill="currentColor"/>`,
	line: `<path d="M2.5 15.5l13-13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
	custom_shape: `<path d="M9 3.2c1.5-2.5 6.5-2.2 6.5 2 0 3.8-4.5 6.8-6.5 9.8-2-3-6.5-6-6.5-9.8 0-4.2 5-4.5 6.5-2z" fill="currentColor"/>`,
	hand: `<path d="M6 16.5c-1-1.5-3.5-4.5-4-5.5s.5-2 1.5-1.2L5.5 11.5V4a1 1 0 0 1 2 0v5V2.5a1 1 0 0 1 2 0V9V3.5a1 1 0 0 1 2 0V9.5V5a1 1 0 0 1 2 0v6.5c0 2.5-1 4-1.5 5z" ${S}/>`,
	rotate_view: `<path d="M6 16.5c-1-1.5-3-4-3.5-5s.5-1.8 1.4-1L5.5 12V6a.9.9 0 0 1 1.8 0v4V4.8a.9.9 0 0 1 1.8 0V10V5.6a.9.9 0 0 1 1.8 0V10.5V7a.9.9 0 0 1 1.8 0v5c0 2-1 3.5-1.5 4.5z" ${S}/><path d="M11 1.5a5 5 0 0 1 5.5 4.5M16.5 6l-.2-2.4M16.5 6l-2.2-.8" ${S}/>`,
	zoom: `<circle cx="7.5" cy="7.5" r="5" ${S} stroke-width="1.5"/><path d="M11.2 11.2l5 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`,
};

const groups = [
	{ members: [
		{ id: 'move', name: 'Move Tool', key: 'V', tool: 'select', icon: I.move },
	]},
	{ members: [
		{ id: 'rect_marquee', name: 'Rectangular Marquee Tool', key: 'M', tool: 'ps_select', preset: { mode: 'rect' }, icon: I.rect_marquee },
		{ id: 'ellipse_marquee', name: 'Elliptical Marquee Tool', key: 'M', tool: 'ps_select', preset: { mode: 'ellipse' }, icon: I.ellipse_marquee },
		{ id: 'row_marquee', name: 'Single Row Marquee Tool', key: '', tool: 'ps_select', preset: { mode: 'row' }, icon: I.row_marquee },
		{ id: 'col_marquee', name: 'Single Column Marquee Tool', key: '', tool: 'ps_select', preset: { mode: 'col' }, icon: I.col_marquee },
	]},
	{ members: [
		{ id: 'lasso', name: 'Lasso Tool', key: 'L', tool: 'ps_select', preset: { mode: 'lasso' }, icon: I.lasso },
		{ id: 'polygon_lasso', name: 'Polygonal Lasso Tool', key: 'L', tool: 'ps_select', preset: { mode: 'polygon' }, icon: I.polygon_lasso },
		{ id: 'magnetic_lasso', name: 'Magnetic Lasso Tool', key: 'L', tool: 'ps_select', preset: { mode: 'magnetic' }, icon: I.magnetic_lasso },
	]},
	{ members: [
		{ id: 'quick_selection', name: 'Quick Selection Tool', key: 'W', tool: 'ps_select', preset: { mode: 'quick' }, icon: I.quick_selection },
		{ id: 'magic_wand', name: 'Magic Wand Tool', key: 'W', tool: 'ps_select', preset: { mode: 'wand' }, icon: I.magic_wand },
	]},
	{ separator: true, members: [
		{ id: 'crop', name: 'Crop Tool', key: 'C', tool: 'crop', icon: I.crop },
		{ id: 'perspective_crop', name: 'Perspective Crop Tool', key: 'C', tool: 'ps_pcrop', icon: I.perspective_crop },
		{ id: 'slice', name: 'Slice Tool', key: 'C', tool: null, icon: I.slice },
		{ id: 'slice_select', name: 'Slice Select Tool', key: 'C', tool: null, icon: I.slice_select },
	]},
	{ members: [
		{ id: 'eyedropper', name: 'Eyedropper Tool', key: 'I', tool: 'pick_color', icon: I.eyedropper },
		{ id: 'material_eyedropper', name: '3D Material Eyedropper Tool', key: 'I', tool: null, icon: I.material_eyedropper },
		{ id: 'color_sampler', name: 'Color Sampler Tool', key: 'I', tool: 'ps_measure', preset: { mode: 'sampler' }, icon: I.color_sampler },
		{ id: 'ruler', name: 'Ruler Tool', key: 'I', tool: 'ps_measure', preset: { mode: 'ruler' }, icon: I.ruler },
		{ id: 'note', name: 'Note Tool', key: 'I', tool: 'ps_measure', preset: { mode: 'note' }, icon: I.note },
		{ id: 'count', name: 'Count Tool', key: 'I', tool: 'ps_measure', preset: { mode: 'count' }, icon: I.count },
	]},
	{ separator: true, members: [
		{ id: 'spot_healing', name: 'Spot Healing Brush Tool', key: 'J', tool: 'retouch', preset: { mode: 'spot_healing' }, icon: I.spot_healing },
		{ id: 'healing', name: 'Healing Brush Tool', key: 'J', tool: 'retouch', preset: { mode: 'healing' }, icon: I.healing },
		{ id: 'patch', name: 'Patch Tool', key: 'J', tool: 'ps_patch', preset: { mode: 'patch' }, icon: I.patch },
		{ id: 'content_aware_move', name: 'Content-Aware Move Tool', key: 'J', tool: 'ps_patch', preset: { mode: 'cam' }, icon: I.content_aware_move },
		{ id: 'red_eye', name: 'Red Eye Tool', key: 'J', tool: 'retouch', preset: { mode: 'red_eye' }, icon: I.red_eye },
	]},
	{ members: [
		{ id: 'brush', name: 'Brush Tool', key: 'B', tool: 'brush', icon: I.brush },
		{ id: 'pencil', name: 'Pencil Tool', key: 'B', tool: 'pencil', icon: I.pencil },
		{ id: 'color_replacement', name: 'Color Replacement Tool', key: 'B', tool: 'retouch', preset: { mode: 'color_replace' }, icon: I.color_replacement },
		{ id: 'mixer_brush', name: 'Mixer Brush Tool', key: 'B', tool: 'retouch', preset: { mode: 'mixer' }, icon: I.mixer_brush },
	]},
	{ members: [
		{ id: 'clone_stamp', name: 'Clone Stamp Tool', key: 'S', tool: 'retouch', preset: { mode: 'clone' }, icon: I.clone_stamp },
		{ id: 'pattern_stamp', name: 'Pattern Stamp Tool', key: 'S', tool: 'retouch', preset: { mode: 'pattern_stamp' }, icon: I.pattern_stamp },
	]},
	{ members: [
		{ id: 'history_brush', name: 'History Brush Tool', key: 'Y', tool: 'retouch', preset: { mode: 'history' }, icon: I.history_brush },
		{ id: 'art_history_brush', name: 'Art History Brush Tool', key: 'Y', tool: 'retouch', preset: { mode: 'art_history', tolerance: 0 }, icon: I.art_history_brush },
	]},
	{ members: [
		{ id: 'eraser', name: 'Eraser Tool', key: 'E', tool: 'retouch', preset: { mode: 'erase' }, icon: I.eraser },
		{ id: 'background_eraser', name: 'Background Eraser Tool', key: 'E', tool: 'retouch', preset: { mode: 'bg_erase', tolerance: 50, limits: 'Contiguous', sampling: 'Continuous' }, icon: I.background_eraser },
		{ id: 'magic_eraser', name: 'Magic Eraser Tool', key: 'E', tool: 'magic_erase', icon: I.magic_eraser },
	]},
	{ members: [
		{ id: 'gradient', name: 'Gradient Tool', key: 'G', tool: 'gradient', icon: I.gradient },
		{ id: 'paint_bucket', name: 'Paint Bucket Tool', key: 'G', tool: 'fill', icon: I.paint_bucket },
		{ id: 'material_drop', name: '3D Material Drop Tool', key: 'G', tool: null, icon: I.material_drop },
	]},
	{ members: [
		{ id: 'blur', name: 'Blur Tool', key: '', tool: 'blur', icon: I.blur },
		{ id: 'sharpen', name: 'Sharpen Tool', key: '', tool: 'sharpen', icon: I.sharpen },
		{ id: 'smudge', name: 'Smudge Tool', key: '', tool: 'retouch', preset: { mode: 'smudge' }, icon: I.smudge },
	]},
	{ members: [
		{ id: 'dodge', name: 'Dodge Tool', key: 'O', tool: 'dodge_burn', preset: { mode: 'dodge' }, icon: I.dodge },
		{ id: 'burn', name: 'Burn Tool', key: 'O', tool: 'dodge_burn', preset: { mode: 'burn' }, icon: I.burn },
		{ id: 'sponge', name: 'Sponge Tool', key: 'O', tool: 'desaturate', icon: I.sponge },
	]},
	{ separator: true, members: [
		{ id: 'pen', name: 'Pen Tool', key: 'P', tool: 'ps_pen', preset: { mode: 'pen' }, icon: I.pen },
		{ id: 'freeform_pen', name: 'Freeform Pen Tool', key: 'P', tool: 'ps_pen', preset: { mode: 'freeform' }, icon: I.freeform_pen },
		{ id: 'add_anchor', name: 'Add Anchor Point Tool', key: '', tool: 'ps_pen', preset: { mode: 'add' }, icon: I.add_anchor },
		{ id: 'delete_anchor', name: 'Delete Anchor Point Tool', key: '', tool: 'ps_pen', preset: { mode: 'delete' }, icon: I.delete_anchor },
		{ id: 'convert_point', name: 'Convert Point Tool', key: '', tool: 'ps_pen', preset: { mode: 'convert' }, icon: I.convert_point },
	]},
	{ members: [
		{ id: 'type', name: 'Horizontal Type Tool', key: 'T', tool: 'text', preset: { vertical: false, mask: false }, icon: I.type },
		{ id: 'vertical_type', name: 'Vertical Type Tool', key: 'T', tool: 'text', preset: { vertical: true, mask: false }, icon: I.vertical_type },
		{ id: 'type_mask', name: 'Horizontal Type Mask Tool', key: 'T', tool: 'text', preset: { vertical: false, mask: true }, icon: I.type_mask },
		{ id: 'vertical_type_mask', name: 'Vertical Type Mask Tool', key: 'T', tool: 'text', preset: { vertical: true, mask: true }, icon: I.vertical_type_mask },
	]},
	{ members: [
		{ id: 'path_selection', name: 'Path Selection Tool', key: 'A', tool: 'ps_path_select', preset: { mode: 'path' }, icon: I.path_selection },
		{ id: 'direct_selection', name: 'Direct Selection Tool', key: 'A', tool: 'ps_path_select', preset: { mode: 'direct' }, icon: I.direct_selection },
	]},
	{ members: [
		{ id: 'rectangle', name: 'Rectangle Tool', key: 'U', tool: 'rectangle', preset: { radius: 0, custom: '' }, icon: I.rectangle },
		{ id: 'rounded_rectangle', name: 'Rounded Rectangle Tool', key: 'U', tool: 'rectangle', preset: { radius: 10, custom: '' }, icon: I.rounded_rectangle },
		{ id: 'ellipse', name: 'Ellipse Tool', key: 'U', tool: 'ellipse', icon: I.ellipse },
		{ id: 'polygon', name: 'Polygon Tool', key: 'U', tool: 'pentagon', icon: I.polygon },
		{ id: 'line', name: 'Line Tool', key: 'U', tool: 'line', icon: I.line },
		{ id: 'custom_shape', name: 'Custom Shape Tool', key: 'U', tool: 'rectangle', preset: { radius: 0, custom: 'Heart' }, icon: I.custom_shape },
	]},
	{ separator: true, members: [
		{ id: 'hand', name: 'Hand Tool', key: 'H', tool: 'hand', icon: I.hand },
		{ id: 'rotate_view', name: 'Rotate View Tool', key: 'R', tool: 'ps_rotate_view', icon: I.rotate_view },
	]},
	{ members: [
		{ id: 'zoom', name: 'Zoom Tool', key: 'Z', tool: 'zoom', icon: I.zoom },
	]},
];

export { groups, I as tool_icons };
