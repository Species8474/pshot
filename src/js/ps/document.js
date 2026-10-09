/*
 * pshot - opening and saving documents, including Photoshop PSD (via ag-psd).
 *
 * CS6 opens every file in a new document tab. pshot has a single document,
 * so File > Open replaces it (asking first when there is unsaved work) and
 * File > Place adds the file as a layer.
 */

import app from './../app.js';
import config from './../config.js';
import { readPsd, writePsd } from 'ag-psd';
import filesaver from './../../../node_modules/file-saver/dist/FileSaver.min.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

const TO_PSD_BLEND = {
	'source-over': 'normal', 'multiply': 'multiply', 'screen': 'screen', 'overlay': 'overlay',
	'darken': 'darken', 'lighten': 'lighten', 'color-dodge': 'color dodge', 'color-burn': 'color burn',
	'hard-light': 'hard light', 'soft-light': 'soft light', 'difference': 'difference', 'exclusion': 'exclusion',
	'hue': 'hue', 'saturation': 'saturation', 'color': 'color', 'luminosity': 'luminosity', 'lighter': 'linear dodge',
};
const FROM_PSD_BLEND = {};
for (const key in TO_PSD_BLEND) {
	FROM_PSD_BLEND[TO_PSD_BLEND[key]] = key;
}

function read_file(file, as) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = reject;
		if (as == 'buffer') reader.readAsArrayBuffer(file);
		else if (as == 'text') reader.readAsText(file);
		else reader.readAsDataURL(file);
	});
}

function load_image(src) {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = reject;
		image.src = src;
	});
}

function is_psd(file) {
	return /\.(psd|pdd|psb)$/i.test(file.name);
}

/**
 * file -> { width, height, layers: [layer settings bottom-first] }
 */
async function file_to_layers(file) {
	if (is_psd(file)) {
		const buffer = await read_file(file, 'buffer');
		const psd = readPsd(buffer, { skipThumbnail: true });
		const layers = [];
		const walk = (children, hidden_parent) => {
			for (const child of children || []) {
				if (child.children) {
					walk(child.children, hidden_parent || child.hidden);
					continue;
				}
				if (!child.canvas || child.canvas.width == 0 || child.canvas.height == 0) {
					continue;
				}
				layers.push({
					name: child.name || 'Layer',
					type: 'image',
					x: child.left || 0,
					y: child.top || 0,
					width: child.canvas.width,
					height: child.canvas.height,
					width_original: child.canvas.width,
					height_original: child.canvas.height,
					opacity: Math.round((child.opacity === undefined ? 1 : child.opacity) * 100),
					visible: !(child.hidden || hidden_parent),
					composition: child.clipping ? 'source-atop' : (FROM_PSD_BLEND[child.blendMode] || 'source-over'),
					data: child.canvas.toDataURL('image/png'),
				});
			}
		};
		walk(psd.children, false);
		if (layers.length == 0 && psd.canvas) {
			//flat PSD: use the composite image
			layers.push({
				name: 'Background', type: 'image', x: 0, y: 0,
				width: psd.width, height: psd.height, width_original: psd.width, height_original: psd.height,
				data: psd.canvas.toDataURL('image/png'),
			});
		}
		return { width: psd.width, height: psd.height, layers };
	}
	const data = await read_file(file, 'dataurl');
	const image = await load_image(data);
	return {
		width: image.width,
		height: image.height,
		layers: [{
			name: 'Background', type: 'image', x: 0, y: 0,
			width: image.width, height: image.height,
			width_original: image.width, height_original: image.height,
			data: data,
		}],
	};
}

function base_name(file) {
	return file.name.replace(/\.[^.]+$/, '');
}

function pick_files(accept, multiple) {
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = accept;
		input.multiple = !!multiple;
		input.addEventListener('change', () => resolve(Array.from(input.files || [])));
		input.click();
	});
}

const ACCEPT = 'image/*,.psd,.pdd,.json';

function has_unsaved_work() {
	return app.State.action_history.length > 0;
}

/**
 * File > Open: replaces the current document
 */
