/*
 * pshot - Photoshop CS6 options bar.
 *
 * Each CS6 tool gets its options in CS6 order. A control bound to a miniPaint
 * tool attribute (bind) edits it; a control without bind is a CS6 option pshot
 * doesn't have yet and is shown greyed out. Tools without a layout here fall
 * back to miniPaint's generic attribute renderer.
 */

import app from './../app.js';
import { names as custom_shape_names } from './custom-shapes.js';
import config from './../config.js';
import { tool_icons } from './tools-def.js';
import Patterns from './patterns.js';
import { show_popup_menu } from './popup-menu.js';

function measure_tool() {
	return app.GUI.GUI_tools.tools_modules.ps_measure.object;
}

//Type > Anti-Alias names; the options bar shows the text layer's method
const AA_NAMES = ['None', 'Sharp', 'Crisp', 'Strong', 'Smooth'];
function aa_name() {
	var m = app.GUI.Ps_workspace.Text_aa.current();
	return m.charAt(0).toUpperCase() + m.substr(1);
}

function measure_text(key) {
	var m = measure_tool().measure();
	var labels = { x: 'X:', y: 'Y:', w: 'W:', h: 'H:', a: 'A:', l: 'L1:' };
	if (!m) return labels[key];
	if (key == 'a') return 'A: ' + m.a.toFixed(1) + '°';
	if (key == 'l') return 'L1: ' + m.l.toFixed(2);
	return labels[key] + ' ' + m[key];
}

function paths() {
	return app.GUI.Ps_workspace.Paths;
}

//Type tool alignment buttons: act on the active type layer
function text_align(align) {
	var layer = () => (config.layer && config.layer.type == 'text' ? config.layer : null);
	return {
		is_pressed: () => (layer() && layer().params ? layer().params.halign || 'left' : 'left') == align,
		action: () => {
			var l = layer();
			if (!l) return;
			app.State.do_action(new app.Actions.Bundle_action('paragraph', 'Paragraph Alignment', [
				new app.Actions.Update_layer_action(l.id, { params: Object.assign({}, l.params, { halign: align }) }),
			])).then(() => app.GUI.GUI_tools.show_action_attributes());
		},
	};
}

const MODES = ['Normal', 'Dissolve', 'Behind', 'Clear', 'Darken', 'Multiply', 'Color Burn', 'Linear Burn', 'Darker Color',
	'Lighten', 'Screen', 'Color Dodge', 'Linear Dodge (Add)', 'Lighter Color', 'Overlay', 'Soft Light', 'Hard Light',
	'Vivid Light', 'Linear Light', 'Pin Light', 'Hard Mix', 'Difference', 'Exclusion', 'Subtract', 'Divide',
	'Hue', 'Saturation', 'Color', 'Luminosity'];

const SVG = (body, size = 16) => '<svg viewBox="0 0 18 18" width="' + size + '" height="' + size + '">' + body + '</svg>';
const ST = 'fill="none" stroke="currentColor" stroke-width="1.2"';

const IC = {
	sample_cont: SVG(`<path d="M3 15l8-8M11 7l2-4 2 2-4 2" ${ST}/><path d="M2 5h3M3.5 3.5v3" ${ST}/>`),
	sample_once: SVG(`<path d="M3 15l8-8M11 7l2-4 2 2-4 2" ${ST}/><path d="M2 3.5h3" ${ST}/>`),
	sample_bg: SVG(`<rect x="2" y="2" width="8" height="8" fill="currentColor"/><rect x="7" y="7" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.2"/>`),
	sel_new: SVG(`<rect x="3" y="4" width="12" height="10" fill="currentColor"/>`),
	sel_add: SVG(`<rect x="2" y="3" width="9" height="8" fill="currentColor"/><rect x="7" y="7" width="9" height="8" fill="currentColor"/>`),
	sel_sub: SVG(`<rect x="2" y="3" width="9" height="8" fill="currentColor"/><rect x="7" y="7" width="9" height="8" ${ST}/>`),
	sel_int: SVG(`<rect x="2" y="3" width="9" height="8" ${ST}/><rect x="7" y="7" width="9" height="8" ${ST}/><rect x="7" y="7" width="4" height="4" fill="currentColor"/>`),
	brush_panel: SVG(`<rect x="2" y="2" width="14" height="14" ${ST}/><path d="M12 4c.4.4-2.6 4.4-3.6 5.2l-1-1C8.3 7.3 11.6 3.6 12 4zM7 9.2c-1 0-1.6.6-1.7 1.6-.1.9-.5 1.3-1.2 1.6 1.5.7 3.6.3 3.9-1.2.1-.6-.1-1.3-1-2z" fill="currentColor"/>`),
	pressure_op: SVG(`<path d="M9 2l2 6H7z" fill="currentColor"/><path d="M4 16c2-4 8-4 10 0" ${ST}/>`),
	airbrush: SVG(`<path d="M3 13l7-7 2 2-7 7H3z" ${ST}/><path d="M12 3h3M12 5.5h4M12 8h3" ${ST}/>`),
	pressure_size: SVG(`<circle cx="9" cy="7" r="4" ${ST}/><path d="M4 16c2-3 8-3 10 0" ${ST}/>`),
	align_t: SVG(`<path d="M2 2.5h14" ${ST}/><rect x="4" y="4" width="4" height="10" fill="currentColor"/><rect x="10" y="4" width="4" height="6" fill="currentColor"/>`),
	align_vc: SVG(`<path d="M2 9h14" ${ST}/><rect x="4" y="3" width="4" height="12" fill="currentColor"/><rect x="10" y="5.5" width="4" height="7" fill="currentColor"/>`),
	align_b: SVG(`<path d="M2 15.5h14" ${ST}/><rect x="4" y="4" width="4" height="10" fill="currentColor"/><rect x="10" y="8" width="4" height="6" fill="currentColor"/>`),
	align_l: SVG(`<path d="M2.5 2v14" ${ST}/><rect x="4" y="4" width="10" height="4" fill="currentColor"/><rect x="4" y="10" width="6" height="4" fill="currentColor"/>`),
	align_hc: SVG(`<path d="M9 2v14" ${ST}/><rect x="3" y="4" width="12" height="4" fill="currentColor"/><rect x="5.5" y="10" width="7" height="4" fill="currentColor"/>`),
	align_r: SVG(`<path d="M15.5 2v14" ${ST}/><rect x="4" y="4" width="10" height="4" fill="currentColor"/><rect x="8" y="10" width="6" height="4" fill="currentColor"/>`),
	dist: SVG(`<path d="M2 3h14M2 9h14M2 15h14" ${ST}/>`),
	auto_align: SVG(`<rect x="2" y="2" width="9" height="9" ${ST}/><rect x="7" y="7" width="9" height="9" ${ST}/>`),
	grad_linear: SVG(`<defs><linearGradient id="og1"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect x="2" y="2" width="14" height="14" fill="url(#og1)"/>`),
	grad_radial: SVG(`<defs><radialGradient id="og2"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></radialGradient></defs><rect x="2" y="2" width="14" height="14" fill="url(#og2)"/>`),
	grad_angle: SVG(`<rect x="2" y="2" width="14" height="14" fill="#888"/><path d="M9 9L16 2v14z" fill="#fff"/><path d="M9 9L2 2v14z" fill="#000"/>`),
	grad_reflected: SVG(`<defs><linearGradient id="og4"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect x="2" y="2" width="14" height="14" fill="url(#og4)"/>`),
	grad_diamond: SVG(`<rect x="2" y="2" width="14" height="14" fill="#fff"/><path d="M9 3l6 6-6 6-6-6z" fill="#000"/>`),
	zoom_in: SVG(`<circle cx="7.5" cy="7.5" r="5" ${ST}/><path d="M11 11l5 5M5 7.5h5M7.5 5v5" ${ST}/>`),
	zoom_out: SVG(`<circle cx="7.5" cy="7.5" r="5" ${ST}/><path d="M11 11l5 5M5 7.5h5" ${ST}/>`),
	align_text_l: SVG(`<path d="M2 4h14M2 7.5h9M2 11h14M2 14.5h9" ${ST}/>`),
	align_text_c: SVG(`<path d="M2 4h14M4.5 7.5h9M2 11h14M4.5 14.5h9" ${ST}/>`),
	align_text_r: SVG(`<path d="M2 4h14M7 7.5h9M2 11h14M7 14.5h9" ${ST}/>`),
	warp: SVG(`<path d="M2 12c3-6 5 2 7-4s5-2 7-4" ${ST}/><text x="3" y="17" font-size="7" fill="currentColor" font-family="Times New Roman">T</text>`),
	type_orient: SVG(`<text x="2" y="12" font-size="10" fill="currentColor" font-family="Times New Roman">T</text><path d="M12 4v10M12 14l-2-2M12 14l2-2" ${ST}/>`),
	gear: SVG(`<circle cx="9" cy="9" r="2.5" ${ST}/><path d="M9 1.5v3M9 13.5v3M1.5 9h3M13.5 9h3M3.7 3.7l2.1 2.1M12.2 12.2l2.1 2.1M3.7 14.3l2.1-2.1M12.2 5.8l2.1-2.1" ${ST}/>`),
	clone_source: SVG(`<path d="M5 2.5h4v3c0 1.2-1.2 1.6-1.2 2.8h3.7v2.5H2.5V8.3h3.7C6.2 7.1 5 6.7 5 5.5z" fill="currentColor"/><path d="M10.5 12h5v3.5h-5z" ${ST}/>`),
	path_ops: SVG(`<rect x="2" y="2" width="9" height="9" fill="currentColor"/><rect x="7" y="7" width="9" height="9" ${ST}/>`),
};

