/*
 * pshot - CS6 Layers panel context menus: right-click a layer row, its
 * thumbnail, or its mask thumbnails. The entries run the Layer menu commands
 * on the layer that was clicked (it is selected first).
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';
import { show_popup_menu } from './popup-menu.js';

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
		{ divider: true },
		{ name: 'Rasterize Layer', action: rasterizable ? raster : null },
		{ name: 'Rasterize Layer Style' },
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
		{ name: 'Refine Mask...' },
		{ name: 'Mask Options...' },
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
	var row = event.target.closest('.ps_layer_row');
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
	if (action.action == 'mask_thumb' && layer.ps_mask) items = mask_items(layer);
	else if (action.action == 'vmask_thumb' && layer.ps_vmask) items = vmask_items(layer);
	else if (action.action == 'layer_thumb' && layer.type != 'ps_adjust' && layer.type != 'ps_fill') items = thumb_items(layer);
	else items = row_items(config.layer && config.layer.id == layer.id ? config.layer : layer);
	show_popup_menu(row, items, { point: { x: event.clientX, y: event.clientY } });
	return true;
}

export { layer_context_menu };
