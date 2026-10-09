/*
 * miniPaint - https://github.com/viliusle/miniPaint
 * author: Vilius L.
 *
 * pshot: rewritten as the Photoshop CS6 Layers panel (docs/cs6-spec.md §5).
 */

import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../base-layers.js';
import Helper_class from './../../libs/helpers.js';
import Effects_browser_class from './../../modules/effects/browser.js';
import Layer_duplicate_class from './../../modules/layer/duplicate.js';
import { show_popup_menu } from './../../ps/popup-menu.js';
import { adjustment_items, layer_style_items } from './../../ps/adjustments-def.js';

/**
 * CS6 blend modes in menu order. op = canvas globalCompositeOperation, null = not supported yet.
 * Canvas has no Dissolve, Linear Burn/Dodge-as-blend, Darker/Lighter Color, Vivid/Linear/Pin Light,
 * Hard Mix, Subtract or Divide.
 */
const BLEND_MODES = [
	['Normal', 'source-over'], ['Dissolve', null], '-',
	['Darken', 'darken'], ['Multiply', 'multiply'], ['Color Burn', 'color-burn'], ['Linear Burn', null], ['Darker Color', null], '-',
	['Lighten', 'lighten'], ['Screen', 'screen'], ['Color Dodge', 'color-dodge'], ['Linear Dodge (Add)', 'lighter'], ['Lighter Color', null], '-',
	['Overlay', 'overlay'], ['Soft Light', 'soft-light'], ['Hard Light', 'hard-light'], ['Vivid Light', null], ['Linear Light', null], ['Pin Light', null], ['Hard Mix', null], '-',
	['Difference', 'difference'], ['Exclusion', 'exclusion'], ['Subtract', null], ['Divide', null], '-',
	['Hue', 'hue'], ['Saturation', 'saturation'], ['Color', 'color'], ['Luminosity', 'luminosity'],
];

const ICON = {
	eye: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8z" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="2.2" fill="currentColor"/></svg>',
	link: '<svg viewBox="0 0 16 16" width="15" height="15"><path d="M6.5 9.5l3-3M7 4.5l1.5-1.5a2.5 2.5 0 0 1 3.5 3.5L10.5 8M9 11.5l-1.5 1.5a2.5 2.5 0 0 1-3.5-3.5L5.5 8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
	fx: '<span class="ps_fx_text">fx</span>',
	mask: '<svg viewBox="0 0 16 16" width="15" height="15"><rect x="2" y="3" width="12" height="10" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="3" fill="currentColor"/></svg>',
	adjust: '<svg viewBox="0 0 16 16" width="15" height="15"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor"/></svg>',
	group: '<svg viewBox="0 0 16 16" width="15" height="15"><path d="M1.5 4h5l1.5 1.5h6.5v8h-13z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
	new: '<svg viewBox="0 0 16 16" width="15" height="15"><path d="M4 2.5h6l2.5 2.5v8.5H4z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M1.5 1.5l3 3" stroke="currentColor" stroke-width="1"/><path d="M10 2.5V5h2.5" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
	trash: '<svg viewBox="0 0 16 16" width="15" height="15"><path d="M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.7 9h5.6l.7-9M6.8 6.5v5M9.2 6.5v5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
	lock_transparent: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M2 2h4v4H2zM10 2h4v4h-4zM6 6h4v4H6zM2 10h4v4H2zM10 10h4v4h-4z" fill="currentColor"/></svg>',
	lock_image: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M12 1.5c.4.4-3.3 5.3-4.6 6.4L6.2 6.7C7.5 5.4 11.6 1.1 12 1.5z" fill="currentColor"/><path d="M5.6 7.2c-1.2 0-2.1.7-2.3 2-.1 1.1-.6 1.6-1.4 2 1.9.9 4.6.4 5-1.5.1-.7-.2-1.7-1.3-2.5z" fill="currentColor"/></svg>',
	lock_position: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M8 1v14M1 8h14M8 1L6 3.2M8 1l2 2.2M8 15l-2-2.2M8 15l2-2.2M1 8l2.2-2M1 8l2.2 2M15 8l-2.2-2M15 8l-2.2 2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
	lock_all: '<svg viewBox="0 0 16 16" width="13" height="13"><rect x="3" y="7" width="10" height="7.5" rx="1" fill="currentColor"/><path d="M5.2 7V5a2.8 2.8 0 0 1 5.6 0v2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
	folder: '<svg viewBox="0 0 18 16" width="18" height="16"><path d="M1.5 3h5l1.5 1.5h8.5v9.5h-15z" fill="#c9a24a" stroke="#6b5523" stroke-width="1"/></svg>',
	clip: '<svg viewBox="0 0 10 10" width="9" height="9"><path d="M2 1v5h6M8 6L5.5 3.5M8 6L5.5 8.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
	filter_kinds: '<svg viewBox="0 0 70 14" width="70" height="14"><rect x="1" y="2" width="10" height="10" fill="none" stroke="currentColor"/><circle cx="20" cy="7" r="5" fill="none" stroke="currentColor"/><path d="M20 2a5 5 0 0 1 0 10z" fill="currentColor"/><text x="34" y="11.5" font-size="11" font-family="Times New Roman, serif" fill="currentColor">T</text><rect x="44" y="2.5" width="10" height="9" rx="1" fill="none" stroke="currentColor"/><path d="M47 5h4v4h-4z" fill="currentColor"/><rect x="58" y="2" width="10" height="10" fill="none" stroke="currentColor"/><path d="M60 10l3-4 3 4z" fill="currentColor"/></svg>',
};