/** layouts keyed by CS6 tool id (tools-def.js) */
const SELECTION_OPS = { type: 'icons', items: [
	{ icon: IC.sel_new, title: 'New selection', bind: 'op', bind_value: 'new' },
	{ icon: IC.sel_add, title: 'Add to selection', bind: 'op', bind_value: 'add' },
	{ icon: IC.sel_sub, title: 'Subtract from selection', bind: 'op', bind_value: 'subtract' },
	{ icon: IC.sel_int, title: 'Intersect with selection', bind: 'op', bind_value: 'intersect' },
] };
const LASSO_LAYOUT = [
	SELECTION_OPS,
	{ type: 'sep' },
	{ type: 'num', label: 'Feather:', bind: 'feather', unit: 'px', width: 40 },
	{ type: 'check', label: 'Anti-alias', bind: 'anti_alias' },
	{ type: 'sep' },
	{ type: 'button', text: 'Refine Edge...' },
];
const PAINT_MODES = ['Normal', 'Behind', 'Clear', 'Darken', 'Multiply', 'Color Burn', 'Lighten', 'Screen', 'Color Dodge',
	'Linear Dodge (Add)', 'Overlay', 'Soft Light', 'Hard Light', 'Difference', 'Exclusion', 'Hue', 'Saturation', 'Color', 'Luminosity'];
const MODE_MAP = {};
for (const m of PAINT_MODES) MODE_MAP[m] = m;
const BRUSH_COMMON = [
	{ type: 'brush', bind: 'size' },
	{ type: 'icon', icon: IC.brush_panel, title: 'Toggle the Brush panel', action: () => app.GUI.Ps_workspace.toggle_panel('brush') },
	{ type: 'sep' },
	{ type: 'select', label: 'Mode:', values: MODES, bind: 'blend', map: MODE_MAP },
	{ type: 'pct', label: 'Opacity:', value: 100, bind: 'opacity' },
	{ type: 'icon', icon: IC.pressure_op, title: 'Always use Pressure for Opacity' },
	{ type: 'pct', label: 'Flow:', value: 100, bind: 'flow' },
	{ type: 'icon', icon: IC.airbrush, title: 'Enable airbrush-style build-up effects' },
	{ type: 'icon', icon: IC.pressure_size, title: 'Always use Pressure for Size', bind: 'pressure' },
];
const ZOOM_BUTTONS = [
	{ type: 'button', text: 'Actual Pixels', action: () => app.GUI.modules['view/zoom'].original() },
	{ type: 'button', text: 'Fit Screen', action: () => app.GUI.modules['view/zoom'].auto() },
	{ type: 'button', text: 'Fill Screen', action: () => fill_screen() },
	{ type: 'button', text: 'Print Size', action: () => app.GUI.Ps_workspace.Extras.print_size() },
];
const SHAPE_COMMON = (extra) => [
	{ type: 'select', values: ['Shape', 'Path', 'Pixels'], bind: 'shape_mode', map: { Shape: 'Shape', Path: 'Path', Pixels: 'Pixels' } },
	{ type: 'sep' },
	{ type: 'swatch', label: 'Fill:', bind: 'fill_color', toggle: 'fill' },
	{ type: 'swatch', label: 'Stroke:', bind: 'border_color', toggle: 'border' },
	{ type: 'num', bind: 'border_size', unit: 'pt', width: 46 },
	{ type: 'select', values: ['———'], value: '———' },
	{ type: 'sep' },
	{ type: 'num', label: 'W:', unit: 'px', width: 50 },
	{ type: 'num', label: 'H:', unit: 'px', width: 50 },
	{ type: 'icon', icon: IC.path_ops, title: 'Path operations', action: (e) => shape_ops_menu(e.currentTarget) },
	{ type: 'icon', icon: IC.gear, title: 'Set additional shape and path options' },
	...extra,
];

//CS6 Mixer Brush presets: [wet, load, mix]
const MIXER_PRESETS = {
	'Custom': null, 'Dry': [0, 50, 0], 'Dry, Light Load': [0, 1, 0], 'Dry, Heavy Load': [0, 100, 0], 'Moist': [10, 5, 50], 'Moist, Light Mix': [10, 5, 20],
	'Moist, Heavy Mix': [10, 5, 90], 'Wet': [50, 50, 50], 'Wet, Light Mix': [50, 50, 20], 'Wet, Heavy Mix': [50, 50, 90], 'Very Wet': [100, 50, 50],
	'Very Wet, Light Mix': [100, 50, 20], 'Very Wet, Heavy Mix': [100, 50, 90],
};

const ART_STYLES = ['Tight Short', 'Tight Medium', 'Tight Long', 'Loose Medium', 'Loose Long', 'Dab', 'Tight Curl', 'Tight Curl Long', 'Loose Curl', 'Loose Curl Long'];