async function open_document(files) {
	if (!files) {
		files = await pick_files(ACCEPT, false);
	}
	const file = files[0];
	if (!file) {
		return;
	}
	if (has_unsaved_work() && !window.confirm('Discard the changes to ' + app.GUI.Ps_workspace.document_name() + '?\n\n(pshot has one document at a time; opening a file replaces it.)')) {
		return;
	}
	if (/\.json$/i.test(file.name)) {
		app.GUI.modules['file/open'].load_json(await read_file(file, 'text'));
		app.GUI.Ps_workspace.set_document_name(base_name(file));
		return;
	}
	let doc;
	try {
		doc = await file_to_layers(file);
	} catch (error) {
		alertify.error('Could not complete your request because ' + file.name + ' is not a supported file or is damaged.');
		console.error(error);
		return;
	}
	const actions = [
		new app.Actions.Prepare_canvas_action('undo'),
		new app.Actions.Update_config_action({ WIDTH: doc.width, HEIGHT: doc.height }),
		new app.Actions.Reset_layers_action(),
	];
	for (const settings of doc.layers) {
		actions.push(new app.Actions.Insert_layer_action(settings, false));
	}
	actions.push(new app.Actions.Prepare_canvas_action('do'));
	await app.State.do_action(new app.Actions.Bundle_action('open', 'Open', actions));
	app.GUI.modules['ps/commands'].purge_histories();
	app.GUI.Ps_workspace.set_document_name(base_name(file), file.name);
	app.GUI.GUI_preview.zoom_auto(true);
	app.GUI.GUI_layers.render_layers();
	config.need_render = true;
}

/**
 * File > Place: adds the file as a new layer, centered
 */
async function place(files) {
	if (!files) {
		files = await pick_files(ACCEPT, false);
	}
	const file = files[0];
	if (!file) {
		return;
	}
	let doc;
	try {
		doc = await file_to_layers(file);
	} catch (error) {
		alertify.error('Could not place ' + file.name + '.');
		return;
	}
	const actions = [];
	const dx = Math.round((config.WIDTH - doc.width) / 2);
	const dy = Math.round((config.HEIGHT - doc.height) / 2);
	for (const settings of doc.layers) {
		settings.name = doc.layers.length == 1 ? base_name(file) : settings.name;
		settings.x += dx;
		settings.y += dy;
		actions.push(new app.Actions.Insert_layer_action(settings, false));
	}
	app.State.do_action(new app.Actions.Bundle_action('place', 'Place', actions));
}

/**
 * builds the PSD structure from the current layers
 */
function build_psd() {
	const layers = app.Layers.get_sorted_layers().slice().reverse(); //bottom first
	const children = [];
	for (const layer of layers) {
		if (layer.type == null) {
			continue;
		}
		let canvas, left, top;
		if (layer.type == 'image' && layer.link && !layer.rotate && (!layer.filters || layer.filters.length == 0)) {
			canvas = document.createElement('canvas');
			canvas.width = Math.max(1, Math.round(layer.width));
			canvas.height = Math.max(1, Math.round(layer.height));
			canvas.getContext('2d').drawImage(layer.link, 0, 0, canvas.width, canvas.height);
			left = Math.round(layer.x);
			top = Math.round(layer.y);
		}
		else {
			//vector, text and filtered layers are rasterized at document size
			const visible = layer.visible;
			const opacity = layer.opacity;
			layer.visible = true;
			layer.opacity = 100;
			canvas = app.Layers.convert_layer_to_canvas(layer.id, false, false);
			layer.visible = visible;
			layer.opacity = opacity;
			left = 0;
			top = 0;
		}
		children.push({
			name: layer.name,
			left: left,
			top: top,
			canvas: canvas,
			opacity: (layer.opacity == null ? 100 : layer.opacity) / 100,
			hidden: layer.visible == false,
			blendMode: TO_PSD_BLEND[layer.composition] || 'normal',
			clipping: layer.composition == 'source-atop',
		});
	}
	const composite = document.createElement('canvas');
	composite.width = config.WIDTH;
	composite.height = config.HEIGHT;
	app.Layers.convert_layers_to_canvas(composite.getContext('2d'), null, false);
	return { width: config.WIDTH, height: config.HEIGHT, children: children, canvas: composite };
}

function save_psd(file_name) {
	try {
		const buffer = writePsd(build_psd(), { generateThumbnail: true });
		const blob = new Blob([buffer], { type: 'application/octet-stream' });
		const name = /\.psd$/i.test(file_name) ? file_name : file_name + '.psd';
		filesaver.saveAs(blob, name);
		app.GUI.Ps_workspace.status_message('Saved ' + name);
	} catch (error) {
		alertify.error('Could not save as PSD: ' + error.message);
		console.error(error);
	}
}

export { open_document, place, save_psd, is_psd, file_to_layers };