var template = `
	<div class="ps_layers_filter">
		<select disabled title="Filter type"><option>Kind</option></select>
		<span class="ps_kind_icons disabled" title="Layer filtering is not available yet">${ICON.filter_kinds}</span>
		<span class="ps_filter_toggle disabled"></span>
	</div>
	<div class="ps_layers_row">
		<select id="ps_blend_mode" title="Set the blending mode for the layer"></select>
		<label for="ps_layer_opacity">Opacity:</label>
		<input type="text" id="ps_layer_opacity" class="ps_pct" value="100%" />
	</div>
	<div class="ps_layers_row">
		<span class="ps_lock_label">Lock:</span>
		<span class="ps_lock disabled" title="Lock transparent pixels">${ICON.lock_transparent}</span>
		<span class="ps_lock disabled" title="Lock image pixels">${ICON.lock_image}</span>
		<span class="ps_lock disabled" title="Lock position">${ICON.lock_position}</span>
		<span class="ps_lock disabled" title="Lock all">${ICON.lock_all}</span>
		<label class="ps_fill_label" for="ps_layer_fill">Fill:</label>
		<input type="text" id="ps_layer_fill" class="ps_pct" value="100%" />
	</div>
	<div class="layers_list" id="layers"></div>
	<div class="ps_layers_footer">
		<button type="button" class="disabled" title="Link layers">${ICON.link}</button>
		<button type="button" id="ps_layer_fx" title="Add a layer style">${ICON.fx}</button>
		<button type="button" id="ps_layer_mask" title="Add layer mask">${ICON.mask}</button>
		<button type="button" id="ps_layer_adjust" title="Create new fill or adjustment layer">${ICON.adjust}</button>
		<button type="button" id="ps_layer_group" title="Create a new group">${ICON.group}</button>
		<button type="button" id="insert_layer" title="Create a new layer">${ICON.new}</button>
		<button type="button" id="ps_layer_delete" title="Delete layer">${ICON.trash}</button>
	</div>
`;

/**
 * GUI class responsible for rendering layers on right sidebar
 */
class GUI_layers_class {

	constructor(ctx) {
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.Effects_browser = new Effects_browser_class();
		this.Layer_duplicate = new Layer_duplicate_class();
		this.drag_id = null;
	}

	render_main_layers() {
		document.getElementById('layers_base').innerHTML = template;
		var select = document.getElementById('ps_blend_mode');
		for (var mode of BLEND_MODES) {
			var option = document.createElement('option');
			if (mode === '-') {
				option.disabled = true;
				option.textContent = '──────────';
			}
			else {
				option.textContent = mode[0];
				option.value = mode[1] || '';
				option.disabled = mode[1] == null;
			}
			select.appendChild(option);
		}
		this.render_layers();
		this.set_events();
	}

