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
import { inpaint } from './../ps/inpaint.js';
import { alert_box } from './../ps/pixel-layer.js';
import Patterns from './../ps/patterns.js';

//Art History Brush styles: stroke length (fraction of Area), direction randomness, curl (radians per stroke)
function hex_to_rgb(hex) {
	return [parseInt(hex.substr(1, 2), 16), parseInt(hex.substr(3, 2), 16), parseInt(hex.substr(5, 2), 16)];
}

const ART_STYLES = {
	'Tight Short': { length: 0.15, loose: 0.3, curl: 0 },
	'Tight Medium': { length: 0.3, loose: 0.3, curl: 0 },
	'Tight Long': { length: 0.6, loose: 0.3, curl: 0 },
	'Loose Medium': { length: 0.3, loose: 1.6, curl: 0.3 },
	'Loose Long': { length: 0.6, loose: 1.6, curl: 0.3 },
	'Dab': { length: 0, loose: 0, curl: 0, dab: true },
	'Tight Curl': { length: 0.25, loose: 0.3, curl: 4 },
	'Tight Curl Long': { length: 0.5, loose: 0.3, curl: 4 },
	'Loose Curl': { length: 0.25, loose: 1.6, curl: 5 },
	'Loose Curl Long': { length: 0.5, loose: 1.6, curl: 5 },
};

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
		var mode = this.getParams().mode;
		if (mode == 'pattern_stamp') {
			//pattern aligned to the document (CS6 "Aligned")
			var pl = config.layer;
			this.history_source = Patterns.tiled(this.getParams().pattern, pl.width_original, pl.height_original, 100, pl.x, pl.y);
		}
		if (mode == 'history' || mode == 'art_history') {
			this.history_source = app.GUI.Ps_workspace.Documents.snapshot_for_layer(config.layer);
			if (!this.history_source) {
				alert_box('Could not use the history brush because the history state does not contain a corresponding layer.');
				return;
			}
		}
		if (mode == 'mixer' && e.altKey) {
			//CS6: Alt+click loads the brush with the color under the pointer
			var lc = document.createElement('canvas');
			lc.width = config.WIDTH;
			lc.height = config.HEIGHT;
			app.Layers.convert_layers_to_canvas(lc.getContext('2d'), null, false);
			var ld = lc.getContext('2d').getImageData(Math.max(0, Math.min(config.WIDTH - 1, Math.round(mouse.x))), Math.max(0, Math.min(config.HEIGHT - 1, Math.round(mouse.y))), 1, 1).data;
			this.reservoir = [ld[0], ld[1], ld[2]];
			this.getParams().load_each = false;
			app.GUI.Ps_workspace.status_message('Mixer Brush loaded with rgb(' + this.reservoir.join(', ') + ')');
			app.GUI.Ps_workspace.Options_bar.render();
			return;
		}
		if (mode == 'clone') {
			var CS = app.GUI.Ps_workspace.Clone_source;
			if (e.altKey) {
				//CS6: Alt+click defines the clone source
				CS.set_source(mouse.x, mouse.y);
				app.GUI.Ps_workspace.status_message('Clone source set');
				return;
			}
			if (!CS.has_source()) {
				alert_box('Could not use the clone stamp because the area to clone has not been defined (Alt-click to define a source point).');
				return;
			}
		}
		if (mode == 'healing') {
			if (e.altKey) {
				//CS6: Alt+click defines the source point
				this.source = this.to_layer(mouse);
				this.offset = null;
				app.GUI.Ps_workspace.status_message('Healing source set');
				return;
			}
			if (!this.source) {
				app.GUI.Ps_workspace.status_message('Alt-click to define a source point for the Healing Brush.');
				return;
			}
		}
		this.started = true;
		this.canvas = document.createElement('canvas');
		this.canvas.width = config.layer.width_original;
		this.canvas.height = config.layer.height_original;
		this.canvas.getContext('2d', { willReadFrequently: true }).drawImage(config.layer.link, 0, 0);
		this.last = this.to_layer(mouse);
		this.original = null;
		if (mode == 'healing') {
			//aligned: the offset is fixed by the first stroke after setting the source
			if (!this.offset) {
				this.offset = { x: this.source.x - this.last.x, y: this.source.y - this.last.y };
			}
			this.original = document.createElement('canvas');
			this.original.width = this.canvas.width;
			this.original.height = this.canvas.height;
			this.original.getContext('2d').drawImage(this.canvas, 0, 0);
			this.heal_dab(this.last);
		}
		if (mode == 'red_eye') {
			this.box_start = this.last;
		}
		if (mode == 'color_replace' || mode == 'bg_erase') {
			var cctx = this.canvas.getContext('2d', { willReadFrequently: true });
			this.original = cctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
			this.replace_target = this.sample_at(this.last);
			this.replace_dab(this.last);
		}
		if (mode == 'history' || mode == 'pattern_stamp') {
			this.original = this.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, this.canvas.width, this.canvas.height);
			this.source_data = this.history_source.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, this.canvas.width, this.canvas.height).data;
			this.history_mask = new Float32Array(this.canvas.width * this.canvas.height);
			this.history_dab(this.last);
		}
		if (mode == 'clone') {
			var cparams = this.getParams();
			var Clone = app.GUI.Ps_workspace.Clone_source;
			Clone.begin_stroke({ x: mouse.x, y: mouse.y }, cparams.aligned !== false);
			this.original = this.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, this.canvas.width, this.canvas.height);
			this.source_data = Clone.sample_canvas(cparams.sample || 'Current Layer').getContext('2d', { willReadFrequently: true }).getImageData(0, 0, config.WIDTH, config.HEIGHT).data;
			this.history_mask = new Float32Array(this.canvas.width * this.canvas.height);
			Clone.painting = true;
			this.clone_dab(this.last);
		}
		if (mode == 'mixer') {
			var mp = this.getParams();
			//Load the brush after each stroke (or when it is empty)
			if (mp.load_each !== false || !this.reservoir) this.reservoir = hex_to_rgb(config.COLOR);
			if (mp.clean_each !== false) this.picked = null;
			this.paint = 1;
			this.mixer_dab(this.last);
		}
		if (mode == 'art_history') {
			var actx = this.canvas.getContext('2d', { willReadFrequently: true });
			this.original = actx.getImageData(0, 0, this.canvas.width, this.canvas.height);
			this.source_data = this.history_source.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, this.canvas.width, this.canvas.height).data;
			this.art_dab(this.last);
		}
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
		else if (mode == 'red_eye') {
			this.box_end = p;
		}
		else if (mode == 'color_replace' || mode == 'bg_erase') {
			if (dist >= step) {
				var cp = this.last;
				for (var tc = step; tc <= dist; tc += step) {
					cp = { x: this.last.x + dx * tc / dist, y: this.last.y + dy * tc / dist };
					if (this.getParams().sampling == 'Continuous') this.replace_target = this.sample_at(cp);
					this.replace_dab(cp);
				}
				this.last = cp;
			}
		}
		else if (mode == 'history' || mode == 'pattern_stamp' || mode == 'clone') {
			if (dist >= step) {
				var hp = this.last;
				for (var tb = step; tb <= dist; tb += step) {
					hp = { x: this.last.x + dx * tb / dist, y: this.last.y + dy * tb / dist };
					if (mode == 'clone') this.clone_dab(hp);
					else this.history_dab(hp);
				}
				this.last = hp;
			}
		}
		else if (mode == 'mixer') {
			var mstep = Math.max(1, size / 6);
			if (dist >= mstep) {
				var mpnt = this.last;
				for (var tm = mstep; tm <= dist; tm += mstep) {
					mpnt = { x: this.last.x + dx * tm / dist, y: this.last.y + dy * tm / dist };
					this.mixer_dab(mpnt);
				}
				this.last = mpnt;
			}
		}
		else if (mode == 'art_history') {
			var astep = Math.max(2, size / 2);
			if (dist >= astep) {
				var ap = this.last;
				for (var ta = astep; ta <= dist; ta += astep) {
					ap = { x: this.last.x + dx * ta / dist, y: this.last.y + dy * ta / dist };
					this.art_dab(ap);
				}
				this.last = ap;
			}
		}
		else if (mode == 'healing') {
			if (dist >= step) {
				var hfrom = this.last;
				for (var th = step; th <= dist; th += step) {
					hfrom = { x: this.last.x + dx * th / dist, y: this.last.y + dy * th / dist };
					this.heal_dab(hfrom);
				}
				this.last = hfrom;
			}
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
		if (mode == 'clone') {
			app.GUI.Ps_workspace.Clone_source.painting = false;
		}
		if (mode == 'spot_healing') {
			this.heal();
		}
		if (mode == 'red_eye') {
			this.red_eye(this.box_start, this.box_end || this.box_start);
			this.box_end = null;
		}
		delete config.layer.link_canvas;
		var extra = [];
		if (mode == 'bg_erase') {
			//CS6: erasing the Background turns it into a normal layer
			var ordered = app.GUI.Ps_workspace.Groups.ordered();
			if (config.layer.name == 'Background' && ordered[ordered.length - 1] === config.layer) {
				extra.push(new app.Actions.Update_layer_action(config.layer.id, { name: 'Layer 0' }));
			}
		}
		var labels = { clone: 'Clone Stamp', bg_erase: 'Background Eraser', pattern_stamp: 'Pattern Stamp', color_replace: 'Color Replacement Tool', history: 'History Brush', art_history: 'Art History Brush', mixer: 'Mixer Brush', smudge: 'Smudge Tool', spot_healing: 'Spot Healing Brush', healing: 'Healing Brush', red_eye: 'Red Eye Tool' };
		app.State.do_action(new app.Actions.Bundle_action('retouch', labels[mode] || 'Retouch', [
			new app.Actions.Update_layer_image_action(app.GUI.Ps_workspace.Selection.restrict(this.canvas, config.layer)),
		].concat(extra)));
		this.canvas = null;
		this.spot = null;
		this.original = null;
		this.source_data = null;
		this.history_mask = null;
	}

	/**
	 * Color Replacement: the sampled color (Continuous / Once / Background Swatch)
	 */
	sample_at(p) {
		var params = this.getParams();
		if (params.sampling == 'Background Swatch') {
			var bg = config.BG_COLOR;
			return [parseInt(bg.substr(1, 2), 16), parseInt(bg.substr(3, 2), 16), parseInt(bg.substr(5, 2), 16)];
		}
		var w = this.canvas.width, x = Math.max(0, Math.min(w - 1, Math.round(p.x))), y = Math.max(0, Math.min(this.canvas.height - 1, Math.round(p.y)));
		var d = this.original.data, i = (y * w + x) * 4;
		return [d[i], d[i + 1], d[i + 2]];
	}

	/**
	 * Color Replacement dab: pixels within Tolerance of the sampled color take the
	 * foreground color's hue/saturation (Color), or only hue / saturation / luminosity
	 */
	replace_dab(p) {
		var params = this.getParams();
		var layer = config.layer;
		var r = Math.max(1, params.size / 2 * (layer.width_original / layer.width));
		var w = this.canvas.width, h = this.canvas.height;
		var x0 = Math.max(0, Math.floor(p.x - r)), y0 = Math.max(0, Math.floor(p.y - r));
		var x1 = Math.min(w, Math.ceil(p.x + r)), y1 = Math.min(h, Math.ceil(p.y + r));
		if (x1 <= x0 || y1 <= y0) return;
		var bw = x1 - x0, bh = y1 - y0;
		var ctx = this.canvas.getContext('2d', { willReadFrequently: true });
		var img = ctx.getImageData(x0, y0, bw, bh);
		var D = img.data, O = this.original.data;
		var t = this.replace_target, tol = (params.tolerance == null ? 30 : params.tolerance) / 100 * 255 * 1.2;
		var fg = config.COLOR;
		var fr = parseInt(fg.substr(1, 2), 16), fgc = parseInt(fg.substr(3, 2), 16), fb = parseInt(fg.substr(5, 2), 16);
		var fh = this.hsl(fr, fgc, fb);
		var mode = params.replace_mode || 'Color';
		var match = new Uint8Array(bw * bh);
		for (var y = y0; y < y1; y++) {
			for (var x = x0; x < x1; x++) {
				if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) > r) continue;
				var i = (y * w + x) * 4;
				if (Math.abs(O[i] - t[0]) + Math.abs(O[i + 1] - t[1]) + Math.abs(O[i + 2] - t[2]) <= tol * 1.5) match[(y - y0) * bw + (x - x0)] = 1;
			}
		}
		if (params.limits != 'Discontiguous') {
			//Contiguous: only matching pixels connected to the brush center
			var keep = new Uint8Array(bw * bh), stack = [];
			var cx = Math.max(0, Math.min(bw - 1, Math.round(p.x) - x0)), cy = Math.max(0, Math.min(bh - 1, Math.round(p.y) - y0));
			if (match[cy * bw + cx]) { stack.push(cy * bw + cx); keep[cy * bw + cx] = 1; }
			while (stack.length) {
				var k = stack.pop(), kx = k % bw, ky = (k / bw) | 0;
				for (var [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
					var nx = kx + ax, ny = ky + ay;
					if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
					var nk = ny * bw + nx;
					if (match[nk] && !keep[nk]) { keep[nk] = 1; stack.push(nk); }
				}
			}
			match = keep;
		}
		var erase = params.mode == 'bg_erase';
		for (var j = 0; j < match.length; j++) {
			if (!match[j]) continue;
			var px = x0 + (j % bw), py = y0 + ((j / bw) | 0), oi = (py * w + px) * 4, di = j * 4;
			if (erase) {
				if (params.protect_fg && Math.abs(O[oi] - fr) + Math.abs(O[oi + 1] - fgc) + Math.abs(O[oi + 2] - fb) <= tol) continue;
				//soft edge of the brush
				var dd = Math.hypot(px + 0.5 - p.x, py + 0.5 - p.y) / r;
				var keep = dd < 0.8 ? 0 : (dd - 0.8) / 0.2;
				D[di + 3] = Math.min(D[di + 3], O[oi + 3] * keep);
				continue;
			}
			var c = this.hsl(O[oi], O[oi + 1], O[oi + 2]);
			var hh = c[0], ss = c[1], ll = c[2];
			if (mode == 'Color') { hh = fh[0]; ss = fh[1]; }
			else if (mode == 'Hue') { hh = fh[0]; }
			else if (mode == 'Saturation') { ss = fh[1]; }
			else if (mode == 'Luminosity') { ll = fh[2]; }
			var rgb = this.rgb(hh, ss, ll);
			D[di] = rgb[0]; D[di + 1] = rgb[1]; D[di + 2] = rgb[2];
		}
		ctx.putImageData(img, x0, y0);
	}

	hsl(r, g, b) {
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

	rgb(h, s, l) {
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

	/**
	 * History Brush dab: paint back the snapshot pixels. Coverage within one stroke
	 * never exceeds Opacity (CS6 behaviour), so overlapping dabs don't build up.
	 */
	history_dab(p) {
		var params = this.getParams();
		var layer = config.layer;
		var r = Math.max(1, params.size / 2 * (layer.width_original / layer.width));
		var opacity = (params.opacity == null ? 100 : params.opacity) / 100;
		var w = this.canvas.width, h = this.canvas.height;
		var x0 = Math.max(0, Math.floor(p.x - r)), y0 = Math.max(0, Math.floor(p.y - r));
		var x1 = Math.min(w, Math.ceil(p.x + r)), y1 = Math.min(h, Math.ceil(p.y + r));
		if (x1 <= x0 || y1 <= y0) return;
		var ctx = this.canvas.getContext('2d', { willReadFrequently: true });
		var img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
		var O = this.original.data, S = this.source_data, M = this.history_mask;
		for (var y = y0; y < y1; y++) {
			for (var x = x0; x < x1; x++) {
				var d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) / r;
				if (d > 1) continue;
				var k = y * w + x;
				var f = opacity * (d < 0.8 ? 1 : (1 - d) / 0.2);
				if (f <= M[k]) continue;
				M[k] = f;
				var i = k * 4, j = ((y - y0) * (x1 - x0) + (x - x0)) * 4;
				for (var c = 0; c < 4; c++) {
					img.data[j + c] = O[i + c] + (S[i + c] - O[i + c]) * f;
				}
			}
		}
		ctx.putImageData(img, x0, y0);
	}

	/**
	 * Clone Stamp dab: pixels from the sampled image at the Clone Source
	 * position (offset, scale and rotation), bilinear when transformed
	 */
	clone_dab(p) {
		var params = this.getParams();
		var layer = config.layer;
		var sx = layer.width_original / layer.width, sy = layer.height_original / layer.height;
		var r = Math.max(1, params.size / 2 * sx);
		var opacity = (params.opacity == null ? 100 : params.opacity) / 100;
		var w = this.canvas.width, h = this.canvas.height, W = config.WIDTH, H = config.HEIGHT;
		var x0 = Math.max(0, Math.floor(p.x - r)), y0 = Math.max(0, Math.floor(p.y - r));
		var x1 = Math.min(w, Math.ceil(p.x + r)), y1 = Math.min(h, Math.ceil(p.y + r));
		if (x1 <= x0 || y1 <= y0) return;
		var Clone = app.GUI.Ps_workspace.Clone_source;
		var smooth = Clone.transformed();
		var ctx = this.canvas.getContext('2d', { willReadFrequently: true });
		var img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
		var O = this.original.data, S = this.source_data, M = this.history_mask;
		var px = [0, 0, 0, 0];
		var fetch = (fx, fy) => {
			if (!smooth) {
				var ix = Math.round(fx - 0.5), iy = Math.round(fy - 0.5);
				if (ix < 0 || iy < 0 || ix >= W || iy >= H) return null;
				var o = (iy * W + ix) * 4;
				px[0] = S[o]; px[1] = S[o + 1]; px[2] = S[o + 2]; px[3] = S[o + 3];
				return px;
			}
			var gx = fx - 0.5, gy = fy - 0.5, ax = Math.floor(gx), ay = Math.floor(gy), tx = gx - ax, ty = gy - ay;
			if (ax < 0 || ay < 0 || ax + 1 >= W || ay + 1 >= H) return null;
			var o00 = (ay * W + ax) * 4, o10 = o00 + 4, o01 = o00 + W * 4, o11 = o01 + 4;
			for (var c = 0; c < 4; c++) {
				px[c] = (S[o00 + c] * (1 - tx) + S[o10 + c] * tx) * (1 - ty) + (S[o01 + c] * (1 - tx) + S[o11 + c] * tx) * ty;
			}
			return px;
		};
		for (var y = y0; y < y1; y++) {
			for (var x = x0; x < x1; x++) {
				var d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) / r;
				if (d > 1) continue;
				var k = y * w + x;
				var f = opacity * (d < 0.8 ? 1 : (1 - d) / 0.2);
				if (f <= M[k]) continue;
				var src = Clone.map({ x: layer.x + (x + 0.5) / sx, y: layer.y + (y + 0.5) / sy });
				var sp = fetch(src.x, src.y);
				if (!sp) continue;
				M[k] = f;
				var i = k * 4, j = ((y - y0) * (x1 - x0) + (x - x0)) * 4;
				//source-over of the sampled pixel at strength f
				var sa = sp[3] / 255 * f, da = O[i + 3] / 255, oa = sa + da * (1 - sa);
				if (oa <= 0) { img.data[j + 3] = 0; continue; }
				for (var c = 0; c < 3; c++) {
					img.data[j + c] = (sp[c] * sa + O[i + c] * da * (1 - sa)) / oa;
				}
				img.data[j + 3] = oa * 255;
			}
		}
		ctx.putImageData(img, x0, y0);
	}

	/**
	 * Art History Brush dab: a few stylized strokes around p within Area, each in
	 * the snapshot's color at its start, running along the edges (perpendicular
	 * to the luminance gradient). Tolerance limits strokes to areas that differ
	 * from the snapshot.
	 */
	art_dab(p) {
		var params = this.getParams();
		var layer = config.layer;
		var s = layer.width_original / layer.width;
		var r = Math.max(0.5, params.size / 2 * s);
		var area = Math.max(1, (params.area == null ? 50 : params.area) * s);
		var opacity = (params.opacity == null ? 100 : params.opacity) / 100;
		var tol = (params.tolerance || 0) / 100 * 255 * 3;
		var spec = ART_STYLES[params.art_style] || ART_STYLES['Tight Short'];
		var w = this.canvas.width, h = this.canvas.height, S = this.source_data, O = this.original.data;
		var lum = (x, y) => {
			x = Math.max(0, Math.min(w - 1, Math.round(x)));
			y = Math.max(0, Math.min(h - 1, Math.round(y)));
			var i = (y * w + x) * 4;
			return S[i] * 0.299 + S[i + 1] * 0.587 + S[i + 2] * 0.114;
		};
		var ctx = this.canvas.getContext('2d', { willReadFrequently: true });
		ctx.save();
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.lineWidth = r * 2;
		ctx.globalAlpha = opacity;
		var count = Math.max(2, Math.min(12, Math.round(area / Math.max(2, r))));
		for (var n = 0; n < count; n++) {
			var a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * area;
			var qx = p.x + Math.cos(a) * d, qy = p.y + Math.sin(a) * d;
			var ix = Math.round(qx), iy = Math.round(qy);
			if (ix < 0 || iy < 0 || ix >= w || iy >= h) continue;
			var i = (iy * w + ix) * 4;
			if (S[i + 3] == 0) continue;
			if (tol > 0 && Math.abs(S[i] - O[i]) + Math.abs(S[i + 1] - O[i + 1]) + Math.abs(S[i + 2] - O[i + 2]) < tol) continue;
			ctx.strokeStyle = 'rgba(' + S[i] + ',' + S[i + 1] + ',' + S[i + 2] + ',' + (S[i + 3] / 255) + ')';
			//along the edge, with some randomness for the loose styles
			var gx = lum(qx + 2, qy) - lum(qx - 2, qy), gy = lum(qx, qy + 2) - lum(qx, qy - 2);
			var dir = (gx || gy) ? Math.atan2(gy, gx) + Math.PI / 2 : Math.random() * Math.PI * 2;
			dir += (Math.random() - 0.5) * spec.loose;
			var len = Math.max(r * 2, area * spec.length) * (0.6 + Math.random() * 0.8);
			ctx.beginPath();
			ctx.moveTo(qx, qy);
			if (spec.dab) {
				ctx.lineTo(qx + 0.01, qy);
			}
			else {
				var cx = qx, cy = qy, steps = 6, turn = spec.curl * (Math.random() < 0.5 ? -1 : 1) / steps;
				for (var k = 1; k <= steps; k++) {
					dir += turn;
					cx += Math.cos(dir) * len / steps;
					cy += Math.sin(dir) * len / steps;
					ctx.lineTo(cx, cy);
				}
			}
			ctx.stroke();
		}
		ctx.restore();
	}

	/**
	 * Mixer Brush dab: the brush's paint (reservoir) mixes with the canvas color
	 * under it (Mix), picks some of it up (Wet) and runs out over the stroke (Load)
	 */
	mixer_dab(p) {
		var params = this.getParams();
		var layer = config.layer;
		var r = Math.max(1, params.size / 2 * (layer.width_original / layer.width));
		var w = this.canvas.width, h = this.canvas.height;
		var x0 = Math.max(0, Math.floor(p.x - r)), y0 = Math.max(0, Math.floor(p.y - r));
		var x1 = Math.min(w, Math.ceil(p.x + r)), y1 = Math.min(h, Math.ceil(p.y + r));
		if (x1 <= x0 || y1 <= y0) return;
		var ctx = this.canvas.getContext('2d', { willReadFrequently: true });
		var img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0), d = img.data;
		//canvas color under the brush
		var cr = 0, cg = 0, cb = 0, ca = 0;
		for (var i = 0; i < d.length; i += 4) { var a = d[i + 3]; cr += d[i] * a; cg += d[i + 1] * a; cb += d[i + 2] * a; ca += a; }
		var wet = (params.wet == null ? 50 : params.wet) / 100, mix = (params.mix == null ? 50 : params.mix) / 100;
		var load = Math.max(1, params.load == null ? 50 : params.load), flow = (params.flow == null ? 100 : params.flow) / 100;
		var res = this.reservoir || [0, 0, 0];
		var color = res.slice();
		if (ca > 0 && wet > 0) {
			var under = [cr / ca, cg / ca, cb / ca];
			color = res.map((v, k) => v + (under[k] - v) * mix * wet);
			//the brush picks up some of the canvas paint
			this.reservoir = res.map((v, k) => v + (under[k] - v) * wet * 0.08);
		}
		//paint runs out: Load is how many dabs' worth the brush holds
		var amount = this.paint * flow;
		this.paint = Math.max(0, this.paint - 1 / (load * 3));
		if (wet == 0 && this.paint <= 0) return;
		amount = Math.max(wet > 0 ? 0.15 * flow : 0, amount);
		for (var y = y0; y < y1; y++) {
			for (var x = x0; x < x1; x++) {
				var dd = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) / r;
				if (dd > 1) continue;
				var f = amount * (dd < 0.7 ? 1 : (1 - dd) / 0.3);
				var j = ((y - y0) * (x1 - x0) + (x - x0)) * 4;
				for (var c = 0; c < 3; c++) d[j + c] = d[j + c] + (color[c] - d[j + c]) * f;
				d[j + 3] = d[j + 3] + (255 - d[j + 3]) * f;
			}
		}
		ctx.putImageData(img, x0, y0);
		app.GUI.Ps_workspace.Options_bar.update_readouts && this.update_swatch();
	}

	update_swatch() {
		var sw = document.getElementById('ps_mixer_load');
		if (sw && this.reservoir) sw.style.background = 'rgb(' + this.reservoir.map(Math.round).join(',') + ')';
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

	/**
	 * Healing Brush dab: copy texture from the source, shifted to the destination's color
	 */
	heal_dab(p) {
		var layer = config.layer;
		var r = Math.max(1, this.getParams().size / 2 * (layer.width_original / layer.width));
		var size = Math.ceil(r * 2);
		var tx = Math.round(p.x - r), ty = Math.round(p.y - r);
		var sx = Math.round(p.x + this.offset.x - r), sy = Math.round(p.y + this.offset.y - r);
		var octx = this.original.getContext('2d', { willReadFrequently: true });
		var src = octx.getImageData(sx, sy, size, size).data;
		var under = octx.getImageData(tx, ty, size, size).data;
		var ctx = this.canvas.getContext('2d', { willReadFrequently: true });
		var dst = ctx.getImageData(tx, ty, size, size);
		//mean color of the source and destination rings (texture from source, tone from destination)
		var ms = [0, 0, 0], md = [0, 0, 0], n = 0;
		for (var y = 0; y < size; y++) {
			for (var x = 0; x < size; x++) {
				var d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
				if (d < 0.8 || d > 1) continue;
				var i = (y * size + x) * 4;
				for (var c = 0; c < 3; c++) { ms[c] += src[i + c]; md[c] += under[i + c]; }
				n++;
			}
		}
		if (n) for (var c2 = 0; c2 < 3; c2++) { ms[c2] /= n; md[c2] /= n; }
		for (var y2 = 0; y2 < size; y2++) {
			for (var x2 = 0; x2 < size; x2++) {
				var d2 = Math.hypot(x2 + 0.5 - r, y2 + 0.5 - r) / r;
				if (d2 > 1) continue;
				var f = d2 < 0.6 ? 1 : 1 - (d2 - 0.6) / 0.4;
				var k = (y2 * size + x2) * 4;
				for (var c3 = 0; c3 < 3; c3++) {
					var healed = src[k + c3] - ms[c3] + md[c3];
					dst.data[k + c3] = dst.data[k + c3] + (healed - dst.data[k + c3]) * f;
				}
			}
		}
		ctx.putImageData(dst, tx, ty);
	}

	/**
	 * Red Eye: remove red from pupils inside the clicked/dragged area
	 */
	red_eye(a, b) {
		var layer = config.layer;
		var r = Math.max(4, this.getParams().size / 2 * (layer.width_original / layer.width));
		var x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
		if (x1 - x0 < 4 && y1 - y0 < 4) {
			x0 -= r; y0 -= r; x1 += r; y1 += r;
		}
		x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
		x1 = Math.min(this.canvas.width, Math.ceil(x1)); y1 = Math.min(this.canvas.height, Math.ceil(y1));
		if (x1 <= x0 || y1 <= y0) return;
		var ctx = this.canvas.getContext('2d', { willReadFrequently: true });
		var img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
		var d = img.data;
		var darken = (this.getParams().strength == null ? 50 : this.getParams().strength) / 100;
		for (var i = 0; i < d.length; i += 4) {
			var rr = d[i], g = d[i + 1], bb = d[i + 2];
			if (rr > 60 && rr > g * 1.5 && rr > bb * 1.5) {
				var v = (g + bb) / 2 * (1 - darken * 0.6);
				d[i] = v;
				d[i + 1] = Math.min(g, v + 4);
				d[i + 2] = Math.min(bb, v + 4);
			}
		}
		ctx.putImageData(img, x0, y0);
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
		var ctx = this.canvas.getContext('2d', { willReadFrequently: true });
		//start from the untouched layer pixels (the preview tint is discarded)
		ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		ctx.drawImage(config.layer.link, 0, 0);
		inpaint(this.canvas, this.spot);
	}
}

export default Retouch_class;