const LAYOUTS = {
	move: [
		{ type: 'check', label: 'Auto-Select:', bind: 'auto_select' },
		{ type: 'select', values: ['Layer', 'Group'], value: 'Layer', disabled_values: ['Group'] },
		{ type: 'check', label: 'Show Transform Controls', bind: 'show_transform' },
		{ type: 'sep' },
		{ type: 'icons', items: [
			{ icon: IC.align_t, title: 'Align top edges', action: () => run('align_top') },
			{ icon: IC.align_vc, title: 'Align vertical centers', action: () => run('align_vcenter') },
			{ icon: IC.align_b, title: 'Align bottom edges', action: () => run('align_bottom') },
			{ icon: IC.align_l, title: 'Align left edges', action: () => run('align_left') },
			{ icon: IC.align_hc, title: 'Align horizontal centers', action: () => run('align_hcenter') },
			{ icon: IC.align_r, title: 'Align right edges', action: () => run('align_right') },
		] },
		{ type: 'sep' },
		{ type: 'icons', items: [{ icon: IC.dist, title: 'Distribute top edges', action: () => run('distribute_top') }, { icon: IC.dist, title: 'Distribute vertical centers', action: () => run('distribute_vcenter') }, { icon: IC.dist, title: 'Distribute bottom edges', action: () => run('distribute_bottom') },
			{ icon: IC.dist, title: 'Distribute left edges', action: () => run('distribute_left') }, { icon: IC.dist, title: 'Distribute horizontal centers', action: () => run('distribute_hcenter') }, { icon: IC.dist, title: 'Distribute right edges', action: () => run('distribute_right') }] },
		{ type: 'icon', icon: IC.auto_align, title: 'Auto-Align Layers' },
		{ type: 'sep' },
		{ type: 'label', text: '3D Mode:', disabled: true },
	],
	rect_marquee: [
		SELECTION_OPS,
		{ type: 'sep' },
		{ type: 'num', label: 'Feather:', bind: 'feather', unit: 'px', width: 40 },
		{ type: 'check', label: 'Anti-alias', value: false, always_disabled: true },
		{ type: 'sep' },
		{ type: 'select', label: 'Style:', values: ['Normal', 'Fixed Ratio', 'Fixed Size'], value: 'Normal' },
		{ type: 'num', label: 'Width:', width: 46 },
		{ type: 'num', label: 'Height:', width: 46 },
		{ type: 'sep' },
		{ type: 'button', text: 'Refine Edge...' },
	],
	ellipse_marquee: [
		SELECTION_OPS,
		{ type: 'sep' },
		{ type: 'num', label: 'Feather:', bind: 'feather', unit: 'px', width: 40 },
		{ type: 'check', label: 'Anti-alias', bind: 'anti_alias' },
		{ type: 'sep' },
		{ type: 'select', label: 'Style:', values: ['Normal', 'Fixed Ratio', 'Fixed Size'], value: 'Normal' },
		{ type: 'num', label: 'Width:', width: 46 },
		{ type: 'num', label: 'Height:', width: 46 },
		{ type: 'sep' },
		{ type: 'button', text: 'Refine Edge...' },
	],
	row_marquee: [SELECTION_OPS, { type: 'sep' }, { type: 'num', label: 'Feather:', bind: 'feather', unit: 'px', width: 40 }],
	col_marquee: [SELECTION_OPS, { type: 'sep' }, { type: 'num', label: 'Feather:', bind: 'feather', unit: 'px', width: 40 }],
	lasso: LASSO_LAYOUT,
	polygon_lasso: LASSO_LAYOUT,
	magnetic_lasso: [
		SELECTION_OPS,
		{ type: 'sep' },
		{ type: 'num', label: 'Feather:', bind: 'feather', unit: 'px', width: 40 },
		{ type: 'check', label: 'Anti-alias', bind: 'anti_alias' },
		{ type: 'sep' },
		{ type: 'num', label: 'Width:', bind: 'width', unit: 'px', width: 40 },
		{ type: 'pct', label: 'Contrast:', bind: 'contrast' },
		{ type: 'num', label: 'Frequency:', bind: 'frequency', unit: '', width: 40 },
		{ type: 'icon', icon: IC.pressure_size, title: 'Use tablet pressure to change pen width' },
		{ type: 'sep' },
		{ type: 'button', text: 'Refine Edge...' },
	],
	quick_selection: [
		{ type: 'icons', items: [
			{ icon: IC.sel_new, title: 'New selection' },
			{ icon: IC.sel_add, title: 'Add to selection', active: true },
			{ icon: IC.sel_sub, title: 'Subtract from selection (Alt)' },
		] },
		{ type: 'brush', bind: 'brush' },
		{ type: 'sep' },
		{ type: 'check', label: 'Sample All Layers', bind: 'sample_all' },
		{ type: 'check', label: 'Auto-Enhance', value: false },
		{ type: 'sep' },
		{ type: 'button', text: 'Refine Edge...' },
	],
	magic_wand: [
		SELECTION_OPS,
		{ type: 'sep' },
		{ type: 'select', label: 'Sample Size:', values: ['Point Sample', '3 by 3 Average', '5 by 5 Average', '11 by 11 Average', '31 by 31 Average', '51 by 51 Average', '101 by 101 Average'], value: 'Point Sample' },
		{ type: 'num', label: 'Tolerance:', bind: 'tolerance', width: 40 },
		{ type: 'check', label: 'Anti-alias', bind: 'anti_alias' },
		{ type: 'check', label: 'Contiguous', bind: 'contiguous' },
		{ type: 'check', label: 'Sample All Layers', bind: 'sample_all' },
		{ type: 'sep' },
		{ type: 'button', text: 'Refine Edge...' },
	],
	crop: [
		{ type: 'select', values: ['Unconstrained', 'Original Ratio', '1 x 1 (Square)', '4 x 5 (8 x 10)', '8.5 x 11', '4 x 3', '5 x 7', '2 x 3 (4 x 6)', '16 x 9'], value: 'Unconstrained' },
		{ type: 'num', width: 46 },
		{ type: 'label', text: '⇄' },
		{ type: 'num', width: 46 },
		{ type: 'button', text: 'Clear' },
		{ type: 'sep' },
		{ type: 'button', text: 'Straighten' },
		{ type: 'select', label: 'View:', values: ['Rule of Thirds', 'Grid', 'Diagonal', 'Triangle', 'Golden Ratio', 'Golden Spiral'], value: 'Rule of Thirds' },
		{ type: 'icon', icon: IC.gear, title: 'Set additional Crop options' },
		{ type: 'sep' },
		{ type: 'check', label: 'Delete Cropped Pixels', value: true, always_disabled: true },
		{ type: 'sep' },
		{ type: 'icons', items: [
			{ icon: SVG('<path d="M4 9.5l3.5 3.5L14.5 5" fill="none" stroke="currentColor" stroke-width="1.8"/>'), title: 'Commit current crop operation (Enter)', action: () => app.GUI.GUI_tools.tools_modules.crop.object.on_params_update() },
			{ icon: SVG('<circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4.8 13.2l8.4-8.4" stroke="currentColor" stroke-width="1.5"/>'), title: 'Cancel current crop operation (Esc)', action: () => { const c = app.GUI.GUI_tools.tools_modules.crop.object; c.selection = { x: null, y: null, width: null, height: null }; config.need_render = true; } },
		] },
	],
	eyedropper: [
		{ type: 'select', label: 'Sample Size:', values: ['Point Sample', '3 by 3 Average', '5 by 5 Average', '11 by 11 Average', '31 by 31 Average', '51 by 51 Average', '101 by 101 Average'], value: 'Point Sample' },
		{ type: 'select', label: 'Sample:', values: ['Current Layer', 'Current & Below', 'All Layers', 'All Layers No Adjustments', 'Current & Below No Adjustments'],
			bind: 'global', map: { 'Current Layer': false, 'All Layers': true } },
		{ type: 'check', label: 'Show Sampling Ring', value: true, always_disabled: true },
	],
	brush: BRUSH_COMMON,
	pencil: [...BRUSH_COMMON.slice(0, 5), BRUSH_COMMON[8], { type: 'sep' }, { type: 'check', label: 'Auto Erase', value: false }],
	clone_stamp: [
		{ type: 'brush', bind: 'size' },
		{ type: 'icon', icon: IC.brush_panel, title: 'Toggle the Brush panel' },
		{ type: 'icon', icon: IC.clone_source, title: 'Toggle the Clone Source panel', action: () => app.GUI.Ps_workspace.toggle_panel('clone_source') },
		{ type: 'sep' },
		{ type: 'select', label: 'Mode:', values: MODES },
		{ type: 'pct', label: 'Opacity:', value: 100, bind: 'opacity' },
		{ type: 'pct', label: 'Flow:', value: 100 },
		{ type: 'icon', icon: IC.airbrush, title: 'Enable airbrush-style build-up effects' },
		{ type: 'sep' },
		{ type: 'check', label: 'Aligned', bind: 'aligned' },
		{ type: 'select', label: 'Sample:', values: ['Current Layer', 'Current & Below', 'All Layers'],
			bind: 'sample', map: { 'Current Layer': 'Current Layer', 'Current & Below': 'Current & Below', 'All Layers': 'All Layers' } },
	],
	eraser: [
		{ type: 'brush', bind: 'size' },
		{ type: 'icon', icon: IC.brush_panel, title: 'Toggle the Brush panel' },
		{ type: 'sep' },
		{ type: 'select', label: 'Mode:', values: ['Brush', 'Pencil', 'Block'], bind: 'circle', map: { 'Brush': true, 'Block': false } },
		{ type: 'pct', label: 'Opacity:', value: 100 },
		{ type: 'pct', label: 'Flow:', value: 100 },
		{ type: 'icon', icon: IC.airbrush, title: 'Enable airbrush-style build-up effects' },
		{ type: 'sep' },
		{ type: 'check', label: 'Erase to History', value: false },
	],
	magic_eraser: [
		{ type: 'num', label: 'Tolerance:', bind: 'power', width: 40 },
		{ type: 'check', label: 'Anti-alias', bind: 'anti_aliasing' },
		{ type: 'check', label: 'Contiguous', bind: 'contiguous' },
		{ type: 'check', label: 'Sample All Layers', value: false },
		{ type: 'sep' },
		{ type: 'pct', label: 'Opacity:', value: 100 },
	],
	gradient: [
		{ type: 'gradient' },
		{ type: 'sep' },
		{ type: 'icons', items: [
			{ icon: IC.grad_linear, title: 'Linear Gradient', bind: 'radial', bind_value: false },
			{ icon: IC.grad_radial, title: 'Radial Gradient', bind: 'radial', bind_value: true },
			{ icon: IC.grad_angle, title: 'Angle Gradient' },
			{ icon: IC.grad_reflected, title: 'Reflected Gradient' },
			{ icon: IC.grad_diamond, title: 'Diamond Gradient' },
		] },
		{ type: 'sep' },
		{ type: 'select', label: 'Mode:', values: MODES, bind: 'blend', map: MODE_MAP },
		{ type: 'pct', label: 'Opacity:', value: 100, bind: 'opacity' },
		{ type: 'check', label: 'Reverse', value: false },
		{ type: 'check', label: 'Dither', value: true },
		{ type: 'check', label: 'Transparency', value: true },
	],
	paint_bucket: [
		{ type: 'select', values: ['Foreground', 'Pattern'], value: 'Foreground', disabled_values: ['Pattern'] },
		{ type: 'sep' },
		{ type: 'select', label: 'Mode:', values: MODES },
		{ type: 'pct', label: 'Opacity:', value: 100 },
		{ type: 'num', label: 'Tolerance:', bind: 'power', width: 40 },
		{ type: 'check', label: 'Anti-alias', bind: 'anti_aliasing' },
		{ type: 'check', label: 'Contiguous', bind: 'contiguous' },
		{ type: 'check', label: 'All Layers', value: false },
	],
	blur: [
		{ type: 'brush', bind: 'size' },
		{ type: 'icon', icon: IC.brush_panel, title: 'Toggle the Brush panel' },
		{ type: 'sep' },
		{ type: 'select', label: 'Mode:', values: ['Normal', 'Darken', 'Lighten', 'Hue', 'Saturation', 'Color', 'Luminosity'] },
		{ type: 'num', label: 'Strength:', bind: 'strength', unit: '', width: 40 },
		{ type: 'check', label: 'Sample All Layers', value: false },
	],
	sharpen: [
		{ type: 'brush', bind: 'size' },
		{ type: 'icon', icon: IC.brush_panel, title: 'Toggle the Brush panel' },
		{ type: 'sep' },
		{ type: 'select', label: 'Mode:', values: ['Normal', 'Darken', 'Lighten', 'Hue', 'Saturation', 'Color', 'Luminosity'] },
		{ type: 'pct', label: 'Strength:', value: 50 },
		{ type: 'check', label: 'Sample All Layers', value: false },
		{ type: 'check', label: 'Protect Detail', value: true },
	],
	smudge: [
		{ type: 'brush', bind: 'size' },
		{ type: 'icon', icon: IC.brush_panel, title: 'Toggle the Brush panel' },
		{ type: 'sep' },
		{ type: 'select', label: 'Mode:', values: ['Normal', 'Darken', 'Lighten', 'Hue', 'Saturation', 'Color', 'Luminosity'] },
		{ type: 'pct', label: 'Strength:', bind: 'strength' },
		{ type: 'check', label: 'Sample All Layers', value: false },
		{ type: 'check', label: 'Finger Painting', value: false },
	],
	perspective_crop: [
		{ type: 'num', label: 'W:', width: 50, unit: '' },
		{ type: 'num', label: 'H:', width: 50, unit: '' },
		{ type: 'num', label: 'Resolution:', width: 50, unit: '' },
		{ type: 'select', values: ['pixels/inch', 'pixels/cm'], value: 'pixels/inch' },
		{ type: 'button', text: 'Front Image' },
		{ type: 'button', text: 'Clear' },
		{ type: 'sep' },
		{ type: 'check', label: 'Show Grid', value: true },
	],
	ruler: [
		{ type: 'readout', text: () => measure_text('x') },
		{ type: 'readout', text: () => measure_text('y') },
		{ type: 'readout', text: () => measure_text('w') },
		{ type: 'readout', text: () => measure_text('h') },
		{ type: 'readout', text: () => measure_text('a') },
		{ type: 'readout', text: () => measure_text('l') },
		{ type: 'readout', text: () => 'L2:' },
		{ type: 'check', label: 'Use Measurement Scale', value: false },
		{ type: 'sep' },
		{ type: 'button', text: 'Straighten Layer', action: () => measure_tool().straighten() },
		{ type: 'button', text: 'Clear', action: () => measure_tool().clear() },
	],
	color_sampler: [
		{ type: 'select', label: 'Sample Size:', values: ['Point Sample', '3 by 3 Average', '5 by 5 Average', '11 by 11 Average', '31 by 31 Average', '51 by 51 Average', '101 by 101 Average'], bind: 'sample_size',
			map: { 'Point Sample': '1', '3 by 3 Average': '3', '5 by 5 Average': '5', '11 by 11 Average': '11', '31 by 31 Average': '31', '51 by 51 Average': '51', '101 by 101 Average': '101' } },
		{ type: 'sep' },
		{ type: 'button', text: 'Clear', action: () => measure_tool().clear() },
	],
	note: [
		{ type: 'text', label: 'Author:', bind: 'note_author', width: 140 },
		{ type: 'swatch', label: 'Color:', bind: 'note_color' },
		{ type: 'button', text: 'Clear All', action: () => app.GUI.Ps_workspace.Notes.clear_all() },
		{ type: 'icon', icon: IC.brush_panel, title: 'Show or hide the Notes panel', action: () => app.GUI.Ps_workspace.toggle_panel('notes') },
	],
	count: [
		{ type: 'readout', text: () => 'Count: ' + measure_tool().counts.length },
		{ type: 'sep' },
		{ type: 'button', text: 'Clear', action: () => measure_tool().clear() },
	],
	pattern_stamp: [
		{ type: 'brush', bind: 'size' },
		{ type: 'icon', icon: IC.brush_panel, title: 'Toggle the Brush panel' },
		{ type: 'sep' },
		{ type: 'select', label: 'Mode:', values: MODES },
		{ type: 'pct', label: 'Opacity:', value: 100, bind: 'opacity' },
		{ type: 'pct', label: 'Flow:', value: 100 },
		{ type: 'icon', icon: IC.airbrush, title: 'Enable airbrush-style build-up effects' },
		{ type: 'sep' },
		{ type: 'pattern', bind: 'pattern' },
		{ type: 'check', label: 'Aligned', value: true },
		{ type: 'check', label: 'Impressionist', value: false },
	],
	background_eraser: [
		{ type: 'brush', bind: 'size' },
		{ type: 'sep' },
		{ type: 'icons', items: [
			{ icon: IC.sample_cont, title: 'Sampling: Continuous', bind: 'sampling', bind_value: 'Continuous' },
			{ icon: IC.sample_once, title: 'Sampling: Once', bind: 'sampling', bind_value: 'Once' },
			{ icon: IC.sample_bg, title: 'Sampling: Background Swatch', bind: 'sampling', bind_value: 'Background Swatch' },
		] },
		{ type: 'select', label: 'Limits:', values: ['Discontiguous', 'Contiguous', 'Find Edges'], bind: 'limits', map: { Discontiguous: 'Discontiguous', Contiguous: 'Contiguous', 'Find Edges': 'Contiguous' } },
		{ type: 'pct', label: 'Tolerance:', bind: 'tolerance' },
		{ type: 'check', label: 'Protect Foreground Color', bind: 'protect_fg' },
		{ type: 'icon', icon: IC.pressure_size, title: 'Always use Pressure for Size' },
	],
	color_replacement: [
		{ type: 'brush', bind: 'size' },
		{ type: 'sep' },
		{ type: 'select', label: 'Mode:', values: ['Hue', 'Saturation', 'Color', 'Luminosity'], bind: 'replace_mode', map: { Hue: 'Hue', Saturation: 'Saturation', Color: 'Color', Luminosity: 'Luminosity' } },
		{ type: 'sep' },
		{ type: 'icons', items: [
			{ icon: IC.sample_cont, title: 'Sampling: Continuous', bind: 'sampling', bind_value: 'Continuous' },
			{ icon: IC.sample_once, title: 'Sampling: Once', bind: 'sampling', bind_value: 'Once' },
			{ icon: IC.sample_bg, title: 'Sampling: Background Swatch', bind: 'sampling', bind_value: 'Background Swatch' },
		] },
		{ type: 'select', label: 'Limits:', values: ['Discontiguous', 'Contiguous', 'Find Edges'], bind: 'limits', map: { Discontiguous: 'Discontiguous', Contiguous: 'Contiguous', 'Find Edges': 'Contiguous' } },
		{ type: 'pct', label: 'Tolerance:', bind: 'tolerance' },
		{ type: 'check', label: 'Anti-alias', value: true },
		{ type: 'icon', icon: IC.pressure_size, title: 'Always use Pressure for Size' },
	],
	history_brush: [
		{ type: 'brush', bind: 'size' },
		{ type: 'icon', icon: IC.brush_panel, title: 'Toggle the Brush panel' },
		{ type: 'sep' },
		{ type: 'select', label: 'Mode:', values: MODES },
		{ type: 'pct', label: 'Opacity:', value: 100, bind: 'opacity' },
		{ type: 'icon', icon: IC.pressure_op, title: 'Always use Pressure for Opacity' },
		{ type: 'pct', label: 'Flow:', value: 100 },
		{ type: 'icon', icon: IC.airbrush, title: 'Enable airbrush-style build-up effects' },
		{ type: 'icon', icon: IC.pressure_size, title: 'Always use Pressure for Size' },
	],
	mixer_brush: [
		{ type: 'brush', bind: 'size' },
		{ type: 'icon', icon: IC.brush_panel, title: 'Toggle the Brush panel', action: () => app.GUI.Ps_workspace.toggle_panel('brush') },
		{ type: 'sep' },
		{ type: 'mixer_load' },
		{ type: 'check', label: 'Load', bind: 'load_each', title: 'Load the brush after each stroke' },
		{ type: 'check', label: 'Clean', bind: 'clean_each', title: 'Clean the brush after each stroke' },
		{ type: 'sep' },
		{ type: 'select', values: Object.keys(MIXER_PRESETS), bind: 'mixer_preset', map: Object.fromEntries(Object.keys(MIXER_PRESETS).map(k => [k, k])) },
		{ type: 'pct', label: 'Wet:', bind: 'wet' },
		{ type: 'pct', label: 'Load:', bind: 'load' },
		{ type: 'pct', label: 'Mix:', bind: 'mix' },
		{ type: 'pct', label: 'Flow:', bind: 'flow' },
		{ type: 'icon', icon: IC.airbrush, title: 'Enable airbrush-style build-up effects' },
		{ type: 'check', label: 'Sample All Layers', value: false },
	],
	art_history_brush: [
		{ type: 'brush', bind: 'size' },
		{ type: 'icon', icon: IC.brush_panel, title: 'Toggle the Brush panel' },
		{ type: 'sep' },
		{ type: 'select', label: 'Mode:', values: MODES },
		{ type: 'pct', label: 'Opacity:', value: 100, bind: 'opacity' },
		{ type: 'icon', icon: IC.pressure_op, title: 'Always use Pressure for Opacity' },
		{ type: 'select', label: 'Style:', values: ART_STYLES, bind: 'art_style', map: Object.fromEntries(ART_STYLES.map(v => [v, v])) },
		{ type: 'num', label: 'Area:', bind: 'area', unit: 'px', width: 40 },
		{ type: 'pct', label: 'Tolerance:', bind: 'tolerance' },
		{ type: 'icon', icon: IC.pressure_size, title: 'Always use Pressure for Size' },
	],
	spot_healing: [
		{ type: 'brush', bind: 'size' },
		{ type: 'sep' },
		{ type: 'select', label: 'Mode:', values: ['Normal', 'Replace', 'Multiply', 'Screen', 'Darken', 'Lighten', 'Color', 'Luminosity'] },
		{ type: 'select', label: 'Type:', values: ['Proximity Match', 'Create Texture', 'Content-Aware'], value: 'Content-Aware', disabled_values: ['Proximity Match', 'Create Texture'] },
		{ type: 'check', label: 'Sample All Layers', value: false },
	],
	healing: [
		{ type: 'brush', bind: 'size' },
		{ type: 'icon', icon: IC.brush_panel, title: 'Toggle the Clone Source panel' },
		{ type: 'sep' },
		{ type: 'select', label: 'Mode:', values: ['Normal', 'Replace', 'Multiply', 'Screen', 'Darken', 'Lighten', 'Color', 'Luminosity'] },
		{ type: 'select', label: 'Source:', values: ['Sampled', 'Pattern'], value: 'Sampled', disabled_values: ['Pattern'] },
		{ type: 'sep' },
		{ type: 'check', label: 'Aligned', value: true },
		{ type: 'select', label: 'Sample:', values: ['Current Layer', 'Current & Below', 'All Layers'], value: 'Current Layer', disabled_values: ['Current & Below', 'All Layers'] },
	],
	patch: [
		SELECTION_OPS,
		{ type: 'sep' },
		{ type: 'select', label: 'Patch:', values: ['Normal', 'Content-Aware'], value: 'Normal', disabled_values: ['Content-Aware'] },
		{ type: 'label', text: 'Source' },
		{ type: 'check', label: 'Transparent', value: false },
		{ type: 'button', text: 'Use Pattern' },
	],
	content_aware_move: [
		SELECTION_OPS,
		{ type: 'sep' },
		{ type: 'select', label: 'Mode:', values: ['Move', 'Extend'], value: 'Move', disabled_values: ['Extend'] },
		{ type: 'select', label: 'Adaptation:', values: ['Very Strict', 'Strict', 'Medium', 'Loose', 'Very Loose'], value: 'Medium' },
		{ type: 'check', label: 'Sample All Layers', value: false },
	],
	red_eye: [
		{ type: 'num', label: 'Pupil Size:', bind: 'size', unit: '', width: 44 },
		{ type: 'pct', label: 'Darken Amount:', bind: 'strength' },
	],
	dodge: [
		{ type: 'brush', bind: 'size' },
		{ type: 'icon', icon: IC.brush_panel, title: 'Toggle the Brush panel' },
		{ type: 'sep' },
		{ type: 'select', label: 'Range:', values: ['Shadows', 'Midtones', 'Highlights'], bind: 'range', map: { Shadows: 'Shadows', Midtones: 'Midtones', Highlights: 'Highlights' } },
		{ type: 'pct', label: 'Exposure:', bind: 'exposure' },
		{ type: 'icon', icon: IC.airbrush, title: 'Enable airbrush-style build-up effects' },
		{ type: 'check', label: 'Protect Tones', value: true },
	],
	burn: [
		{ type: 'brush', bind: 'size' },
		{ type: 'icon', icon: IC.brush_panel, title: 'Toggle the Brush panel' },
		{ type: 'sep' },
		{ type: 'select', label: 'Range:', values: ['Shadows', 'Midtones', 'Highlights'], bind: 'range', map: { Shadows: 'Shadows', Midtones: 'Midtones', Highlights: 'Highlights' } },
		{ type: 'pct', label: 'Exposure:', bind: 'exposure' },
		{ type: 'icon', icon: IC.airbrush, title: 'Enable airbrush-style build-up effects' },
		{ type: 'check', label: 'Protect Tones', value: true },
	],
	sponge: [
		{ type: 'brush', bind: 'size' },
		{ type: 'icon', icon: IC.brush_panel, title: 'Toggle the Brush panel' },
		{ type: 'sep' },
		{ type: 'select', label: 'Mode:', values: ['Desaturate', 'Saturate'], value: 'Desaturate', disabled_values: ['Saturate'] },
		{ type: 'pct', label: 'Flow:', value: 50 },
		{ type: 'icon', icon: IC.airbrush, title: 'Enable airbrush-style build-up effects' },
		{ type: 'check', label: 'Vibrance', value: true },
	],
	pen: [
		{ type: 'select', values: ['Shape', 'Path', 'Pixels'], bind: 'pen_mode', map: { Shape: 'Shape', Path: 'Path' } },
		{ type: 'sep' },
		{ type: 'label', text: 'Make:' },
		{ type: 'button', text: 'Selection...', action: () => paths().make_selection_dialog() },
		{ type: 'button', text: 'Mask', action: () => app.GUI.Ps_workspace.Vector_mask.current_path() },
		{ type: 'button', text: 'Shape', action: () => app.GUI.Ps_workspace.Shapes.from_current_path() },
		{ type: 'sep' },
		{ type: 'icon', icon: IC.path_ops, title: 'Path operations' },
		{ type: 'icon', icon: IC.gear, title: 'Set additional pen and path options' },
		{ type: 'check', label: 'Auto Add/Delete', bind: 'auto_add' },
		{ type: 'check', label: 'Align Edges', value: false },
	],
	freeform_pen: [
		{ type: 'select', values: ['Shape', 'Path', 'Pixels'], bind: 'pen_mode', map: { Shape: 'Shape', Path: 'Path' } },
		{ type: 'sep' },
		{ type: 'label', text: 'Make:' },
		{ type: 'button', text: 'Selection...', action: () => paths().make_selection_dialog() },
		{ type: 'button', text: 'Mask', action: () => app.GUI.Ps_workspace.Vector_mask.current_path() },
		{ type: 'button', text: 'Shape', action: () => app.GUI.Ps_workspace.Shapes.from_current_path() },
		{ type: 'sep' },
		{ type: 'icon', icon: IC.path_ops, title: 'Path operations' },
		{ type: 'num', label: 'Curve Fit:', bind: 'curve_fit', unit: 'px', width: 40 },
		{ type: 'check', label: 'Magnetic', value: false },
		{ type: 'check', label: 'Align Edges', value: false },
	],
	path_selection: [
		{ type: 'select', label: 'Select:', values: ['Active Layers', 'All Layers'], value: 'Active Layers' },
		{ type: 'sep' },
		{ type: 'label', text: 'Make:' },
		{ type: 'button', text: 'Selection...', action: () => paths().make_selection_dialog() },
		{ type: 'button', text: 'Mask' },
		{ type: 'button', text: 'Shape' },
		{ type: 'sep' },
		{ type: 'icon', icon: IC.path_ops, title: 'Path operations' },
		{ type: 'icon', icon: IC.gear, title: 'Set additional path and shape options' },
		{ type: 'check', label: 'Constrain Path Dragging', value: false },
	],
	add_anchor: [],
	delete_anchor: [],
	convert_point: [],
	rectangle: SHAPE_COMMON([{ type: 'check', label: 'Align Edges', value: true }]),
	rounded_rectangle: SHAPE_COMMON([{ type: 'num', label: 'Radius:', bind: 'radius', unit: 'px', width: 46 }, { type: 'check', label: 'Align Edges', value: true }]),
	ellipse: SHAPE_COMMON([{ type: 'check', label: 'Align Edges', value: true }]),
	custom_shape: SHAPE_COMMON([{ type: 'select', label: 'Shape:', get values() { return custom_shape_names(); }, bind: 'custom', get map() { return Object.fromEntries(custom_shape_names().map(n => [n, n])); } }, { type: 'check', label: 'Align Edges', value: true }]),
	polygon: SHAPE_COMMON([{ type: 'num', label: 'Sides:', bind: 'sides', width: 36 }, { type: 'check', label: 'Align Edges', value: true }]),
	line: SHAPE_COMMON([{ type: 'num', label: 'Weight:', bind: 'size', unit: 'px', width: 40 }, { type: 'check', label: 'Align Edges', value: true }]),
	type: [
		{ type: 'icon', icon: IC.type_orient, title: 'Toggle text orientation' },
		{ type: 'sep' },
		{ type: 'font' },
		{ type: 'font_style' },
		{ type: 'num', bind: 'size', unit: 'pt', width: 52 },
		{ type: 'select', title: 'Set the anti-aliasing method', values: AA_NAMES, get value() { return aa_name(); }, onchange: (v) => app.GUI.Ps_workspace.Text_aa.set(v.toLowerCase()) },
		{ type: 'sep' },
		{ type: 'icons', items: [{ icon: IC.align_text_l, title: 'Left align text', ...text_align('left') }, { icon: IC.align_text_c, title: 'Center text', ...text_align('center') }, { icon: IC.align_text_r, title: 'Right align text', ...text_align('right') }] },
		{ type: 'swatch', label: '', bind: 'fill', title: 'Set the text color' },
		{ type: 'icon', icon: IC.warp, title: 'Create warped text', action: () => app.GUI.Ps_workspace.Warp_text.open() },
		{ type: 'icon', icon: IC.brush_panel, title: 'Toggle the Character and Paragraph panels', action: () => app.GUI.Ps_workspace.toggle_panel('character') },
	],
	hand: [{ type: 'check', label: 'Scroll All Windows', value: false }, { type: 'sep' }, ...ZOOM_BUTTONS],
	rotate_view: [
		{ type: 'rotation' },
		{ type: 'button', text: 'Reset View', action: () => app.GUI.Ps_workspace.set_view_rotation(0) },
		{ type: 'sep' },
		{ type: 'check', label: 'Rotate All Windows', value: false },
	],
	zoom: [
		{ type: 'icons', items: [
			{ icon: IC.zoom_in, title: 'Zoom In', action: () => app.GUI.modules['view/zoom'].in() },
			{ icon: IC.zoom_out, title: 'Zoom Out', action: () => app.GUI.modules['view/zoom'].out() },
		] },
		{ type: 'check', label: 'Resize Windows to Fit', value: false },
		{ type: 'check', label: 'Zoom All Windows', value: false },
		{ type: 'check', label: 'Scrubby Zoom', value: true },
		{ type: 'sep' },
		...ZOOM_BUTTONS,
	],
};
LAYOUTS.direct_selection = LAYOUTS.path_selection;
LAYOUTS.vertical_type = LAYOUTS.type_mask = LAYOUTS.vertical_type_mask = LAYOUTS.type;