	set_events() {
		var _this = this;
		var base = document.getElementById('layers_base');

		base.addEventListener('click', function (event) {
			var target = event.target.closest('[data-action], button[id], .ps_layer_row');
			if (!target) {
				return;
			}
			var action = target.dataset.action;
			if (target.id == 'insert_layer') {
				app.State.do_action(new app.Actions.Insert_layer_action());
			}
			else if (target.id == 'ps_layer_delete') {
				if (config.layer.type == 'ps_group') {
					app.GUI.Ps_workspace.Groups.delete_group(config.layer);
				}
				else {
					app.State.do_action(new app.Actions.Delete_layer_action(config.layer.id));
				}
			}
			else if (target.id == 'ps_layer_group') {
				app.GUI.Ps_workspace.Groups.new_group();
			}
			else if (action == 'toggle_group') {
				app.GUI.Ps_workspace.Groups.toggle_collapsed(_this.Base_layers.get_layer(target.dataset.id));
			}
			else if (target.id == 'ps_layer_fx') {
				show_popup_menu(target, layer_style_items(), {placement: 'below'});
			}
			else if (target.id == 'ps_layer_mask') {
				app.GUI.Ps_workspace.Mask.add(event.altKey);
			}
			else if (action == 'mask_thumb' || action == 'layer_thumb') {
				var layer = _this.Base_layers.get_layer(target.dataset.id);
				var Mask = app.GUI.Ps_workspace.Mask;
				if (action == 'mask_thumb' && event.shiftKey) {
					if (layer.id != config.layer.id) {
						app.State.do_action(new app.Actions.Select_layer_action(layer.id)).then(() => Mask.toggle_disabled());
					}
					else {
						Mask.toggle_disabled();
					}
					return;
				}
				var select = layer.id != config.layer.id
					? app.State.do_action(new app.Actions.Select_layer_action(layer.id))
					: Promise.resolve();
				select.then(() => Mask.set_editing(layer, action == 'mask_thumb'));
			}
			else if (target.id == 'ps_layer_adjust') {
				show_popup_menu(target, adjustment_items(true), {placement: 'below'});
			}
			else if (action == 'visibility') {
				app.State.do_action(new app.Actions.Toggle_layer_visibility_action(target.dataset.id));
			}
			else if (action == 'delete_filter') {
				app.State.do_action(new app.Actions.Delete_layer_filter_action(target.dataset.pid, target.dataset.id));
			}
			else if (action == 'edit_style') {
				app.GUI.Ps_workspace.Styles.open(_this.Base_layers.get_layer(target.dataset.pid), target.dataset.key);
			}
			else if (action == 'edit_filter') {
				_this.edit_filter(target.dataset.pid, target.dataset.id, target.dataset.filter);
			}
			else if (target.classList.contains('ps_layer_row')) {
				if (target.dataset.id != config.layer.id) {
					app.State.do_action(new app.Actions.Select_layer_action(target.dataset.id));
				}
			}
		});

		base.addEventListener('dblclick', function (event) {
			var name = event.target.closest('.ps_layer_name');
			if (name) {
				_this.start_rename(name);
				return;
			}
			var row = event.target.closest('.ps_layer_row');
			if (row && row.classList.contains('ps_group_row')) {
				return;
			}
			if (row && !event.target.closest('[data-action]')) {
				//CS6: double-click the layer row opens Layer Style > Blending Options
				app.GUI.Ps_workspace.Styles.open(_this.Base_layers.get_layer(row.dataset.id), 'blending');
			}
		});

		document.getElementById('ps_blend_mode').addEventListener('change', function () {
			if (!this.value) {
				return;
			}
			app.State.do_action(new app.Actions.Bundle_action('blending_change', 'Blending Change', [
				new app.Actions.Update_layer_action(config.layer.id, {composition: this.value})
			]));
		});

		var fill = document.getElementById('ps_layer_fill');
		fill.addEventListener('change', function () {
			var value = Math.max(0, Math.min(100, parseInt(this.value, 10)));
			if (isNaN(value)) {
				_this.render_controls();
				return;
			}
			app.State.do_action(new app.Actions.Bundle_action('fill_change', 'Fill Opacity Change', [
				new app.Actions.Update_layer_action(config.layer.id, {ps_fill: value})
			]));
		});
		fill.addEventListener('keydown', function (event) {
			if (event.key == 'Enter') this.blur();
		});

		var opacity = document.getElementById('ps_layer_opacity');
		opacity.addEventListener('change', function () {
			var value = Math.max(0, Math.min(100, parseInt(this.value, 10)));
			if (isNaN(value)) {
				_this.render_controls();
				return;
			}
			app.State.do_action(new app.Actions.Bundle_action('opacity_change', 'Opacity Change', [
				new app.Actions.Update_layer_action(config.layer.id, {opacity: value})
			]));
		});
		opacity.addEventListener('keydown', function (event) {
			if (event.key == 'ArrowUp' || event.key == 'ArrowDown') {
				event.preventDefault();
				var step = event.shiftKey ? 10 : 1;
				var value = parseInt(this.value, 10) || 0;
				this.value = Math.max(0, Math.min(100, value + (event.key == 'ArrowUp' ? step : -step))) + '%';
				this.dispatchEvent(new Event('change'));
			}
			if (event.key == 'Enter') {
				this.blur();
			}
		});

		//drag and drop: reorder, drop on trash = delete, drop on new layer = duplicate
		base.addEventListener('dragstart', function (event) {
			var row = event.target.closest('.ps_layer_row');
			if (!row) {
				return;
			}
			_this.drag_id = parseInt(row.dataset.id);
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', row.dataset.id);
		});
		base.addEventListener('dragover', function (event) {
			if (_this.drag_id === null) {
				return;
			}
			event.preventDefault();
			base.querySelectorAll('.drop_above, .drop_below').forEach(el => el.classList.remove('drop_above', 'drop_below'));
			var row = event.target.closest('.ps_layer_row');
			if (row) {
				var rect = row.getBoundingClientRect();
				row.classList.add(event.clientY < rect.top + rect.height / 2 ? 'drop_above' : 'drop_below');
			}
		});
		base.addEventListener('dragend', function () {
			_this.drag_id = null;
			base.querySelectorAll('.drop_above, .drop_below').forEach(el => el.classList.remove('drop_above', 'drop_below'));
		});
		base.addEventListener('drop', function (event) {
			event.preventDefault();
			var id = _this.drag_id;
			_this.drag_id = null;
			if (id === null) {
				return;
			}
			if (event.target.closest('#ps_layer_delete')) {
				var dropped = _this.Base_layers.get_layer(id);
				if (dropped && dropped.type == 'ps_group') {
					app.GUI.Ps_workspace.Groups.delete_group(dropped);
				}
				else {
					app.State.do_action(new app.Actions.Delete_layer_action(id));
				}
				return;
			}
			if (event.target.closest('#insert_layer')) {
				_this.Base_layers.select(id).then(() => _this.Layer_duplicate.duplicate());
				return;
			}
			var row = event.target.closest('.ps_layer_row');
			if (!row) {
				return;
			}
			var rect = row.getBoundingClientRect();
			app.GUI.Ps_workspace.Groups.move(_this.Base_layers.get_layer(id), _this.Base_layers.get_layer(row.dataset.id), event.clientY < rect.top + rect.height / 2);
		});
	}

