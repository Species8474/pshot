import app from './../app.js';
import config from './../config.js';
import { Base_action } from './base.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

export class Insert_layer_action extends Base_action {
	/**
	 * Creates new layer
	 *
	 * @param {object} settings
	 * @param {boolean} can_automate
	 */
	constructor(settings, can_automate = true) {
		super('insert_layer', 'Insert Layer');
		this.settings = settings;
		this.can_automate = can_automate;
		this.previous_auto_increment = null;
		this.previous_selected_layer = null;
		this.inserted_layer_id = null;
		this.update_layer_action = null;
		this.delete_layer_action = null;
		this.autoresize_canvas_action = null;
	}

	/**
	 * CS6 names: the first layer of a document is "Background", then "Layer 1", "Layer 2"...
	 * shape layers are named after the shape ("Rectangle 1").
	 */
	default_name() {
		if (config.layers.length == 0) {
			//CS6: a transparent new document starts with "Layer 1"
			return config.TRANSPARENCY ? 'Layer 1' : 'Background';
		}
		const shapes = {rectangle: 'Rectangle', ellipse: 'Ellipse', line: 'Line', pentagon: 'Polygon', bezier_curve: 'Shape', text: 'Layer'};
		const prefix = shapes[config.TOOL.name] || 'Layer';
		//next free number for this prefix
		let number = 0;
		const pattern = new RegExp('^' + prefix + ' (\\d+)$');
		for (const existing of config.layers) {
			const match = pattern.exec(existing.name);
			if (match) {
				number = Math.max(number, parseInt(match[1]));
			}
		}
		return prefix + ' ' + (number + 1);
	}

