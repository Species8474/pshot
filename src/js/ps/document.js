/*
 * pshot - opening and saving documents, including Photoshop PSD (via ag-psd).
 *
 * File > Open opens the file in a new document tab, File > Place adds it to
 * the current document as a layer (CS6).
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

/**
 * PSD grayscale mask -> pshot alpha mask (document sized)
 */
function psd_mask_to_alpha(mask, width, height) {
	var out = document.createElement('canvas');
	out.width = width;
	out.height = height;
	var ctx = out.getContext('2d');
	var base = mask.defaultColor || 0;
	ctx.fillStyle = 'rgb(' + base + ',' + base + ',' + base + ')';
	ctx.fillRect(0, 0, width, height);
	if (mask.canvas) {
		ctx.clearRect(mask.left || 0, mask.top || 0, mask.canvas.width, mask.canvas.height);
		ctx.drawImage(mask.canvas, mask.left || 0, mask.top || 0);
	}
	var img = ctx.getImageData(0, 0, width, height);
	var d = img.data;
	for (var i = 0; i < d.length; i += 4) {
		d[i + 3] = d[i];
		d[i] = d[i + 1] = d[i + 2] = 255;
	}
	ctx.putImageData(img, 0, 0);
	return out;
}

/**
 * pshot alpha mask -> PSD grayscale mask covering the document
 */
