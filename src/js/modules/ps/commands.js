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
import Patterns from './../../ps/patterns.js';
import Ps_liquify_class from './../../ps/liquify.js';
import Ps_save_for_web_class from './../../ps/save-for-web.js';
import { inpaint } from './../../ps/inpaint.js';
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
	black_white() { this.Adjust.black_white(); }
	invert() { this.Adjust.invert(); }
	desaturate() { this.Adjust.desaturate(); }
	replace_color() { this.Adjust.replace_color(); }
	auto_tone() { this.Adjust.auto('tone'); }
	auto_contrast() { this.Adjust.auto('contrast'); }
	auto_color() { this.Adjust.auto('color'); }
	threshold() { this.Adjust.threshold(); }
	posterize() { this.Adjust.posterize(); }
	shadows_highlights() { this.Adjust.shadows_highlights(); }
	equalize() { this.Adjust.equalize(); }
	variations() { this.Adjust.variations(); }
	hdr_toning() { return this.Adjust.hdr_toning(); }
	color_lookup() { this.Adjust.color_lookup(); }

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
				{name: 'use', title: 'Use:', value: 'Foreground Color', values: ['Foreground Color', 'Background Color', 'Color...', 'Content-Aware', 'Pattern', 'History', 'Black', '50% Gray', 'White'], type: 'select'},
				{name: 'pattern', title: 'Custom Pattern:', value: Patterns.names()[0], values: Patterns.names(), type: 'select'},
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
				if (params.use == 'Content-Aware') {
					_this.content_aware_fill(params.opacity / 100);
					return;
				}
				if (params.use == 'History') {
					//the History Brush source (the document as opened)
					var snap = app.GUI.Ps_workspace.Documents.snapshot_for_layer(config.layer);
					if (!snap) {
						alertify.error('Could not use the history because the history state does not contain a corresponding layer.');
						return;
					}
					var hp = document.createElement('canvas').getContext('2d').createPattern(snap, 'no-repeat');
					_this.fill_with(hp, params.opacity / 100, 'Fill');
					return;
				}
				if (params.use == 'Color...') {
					app.GUI.Ps_workspace.color_dialog('Choose a color:', config.COLOR, (hex) => _this.fill_with(hex, params.opacity / 100, 'Fill'));
					return;
				}
				if (params.use == 'Pattern') {
					//patterns are aligned to the document origin
					var probe = document.createElement('canvas').getContext('2d');
					var pattern = Patterns.pattern(probe, params.pattern, 100);
					var layer = config.layer;
					if (pattern && layer && pattern.setTransform) pattern.setTransform(new DOMMatrix().translate(-(layer.x || 0), -(layer.y || 0)));
					_this.fill_with(pattern, params.opacity / 100, 'Fill');
					return;
				}
				_this.fill_with(colors[params.use], params.opacity / 100, 'Fill');
			},
		};
		this.POP.show(settings);
	}

	/**
	 * Edit > Fill > Content-Aware: the selection is filled from its surroundings
	 */
	content_aware_fill(alpha) {
		var sel = this.selection();
		var layer = config.layer;
		if (!sel.has()) {
			alertify.error('Could not complete the Content-Aware Fill because there is no selection.');
			return;
		}
		if (!this.require_image_layer()) return;
		var canvas = this.layer_canvas();
		var w = canvas.width, h = canvas.height;
		var mask = sel.mask_for_layer(layer);
		var m = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
		var hole = new Uint8Array(w * h);
		for (var i = 0; i < hole.length; i++) hole[i] = m[i * 4 + 3] > 0 ? 1 : 0;
		var filled = document.createElement('canvas');
		filled.width = w;
		filled.height = h;
		filled.getContext('2d').drawImage(canvas, 0, 0);
		inpaint(filled, hole);
		//blend by the selection's softness and Opacity
		var piece = document.createElement('canvas');
		piece.width = w;
		piece.height = h;
		var pctx = piece.getContext('2d');
		pctx.drawImage(filled, 0, 0);
		pctx.globalCompositeOperation = 'destination-in';
		pctx.drawImage(mask, 0, 0);
		var ctx = canvas.getContext('2d');
		ctx.globalAlpha = alpha == null ? 1 : alpha;
		ctx.drawImage(piece, 0, 0);
		app.State.do_action(new app.Actions.Bundle_action('fill', 'Fill', [new app.Actions.Update_layer_image_action(canvas)]));
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

	transform_skew() { app.GUI.Ps_workspace.Transform.start_mode('skew'); }
	transform_distort() { app.GUI.Ps_workspace.Transform.start_mode('distort'); }
	transform_perspective() { app.GUI.Ps_workspace.Transform.start_mode('perspective'); }
	transform_warp() { app.GUI.Ps_workspace.Transform.start_mode('warp'); }
	layer_content_options() {
		if (!app.GUI.Ps_workspace.Shapes.edit_fill()) alertify.error('Layer Content Options works on fill and shape layers.');
	}
	vmask_reveal_all() { app.GUI.Ps_workspace.Vector_mask.reveal_all(); }
	vmask_hide_all() { app.GUI.Ps_workspace.Vector_mask.hide_all(); }
	vmask_current_path() { app.GUI.Ps_workspace.Vector_mask.current_path(); }
	vmask_delete() { app.GUI.Ps_workspace.Vector_mask.remove(); }
	vmask_toggle_label() { var l = config.layer; return l && l.ps_vmask && l.ps_vmask.disabled ? 'Enable' : 'Disable'; }
	vmask_toggle() { app.GUI.Ps_workspace.Vector_mask.toggle(); }
	vmask_rasterize() { app.GUI.Ps_workspace.Vector_mask.rasterize(); }
	lighting_effects() { app.GUI.Ps_workspace.Lighting.open(); }
	filter_gallery() { app.GUI.Ps_workspace.Filter_gallery.open(); }
	puppet_warp() { app.GUI.Ps_workspace.Puppet.start(); }
	warp_text() { app.GUI.Ps_workspace.Warp_text.open(); }
	calculations() { app.GUI.Ps_workspace.Calculations.open(); }
	blur_gallery(mode) { app.GUI.Ps_workspace.Blur_gallery.open(mode || 'field'); }
	keyboard_shortcuts() { app.GUI.Ps_workspace.Shortcuts.open(); }
	preferences(pane) { app.GUI.Ps_workspace.Preferences.open(pane || 'General'); }
	content_aware_scale() { app.GUI.Ps_workspace.Transform.start_content_aware(); }
	transform_again() { app.GUI.Ps_workspace.Transform.again(); }

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

	/**
	 * Image > Image Rotation > Arbitrary: the canvas grows to hold the rotated image;
	 * new areas of the Background take the background color
	 */
	rotate_canvas_arbitrary() {
		for (var l of config.layers) {
			if (l.type != 'image' && l.type != null && l.type != 'ps_group' && l.type != 'ps_adjust') {
				alertify.error('Rasterize vector and text layers first (Layer > Rasterize > All Layers).');
				return;
			}
		}
		this.POP.show({
			title: 'Rotate Canvas',
			params: [
				{ name: 'angle', title: 'Angle:', value: this.last_rotate_angle || 0 },
				{ name: 'dir', title: '', values: ['°CW', '°CCW'], value: this.last_rotate_dir || '°CW' },
			],
			on_finish: (params) => {
				var a = parseFloat(params.angle) || 0;
				this.last_rotate_angle = a;
				this.last_rotate_dir = params.dir;
				if (!a) return;
				this.rotate_canvas_by(params.dir == '°CCW' ? -a : a);
			},
		});
	}

	rotate_canvas_by(deg) {
		var W = config.WIDTH, H = config.HEIGHT, r = deg * Math.PI / 180;
		var cos = Math.abs(Math.cos(r)), sin = Math.abs(Math.sin(r));
		var NW = Math.round(W * cos + H * sin), NH = Math.round(W * sin + H * cos);
		var ordered = app.GUI.Ps_workspace.Groups.ordered();
		var bottom = ordered[ordered.length - 1];
		var draw = (src, x, y, w, h, fill) => {
			var c = document.createElement('canvas');
			c.width = NW;
			c.height = NH;
			var ctx = c.getContext('2d');
			if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, NW, NH); }
			ctx.translate(NW / 2, NH / 2);
			ctx.rotate(r);
			ctx.translate(-W / 2, -H / 2);
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(src, x, y, w, h);
			return c;
		};
		var actions = [new app.Actions.Prepare_canvas_action('undo')];
		for (var layer of config.layers) {
			if (layer.type != 'image' || !layer.link) continue;
			var is_bg = layer === bottom && layer.name == 'Background';
			var settings = { x: 0, y: 0, width: NW, height: NH, width_original: NW, height_original: NH };
			if (layer.ps_mask) {
				var m = document.createElement('canvas');
				m.width = W;
				m.height = H;
				m.getContext('2d').drawImage(layer.ps_mask, layer.x - layer.ps_mask_x, layer.y - layer.ps_mask_y);
				Object.assign(settings, { ps_mask: draw(m, 0, 0, W, H), ps_mask_x: 0, ps_mask_y: 0 });
			}
			actions.push(new app.Actions.Update_layer_action(layer.id, settings));
			actions.push(new app.Actions.Update_layer_image_action(draw(layer.link, layer.x, layer.y, layer.width, layer.height, is_bg ? config.BG_COLOR : null), layer.id));
		}
		actions.push(new app.Actions.Update_config_action({ WIDTH: NW, HEIGHT: NH }));
		actions.push(new app.Actions.Prepare_canvas_action('do'));
		return app.State.do_action(new app.Actions.Bundle_action('image_rotation', 'Rotate Canvas', actions)).then(() => app.GUI.GUI_preview.zoom_auto(true));
	}

	/**
	 * Image > Trim: based on transparent pixels or a corner color; trims chosen sides
	 */
	trim() {
		this.POP.show({
			title: 'Trim',
			params: [
				{ title: 'Based On' },
				{ name: 'based', title: '', values: ['Transparent Pixels', 'Top Left Pixel Color', 'Bottom Right Pixel Color'], value: 'Top Left Pixel Color' },
				{ title: 'Trim Away' },
				{ name: 'top', title: 'Top', value: true },
				{ name: 'bottom', title: 'Bottom', value: true },
				{ name: 'left', title: 'Left', value: true },
				{ name: 'right', title: 'Right', value: true },
			],
			on_finish: (params) => {
				var W = config.WIDTH, H = config.HEIGHT;
				var c = document.createElement('canvas');
				c.width = W;
				c.height = H;
				var ctx = c.getContext('2d', { willReadFrequently: true });
				this.Base_layers.convert_layers_to_canvas(ctx, null, false);
				var d = ctx.getImageData(0, 0, W, H).data;
				var ref = params.based == 'Bottom Right Pixel Color' ? ((H - 1) * W + W - 1) * 4 : 0;
				var keep = params.based == 'Transparent Pixels'
					? (i) => d[i + 3] > 0
					: (i) => Math.abs(d[i] - d[ref]) + Math.abs(d[i + 1] - d[ref + 1]) + Math.abs(d[i + 2] - d[ref + 2]) + Math.abs(d[i + 3] - d[ref + 3]) > 0;
				var x0 = W, y0 = H, x1 = -1, y1 = -1;
				for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
					if (keep((y * W + x) * 4)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
				}
				if (x1 < 0) return;
				if (!params.left) x0 = 0;
				if (!params.top) y0 = 0;
				if (!params.right) x1 = W - 1;
				if (!params.bottom) y1 = H - 1;
				this.crop_rect({ x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }, 'Trim');
			},
		});
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
		return this.crop_rect(s, 'Crop');
	}

	crop_rect(s, description) {
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
		return app.State.do_action(new app.Actions.Bundle_action('crop', description || 'Crop', actions)).then(() => {
			sel.set_mask_direct(null);
			sel.last_mask = null;
		});
	}

	// ---------- Layer ----------

	layer_via_copy() {
		if (!this.selection().has()) {
			//CS6 History calls it "Layer Via Copy"
			return Promise.resolve(app.GUI.modules['layer/duplicate'].duplicate()).then(() => {
				var last = app.State.action_history[app.State.action_history_index - 1];
				if (last && last.action_id == 'duplicate_layer') last.action_description = 'Layer Via Copy';
			});
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

	/**
	 * Edit > Define Pattern: the selection's bounding box (or the document), all visible layers
	 */
	/**
	 * Layer > Link Layers / Unlink Layers (the Layers panel chain button toggles)
	 */
	toggle_link_layers() {
		var Multi = app.GUI.Ps_workspace.Multi;
		var sel = Multi.selected();
		var all_linked = sel.length && sel.every(l => l.ps_link && l.ps_link == sel[0].ps_link);
		if (all_linked || (sel.length == 1 && sel[0].ps_link)) return this.unlink_layers();
		if (sel.length < 2) return;
		var token = 'link' + Date.now();
		var keep = Multi.ids.slice();
		app.State.do_action(new app.Actions.Bundle_action('link_layers', 'Link Layers', sel.map(l => new app.Actions.Update_layer_action(l.id, { ps_link: token }))))
			.then(() => { Multi.ids = keep; app.GUI.GUI_layers.render_layers(); });
	}

	link_label() {
		var sel = app.GUI.Ps_workspace.Multi.selected();
		return sel.length && sel.some(l => l.ps_link) ? 'Unlink Layers' : 'Link Layers';
	}

	link_layers() {
		var sel = app.GUI.Ps_workspace.Multi.selected();
		if (sel.length >= 2 && !sel.every(l => l.ps_link && l.ps_link == sel[0].ps_link)) this.toggle_link_layers();
	}

	unlink_layers() {
		var Multi = app.GUI.Ps_workspace.Multi;
		var sel = Multi.selected().filter(l => l.ps_link);
		if (!sel.length) return;
		var keep = Multi.ids.slice();
		app.State.do_action(new app.Actions.Bundle_action('link_layers', 'Unlink Layers', sel.map(l => new app.Actions.Update_layer_action(l.id, { ps_link: null }))))
			.then(() => { Multi.ids = keep; app.GUI.GUI_layers.render_layers(); });
	}

	select_linked_layers() {
		var Multi = app.GUI.Ps_workspace.Multi;
		var layer = config.layer;
		if (!layer || !layer.ps_link) return;
		Multi.ids = config.layers.filter(l => l.ps_link == layer.ps_link).map(l => l.id);
		app.GUI.GUI_layers.render_layers();
	}

	/**
	 * Layer > Smart Objects > Convert to Smart Object: keeps the original pixels so
	 * Free Transform resamples from them (non-destructive)
	 */
	async convert_to_smart_object() {
		var layer = config.layer;
		if (!layer || layer.type == null || layer.type == 'ps_group' || layer.type == 'ps_adjust' || layer.ps_smart) return;
		var full = this.Base_layers.convert_layer_to_canvas(layer.id, false, false);
		var t = app.GUI.Ps_workspace.Transform;
		var b = t.alpha_bounds(full);
		if (!b) return;
		var source = document.createElement('canvas');
		source.width = b.width;
		source.height = b.height;
		source.getContext('2d').drawImage(full, -b.x, -b.y);
		var doc = document.createElement('canvas');
		doc.width = config.WIDTH;
		doc.height = config.HEIGHT;
		doc.getContext('2d').drawImage(source, b.x, b.y);
		var settings = {
			type: 'image', x: 0, y: 0, width: doc.width, height: doc.height, width_original: doc.width, height_original: doc.height, rotate: 0,
			ps_smart: { source: source, box: { cx: b.x + b.width / 2, cy: b.y + b.height / 2, w: b.width, h: b.height, angle: 0 }, quad: null, lx: 0, ly: 0 },
		};
		if (layer.type != 'image') Object.assign(settings, { render_function: null, is_vector: false, params: {}, data: null });
		await app.State.do_action(new app.Actions.Bundle_action('smart_object', 'Convert to Smart Object', [
			new app.Actions.Update_layer_action(layer.id, settings),
			new app.Actions.Update_layer_image_action(doc, layer.id),
		]));
		app.GUI.GUI_layers.render_layers();
	}

	async new_smart_object_via_copy() {
		var layer = config.layer;
		if (!layer || !layer.ps_smart) return;
		await app.State.do_action(new app.Actions.Bundle_action('smart_object', 'New Smart Object via Copy', [
			new app.Actions.Insert_layer_action({
				type: 'image', name: layer.name + ' copy', x: layer.x, y: layer.y, width: layer.width, height: layer.height,
				width_original: layer.width_original, height_original: layer.height_original, data: layer.link.src || this.layer_canvas().toDataURL('image/png'),
				ps_smart: Object.assign({}, layer.ps_smart, { source: layer.ps_smart.source }),
			}),
		]));
	}

	/**
	 * replace a smart object's original pixels (Replace / Edit Contents)
	 */
	async update_smart_source(layer, source, description) {
		var pixels = app.GUI.Ps_workspace.Transform.render_smart(layer, source);
		await app.State.do_action(new app.Actions.Bundle_action('smart_object', description, [
			new app.Actions.Update_layer_action(layer.id, {
				x: 0, y: 0, width: config.WIDTH, height: config.HEIGHT, width_original: config.WIDTH, height_original: config.HEIGHT,
				ps_smart: Object.assign({}, layer.ps_smart, { source: source, lx: layer.x, ly: layer.y }),
			}),
			new app.Actions.Update_layer_image_action(pixels, layer.id),
		]));
	}

	/**
	 * Layer > Smart Objects > Replace Contents: a new image for the smart object
	 */
	async replace_smart_contents() {
		var layer = config.layer;
		if (!layer || !layer.ps_smart) return;
		var input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/*';
		input.addEventListener('change', () => {
			var file = input.files && input.files[0];
			if (!file) return;
			var img = new Image();
			img.onload = () => {
				var c = document.createElement('canvas');
				c.width = img.width;
				c.height = img.height;
				c.getContext('2d').drawImage(img, 0, 0);
				this.update_smart_source(layer, c, 'Replace Contents');
			};
			img.src = URL.createObjectURL(file);
		});
		input.click();
	}

	/**
	 * Layer > Smart Objects > Edit Contents: the original pixels open in their own
	 * tab (.psb); saving that tab (Ctrl+S) updates the smart object
	 */
	async edit_smart_contents() {
		var layer = config.layer;
		if (!layer || !layer.ps_smart) return;
		var ws = app.GUI.Ps_workspace;
		var parent = ws.Documents.current();
		var src = layer.ps_smart.source;
		var entry = ws.Documents.add(layer.name + '.psb');
		entry.smart_link = { parent: parent, layer: layer };
		await app.State.do_action(new app.Actions.Bundle_action('open', 'Open', [
			new app.Actions.Prepare_canvas_action('undo'),
			new app.Actions.Update_config_action({ WIDTH: src.width, HEIGHT: src.height }),
			new app.Actions.Reset_layers_action(),
			new app.Actions.Insert_layer_action({ type: 'image', name: 'Layer 0', x: 0, y: 0, width: src.width, height: src.height, width_original: src.width, height_original: src.height, data: src.toDataURL('image/png') }, false),
			new app.Actions.Prepare_canvas_action('do'),
		]));
		app.State.action_history = [];
		app.State.action_history_index = 0;
		app.GUI.GUI_preview.zoom_auto(true);
	}

	/**
	 * Ctrl+S in a smart object's tab: flatten it into the smart object
	 */
	async save_smart_contents(entry) {
		var ws = app.GUI.Ps_workspace;
		var flat = document.createElement('canvas');
		flat.width = config.WIDTH;
		flat.height = config.HEIGHT;
		this.Base_layers.convert_layers_to_canvas(flat.getContext('2d'), null, false);
		var parent_index = ws.Documents.docs.indexOf(entry.smart_link.parent);
		if (parent_index < 0) {
			alertify.error('The document that contains this smart object is closed.');
			return;
		}
		ws.Documents.switch_to(parent_index);
		var layer = entry.smart_link.layer;
		if (config.layers.includes(layer) && layer.ps_smart) {
			await this.update_smart_source(layer, flat, 'Update Smart Object');
		}
		ws.Documents.switch_to(ws.Documents.docs.indexOf(entry));
		app.State.ps_saved_index = app.State.action_history_index;
		ws.status_message('Smart object updated');
	}

	/**
	 * Layer > Smart Objects > Rasterize: drop the original pixels
	 */
	rasterize_smart_object() {
		var layer = config.layer;
		if (!layer || !layer.ps_smart) return;
		app.State.do_action(new app.Actions.Bundle_action('rasterize', 'Rasterize Smart Object', [
			new app.Actions.Update_layer_action(layer.id, { ps_smart: null }),
		])).then(() => app.GUI.GUI_layers.render_layers());
	}

	/**
	 * Export Contents: the original pixels as PNG
	 */
	export_smart_contents() {
		var layer = config.layer;
		if (!layer || !layer.ps_smart) return;
		var a = document.createElement('a');
		a.download = layer.name + '.png';
		a.href = layer.ps_smart.source.toDataURL('image/png');
		a.click();
	}

	/**
	 * Image > Mode > Grayscale: every layer's colors become luminosity ("Discard color information?")
	 */
	async mode_grayscale() {
		if (config.ps_mode == 'Grayscale') return;
		if (!window.confirm('Discard color information?')) return;
		var gray = (hex) => {
			if (!hex || hex[0] != '#') return hex;
			var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
			var v = Math.round(r * 0.299 + g * 0.587 + b * 0.114).toString(16).padStart(2, '0');
			return '#' + v + v + v + (hex.length == 9 ? hex.substr(7, 2) : '');
		};
		var actions = [];
		for (var layer of config.layers) {
			if (layer.type == 'image' && layer.link) {
				var c = document.createElement('canvas');
				c.width = layer.width_original;
				c.height = layer.height_original;
				var ctx = c.getContext('2d', { willReadFrequently: true });
				ctx.drawImage(layer.link, 0, 0);
				var img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
				for (var i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
				ctx.putImageData(img, 0, 0);
				actions.push(new app.Actions.Update_layer_image_action(c, layer.id));
			}
			else if (layer.type == 'text' && layer.data) {
				var data = JSON.parse(JSON.stringify(layer.data));
				data.forEach(line => line.forEach(span => { if (span.meta) { span.meta.fill_color = gray(span.meta.fill_color); span.meta.stroke_color = gray(span.meta.stroke_color); } }));
				actions.push(new app.Actions.Update_layer_action(layer.id, { data: data }));
			}
			else if (layer.params && (layer.params.fill_color || layer.params.border_color)) {
				actions.push(new app.Actions.Update_layer_action(layer.id, { params: Object.assign({}, layer.params, { fill_color: gray(layer.params.fill_color), border_color: gray(layer.params.border_color) }), color: gray(layer.color) }));
			}
		}
		actions.push(new app.Actions.Update_config_action({ ps_mode: 'Grayscale' }));
		await app.State.do_action(new app.Actions.Bundle_action('mode', 'Grayscale', actions));
		app.GUI.Ps_workspace.enforce_mode();
	}

	async mode_rgb() {
		if (config.ps_mode != 'Grayscale') return;
		await app.State.do_action(new app.Actions.Bundle_action('mode', 'RGB Color', [new app.Actions.Update_config_action({ ps_mode: 'RGB' })]));
		app.GUI.Ps_workspace.enforce_mode();
	}

	/**
	 * Ctrl+click a layer (or mask) thumbnail: its pixels (or mask) as a selection
	 */
	load_layer_selection(layer, use_mask, op) {
		if (!layer) return;
		var sel = this.selection();
		var shape = document.createElement('canvas');
		shape.width = config.WIDTH;
		shape.height = config.HEIGHT;
		var ctx = shape.getContext('2d');
		if (use_mask && layer.ps_mask) {
			//mask: white reveals; alpha holds the value
			ctx.drawImage(layer.ps_mask, layer.x - layer.ps_mask_x, layer.y - layer.ps_mask_y);
		}
		else {
			var plain = Object.assign(Object.create(Object.getPrototypeOf(layer)), layer, { opacity: 100, ps_mask: null, ps_styles: null, visible: true, _ps_ignore_groups: true });
			this.Base_layers.render_object(ctx, plain);
		}
		ctx.globalCompositeOperation = 'source-in';
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, shape.width, shape.height);
		sel.commit(sel.combine(shape, op || 'new'), 'Load Selection');
	}

	/**
	 * Alt+click an eye: show only this layer; Alt+click again brings the others back
	 */
	solo_visibility(layer) {
		if (!layer) return;
		var others = config.layers.filter(l => l !== layer && l.type != 'ps_group');
		var Groups = app.GUI.Ps_workspace.Groups;
		var ancestors = Groups.ancestors(layer);
		if (this.solo && this.solo.layer === layer && others.every(l => l.visible === false || ancestors.includes(l))) {
			for (var id of this.solo.visible) {
				var l = this.Base_layers.get_layer(id);
				if (l) l.visible = true;
			}
			this.solo = null;
		}
		else {
			this.solo = { layer: layer, visible: others.filter(l => l.visible !== false).map(l => l.id) };
			for (var o of others) o.visible = false;
			layer.visible = true;
			for (var g of ancestors) g.visible = true;
		}
		app.GUI.GUI_layers.render_layers();
		config.need_render = true;
	}

	/**
	 * Stamp Visible (Shift+Ctrl+Alt+E): a new layer with all visible layers merged
	 */
	stamp_visible() {
		var canvas = document.createElement('canvas');
		canvas.width = config.WIDTH;
		canvas.height = config.HEIGHT;
		this.Base_layers.convert_layers_to_canvas(canvas.getContext('2d'), null, false);
		return app.State.do_action(new app.Actions.Bundle_action('stamp_visible', 'Stamp Visible', [
			new app.Actions.Insert_layer_action({
				type: 'image', x: 0, y: 0, width: canvas.width, height: canvas.height, width_original: canvas.width, height_original: canvas.height,
				data: canvas.toDataURL('image/png'),
			}),
		]));
	}

	new_layer_silent() {
		return app.State.do_action(new app.Actions.Insert_layer_action({}));
	}

	/**
	 * Alt+] / Alt+[: select the layer above / below (CS6)
	 */
	select_layer_step(direction) {
		var Groups = app.GUI.Ps_workspace.Groups;
		var list = Groups.ordered().filter(l => !Groups.ancestors(l).some(g => g.ps_collapsed));
		var i = list.indexOf(config.layer);
		var next = list[i - (direction || 1)];
		if (next) {
			app.GUI.Ps_workspace.Multi.clear();
			app.State.do_action(new app.Actions.Select_layer_action(next.id));
		}
	}

	/**
	 * Image > Apply Image: blend a layer (or the merged image) into the active layer
	 */
	apply_image() {
		var target = config.layer;
		if (!target || target.type != 'image' || !target.link) {
			alertify.error('Could not complete the Apply Image command because the target layer is not a pixel layer.');
			return;
		}
		var modes = { 'Normal': 'source-over', 'Multiply': 'multiply', 'Screen': 'screen', 'Overlay': 'overlay', 'Darken': 'darken', 'Lighten': 'lighten',
			'Color Dodge': 'color-dodge', 'Color Burn': 'color-burn', 'Soft Light': 'soft-light', 'Hard Light': 'hard-light', 'Difference': 'difference',
			'Exclusion': 'exclusion', 'Add': 'lighter' };
		var sources = [['Merged', null]].concat(app.GUI.Ps_workspace.Groups.ordered().filter(l => l.type == 'image' || l.type == 'text').map(l => [l.name, l.id]));
		var html = '<div class="ps_adj_row"><span>Layer:</span><select id="ai_layer">' + sources.map((s, i) => '<option value="' + i + '">' + app.GUI.Ps_workspace.Helper.escapeHtml(s[0]) + '</option>').join('') + '</select></div>'
			+ '<div class="ps_adj_row"><span>Channel:</span><select disabled><option>RGB</option></select></div>'
			+ '<label class="ps_adj_check"><input type="checkbox" id="ai_invert"> Invert</label>'
			+ '<div class="ps_adj_row"><span>Blending:</span><select id="ai_mode">' + Object.keys(modes).map(m => '<option' + (m == 'Multiply' ? ' selected' : '') + '>' + m + '</option>').join('') + '</select></div>'
			+ '<div class="ps_adj_slider"><span>Opacity:</span><input type="number" id="ai_opacity_n" min="0" max="100" value="100"><span class="ps_adj_unit">%</span><input type="range" id="ai_opacity" min="0" max="100" value="100"></div>';
		var source_canvas = (index) => {
			var c = document.createElement('canvas');
			c.width = config.WIDTH;
			c.height = config.HEIGHT;
			var ctx = c.getContext('2d');
			if (index == 0) this.Base_layers.convert_layers_to_canvas(ctx, null, false);
			else {
				var l = this.Base_layers.get_layer(sources[index][1]);
				if (l) this.Base_layers.render_object(ctx, Object.assign(Object.create(Object.getPrototypeOf(l)), l, { visible: true, _ps_ignore_groups: true }));
			}
			return c;
		};
		var cache = {};
		this.Adjust.show('Apply Image', html, (root, state, update) => {
			state.source = 0; state.invert = false; state.mode = 'Multiply'; state.opacity = 100;
			root.querySelector('#ai_layer').addEventListener('change', (e) => { state.source = parseInt(e.target.value); update(); });
			root.querySelector('#ai_invert').addEventListener('change', (e) => { state.invert = e.target.checked; update(); });
			root.querySelector('#ai_mode').addEventListener('change', (e) => { state.mode = e.target.value; update(); });
			var r = root.querySelector('#ai_opacity'), n = root.querySelector('#ai_opacity_n');
			var set = (v) => { if (isNaN(v)) return; state.opacity = Math.max(0, Math.min(100, v)); r.value = n.value = state.opacity; update(); };
			r.addEventListener('input', () => set(parseFloat(r.value)));
			n.addEventListener('change', () => set(parseFloat(n.value)));
		}, (state) => (src, dst, w, h) => {
			var key = state.source;
			if (!cache[key]) cache[key] = source_canvas(key);
			var s = cache[key];
			if (state.invert) {
				var inv = document.createElement('canvas');
				inv.width = s.width;
				inv.height = s.height;
				var ictx = inv.getContext('2d');
				ictx.drawImage(s, 0, 0);
				ictx.globalCompositeOperation = 'difference';
				ictx.fillStyle = '#fff';
				ictx.fillRect(0, 0, inv.width, inv.height);
				ictx.globalCompositeOperation = 'destination-in';
				ictx.drawImage(s, 0, 0);
				s = inv;
			}
			var c = document.createElement('canvas');
			c.width = w;
			c.height = h;
			var ctx = c.getContext('2d', { willReadFrequently: true });
			ctx.putImageData(new ImageData(new Uint8ClampedArray(src), w, h), 0, 0);
			ctx.globalAlpha = state.opacity / 100;
			ctx.globalCompositeOperation = modes[state.mode] || 'multiply';
			var sx = w / target.width, sy = h / target.height;
			ctx.setTransform(sx, 0, 0, sy, -target.x * sx, -target.y * sy);
			ctx.drawImage(s, 0, 0);
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			//keep the target's transparency
			var out = ctx.getImageData(0, 0, w, h).data;
			for (var i = 0; i < out.length; i += 4) { out[i + 3] = src[i + 3]; }
			dst.set(out);
		}, 'apply_image');
	}

	/**
	 * Image > Adjustments > Match Color: the color statistics (mean / spread of
	 * luminance and chroma) of the target are matched to a source document;
	 * Luminance, Color Intensity, Fade and Neutralize also work without a source
	 */
	match_color() {
		var docs = app.GUI.Ps_workspace.Documents;
		var sources = [['None', null]];
		docs.docs.forEach((d, i) => {
			if (i == docs.active) sources.push([d.name + ' (Merged)', 'self']);
			else if (d.flat) sources.push([d.name + ' (Merged)', d.flat]);
		});
		var slider = (id, label, min, max, value) => '<div class="ps_adj_slider"><span>' + label + '</span><input type="number" id="mc_' + id + '_n" min="' + min + '" max="' + max + '" value="' + value + '"><span class="ps_adj_unit"></span><input type="range" id="mc_' + id + '" min="' + min + '" max="' + max + '" value="' + value + '"></div>';
		var html = '<div class="ps_adj_label">Destination Image</div>'
			+ '<div class="ps_adj_row"><span>Target:</span><span>' + app.GUI.Ps_workspace.Helper.escapeHtml(docs.current().name + ' (' + (config.layer ? config.layer.name : '') + ', RGB/8)') + '</span></div>'
			+ '<label class="ps_adj_check"><input type="checkbox" disabled> Ignore Selection when Applying Adjustment</label>'
			+ '<div class="ps_adj_label">Image Options</div>'
			+ slider('lum', 'Luminance:', 1, 200, 100) + slider('int', 'Color Intensity:', 1, 200, 100) + slider('fade', 'Fade:', 0, 100, 0)
			+ '<label class="ps_adj_check"><input type="checkbox" id="mc_neutral"> Neutralize</label>'
			+ '<div class="ps_adj_label">Image Statistics</div>'
			+ '<label class="ps_adj_check"><input type="checkbox" disabled> Use Selection in Source to Calculate Colors</label>'
			+ '<label class="ps_adj_check"><input type="checkbox" disabled> Use Selection in Target to Calculate Adjustment</label>'
			+ '<div class="ps_adj_row"><span>Source:</span><select id="mc_source">' + sources.map((s, i) => '<option value="' + i + '">' + app.GUI.Ps_workspace.Helper.escapeHtml(s[0]) + '</option>').join('') + '</select></div>';
		//Y Cb Cr mean and standard deviation of the opaque pixels
		var stats = (d) => {
			var n = 0, sum = [0, 0, 0], sq = [0, 0, 0], step = Math.max(1, Math.floor(d.length / 4 / 250000)) * 4;
			for (var i = 0; i < d.length; i += step) {
				if (d[i + 3] < 128) continue;
				var v = ycc(d[i], d[i + 1], d[i + 2]);
				for (var c = 0; c < 3; c++) { sum[c] += v[c]; sq[c] += v[c] * v[c]; }
				n++;
			}
			if (!n) return null;
			var mean = sum.map(s => s / n);
			return { mean: mean, std: sq.map((s, c) => Math.max(1, Math.sqrt(Math.max(0, s / n - mean[c] * mean[c])))) };
		};
		var ycc = (r, g, b) => [0.299 * r + 0.587 * g + 0.114 * b, -0.168736 * r - 0.331264 * g + 0.5 * b, 0.5 * r - 0.418688 * g - 0.081312 * b];
		var source_stats = {};
		var get_source = (index) => {
			if (index == 0) return null;
			if (!source_stats[index]) {
				var s = sources[index][1];
				var c = s;
				if (s == 'self') {
					c = document.createElement('canvas');
					c.width = config.WIDTH;
					c.height = config.HEIGHT;
					this.Base_layers.convert_layers_to_canvas(c.getContext('2d'), null, false);
				}
				source_stats[index] = stats(c.getContext('2d').getImageData(0, 0, c.width, c.height).data);
			}
			return source_stats[index];
		};
		var target_stats = null;
		this.Adjust.show('Match Color', html, (root, state, update) => {
			Object.assign(state, { lum: 100, int: 100, fade: 0, neutral: false, source: 0 });
			['lum', 'int', 'fade'].forEach((k) => {
				var r = root.querySelector('#mc_' + k), n = root.querySelector('#mc_' + k + '_n');
				var set = (v) => { if (isNaN(v)) return; state[k] = Math.max(parseFloat(r.min), Math.min(parseFloat(r.max), v)); r.value = n.value = state[k]; update(); };
				r.addEventListener('input', () => set(parseFloat(r.value)));
				n.addEventListener('change', () => set(parseFloat(n.value)));
			});
			root.querySelector('#mc_neutral').addEventListener('change', (e) => { state.neutral = e.target.checked; update(); });
			root.querySelector('#mc_source').addEventListener('change', (e) => { state.source = parseInt(e.target.value); update(); });
		}, (state) => (src, dst) => {
			if (!target_stats) target_stats = stats(src);
			var T = target_stats;
			if (!T) return;
			var S = get_source(state.source);
			var lum = state.lum / 100, inten = state.int / 100, fade = state.fade / 100;
			//per channel: scale and offset
			var k = [1, 1, 1], o = [0, 0, 0];
			if (S) {
				for (var c = 0; c < 3; c++) { k[c] = S.std[c] / T.std[c]; o[c] = S.mean[c] - T.mean[c] * k[c]; }
			}
			for (var i = 0; i < src.length; i += 4) {
				var v = ycc(src[i], src[i + 1], src[i + 2]);
				var y = v[0] * k[0] + o[0], cb = v[1] * k[1] + o[1], cr = v[2] * k[2] + o[2];
				if (state.neutral) {
					//remove the cast: the average chroma becomes neutral
					var m = S ? S.mean : T.mean;
					cb -= m[1];
					cr -= m[2];
				}
				y *= lum;
				cb *= inten;
				cr *= inten;
				var r = y + 1.402 * cr, g = y - 0.344136 * cb - 0.714136 * cr, b = y + 1.772 * cb;
				dst[i] = r + (src[i] - r) * fade;
				dst[i + 1] = g + (src[i + 1] - g) * fade;
				dst[i + 2] = b + (src[i + 2] - b) * fade;
			}
		}, 'match_color');
	}

	workspace(name) { app.GUI.Ps_workspace.apply_workspace(name || 'Essentials'); }

	toggle_show_notes() {
		var ws = app.GUI.Ps_workspace;
		ws.show_notes = ws.show_notes === false;
		ws.Selection.draw_overlay();
	}

	toggle_pixel_grid() {
		var ws = app.GUI.Ps_workspace;
		ws.pixel_grid = ws.pixel_grid === false;
		ws.Selection.draw_overlay();
	}

	/**
	 * Type > Create Work Path: the outline of the type layer's glyphs
	 */
	type_work_path() {
		var layer = config.layer;
		if (!layer || layer.type != 'text') return;
		var mask = document.createElement('canvas');
		mask.width = config.WIDTH;
		mask.height = config.HEIGHT;
		this.Base_layers.render_object(mask.getContext('2d'), layer);
		app.GUI.Ps_workspace.Paths.from_selection(0.75, mask);
	}

	/**
	 * Select > Refine Edge (Alt+Ctrl+R): Smooth, Feather, Contrast, Shift Edge;
	 * view modes; output to selection, layer mask or new layer
	 */
	refine_edge() {
		var sel = this.selection();
		if (!sel.has()) return;
		var W = config.WIDTH, H = config.HEIGHT;
		var original = sel.mask;
		var state = this.refine_state || { smooth: 0, feather: 0, contrast: 0, shift: 0, view: 'On White', output: 'Selection' };
		var flat = document.createElement('canvas');
		flat.width = W;
		flat.height = H;
		this.Base_layers.convert_layers_to_canvas(flat.getContext('2d'), null, false);
		var compute = () => {
			var c = document.createElement('canvas');
			c.width = W;
			c.height = H;
			var ctx = c.getContext('2d', { willReadFrequently: true });
			var blur = state.smooth / 10 + state.feather;
			if (blur > 0) ctx.filter = 'blur(' + blur + 'px)';
			ctx.drawImage(original, 0, 0);
			ctx.filter = 'none';
			var img = ctx.getImageData(0, 0, W, H), d = img.data;
			var k = 1 + state.contrast / 10, shift = state.shift / 100 * 0.5;
			var hard = state.smooth > 0 && state.feather == 0;
			for (var i = 3; i < d.length; i += 4) {
				var a = d[i] / 255 + shift;
				if (hard) a = a >= 0.5 ? 1 : 0;
				a = (a - 0.5) * k + 0.5;
				d[i] = Math.max(0, Math.min(255, Math.round(a * 255)));
				d[i - 3] = d[i - 2] = d[i - 1] = 255;
			}
			ctx.putImageData(img, 0, 0);
			return c;
		};
		var scale = Math.min(300 / W, 220 / H);
		var pw = Math.max(1, Math.round(W * scale)), ph = Math.max(1, Math.round(H * scale));
		var slider = (key, label, min, max, unit) => '<div class="ps_adj_slider"><span>' + label + '</span><input type="number" data-num="' + key + '" min="' + min + '" max="' + max + '"><span class="ps_adj_unit">' + unit + '</span><input type="range" data-range="' + key + '" min="' + min + '" max="' + max + '"></div>';
		var html = '<div class="ps_cr">'
			+ '<div class="ps_adj_row"><span>View:</span><select id="re_view">' + ['Marching Ants', 'Overlay', 'On Black', 'On White', 'Black & White', 'On Layers', 'Reveal Layer'].map(v => '<option>' + v + '</option>').join('') + '</select></div>'
			+ '<canvas id="re_preview" class="ps_cr_preview" width="' + pw + '" height="' + ph + '"></canvas>'
			+ '<div class="ps_adj_label">Adjust Edge</div>'
			+ slider('smooth', 'Smooth:', 0, 100, '') + slider('feather', 'Feather:', 0, 250, 'px') + slider('contrast', 'Contrast:', 0, 100, '%') + slider('shift', 'Shift Edge:', -100, 100, '%')
			+ '<div class="ps_adj_row"><span>Output To:</span><select id="re_output">' + ['Selection', 'Layer Mask', 'New Layer', 'New Layer with Layer Mask'].map(v => '<option>' + v + '</option>').join('') + '</select></div>'
			+ '</div>';
		var POP = new Dialog_class();
		POP.show({
			title: 'Refine Edge',
			className: 'ps_adjust_dialog',
			params: [{ function() { return html; } }],
			on_finish: () => {
				this.refine_state = state;
				this.refine_output(compute(), state.output);
			},
		});
		var root = document.querySelector('#popups .popup .ps_cr');
		var preview = root.querySelector('#re_preview');
		var draw = () => {
			var m = compute();
			var pctx = preview.getContext('2d');
			var bgs = { 'On White': '#fff', 'On Black': '#000', 'Black & White': '#000', 'Overlay': null, 'Marching Ants': null, 'On Layers': null, 'Reveal Layer': null };
			pctx.clearRect(0, 0, pw, ph);
			if (state.view == 'Black & White') {
				pctx.fillStyle = '#000';
				pctx.fillRect(0, 0, pw, ph);
				pctx.drawImage(m, 0, 0, pw, ph);
				return;
			}
			if (state.view == 'Reveal Layer' || state.view == 'Marching Ants') {
				pctx.drawImage(flat, 0, 0, pw, ph);
				return;
			}
			if (bgs[state.view]) {
				pctx.fillStyle = bgs[state.view];
				pctx.fillRect(0, 0, pw, ph);
			}
			var cut = document.createElement('canvas');
			cut.width = W;
			cut.height = H;
			var cctx = cut.getContext('2d');
			cctx.drawImage(flat, 0, 0);
			cctx.globalCompositeOperation = 'destination-in';
			cctx.drawImage(m, 0, 0);
			if (state.view == 'Overlay') {
				pctx.drawImage(flat, 0, 0, pw, ph);
				var red = document.createElement('canvas');
				red.width = W;
				red.height = H;
				var rctx = red.getContext('2d');
				rctx.fillStyle = 'rgba(255,0,0,0.5)';
				rctx.fillRect(0, 0, W, H);
				rctx.globalCompositeOperation = 'destination-out';
				rctx.drawImage(m, 0, 0);
				pctx.drawImage(red, 0, 0, pw, ph);
				return;
			}
			pctx.drawImage(cut, 0, 0, pw, ph);
		};
		root.querySelectorAll('[data-num]').forEach((num) => {
			var key = num.dataset.num, range = root.querySelector('[data-range="' + key + '"]');
			num.value = range.value = state[key];
			var set = (v) => { if (isNaN(v)) return; state[key] = Math.max(parseFloat(num.min), Math.min(parseFloat(num.max), v)); num.value = range.value = state[key]; draw(); };
			range.addEventListener('input', () => set(parseFloat(range.value)));
			num.addEventListener('change', () => set(parseFloat(num.value)));
		});
		var view = root.querySelector('#re_view'), output = root.querySelector('#re_output');
		view.value = state.view;
		output.value = state.output;
		view.addEventListener('change', () => { state.view = view.value; draw(); });
		output.addEventListener('change', () => { state.output = output.value; });
		draw();
	}

	refine_output(mask, output) {
		var sel = this.selection();
		var layer = config.layer;
		if (output == 'Selection' || !layer || layer.type != 'image') {
			return sel.commit(mask, 'Refine Edge');
		}
		if (output == 'Layer Mask') {
			if (layer.ps_mask) {
				alertify.error('The layer already has a layer mask.');
				return;
			}
			return app.GUI.Ps_workspace.Mask.set_mask(layer, mask, 'Refine Edge', { ps_mask_editing: false }).then(() => sel.deselect());
		}
		//New Layer / New Layer with Layer Mask: a copy of the layer
		var W = config.WIDTH, H = config.HEIGHT;
		var copy = document.createElement('canvas');
		copy.width = W;
		copy.height = H;
		var cctx = copy.getContext('2d');
		cctx.drawImage(layer.link, layer.x, layer.y, layer.width, layer.height);
		var settings = { type: 'image', name: layer.name + ' copy', x: 0, y: 0, width: W, height: H, width_original: W, height_original: H };
		if (output == 'New Layer') {
			cctx.globalCompositeOperation = 'destination-in';
			cctx.drawImage(mask, 0, 0);
		}
		else {
			Object.assign(settings, { ps_mask: mask, ps_mask_x: 0, ps_mask_y: 0 });
		}
		settings.data = copy.toDataURL('image/png');
		return app.State.do_action(new app.Actions.Bundle_action('refine_edge', 'Refine Edge', [
			new app.Actions.Insert_layer_action(settings),
		])).then(() => sel.deselect());
	}

	/**
	 * File > Save As: CS6 format list; JPEG and PNG get their CS6 options dialogs
	 */
	save_as() {
		var formats = {
			'Photoshop (*.PSD;*.PDD)': 'PSD', 'BMP (*.BMP;*.RLE;*.DIB)': 'BMP', 'CompuServe GIF (*.GIF)': 'GIF',
			'JPEG (*.JPG;*.JPEG;*.JPE)': 'JPG', 'PNG (*.PNG;*.PNS)': 'PNG', 'TIFF (*.TIF;*.TIFF)': 'TIFF', 'WebP (*.WEBP)': 'WEBP',
		};
		var ws = app.GUI.Ps_workspace;
		var current = ws.saved_as_psd ? 'Photoshop (*.PSD;*.PDD)' : (this.last_save_format || 'Photoshop (*.PSD;*.PDD)');
		this.POP.show({
			title: 'Save As',
			params: [
				{ name: 'name', title: 'File name:', value: ws.document_name().replace(/\.[^.]+$/, '') },
				{ name: 'format', title: 'Format:', values: Object.keys(formats), value: current, type: 'select' },
			],
			on_finish: (params) => {
				var type = formats[params.format] || 'PSD';
				this.last_save_format = params.format;
				var name = (params.name || 'Untitled').replace(/\.[^.]+$/, '');
				if (type == 'PSD') {
					save_psd(name);
					ws.set_document_name(name, name + '.psd');
					app.State.ps_saved_index = app.State.action_history_index;
					return;
				}
				var save = (quality) => app.GUI.modules['file/save'].save_action({ name: name, type: type, quality: quality || 90, layers: 'All', delay: 400 });
				if (type == 'JPG') return this.jpeg_options((q) => save(q));
				if (type == 'PNG') return this.png_options(() => save(100));
				save(90);
			},
		});
	}

	/**
	 * CS6 JPEG Options: Quality 0-12 (Low / Medium / High / Maximum)
	 */
	jpeg_options(done) {
		var names = (q) => q <= 4 ? 'Low' : (q <= 7 ? 'Medium' : (q <= 9 ? 'High' : 'Maximum'));
		var q0 = this.jpeg_quality == null ? 10 : this.jpeg_quality;
		var html = '<div class="ps_adj">'
			+ '<div class="ps_adj_row"><span>Matte:</span><select disabled><option>None</option></select></div>'
			+ '<div class="ps_adj_label">Image Options</div>'
			+ '<div class="ps_adj_row"><span>Quality:</span><input type="number" id="jq" min="0" max="12" value="' + q0 + '" style="width:48px"><select id="jqn">' + ['Low', 'Medium', 'High', 'Maximum'].map(n => '<option' + (n == names(q0) ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>'
			+ '<input type="range" id="jqr" min="0" max="12" value="' + q0 + '" style="width:220px">'
			+ '<div class="ps_adj_hint" style="display:flex;justify-content:space-between;width:220px"><span>small file</span><span>large file</span></div>'
			+ '<div class="ps_adj_label">Format Options</div>'
			+ '<label class="ps_adj_check"><input type="radio" name="jfmt" checked> Baseline ("Standard")</label>'
			+ '<label class="ps_adj_check"><input type="radio" name="jfmt"> Baseline Optimized</label>'
			+ '<label class="ps_adj_check"><input type="radio" name="jfmt"> Progressive</label>'
			+ '<div class="ps_adj_hint" id="jsize"></div></div>';
		var POP = new Dialog_class();
		POP.show({
			title: 'JPEG Options',
			className: 'ps_adjust_dialog',
			params: [{ function() { return html; } }],
			on_finish: () => {
				var q = parseInt(document.getElementById('jq') ? document.getElementById('jq').value : q0);
				this.jpeg_quality = isNaN(q) ? q0 : Math.max(0, Math.min(12, q));
				done(Math.max(1, Math.round(this.jpeg_quality / 12 * 100)));
			},
		});
		var root = document.querySelector('#popups .popup .ps_adj');
		var qn = root.querySelector('#jq'), qr = root.querySelector('#jqr'), qs = root.querySelector('#jqn');
		var flat = document.createElement('canvas');
		flat.width = config.WIDTH;
		flat.height = config.HEIGHT;
		var fctx = flat.getContext('2d');
		fctx.fillStyle = '#fff';
		fctx.fillRect(0, 0, flat.width, flat.height);
		this.Base_layers.convert_layers_to_canvas(fctx, null, false);
		var estimate = (q) => flat.toBlob((b) => { var el = root.querySelector('#jsize'); if (el && b) el.textContent = 'Size: ~' + (b.size / 1024).toFixed(1) + 'K'; }, 'image/jpeg', Math.max(0.01, q / 12));
		var set = (q) => { q = Math.max(0, Math.min(12, Math.round(q))); qn.value = qr.value = q; qs.value = names(q); estimate(q); };
		qn.addEventListener('change', () => set(parseFloat(qn.value) || 0));
		qr.addEventListener('input', () => set(parseFloat(qr.value)));
		qs.addEventListener('change', () => set({ Low: 3, Medium: 6, High: 8, Maximum: 12 }[qs.value]));
		estimate(q0);
	}

	png_options(done) {
		this.POP.show({
			title: 'PNG Options',
			params: [
				{ title: 'Compression' },
				{ name: 'compression', title: '', values: ['None / Fast', 'Smallest / Slow'], value: 'Smallest / Slow' },
				{ title: 'Interlace' },
				{ name: 'interlace', title: '', values: ['None', 'Interlaced'], value: 'None' },
			],
			on_finish: () => done(),
		});
	}

	next_layer_name() {
		var n = 0;
		for (var l of config.layers) {
			var m = /^Layer (\d+)$/.exec(l.name);
			if (m) n = Math.max(n, parseInt(m[1]));
		}
		return 'Layer ' + (n + 1);
	}

	/**
	 * Layer > New > Layer (Shift+Ctrl+N): CS6 New Layer dialog
	 */
	new_layer_dialog() {
		var colors = ['None', 'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Violet', 'Gray'];
		var modes = { 'Normal': 'source-over', 'Multiply': 'multiply', 'Screen': 'screen', 'Overlay': 'overlay', 'Soft Light': 'soft-light', 'Hard Light': 'hard-light',
			'Darken': 'darken', 'Lighten': 'lighten', 'Color Dodge': 'color-dodge', 'Color Burn': 'color-burn', 'Difference': 'difference', 'Exclusion': 'exclusion',
			'Hue': 'hue', 'Saturation': 'saturation', 'Color': 'color', 'Luminosity': 'luminosity' };
		this.POP.show({
			title: 'New Layer',
			params: [
				{ name: 'name', title: 'Name:', value: this.next_layer_name() },
				{ name: 'clip', title: 'Use Previous Layer to Create Clipping Mask', value: false },
				{ name: 'color', title: 'Color:', values: colors, value: 'None', type: 'select' },
				{ name: 'mode', title: 'Mode:', values: Object.keys(modes), value: 'Normal', type: 'select' },
				{ name: 'opacity', title: 'Opacity (%):', value: 100, range: [0, 100] },
			],
			on_finish: (params) => {
				var settings = { name: params.name || this.next_layer_name(), opacity: parseInt(params.opacity), composition: params.clip ? 'source-atop' : (modes[params.mode] || 'source-over') };
				if (params.color && params.color != 'None') settings.ps_color = params.color;
				app.State.do_action(new app.Actions.Bundle_action('new_layer', 'New Layer', [new app.Actions.Insert_layer_action(settings)]));
			},
		});
	}

	/**
	 * Layers panel menu > Layer Properties: name and color label
	 */
	layer_properties() {
		var layer = config.layer;
		if (!layer) return;
		var colors = ['None', 'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Violet', 'Gray'];
		this.POP.show({
			title: 'Layer Properties',
			params: [
				{ name: 'name', title: 'Name:', value: layer.name },
				{ name: 'color', title: 'Color:', values: colors, value: layer.ps_color || 'None', type: 'select' },
			],
			on_finish: (params) => {
				app.State.do_action(new app.Actions.Bundle_action('layer_properties', 'Layer Properties', [
					new app.Actions.Update_layer_action(layer.id, { name: params.name || layer.name, ps_color: params.color == 'None' ? null : params.color }),
				])).then(() => app.GUI.GUI_layers.render_layers());
			},
		});
	}

	/**
	 * Layer > Duplicate Layer: CS6 dialog (name, destination document)
	 */
	duplicate_layer_dialog() {
		var layer = config.layer;
		if (!layer) return;
		var ws = app.GUI.Ps_workspace;
		var docs = ws.Documents.docs.map(d => d.name);
		var base = layer.name.replace(/ copy( \d+)?$/, '');
		this.POP.show({
			title: 'Duplicate Layer',
			params: [
				{ title: 'Duplicate: ' + app.GUI.Ps_workspace.Helper.escapeHtml(layer.name) },
				{ name: 'name', title: 'As:', value: base + ' copy' },
				{ title: 'Destination' },
				{ name: 'doc', title: 'Document:', values: docs, value: docs[ws.Documents.active], type: 'select' },
			],
			on_finish: async (params) => {
				var target = docs.indexOf(params.doc);
				if (target < 0 || target == ws.Documents.active) {
					await app.GUI.modules['layer/duplicate'].duplicate();
					if (params.name) await app.State.do_action(new app.Actions.Bundle_action('rename', 'Duplicate Layer', [new app.Actions.Update_layer_action(config.layer.id, { name: params.name })]), { merge_with_history: ['duplicate_layer'] });
					app.GUI.GUI_layers.render_layers();
					return;
				}
				//another document: copy the rendered pixels, keeping their position
				var full = this.Base_layers.convert_layer_to_canvas(layer.id, false, false);
				var settings = { type: 'image', name: params.name || layer.name, x: 0, y: 0, width: full.width, height: full.height, width_original: full.width, height_original: full.height, data: full.toDataURL('image/png'), opacity: layer.opacity, composition: layer.composition };
				ws.Documents.switch_to(target);
				await app.State.do_action(new app.Actions.Bundle_action('duplicate_layer', 'Duplicate Layer', [new app.Actions.Insert_layer_action(settings)]));
			},
		});
	}

	save_for_web() {
		this.Save_for_web = this.Save_for_web || new Ps_save_for_web_class();
		this.Save_for_web.open();
	}

	liquify() {
		this.Liquify = this.Liquify || new Ps_liquify_class();
		this.Liquify.open();
	}

	define_pattern() {
		var sel = this.selection();
		var b = sel.has() && sel.bounds ? sel.bounds : { x: 0, y: 0, width: config.WIDTH, height: config.HEIGHT };
		var flat = document.createElement('canvas');
		flat.width = config.WIDTH;
		flat.height = config.HEIGHT;
		this.Base_layers.convert_layers_to_canvas(flat.getContext('2d'), null, false);
		var piece = document.createElement('canvas');
		piece.width = Math.max(1, Math.round(b.width));
		piece.height = Math.max(1, Math.round(b.height));
		piece.getContext('2d').drawImage(flat, -b.x, -b.y);
		this.POP.show({
			title: 'Pattern Name',
			params: [{ name: 'name', title: 'Name:', value: Patterns.next_name() }],
			on_finish: (params) => Patterns.add(params.name || Patterns.next_name(), piece),
		});
	}

	/**
	 * Layer > New Fill Layer > Gradient / Pattern (rendered into a pixel layer)
	 */
	new_gradient_fill_layer() {
		this.POP.show({
			title: 'Gradient Fill',
			params: [
				{ name: 'style', title: 'Style:', values: ['Linear', 'Radial', 'Reflected'], value: 'Linear', type: 'select' },
				{ name: 'angle', title: 'Angle:', value: 90, range: [-180, 180] },
				{ name: 'scale', title: 'Scale (%):', value: 100, range: [10, 150] },
				{ name: 'reverse', title: 'Reverse', value: false },
			],
			on_finish: (params) => {
				var W = config.WIDTH, H = config.HEIGHT;
				var canvas = document.createElement('canvas');
				canvas.width = W;
				canvas.height = H;
				var ctx = canvas.getContext('2d');
				var a = parseFloat(params.angle) * Math.PI / 180, s = (parseFloat(params.scale) || 100) / 100;
				var c1 = params.reverse ? config.BG_COLOR : config.COLOR, c2 = params.reverse ? config.COLOR : config.BG_COLOR;
				var cx = W / 2, cy = H / 2, len = (Math.abs(Math.cos(a)) * W + Math.abs(Math.sin(a)) * H) / 2 * s;
				var grad;
				if (params.style == 'Radial') {
					grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(W, H) / 2 * s);
					grad.addColorStop(0, c1);
					grad.addColorStop(1, c2);
				}
				else {
					grad = ctx.createLinearGradient(cx - Math.cos(a) * len, cy + Math.sin(a) * len, cx + Math.cos(a) * len, cy - Math.sin(a) * len);
					if (params.style == 'Reflected') {
						grad.addColorStop(0, c2); grad.addColorStop(0.5, c1); grad.addColorStop(1, c2);
					}
					else {
						grad.addColorStop(0, c1); grad.addColorStop(1, c2);
					}
				}
				ctx.fillStyle = grad;
				ctx.fillRect(0, 0, W, H);
				this.insert_fill_layer(canvas, 'Gradient Fill');
			},
		});
	}

	new_pattern_fill_layer() {
		this.POP.show({
			title: 'Pattern Fill',
			params: [
				{ name: 'pattern', title: 'Pattern:', values: Patterns.names(), value: Patterns.names()[0], type: 'select' },
				{ name: 'scale', title: 'Scale (%):', value: 100, range: [1, 1000] },
			],
			on_finish: (params) => {
				this.insert_fill_layer(Patterns.tiled(params.pattern, config.WIDTH, config.HEIGHT, parseFloat(params.scale) || 100), 'Pattern Fill');
			},
		});
	}

	insert_fill_layer(canvas, base) {
		var n = 1;
		while (config.layers.some(l => l.name == base + ' ' + n)) n++;
		var sel = this.selection();
		var settings = {
			name: base + ' ' + n, type: 'image', x: 0, y: 0, width: canvas.width, height: canvas.height,
			width_original: canvas.width, height_original: canvas.height, data: canvas.toDataURL('image/png'),
		};
		if (sel.has()) {
			//CS6: a selection becomes the fill layer's mask
			var mask = document.createElement('canvas');
			mask.width = sel.mask.width;
			mask.height = sel.mask.height;
			mask.getContext('2d').drawImage(sel.mask, 0, 0);
			Object.assign(settings, { ps_mask: mask, ps_mask_x: 0, ps_mask_y: 0 });
		}
		return app.State.do_action(new app.Actions.Bundle_action('fill_layer', 'New Fill Layer', [
			new app.Actions.Insert_layer_action(settings),
		])).then(() => { if (sel.has()) sel.deselect(); });
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

	modify_smooth() {
		var sel = this.selection();
		if (!sel.has()) return;
		this.POP.show({
			title: 'Smooth Selection',
			params: [{ name: 'amount', title: 'Sample Radius: (pixels)', value: 2, range: [1, 100] }],
			on_finish: (params) => sel.smooth(params.amount),
		});
	}

	grow() { this.selection().grow(false); }
	similar() { this.selection().grow(true); }
	transform_selection() { app.GUI.Ps_workspace.Transform.start_selection(); }
	save_selection() { app.GUI.Ps_workspace.Alpha.save_selection(); }
	load_selection() { app.GUI.Ps_workspace.Alpha.load_selection(); }

	/**
	 * Select > Color Range: sample in the preview (click), Fuzziness, Invert
	 */
	color_range() {
		var Selection = this.selection();
		var src = Selection.sample_source(true);
		var W = config.WIDTH, H = config.HEIGHT;
		var state = this.color_range_state || { mode: 'Sampled Colors', fuzziness: 40, invert: false, color: null, view: 'Selection' };
		if (!state.color) {
			var fg = config.COLOR;
			state.color = [parseInt(fg.substr(1, 2), 16), parseInt(fg.substr(3, 2), 16), parseInt(fg.substr(5, 2), 16)];
		}
		var modes = ['Sampled Colors', 'Reds', 'Yellows', 'Greens', 'Cyans', 'Blues', 'Magentas', 'Highlights', 'Midtones', 'Shadows'];
		var scale = Math.min(220 / W, 180 / H);
		var pw = Math.max(1, Math.round(W * scale)), ph = Math.max(1, Math.round(H * scale));
		var html = '<div class="ps_cr">'
			+ '<div class="ps_adj_row"><span>Select:</span><select id="cr_mode">' + modes.map(m => '<option>' + m + '</option>').join('') + '</select></div>'
			+ '<div class="ps_adj_slider"><span>Fuzziness:</span><input type="number" id="cr_fuzz_n" min="0" max="200"><span class="ps_adj_unit"></span><input type="range" id="cr_fuzz" min="0" max="200"></div>'
			+ '<canvas id="cr_preview" class="ps_cr_preview" width="' + pw + '" height="' + ph + '" title="Click to sample a color"></canvas>'
			+ '<div class="ps_adj_row"><label class="ps_adj_check"><input type="radio" name="cr_view" value="Selection"> Selection</label><label class="ps_adj_check"><input type="radio" name="cr_view" value="Image"> Image</label></div>'
			+ '<label class="ps_adj_check"><input type="checkbox" id="cr_invert"> Invert</label></div>';
		var compute = () => {
			var arr = Selection.color_range_mask(src, state.mode, state.color, state.fuzziness);
			if (state.invert) for (var i = 0; i < arr.length; i++) arr[i] = 255 - arr[i];
			return arr;
		};
		var image = document.createElement('canvas');
		image.width = W;
		image.height = H;
		image.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(src), W, H), 0, 0);
		var POP = new Dialog_class();
		POP.show({
			title: 'Color Range',
			className: 'ps_adjust_dialog',
			params: [{ function() { return html; } }],
			on_finish: () => {
				this.color_range_state = state;
				Selection.commit(Selection.array_to_mask(compute()), 'Color Range');
			},
		});
		var root = document.querySelector('#popups .popup .ps_cr');
		var preview = root.querySelector('#cr_preview');
		var draw = () => {
			var pctx = preview.getContext('2d');
			if (state.view == 'Image') {
				pctx.drawImage(image, 0, 0, pw, ph);
				return;
			}
			var arr = compute();
			var mask = document.createElement('canvas');
			mask.width = W;
			mask.height = H;
			var mctx = mask.getContext('2d');
			var img = mctx.createImageData(W, H);
			for (var i = 0; i < arr.length; i++) {
				img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = arr[i];
				img.data[i * 4 + 3] = 255;
			}
			mctx.putImageData(img, 0, 0);
			pctx.drawImage(mask, 0, 0, pw, ph);
		};
		var mode = root.querySelector('#cr_mode'), fz = root.querySelector('#cr_fuzz'), fzn = root.querySelector('#cr_fuzz_n');
		mode.value = state.mode;
		fz.value = fzn.value = state.fuzziness;
		var sync = () => { fz.disabled = fzn.disabled = state.mode != 'Sampled Colors'; };
		mode.addEventListener('change', () => { state.mode = mode.value; sync(); draw(); });
		var set_fuzz = (v) => { if (isNaN(v)) return; state.fuzziness = Math.max(0, Math.min(200, v)); fz.value = fzn.value = state.fuzziness; draw(); };
		fz.addEventListener('input', () => set_fuzz(parseFloat(fz.value)));
		fzn.addEventListener('change', () => set_fuzz(parseFloat(fzn.value)));
		root.querySelectorAll('input[name="cr_view"]').forEach((r) => {
			r.checked = r.value == state.view;
			r.addEventListener('change', () => { if (r.checked) { state.view = r.value; draw(); } });
		});
		var inv = root.querySelector('#cr_invert');
		inv.checked = state.invert;
		inv.addEventListener('change', () => { state.invert = inv.checked; draw(); });
		preview.addEventListener('click', (e) => {
			var rect = preview.getBoundingClientRect();
			var x = Math.floor((e.clientX - rect.left) / rect.width * W), y = Math.floor((e.clientY - rect.top) / rect.height * H);
			var i = (Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))) * 4;
			state.color = [src[i], src[i + 1], src[i + 2]];
			state.mode = 'Sampled Colors';
			mode.value = state.mode;
			sync();
			draw();
		});
		sync();
		draw();
	}

	// ---------- layer selection (Select menu) ----------

	select_all_layers() {
		var Multi = app.GUI.Ps_workspace.Multi;
		var ordered = app.GUI.Ps_workspace.Groups.ordered();
		//CS6: all layers except the Background
		var list = ordered.filter((l, i) => !(i == ordered.length - 1 && l.name == 'Background'));
		if (!list.length) return;
		var keep = list.map(l => l.id);
		var activate = list.includes(config.layer) ? Promise.resolve() : app.State.do_action(new app.Actions.Select_layer_action(list[0].id));
		activate.then(() => { Multi.ids = keep; app.GUI.GUI_layers.render_layers(); });
	}

	deselect_layers() {
		app.GUI.Ps_workspace.Multi.clear();
		app.GUI.GUI_layers.render_layers();
	}

	similar_layers() {
		var Multi = app.GUI.Ps_workspace.Multi;
		var type = config.layer ? config.layer.type : null;
		var list = config.layers.filter(l => l.type == type);
		Multi.ids = list.map(l => l.id);
		app.GUI.GUI_layers.render_layers();
	}

	// ---------- Layer ----------

	/**
	 * Layer > Layer Mask > From Transparency: transparency moves into a layer mask
	 */
	mask_from_transparency() {
		var layer = config.layer;
		if (!layer || layer.type != 'image' || !layer.link || layer.ps_mask) return;
		var mask = document.createElement('canvas');
		mask.width = config.WIDTH;
		mask.height = config.HEIGHT;
		this.Base_layers.render_object(mask.getContext('2d'), Object.assign(Object.create(Object.getPrototypeOf(layer)), layer, { opacity: 100, ps_mask: null, ps_styles: null }));
		var mctx = mask.getContext('2d');
		mctx.globalCompositeOperation = 'source-in';
		mctx.fillStyle = '#fff';
		mctx.fillRect(0, 0, mask.width, mask.height);
		var opaque = document.createElement('canvas');
		opaque.width = layer.width_original;
		opaque.height = layer.height_original;
		var octx = opaque.getContext('2d', { willReadFrequently: true });
		octx.drawImage(layer.link, 0, 0);
		var img = octx.getImageData(0, 0, opaque.width, opaque.height);
		for (var i = 3; i < img.data.length; i += 4) img.data[i] = 255;
		octx.putImageData(img, 0, 0);
		app.State.do_action(new app.Actions.Bundle_action('layer_mask', 'From Transparency', [
			new app.Actions.Update_layer_image_action(opaque, layer.id),
			new app.Actions.Update_layer_action(layer.id, { ps_mask: mask, ps_mask_x: layer.x, ps_mask_y: layer.y, ps_mask_disabled: false, ps_mask_editing: false }),
		])).then(() => app.GUI.GUI_layers.render_layers());
	}

	/**
	 * Layer > New > Background from Layer
	 */
	async background_from_layer() {
		var layer = config.layer;
		var Groups = app.GUI.Ps_workspace.Groups;
		var ordered = Groups.ordered();
		if (!layer || layer.type != 'image' || ordered.some((l, i) => i == ordered.length - 1 && l.name == 'Background' && l !== layer)) {
			alertify.error('Could not complete the Background from Layer command because the document already has a Background.');
			return;
		}
		var canvas = document.createElement('canvas');
		canvas.width = config.WIDTH;
		canvas.height = config.HEIGHT;
		var ctx = canvas.getContext('2d');
		ctx.fillStyle = config.BG_COLOR;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		this.Base_layers.render_object(ctx, Object.assign(Object.create(Object.getPrototypeOf(layer)), layer, { opacity: 100 }));
		var list = ordered.filter(l => l !== layer);
		list.push(layer);
		var actions = [
			new app.Actions.Update_layer_action(layer.id, { name: 'Background', opacity: 100, composition: 'source-over', ps_parent: null, x: 0, y: 0, width: canvas.width, height: canvas.height, width_original: canvas.width, height_original: canvas.height }),
			new app.Actions.Update_layer_image_action(canvas, layer.id),
		].concat(Groups.restack_actions(list, {}));
		await app.State.do_action(new app.Actions.Bundle_action('background_from_layer', 'Background from Layer', actions));
		Groups.after_change();
	}

	/**
	 * Layer > Arrange > Reverse (several layers selected)
	 */
	async arrange_reverse() {
		var Multi = app.GUI.Ps_workspace.Multi;
		var Groups = app.GUI.Ps_workspace.Groups;
		var sel = Multi.selected();
		if (sel.length < 2) return;
		var ordered = Groups.ordered();
		var slots = ordered.map((l, i) => sel.includes(l) ? i : -1).filter(i => i >= 0);
		var reversed = sel.slice().reverse();
		var list = ordered.slice();
		slots.forEach((slot, k) => { list[slot] = reversed[k]; });
		var keep = Multi.ids.slice();
		await app.State.do_action(new app.Actions.Bundle_action('arrange', 'Reverse', Groups.restack_actions(list, {})));
		Multi.ids = keep;
		Groups.after_change();
	}

	/**
	 * File > Scripts > Delete All Empty Layers
	 */
	async delete_empty_layers() {
		var empty = config.layers.filter(l => l.type == null || (l.type == 'image' && l.link && this.Base_layers.is_layer_empty(l.id)));
		if (!empty.length || empty.length == config.layers.length) return;
		await app.State.do_action(new app.Actions.Bundle_action('delete_layers', 'Delete Layers', empty.map(l => new app.Actions.Delete_layer_action(l.id, true))));
		app.GUI.Ps_workspace.Groups.after_change();
	}

	/**
	 * Layer > Matting: Defringe / Remove Black Matte / Remove White Matte
	 */
	matting(kind, width) {
		var layer = config.layer;
		if (!layer || layer.type != 'image' || !layer.link) return;
		var c = document.createElement('canvas');
		c.width = layer.width_original;
		c.height = layer.height_original;
		var ctx = c.getContext('2d', { willReadFrequently: true });
		ctx.drawImage(layer.link, 0, 0);
		var img = ctx.getImageData(0, 0, c.width, c.height), d = img.data, w = c.width, h = c.height;
		if (kind == 'defringe') {
			//edge pixels take the color of the nearest fully opaque pixel within `width`
			var src = new Uint8ClampedArray(d);
			var r = Math.max(1, Math.round(width || 1));
			for (var y = 0; y < h; y++) {
				for (var x = 0; x < w; x++) {
					var i = (y * w + x) * 4;
					if (src[i + 3] == 0 || src[i + 3] == 255) continue;
					var best = -1, bd = 1e9;
					for (var yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) {
						for (var xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) {
							var j = (yy * w + xx) * 4;
							if (src[j + 3] < 255) continue;
							var dd = (xx - x) * (xx - x) + (yy - y) * (yy - y);
							if (dd < bd) { bd = dd; best = j; }
						}
					}
					if (best >= 0) { d[i] = src[best]; d[i + 1] = src[best + 1]; d[i + 2] = src[best + 2]; }
				}
			}
		}
		else {
			var matte = kind == 'white' ? 255 : 0;
			for (var k = 0; k < d.length; k += 4) {
				var a = d[k + 3] / 255;
				if (a == 0 || a == 1) continue;
				for (var ch = 0; ch < 3; ch++) d[k + ch] = (d[k + ch] - matte * (1 - a)) / a;
			}
		}
		ctx.putImageData(img, 0, 0);
		var names = { defringe: 'Defringe', black: 'Remove Black Matte', white: 'Remove White Matte' };
		app.State.do_action(new app.Actions.Bundle_action('matting', names[kind], [new app.Actions.Update_layer_image_action(c, layer.id)]));
	}

	defringe() {
		this.POP.show({
			title: 'Defringe',
			params: [{ name: 'width', title: 'Width: (pixels)', value: 1, range: [1, 200] }],
			on_finish: (params) => this.matting('defringe', parseInt(params.width) || 1),
		});
	}
	remove_black_matte() { this.matting('black'); }
	remove_white_matte() { this.matting('white'); }

	// ---------- Image / File ----------

	/**
	 * Image > Duplicate: the document (all layers) in a new tab
	 */
	async duplicate_document() {
		var ws = app.GUI.Ps_workspace;
		var name = ws.document_name() + ' copy';
		var POP = new Dialog_class();
		POP.show({
			title: 'Duplicate Image',
			params: [{ name: 'name', title: 'As:', value: name }, { name: 'merged', title: 'Duplicate Merged Layers Only', value: false }],
			on_finish: async (params) => {
				var W = config.WIDTH, H = config.HEIGHT;
				var merged = !!params.merged;
				var copies = [];
				if (merged) {
					var flat = document.createElement('canvas');
					flat.width = W;
					flat.height = H;
					this.Base_layers.convert_layers_to_canvas(flat.getContext('2d'), null, false);
					copies.push({ type: 'image', name: 'Background', x: 0, y: 0, width: W, height: H, width_original: W, height_original: H, data: flat.toDataURL('image/png') });
				}
				else {
					for (var l of app.GUI.Ps_workspace.Groups.ordered().slice().reverse()) {
						var copy = {};
						for (var k in l) {
							if (['id', 'link', 'link_canvas', 'order'].includes(k) || k.startsWith('_')) continue;
							copy[k] = l[k];
						}
						if (l.type == 'image' && l.link) {
							var c = document.createElement('canvas');
							c.width = l.width_original;
							c.height = l.height_original;
							c.getContext('2d').drawImage(l.link, 0, 0);
							copy.data = c.toDataURL('image/png');
						}
						copy._old_id = l.id;
						copy._old_parent = l.ps_parent;
						copy.ps_parent = null;
						copies.push(copy);
					}
				}
				ws.Documents.add(params.name || name);
				var actions = [
					new app.Actions.Prepare_canvas_action('undo'),
					new app.Actions.Update_config_action({ WIDTH: W, HEIGHT: H }),
					new app.Actions.Reset_layers_action(),
				];
				copies.forEach((settings, i) => {
					var s = Object.assign({}, settings);
					delete s._old_id;
					delete s._old_parent;
					s.order = i + 1;
					actions.push(new app.Actions.Insert_layer_action(s, false));
				});
				actions.push(new app.Actions.Prepare_canvas_action('do'));
				await app.State.do_action(new app.Actions.Bundle_action('open', 'Duplicate', actions));
				//groups: reconnect members
				if (!merged) {
					var by_old = {};
					copies.forEach((s, i) => { by_old[s._old_id] = config.layers.find(l => l.order == i + 1); });
					copies.forEach((s, i) => {
						var layer = config.layers.find(l => l.order == i + 1);
						if (layer && s._old_parent && by_old[s._old_parent]) layer.ps_parent = by_old[s._old_parent].id;
					});
				}
				app.State.action_history = [];
				app.State.action_history_index = 0;
				app.GUI.Ps_workspace.Groups.after_change();
				app.GUI.GUI_preview.zoom_auto(true);
			},
		});
	}

	/**
	 * Image > Reveal All: enlarge the canvas to show every layer's pixels
	 */
	reveal_all() {
		var x0 = 0, y0 = 0, x1 = config.WIDTH, y1 = config.HEIGHT;
		for (var l of config.layers) {
			if (l.type == null || l.x == null || l.width == null) continue;
			x0 = Math.min(x0, l.x); y0 = Math.min(y0, l.y);
			x1 = Math.max(x1, l.x + l.width); y1 = Math.max(y1, l.y + l.height);
		}
		x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.ceil(x1); y1 = Math.ceil(y1);
		if (x0 == 0 && y0 == 0 && x1 == config.WIDTH && y1 == config.HEIGHT) return;
		var actions = [new app.Actions.Prepare_canvas_action('undo')];
		for (var layer of config.layers) {
			if (layer.x == null) continue;
			actions.push(new app.Actions.Update_layer_action(layer.id, { x: layer.x - x0, y: layer.y - y0 }));
			if (layer.ps_mask) actions.push(new app.Actions.Update_layer_action(layer.id, { ps_mask_x: layer.ps_mask_x - x0, ps_mask_y: layer.ps_mask_y - y0 }));
		}
		actions.push(new app.Actions.Update_config_action({ WIDTH: x1 - x0, HEIGHT: y1 - y0 }));
		actions.push(new app.Actions.Prepare_canvas_action('do'));
		app.State.do_action(new app.Actions.Bundle_action('reveal_all', 'Reveal All', actions)).then(() => app.GUI.GUI_preview.zoom_auto(true));
	}

	/**
	 * File > Revert: back to the state the document was opened in (undoable)
	 */
	async revert() {
		var history = app.State.action_history;
		var target = history.length && history[0].action_id == 'open' ? 1 : 0;
		if (app.State.action_history_index <= target) return;
		await app.GUI.Ps_workspace.goto_history(target);
	}

	// ---------- Type ----------

	paste_lorem_ipsum() {
		var text = app.GUI.GUI_tools.tools_modules.text;
		if (!text || config.TOOL.name != 'text' || !config.layer || config.layer.type != 'text') return;
		var editor = text.object.get_editor(config.layer);
		editor.insert_text_at_current_position('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.');
		this.Base_layers.render();
	}

	text_orientation(vertical) {
		var layer = config.layer;
		if (!layer || layer.type != 'text') return;
		var params = Object.assign({}, layer.params, { text_direction: vertical ? 'ttb' : 'ltr', wrap_direction: vertical ? 'rtl' : 'ttb' });
		app.State.do_action(new app.Actions.Bundle_action('type_orientation', vertical ? 'Vertical Orientation' : 'Horizontal Orientation', [
			new app.Actions.Update_layer_action(layer.id, { params: params }),
		]));
	}
	text_horizontal() { this.text_orientation(false); }
	text_vertical() { this.text_orientation(true); }

	modify_border() { this.modify_selection('border'); }
	modify_expand() { this.modify_selection('expand'); }
	modify_contract() { this.modify_selection('contract'); }
	modify_feather() { this.modify_selection('feather'); }

	reselect() {
		this.selection().reselect();
	}

	// ---------- Filter ----------

	remember_filter(target, parameter) {
		//Actions panel recording
		if (app.GUI.Ps_workspace && app.GUI.Ps_workspace.Actions) app.GUI.Ps_workspace.Actions.record(target, parameter);
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
		if (ws.Documents.current().smart_link) {
			return this.save_smart_contents(ws.Documents.current());
		}
		if (ws.saved_as_psd) {
			save_psd(ws.document_name());
			app.State.ps_saved_index = app.State.action_history_index;
			return;
		}
		this.save_as();
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