	/**
	 * CS6 "Background Contents: White": the Background layer is a white pixel layer
	 */
	background_settings() {
		const canvas = document.createElement('canvas');
		canvas.width = config.WIDTH;
		canvas.height = config.HEIGHT;
		const ctx = canvas.getContext('2d');
		ctx.fillStyle = config.ps_new_background || '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		return {
			name: 'Background',
			type: 'image',
			x: 0,
			y: 0,
			width: canvas.width,
			height: canvas.height,
			width_original: canvas.width,
			height_original: canvas.height,
			data: canvas.toDataURL('image/png'),
		};
	}

	async do() {
		super.do();

		if (config.layers.length == 0 && config.TRANSPARENCY == false && config.WIDTH
			&& (this.settings == null || Object.keys(this.settings).length == 0)) {
			this.settings = this.background_settings();
		}

		this.previous_auto_increment = app.Layers.auto_increment;
		this.previous_selected_layer = config.layer;
		let autoresize_as = null;

		// Default data
		const layer = {
			id: app.Layers.auto_increment,
			parent_id: 0,
			name: this.default_name(),
			type: null,
			link: null,
			x: 0,
			y: 0,
			width: null,
			width_original: null,
			height: null,
			height_original: null,
			visible: true,
			is_vector: false,
			hide_selection_if_active: false,
			opacity: 100,
			order: app.Layers.auto_increment,
			composition: 'source-over',
			rotate: 0,
			data: null,
			params: {},
			status: null,
			color: config.COLOR,
			filters: [],
			render_function: null,
			ps_parent: null,
			ps_collapsed: false,
		};

		// Build data
		for (let i in this.settings) {
			if (typeof layer[i] == "undefined" && !i.startsWith('_')) {
				alertify.error('Error: wrong key: ' + i);
				continue;
			}
			layer[i] = this.settings[i];
		}

		// pshot: CS6 adds a new layer directly above the active layer, in the same group
		const previous = this.previous_selected_layer;
		if (previous && config.layers.includes(previous) && !('order' in (this.settings || {}))) {
			layer.order = previous.order + 0.5;
			if (!('ps_parent' in (this.settings || {}))) {
				layer.ps_parent = previous.type == 'ps_group' && !previous.ps_collapsed ? previous.id : (previous.ps_parent || null);
				if (previous.type == 'ps_group' && !previous.ps_collapsed) {
					layer.order = previous.order - 0.5;
				}
			}
		}

		// Prepare image
		let image_load_promise;
		if (layer.type == 'image') {
			
			if(layer.name.toLowerCase().indexOf('.svg') == layer.name.length - 4){
				// We have svg
				layer.is_vector = true;
			}

			if (config.layers.length == 1 && (config.layer.width == 0 || config.layer.width === null)
					&& (config.layer.height == 0 || config.layer.height === null) && config.layer.data == null) {
				// Remove first empty layer

				this.delete_layer_action = new app.Actions.Delete_layer_action(config.layer.id, true);
				await this.delete_layer_action.do();
			}

			if (layer.link == null) {
				if (typeof layer.data == 'object') {
					// Load actual image
					if (layer.width == 0 || layer.width === null)
						layer.width = layer.data.width;
					if (layer.height == 0 || layer.height === null)
						layer.height = layer.data.height;
					layer.link = layer.data.cloneNode(true);
					layer.link.onload = function () {
						config.need_render = true;
					};
					layer.data = null;
					autoresize_as = [layer.width, layer.height, null, true, true];
					//need_autoresize = true;
				}
				else if (typeof layer.data == 'string') {
					image_load_promise = new Promise((resolve, reject) => {
						// Try loading as imageData
						layer.link = new Image();
						layer.link.onload = () => {
							// Update dimensions
							if (layer.width == 0 || layer.width === null)
								layer.width = layer.link.width;
							if (layer.height == 0 || layer.height === null)
								layer.height = layer.link.height;
							if (layer.width_original == null)
								layer.width_original = layer.width;
							if (layer.height_original == null)
								layer.height_original = layer.height;
							// Free data
							layer.data = null;
							autoresize_as = [layer.width, layer.height, layer.id, this.can_automate, true];
							config.need_render = true;
							resolve();
						};
						layer.link.onerror = (error) => {
							resolve(error);
							alertify.error('Sorry, image could not be loaded.');
						};
						layer.link.src = layer.data;
						layer.link.crossOrigin = "Anonymous";
					});
				}
				else {
					alertify.error('Error: can not load image.');
				}
			}
		}

		if (this.settings != undefined && config.layers.length > 0
			&& (config.layer.width == 0 || config.layer.width === null) && (config.layer.height == 0 || config.layer.height === null)
			&& config.layer.data == null && layer.type != 'image' && this.can_automate !== false) {
			// Update existing layer, because it's empty
			// pshot: the empty layer keeps its name (CS6: painting on "Layer 1" stays "Layer 1")
			layer.name = config.layer.name;
			this.update_layer_action = new app.Actions.Update_layer_action(config.layer.id, layer);
			await this.update_layer_action.do();
		}
		else {
			// Create new layer
			config.layers.push(layer);
			config.layer = app.Layers.get_layer(layer.id);
			app.Layers.auto_increment++;

			if (config.layer == null) {
				config.layer = config.layers[0];
			}

			this.inserted_layer_id = layer.id;
		}

		if (layer.id >= app.Layers.auto_increment)
			app.Layers.auto_increment = layer.id + 1;

		if (image_load_promise) {
			await image_load_promise;
		}

		if (autoresize_as) {
			this.autoresize_canvas_action = new app.Actions.Autoresize_canvas_action(...autoresize_as);
			try {
				await this.autoresize_canvas_action.do();
			} catch(error) {
				this.autoresize_canvas_action = null;
			}
		}

		app.Layers.render();
		app.GUI.GUI_layers.render_layers();
	}

	async undo() {
		super.undo();
		app.Layers.auto_increment = this.previous_auto_increment;
		if (this.autoresize_canvas_action) {
			await this.autoresize_canvas_action.undo();
			this.autoresize_canvas_action = null;
		}
		if (this.inserted_layer_id) {
			config.layers.pop();
			this.inserted_layer_id = null;
		}
		if (this.update_layer_action) {
			await this.update_layer_action.undo();
			this.update_layer_action.free();
			this.update_layer_action = null;
		}
		if (this.delete_layer_action) {
			await this.delete_layer_action.undo();
			this.delete_layer_action.free();
			this.delete_layer_action = null;
		}
		config.layer = this.previous_selected_layer;
		this.previous_selected_layer = null;

		app.Layers.render();
		app.GUI.GUI_layers.render_layers();
	}

	free() {
		if (this.delete_layer_action) {
			this.delete_layer_action.free();
			this.delete_layer_action = null;
		}
		if (this.update_layer_action) {
			this.update_layer_action.free();
			this.update_layer_action = null;
		}
		this.previous_selected_layer = null;
	}
}