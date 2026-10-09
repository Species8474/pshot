/*
 * pshot - multiple open documents (CS6 document tabs).
 *
 * miniPaint keeps one document in global state (config.layers, config.WIDTH,
 * the undo history, the view). Each tab stores that state while it is in the
 * background; switching tabs swaps it in and out.
 */

import app from './../app.js';
import config from './../config.js';
import zoomView from './../libs/zoomView.js';

class Ps_documents_class {

	constructor() {
		this.docs = [];
		this.active = 0;
		this.untitled_counter = 0;
	}

	/**
	 * registers the document miniPaint created at startup
	 */
	init() {
		this.docs = [this.make_entry(null)];
		this.active = 0;
	}

	make_entry(name, file_name) {
		var untitled = null;
		if (!name) {
			this.untitled_counter++;
			untitled = this.untitled_counter;
		}
		return {
			name: name || 'Untitled-' + untitled,
			saved_as_psd: !!(file_name && /\.psd$/i.test(file_name)),
			state: null,
			snapshot: null,
		};
	}

	current() {
		return this.docs[this.active];
	}

	/**
	 * CS6 keeps a snapshot of the document as opened; it is the History Brush source.
	 * Called before every action: the first edit after New/Open captures it.
	 */
	before_action(action) {
		var doc = this.current();
		if (!doc || doc.snapshot) {
			return;
		}
		if (app.State.action_history_index == 0 && /^(open|new_file)/.test(action.action_id)) {
			return;
		}
		var layers = {};
		for (var layer of config.layers) {
			if (layer.type == 'image' && layer.link) {
				var canvas = document.createElement('canvas');
				canvas.width = layer.width_original;
				canvas.height = layer.height_original;
				canvas.getContext('2d').drawImage(layer.link, 0, 0);
				layers[layer.id] = { canvas: canvas, x: layer.x, y: layer.y, width: layer.width, height: layer.height };
			}
		}
		doc.snapshot = { layers: layers };
	}

	/**
	 * the snapshot pixels of a layer, in that layer's current pixel space; null if the
	 * snapshot has no such layer
	 */
	snapshot_for_layer(layer) {
		var doc = this.current();
		var snap = doc && doc.snapshot ? doc.snapshot.layers[layer.id] : null;
		if (doc && !doc.snapshot) {
			//no edits yet: the snapshot is the current state
			snap = layer.type == 'image' && layer.link ? { canvas: layer.link, x: layer.x, y: layer.y, width: layer.width, height: layer.height } : null;
		}
		if (!snap) {
			return null;
		}
		var canvas = document.createElement('canvas');
		canvas.width = layer.width_original;
		canvas.height = layer.height_original;
		var sx = layer.width_original / layer.width, sy = layer.height_original / layer.height;
		var ctx = canvas.getContext('2d', { willReadFrequently: true });
		ctx.setTransform(sx, 0, 0, sy, -layer.x * sx, -layer.y * sy);
		ctx.drawImage(snap.canvas, snap.x, snap.y, snap.width, snap.height);
		return canvas;
	}

	selection_tool() {
		return app.GUI.GUI_tools.tools_modules.selection.object;
	}

	/**
	 * global miniPaint state -> object
	 */
	capture() {
		var commands = app.GUI.modules['ps/commands'];
		var pos = zoomView.getPosition();
		return {
			layers: config.layers,
			layer: config.layer,
			WIDTH: config.WIDTH,
			HEIGHT: config.HEIGHT,
			ZOOM: config.ZOOM,
			guides: config.guides,
			TRANSPARENCY: config.TRANSPARENCY,
			auto_increment: app.Layers.auto_increment,
			stable_dimensions: app.Layers.stable_dimensions,
			history: app.State.action_history,
			history_index: app.State.action_history_index,
			selection: this.selection_tool().selection,
			ps_selection: app.GUI.Ps_workspace.Selection.state(),
			undo_toggle_index: commands.undo_toggle_index,
			last_selection: commands.last_selection,
			view: { scale: zoomView.getScale(), x: pos.x, y: pos.y },
		};
	}

