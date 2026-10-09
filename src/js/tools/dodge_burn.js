/*
 * pshot - CS6 Dodge (lighten) and Burn (darken) tools.
 * Options: Range (Shadows / Midtones / Highlights) and Exposure.
 */

import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';

class Dodge_burn_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.ctx = ctx;
		this.name = 'dodge_burn';
		this.canvas = null;
		this.started = false;
		this.last = null;
	}

	load() {
		this.default_events();
	}

	default_dragMove(event) {
		if (config.TOOL.name != this.name)
			return;
		this.mousemove(event);
		var mouse = this.get_mouse_info(event);
		this.show_mouse_cursor(mouse.x, mouse.y, this.getParams().size, 'circle');
	}

	mousedown(e) {
		this.started = false;
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false || config.layer.type != 'image' || !config.layer.link) {
			return;
		}
		this.started = true;
		this.canvas = document.createElement('canvas');
		this.canvas.width = config.layer.width_original;
		this.canvas.height = config.layer.height_original;
		this.canvas.getContext('2d', { willReadFrequently: true }).drawImage(config.layer.link, 0, 0);
		this.last = null;
		this.dab(mouse);
		config.layer.link_canvas = this.canvas;
		config.need_render = true;
	}

	mousemove(e) {
		var mouse = this.get_mouse_info(e);
		if (!this.started || mouse.is_drag == false || mouse.click_valid == false) {
			return;
		}
		//dabs along the stroke
		var size = this.getParams().size;
		if (this.last) {
			var dx = mouse.x - this.last.x, dy = mouse.y - this.last.y;
			var dist = Math.hypot(dx, dy);
			var step = Math.max(1, size / 4);
			for (var t = step; t < dist; t += step) {
				this.dab({ x: this.last.x + dx * t / dist, y: this.last.y + dy * t / dist });
			}
		}
		this.dab(mouse);
		config.need_render = true;
	}

	mouseup(e) {
		if (!this.started) {
			return;
		}
		this.started = false;
		delete config.layer.link_canvas;
		var label = this.getParams().mode == 'burn' ? 'Burn Tool' : 'Dodge Tool';
		app.State.do_action(new app.Actions.Bundle_action('dodge_burn', label, [
			new app.Actions.Update_layer_image_action(app.GUI.Ps_workspace.Selection.restrict(this.canvas, config.layer)),
		]));
		this.canvas = null;
	}

	dab(point) {
		this.last = { x: point.x, y: point.y };
		var params = this.getParams();
		var layer = config.layer;
		var sx = layer.width_original / layer.width, sy = layer.height_original / layer.height;
		var cx = (point.x - layer.x) * sx, cy = (point.y - layer.y) * sy;
		var r = Math.max(1, params.size / 2 * sx);
		var x0 = Math.max(0, Math.floor(cx - r)), y0 = Math.max(0, Math.floor(cy - r));
		var x1 = Math.min(this.canvas.width, Math.ceil(cx + r)), y1 = Math.min(this.canvas.height, Math.ceil(cy + r));
		if (x1 <= x0 || y1 <= y0) return;
		var ctx = this.canvas.getContext('2d', { willReadFrequently: true });
		var img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
		var d = img.data;
		var w = x1 - x0;
		var strength = (params.exposure == null ? 50 : params.exposure) / 100 * 0.15;
		var burn = params.mode == 'burn';
		var range = params.range || 'Midtones';
		for (var y = y0; y < y1; y++) {
			for (var x = x0; x < x1; x++) {
				var dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
				if (dist > 1) continue;
				var falloff = 1 - dist * dist;
				var i = ((y - y0) * w + (x - x0)) * 4;
				var lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
				var weight = range == 'Shadows' ? 1 - lum : (range == 'Highlights' ? lum : 1 - Math.abs(2 * lum - 1));
				var f = strength * falloff * (0.25 + 0.75 * weight);
				for (var c = 0; c < 3; c++) {
					d[i + c] = burn ? d[i + c] * (1 - f) : d[i + c] + (255 - d[i + c]) * f;
				}
			}
		}
		ctx.putImageData(img, x0, y0);
	}
}

export default Dodge_burn_class;