	start_rename(name_el) {
		var id = name_el.dataset.id;
		var layer = this.Base_layers.get_layer(id);
		var input = document.createElement('input');
		input.type = 'text';
		input.className = 'ps_layer_rename';
		input.value = layer.name;
		name_el.replaceWith(input);
		input.focus();
		input.select();
		var done = false;
		var commit = (save) => {
			if (done) {
				return;
			}
			done = true;
			var value = input.value.trim();
			if (save && value && value != layer.name) {
				app.State.do_action(new app.Actions.Bundle_action('rename_layer', 'Rename Layer', [
					new app.Actions.Update_layer_action(id, {name: value})
				]));
			}
			else {
				this.render_layers();
			}
		};
		input.addEventListener('keydown', (event) => {
			event.stopPropagation();
			if (event.key == 'Enter') commit(true);
			if (event.key == 'Escape') commit(false);
		});
		input.addEventListener('blur', () => commit(true));
	}

	edit_filter(layer_id, filter_id, filter_name) {
		var effects = this.Effects_browser.get_effects_list();
		var key = filter_name.toLowerCase();
		for (var i in effects) {
			if (effects[i].title.toLowerCase() == key) {
				this.Base_layers.select(layer_id);
				var function_name = this.Effects_browser.get_function_from_path(key);
				effects[i].object[function_name](filter_id);
			}
		}
	}

