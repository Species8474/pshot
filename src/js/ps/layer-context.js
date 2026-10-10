/*
 * pshot - CS6 Layers panel context menus: right-click a layer row, its
 * thumbnail, or its mask thumbnails. The entries run the Layer menu commands
 * on the layer that was clicked (it is selected first).
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';
import { show_popup_menu } from './popup-menu.js';
import { layer_style_items } from './adjustments-def.js';

const COLORS = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Violet', 'Gray'];

function cmd(name, param) {
	return () => app.GUI.modules['ps/commands'][name](param);
}

function is_background(layer) {
	var list = app.GUI.Ps_workspace.Groups.ordered();
	return layer.name == 'Background' && layer === list[list.length - 1];
}

/**
 * Layer From Background...: the New Layer dialog turns it into Layer 0
 */
function layer_from_background(layer) {
	var POP = new Dialog_class();
	POP.show({
		title: 'New Layer',
		params: [{ name: 'name', title: 'Name:', value: 'Layer 0' }],
		on_finish: (p) => {
			app.State.do_action(new app.Actions.Bundle_action('layer_from_background', 'Layer From Background', [
				new app.Actions.Update_layer_action(layer.id, { name: p.name || 'Layer 0' }),
			]));
		},
	});
}

function set_color(layer, color) {
	app.State.do_action(new app.Actions.Bundle_action('layer_color', 'Layer Properties', [
		new app.Actions.Update_layer_action(layer.id, { ps_color: color }),
	]));
}

/**
 * a type layer's items (also the Type tool's menu while editing)
 */
function type_items(layer, raster) {
	var aa = app.GUI.Ps_workspace.Text_aa.current();
	var vertical = layer.params && layer.params.text_direction == 'ttb';
	var items = [
		{ name: 'Rasterize Type', action: raster || (() => app.GUI.modules['layer/raster'].raster()) },
		{ name: 'Create Work Path', action: cmd('type_work_path') },
		{ name: 'Convert to Shape', action: cmd('type_to_shape') },
		{ divider: true },
		{ name: 'Horizontal', checked: !vertical, action: cmd('text_horizontal') },
		{ name: 'Vertical', checked: vertical, action: cmd('text_vertical') },
		{ divider: true },
	];
	for (var m of ['None', 'Sharp', 'Crisp', 'Strong', 'Smooth']) {
		let mode = m.toLowerCase();
		items.push({ name: m, checked: aa == mode, action: cmd('anti_alias', mode) });
	}
	items.push(
		{ divider: true },
		{ name: app.GUI.modules['ps/commands'].paragraph_label(), action: cmd('toggle_paragraph') },
		{ name: 'Warp Text...', action: cmd('warp_text') },
	);
	return items;
}

