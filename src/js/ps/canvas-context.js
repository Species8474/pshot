/*
 * pshot - CS6 right-click on the image: the menu depends on the active tool
 * (Free Transform while transforming, selection commands for the selection
 * tools, the brush picker for painting tools, the layers under the pointer
 * for the Move tool, views for Hand / Zoom, sample sizes for the Eyedropper,
 * path commands for the pen tools).
 */

import app from './../app.js';
import config from './../config.js';
import { show_popup_menu } from './popup-menu.js';
import { SAMPLE_SIZES, CROP_RATIOS, fill_screen } from './options-bar.js';
import { type_items } from './layer-context.js';

const SELECTION_TOOLS = ['rect_marquee', 'ellipse_marquee', 'row_marquee', 'col_marquee', 'lasso', 'polygon_lasso', 'magnetic_lasso', 'quick_selection', 'magic_wand'];
const PEN_TOOLS = ['pen', 'freeform_pen', 'add_anchor', 'delete_anchor', 'convert_point', 'path_selection', 'direct_selection'];

function cmd(name, param) {
	return () => app.GUI.modules['ps/commands'][name](param);
}

function transform_items() {
	var T = app.GUI.Ps_workspace.Transform;
	var job = T.job;
	var mode = job.warp ? 'warp' : (job.mode_override || null);
	var pixels = job.kind == 'pixels';
	var set_mode = (m) => () => {
		if (m == 'warp') return T.start_mode('warp');
		if (job.warp) { job.warp = null; T.preview(); }
		job.mode_override = m;
		app.GUI.Ps_workspace.Options_bar.render_transform();
	};
	return [
		{ name: 'Free Transform', checked: !mode, action: set_mode(null) },
		{ name: 'Scale', action: set_mode(null) },
		{ name: 'Rotate', action: set_mode(null) },
		{ name: 'Skew', checked: mode == 'skew', action: pixels ? set_mode('skew') : null },
		{ name: 'Distort', checked: mode == 'distort', action: pixels ? set_mode('distort') : null },
		{ name: 'Perspective', checked: mode == 'perspective', action: pixels ? set_mode('perspective') : null },
		{ name: 'Warp', checked: mode == 'warp', action: pixels ? set_mode('warp') : null },
		{ divider: true },
		{ name: 'Content-Aware Scale' },
		{ name: 'Puppet Warp' },
		{ divider: true },
		{ name: 'Rotate 180°', action: () => T.orient('rotate', Math.PI) },
		{ name: 'Rotate 90° CW', action: () => T.orient('rotate', Math.PI / 2) },
		{ name: 'Rotate 90° CCW', action: () => T.orient('rotate', -Math.PI / 2) },
		{ divider: true },
		{ name: 'Flip Horizontal', action: pixels ? () => T.orient('flip_h') : null },
		{ name: 'Flip Vertical', action: pixels ? () => T.orient('flip_v') : null },
	];
}

function selection_items() {
	var has = app.GUI.Ps_workspace.Selection.has();
	var on = (fn) => (has ? fn : null);
	return [
		has ? { name: 'Deselect', action: cmd('deselect') } : { name: 'Select All', action: cmd('select_all') },
		{ name: has ? 'Select Inverse' : 'Reselect', action: has ? cmd('select_inverse') : cmd('reselect') },
		{ name: 'Feather...', action: on(cmd('modify_feather')) },
		{ name: 'Refine Edge...', action: on(cmd('refine_edge')) },
		{ divider: true },
		{ name: 'Save Selection...', action: on(cmd('save_selection')) },
		{ name: 'Make Work Path...', action: on(() => app.GUI.Ps_workspace.Paths.from_selection()) },
		{ divider: true },
		{ name: 'Layer via Copy', action: on(cmd('layer_via_copy')) },
		{ name: 'Layer via Cut', action: on(cmd('layer_via_cut')) },
		{ name: 'New Layer...', action: cmd('new_layer_dialog') },
		{ divider: true },
		{ name: 'Free Transform', action: cmd('free_transform') },
		{ name: 'Transform Selection', action: on(cmd('transform_selection')) },
		{ divider: true },
		{ name: 'Fill...', action: cmd('fill') },
		{ name: 'Stroke...', action: on(cmd('stroke')) },
		{ divider: true },
		{ name: 'Last Filter', action: cmd('last_filter') },
		{ name: 'Fade...', action: cmd('fade') },
	];
}

