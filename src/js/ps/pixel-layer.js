/*
 * pshot - in CS6 every new layer is a pixel layer. miniPaint's new layers are
 * empty (type null) and its pixel tools refuse them, so an empty layer is
 * turned into a transparent document-sized image layer the moment a pixel
 * tool touches it.
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';

const PIXEL_TOOLS = ['fill', 'erase', 'magic_erase', 'blur', 'sharpen', 'desaturate', 'clone', 'selection', 'pick_color'];
// tools that need a pixel layer but handle an empty layer themselves
const PAINT_TOOLS = ['brush', 'pencil', 'gradient', 'fill', 'erase', 'magic_erase', 'blur', 'sharpen', 'desaturate', 'clone'];
const KIND = { text: 'type', rectangle: 'shape', ellipse: 'shape', line: 'shape', pentagon: 'shape', bezier_curve: 'shape' };

function make_pixel_layer(layer) {
	var canvas = document.createElement('canvas');
	canvas.width = config.WIDTH;
	canvas.height = config.HEIGHT;
	var image = new Image();
	image.src = canvas.toDataURL('image/png');
	layer.type = 'image';
	layer.link = image;
	layer.x = 0;
	layer.y = 0;
	layer.width = canvas.width;
	layer.height = canvas.height;
	layer.width_original = canvas.width;
	layer.height_original = canvas.height;
	layer.render_function = null;
	layer.is_vector = false;
}

function ensure_pixel_layer() {
	if (config.layer && config.layer.type == null) {
		make_pixel_layer(config.layer);
		return true;
	}
	return false;
}

/**
 * CS6: "This type layer must be rasterized before proceeding. Its text will no longer be editable."
 */
function ask_rasterize(kind) {
	var POP = new Dialog_class();
	var message = kind == 'type'
		? 'This type layer must be rasterized before proceeding. Its text will no longer be editable. Rasterize the type?'
		: 'This ' + kind + ' layer must be rasterized before proceeding. It will no longer be a vector ' + kind + '. Rasterize the ' + kind + '?';
	POP.show({
		title: 'Adobe Photoshop',
		params: [{ html: '<p class="ps_alert_text">' + message + '</p>' }],
		on_finish: function () {
			app.GUI.modules['layer/raster'].raster();
		},
	});
}

function install_pixel_layer_guard() {
	//when the mousedown is blocked, the rest of that gesture must not reach the tool either
	var blocked = false;
	var swallow = function (event) {
		if (blocked) {
			event.stopPropagation();
			if (event.type == 'mouseup') {
				blocked = false;
			}
		}
	};
	document.addEventListener('mousemove', swallow, true);
	document.addEventListener('mouseup', swallow, true);

	document.addEventListener('mousedown', function (event) {
		if (event.target.id != 'canvas_minipaint' && event.target.id != 'main_wrapper') {
			return;
		}
		var tool = config.TOOL.name;
		if (PAINT_TOOLS.includes(tool) && config.layer && KIND[config.layer.type]) {
			event.stopPropagation();
			event.preventDefault();
			blocked = true;
			ask_rasterize(KIND[config.layer.type]);
			return;
		}
		if (PIXEL_TOOLS.includes(tool)) {
			ensure_pixel_layer();
		}
	}, true);
}

export { ensure_pixel_layer, install_pixel_layer_guard };
