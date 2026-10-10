/*
 * pshot - CS6 Dodge (lighten), Burn (darken) and Sponge (saturation) tools.
 * Dodge / Burn: Range (Shadows / Midtones / Highlights), Exposure, Protect
 * Tones (lightness changed with hue and saturation kept). Sponge: Desaturate
 * / Saturate, Flow, Vibrance (less change on already saturated colors).
 */

function hsl(r, g, b) {
	r /= 255; g /= 255; b /= 255;
	var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, h = 0, s = 0;
	if (max != min) {
		var d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		if (max == r) h = (g - b) / d + (g < b ? 6 : 0);
		else if (max == g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		h /= 6;
	}
	return [h, s, l];
}

function rgb(h, s, l) {
	if (s == 0) return [l * 255, l * 255, l * 255];
	var f = (p, q, t) => {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1 / 6) return p + (q - p) * 6 * t;
		if (t < 1 / 2) return q;
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
		return p;
	};
	var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
	return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
}

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
		this.rec = [[mouse.x, mouse.y]];
		this.dab(mouse);
		config.layer.link_canvas = this.canvas;
		config.need_render = true;
		//Airbrush: the tool keeps working while the pointer rests
		clearInterval(this.buildup);
		if (this.getParams().airbrush) {
			this.moved = false;
			this.buildup = setInterval(() => {
				if (!this.started || !this.canvas) { clearInterval(this.buildup); return; }
				if (this.moved) { this.moved = false; return; }
				this.dab(this.last);
				config.need_render = true;
			}, 80);
		}
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
		if (this.rec) this.rec.push([mouse.x, mouse.y]);
		this.moved = true;
		config.need_render = true;
	}

	mouseup(e) {
		if (!this.started) {
			return;
		}
		this.started = false;
		clearInterval(this.buildup);
		if (this.rec) app.GUI.Ps_workspace.Actions.record_stroke(this.name, this.rec);
		this.rec = null;
		delete config.layer.link_canvas;
		var label = { burn: 'Burn Tool', sponge: 'Sponge Tool' }[this.getParams().mode] || 'Dodge Tool';
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
		var burn = params.mode == 'burn', sponge = params.mode == 'sponge';
		var range = params.range || 'Midtones';
		var protect = params.protect_tones !== false;
		var flow = (params.flow == null ? 50 : params.flow) / 100 * 0.2;
		var saturate = params.sponge_mode == 'Saturate', vibrance = params.vibrance !== false;
		for (var y = y0; y < y1; y++) {
			for (var x = x0; x < x1; x++) {
				var dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
				if (dist > 1) continue;
				var falloff = 1 - dist * dist;
				var i = ((y - y0) * w + (x - x0)) * 4;
				if (sponge) {
					var hs = hsl(d[i], d[i + 1], d[i + 2]);
					var sf = flow * falloff * (vibrance ? (saturate ? 1 - hs[1] : 0.5 + 0.5 * hs[1]) : 1);
					hs[1] = saturate ? hs[1] + (1 - hs[1]) * sf : hs[1] * (1 - sf);
					var sc = rgb(hs[0], hs[1], hs[2]);
					d[i] = sc[0]; d[i + 1] = sc[1]; d[i + 2] = sc[2];
					continue;
				}
				var lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
				var weight = range == 'Shadows' ? 1 - lum : (range == 'Highlights' ? lum : 1 - Math.abs(2 * lum - 1));
				var f = strength * falloff * (0.25 + 0.75 * weight);
				if (protect) {
					//Protect Tones: the lightness changes, hue and saturation stay (no clipping color shifts)
					var t = hsl(d[i], d[i + 1], d[i + 2]);
					t[2] = burn ? t[2] * (1 - f) : t[2] + (1 - t[2]) * f;
					var pc = rgb(t[0], t[1], t[2]);
					d[i] = pc[0]; d[i + 1] = pc[1]; d[i + 2] = pc[2];
					continue;
				}
				//without Protect Tones the channels clip: dodge is a gain, burn pushes away
				//from white, so colors saturate and shift
				for (var c = 0; c < 3; c++) {
					d[i + c] = burn ? d[i + c] - (255 - d[i + c]) * f : d[i + c] * (1 + 2 * f);
				}
			}
		}
		ctx.putImageData(img, x0, y0);
	}
}

export default Dodge_burn_class;