function alpha_to_psd_mask(layer) {
	var gray = document.createElement('canvas');
	gray.width = config.WIDTH;
	gray.height = config.HEIGHT;
	var ctx = gray.getContext('2d');
	ctx.fillStyle = '#000';
	ctx.fillRect(0, 0, gray.width, gray.height);
	ctx.drawImage(layer.ps_mask, layer.x - layer.ps_mask_x, layer.y - layer.ps_mask_y);
	return {
		left: 0, top: 0, right: gray.width, bottom: gray.height,
		canvas: gray, defaultColor: 0, disabled: !!layer.ps_mask_disabled,
	};
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
		let group_key = 0;
		const walk = (children, parent_key) => {
			for (const child of children || []) {
				if (child.children) {
					//group: members first (bottom-up), then the group header above them
					const key = ++group_key;
					walk(child.children, key);
					layers.push({
						name: child.name || 'Group',
						type: 'ps_group',
						visible: !child.hidden,
						opacity: Math.round((child.opacity === undefined ? 1 : child.opacity) * 100),
						ps_collapsed: child.opened === false,
						_group_key: key,
						_parent_key: parent_key,
					});
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
					visible: !child.hidden,
					composition: child.clipping ? 'source-atop' : (FROM_PSD_BLEND[child.blendMode] || 'source-over'),
					data: child.canvas.toDataURL('image/png'),
					_ps_mask: child.mask && (child.mask.canvas || child.mask.defaultColor !== undefined) ? child.mask : null,
					_parent_key: parent_key,
				});
			}
		};
		walk(psd.children, null);
		if (layers.length == 0 && psd.canvas) {
			//flat PSD: use the composite image
			layers.push({
				name: 'Background', type: 'image', x: 0, y: 0,
				width: psd.width, height: psd.height, width_original: psd.width, height_original: psd.height,
				data: psd.canvas.toDataURL('image/png'),
			});
		}
		//layer masks: attach after the layers exist (Insert_layer_action ignores unknown keys starting with _)
		for (const settings of layers) {
			if (settings._ps_mask) {
				settings._ps_mask_canvas = psd_mask_to_alpha(settings._ps_mask, psd.width, psd.height);
			}
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

/**
 * File > Open: opens the file in a new document tab
 */
async function open_document(files) {
	if (!files) {
		files = await pick_files(ACCEPT, false);
	}
	const file = files[0];
	if (!file) {
		return;
	}
	if (/\.json$/i.test(file.name)) {
		const text = await read_file(file, 'text');
		app.GUI.Ps_workspace.Documents.add(base_name(file), file.name);
		await app.GUI.modules['file/open'].load_json(text);
		app.GUI.modules['ps/commands'].purge_histories();
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
	//CS6: every opened file gets its own document tab
	app.GUI.Ps_workspace.Documents.add(base_name(file), file.name);
	const actions = [
		new app.Actions.Prepare_canvas_action('undo'),
		new app.Actions.Update_config_action({ WIDTH: doc.width, HEIGHT: doc.height }),
		new app.Actions.Reset_layers_action(),
	];
	doc.layers.forEach((settings, i) => {
		settings.order = i + 1;
		settings.ps_parent = null;
		actions.push(new app.Actions.Insert_layer_action(settings, false));
	});
	actions.push(new app.Actions.Prepare_canvas_action('do'));
	await app.State.do_action(new app.Actions.Bundle_action('open', 'Open', actions));
	//groups: connect members to their group headers
	const by_key = {};
	for (const settings of doc.layers) {
		if (settings._group_key) {
			by_key[settings._group_key] = config.layers.find(l => l.order == settings.order);
		}
	}
	for (const settings of doc.layers) {
		if (settings._parent_key && by_key[settings._parent_key]) {
			const layer = config.layers.find(l => l.order == settings.order);
			if (layer) {
				layer.ps_parent = by_key[settings._parent_key].id;
			}
		}
	}
	for (const settings of doc.layers) {
		if (settings._ps_mask_canvas) {
			const layer = config.layers.find(l => l.order == settings.order);
			if (layer) {
				layer.ps_mask = settings._ps_mask_canvas;
				layer.ps_mask_x = layer.x;
				layer.ps_mask_y = layer.y;
				layer.ps_mask_disabled = !!settings._ps_mask.disabled;
			}
		}
	}
	app.GUI.modules['ps/commands'].purge_histories();
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
	//placing flattens the file's groups
	doc.layers = doc.layers.filter(l => l.type != 'ps_group');
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
function psd_node(layer) {
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
		const saved = { visible: layer.visible, opacity: layer.opacity, ps_mask_disabled: layer.ps_mask_disabled };
		layer.visible = true;
		layer.opacity = 100;
		layer.ps_mask_disabled = true;
		layer._ps_ignore_groups = true;
		canvas = app.Layers.convert_layer_to_canvas(layer.id, false, false);
		Object.assign(layer, saved);
		layer._ps_ignore_groups = false;
		left = 0;
		top = 0;
	}
	return {
		name: layer.name,
		left: left,
		top: top,
		canvas: canvas,
		opacity: (layer.opacity == null ? 100 : layer.opacity) / 100,
		hidden: layer.visible == false,
		blendMode: TO_PSD_BLEND[layer.composition] || 'normal',
		clipping: layer.composition == 'source-atop',
		mask: layer.ps_mask ? alpha_to_psd_mask(layer) : undefined,
	};
}

/**
 * builds the PSD structure from the current layers (groups become PSD groups)
 */
function build_psd() {
	const build = (parent_id) => {
		const members = config.layers
			.filter(l => (l.ps_parent || null) === parent_id)
			.sort((a, b) => a.order - b.order); //bottom first
		const nodes = [];
		for (const layer of members) {
			if (layer.type == 'ps_group') {
				nodes.push({
					name: layer.name,
					opened: !layer.ps_collapsed,
					hidden: layer.visible == false,
					opacity: (layer.opacity == null ? 100 : layer.opacity) / 100,
					children: build(layer.id),
				});
			}
			else if (layer.type != null) {
				nodes.push(psd_node(layer));
			}
		}
		return nodes;
	};
	const composite = document.createElement('canvas');
	composite.width = config.WIDTH;
	composite.height = config.HEIGHT;
	app.Layers.convert_layers_to_canvas(composite.getContext('2d'), null, false);
	return { width: config.WIDTH, height: config.HEIGHT, children: build(null), canvas: composite };
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