function run(command) {
	app.GUI.modules['ps/commands'][command]();
}

/**
 * shape tools in Shape mode: how the next shape joins the selected shape layer
 */
function shape_ops_menu(anchor) {
	var ws = app.GUI.Ps_workspace, cur = ws.shape_op || 'new';
	var shape_layer = config.layer && config.layer.type == 'ps_shape';
	var item = (name, op) => ({ name: name, checked: cur == op, action: () => { ws.shape_op = op; } });
	show_popup_menu(anchor, [
		item('New Layer', 'new'),
		item('Combine Shapes', 'combine'),
		item('Subtract Front Shape', 'subtract'),
		item('Intersect Shape Areas', 'intersect'),
		item('Exclude Overlapping Shapes', 'exclude'),
		{ divider: true },
		{ name: 'Merge Shape Components', action: shape_layer ? () => ws.Shapes.merge_components() : null },
	]);
}

function fill_screen() {
	var wrapper = document.getElementById('main_wrapper');
	var zoom = Math.max(wrapper.clientWidth / config.WIDTH, wrapper.clientHeight / config.HEIGHT);
	app.GUI.GUI_preview.zoom(zoom * 100);
}

class Ps_options_bar_class {

	constructor(workspace) {
		this.workspace = workspace;
	}

	attrs() {
		return config.TOOL.attributes;
	}

