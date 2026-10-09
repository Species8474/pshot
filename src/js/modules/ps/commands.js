/*
 * pshot - Photoshop CS6 commands that miniPaint has no module for.
 * Menu targets look like 'ps/commands.<function>'.
 */

import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import Dialog_class from './../../libs/popup.js';
import { ensure_pixel_layer } from './../../ps/pixel-layer.js';
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
	}

	noop() {
	}

	get_selection_tool() {
		return app.GUI.GUI_tools.tools_modules.selection.object;
	}

	get_selection() {
		var selection = this.get_selection_tool().selection;
		if (selection == null || selection.width == null || selection.width == 0 || selection.height == 0) {
			return null;
		}
		return selection;
	}

	require_image_layer() {
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
	 * selection rectangle converted to the active layer's own pixel space
	 */
	selection_in_layer(selection) {
		var layer = config.layer;
		var rx = layer.width_original / layer.width;
		var ry = layer.height_original / layer.height;
		return {
			x: (selection.x - layer.x) * rx,
			y: (selection.y - layer.y) * ry,
			width: selection.width * rx,
			height: selection.height * ry,
		};
	}

	// ---------- Edit ----------

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
		if (this.get_selection() == null) {
			alertify.error('Could not complete the Cut command because the selected area is empty.');
			return;
		}
		await app.GUI.modules['edit/copy'].copy_to_clipboard();
		this.clear();
	}

	clear() {
		var selection = this.get_selection();
		if (selection == null) {
			return;
		}
		if (!this.require_image_layer()) {
			return;
		}
		var canvas = this.layer_canvas();
		var area = this.selection_in_layer(selection);
		canvas.getContext('2d').clearRect(area.x, area.y, area.width, area.height);
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
		if (!this.require_image_layer()) {
			return;
		}
		var canvas = this.layer_canvas();
		var ctx = canvas.getContext('2d');
		ctx.globalAlpha = alpha;
		ctx.fillStyle = color;
		var selection = this.get_selection();
		if (selection) {
			var area = this.selection_in_layer(selection);
			ctx.fillRect(area.x, area.y, area.width, area.height);
		}
		else {
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		}
		app.State.do_action(
			new app.Actions.Bundle_action('fill', description, [
				new app.Actions.Update_layer_image_action(canvas)
			])
		);
	}

	free_transform() {
		app.GUI.GUI_tools.activate_tool('select');
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
			new app.Actions.Reset_selection_action(this.get_selection_tool().selection),
		];
		for (var layer of config.layers) {
			if (layer.x != null && layer.y != null) {
				actions.push(new app.Actions.Update_layer_action(layer.id, {
					x: layer.x - Math.round(s.x),
					y: layer.y - Math.round(s.y),
				}));
			}
		}
		actions.push(new app.Actions.Update_config_action({WIDTH: Math.round(s.width), HEIGHT: Math.round(s.height)}));
		actions.push(new app.Actions.Prepare_canvas_action('do'));
		app.State.do_action(new app.Actions.Bundle_action('crop', 'Crop', actions));
	}

	// ---------- Layer ----------

	layer_via_copy() {
		var selection = this.get_selection();
		if (selection == null) {
			app.GUI.modules['layer/duplicate'].duplicate();
			return;
		}
		if (!this.require_image_layer()) {
			return;
		}
		var area = this.selection_in_layer(selection);
		var canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(area.width));
		canvas.height = Math.max(1, Math.round(area.height));
		canvas.getContext('2d').drawImage(config.layer.link, -area.x, -area.y);
		var params = {
			x: Math.round(selection.x),
			y: Math.round(selection.y),
			width: Math.round(selection.width),
			height: Math.round(selection.height),
			width_original: canvas.width,
			height_original: canvas.height,
			type: 'image',
			data: canvas.toDataURL('image/png'),
		};
		app.State.do_action(
			new app.Actions.Bundle_action('layer_via_copy', 'Layer Via Copy', [
				new app.Actions.Insert_layer_action(params, false),
				new app.Actions.Reset_selection_action(this.get_selection_tool().selection),
			])
		);
	}

	async layer_via_cut() {
		var selection = this.get_selection();
		if (selection == null) {
			alertify.error('Could not complete the Layer Via Cut command because the selected area is empty.');
			return;
		}
		if (!this.require_image_layer()) {
			return;
		}
		//copy first (layer_via_copy reads the pixels), then clear them on the source layer
		var source = config.layer;
		var source_canvas = this.layer_canvas();
		var area = this.selection_in_layer(selection);
		source_canvas.getContext('2d').clearRect(area.x, area.y, area.width, area.height);
		this.layer_via_copy();
		app.State.do_action(
			new app.Actions.Bundle_action('layer_via_cut', 'Layer Via Cut', [
				new app.Actions.Update_layer_image_action(source_canvas, source.id)
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

	merge_visible() {
		var hidden = config.layers.filter(l => l.visible == false);
		if (hidden.length == 0) {
			app.GUI.modules['layer/flatten'].flatten();
			return;
		}
		alertify.error('Merge Visible with hidden layers is not supported yet. Delete or show the hidden layers first.');
	}

	// ---------- Select ----------

	deselect() {
		var selection = this.get_selection();
		if (selection == null) {
			return;
		}
		this.last_selection = JSON.parse(JSON.stringify(selection));
		app.State.do_action(
			new app.Actions.Reset_selection_action(this.get_selection_tool().selection)
		);
	}

	reselect() {
		if (this.last_selection == null) {
			return;
		}
		var s = this.last_selection;
		var tool = this.get_selection_tool();
		var actions = [];
		if (config.TOOL.name != 'selection') {
			actions.push(new app.Actions.Activate_tool_action('selection'));
		}
		actions.push(new app.Actions.Set_selection_action(s.x, s.y, s.width, s.height, tool.selection));
		app.State.do_action(new app.Actions.Bundle_action('reselect', 'Reselect', actions));
	}

	// ---------- Filter ----------

	remember_filter(target) {
		if (target.indexOf('effects/') === 0) {
			this.last_filter_target = target;
		}
	}

	last_filter() {
		if (this.last_filter_target == null) {
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
		config.guides = [];
		config.need_render = true;
	}

	screen_mode_standard() { app.GUI.Ps_workspace.set_screen_mode('standard'); }
	screen_mode_menu() { app.GUI.Ps_workspace.set_screen_mode('menu'); }
	screen_mode_full() { app.GUI.Ps_workspace.set_screen_mode('full'); }

	toggle_panel(name) { app.GUI.Ps_workspace.toggle_panel(name); }
	toggle_options_bar() { app.GUI.Ps_workspace.toggle_area('options'); }
	toggle_toolbox() { app.GUI.Ps_workspace.toggle_area('toolbox'); }
	reset_workspace() { app.GUI.Ps_workspace.reset_workspace(); }

	// ---------- File ----------

	place() {
		app.GUI.modules['file/open'].open_file();
	}

	close_document() {
		var _this = this;
		window.State.do_action(new app.Actions.Reset_layers_action(true)).then(function () {
			_this.purge_histories();
			app.GUI.Ps_workspace.document_number++;
			app.GUI.Ps_workspace.render_document_tab();
		});
	}

}

export default Ps_commands_class;