function row_items(layer) {
	var Multi = app.GUI.Ps_workspace.Multi;
	var multi = Multi.multiple();
	var bg = is_background(layer);
	var rasterizable = ['text', 'ps_fill'].includes(layer.type) || layer.ps_shape || layer.ps_smart;
	var raster = () => {
		if (layer.ps_smart) return cmd('rasterize_smart_object')();
		if (layer.type == 'ps_fill') return cmd('rasterize_fill')();
		app.GUI.modules['layer/raster'].raster();
	};
	var items = [
		bg ? { name: 'Layer From Background...', action: () => layer_from_background(layer) }
			: { name: 'Layer Properties...', action: multi ? null : cmd('layer_properties') },
		{ name: 'Blending Options...', action: bg ? null : cmd('layer_style', 'blending') },
		{ name: 'Edit Adjustment...', action: layer.type == 'ps_adjust' ? () => app.GUI.Ps_workspace.Adjustment_layers.edit(layer) : null },
		{ divider: true },
		{ name: 'Copy CSS' },
		{ name: 'Duplicate Layer' + (multi ? 's...' : '...'), action: cmd('duplicate_layer_dialog') },
		{ name: 'Delete Layer' + (multi ? 's' : ''), action: cmd('delete_layer') },
	];
	if (multi) items.push({ name: 'Group from Layers...', action: cmd('group_layers') });
	items.push(
		{ divider: true },
		{ name: 'Convert to Smart Object', action: cmd('convert_to_smart_object') },
	);
	if (layer.ps_smart) {
		items.push(
			{ name: 'New Smart Object via Copy', action: cmd('new_smart_object_via_copy') },
			{ name: 'Edit Contents', action: cmd('edit_smart_contents') },
			{ name: 'Export Contents...', action: cmd('export_smart_contents') },
			{ name: 'Replace Contents...', action: cmd('replace_smart_contents') },
		);
	}
	items.push({ divider: true });
	if (layer.type == 'text') {
		items.push(...type_items(layer, raster));
	}
	else {
		items.push({ name: 'Rasterize Layer', action: rasterizable ? raster : null });
	}
	items.push(
		{ name: 'Rasterize Layer Style', action: app.GUI.Ps_workspace.Styles.has(layer) ? cmd('rasterize_layer_style') : null },
		{ divider: true },
	);
	if (layer.ps_mask) items.push({ name: (layer.ps_mask_disabled ? 'Enable' : 'Disable') + ' Layer Mask', action: cmd('mask_toggle') });
	if (layer.ps_vmask) items.push({ name: (layer.ps_vmask.disabled ? 'Enable' : 'Disable') + ' Vector Mask', action: cmd('vmask_toggle') });
	items.push(
		{ name: layer.composition === 'source-atop' ? 'Release Clipping Mask' : 'Create Clipping Mask', action: bg ? null : cmd('toggle_clipping_mask') },
		{ divider: true },
		{ name: 'Link Layers', action: multi ? cmd('toggle_link_layers') : null },
		{ name: 'Select Linked Layers', action: cmd('select_linked_layers') },
		{ divider: true },
		{ name: 'Copy Layer Style', action: cmd('copy_layer_style') },
		{ name: 'Paste Layer Style', action: cmd('paste_layer_style') },
		{ name: 'Clear Layer Style', action: cmd('clear_layer_style') },
		{ divider: true },
		{ name: multi ? 'Merge Layers' : 'Merge Down', action: cmd('merge_down') },
		{ name: 'Merge Visible', action: cmd('merge_visible') },
		{ name: 'Flatten Image', action: cmd('flatten_image') },
		{ divider: true },
		{ name: 'No Color', checked: !layer.ps_color, action: () => set_color(layer, null) },
	);
	for (var c of COLORS) {
		let color = c;
		items.push({ name: color, checked: layer.ps_color == color, action: () => set_color(layer, color) });
	}
	items.push(
		{ divider: true },
		{ name: 'Postcard' },
		{ name: 'New 3D Extrusion from Selected Layer' },
	);
	return items;
}

/**
 * the fx badge and the Effects rows under a layer
 */
function effects_items() {
	return layer_style_items().concat([
		{ divider: true },
		{ name: 'Copy Layer Style', action: cmd('copy_layer_style') },
		{ name: 'Paste Layer Style', action: cmd('paste_layer_style') },
		{ name: 'Clear Layer Style', action: cmd('clear_layer_style') },
		{ divider: true },
		{ name: 'Global Light...', action: cmd('global_light') },
		{ name: 'Create Layer', action: cmd('create_style_layers') },
		{ name: app.GUI.modules['ps/commands'].effects_label(), action: cmd('toggle_all_effects') },
		{ name: 'Scale Effects...', action: cmd('scale_effects') },
	]);
}

/**
 * the Smart Filters header under a smart object
 */
function smart_filter_items(layer) {
	var off = !!(layer.ps_smart && layer.ps_smart.filters_disabled);
	return [
		{ name: (off ? 'Enable' : 'Disable') + ' Smart Filters', action: cmd('smart_filters_toggle') },
		{ name: 'Clear Smart Filters', action: cmd('smart_filters_clear') },
	];
}

/**
 * the visibility (eye) column
 */
function eye_items(layer) {
	var others = config.layers.filter(l => l !== layer && l.type != 'ps_group');
	var all_hidden = others.length && others.every(l => !l.visible);
	var items = [
		{ name: layer.visible ? 'Hide this layer' : 'Show this layer', action: () => app.State.do_action(new app.Actions.Bundle_action('visibility', layer.visible ? 'Hide Layer' : 'Show Layer', [
			new app.Actions.Update_layer_action(layer.id, { visible: !layer.visible }),
		])) },
		{ name: all_hidden ? 'Show all other layers' : 'Hide all other layers', action: () => app.GUI.modules['ps/commands'].solo_visibility(layer) },
		{ divider: true },
		{ name: 'No Color', checked: !layer.ps_color, action: () => set_color(layer, null) },
	];
	for (var c of COLORS) {
		let color = c;
		items.push({ name: color, checked: layer.ps_color == color, action: () => set_color(layer, color) });
	}
	return items;
}