	render_controls() {
		if (!config.layer) {
			return;
		}
		var select = document.getElementById('ps_blend_mode');
		var composition = config.layer.composition || 'source-over';
		if (composition == 'source-atop') {
			//clipping mask is shown as a clipped Normal layer
			composition = 'source-over';
		}
		select.value = composition;
		document.getElementById('ps_layer_opacity').value = Math.round(config.layer.opacity) + '%';
		document.getElementById('ps_layer_fill').value = (config.layer.ps_fill == null ? 100 : config.layer.ps_fill) + '%';
	}

	draw_thumbnail(canvas, layer) {
		var ctx = canvas.getContext('2d');
		var size = canvas.width;
		var W = config.WIDTH;
		var H = config.HEIGHT;
		var scale = Math.min(size / W, size / H);
		var w = Math.max(1, Math.round(W * scale));
		var h = Math.max(1, Math.round(H * scale));
		var ox = Math.floor((size - w) / 2);
		var oy = Math.floor((size - h) / 2);
		ctx.clearRect(0, 0, size, size);
		//transparency checkerboard
		var cell = 4;
		for (var y = 0; y < h; y += cell) {
			for (var x = 0; x < w; x += cell) {
				ctx.fillStyle = ((x / cell + y / cell) % 2 == 0) ? '#ffffff' : '#cccccc';
				ctx.fillRect(ox + x, oy + y, Math.min(cell, w - x), Math.min(cell, h - y));
			}
		}
		ctx.save();
		ctx.beginPath();
		ctx.rect(ox, oy, w, h);
		ctx.clip();
		ctx.translate(ox, oy);
		ctx.scale(scale, scale);
		var visible = layer.visible;
		try {
			layer.visible = true;
			this.Base_layers.render_object(ctx, layer, true);
		} catch (e) {
			//thumbnail is best-effort
		}
		layer.visible = visible;
		ctx.restore();
	}