	get(key) {
		var attr = this.attrs()[key];
		return attr !== null && typeof attr == 'object' && 'value' in attr ? attr.value : attr;
	}

	set(key, value) {
		var attrs = this.attrs();
		if (attrs[key] !== null && typeof attrs[key] == 'object' && 'value' in attrs[key]) {
			attrs[key].value = value;
		}
		else {
			attrs[key] = value;
		}
		if (config.TOOL.on_update != undefined) {
			var module = app.GUI.GUI_tools.tools_modules[config.TOOL.name];
			module.object[config.TOOL.on_update]({ key: key, value: value });
		}
	}

	toggle(key) {
		this.set(key, !this.get(key));
		this.render();
	}

	has(key) {
		return key in this.attrs();
	}

	/**
	 * @returns {boolean} true when a CS6 layout was rendered
	 */
	/**
	 * live values (Ruler measurements) without rebuilding the bar
	 */
	update_readouts() {
		document.querySelectorAll('#action_attributes .ps_opt_readout').forEach((el) => { if (el._text) el.textContent = el._text(); });
	}

	/**
	 * Free Transform options bar (CS6): reference point, X, Y, W, H (linked), angle,
	 * Warp toggle, Cancel, Commit; values follow the box while dragging
	 */
	render_transform() {
		var T = this.workspace.Transform;
		var job = T.job;
		if (!job) return;
		var bar = document.getElementById('action_attributes');
		bar.innerHTML = '';
		bar.classList.add('ps_cs6_options');
		if (job.warp) return this.render_warp(bar, job, T);
		var html = '<div class="ps_opt_group"><span class="ps_tf_ref" title="Reference point location">' + '<i></i>'.repeat(9) + '</span></div>'
			+ '<div class="ps_opt_group">'
			+ '<span class="ps_opt"><span class="ps_opt_label">X:</span><input class="ps_opt_field" data-tf="x" style="width:58px"></span>'
			+ '<span class="ps_opt"><span class="ps_opt_label">Y:</span><input class="ps_opt_field" data-tf="y" style="width:58px"></span></div>'
			+ '<div class="ps_opt_group">'
			+ '<span class="ps_opt"><span class="ps_opt_label">W:</span><input class="ps_opt_field" data-tf="w" style="width:58px"></span>'
			+ '<button type="button" class="ps_opt_icon' + (this.tf_linked ? ' pressed' : '') + '" data-tf-link title="Maintain aspect ratio">&#128279;</button>'
			+ '<span class="ps_opt"><span class="ps_opt_label">H:</span><input class="ps_opt_field" data-tf="h" style="width:58px"></span></div>'
			+ '<div class="ps_opt_group"><span class="ps_opt"><span class="ps_opt_label">&#8736;</span><input class="ps_opt_field" data-tf="a" style="width:52px"></span>'
			+ '<span class="ps_opt"><span class="ps_opt_label">H:</span><input class="ps_opt_field" disabled value="0.0 °" style="width:46px"></span>'
			+ '<span class="ps_opt"><span class="ps_opt_label">V:</span><input class="ps_opt_field" disabled value="0.0 °" style="width:46px"></span></div>'
			+ '<div class="ps_opt_group"><span class="ps_opt"><span class="ps_opt_label">Interpolation:</span><select class="ps_opt_select" disabled><option>Bicubic</option></select></span>'
			+ '<button type="button" class="ps_opt_icon' + (job.warp ? ' pressed' : '') + '" data-tf-warp title="Switch between free transform and warp modes">&#8767;</button></div>'
			+ '<div class="ps_opt_group"><button type="button" class="ps_opt_icon" data-tf-cancel title="Cancel transform (Esc)">&#8856;</button>'
			+ '<button type="button" class="ps_opt_icon" data-tf-commit title="Commit transform (Return)">&#10004;</button></div>';
		bar.innerHTML = html;
		var set = (key, v) => {
			var b = job.box;
			if (key == 'x') b.cx = v;
			else if (key == 'y') b.cy = v;
			else if (key == 'w') { var ow = b.w; b.w = job.w0 * v / 100; if (this.tf_linked) b.h = b.h * b.w / ow; }
			else if (key == 'h') { var oh = b.h; b.h = job.h0 * v / 100; if (this.tf_linked) b.w = b.w * b.h / oh; }
			else if (key == 'a') b.angle = v * Math.PI / 180;
			job.quad = null;
			T.preview();
		};
		bar.querySelectorAll('[data-tf]').forEach((input) => {
			input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key == 'Enter') input.blur(); });
			input.addEventListener('change', () => { var v = parseFloat(input.value); if (!isNaN(v)) set(input.dataset.tf, v); this.update_transform_fields(); });
		});
		bar.querySelector('[data-tf-link]').addEventListener('click', (e) => { this.tf_linked = !this.tf_linked; e.currentTarget.classList.toggle('pressed', this.tf_linked); });
		bar.querySelector('[data-tf-warp]').addEventListener('click', () => {
			if (job.warp) { job.warp = null; T.preview(); this.render_transform(); }
			else if (job.kind != 'vector') {
				var c = T.corners(), q = [c[0], c[2], c[4], c[6]];
				var lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
				job.warp = [];
				for (var j = 0; j < 4; j++) { var l = lerp(q[0], q[3], j / 3), r = lerp(q[1], q[2], j / 3); for (var i = 0; i < 4; i++) job.warp.push(lerp(l, r, i / 3)); }
				job.quad = null;
				T.preview();
				this.render_transform();
			}
		});
		bar.querySelector('[data-tf-cancel]').addEventListener('click', () => T.cancel());
		bar.querySelector('[data-tf-commit]').addEventListener('click', () => T.commit());
		this.update_transform_fields();
	}

	/**
	 * Warp options bar (CS6): Warp style, orientation, Bend, H / V distortion
	 */
	render_warp(bar, job, T) {
		var ws = job.warp_style || { style: 'Custom', bend: 50, h: 0, v: 0, vertical: false };
		var styles = ['None', 'Custom', '-', 'Arc', 'Arc Lower', 'Arc Upper', 'Arch', 'Bulge', 'Shell Lower', 'Shell Upper', 'Flag', 'Wave', 'Fish', 'Rise', 'Fisheye', 'Inflate', 'Squeeze', 'Twist'];
		var preset = ws.style != 'Custom' && ws.style != 'None';
		var num = (key, label, value) => '<span class="ps_opt"><span class="ps_opt_label">' + label + '</span><input class="ps_opt_field" data-wp="' + key + '" value="' + value.toFixed(1) + '"' + (preset ? '' : ' disabled') + ' style="width:46px"><span class="ps_opt_label">%</span></span>';
		bar.innerHTML = '<div class="ps_opt_group"><span class="ps_tf_ref" title="Reference point location">' + '<i></i>'.repeat(9) + '</span></div>'
			+ '<div class="ps_opt_group"><span class="ps_opt"><span class="ps_opt_label">Warp:</span><select class="ps_opt_select" data-wp-style>'
			+ styles.map(s => s == '-' ? '<option disabled>──────</option>' : '<option' + (s == ws.style ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></span>'
			+ '<button type="button" class="ps_opt_icon' + (ws.vertical ? ' pressed' : '') + '" data-wp-orient title="Change the warp orientation"' + (preset ? '' : ' disabled') + '>&#8645;</button></div>'
			+ '<div class="ps_opt_group">' + num('bend', 'Bend:', ws.bend) + num('h', 'H:', ws.h) + num('v', 'V:', ws.v) + '</div>'
			+ '<div class="ps_opt_group"><button type="button" class="ps_opt_icon pressed" data-tf-warp title="Switch between free transform and warp modes">&#8767;</button></div>'
			+ '<div class="ps_opt_group"><button type="button" class="ps_opt_icon" data-tf-cancel title="Cancel transform (Esc)">&#8856;</button>'
			+ '<button type="button" class="ps_opt_icon" data-tf-commit title="Commit transform (Return)">&#10004;</button></div>';
		var apply = () => { T.warp_preset(ws.style, ws.bend, ws.h, ws.v, ws.vertical); this.render_transform(); };
		bar.querySelector('[data-wp-style]').addEventListener('change', (e) => {
			ws.style = e.target.value;
			if (ws.style == 'None') { ws.bend = 0; ws.h = 0; ws.v = 0; T.warp_preset('Arc', 0, 0, 0, false); job.warp_style = { style: 'None', bend: 0, h: 0, v: 0, vertical: false }; this.render_transform(); return; }
			if (ws.style == 'Custom') { job.warp_style = Object.assign({}, ws); this.render_transform(); return; }
			if (!ws.bend) ws.bend = 50;
			apply();
		});
		bar.querySelector('[data-wp-orient]').addEventListener('click', () => { ws.vertical = !ws.vertical; apply(); });
		bar.querySelectorAll('[data-wp]').forEach((input) => {
			input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key == 'Enter') input.blur(); });
			input.addEventListener('change', () => {
				var v = parseFloat(input.value);
				if (isNaN(v)) return;
				ws[input.dataset.wp] = Math.max(-100, Math.min(100, v));
				apply();
			});
		});
		bar.querySelector('[data-tf-warp]').addEventListener('click', () => { job.warp = null; job.warp_style = null; job.base_quad = null; T.preview(); this.render_transform(); });
		bar.querySelector('[data-tf-cancel]').addEventListener('click', () => T.cancel());
		bar.querySelector('[data-tf-commit]').addEventListener('click', () => T.commit());
	}

	/**
	 * Puppet Warp options bar (CS6): Mode, Density, Expansion, Show Mesh, Pin Depth, Rotate
	 */
	render_puppet() {
		var P = this.workspace.Puppet, j = P.job;
		if (!j) return;
		var bar = document.getElementById('action_attributes');
		bar.classList.add('ps_cs6_options');
		var sel = (key, label, values) => '<span class="ps_opt"><span class="ps_opt_label">' + label + '</span><select class="ps_opt_select" data-pw="' + key + '">'
			+ values.map(v => '<option' + (v == j[key] ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></span>';
		bar.innerHTML = '<div class="ps_opt_group">' + sel('mode', 'Mode:', ['Rigid', 'Normal', 'Distort']) + sel('density', 'Density:', ['Fewer Points', 'Normal', 'More Points'])
			+ '<span class="ps_opt"><span class="ps_opt_label">Expansion:</span><input class="ps_opt_field" data-pw-exp style="width:46px" value="' + j.expansion + ' px"></span>'
			+ '<label class="ps_opt ps_opt_check"><input type="checkbox" data-pw-mesh' + (j.show_mesh ? ' checked' : '') + '> Show Mesh</label></div>'
			+ '<div class="ps_opt_group"><span class="ps_opt_label disabled">Pin Depth:</span><button type="button" class="ps_opt_icon" disabled title="Set pin forward">&#8679;</button><button type="button" class="ps_opt_icon" disabled title="Set pin backward">&#8681;</button>'
			+ '<span class="ps_opt"><span class="ps_opt_label disabled">Rotate:</span><select class="ps_opt_select" disabled><option>Auto</option></select></span></div>'
			+ '<div class="ps_opt_group"><button type="button" class="ps_opt_icon" data-pw-clear title="Remove all pins">&#8634;</button>'
			+ '<button type="button" class="ps_opt_icon" data-pw-cancel title="Cancel Puppet Warp (Esc)">&#8856;</button>'
			+ '<button type="button" class="ps_opt_icon" data-pw-commit title="Commit Puppet Warp (Return)">&#10004;</button></div>';
		bar.querySelectorAll('[data-pw]').forEach((s) => s.addEventListener('change', () => P.set_option(s.dataset.pw, s.value)));
		var exp = bar.querySelector('[data-pw-exp]');
		exp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key == 'Enter') exp.blur(); });
		exp.addEventListener('change', () => { var v = parseFloat(exp.value); if (!isNaN(v)) P.set_option('expansion', Math.max(-20, Math.min(100, v))); exp.value = j.expansion + ' px'; });
		bar.querySelector('[data-pw-mesh]').addEventListener('change', (e) => P.set_option('show_mesh', e.target.checked));
		bar.querySelector('[data-pw-clear]').addEventListener('click', () => P.remove_all());
		bar.querySelector('[data-pw-cancel]').addEventListener('click', () => P.cancel());
		bar.querySelector('[data-pw-commit]').addEventListener('click', () => P.commit());
	}

	update_transform_fields() {
		var job = this.workspace.Transform.job;
		if (!job) return;
		var b = job.box;
		var vals = { x: b.cx.toFixed(1) + ' px', y: b.cy.toFixed(1) + ' px', w: (b.w / job.w0 * 100).toFixed(2) + '%', h: (b.h / job.h0 * 100).toFixed(2) + '%', a: (b.angle * 180 / Math.PI).toFixed(1) + ' °' };
		document.querySelectorAll('#action_attributes [data-tf]').forEach((input) => {
			if (document.activeElement !== input) input.value = vals[input.dataset.tf];
		});
	}

	render() {
		var member = this.workspace.active_member;
		if (this.workspace.Transform && this.workspace.Transform.active()) {
			this.render_transform();
			return true;
		}
		if (this.workspace.Puppet && this.workspace.Puppet.active()) {
			this.render_puppet();
			return true;
		}
		if (!member || member.tool != config.TOOL.name) {
			return false;
		}
		var layout = LAYOUTS[member.id];
		if (!layout) {
			return false;
		}
		var bar = document.getElementById('action_attributes');
		bar.innerHTML = '';
		bar.classList.add('ps_cs6_options');
		var group = document.createElement('div');
		group.className = 'ps_opt_group';
		bar.appendChild(group);
		for (var control of layout) {
			if (control.type == 'sep') {
				group = document.createElement('div');
				group.className = 'ps_opt_group';
				bar.appendChild(group);
				continue;
			}
			var el = this.build(control);
			if (el) {
				group.appendChild(el);
			}
		}
		return true;
	}

	is_bound(control) {
		return control.bind && this.has(control.bind) && !control.always_disabled;
	}

	build(c) {
		var bound = this.is_bound(c);
		var wrap = document.createElement('span');
		wrap.className = 'ps_opt';
		var label = c.label ? '<span class="ps_opt_label">' + c.label + '</span>' : '';

		if (c.type == 'readout') {
			var ro = document.createElement('span');
			ro.className = 'ps_opt_readout';
			ro.textContent = c.text();
			ro._text = c.text;
			wrap.appendChild(ro);
			return wrap;
		}
		if (c.type == 'mixer_load') {
			var mt = app.GUI.GUI_tools.tools_modules.retouch.object;
			var res = mt.reservoir || [parseInt(config.COLOR.substr(1, 2), 16), parseInt(config.COLOR.substr(3, 2), 16), parseInt(config.COLOR.substr(5, 2), 16)];
			wrap.innerHTML = '<span class="ps_opt_swatch" id="ps_mixer_load" title="Current brush load (Alt+click the canvas to load)" style="background:rgb(' + res.map(Math.round).join(',') + ')"></span>';
			return wrap;
		}
		if (c.type == 'text') {
			wrap.innerHTML = '<span class="ps_opt_label">' + c.label + '</span>';
			var ti = document.createElement('input');
			ti.type = 'text';
			ti.className = 'ps_opt_field';
			if (c.width) ti.style.width = c.width + 'px';
			ti.value = bound ? this.get(c.bind) : '';
			ti.disabled = !bound;
			ti.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key == 'Enter') ti.blur(); });
			ti.addEventListener('change', () => this.set(c.bind, ti.value));
			wrap.appendChild(ti);
			return wrap;
		}
		if (c.type == 'rotation') {
			wrap.innerHTML = '<span class="ps_opt_label">Rotation Angle:</span>';
			var ri = document.createElement('input');
			ri.type = 'text';
			ri.className = 'ps_opt_field';
			ri.id = 'ps_rotation_angle';
			ri.style.width = '52px';
			var deg_text = () => Math.round((app.GUI.Ps_workspace.view_rotation || 0) * 10) / 10 + '\u00b0';
			ri.value = deg_text();
			ri.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key == 'Enter') ri.blur(); });
			ri.addEventListener('change', () => {
				var n = parseFloat(ri.value);
				if (!isNaN(n)) app.GUI.Ps_workspace.set_view_rotation(n);
				ri.value = deg_text();
			});
			wrap.appendChild(ri);
			return wrap;
		}
		if (c.type == 'label') {
			wrap.innerHTML = '<span class="ps_opt_label' + (c.disabled ? ' disabled' : '') + '">' + c.text + '</span>';
			return wrap;
		}
		if (c.type == 'button') {
			var b = document.createElement('button');
			b.type = 'button';
			b.className = 'ps_opt_button' + (c.action ? '' : ' disabled');
			b.textContent = c.text;
			if (c.action) b.addEventListener('click', c.action);
			wrap.appendChild(b);
			return wrap;
		}
		if (c.type == 'icon' || c.type == 'icons') {
			var items = c.type == 'icon' ? [c] : c.items;
			for (let item of items) {
				let ib = document.createElement('button');
				ib.type = 'button';
				ib.className = 'ps_opt_icon';
				ib.title = item.title || '';
				ib.innerHTML = item.icon;
				let item_bound = item.bind && this.has(item.bind);
				if (item_bound) {
					let pressed = 'bind_value' in item ? this.get(item.bind) === item.bind_value : !!this.get(item.bind);
					ib.classList.toggle('pressed', pressed);
					ib.addEventListener('click', () => {
						this.set(item.bind, 'bind_value' in item ? item.bind_value : !this.get(item.bind));
						this.render();
					});
				}
				else if (item.action) {
					ib.addEventListener('click', item.action);
					if (item.is_pressed) {
						ib.classList.toggle('pressed', item.is_pressed());
					}
				}
				else if (item.active) {
					ib.classList.add('pressed');
				}
				else {
					ib.classList.add('disabled');
				}
				wrap.appendChild(ib);
			}
			return wrap;
		}
		if (c.type == 'check') {
			var checked = bound ? !!this.get(c.bind) : !!c.value;
			wrap.innerHTML = '<label class="ps_opt_check' + (bound ? '' : ' disabled') + '"><input type="checkbox"' + (checked ? ' checked' : '') + (bound ? '' : ' disabled') + '> '
				+ c.label.replace(/:$/, '') + (c.label.endsWith(':') ? ':' : '') + '</label>';
			if (bound) {
				wrap.querySelector('input').addEventListener('change', (e) => {
					this.set(c.bind, e.target.checked);
					config.need_render = true;
				});
			}
			return wrap;
		}
		if (c.type == 'select') {
			var select = document.createElement('select');
			var current = c.value || c.values[0];
			if (bound && c.map) {
				var v = this.get(c.bind);
				for (var name in c.map) {
					if (c.map[name] === v) current = name;
				}
			}
			for (var value of c.values) {
				var option = document.createElement('option');
				option.textContent = value;
				option.selected = value == current;
				if ((c.disabled_values && c.disabled_values.includes(value)) || (bound && c.map && !(value in c.map))) {
					option.disabled = true;
				}
				select.appendChild(option);
			}
			if (bound && c.map) {
				select.addEventListener('change', () => {
					this.set(c.bind, c.map[select.value]);
					//Mixer Brush presets set Wet / Load / Mix
					if (c.bind == 'mixer_preset' && MIXER_PRESETS[select.value]) {
						var pv = MIXER_PRESETS[select.value];
						this.set('wet', pv[0]);
						this.set('load', pv[1]);
						this.set('mix', pv[2]);
						this.render();
					}
				});
			}
			else if (c.onchange) {
				select.addEventListener('change', () => c.onchange(select.value));
			}
			else if (!c.disabled_values) {
				select.disabled = true;
			}
			wrap.innerHTML = label;
			wrap.appendChild(select);
			return wrap;
		}
		if (c.type == 'pct' || c.type == 'num') {
			var input = document.createElement('input');
			input.type = 'text';
			input.className = 'ps_opt_field';
			if (c.width) input.style.width = c.width + 'px';
			var unit = c.type == 'pct' ? '%' : (c.unit ? ' ' + c.unit : '');
			var val = bound ? this.get(c.bind) : (c.value !== undefined ? c.value : '');
			input.value = val === '' ? '' : val + unit;
			if (bound) {
				input.addEventListener('change', () => {
					var n = parseFloat(input.value);
					if (!isNaN(n)) this.set(c.bind, c.type == 'pct' ? Math.max(1, Math.min(100, n)) : n);
					input.value = this.get(c.bind) + unit;
				});
				input.addEventListener('keydown', (e) => {
					if (e.key == 'ArrowUp' || e.key == 'ArrowDown') {
						e.preventDefault();
						var n = (parseFloat(input.value) || 0) + (e.key == 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1);
						this.set(c.bind, c.type == 'pct' ? Math.max(1, Math.min(100, n)) : Math.max(0, n));
						input.value = this.get(c.bind) + unit;
					}
					if (e.key == 'Enter') input.blur();
				});
			}
			else {
				input.disabled = true;
			}
			wrap.innerHTML = label;
			wrap.appendChild(input);
			if (c.type == 'pct') {
				var caret = document.createElement('span');
				caret.className = 'ps_opt_caret' + (bound ? '' : ' disabled');
				caret.innerHTML = '&#9662;';
				wrap.appendChild(caret);
			}
			return wrap;
		}
		if (c.type == 'pattern') {
			var psel = document.createElement('select');
			psel.className = 'ps_opt_select';
			psel.title = 'Pattern';
			for (var pname of Patterns.names()) {
				var popt = document.createElement('option');
				popt.textContent = pname;
				popt.selected = bound && this.get(c.bind) == pname;
				psel.appendChild(popt);
			}
			if (bound) psel.addEventListener('change', () => this.set(c.bind, psel.value));
			wrap.appendChild(psel);
			return wrap;
		}
		if (c.type == 'brush') {
			var size = bound ? this.get(c.bind) : 30;
			var bb = document.createElement('button');
			bb.type = 'button';
			bb.className = 'ps_opt_brush';
			bb.title = 'Click to open the Brush Preset picker';
			var dot = Math.max(3, Math.min(14, Math.round(Math.sqrt(size) * 2)));
			bb.innerHTML = '<span class="ps_brush_tip" style="width:' + dot + 'px;height:' + dot + 'px"></span><span class="ps_brush_size">' + size + '</span><span class="ps_caret">&#9662;</span>';
			if (bound) {
				bb.addEventListener('click', () => this.brush_picker(bb, c.bind));
			}
			wrap.appendChild(bb);
			return wrap;
		}
		if (c.type == 'swatch') {
			var color = bound ? this.get(c.bind) : '#000000';
			var on = c.toggle && this.has(c.toggle) ? this.get(c.toggle) : true;
			var sw = document.createElement('button');
			sw.type = 'button';
			sw.className = 'ps_opt_swatch' + (on ? '' : ' none');
			sw.style.background = on ? color : '';
			sw.title = (c.label || '') + ' click to set the color, right-click for none';
			if (bound) {
				sw.addEventListener('click', () => {
					this.workspace.color_dialog((c.label || 'Text').replace(':', '') + ' Color', color, (hex) => {
						this.set(c.bind, hex);
						if (c.toggle && this.has(c.toggle)) this.set(c.toggle, true);
						this.render();
					});
				});
				sw.addEventListener('contextmenu', (e) => {
					e.preventDefault();
					if (c.toggle && this.has(c.toggle)) {
						this.set(c.toggle, !on);
						this.render();
					}
				});
			}
			wrap.innerHTML = label;
			wrap.appendChild(sw);
			return wrap;
		}
		if (c.type == 'font') {
			var fsel = document.createElement('select');
			fsel.className = 'ps_opt_font';
			var attr = this.attrs().font;
			var fonts = typeof attr.values == 'function' ? attr.values() : attr.values;
			for (var f of fonts) {
				if (f === '') continue;
				var fo = document.createElement('option');
				fo.textContent = f;
				fo.selected = f == attr.value;
				fsel.appendChild(fo);
			}
			fsel.addEventListener('change', () => {
				this.set('font', fsel.value);
				this.render();
			});
			wrap.appendChild(fsel);
			return wrap;
		}
		if (c.type == 'font_style') {
			var ssel = document.createElement('select');
			var styles = ['Regular', 'Italic', 'Bold', 'Bold Italic'];
			var bold = !!this.get('bold');
			var italic = !!this.get('italic');
			var current_style = bold ? (italic ? 'Bold Italic' : 'Bold') : (italic ? 'Italic' : 'Regular');
			for (var st of styles) {
				var so = document.createElement('option');
				so.textContent = st;
				so.selected = st == current_style;
				ssel.appendChild(so);
			}
			ssel.addEventListener('change', () => {
				this.set('bold', ssel.value.indexOf('Bold') >= 0);
				this.set('italic', ssel.value.indexOf('Italic') >= 0);
			});
			wrap.appendChild(ssel);
			return wrap;
		}
		if (c.type == 'gradient') {
			var g = document.createElement('button');
			g.type = 'button';
			g.className = 'ps_opt_gradient';
			var c1 = this.has('color_1') ? this.get('color_1') : config.COLOR;
			var c2 = this.has('color_2') ? this.get('color_2') : config.BG_COLOR;
			g.innerHTML = '<span style="background:linear-gradient(90deg,' + c1 + ',' + c2 + ')"></span><span class="ps_caret">&#9662;</span>';
			g.title = 'Click to edit the gradient';
			wrap.appendChild(g);
			return wrap;
		}
		return null;
	}

	/**
	 * small Brush Preset picker: Size (and greyed Hardness)
	 */
	brush_picker(anchor, key) {
		var existing = document.querySelector('.ps_brush_picker');
		if (existing) {
			existing.remove();
			return;
		}
		var pop = document.createElement('div');
		pop.className = 'ps_brush_picker';
		var size = this.get(key);
		var hard = this.has('hardness');
		var hardness = hard ? this.get('hardness') : 100;
		pop.innerHTML = '<div class="ps_bp_row"><span>Size:</span><input type="range" min="1" max="500" value="' + size + '"><input type="text" class="ps_opt_field" value="' + size + ' px"></div>'
			+ '<div class="ps_bp_row' + (hard ? '' : ' disabled') + '"><span>Hardness:</span><input type="range" class="ps_bp_hard" min="0" max="100"' + (hard ? '' : ' disabled') + ' value="' + hardness + '"><input type="text" class="ps_opt_field ps_bp_hard_field"' + (hard ? '' : ' disabled') + ' value="' + hardness + '%"></div>';
		//CS6: the preset grid under Size and Hardness
		var grid = document.createElement('div');
		grid.className = 'ps_bpre_grid';
		pop.appendChild(grid);
		this.workspace.Brush_presets.fill(grid, false);
		grid.addEventListener('click', () => setTimeout(close, 0));
		document.body.appendChild(pop);
		var rect = anchor.getBoundingClientRect();
		pop.style.left = rect.left + 'px';
		pop.style.top = (rect.bottom + 2) + 'px';
		var range = pop.querySelector('input[type="range"]');
		var field = pop.querySelector('input[type="text"]');
		var apply = (v) => {
			v = Math.max(1, Math.min(999, Math.round(v)));
			this.set(key, v);
			range.value = v;
			field.value = v + ' px';
			var tip = document.querySelector('.ps_brush_size');
			if (tip) tip.textContent = v;
		};
		if (hard) {
			var hrange = pop.querySelector('.ps_bp_hard');
			var hfield = pop.querySelector('.ps_bp_hard_field');
			var apply_hard = (v) => {
				v = Math.max(0, Math.min(100, Math.round(v)));
				this.set('hardness', v);
				hrange.value = v;
				hfield.value = v + '%';
			};
			hrange.addEventListener('input', () => apply_hard(parseFloat(hrange.value)));
			hfield.addEventListener('change', () => apply_hard(parseFloat(hfield.value) || 0));
			hfield.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key == 'Enter' || e.key == 'Escape') close(); });
		}
		range.addEventListener('input', () => apply(parseFloat(range.value)));
		field.addEventListener('change', () => apply(parseFloat(field.value) || 1));
		field.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key == 'Enter' || e.key == 'Escape') close(); });
		var close = () => {
			pop.remove();
			document.removeEventListener('mousedown', outside, true);
			this.render();
		};
		var outside = (e) => {
			if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) close();
		};
		setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
	}
}

export default Ps_options_bar_class;
export { tool_icons };