/**
 * Move tool: the layers with a visible pixel under the pointer, top first
 */
function layers_at(x, y) {
	var c = document.createElement('canvas');
	c.width = c.height = 1;
	var ctx = c.getContext('2d', { willReadFrequently: true });
	var out = [];
	for (var layer of app.Layers.get_sorted_layers()) {
		if (layer.visible == false || layer.type == null || layer.type == 'ps_group' || layer.type == 'ps_adjust') continue;
		ctx.clearRect(0, 0, 1, 1);
		ctx.save();
		ctx.translate(-Math.floor(x), -Math.floor(y));
		try { app.Layers.render_object(ctx, layer); } catch (e) { /* layer not drawable */ }
		ctx.restore();
		if (ctx.getImageData(0, 0, 1, 1).data[3] > 0) out.push(layer);
	}
	return out;
}

function move_items(event) {
	var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
	var p = app.Layers.get_world_coords(event.clientX - rect.left, event.clientY - rect.top);
	return layers_at(p.x, p.y).map(layer => ({
		name: app.GUI.Ps_workspace.Helper.escapeHtml(layer.name),
		checked: config.layer && config.layer.id == layer.id,
		action: () => app.State.do_action(new app.Actions.Select_layer_action(layer.id)),
	}));
}

function view_items(zoom) {
	var Z = app.GUI.modules['view/zoom'];
	var items = zoom ? [
		{ name: 'Zoom In', action: () => Z.in() },
		{ name: 'Zoom Out', action: () => Z.out() },
		{ divider: true },
	] : [];
	return items.concat([
		{ name: '100%', action: () => Z.original() },
		{ name: 'Fit on Screen', action: () => Z.auto() },
		{ name: 'Fill Screen', action: () => fill_screen() },
		{ name: 'Print Size', action: () => app.GUI.Ps_workspace.Extras.print_size() },
	]);
}

function eyedropper_items() {
	var attrs = config.TOOL.attributes;
	var hex = () => config.COLOR.replace('#', '').toUpperCase();
	var copy = (text) => { try { navigator.clipboard.writeText(text); } catch (e) { /* clipboard blocked */ } };
	return SAMPLE_SIZES.map(s => ({
		name: s,
		checked: attrs.sample_size == s,
		action: () => app.GUI.Ps_workspace.Options_bar.set('sample_size', s),
	})).concat([
		{ divider: true },
		{ name: 'Copy Color as HTML', action: () => copy('color="#' + hex() + '"') },
		{ name: 'Copy Color\'s Hex Code', action: () => copy(hex()) },
	]);
}

function pen_items() {
	var P = app.GUI.Ps_workspace.Paths;
	var has = !!P.active();
	var on = (fn) => (has ? fn : null);
	return [
		{ name: 'Delete Path', action: on(() => P.delete_path()) },
		{ name: 'Define Custom Shape...', action: on(cmd('define_custom_shape')) },
		{ divider: true },
		{ name: 'Make Selection...', action: on(() => P.make_selection_dialog()) },
		{ name: 'Fill Path...', action: on(() => P.paint('fill')) },
		{ name: 'Stroke Path...', action: on(() => P.paint('stroke')) },
		{ divider: true },
		{ name: 'Clipping Path...' },
		{ divider: true },
		{ name: 'Free Transform Path', action: on(cmd('free_transform')) },
	];
}

