/*
 * pshot - CS6 retouching brushes on pixel layers:
 *   mode 'smudge'       Smudge Tool: drags color along the stroke (Strength)
 *   mode 'spot_healing' Spot Healing Brush: fills the brushed spot from its
 *                       surroundings (diffusion inpainting), blending the edge
 */

import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';

class Retouch_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.ctx = ctx;
		this.name = 'retouch';
		this.canvas = null;
		this.started = false;
		this.last = null;
		this.spot = null;
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

	to_layer(point) {
		var layer = config.layer;
		var sx = layer.width_original / layer.width, sy = layer.height_original / layer.height;
		return { x: (point.x - layer.x) * sx, y: (point.y - layer.y) * sy, s: sx };
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
		this.last = this.to_layer(mouse);
		if (this.getParams().mode == 'spot_healing') {
			//the stroke marks the area to heal
			this.spot = new Uint8Array(this.canvas.width * this.canvas.height);
			this.mark(this.last);
		}
		config.layer.link_canvas = this.canvas;
		config.need_render = true;
	}

	mousemove(e) {
		var mouse = this.get_mouse_info(e);
		if (!this.started || mouse.is_drag == false || mouse.click_valid == false) {
			return;
		}
		var p = this.to_layer(mouse);
		var size = this.getParams().size * p.s;
		var dx = p.x - this.last.x, dy = p.y - this.last.y;
		var dist = Math.hypot(dx, dy);
		var step = Math.max(1, size / 8);
		var mode = this.getParams().mode;
		if (mode == 'spot_healing') {
			//mark every point along the stroke, including short moves
			for (var t = step; t < dist; t += step) {
				this.mark({ x: this.last.x + dx * t / dist, y: this.last.y + dy * t / dist });
			}
			this.mark(p);
			this.last = p;
		}
		else if (dist >= step) {
			var from = this.last;
			for (var t2 = step; t2 <= dist; t2 += step) {
				var q = { x: this.last.x + dx * t2 / dist, y: this.last.y + dy * t2 / dist };
				this.smudge(from, q);
				from = q;
			}
			this.last = from;
		}
		config.need_render = true;
	}

	mouseup(e) {
		if (!this.started) {
			return;
		}
		this.started = false;
		var mode = this.getParams().mode;
		if (mode == 'spot_healing') {
			this.heal();
		}
		delete config.layer.link_canvas;
		app.State.do_action(new app.Actions.Bundle_action('retouch', mode == 'smudge' ? 'Smudge Tool' : 'Spot Healing Brush', [
			new app.Actions.Update_layer_image_action(app.GUI.Ps_workspace.Selection.restrict(this.canvas, config.layer)),
		]));
		this.canvas = null;
		this.spot = null;
	}

	/**
	 * Smudge: blend the patch under `from` into `to`
	 */
	smudge(from, to) {
		var params = this.getParams();
		var layer = config.layer;
		var r = Math.max(1, params.size / 2 * (layer.width_original / layer.width));
		var strength = (params.strength == null ? 50 : params.strength) / 100;
		var ctx = this.canvas.getContext('2d', { willReadFrequently: true });
		var size = Math.ceil(r * 2);
		var sx = Math.round(from.x - r), sy = Math.round(from.y - r);
		var tx = Math.round(to.x - r), ty = Math.round(to.y - r);
		var src = ctx.getImageData(sx, sy, size, size);
		var dst = ctx.getImageData(tx, ty, size, size);
		for (var y = 0; y < size; y++) {
			for (var x = 0; x < size; x++) {
				var d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
				if (d > 1) continue;
				var f = strength * (1 - d * d);
				var i = (y * size + x) * 4;
				for (var c = 0; c < 4; c++) {
					dst.data[i + c] = dst.data[i + c] + (src.data[i + c] - dst.data[i + c]) * f;
				}
			}
		}
		ctx.putImageData(dst, tx, ty);
	}

	mark(p) {
		var layer = config.layer;
		var r = Math.max(1, this.getParams().size / 2 * (layer.width_original / layer.width));
		var w = this.canvas.width, h = this.canvas.height;
		for (var y = Math.max(0, Math.floor(p.y - r)); y < Math.min(h, Math.ceil(p.y + r)); y++) {
			for (var x = Math.max(0, Math.floor(p.x - r)); x < Math.min(w, Math.ceil(p.x + r)); x++) {
				if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) <= r) {
					this.spot[y * w + x] = 1;
				}
			}
		}
		//show the marked area while dragging (CS6 shows a dark stroke)
		var ctx = this.canvas.getContext('2d');
		ctx.fillStyle = 'rgba(0,0,0,0.25)';
		ctx.beginPath();
		ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
		ctx.fill();
	}

	/**
	 * diffusion inpainting of the marked pixels from their unmarked neighbours
	 */
	heal() {
		var w = this.canvas.width, h = this.canvas.height;
		var ctx = this.canvas.getContext('2d', { willReadFrequently: true });
		//start from the untouched layer pixels (the preview tint is discarded)
		ctx.clearRect(0, 0, w, h);
		ctx.drawImage(config.layer.link, 0, 0);
		var minx = w, miny = h, maxx = -1, maxy = -1;
		for (var i = 0; i < this.spot.length; i++) {
			if (this.spot[i]) {
				var x = i % w, y = (i / w) | 0;
				if (x < minx) minx = x; if (x > maxx) maxx = x;
				if (y < miny) miny = y; if (y > maxy) maxy = y;
			}
		}
		if (maxx < 0) return;
		var pad = 3;
		var x0 = Math.max(0, minx - pad), y0 = Math.max(0, miny - pad);
		var x1 = Math.min(w - 1, maxx + pad), y1 = Math.min(h - 1, maxy + pad);
		var bw = x1 - x0 + 1, bh = y1 - y0 + 1;
		var img = ctx.getImageData(x0, y0, bw, bh);
		var d = img.data;
		var hole = new Uint8Array(bw * bh);
		var px = new Float32Array(bw * bh * 4);
		for (var yy = 0; yy < bh; yy++) {
			for (var xx = 0; xx < bw; xx++) {
				var k = yy * bw + xx;
				hole[k] = this.spot[(y0 + yy) * w + (x0 + xx)];
				for (var c = 0; c < 4; c++) px[k * 4 + c] = d[k * 4 + c];
			}
		}
		//initialise the hole with the average of its border, then relax
		var sum = [0, 0, 0, 0], n = 0;
		for (var k2 = 0; k2 < hole.length; k2++) {
			if (!hole[k2]) continue;
			var kx = k2 % bw, ky = (k2 / bw) | 0;
			for (var [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				var nx = kx + ax, ny = ky + ay;
				if (nx >= 0 && ny >= 0 && nx < bw && ny < bh && !hole[ny * bw + nx]) {
					var m = (ny * bw + nx) * 4;
					sum[0] += px[m]; sum[1] += px[m + 1]; sum[2] += px[m + 2]; sum[3] += px[m + 3]; n++;
				}
			}
		}
		if (n) for (var k3 = 0; k3 < hole.length; k3++) if (hole[k3]) for (var c3 = 0; c3 < 4; c3++) px[k3 * 4 + c3] = sum[c3] / n;
		var iterations = Math.min(400, Math.max(60, Math.max(bw, bh) * 2));
		for (var it = 0; it < iterations; it++) {
			for (var y2 = 0; y2 < bh; y2++) {
				for (var x2 = 0; x2 < bw; x2++) {
					var k4 = y2 * bw + x2;
					if (!hole[k4]) continue;
					for (var c4 = 0; c4 < 4; c4++) {
						var acc = 0, cnt = 0;
						if (x2 > 0) { acc += px[(k4 - 1) * 4 + c4]; cnt++; }
						if (x2 < bw - 1) { acc += px[(k4 + 1) * 4 + c4]; cnt++; }
						if (y2 > 0) { acc += px[(k4 - bw) * 4 + c4]; cnt++; }
						if (y2 < bh - 1) { acc += px[(k4 + bw) * 4 + c4]; cnt++; }
						px[k4 * 4 + c4] = acc / cnt;
					}
				}
			}
		}
		//a little grain so the patch doesn't look airbrushed
		for (var k5 = 0; k5 < hole.length; k5++) {
			if (!hole[k5]) continue;
			var noise = (Math.random() - 0.5) * 4;
			for (var c5 = 0; c5 < 3; c5++) d[k5 * 4 + c5] = px[k5 * 4 + c5] + noise;
			d[k5 * 4 + 3] = px[k5 * 4 + 3];
		}
		ctx.putImageData(img, x0, y0);
	}
}

export default Retouch_class;