	/**
	 * renders layers list
	 */
	render_layers() {
		var target = document.getElementById('layers');
		if (!target) {
			return;
		}
		var Groups = app.GUI && app.GUI.Ps_workspace ? app.GUI.Ps_workspace.Groups : null;
		var layers = Groups ? Groups.ordered() : config.layers.concat().sort((a, b) => b.order - a.order);
		var html = '';

		if (config.layer) {
			for (var value of layers) {
				var depth = Groups ? Groups.depth(value) : 0;
				if (Groups && Groups.ancestors(value).some(g => g.ps_collapsed)) {
					continue;
				}
				var indent = depth ? '<span class="ps_indent" style="width:' + (depth * 16) + 'px"></span>' : '';
				if (value.type == 'ps_group') {
					html += '<div class="ps_layer_row ps_group_row' + (value.id == config.layer.id ? ' active' : '') + (value.visible != true ? ' hidden_layer' : '') + '" data-id="' + value.id + '" draggable="true">';
					html += '<button type="button" class="ps_eye' + (value.visible == true ? ' on' : '') + '" data-action="visibility" data-id="' + value.id + '" title="Indicates layer visibility">' + ICON.eye + '</button>';
					html += indent;
					html += '<span class="ps_group_toggle' + (value.ps_collapsed ? '' : ' open') + '" data-action="toggle_group" data-id="' + value.id + '"></span>';
					html += '<span class="ps_folder">' + ICON.folder + '</span>';
					html += '<span class="ps_layer_name" data-id="' + value.id + '">' + this.Helper.escapeHtml(value.name) + '</span>';
					html += '</div>';
					continue;
				}
				var classes = 'ps_layer_row';
				var clipped = value.composition === 'source-atop';
				if (clipped) classes += ' clipped';
				if (value.id == config.layer.id) classes += ' active';
				if (value.visible != true) classes += ' hidden_layer';

				var Styles = app.GUI && app.GUI.Ps_workspace ? app.GUI.Ps_workspace.Styles : null;
				var style_names = Styles ? Styles.enabled_names(value) : [];
				var has_filters = (value.filters && value.filters.length > 0) || style_names.length > 0;
				html += '<div class="' + classes + '" data-id="' + value.id + '" draggable="true">';
				html += '<button type="button" class="ps_eye' + (value.visible == true ? ' on' : '') + '" data-action="visibility" data-id="' + value.id + '" title="Indicates layer visibility">' + ICON.eye + '</button>';
				html += indent;
				if (clipped) {
					html += '<span class="ps_clip_arrow">' + ICON.clip + '</span>';
				}
				var editing_mask = !!(value.ps_mask && value.ps_mask_editing);
				html += '<canvas class="ps_thumb' + (value.ps_mask && !editing_mask && value.id == config.layer.id ? ' targeted' : '') + '" width="32" height="32" data-id="' + value.id + '" data-action="layer_thumb"></canvas>';
				if (value.ps_mask) {
					html += '<span class="ps_mask_link">' + ICON.link + '</span>';
					html += '<span class="ps_mask_wrap' + (value.ps_mask_disabled ? ' disabled' : '') + '">'
						+ '<canvas class="ps_mask_thumb' + (editing_mask && value.id == config.layer.id ? ' targeted' : '') + '" width="32" height="32" data-id="' + value.id + '" data-action="mask_thumb" title="Layer mask (Shift+click to disable)"></canvas></span>';
				}
				var is_background = value.name == 'Background' && value === layers[layers.length - 1];
				html += '<span class="ps_layer_name' + (is_background ? ' background' : '') + '" data-id="' + value.id + '">' + this.Helper.escapeHtml(value.name) + '</span>';
				if (is_background) {
					html += '<span class="ps_layer_lock" title="Background layer">' + ICON.lock_all + '</span>';
				}
				if (has_filters) {
					html += '<span class="ps_layer_fx" title="Layer effects">fx</span>';
				}
				html += '</div>';

				if (has_filters) {
					html += '<div class="ps_effects">';
					html += '<div class="ps_effect_head">' + ICON.eye + '<span>Effects</span></div>';
					for (var sn of style_names) {
						html += '<div class="ps_effect">';
						html += '<span class="ps_effect_name" data-action="edit_style" data-pid="' + value.id + '" data-key="' + sn[0] + '">' + sn[1] + '</span>';
						html += '</div>';
					}
					for (var filter of value.filters) {
						var title = this.Helper.ucfirst(filter.name).replace(/-/g, ' ');
						html += '<div class="ps_effect">';
						html += '<span class="ps_effect_name" data-action="edit_filter" data-pid="' + value.id + '" data-id="' + filter.id + '" data-filter="' + filter.name + '">' + title + '</span>';
						html += '<span class="ps_effect_delete" data-action="delete_filter" data-pid="' + value.id + '" data-id="' + filter.id + '" title="Delete effect">&times;</span>';
						html += '</div>';
					}
					html += '</div>';
				}
			}
		}

		target.innerHTML = html;
		target.querySelectorAll('canvas.ps_thumb').forEach((canvas) => {
			var layer = this.Base_layers.get_layer(canvas.dataset.id);
			if (layer) {
				this.draw_thumbnail(canvas, layer);
			}
		});
		target.querySelectorAll('canvas.ps_mask_thumb').forEach((canvas) => {
			var layer = this.Base_layers.get_layer(canvas.dataset.id);
			if (layer && layer.ps_mask) {
				app.GUI.Ps_workspace.Mask.thumbnail(canvas, layer);
			}
		});
		this.render_controls();
		if (app.GUI && app.GUI.Ps_workspace) {
			app.GUI.Ps_workspace.on_layers_changed();
		}
	}
}

export default GUI_layers_class;