function crop_items() {
	var crop = app.GUI.GUI_tools.tools_modules.crop.object;
	var active = crop.selection && crop.selection.width;
	var ratio = config.TOOL.attributes.ratio_preset;
	var bar = app.GUI.Ps_workspace.Options_bar;
	return [
		{ name: 'Crop', action: active ? () => crop.on_params_update() : null },
		{ name: 'Cancel', action: active ? () => { crop.selection = { x: null, y: null, width: null, height: null }; config.need_render = true; } : null },
		{ divider: true },
	].concat(CROP_RATIOS.map(r => ({ name: r, checked: ratio == r, action: () => { bar.set('ratio_preset', r); bar.render(); } })), [
		{ divider: true },
		{ name: 'Rotate Crop Box', action: () => { crop.swap_ratio(); bar.render(); } },
	]);
}

function slice_items(event) {
	var S = app.GUI.Ps_workspace.Slices;
	var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
	var hit = S.hit(app.Layers.get_world_coords(event.clientX - rect.left, event.clientY - rect.top));
	if (!hit) return null;
	var user = hit.slice && hit.type == 'user';
	if (hit.slice && config.ps_slice_selected != hit.slice.id) {
		config.ps_slice_selected = hit.slice.id;
		S.refresh();
	}
	return [
		{ name: 'Delete Slice', action: hit.slice ? () => S.remove(hit.slice.id) : null },
		{ name: 'Edit Slice Options...', action: () => S.options(hit) },
		{ name: 'Promote to User Slice', action: user ? null : () => S.promote(hit) },
		{ name: 'Divide Slice...', action: user ? () => S.divide() : null },
		{ name: 'Combine Slices' },
		{ divider: true },
		{ name: 'Bring to Front', action: user ? () => S.arrange('front') : null },
		{ name: 'Bring Forward', action: user ? () => S.arrange('forward') : null },
		{ name: 'Send Backward', action: user ? () => S.arrange('backward') : null },
		{ name: 'Send to Back', action: user ? () => S.arrange('back') : null },
	];
}

function note_items(event) {
	var N = app.GUI.Ps_workspace.Notes;
	var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
	var i = N.hit(app.Layers.get_world_coords(event.clientX - rect.left, event.clientY - rect.top));
	return [
		{ name: 'Open Note', action: i >= 0 ? () => N.open_panel() : null },
		{ name: 'Delete Note', action: i >= 0 ? () => N.remove(i) : null },
		{ name: 'Delete All Notes', action: N.list().length ? () => N.clear_all() : null },
		{ divider: true },
		{ name: 'Export Notes...' },
	];
}

/**
 * the Type tool while editing: text commands for the type layer
 */
function text_items() {
	return [
		{ name: 'Check Spelling...' },
		{ name: 'Find and Replace Text...', action: cmd('find_replace_text') },
		{ divider: true },
	].concat(type_items(config.layer));
}

function canvas_context_menu(event) {
	event.preventDefault();
	var ws = app.GUI.Ps_workspace;
	var member = ws.active_member;
	if (!member) return;
	var point = { x: event.clientX, y: event.clientY };
	var anchor = document.getElementById('canvas_minipaint');
	if (ws.Transform.active()) {
		show_popup_menu(anchor, transform_items(), { point: point });
		return;
	}
	//painting tools: the brush preset picker at the pointer
	var brush_key = ws.Options_bar.brush_key();
	if (brush_key) {
		ws.Options_bar.brush_picker({ getBoundingClientRect: () => ({ left: point.x, bottom: point.y }), contains: () => false }, brush_key);
		return;
	}
	var items = null;
	if (SELECTION_TOOLS.includes(member.id)) items = selection_items();
	else if (member.id == 'move') items = move_items(event);
	else if (member.id == 'hand') items = view_items(false);
	else if (member.id == 'zoom') items = view_items(true);
	else if (member.id == 'eyedropper') items = eyedropper_items();
	else if (PEN_TOOLS.includes(member.id)) items = pen_items();
	else if (member.id == 'crop') items = crop_items();
	else if (member.id == 'slice' || member.id == 'slice_select') items = slice_items(event);
	else if (member.id == 'note') items = note_items(event);
	else if (member.tool == 'text') {
		var text = app.GUI.GUI_tools.tools_modules.text;
		if (text && text.object.focused && config.layer && config.layer.type == 'text') items = text_items();
	}
	if (items && items.length) show_popup_menu(anchor, items, { point: point });
}

export { canvas_context_menu };