	/**
	 * object -> global miniPaint state
	 */
	apply(state) {
		var commands = app.GUI.modules['ps/commands'];
		config.layers = state.layers;
		config.layer = state.layer;
		config.WIDTH = state.WIDTH;
		config.HEIGHT = state.HEIGHT;
		config.ZOOM = state.ZOOM;
		config.guides = state.guides;
		config.TRANSPARENCY = state.TRANSPARENCY;
		app.Layers.auto_increment = state.auto_increment;
		app.Layers.stable_dimensions = state.stable_dimensions;
		app.State.action_history = state.history;
		app.State.action_history_index = state.history_index;
		this.selection_tool().selection = state.selection;
		app.GUI.Ps_workspace.Selection.restore(state.ps_selection);
		commands.undo_toggle_index = state.undo_toggle_index;
		commands.last_selection = state.last_selection;

		//resize the canvas first: zoomView constrains the view to the canvas size
		app.GUI.prepare_canvas();
		zoomView.setBounds(0, 0, config.WIDTH, config.HEIGHT);
		zoomView.setView(state.view.scale, state.view.x, state.view.y);
		app.Layers.last_zoom = config.ZOOM;
		app.GUI.GUI_preview.zoom();
		app.GUI.GUI_layers.render_layers();
		config.need_render = true;
	}

	/**
	 * an empty state for a document that is about to be built (New / Open)
	 */
	blank_state() {
		return {
			layers: [],
			layer: null,
			WIDTH: config.WIDTH,
			HEIGHT: config.HEIGHT,
			ZOOM: 1,
			guides: [],
			auto_increment: 1,
			stable_dimensions: [config.WIDTH, config.HEIGHT],
			history: [],
			history_index: 0,
			selection: { x: null, y: null, width: null, height: null },
			undo_toggle_index: null,
			last_selection: null,
			view: { scale: 1, x: 0, y: 0 },
		};
	}

	/**
	 * stores the current document and switches to a new, empty one.
	 * The caller then builds its content (File > New, File > Open).
	 */
	add(name, file_name) {
		this.current().state = this.capture();
		var entry = this.make_entry(name, file_name);
		this.docs.push(entry);
		this.active = this.docs.length - 1;
		var blank = this.blank_state();
		config.layers = blank.layers;
		config.layer = blank.layer;
		config.guides = blank.guides;
		app.Layers.auto_increment = 1;
		app.State.action_history = blank.history;
		app.State.action_history_index = 0;
		this.selection_tool().selection = blank.selection;
		app.GUI.Ps_workspace.Selection.restore(null);
		app.GUI.modules['ps/commands'].undo_toggle_index = null;
		app.GUI.modules['ps/commands'].last_selection = null;
		this.changed();
		return entry;
	}

	switch_to(index) {
		if (index == this.active || !this.docs[index]) {
			return;
		}
		this.end_text_editing();
		if (app.GUI.Ps_workspace.Transform.active()) {
			app.GUI.Ps_workspace.Transform.commit();
		}
		this.current().state = this.capture();
		this.active = index;
		this.apply(this.docs[index].state);
		this.docs[index].state = null;
		this.changed();
	}

	/**
	 * closes the active document; the last one is replaced by a new Untitled document
	 */
	async close(index) {
		if (index === undefined) {
			index = this.active;
		}
		if (index != this.active) {
			this.switch_to(index);
		}
		var doc = this.current();
		var dirty = app.State.action_history.length > 0;
		if (dirty && !window.confirm('Close "' + doc.name + '" without saving?')) {
			return;
		}
		this.end_text_editing();
		this.free_history(app.State.action_history);
		if (this.docs.length == 1) {
			this.docs = [];
			this.add_initial_replacement();
			return;
		}
		this.docs.splice(this.active, 1);
		this.active = Math.min(this.active, this.docs.length - 1);
		this.apply(this.docs[this.active].state);
		this.docs[this.active].state = null;
		this.changed();
	}

	add_initial_replacement() {
		var entry = this.make_entry(null);
		this.docs = [entry];
		this.active = 0;
		app.State.action_history = [];
		app.State.action_history_index = 0;
		app.State.do_action(new app.Actions.Reset_layers_action(true)).then(() => {
			app.State.action_history = [];
			app.State.action_history_index = 0;
			app.GUI.GUI_layers.render_layers();
			this.changed();
		});
	}

	free_history(history) {
		for (var action of history) {
			try {
				action.free();
			} catch (e) {
				//ignore
			}
		}
	}

	end_text_editing() {
		var text = app.GUI.GUI_tools.tools_modules.text;
		if (text && text.object.textarea && document.activeElement === text.object.textarea) {
			text.object.textarea.blur();
		}
	}

	rename_current(name, file_name) {
		var doc = this.current();
		doc.name = name;
		doc.saved_as_psd = !!(file_name && /\.psd$/i.test(file_name));
		this.changed();
	}

	changed() {
		var ws = app.GUI.Ps_workspace;
		if (ws) {
			ws.last_tab_label = null;
			ws.render_document_tab();
			ws.render_history();
		}
	}
}

export default Ps_documents_class;