function thumb_items(layer) {
	var load = (op) => () => app.GUI.modules['ps/commands'].load_layer_selection(layer, false, op);
	return [
		{ name: 'Select Pixels', action: load('new') },
		{ divider: true },
		{ name: 'Add Transparency to Selection', action: load('add') },
		{ name: 'Subtract Transparency from Selection', action: load('subtract') },
		{ name: 'Intersect Transparency with Selection', action: load('intersect') },
	];
}

function mask_items(layer) {
	var load = (op) => () => app.GUI.modules['ps/commands'].load_layer_selection(layer, true, op);
	return [
		{ name: (layer.ps_mask_disabled ? 'Enable' : 'Disable') + ' Layer Mask', action: cmd('mask_toggle') },
		{ name: 'Delete Layer Mask', action: cmd('mask_delete') },
		{ name: 'Apply Layer Mask', action: cmd('mask_apply') },
		{ divider: true },
		{ name: 'Add Mask To Selection', action: load('add') },
		{ name: 'Subtract Mask From Selection', action: load('subtract') },
		{ name: 'Intersect Mask With Selection', action: load('intersect') },
		{ divider: true },
		{ name: 'Refine Mask...', action: cmd('refine_mask') },
		{ name: 'Mask Options...', action: cmd('mask_options') },
	];
}

function vmask_items(layer) {
	return [
		{ name: (layer.ps_vmask.disabled ? 'Enable' : 'Disable') + ' Vector Mask', action: cmd('vmask_toggle') },
		{ name: 'Delete Vector Mask', action: cmd('vmask_delete') },
		{ name: 'Rasterize Vector Mask', action: cmd('vmask_rasterize') },
	];
}

/**
 * contextmenu on the Layers panel: select the clicked layer, then show its menu
 */
async function layer_context_menu(event) {
	if (!event.target.closest('.ps_layer_row, .ps_effects') && event.target.closest('#layers')) {
		//the panel's empty area: thumbnail options
		event.preventDefault();
		var GL = app.GUI.GUI_layers, o = GL.thumb_options();
		var size = (v, name) => ({ name: name, checked: o.size == v, action: () => GL.set_thumb_options({ size: v }) });
		show_popup_menu(event.target, [
			size('none', 'No Thumbnails'), size('small', 'Small Thumbnails'), size('medium', 'Medium Thumbnails'), size('large', 'Large Thumbnails'),
			{ divider: true },
			{ name: 'Clip Thumbnails to Layer Bounds', checked: o.clip == 'layer', action: () => GL.set_thumb_options({ clip: 'layer' }) },
			{ name: 'Clip Thumbnails to Document Bounds', checked: o.clip != 'layer', action: () => GL.set_thumb_options({ clip: 'document' }) },
		], { point: { x: event.clientX, y: event.clientY } });
		return true;
	}
	var fx = event.target.closest('.ps_effects');
	var row = event.target.closest('.ps_layer_row');
	if (fx) {
		//effects / smart filter rows follow their layer's row
		row = fx.previousElementSibling;
		while (row && !row.classList.contains('ps_layer_row')) row = row.previousElementSibling;
	}
	if (!row) return false;
	event.preventDefault();
	var layer = app.Layers.get_layer(parseInt(row.dataset.id));
	if (!layer) return true;
	var Multi = app.GUI.Ps_workspace.Multi;
	if (!Multi.selected().includes(layer)) {
		await app.State.do_action(new app.Actions.Select_layer_action(layer.id));
	}
	var action = (event.target.closest('[data-action]') || {}).dataset || {};
	var items;
	if (fx && fx.classList.contains('ps_sfilters')) items = smart_filter_items(layer);
	else if (fx || event.target.closest('.ps_layer_fx')) items = effects_items();
	else if (action.action == 'visibility') items = eye_items(layer);
	else if (action.action == 'mask_thumb' && layer.ps_mask) items = mask_items(layer);
	else if (action.action == 'vmask_thumb' && layer.ps_vmask) items = vmask_items(layer);
	else if (action.action == 'layer_thumb' && layer.type != 'ps_adjust' && layer.type != 'ps_fill') items = thumb_items(layer);
	else items = row_items(config.layer && config.layer.id == layer.id ? config.layer : layer);
	show_popup_menu(row, items, { point: { x: event.clientX, y: event.clientY } });
	return true;
}

export { layer_context_menu, type_items };
