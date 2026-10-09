/*
 * pshot - Photoshop CS6 commands that miniPaint has no module for.
 * Menu targets look like 'ps/commands.<function>'.
 */

import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import Dialog_class from './../../libs/popup.js';
import { ensure_pixel_layer } from './../../ps/pixel-layer.js';
import { open_document, place, save_psd } from './../../ps/document.js';
import Ps_adjust_class from './../../ps/adjust.js';
import { show_new_dialog } from './../../ps/new-dialog.js';
import Ps_size_dialogs_class from './../../ps/size-dialogs.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

var instance = null;

class Ps_commands_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		this.Base_layers = new Base_layers_class();
		this.POP = new Dialog_class();
		this.undo_toggle_index = null;
		this.last_selection = null;
		this.last_filter_target = null;
		this.Adjust = new Ps_adjust_class();
		this.Size = new Ps_size_dialogs_class();
	}

	noop() {
	}

	levels() { this.Adjust.levels(); }
	exposure() { this.Adjust.exposure(); }
	vibrance() { this.Adjust.vibrance(); }
	color_balance() { this.Adjust.color_balance(); }
	photo_filter() { this.Adjust.photo_filter(); }
	channel_mixer() { this.Adjust.channel_mixer(); }
	gradient_map() { this.Adjust.gradient_map(); }
	selective_color() { this.Adjust.selective_color(); }
	shadows_highlights() { this.Adjust.shadows_highlights(); }
	equalize() { this.Adjust.equalize(); }

	new_adjustment_layer(kind) { app.GUI.Ps_workspace.Adjustment_layers.create(kind); }

	layer_style(key) { app.GUI.Ps_workspace.Styles.open(null, key || 'blending'); }
	copy_layer_style() { app.GUI.Ps_workspace.Styles.copy(); }
	paste_layer_style() { app.GUI.Ps_workspace.Styles.paste(); }

	group_layers() {
		if (app.GUI.Ps_workspace.Multi.multiple()) {
			return app.GUI.Ps_workspace.Multi.group();
		}
		app.GUI.Ps_workspace.Groups.group_layers();
	}

	/**
	 * Ctrl+E: Merge Down, or Merge Layers with several layers selected
	 */
	merge_down() {
		if (app.GUI.Ps_workspace.Multi.multiple()) {
			return app.GUI.Ps_workspace.Multi.merge();
		}
		var Groups = app.GUI.Ps_workspace.Groups;
		var upper = config.layer;
		var list = Groups.ordered();
		var lower = list[list.indexOf(upper) + 1];
		if (!upper || !lower || Groups.is_group(upper) || Groups.is_group(lower) || lower.ps_parent != upper.ps_parent || lower.type == 'ps_adjust') {
			alertify.error('Could not complete the Merge Down command because the layer below is not a pixel layer in the same group.');
			return;
		}
		if (upper.visible === false || lower.visible === false) {
			alertify.error('Could not complete the Merge Down command because the target layer is hidden.');
			return;
		}
		//CS6: the upper layer is blended into the lower one, which keeps its name, opacity and blend mode
		var canvas = document.createElement('canvas');
		canvas.width = config.WIDTH;
		canvas.height = config.HEIGHT;
		var ctx = canvas.getContext('2d');
		var render = (layer, alpha, op) => {
			ctx.save();
			ctx.globalAlpha = alpha;
			ctx.globalCompositeOperation = op;
			layer._ps_ignore_groups = true;
			this.Base_layers.render_object(ctx, layer);
			delete layer._ps_ignore_groups;
			ctx.restore();
		};
		render(lower, 1, 'source-over');
		if (upper.type == 'ps_adjust') {
			app.GUI.Ps_workspace.Adjustment_layers.apply(ctx, upper, (upper.opacity == null ? 100 : upper.opacity) / 100);
		}
		else {
			render(upper, (upper.opacity == null ? 100 : upper.opacity) / 100, upper.composition || 'source-over');
		}
		app.State.do_action(new app.Actions.Bundle_action('merge_layers', 'Merge Down', [
			new app.Actions.Insert_layer_action({
				type: 'image', name: lower.name, order: lower.order, ps_parent: lower.ps_parent || null,
				opacity: lower.opacity, composition: lower.composition,
				x: 0, y: 0, width: canvas.width, height: canvas.height, width_original: canvas.width, height_original: canvas.height,
				data: canvas.toDataURL('image/png'),
			}, false),
			new app.Actions.Delete_layer_action(upper.id, true),
			new app.Actions.Delete_layer_action(lower.id, true),
		])).then(() => Groups.after_change());
	}

	/**
	 * the visible layers composited (groups, adjustment layers and blend modes included)
	 */
	composite_visible() {
		var canvas = document.createElement('canvas');
		canvas.width = config.WIDTH;
		canvas.height = config.HEIGHT;
		this.Base_layers.convert_layers_to_canvas(canvas.getContext('2d'), null, false);
		return canvas;
	}

	/**
	 * Layer > Flatten Image: one Background layer; hidden layers are discarded (CS6 asks first)
	 */
	async flatten_image() {
		if (config.layers.some(l => l.visible === false && l.type != 'ps_group') && !window.confirm('Discard hidden layers?')) {
			return;
		}
		var flat = this.composite_visible();
		var canvas = document.createElement('canvas');
		canvas.width = flat.width;
		canvas.height = flat.height;
		var ctx = canvas.getContext('2d');
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(flat, 0, 0);
		var actions = [new app.Actions.Insert_layer_action({
			type: 'image', name: 'Background', order: 0, ps_parent: null,
			x: 0, y: 0, width: canvas.width, height: canvas.height, width_original: canvas.width, height_original: canvas.height,
			data: canvas.toDataURL('image/png'),
		}, false)];
		for (var l of config.layers.slice()) {
			actions.push(new app.Actions.Delete_layer_action(l.id, true));
		}
		app.GUI.Ps_workspace.Multi.clear();
		await app.State.do_action(new app.Actions.Bundle_action('flatten_image', 'Flatten Image', actions));
		app.GUI.Ps_workspace.Groups.after_change();
	}
	ungroup_layers() { app.GUI.Ps_workspace.Groups.ungroup(); }
	new_group() { app.GUI.Ps_workspace.Groups.new_group(); }

	delete_layer() {
		if (app.GUI.Ps_workspace.Multi.multiple()) {
			return app.GUI.Ps_workspace.Multi.delete();
		}
		var layer = config.layer;
		if (layer && layer.type == 'ps_group') {
			return app.GUI.Ps_workspace.Groups.delete_group(layer);
		}
		return app.GUI.modules['layer/delete'].delete();
	}

	mask_add(hide) { app.GUI.Ps_workspace.Mask.add(hide); }
	mask_reveal_all() { app.GUI.Ps_workspace.Mask.reveal_all(); }
	mask_hide_all() { app.GUI.Ps_workspace.Mask.hide_all(); }
	mask_reveal_selection() { app.GUI.Ps_workspace.Mask.reveal_selection(); }
	mask_hide_selection() { app.GUI.Ps_workspace.Mask.hide_selection(); }
	mask_delete() { app.GUI.Ps_workspace.Mask.remove(); }
	mask_apply() { app.GUI.Ps_workspace.Mask.apply(); }
	mask_toggle() { app.GUI.Ps_workspace.Mask.toggle_disabled(); }
	curves() { this.Adjust.curves(); }
	hue_saturation() { this.Adjust.hue_saturation(); }
	brightness_contrast() { this.Adjust.brightness_contrast(); }

	/**
	 * the active selection's bounding box in document pixels, or null
	 */
	get_selection() {
		return app.GUI.Ps_workspace.Selection.bounds;
	}

	selection() {
		return app.GUI.Ps_workspace.Selection;
	}

	require_image_layer() {
		var locks = (config.layer && config.layer.ps_lock) || {};
		if (locks.all || locks.image) {
			alertify.error('Could not complete your request because the layer is locked.');
			return false;
		}
		ensure_pixel_layer();
		if (config.layer.type != 'image') {
			alertify.error('Could not complete your request because the layer is not a pixel layer. Rasterize it first (Layer > Rasterize > Layer).');
			return false;
		}
		return true;
	}

	/**
	 * copy of the active image layer at its original resolution
	 */
	layer_canvas() {
		var layer = config.layer;
		var canvas = document.createElement('canvas');
		canvas.width = layer.width_original;
		canvas.height = layer.height_original;
		canvas.getContext('2d').drawImage(layer.link, 0, 0);
		return canvas;
	}

	/**
	 * CS6 Ctrl+Z: undoes the last step, pressed again redoes it (single toggle).
	 * Multi-level undo is Step Backward / Step Forward.
	 */
	async toggle_undo() {
		if (this.undo_toggle_index !== null && this.undo_toggle_index === app.State.action_history_index
			&& app.State.can_redo()) {
			await app.State.redo_action();
			this.undo_toggle_index = null;
		}
		else if (app.State.can_undo()) {
			await app.State.undo_action();
			this.undo_toggle_index = app.State.action_history_index;
		}
		app.GUI.GUI_layers.render_layers();
		config.need_render = true;
	}

	undo_label() {
		var state = app.State;
		if (this.undo_toggle_index !== null && this.undo_toggle_index === state.action_history_index && state.can_redo()) {
			return 'Redo ' + state.action_history[state.action_history_index].action_description;
		}
		if (state.can_undo()) {
			return 'Undo ' + state.action_history[state.action_history_index - 1].action_description;
		}
		return 'Undo';
	}

	async cut() {
		if (!this.selection().has()) {
			alertify.error('Could not complete the Cut command because the selected area is empty.');
			return;
		}
		await this.copy();
		this.clear();
	}

	clear() {
		var sel = this.selection();
		if (!sel.has()) {
			return;
		}
		if (!this.require_image_layer()) {
			return;
		}
		var canvas = this.layer_canvas();
		var ctx = canvas.getContext('2d');
		ctx.globalCompositeOperation = 'destination-out';
		ctx.drawImage(sel.mask_for_layer(config.layer), 0, 0);
		app.State.do_action(
			new app.Actions.Bundle_action('clear', 'Clear', [
				new app.Actions.Update_layer_image_action(canvas)
			])
		);
	}

	fill() {
		var _this = this;
		if (!this.require_image_layer()) {
			return;
		}
		var settings = {
			title: 'Fill',
			params: [
				{name: 'use', title: 'Use:', value: 'Foreground Color', values: ['Foreground Color', 'Background Color', 'Black', '50% Gray', 'White']},
				{name: 'opacity', title: 'Opacity (%):', value: 100, range: [1, 100]},
			],
			on_finish: function (params) {
				var colors = {
					'Foreground Color': config.COLOR,
					'Background Color': config.BG_COLOR,
					'Black': '#000000',
					'50% Gray': '#808080',
					'White': '#ffffff',
				};
				_this.fill_with(colors[params.use], params.opacity / 100, 'Fill');
			},
		};
		this.POP.show(settings);
	}

	fill_with(color, alpha, description) {
		var Mask = app.GUI.Ps_workspace.Mask;
		if (this.selection().quick_mask) {
			//Quick Mask: fill paints the selection (inside any current selection in CS6 it fills all)
			var qarea = document.createElement('canvas');
			qarea.width = config.WIDTH;
			qarea.height = config.HEIGHT;
			var qctx = qarea.getContext('2d');
			qctx.fillStyle = '#000';
			qctx.fillRect(0, 0, qarea.width, qarea.height);
			return this.selection().paint_quick_mask(qarea, color, alpha, description);
		}
		if (Mask.is_editing(config.layer)) {
			//filling while the layer mask is targeted fills the mask (CS6)
			var area = document.createElement('canvas');
			area.width = config.WIDTH;
			area.height = config.HEIGHT;
			var actx = area.getContext('2d');
			actx.fillStyle = '#000';
			actx.fillRect(0, 0, area.width, area.height);
			this.selection().clip_document_canvas(area);
			return Mask.paint(config.layer, area, color, alpha, description);
		}
		if (!this.require_image_layer()) {
			return;
		}
		var canvas = this.layer_canvas();
		var ctx = canvas.getContext('2d');
		var paint = document.createElement('canvas');
		paint.width = canvas.width;
		paint.height = canvas.height;
		var pctx = paint.getContext('2d');
		pctx.fillStyle = color;
		pctx.fillRect(0, 0, paint.width, paint.height);
		var sel = this.selection();
		if (sel.has()) {
			pctx.globalCompositeOperation = 'destination-in';
			pctx.drawImage(sel.mask_for_layer(config.layer), 0, 0);
		}
		ctx.globalAlpha = alpha;
		if (config.layer.ps_lock && config.layer.ps_lock.transparent) {
			ctx.globalCompositeOperation = 'source-atop';
		}
		ctx.drawImage(paint, 0, 0);
		app.State.do_action(
			new app.Actions.Bundle_action('fill', description, [
				new app.Actions.Update_layer_image_action(canvas)
			])
		);
	}

	/**
	 * the selected pixels of the active layer as a document-positioned canvas
	 * (or of all visible layers when merged)
	 */
	selected_pixels(merged) {
		var sel = this.selection();
		var source;
		if (merged) {
			source = document.createElement('canvas');
			source.width = config.WIDTH;
			source.height = config.HEIGHT;
			app.Layers.convert_layers_to_canvas(source.getContext('2d'), null, false);
		}
		else {
			source = app.Layers.convert_layer_to_canvas(config.layer.id, false, false);
		}
		sel.clip_document_canvas(source);
		var b = sel.bounds;
		var out = document.createElement('canvas');
		out.width = b.width;
		out.height = b.height;
		out.getContext('2d').drawImage(source, -b.x, -b.y);
		return { canvas: out, x: b.x, y: b.y };
	}

	/**
	 * CS6 Copy / Copy Merged: the selected pixels go to the clipboard
	 */
	async copy(merged) {
		var sel = this.selection();
		if (!sel.has()) {
			if (merged === true) {
				alertify.error('Could not complete the Copy Merged command because the selected area is empty.');
				return;
			}
			//no selection: copy the whole layer (miniPaint behaviour, Photopea does the same)
			return app.GUI.modules['edit/copy'].copy_to_clipboard();
		}
		var part = this.selected_pixels(merged === true);
		this.clipboard = part;
		this.clipboard_internal_only = false;
		try {
			var blob = await new Promise((resolve) => part.canvas.toBlob(resolve));
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
		} catch (e) {
			//system clipboard unavailable (permissions): Ctrl+V uses the internal clipboard
			this.clipboard_internal_only = true;
		}
	}

	copy_merged() {
		return this.copy(true);
	}

	/**
	 * Edit > Paste from the menu: the internal clipboard first (works without
	 * clipboard permissions), otherwise the system clipboard
	 */
	paste() {
		if (this.clipboard) {
			var c = this.clipboard.canvas;
			return app.GUI.modules['file/open'].on_paste(c.toDataURL('image/png'), c.width, c.height);
		}
		return app.GUI.modules['edit/paste'].paste();
	}

	/**
	 * Paste in Place: back at the position it was copied from
	 */
	paste_in_place() {
		if (!this.clipboard) {
			return this.paste();
		}
		var part = this.clipboard;
		return app.State.do_action(new app.Actions.Bundle_action('paste', 'Paste', [
			new app.Actions.Insert_layer_action({
				type: 'image', x: part.x, y: part.y,
				width: part.canvas.width, height: part.canvas.height,
				width_original: part.canvas.width, height_original: part.canvas.height,
				data: part.canvas.toDataURL('image/png'),
			}, false),
		]));
	}

	/**
	 * Edit > Paste Into / Paste Outside: the clipboard as a new layer, masked by the selection
	 */
	async paste_into(outside) {
		var sel = app.GUI.Ps_workspace.Selection;
		if (!sel.has()) {
			alertify.error('Could not complete the Paste ' + (outside ? 'Outside' : 'Into') + ' command because there is no selection.');
			return;
		}
		if (!this.clipboard) {
			return this.paste();
		}
		var part = this.clipboard;
		var d = sel.mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sel.mask.width, sel.mask.height).data;
		var x0 = sel.mask.width, y0 = sel.mask.height, x1 = -1, y1 = -1;
		for (var y = 0; y < sel.mask.height; y++) {
			for (var x = 0; x < sel.mask.width; x++) {
				if (d[(y * sel.mask.width + x) * 4 + 3] > 0) {
					if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
				}
			}
		}
		var mask = document.createElement('canvas');
		mask.width = sel.mask.width;
		mask.height = sel.mask.height;
		var mctx = mask.getContext('2d');
		if (outside) {
			mctx.fillStyle = '#fff';
			mctx.fillRect(0, 0, mask.width, mask.height);
			mctx.globalCompositeOperation = 'destination-out';
		}
		mctx.drawImage(sel.mask, 0, 0);
		//CS6 centers the pasted pixels on the selection
		var px = Math.round(x0 + (x1 - x0 + 1 - part.canvas.width) / 2), py = Math.round(y0 + (y1 - y0 + 1 - part.canvas.height) / 2);
		await app.State.do_action(new app.Actions.Bundle_action('paste', outside ? 'Paste Outside' : 'Paste Into', [
			new app.Actions.Insert_layer_action({
				type: 'image', x: px, y: py,
				width: part.canvas.width, height: part.canvas.height,
				width_original: part.canvas.width, height_original: part.canvas.height,
				data: part.canvas.toDataURL('image/png'),
				ps_mask: mask, ps_mask_x: px, ps_mask_y: py, ps_mask_disabled: false, ps_mask_editing: false,
			}, false),
		]));
		sel.deselect();
		app.GUI.GUI_layers.render_layers();
	}

	paste_outside() {
		return this.paste_into(true);
	}

	/**
	 * Edit > Stroke: an outline of the selection (or of the layer's pixels) in the foreground color
	 */
	stroke() {
		ensure_pixel_layer();
		var layer = config.layer;
		if (!layer || layer.type != 'image' || !layer.link) {
			alertify.error('Could not complete the Stroke command because the active layer is not a pixel layer.');
			return;
		}
		var POP = new Dialog_class();
		var saved = this.stroke_settings || { width: 1, location: 'Center', opacity: 100, mode: 'Normal', preserve: false };
		var modes = { 'Normal': 'source-over', 'Multiply': 'multiply', 'Screen': 'screen', 'Overlay': 'overlay', 'Darken': 'darken', 'Lighten': 'lighten',
			'Color Dodge': 'color-dodge', 'Color Burn': 'color-burn', 'Soft Light': 'soft-light', 'Hard Light': 'hard-light', 'Difference': 'difference',
			'Exclusion': 'exclusion', 'Hue': 'hue', 'Saturation': 'saturation', 'Color': 'color', 'Luminosity': 'luminosity' };
		POP.show({
			title: 'Stroke',
			params: [
				{ title: 'Stroke' },
				{ name: 'width', title: 'Width (px):', value: saved.width, range: [1, 250] },
				{ name: 'color', title: 'Color:', value: config.COLOR, type: 'color' },
				{ title: 'Location' },
				{ name: 'location', title: '', values: ['Inside', 'Center', 'Outside'], value: saved.location, type: 'radio' },
				{ title: 'Blending' },
				{ name: 'mode', title: 'Mode:', values: Object.keys(modes), value: saved.mode },
				{ name: 'opacity', title: 'Opacity (%):', value: saved.opacity, range: [1, 100] },
				{ name: 'preserve', title: 'Preserve Transparency', value: saved.preserve },
			],
			on_finish: (params) => {
				this.stroke_settings = { width: parseInt(params.width) || 1, location: params.location || 'Center', opacity: parseInt(params.opacity) || 100, mode: params.mode, preserve: !!params.preserve };
				this.apply_stroke(layer, this.stroke_settings, params.color || config.COLOR, modes[params.mode] || 'source-over');
			},
		});
	}

	apply_stroke(layer, s, color, op) {
		var sel = app.GUI.Ps_workspace.Selection;
		var W = config.WIDTH, H = config.HEIGHT;
		var shape = document.createElement('canvas');
		shape.width = W;
		shape.height = H;
		var sctx = shape.getContext('2d');
		if (sel.has()) {
			sctx.drawImage(sel.mask, 0, 0);
		}
		else {
			//no selection: the edge of the layer's pixels
			this.Base_layers.render_object(sctx, layer);
		}
		var grow = (src, r) => {
			var out = document.createElement('canvas');
			out.width = W;
			out.height = H;
			var ctx = out.getContext('2d');
			ctx.drawImage(src, 0, 0);
			if (r <= 0) return out;
			var steps = Math.max(16, Math.round(r * 6));
			for (var i = 0; i < steps; i++) {
				var a = i / steps * Math.PI * 2;
				for (var k = 1; k <= r; k++) ctx.drawImage(src, Math.cos(a) * k, Math.sin(a) * k);
			}
			return out;
		};
		var invert = (src) => {
			var out = document.createElement('canvas');
			out.width = W;
			out.height = H;
			var ctx = out.getContext('2d');
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, W, H);
			ctx.globalCompositeOperation = 'destination-out';
			ctx.drawImage(src, 0, 0);
			return out;
		};
		var outer_r = s.location == 'Outside' ? s.width : (s.location == 'Center' ? Math.ceil(s.width / 2) : 0);
		var inner_r = s.location == 'Inside' ? s.width : (s.location == 'Center' ? Math.floor(s.width / 2) : 0);
		var outer = grow(shape, outer_r);
		var inner = inner_r > 0 ? invert(grow(invert(shape), inner_r)) : shape;
		var ring = document.createElement('canvas');
		ring.width = W;
		ring.height = H;
		var rctx = ring.getContext('2d');
		rctx.drawImage(outer, 0, 0);
		rctx.globalCompositeOperation = 'destination-out';
		rctx.drawImage(inner, 0, 0);
		rctx.globalCompositeOperation = 'source-in';
		rctx.fillStyle = color;
		rctx.fillRect(0, 0, W, H);
		//into the layer's pixels
		var out = document.createElement('canvas');
		out.width = layer.width_original;
		out.height = layer.height_original;
		var octx = out.getContext('2d');
		octx.drawImage(layer.link, 0, 0);
		var sx = layer.width_original / layer.width, sy = layer.height_original / layer.height;
		octx.setTransform(sx, 0, 0, sy, -layer.x * sx, -layer.y * sy);
		octx.globalAlpha = s.opacity / 100;
		octx.globalCompositeOperation = s.preserve || (layer.ps_lock && layer.ps_lock.transparency) ? 'source-atop' : op;
		octx.drawImage(ring, 0, 0);
		app.State.do_action(new app.Actions.Bundle_action('stroke', 'Stroke', [
			new app.Actions.Update_layer_image_action(out, layer.id),
		]));
	}

	/**
	 * Edit > Fade (Shift+Ctrl+F): blend the result of the last pixel operation with
	 * the state before it, at an opacity and blend mode
	 */
	async fade() {
		var history = app.State.action_history;
		var last = history[app.State.action_history_index - 1];
		var layer = config.layer;
		if (!last || !layer || layer.type != 'image' || !layer.link) {
			return;
		}
		var copy = (src) => {
			var c = document.createElement('canvas');
			c.width = src.width;
			c.height = src.height;
			c.getContext('2d').drawImage(src, 0, 0);
			return c;
		};
		var after = copy(layer.link);
		var layer_id = layer.id;
		await app.State.undo_action();
		layer = this.Base_layers.get_layer(layer_id);
		if (!layer || !layer.link || layer.link.width != after.width || layer.link.height != after.height) {
			await app.State.redo_action();
			alertify.error('Could not Fade because the last step did not change the pixels of this layer.');
			return;
		}
		if (layer !== config.layer) {
			await app.State.do_action(new app.Actions.Select_layer_action(layer_id));
		}
		var modes = { 'Normal': 'source-over', 'Multiply': 'multiply', 'Screen': 'screen', 'Overlay': 'overlay', 'Darken': 'darken', 'Lighten': 'lighten',
			'Color Dodge': 'color-dodge', 'Color Burn': 'color-burn', 'Soft Light': 'soft-light', 'Hard Light': 'hard-light', 'Difference': 'difference',
			'Exclusion': 'exclusion', 'Hue': 'hue', 'Saturation': 'saturation', 'Color': 'color', 'Luminosity': 'luminosity' };
		var html = '<div class="ps_adj_slider"><span>Opacity:</span><input type="number" id="fade_opacity_n" min="0" max="100" value="100"><span class="ps_adj_unit">%</span>'
			+ '<input type="range" id="fade_opacity" min="0" max="100" value="100"></div>'
			+ '<div class="ps_adj_row"><span>Mode:</span><select id="fade_mode">' + Object.keys(modes).map(m => '<option>' + m + '</option>').join('') + '</select></div>';
		var name = last.action_description;
		this.Adjust.show('Fade', html, (root, state, update) => {
			state.opacity = 100;
			state.mode = 'Normal';
			var r = root.querySelector('#fade_opacity'), n = root.querySelector('#fade_opacity_n');
			var set = (v) => { if (isNaN(v)) return; state.opacity = Math.max(0, Math.min(100, v)); r.value = n.value = state.opacity; update(); };
			r.addEventListener('input', () => set(parseFloat(r.value)));
			n.addEventListener('change', () => set(parseFloat(n.value)));
			root.querySelector('#fade_mode').addEventListener('change', (e) => { state.mode = e.target.value; update(); });
		}, (state) => (src, dst, w, h) => {
			var c = document.createElement('canvas');
			c.width = w;
			c.height = h;
			var ctx = c.getContext('2d', { willReadFrequently: true });
			ctx.putImageData(new ImageData(new Uint8ClampedArray(src), w, h), 0, 0);
			ctx.globalAlpha = state.opacity / 100;
			ctx.globalCompositeOperation = modes[state.mode] || 'source-over';
			ctx.drawImage(after, 0, 0);
			dst.set(ctx.getImageData(0, 0, w, h).data);
		}, 'fade', {
			history_name: 'Fade ' + name,
			cancel: () => app.State.redo_action(),
		});
	}

	free_transform() {
		var locks = (config.layer && config.layer.ps_lock) || {};
		if (locks.all || locks.position || locks.image) {
			alertify.error('Could not complete the Free Transform command because the layer is locked.');
			return;
		}
		app.GUI.Ps_workspace.Transform.start();
	}

	rotate_layer_180() {
		var rotate = app.GUI.modules['image/rotate'];
		rotate.right();
		rotate.right();
	}

	purge_histories() {
		var state = app.State;
		for (var action of state.action_history) {
			try {
				action.free();
			} catch (e) {
				//ignore
			}
		}
		state.action_history = [];
		state.action_history_index = 0;
		this.undo_toggle_index = null;
		app.GUI.Ps_workspace.render_history();
	}

	// ---------- Image ----------

	/**
	 * Rotates/flips the whole document: every layer is redrawn onto a
	 * document-sized pixel layer with the transform applied.
	 * mode: 'cw' | 'ccw' | '180' | 'h' | 'v'
	 */
	transform_canvas(mode, description) {
		for (var layer of config.layers) {
			if (layer.type != 'image' && layer.type != null) {
				alertify.error('Rasterize vector and text layers first (Layer > Rasterize > All Layers).');
				return;
			}
		}
		var W = config.WIDTH;
		var H = config.HEIGHT;
		var swap = (mode == 'cw' || mode == 'ccw');
		var NW = swap ? H : W;
		var NH = swap ? W : H;

		var actions = [new app.Actions.Prepare_canvas_action('undo')];
		for (var layer of config.layers) {
			if (layer.type != 'image' || !layer.link) {
				continue;
			}
			var canvas = document.createElement('canvas');
			canvas.width = NW;
			canvas.height = NH;
			var ctx = canvas.getContext('2d');
			if (mode == 'cw') { ctx.translate(NW, 0); ctx.rotate(Math.PI / 2); }
			if (mode == 'ccw') { ctx.translate(0, NH); ctx.rotate(-Math.PI / 2); }
			if (mode == '180') { ctx.translate(NW, NH); ctx.rotate(Math.PI); }
			if (mode == 'h') { ctx.translate(NW, 0); ctx.scale(-1, 1); }
			if (mode == 'v') { ctx.translate(0, NH); ctx.scale(1, -1); }
			ctx.drawImage(layer.link, layer.x, layer.y, layer.width, layer.height);
			actions.push(new app.Actions.Update_layer_action(layer.id, {
				x: 0, y: 0, width: NW, height: NH, width_original: NW, height_original: NH,
			}));
			actions.push(new app.Actions.Update_layer_image_action(canvas, layer.id));
		}
		actions.push(new app.Actions.Update_config_action({WIDTH: NW, HEIGHT: NH}));
		actions.push(new app.Actions.Prepare_canvas_action('do'));
		app.State.do_action(new app.Actions.Bundle_action('image_rotation', description, actions));
	}

	rotate_canvas_180() { this.transform_canvas('180', 'Rotate Canvas'); }
	rotate_canvas_cw() { this.transform_canvas('cw', 'Rotate Canvas'); }
	rotate_canvas_ccw() { this.transform_canvas('ccw', 'Rotate Canvas'); }
	flip_canvas_h() { this.transform_canvas('h', 'Flip Canvas Horizontal'); }
	flip_canvas_v() { this.transform_canvas('v', 'Flip Canvas Vertical'); }

	crop_to_selection() {
		var s = this.get_selection();
		if (s == null) {
			alertify.error('Make a selection first (Rectangular Marquee Tool).');
			return;
		}
		var actions = [
			new app.Actions.Prepare_canvas_action('undo'),
		];
		for (var layer of config.layers) {
			if (layer.x != null && layer.y != null) {
				actions.push(new app.Actions.Update_layer_action(layer.id, {
					x: layer.x - s.x,
					y: layer.y - s.y,
				}));
			}
		}
		actions.push(new app.Actions.Update_config_action({WIDTH: s.width, HEIGHT: s.height}));
		actions.push(new app.Actions.Prepare_canvas_action('do'));
		var sel = this.selection();
		app.State.do_action(new app.Actions.Bundle_action('crop', 'Crop', actions)).then(() => {
			sel.set_mask_direct(null);
			sel.last_mask = null;
		});
	}

	// ---------- Layer ----------

	layer_via_copy() {
		if (!this.selection().has()) {
			app.GUI.modules['layer/duplicate'].duplicate();
			return;
		}
		if (!this.require_image_layer()) {
			return;
		}
		var part = this.selected_pixels(false);
		return app.State.do_action(
			new app.Actions.Bundle_action('layer_via_copy', 'Layer Via Copy', [
				new app.Actions.Insert_layer_action({
					x: part.x, y: part.y,
					width: part.canvas.width, height: part.canvas.height,
					width_original: part.canvas.width, height_original: part.canvas.height,
					type: 'image',
					data: part.canvas.toDataURL('image/png'),
				}, false),
			])
		);
	}

	async layer_via_cut() {
		if (!this.selection().has()) {
			alertify.error('Could not complete the Layer Via Cut command because the selected area is empty.');
			return;
		}
		if (!this.require_image_layer()) {
			return;
		}
		var source = config.layer;
		var part = this.selected_pixels(false);
		var canvas = this.layer_canvas();
		var ctx = canvas.getContext('2d');
		ctx.globalCompositeOperation = 'destination-out';
		ctx.drawImage(this.selection().mask_for_layer(source), 0, 0);
		return app.State.do_action(
			new app.Actions.Bundle_action('layer_via_cut', 'Layer Via Cut', [
				new app.Actions.Update_layer_image_action(canvas, source.id),
				new app.Actions.Insert_layer_action({
					x: part.x, y: part.y,
					width: part.canvas.width, height: part.canvas.height,
					width_original: part.canvas.width, height_original: part.canvas.height,
					type: 'image',
					data: part.canvas.toDataURL('image/png'),
				}, false),
			])
		);
	}

	delete_hidden_layers() {
		var actions = [];
		for (var layer of config.layers) {
			if (layer.visible == false) {
				actions.push(new app.Actions.Delete_layer_action(layer.id));
			}
		}
		if (actions.length == 0) {
			return;
		}
		app.State.do_action(
			new app.Actions.Bundle_action('delete_hidden', 'Delete Hidden Layers', actions)
		);
	}

	clear_layer_style() {
		app.GUI.Ps_workspace.Styles.clear();
		var actions = [];
		for (var filter of config.layer.filters) {
			actions.push(new app.Actions.Delete_layer_filter_action(config.layer.id, filter.id));
		}
		if (actions.length == 0) {
			return;
		}
		app.State.do_action(
			new app.Actions.Bundle_action('clear_layer_style', 'Clear Layer Style', actions)
		);
	}

	new_fill_layer() {
		var canvas = document.createElement('canvas');
		canvas.width = config.WIDTH;
		canvas.height = config.HEIGHT;
		var ctx = canvas.getContext('2d');
		ctx.fillStyle = config.COLOR;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		app.State.do_action(
			new app.Actions.Insert_layer_action({
				name: 'Color Fill 1',
				type: 'image',
				x: 0,
				y: 0,
				width: canvas.width,
				height: canvas.height,
				width_original: canvas.width,
				height_original: canvas.height,
				data: canvas.toDataURL('image/png'),
			})
		);
	}

	toggle_clipping_mask() {
		var value = config.layer.composition === 'source-atop' ? 'source-over' : 'source-atop';
		app.State.do_action(
			new app.Actions.Bundle_action('clipping_mask', value === 'source-atop' ? 'Create Clipping Mask' : 'Release Clipping Mask', [
				new app.Actions.Update_layer_action(config.layer.id, {composition: value})
			])
		);
	}

	rasterize_all() {
		var current = config.layer.id;
		var raster = app.GUI.modules['layer/raster'];
		for (var layer of config.layers.slice()) {
			if (layer.type != 'image' && layer.type != null) {
				this.Base_layers.select(layer.id);
				raster.raster();
			}
		}
		this.Base_layers.select(current);
	}

	reorder_steps(direction) {
		var sorted = this.Base_layers.get_sorted_layers();
		var index = sorted.findIndex(l => l.id == config.layer.id);
		//get_sorted_layers is top-first
		var steps = direction > 0 ? index : sorted.length - 1 - index;
		if (steps <= 0) {
			return;
		}
		var actions = [];
		for (var i = 0; i < steps; i++) {
			actions.push(new app.Actions.Reorder_layer_action(config.layer.id, direction));
		}
		app.State.do_action(
			new app.Actions.Bundle_action('arrange', direction > 0 ? 'Bring to Front' : 'Send to Back', actions)
		);
	}

	bring_to_front() {
		this.reorder_steps(1);
	}

	send_to_back() {
		this.reorder_steps(-1);
	}

	/**
	 * CS6 aligns the layer to the active selection. With no selection it aligns
	 * to the canvas (Photopea behaviour; CS6 needs 2+ linked layers for that).
	 */
	align(mode) {
		var Multi = app.GUI.Ps_workspace.Multi;
		if (Multi.multiple()) {
			return Multi.align(mode, this.get_selection());
		}
		var layer = config.layer;
		var box = this.get_selection() || {x: 0, y: 0, width: config.WIDTH, height: config.HEIGHT};
		var settings = {};
		if (mode == 'top') settings.y = box.y;
		if (mode == 'bottom') settings.y = box.y + box.height - layer.height;
		if (mode == 'vcenter') settings.y = Math.round(box.y + (box.height - layer.height) / 2);
		if (mode == 'left') settings.x = box.x;
		if (mode == 'right') settings.x = box.x + box.width - layer.width;
		if (mode == 'hcenter') settings.x = Math.round(box.x + (box.width - layer.width) / 2);
		app.State.do_action(
			new app.Actions.Bundle_action('align', 'Align', [
				new app.Actions.Update_layer_action(layer.id, settings)
			])
		);
	}

	align_top() { this.align('top'); }
	align_vcenter() { this.align('vcenter'); }
	align_bottom() { this.align('bottom'); }
	align_left() { this.align('left'); }
	align_hcenter() { this.align('hcenter'); }
	align_right() { this.align('right'); }

	distribute(mode) { app.GUI.Ps_workspace.Multi.distribute(mode); }
	distribute_top() { this.distribute('top'); }
	distribute_vcenter() { this.distribute('vcenter'); }
	distribute_bottom() { this.distribute('bottom'); }
	distribute_left() { this.distribute('left'); }
	distribute_hcenter() { this.distribute('hcenter'); }
	distribute_right() { this.distribute('right'); }

	/**
	 * Layer > Merge Visible (Shift+Ctrl+E): visible layers merge into one; hidden layers stay
	 */
	async merge_visible() {
		var Groups = app.GUI.Ps_workspace.Groups;
		var shown = config.layers.filter(l => l.type != 'ps_group' && l.type != null && Groups.effectively_visible(l));
		if (shown.length < 2) {
			return;
		}
		var canvas = this.composite_visible();
		var ordered = Groups.ordered().filter(l => shown.includes(l));
		var bottom = ordered[ordered.length - 1];
		//CS6: merging into the Background keeps it the Background; otherwise the active layer's name
		var bg = bottom.name == 'Background' && Groups.ordered().slice(-1)[0] === bottom;
		var name = bg ? 'Background' : (shown.includes(config.layer) ? config.layer.name : ordered[0].name);
		var actions = [new app.Actions.Insert_layer_action({
			type: 'image', name: name, order: bottom.order, ps_parent: null,
			x: 0, y: 0, width: canvas.width, height: canvas.height, width_original: canvas.width, height_original: canvas.height,
			data: canvas.toDataURL('image/png'),
		}, false)];
		for (var l of shown) {
			actions.push(new app.Actions.Delete_layer_action(l.id, true));
		}
		//groups left without members go too
		for (var g of config.layers.filter(x => x.type == 'ps_group')) {
			if (Groups.descendants(g).every(m => m.type == 'ps_group' || shown.includes(m))) {
				actions.push(new app.Actions.Delete_layer_action(g.id, true));
			}
		}
		app.GUI.Ps_workspace.Multi.clear();
		await app.State.do_action(new app.Actions.Bundle_action('merge_visible', 'Merge Visible', actions));
		Groups.after_change();
	}

	// ---------- Select ----------

	deselect() {
		this.selection().deselect();
	}

	toggle_quick_mask() {
		this.selection().toggle_quick_mask();
	}

	select_all() {
		this.selection().select_all();
	}

	select_inverse() {
		this.selection().inverse();
	}

	/**
	 * Select > Modify > Border / Smooth / Expand / Contract / Feather
	 */
	modify_selection(kind) {
		var sel = this.selection();
		if (!sel.has()) {
			return;
		}
		var titles = { border: ['Border Selection', 'Width:'], expand: ['Expand Selection', 'Expand By:'],
			contract: ['Contract Selection', 'Contract By:'], feather: ['Feather Selection', 'Feather Radius:'] };
		var t = titles[kind];
		this.POP.show({
			title: t[0],
			params: [{ name: 'amount', title: t[1] + ' (pixels)', value: kind == 'feather' ? 5 : 5, range: [1, 100] }],
			on_finish: (params) => sel.modify(kind, params.amount),
		});
	}

	modify_border() { this.modify_selection('border'); }
	modify_expand() { this.modify_selection('expand'); }
	modify_contract() { this.modify_selection('contract'); }
	modify_feather() { this.modify_selection('feather'); }

	reselect() {
		this.selection().reselect();
	}

	// ---------- Filter ----------

	remember_filter(target) {
		if (target.indexOf('effects/') === 0 || target.indexOf('ps/filters.') === 0) {
			this.last_filter_target = target;
		}
	}

	last_filter() {
		if (this.last_filter_target == null) {
			return;
		}
		//pshot filters repeat with the same settings, without the dialog (CS6)
		if (this.last_filter_target.indexOf('ps/filters.') === 0 && app.GUI.modules['ps/filters'].repeat()) {
			return;
		}
		var parts = this.last_filter_target.split('.');
		app.GUI.modules[parts[0]][parts[1]]();
	}

	// ---------- View / Window ----------

	toggle_guides() {
		config.guides_enabled = !config.guides_enabled;
		config.need_render = true;
	}

	toggle_snap() {
		config.SNAP = !config.SNAP;
	}

	toggle_extras() {
		var ws = app.GUI.Ps_workspace;
		ws.extras = !ws.extras;
		config.guides_enabled = ws.extras;
		app.GUI.grid = ws.extras && ws.grid_before_extras;
		config.need_render = true;
	}

	clear_guides() {
		app.GUI.Ps_workspace.Guides.clear();
	}

	lock_guides() {
		app.GUI.Ps_workspace.Guides.toggle_lock();
	}

	toggle_rulers() {
		app.GUI.modules['view/ruler'].ruler();
		app.GUI.Ps_workspace.relayout();
	}

	screen_mode_standard() { app.GUI.Ps_workspace.set_screen_mode('standard'); }
	screen_mode_menu() { app.GUI.Ps_workspace.set_screen_mode('menu'); }
	screen_mode_full() { app.GUI.Ps_workspace.set_screen_mode('full'); }

	toggle_panel(name) { app.GUI.Ps_workspace.toggle_panel(name); }
	toggle_options_bar() { app.GUI.Ps_workspace.toggle_area('options'); }
	toggle_toolbox() { app.GUI.Ps_workspace.toggle_area('toolbox'); }
	reset_workspace() { app.GUI.Ps_workspace.reset_workspace(); }

	// ---------- File ----------

	image_size() { this.Size.image_size(); }
	canvas_size() { this.Size.canvas_size(); }

	new_document() {
		show_new_dialog();
	}

	open(files) {
		open_document(files || null);
	}

	place() {
		place();
	}

	/**
	 * CS6 Save: a document that came from a PSD (or was saved as one) saves straight
	 * back to PSD; anything else goes through Save As
	 */
	save() {
		var ws = app.GUI.Ps_workspace;
		if (ws.saved_as_psd) {
			save_psd(ws.document_name());
			app.State.ps_saved_index = app.State.action_history_index;
			return;
		}
		app.GUI.modules['file/save'].save();
	}

	close_document() {
		app.GUI.Ps_workspace.Documents.close();
	}

	async close_all() {
		var docs = app.GUI.Ps_workspace.Documents;
		var count = docs.docs.length;
		for (var i = 0; i < count; i++) {
			var before = docs.docs.length;
			await docs.close(docs.docs.length - 1);
			if (docs.docs.length == before && before > 1) {
				return; //cancelled
			}
		}
	}

	switch_document(index) {
		app.GUI.Ps_workspace.Documents.switch_to(index);
	}

}

export default Ps_commands_class;
