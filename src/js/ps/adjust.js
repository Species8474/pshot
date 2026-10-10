/*
 * pshot - CS6 adjustment dialogs: Levels, Curves, Hue/Saturation,
 * Brightness/Contrast. They edit the active pixel layer (inside the selection
 * when there is one), preview live and commit one History state.
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';
import { ensure_pixel_layer } from './pixel-layer.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import { quantize } from './indexed.js';
import { PRESETS, lut as gradient_lut, css as gradient_css, picker as gradient_picker, editor as gradient_editor, resolve, two_color } from './gradients.js';

function clamp(v, lo, hi) {
	return v < lo ? lo : (v > hi ? hi : v);
}

/**
 * monotone cubic interpolation through sorted points -> 256 entry LUT
 */
function curve_lut(points) {
	var pts = points.slice().sort((a, b) => a.x - b.x);
	var n = pts.length;
	var lut = new Uint8ClampedArray(256);
	if (n == 1) {
		lut.fill(pts[0].y);
		return lut;
	}
	var dx = [], dy = [], m = [];
	for (var i = 0; i < n - 1; i++) {
		dx.push(pts[i + 1].x - pts[i].x || 1e-6);
		dy.push(pts[i + 1].y - pts[i].y);
		m.push(dy[i] / dx[i]);
	}
	var t = [m[0]];
	for (var j = 1; j < n - 1; j++) {
		t.push(m[j - 1] * m[j] <= 0 ? 0 : (m[j - 1] + m[j]) / 2);
	}
	t.push(m[n - 2]);
	for (var k = 0; k < n - 1; k++) {
		if (m[k] == 0) {
			t[k] = t[k + 1] = 0;
		}
		else {
			var a = t[k] / m[k], b = t[k + 1] / m[k], h = a * a + b * b;
			if (h > 9) {
				var s = 3 / Math.sqrt(h);
				t[k] = s * a * m[k];
				t[k + 1] = s * b * m[k];
			}
		}
	}
	for (var x = 0; x < 256; x++) {
		if (x <= pts[0].x) { lut[x] = pts[0].y; continue; }
		if (x >= pts[n - 1].x) { lut[x] = pts[n - 1].y; continue; }
		var seg = 0;
		while (x > pts[seg + 1].x) seg++;
		var hh = dx[seg], tt = (x - pts[seg].x) / hh;
		var t2 = tt * tt, t3 = t2 * tt;
		lut[x] = (2 * t3 - 3 * t2 + 1) * pts[seg].y + (t3 - 2 * t2 + tt) * hh * t[seg]
			+ (-2 * t3 + 3 * t2) * pts[seg + 1].y + (t3 - t2) * hh * t[seg + 1];
	}
	return lut;
}

function rgb_to_hsl(r, g, b) {
	r /= 255; g /= 255; b /= 255;
	var max = Math.max(r, g, b), min = Math.min(r, g, b);
	var h = 0, s = 0, l = (max + min) / 2;
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

function hue2rgb(p, q, t) {
	if (t < 0) t += 1;
	if (t > 1) t -= 1;
	if (t < 1 / 6) return p + (q - p) * 6 * t;
	if (t < 1 / 2) return q;
	if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
	return p;
}

function hsl_to_rgb(h, s, l) {
	if (s == 0) {
		return [l * 255, l * 255, l * 255];
	}
	var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	var p = 2 * l - q;
	return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255];
}

/**
 * .CUBE text -> { n, data: [r, g, b, ...] (red fastest) }
 */
function parse_cube(text) {
	var n = 0, data = [], dmin = [0, 0, 0], dmax = [1, 1, 1];
	for (var line of text.split(/\r?\n/)) {
		line = line.trim();
		if (!line || line[0] == '#') continue;
		var parts = line.split(/\s+/);
		if (parts[0] == 'LUT_3D_SIZE') n = parseInt(parts[1]);
		else if (parts[0] == 'DOMAIN_MIN') dmin = parts.slice(1, 4).map(parseFloat);
		else if (parts[0] == 'DOMAIN_MAX') dmax = parts.slice(1, 4).map(parseFloat);
		else if (/^[-\d.]/.test(parts[0]) && parts.length >= 3) {
			for (var c = 0; c < 3; c++) data.push(Math.round((parseFloat(parts[c]) - dmin[c]) / ((dmax[c] - dmin[c]) || 1) * 10000) / 10000);
		}
	}
	if (n < 2 || data.length != n * n * n * 3) return null;
	return { n: n, data: data };
}

//procedural looks named after the CS6 3DLUT presets (r, g, b in 0..1)
function lum_of(r, g, b) { return r * 0.299 + g * 0.587 + b * 0.114; }
function mix(a, b, t) { return a + (b - a) * t; }
function sat_of(c, s) { var l = lum_of(c[0], c[1], c[2]); return c.map(v => mix(l, v, s)); }
function con_of(c, k) { return c.map(v => 0.5 + (v - 0.5) * k); }
const LOOKS = {
	'2Strip.look': (r, g, b) => { var cy = (g + b) / 2; return [r, cy, cy]; },
	'3Strip.look': (r, g, b) => con_of(sat_of([r, g, b], 1.5), 1.1),
	'Bleach Bypass.look': (r, g, b) => { var l = lum_of(r, g, b); return con_of([r, g, b].map(v => mix(v, l, 0.55)), 1.35); },
	'Candlelight.CUBE': (r, g, b) => [r * 1.08 + 0.04, g * 0.94 + 0.01, b * 0.7],
	'Crisp_Warm.look': (r, g, b) => con_of([r * 1.05, g, b * 0.92], 1.15),
	'Crisp_Winter.look': (r, g, b) => con_of([r * 0.93, g * 0.99, b * 1.07], 1.15),
	'Drop Blues.3DL': (r, g, b) => { var l = lum_of(r, g, b); return [r, g, mix(b, l, 0.6)]; },
	'EdgyAmber.3DL': (r, g, b) => { var c = con_of(sat_of([r, g, b], 0.5), 1.25); return [c[0] * 1.12, c[1] * 0.92, c[2] * 0.6]; },
	'FallColors.look': (r, g, b) => [r * 1.05 + g * 0.1, g * 0.9, b * 0.85],
	'FoggyNight.3DL': (r, g, b) => { var c = sat_of([r, g, b], 0.7); return [0.18 + c[0] * 0.65, 0.2 + c[1] * 0.68, 0.26 + c[2] * 0.7]; },
	'HorrorBlue.3DL': (r, g, b) => { var c = con_of(sat_of([r, g, b], 0.3), 1.2); return [c[0] * 0.8, c[1] * 0.95, c[2] * 1.15]; },
	'LateSunset.3DL': (r, g, b) => [r * 1.15 + 0.02, g * 0.9, b * 0.95 + 0.03],
	'Moonlight.3DL': (r, g, b) => { var c = sat_of([r, g, b], 0.4); return [c[0] * 0.6, c[1] * 0.7, c[2] * 0.9 + 0.04]; },
	'NightFromDay.CUBE': (r, g, b) => { var c = sat_of([r, g, b], 0.5); return [c[0] * 0.3, c[1] * 0.4, c[2] * 0.6 + 0.03]; },
	'Soft_Warming.look': (r, g, b) => [r * 1.04 + 0.02, g * 1.01 + 0.01, b * 0.92],
	'TealOrangePlusContrast.3DL': (r, g, b) => {
		var l = lum_of(r, g, b), t = [mix(0, 1, l), mix(0.5, 0.6, l), mix(0.55, 0.25, l)];
		return con_of([mix(r, t[0], 0.35), mix(g, t[1], 0.35), mix(b, t[2], 0.35)], 1.2);
	},
	'TensionGreen.3DL': (r, g, b) => { var c = con_of(sat_of([r, g, b], 0.7), 1.15); return [c[0] * 0.9, c[1] * 1.08, c[2] * 0.95]; },
};

//CS6 Hue/Saturation Edit ranges: falloff start a, range b..c, falloff end d (degrees)
const HS_EDIT = [['master', 'Master'], ['reds', 'Reds'], ['yellows', 'Yellows'], ['greens', 'Greens'], ['cyans', 'Cyans'], ['blues', 'Blues'], ['magentas', 'Magentas']];
const HS_RANGES = { reds: [315, 345, 15, 45], yellows: [15, 45, 75, 105], greens: [75, 105, 135, 165], cyans: [135, 165, 195, 225], blues: [195, 225, 255, 285], magentas: [255, 285, 315, 345] };
//CS6 presets (approximations of the shipped values)
const HS_PRESETS = {
	'Cyanotype': { colorize: true, h: 210, s: 30, l: 0 },
	'Further Increase Saturation': { s: 30 },
	'Increase Saturation': { s: 15 },
	'Old Style': { s: -50, l: 5, ranges: { yellows: { s: 25 } } },
	'Red Boost': { ranges: { reds: { s: 30 } } },
	'Sepia': { colorize: true, h: 35, s: 25, l: 0 },
	'Strong Saturation': { s: 50 },
	'Yellow Boost': { ranges: { yellows: { s: 30 } } },
};

function deg(v) {
	return Math.round(v) + '°';
}

/**
 * old states had only the master values; add the six ranges
 */
function hs_normalize(state) {
	state.h = state.h || 0;
	state.s = state.s || 0;
	state.l = state.l || 0;
	state.colorize = !!state.colorize;
	state.edit = state.edit || 'master';
	state.ranges = state.ranges || {};
	for (var k in HS_RANGES) {
		var d = HS_RANGES[k], r = state.ranges[k] || {};
		state.ranges[k] = { h: r.h || 0, s: r.s || 0, l: r.l || 0, a: r.a == null ? d[0] : r.a, b: r.b == null ? d[1] : r.b, c: r.c == null ? d[2] : r.c, d: r.d == null ? d[3] : r.d };
	}
	return state;
}

/**
 * how much a hue (degrees) is inside a range: 1 inside b..c, ramps over a..b and c..d
 */
function hs_weight(h, r) {
	var span = (from, to) => (to - from + 360) % 360;
	var pos = span(r.a, h), ab = span(r.a, r.b), ac = span(r.a, r.c), ad = span(r.a, r.d) || 360;
	if (pos > ad) return 0;
	if (pos < ab) return ab ? pos / ab : 1;
	if (pos <= ac) return 1;
	return ad > ac ? 1 - (pos - ac) / (ad - ac) : 0;
}

/**
 * the bars show the range centered (as CS6 does)
 */
function hs_view_start(r) {
	var mid = (r.b + ((r.c - r.b + 360) % 360) / 2) % 360;
	return (mid - 180 + 360) % 360;
}

/**
 * the two hue bars (before / after) and the range markers
 */
function hs_draw_bars(canvas, state) {
	var g = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
	var r = state.edit != 'master' && !state.colorize ? state.ranges[state.edit] : null;
	var start = r ? hs_view_start(r) : 0;
	g.clearRect(0, 0, w, h);
	for (var x = 0; x < w; x++) {
		var hue = (start + x / w * 360) % 360;
		var shift = state.colorize ? 0 : state.h + (r ? r.h * hs_weight(hue, r) : 0);
		g.fillStyle = 'hsl(' + hue + ',100%,50%)';
		g.fillRect(x, 0, 1, 10);
		g.fillStyle = 'hsl(' + ((hue + shift + 720) % 360) + ',100%,50%)';
		g.fillRect(x, 24, 1, 10);
	}
	if (!r) return;
	var px = (v) => ((v - start + 720) % 360) / 360 * w;
	g.fillStyle = 'rgba(160,160,160,0.9)';
	g.fillRect(px(r.b), 13, Math.max(1, (((r.c - r.b + 360) % 360) / 360) * w), 6);
	g.fillStyle = 'rgba(110,110,110,0.9)';
	g.fillRect(px(r.a), 14, Math.max(1, (((r.b - r.a + 360) % 360) / 360) * w), 4);
	g.fillRect(px(r.c), 14, Math.max(1, (((r.d - r.c + 360) % 360) / 360) * w), 4);
	g.fillStyle = '#e8e8e8';
	['a', 'b', 'c', 'd'].forEach(k => g.fillRect(px(r[k]) - 1, 11, 3, 10));
}

class Ps_adjust_class {

	/**
	 * prepares the active layer for an adjustment; returns null when impossible
	 */
	begin(title, allow_smart) {
		ensure_pixel_layer();
		var layer = config.layer;
		if (!layer || layer.type != 'image' || !layer.link) {
			alertify.error('Could not complete the ' + title + ' command because the active layer is not a pixel layer.');
			return null;
		}
		if (layer.ps_smart && !allow_smart) {
			alertify.error('Could not complete the ' + title + ' command because the smart object is not directly editable.');
			return null;
		}
		var canvas = document.createElement('canvas');
		canvas.width = layer.width_original;
		canvas.height = layer.height_original;
		var ctx = canvas.getContext('2d', { willReadFrequently: true });
		ctx.drawImage(layer.link, 0, 0);
		var original = ctx.getImageData(0, 0, canvas.width, canvas.height);
		var sel = app.GUI.Ps_workspace.Selection;
		var mask = sel.has() ? sel.mask_for_layer(layer) : null;
		return { layer: layer, original: original, mask: mask, w: canvas.width, h: canvas.height, pending: false };
	}

	/**
	 * pixel function (data in/out RGBA arrays) -> canvas honoring the selection
	 */
	render(job, fn) {
		var out = new ImageData(new Uint8ClampedArray(job.original.data), job.w, job.h);
		fn(job.original.data, out.data, job.w, job.h);
		var canvas = document.createElement('canvas');
		canvas.width = job.w;
		canvas.height = job.h;
		var ctx = canvas.getContext('2d');
		ctx.putImageData(out, 0, 0);
		if (job.mask) {
			ctx.globalCompositeOperation = 'destination-in';
			ctx.drawImage(job.mask, 0, 0);
			var base = document.createElement('canvas');
			base.width = job.w;
			base.height = job.h;
			var bctx = base.getContext('2d');
			bctx.putImageData(job.original, 0, 0);
			//remove the selected area from the original, then add the adjusted pixels
			bctx.globalCompositeOperation = 'destination-out';
			bctx.drawImage(job.mask, 0, 0);
			bctx.globalCompositeOperation = 'source-over';
			bctx.drawImage(canvas, 0, 0);
			return base;
		}
		return canvas;
	}

	preview(job, fn, enabled) {
		if (job.pending) {
			job.next = [fn, enabled];
			return;
		}
		job.pending = true;
		requestAnimationFrame(() => {
			job.pending = false;
			if (enabled === false) {
				delete job.layer.link_canvas;
			}
			else {
				job.layer.link_canvas = this.render(job, fn);
			}
			config.need_render = true;
			if (job.next) {
				var next = job.next;
				job.next = null;
				this.preview(job, next[0], next[1]);
			}
		});
	}

	finish(job, fn, title, extra) {
		delete job.layer.link_canvas;
		var canvas = this.render(job, fn);
		return app.State.do_action(new app.Actions.Bundle_action('adjust', title, [
			new app.Actions.Update_layer_image_action(canvas, job.layer.id),
		].concat(extra || [])));
	}

	cancel(job) {
		delete job.layer.link_canvas;
		config.need_render = true;
	}

	histogram(job, channel) {
		var hist = new Uint32Array(256);
		var d = job.original.data;
		for (var i = 0; i < d.length; i += 4) {
			if (d[i + 3] == 0) continue;
			var v = channel == 'RGB' ? Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114)
				: d[i + { Red: 0, Green: 1, Blue: 2 }[channel]];
			hist[v]++;
		}
		return hist;
	}

	draw_histogram(canvas, hist) {
		var ctx = canvas.getContext('2d');
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		var max = 0;
		for (var i = 0; i < 256; i++) max = Math.max(max, hist[i]);
		ctx.fillStyle = '#000';
		for (var x = 0; x < 256; x++) {
			var h = max ? Math.round(hist[x] / max * canvas.height) : 0;
			ctx.fillRect(x * canvas.width / 256, canvas.height - h, Math.ceil(canvas.width / 256), h);
		}
	}

	show(title, html, setup, build_fn, kind, hooks) {
		if (this.layer_mode) {
			return this.show_for_layer(title, html, setup, kind);
		}
		var POP = new Dialog_class();
		var filter_key = this.filter_key, smart_edit = this.smart_edit;
		this.filter_key = null;
		this.smart_edit = null;
		var job = this.begin(title, true);
		if (!job) {
			return;
		}
		if (job.layer.ps_smart) {
			//CS6: only filters apply to smart objects, as Smart Filters
			if (!filter_key) {
				alertify.error('Could not complete the ' + title + ' command because the smart object is not directly editable.');
				return;
			}
			if (smart_edit) {
				var bctx = document.createElement('canvas').getContext('2d');
				bctx.canvas.width = job.w;
				bctx.canvas.height = job.h;
				bctx.drawImage(smart_edit.base, 0, 0);
				job.original = bctx.getImageData(0, 0, job.w, job.h);
			}
			job.smart_filter = { key: filter_key, edit: smart_edit };
		}
		var _this = this;
		var state = {};
		POP.show({
			title: title,
			className: 'ps_adjust_dialog',
			params: [{ function() { return '<div class="ps_adj">' + html + '<label class="ps_adj_preview"><input type="checkbox" id="ps_adj_preview" checked> Preview</label></div>'; } }],
			on_finish() {
				if (job.smart_filter) {
					build_fn(state);
					_this.cancel(job);
					var SF = app.GUI.Ps_workspace.Smart_filters;
					if (job.smart_filter.edit) SF.replace(job.layer, job.smart_filter.edit.index, state);
					else SF.add(job.layer, job.smart_filter.key, title, state);
					return;
				}
				var done = _this.finish(job, build_fn(state), (hooks && hooks.history_name) || title, hooks && hooks.extra ? hooks.extra(state) : null);
				if (hooks && hooks.after) done.then(() => hooks.after(state));
			},
			on_cancel() {
				_this.cancel(job);
				if (hooks && hooks.cancel) hooks.cancel();
			},
		});
		var root = document.querySelector('#popups .popup .ps_adj');
		var update = () => this.preview(job, build_fn(state), root.querySelector('#ps_adj_preview').checked);
		root.querySelector('#ps_adj_preview').addEventListener('change', update);
		setup(root, state, update, job);
		update();
	}

	/**
	 * the same dialogs, editing an adjustment layer's settings (live, non-destructive)
	 */
	show_for_layer(title, html, setup, kind) {
		var mode = this.layer_mode;
		this.layer_mode = null;
		var layer = mode.layer;
		var original = JSON.parse(JSON.stringify(layer.ps_adjust));
		var state = JSON.parse(JSON.stringify(layer.ps_adjust.state || {}));
		//histogram of what is below the adjustment layer
		var below = document.createElement('canvas');
		below.width = config.WIDTH;
		below.height = config.HEIGHT;
		var visible = layer.visible;
		layer.visible = false;
		app.Layers.convert_layers_to_canvas(below.getContext('2d'), null, false);
		layer.visible = visible;
		var job = { original: below.getContext('2d').getImageData(0, 0, below.width, below.height) };
		var POP = new Dialog_class();
		POP.show({
			title: title,
			className: 'ps_adjust_dialog',
			params: [{ function() { return '<div class="ps_adj">' + html + '<label class="ps_adj_preview"><input type="checkbox" id="ps_adj_preview" checked> Preview</label></div>'; } }],
			on_finish() {
				layer.ps_adjust = original;
				var settings = { ps_adjust: { kind: kind, state: JSON.parse(JSON.stringify(state)) } };
				app.State.do_action(new app.Actions.Bundle_action('adjustment_layer', mode.description || title, [
					new app.Actions.Update_layer_action(layer.id, settings),
				]));
				if (mode.on_done) mode.on_done();
			},
			on_cancel() {
				layer.ps_adjust = original;
				config.need_render = true;
				if (mode.on_done) mode.on_done();
			},
		});
		var root = document.querySelector('#popups .popup .ps_adj');
		var update = () => {
			var preview = root.querySelector('#ps_adj_preview').checked;
			layer.ps_adjust = preview ? { kind: kind, state: JSON.parse(JSON.stringify(state)) } : original;
			config.need_render = true;
		};
		root.querySelector('#ps_adj_preview').addEventListener('change', update);
		setup(root, state, update, job);
		update();
	}

	// ---------- Levels ----------

	levels() {
		var html = '<div class="ps_adj_row"><span>Channel:</span><select id="lv_channel"><option>RGB</option><option>Red</option><option>Green</option><option>Blue</option></select></div>'
			+ '<div class="ps_adj_label">Input Levels:</div>'
			+ '<canvas id="lv_hist" width="256" height="110" class="ps_adj_hist"></canvas>'
			+ '<div class="ps_adj_triple"><input id="lv_in_black" type="number" min="0" max="253" value="0"><input id="lv_gamma" type="number" min="0.1" max="9.99" step="0.01" value="1.00"><input id="lv_in_white" type="number" min="2" max="255" value="255"></div>'
			+ '<div class="ps_adj_label">Output Levels:</div>'
			+ '<div class="ps_adj_ramp"></div>'
			+ '<div class="ps_adj_pair"><input id="lv_out_black" type="number" min="0" max="255" value="0"><input id="lv_out_white" type="number" min="0" max="255" value="255"></div>';
		var channels = { RGB: null, Red: null, Green: null, Blue: null };
		this.show('Levels', html, (root, state, update, job) => {
			if (!state.values) {
				state.values = {};
				for (var c in channels) state.values[c] = { ib: 0, g: 1, iw: 255, ob: 0, ow: 255 };
			}
			state.channel = 'RGB';
			var fields = { ib: '#lv_in_black', g: '#lv_gamma', iw: '#lv_in_white', ob: '#lv_out_black', ow: '#lv_out_white' };
			var load = () => {
				var v = state.values[state.channel];
				for (var k in fields) root.querySelector(fields[k]).value = k == 'g' ? v[k].toFixed(2) : v[k];
				this.draw_histogram(root.querySelector('#lv_hist'), this.histogram(job, state.channel));
			};
			root.querySelector('#lv_channel').addEventListener('change', (e) => { state.channel = e.target.value; load(); });
			for (let k in fields) {
				root.querySelector(fields[k]).addEventListener('input', (e) => {
					var v = parseFloat(e.target.value);
					if (isNaN(v)) return;
					state.values[state.channel][k] = v;
					update();
				});
			}
			load();
		}, (state) => this.build_levels(state), 'levels');
	}

	// ---------- Curves ----------

	curves() {
		var html = '<div class="ps_adj_row"><span>Channel:</span><select id="cv_channel"><option>RGB</option><option>Red</option><option>Green</option><option>Blue</option></select></div>'
			+ '<canvas id="cv_graph" width="256" height="256" class="ps_adj_curve"></canvas>'
			+ '<div class="ps_adj_pair"><span>Output: <b id="cv_out">-</b></span><span>Input: <b id="cv_in">-</b></span></div>'
			+ '<div class="ps_adj_hint">Click to add a point, drag to move it, drag it off the graph to remove it.</div>';
		this.show('Curves', html, (root, state, update, job) => {
			if (!state.points) {
				state.points = {};
				for (var c of ['RGB', 'Red', 'Green', 'Blue']) state.points[c] = [{ x: 0, y: 0 }, { x: 255, y: 255 }];
			}
			state.channel = 'RGB';
			var canvas = root.querySelector('#cv_graph');
			var draw = () => {
				var ctx = canvas.getContext('2d');
				ctx.fillStyle = '#fff';
				ctx.fillRect(0, 0, 256, 256);
				var hist = this.histogram(job, state.channel);
				var max = 0;
				for (var i = 0; i < 256; i++) max = Math.max(max, hist[i]);
				ctx.fillStyle = '#d6d6d6';
				for (var x = 0; x < 256; x++) {
					var hh = max ? hist[x] / max * 256 : 0;
					ctx.fillRect(x, 256 - hh, 1, hh);
				}
				ctx.strokeStyle = '#bbb';
				ctx.lineWidth = 1;
				for (var g = 64; g < 256; g += 64) {
					ctx.beginPath(); ctx.moveTo(g + 0.5, 0); ctx.lineTo(g + 0.5, 256); ctx.stroke();
					ctx.beginPath(); ctx.moveTo(0, g + 0.5); ctx.lineTo(256, g + 0.5); ctx.stroke();
				}
				ctx.strokeStyle = '#999';
				ctx.beginPath(); ctx.moveTo(0, 256); ctx.lineTo(256, 0); ctx.stroke();
				var lut = curve_lut(state.points[state.channel]);
				ctx.strokeStyle = { RGB: '#000', Red: '#d00', Green: '#0a0', Blue: '#00d' }[state.channel];
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				for (var xx = 0; xx < 256; xx++) {
					if (xx == 0) ctx.moveTo(xx, 255 - lut[xx]);
					else ctx.lineTo(xx, 255 - lut[xx]);
				}
				ctx.stroke();
				ctx.fillStyle = '#000';
				for (var p of state.points[state.channel]) {
					ctx.fillRect(p.x - 3, 255 - p.y - 3, 6, 6);
				}
			};
			var dragging = null;
			var pos = (e) => {
				var r = canvas.getBoundingClientRect();
				return { x: clamp(Math.round((e.clientX - r.left) * 256 / r.width), 0, 255), y: clamp(255 - Math.round((e.clientY - r.top) * 256 / r.height), 0, 255), out: e.clientY < r.top - 12 || e.clientY > r.bottom + 12 || e.clientX < r.left - 12 || e.clientX > r.right + 12 };
			};
			canvas.addEventListener('mousedown', (e) => {
				var p = pos(e);
				var pts = state.points[state.channel];
				dragging = pts.find(q => Math.abs(q.x - p.x) < 8 && Math.abs(q.y - p.y) < 8);
				if (!dragging) {
					dragging = { x: p.x, y: p.y };
					pts.push(dragging);
				}
				draw();
				update();
				e.preventDefault();
			});
			document.addEventListener('mousemove', (e) => {
				var p = pos(e);
				if (e.target === canvas) {
					root.querySelector('#cv_in').textContent = p.x;
					root.querySelector('#cv_out').textContent = p.y;
				}
				if (!dragging) return;
				var pts = state.points[state.channel];
				if (p.out && pts.length > 2) {
					pts.splice(pts.indexOf(dragging), 1);
					dragging = null;
				}
				else {
					dragging.x = p.x;
					dragging.y = p.y;
				}
				draw();
				update();
			});
			document.addEventListener('mouseup', () => { dragging = null; });
			root.querySelector('#cv_channel').addEventListener('change', (e) => { state.channel = e.target.value; draw(); });
			draw();
		}, (state) => this.build_curves(state), 'curves');
	}

	// ---------- Hue/Saturation ----------

	hue_saturation() {
		var row = (id, label, min, max) => '<div class="ps_adj_slider"><span>' + label + '</span><input type="number" id="' + id + '_n" value="0" min="' + min + '" max="' + max + '">'
			+ '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" value="0"></div>';
		var html = '<div class="ps_adj_row"><span>Preset:</span><select id="hs_preset">' + ['Custom', 'Default'].concat(Object.keys(HS_PRESETS)).map(n => '<option>' + n + '</option>').join('') + '</select></div>'
			+ '<div class="ps_adj_row"><select id="hs_edit">' + HS_EDIT.map(([k, n]) => '<option value="' + k + '">' + n + '</option>').join('') + '</select></div>'
			+ row('hs_hue', 'Hue:', -180, 180) + row('hs_sat', 'Saturation:', -100, 100) + row('hs_light', 'Lightness:', -100, 100)
			+ '<label class="ps_adj_check"><input type="checkbox" id="hs_colorize"> Colorize</label>'
			+ '<div class="ps_hs_range"><div class="ps_hs_degrees" id="hs_degrees"></div><canvas id="hs_bars" width="300" height="34"></canvas></div>';
		this.show('Hue/Saturation', html, (root, state, update) => {
			hs_normalize(state);
			var edit = root.querySelector('#hs_edit'), preset = root.querySelector('#hs_preset'), bars = root.querySelector('#hs_bars');
			var target = () => state.edit == 'master' ? state : state.ranges[state.edit];
			var sync = () => {
				var t = target();
				for (let [id, key] of [['hs_hue', 'h'], ['hs_sat', 's'], ['hs_light', 'l']]) {
					root.querySelector('#' + id).value = root.querySelector('#' + id + '_n').value = t[key];
				}
				edit.value = state.edit;
				edit.disabled = !!state.colorize;
				root.querySelector('#hs_colorize').checked = !!state.colorize;
				root.querySelector('#hs_sat').min = root.querySelector('#hs_sat_n').min = state.colorize && state.edit == 'master' ? 0 : -100;
				var r = state.edit == 'master' ? null : state.ranges[state.edit];
				root.querySelector('#hs_degrees').textContent = r ? [r.a, r.b].map(deg).join('/') + ' \\ ' + [r.c, r.d].map(deg).join('/') : '';
				hs_draw_bars(bars, state);
			};
			var changed = () => { preset.value = 'Custom'; sync(); update(); };
			for (let [id, key] of [['hs_hue', 'h'], ['hs_sat', 's'], ['hs_light', 'l']]) {
				let range = root.querySelector('#' + id), num = root.querySelector('#' + id + '_n');
				let set = (v) => { target()[key] = v; changed(); };
				range.addEventListener('input', () => set(parseInt(range.value)));
				num.addEventListener('input', () => { var v = parseInt(num.value); if (!isNaN(v)) set(v); });
			}
			edit.addEventListener('change', () => { state.edit = edit.value; sync(); });
			root.querySelector('#hs_colorize').addEventListener('change', (e) => {
				state.colorize = e.target.checked;
				state.edit = 'master';
				if (state.colorize && state.s == 0) state.s = 25;
				changed();
			});
			preset.addEventListener('change', () => {
				if (preset.value == 'Custom') return;
				var keep = preset.value;
				Object.keys(state).forEach(k => delete state[k]);
				Object.assign(state, JSON.parse(JSON.stringify(HS_PRESETS[keep] || {})));
				hs_normalize(state);
				sync();
				update();
				preset.value = keep;
			});
			//the range bar: drag the four markers (falloff and range ends) or the middle
			var drag = null;
			bars.addEventListener('mousedown', (e) => {
				if (state.edit == 'master' || state.colorize) return;
				var r = state.ranges[state.edit], x = e.offsetX / bars.clientWidth * 360;
				var pos = (v) => ((v - hs_view_start(r) + 720) % 360);
				var hit = ['a', 'b', 'c', 'd'].map(k => [k, Math.abs(pos(r[k]) - x)]).sort((p, q) => p[1] - q[1])[0];
				drag = hit[1] < 12 ? { key: hit[0] } : { move: x, start: { a: r.a, b: r.b, c: r.c, d: r.d } };
				e.preventDefault();
				document.addEventListener('mousemove', on_move);
				document.addEventListener('mouseup', on_up);
			});
			var on_move = (e) => {
				if (!drag) return;
				var rect = bars.getBoundingClientRect(), r = state.ranges[state.edit];
				var x = Math.max(0, Math.min(360, (e.clientX - rect.left) / rect.width * 360));
				if (drag.key) {
					r[drag.key] = Math.round((x + hs_view_start(r) + 360) % 360);
				}
				else {
					var dx = Math.round(x - drag.move);
					['a', 'b', 'c', 'd'].forEach(k => { r[k] = (drag.start[k] + dx + 720) % 360; });
				}
				changed();
			};
			var on_up = () => {
				drag = null;
				document.removeEventListener('mousemove', on_move);
				document.removeEventListener('mouseup', on_up);
			};
			sync();
		}, (state) => this.build_hue_saturation(state), 'hue_saturation');
	}

	// ---------- Brightness/Contrast ----------

	brightness_contrast() {
		var row = (id, label, min, max) => '<div class="ps_adj_slider"><span>' + label + '</span><input type="number" id="' + id + '_n" value="0" min="' + min + '" max="' + max + '">'
			+ '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" value="0"></div>';
		var html = row('bc_b', 'Brightness:', -150, 150) + row('bc_c', 'Contrast:', -50, 100)
			+ '<label class="ps_adj_check"><input type="checkbox" id="bc_legacy"> Use Legacy</label>';
		this.show('Brightness/Contrast', html, (root, state, update) => {
			state.b = state.b || 0; state.c = state.c || 0; state.legacy = !!state.legacy;
			root.querySelector('#bc_legacy').checked = state.legacy;
			for (let [id, key] of [['bc_b', 'b'], ['bc_c', 'c']]) {
				let range = root.querySelector('#' + id), num = root.querySelector('#' + id + '_n');
				range.value = num.value = state[key];
				let set = (v) => { state[key] = v; range.value = v; num.value = v; update(); };
				range.addEventListener('input', () => set(parseInt(range.value)));
				num.addEventListener('input', () => { var v = parseInt(num.value); if (!isNaN(v)) set(v); });
			}
			root.querySelector('#bc_legacy').addEventListener('change', (e) => { state.legacy = e.target.checked; update(); });
		}, (state) => this.build_brightness_contrast(state), 'brightness_contrast');
	}

	// ---------- pixel functions (shared with adjustment layers) ----------

	build_levels(state) {
			var luts = [0, 1, 2].map((ch) => {
				var name = ['Red', 'Green', 'Blue'][ch];
				var lut = new Uint8ClampedArray(256);
				for (var x = 0; x < 256; x++) {
					var v = x;
					for (var key of ['RGB', name]) {
						var p = state.values[key];
						var t = clamp((v - p.ib) / Math.max(1, p.iw - p.ib), 0, 1);
						t = Math.pow(t, 1 / clamp(p.g, 0.1, 9.99));
						v = p.ob + t * (p.ow - p.ob);
					}
					lut[x] = v;
				}
				return lut;
			});
			return (src, dst) => {
				for (var i = 0; i < src.length; i += 4) {
					dst[i] = luts[0][src[i]];
					dst[i + 1] = luts[1][src[i + 1]];
					dst[i + 2] = luts[2][src[i + 2]];
				}
			};
	}

	build_curves(state) {
			var rgb = curve_lut(state.points.RGB);
			var luts = ['Red', 'Green', 'Blue'].map((name) => {
				var own = curve_lut(state.points[name]);
				var lut = new Uint8ClampedArray(256);
				for (var x = 0; x < 256; x++) lut[x] = rgb[own[x]];
				return lut;
			});
			return (src, dst) => {
				for (var i = 0; i < src.length; i += 4) {
					dst[i] = luts[0][src[i]];
					dst[i + 1] = luts[1][src[i + 1]];
					dst[i + 2] = luts[2][src[i + 2]];
				}
			};
	}

	build_hue_saturation(state) {
			hs_normalize(state);
			var colorize = state.colorize;
			var ranges = colorize ? [] : HS_EDIT.slice(1).map(([k]) => state.ranges[k]).filter(r => r.h || r.s || r.l);
			return (src, dst) => {
				for (var i = 0; i < src.length; i += 4) {
					var hsl = rgb_to_hsl(src[i], src[i + 1], src[i + 2]);
					var h = hsl[0], s = hsl[1], l = hsl[2];
					var dh = state.h, ds = state.s, dl = state.l;
					if (ranges.length && s > 0) {
						//Edit: a color range adds its change where the pixel's hue is inside it (falloff at the ends)
						var deg = h * 360, chroma = Math.min(1, s * 10);
						for (var r of ranges) {
							var w = hs_weight(deg, r) * chroma;
							if (!w) continue;
							dh += r.h * w;
							ds += r.s * w;
							dl += r.l * w;
						}
					}
					if (colorize) {
						h = ((state.h + 360) % 360) / 360;
						s = clamp(state.s / 100, 0, 1);
					}
					else {
						h = (h + dh / 360 + 1) % 1;
						ds = clamp(ds, -100, 100) / 100;
						s = ds > 0 ? s + (1 - s) * ds : s * (1 + ds);
					}
					dl = clamp(dl, -100, 100) / 100;
					l = dl > 0 ? l + (1 - l) * dl : l * (1 + dl);
					var rgb = hsl_to_rgb(h, clamp(s, 0, 1), clamp(l, 0, 1));
					dst[i] = rgb[0];
					dst[i + 1] = rgb[1];
					dst[i + 2] = rgb[2];
				}
			};
	}

	build_brightness_contrast(state) {
			var lut = new Uint8ClampedArray(256);
			var c = state.c / 100;
			for (var x = 0; x < 256; x++) {
				var v;
				if (state.legacy) {
					v = (x + state.b - 128) * (1 + c) + 128;
				}
				else {
					//non-legacy: brightness is a midtone (gamma-like) shift, contrast an S-curve around the mean
					var t = x / 255;
					var g = state.b >= 0 ? 1 / (1 + state.b / 100) : 1 + (-state.b) / 100;
					t = Math.pow(t, g);
					t = 0.5 + (t - 0.5) * (c >= 0 ? 1 + c * 1.5 : 1 + c);
					v = t * 255;
				}
				lut[x] = clamp(v, 0, 255);
			}
			return (src, dst) => {
				for (var i = 0; i < src.length; i += 4) {
					dst[i] = lut[src[i]];
					dst[i + 1] = lut[src[i + 1]];
					dst[i + 2] = lut[src[i + 2]];
				}
			};
	}

	// ---------- generic slider dialogs (Exposure, Vibrance, Color Balance, ...) ----------

	/**
	 * fields: [{ key, label, min, max, step, value }] ; extra_html / extra_setup optional
	 */
	sliders(title, kind, fields, extra_html, extra_setup) {
		var row = (f) => '<div class="ps_adj_slider"><span>' + f.label + '</span><input type="number" id="adj_' + f.key + '_n" value="' + f.value + '" min="' + f.min + '" max="' + f.max + '" step="' + (f.step || 1) + '">'
			+ '<input type="range" id="adj_' + f.key + '" min="' + f.min + '" max="' + f.max + '" step="' + (f.step || 1) + '" value="' + f.value + '"></div>';
		var html = (extra_html || '') + fields.map(row).join('');
		this.show(title, html, (root, state, update) => {
			for (let f of fields) {
				if (state[f.key] === undefined) state[f.key] = f.value;
				let range = root.querySelector('#adj_' + f.key), num = root.querySelector('#adj_' + f.key + '_n');
				range.value = num.value = state[f.key];
				let set = (v) => { state[f.key] = v; range.value = v; num.value = v; update(); };
				range.addEventListener('input', () => set(parseFloat(range.value)));
				num.addEventListener('input', () => { var v = parseFloat(num.value); if (!isNaN(v)) set(v); });
			}
			if (extra_setup) extra_setup(root, state, update);
		}, (state) => this['build_' + kind](state), kind);
	}

	exposure() {
		this.sliders('Exposure', 'exposure', [
			{ key: 'exposure', label: 'Exposure:', min: -20, max: 20, step: 0.01, value: 0 },
			{ key: 'offset', label: 'Offset:', min: -0.5, max: 0.5, step: 0.0001, value: 0 },
			{ key: 'gamma', label: 'Gamma Correction:', min: 0.01, max: 9.99, step: 0.01, value: 1 },
		]);
	}

	vibrance() {
		this.sliders('Vibrance', 'vibrance', [
			{ key: 'vibrance', label: 'Vibrance:', min: -100, max: 100, value: 0 },
			{ key: 'saturation', label: 'Saturation:', min: -100, max: 100, value: 0 },
		]);
	}

	color_balance() {
		var extra = '<div class="ps_adj_row"><span>Tone:</span><select id="cb_tone"><option>Shadows</option><option selected>Midtones</option><option>Highlights</option></select></div>'
			+ '<label class="ps_adj_check"><input type="checkbox" id="cb_preserve" checked> Preserve Luminosity</label>';
		this.sliders('Color Balance', 'color_balance', [
			{ key: 'cr', label: 'Cyan / Red:', min: -100, max: 100, value: 0 },
			{ key: 'mg', label: 'Magenta / Green:', min: -100, max: 100, value: 0 },
			{ key: 'yb', label: 'Yellow / Blue:', min: -100, max: 100, value: 0 },
		], extra, (root, state, update) => {
			//one set of sliders per tone; the visible sliders show the current tone
			state.tones = state.tones || { Shadows: [0, 0, 0], Midtones: [0, 0, 0], Highlights: [0, 0, 0] };
			state.tone = state.tone || 'Midtones';
			state.preserve = state.preserve !== false;
			var keys = ['cr', 'mg', 'yb'];
			var load = () => keys.forEach((k, i) => {
				state[k] = state.tones[state.tone][i];
				root.querySelector('#adj_' + k).value = root.querySelector('#adj_' + k + '_n').value = state[k];
			});
			keys.forEach((k, i) => {
				var sync = () => { state.tones[state.tone][i] = state[k]; update(); };
				root.querySelector('#adj_' + k).addEventListener('input', sync);
				root.querySelector('#adj_' + k + '_n').addEventListener('input', sync);
			});
			root.querySelector('#cb_tone').value = state.tone;
			root.querySelector('#cb_tone').addEventListener('change', (e) => { state.tone = e.target.value; load(); });
			root.querySelector('#cb_preserve').checked = state.preserve;
			root.querySelector('#cb_preserve').addEventListener('change', (e) => { state.preserve = e.target.checked; update(); });
			load();
		});
	}

	photo_filter() {
		var filters = { 'Warming Filter (85)': '#ec8a00', 'Warming Filter (LBA)': '#fa9600', 'Warming Filter (81)': '#ebb113', 'Cooling Filter (80)': '#006dff',
			'Cooling Filter (LBB)': '#005dff', 'Cooling Filter (82)': '#00b5ff', 'Red': '#ea1a1a', 'Orange': '#f28418', 'Yellow': '#f9e31c', 'Green': '#19c919',
			'Cyan': '#1de4e4', 'Blue': '#1d35ea', 'Violet': '#9b1dea', 'Magenta': '#e31ce3', 'Sepia': '#ac7a33', 'Deep Red': '#ff0000', 'Deep Blue': '#0022cd',
			'Deep Emerald': '#008c00', 'Deep Yellow': '#ffd500', 'Underwater': '#00c1b1' };
		var extra = '<div class="ps_adj_row"><span>Filter:</span><select id="pf_filter">' + Object.keys(filters).map(n => '<option>' + n + '</option>').join('') + '</select></div>'
			+ '<label class="ps_adj_check"><input type="checkbox" id="pf_preserve" checked> Preserve Luminosity</label>';
		this.sliders('Photo Filter', 'photo_filter', [
			{ key: 'density', label: 'Density:', min: 1, max: 100, value: 25 },
		], extra, (root, state, update) => {
			state.filter = state.filter || 'Warming Filter (85)';
			state.color = filters[state.filter] || state.color;
			state.preserve = state.preserve !== false;
			root.querySelector('#pf_filter').value = state.filter;
			root.querySelector('#pf_filter').addEventListener('change', (e) => { state.filter = e.target.value; state.color = filters[state.filter]; update(); });
			root.querySelector('#pf_preserve').checked = state.preserve;
			root.querySelector('#pf_preserve').addEventListener('change', (e) => { state.preserve = e.target.checked; update(); });
		});
	}

	channel_mixer() {
		var extra = '<div class="ps_adj_row"><span>Output:</span><select id="cm_out"><option>Red</option><option>Green</option><option>Blue</option></select></div>';
		this.sliders('Channel Mixer', 'channel_mixer', [
			{ key: 'r', label: 'Red:', min: -200, max: 200, value: 100 },
			{ key: 'g', label: 'Green:', min: -200, max: 200, value: 0 },
			{ key: 'b', label: 'Blue:', min: -200, max: 200, value: 0 },
			{ key: 'k', label: 'Constant:', min: -200, max: 200, value: 0 },
		], extra + '<label class="ps_adj_check"><input type="checkbox" id="cm_mono"> Monochrome</label>', (root, state, update) => {
			state.matrix = state.matrix || { Red: [100, 0, 0, 0], Green: [0, 100, 0, 0], Blue: [0, 0, 100, 0] };
			state.out = state.out || 'Red';
			state.mono = !!state.mono;
			var keys = ['r', 'g', 'b', 'k'];
			var load = () => keys.forEach((k, i) => {
				state[k] = state.matrix[state.out][i];
				root.querySelector('#adj_' + k).value = root.querySelector('#adj_' + k + '_n').value = state[k];
			});
			keys.forEach((k, i) => {
				var sync = () => { state.matrix[state.out][i] = state[k]; if (state.mono) { state.matrix.Green = state.matrix.Red.slice(); state.matrix.Blue = state.matrix.Red.slice(); } update(); };
				root.querySelector('#adj_' + k).addEventListener('input', sync);
				root.querySelector('#adj_' + k + '_n').addEventListener('input', sync);
			});
			root.querySelector('#cm_out').value = state.out;
			root.querySelector('#cm_out').addEventListener('change', (e) => { state.out = e.target.value; load(); });
			root.querySelector('#cm_mono').checked = state.mono;
			root.querySelector('#cm_mono').addEventListener('change', (e) => {
				state.mono = e.target.checked;
				if (state.mono) {
					state.out = 'Red';
					root.querySelector('#cm_out').value = 'Red';
					state.matrix.Red = [40, 40, 20, 0];
					state.matrix.Green = state.matrix.Red.slice();
					state.matrix.Blue = state.matrix.Red.slice();
					load();
				}
				update();
			});
			load();
		});
	}

	gradient_map() {
		var extra = '<div class="ps_adj_section">Gradient Used for Grayscale Mapping</div>'
			+ '<div class="ps_gm_row"><span class="ps_adj_gradient" id="gm_preview" title="Click to edit the gradient"></span><span class="ps_caret" id="gm_caret" title="Gradient presets">&#9662;</span></div>'
			+ '<div class="ps_adj_section">Gradient Options</div>'
			+ '<label class="ps_adj_check"><input type="checkbox" id="gm_dither"> Dither</label>'
			+ '<label class="ps_adj_check"><input type="checkbox" id="gm_reverse"> Reverse</label>';
		this.show('Gradient Map', extra, (root, state, update) => {
			state.gradient = state.gradient || (state.c1 ? two_color(state.c1, state.c2) : resolve(PRESETS[0]));
			state.reverse = !!state.reverse;
			state.dither = !!state.dither;
			var preview = root.querySelector('#gm_preview');
			var paint = () => { preview.style.background = gradient_css(state.gradient); preview.style.transform = state.reverse ? 'scaleX(-1)' : ''; };
			var set = (g) => { state.gradient = resolve(g); paint(); update(); };
			preview.addEventListener('click', () => gradient_editor(state.gradient, set, (g) => { state.gradient = resolve(g); paint(); update(); }));
			root.querySelector('#gm_caret').addEventListener('click', (e) => gradient_picker(e.currentTarget, set));
			root.querySelector('#gm_reverse').checked = state.reverse;
			root.querySelector('#gm_reverse').addEventListener('change', (e) => { state.reverse = e.target.checked; paint(); update(); });
			root.querySelector('#gm_dither').checked = state.dither;
			root.querySelector('#gm_dither').addEventListener('change', (e) => { state.dither = e.target.checked; update(); });
			paint();
		}, (state) => this.build_gradient_map(state), 'gradient_map');
	}

	/**
	 * Image > Auto Tone (per channel), Auto Contrast (all channels together),
	 * Auto Color (per channel, then neutral midtones); 0.1% clipping
	 */
	auto(kind) {
		var titles = { tone: 'Auto Tone', contrast: 'Auto Contrast', color: 'Auto Color' };
		var job = this.begin(titles[kind]);
		if (!job) return;
		var d = job.original.data, n = 0;
		var hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
		for (var i = 0; i < d.length; i += 4) {
			if (d[i + 3] == 0) continue;
			hist[0][d[i]]++; hist[1][d[i + 1]]++; hist[2][d[i + 2]]++; n++;
		}
		if (!n) return;
		var clip = n * 0.001;
		var range = (h) => {
			var lo = 0, hi = 255, acc = 0;
			for (lo = 0; lo < 255; lo++) { acc += h[lo]; if (acc > clip) break; }
			acc = 0;
			for (hi = 255; hi > 0; hi--) { acc += h[hi]; if (acc > clip) break; }
			return [lo, Math.max(lo + 1, hi)];
		};
		var r = hist.map(range);
		if (kind == 'contrast') {
			var lo = Math.min(r[0][0], r[1][0], r[2][0]), hi = Math.max(r[0][1], r[1][1], r[2][1]);
			r = [[lo, hi], [lo, hi], [lo, hi]];
		}
		var luts = r.map(([lo, hi]) => {
			var lut = new Float32Array(256);
			for (var v = 0; v < 256; v++) lut[v] = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
			return lut;
		});
		if (kind == 'color') {
			//neutralize the midtones: equal channel means after the stretch
			var means = [0, 0, 0];
			for (var c = 0; c < 3; c++) {
				var sum = 0;
				for (var v2 = 0; v2 < 256; v2++) sum += hist[c][v2] * luts[c][v2];
				means[c] = Math.min(0.99, Math.max(0.01, sum / n));
			}
			var target = (means[0] + means[1] + means[2]) / 3;
			for (var c2 = 0; c2 < 3; c2++) {
				var g = Math.log(target) / Math.log(means[c2]);
				for (var v3 = 0; v3 < 256; v3++) luts[c2][v3] = Math.pow(luts[c2][v3], g);
			}
		}
		var bytes = luts.map(l => { var b = new Uint8ClampedArray(256); for (var v = 0; v < 256; v++) b[v] = l[v] * 255; return b; });
		this.finish(job, (src, dst) => {
			for (var j = 0; j < src.length; j += 4) { dst[j] = bytes[0][src[j]]; dst[j + 1] = bytes[1][src[j + 1]]; dst[j + 2] = bytes[2][src[j + 2]]; }
		}, titles[kind]);
	}

	/**
	 * CS6 Replace Color: sampled color + Fuzziness selects; Hue/Saturation/Lightness change it
	 */
	replace_color() {
		var html = '<div class="ps_adj_label">Selection</div>'
			+ '<div class="ps_adj_slider"><span>Fuzziness:</span><input type="number" id="rc_fz_n" min="0" max="200"><span class="ps_adj_unit"></span><input type="range" id="rc_fz" min="0" max="200"></div>'
			+ '<canvas id="rc_preview" class="ps_cr_preview" width="220" height="160" title="Click to sample the color to replace"></canvas>'
			+ '<label class="ps_adj_check"><input type="checkbox" id="rc_invert"> Invert</label>'
			+ '<div class="ps_adj_label">Replacement</div>'
			+ '<div class="ps_adj_slider"><span>Hue:</span><input type="number" id="rc_h_n" min="-180" max="180"><span class="ps_adj_unit"></span><input type="range" id="rc_h" min="-180" max="180"></div>'
			+ '<div class="ps_adj_slider"><span>Saturation:</span><input type="number" id="rc_s_n" min="-100" max="100"><span class="ps_adj_unit"></span><input type="range" id="rc_s" min="-100" max="100"></div>'
			+ '<div class="ps_adj_slider"><span>Lightness:</span><input type="number" id="rc_l_n" min="-100" max="100"><span class="ps_adj_unit"></span><input type="range" id="rc_l" min="-100" max="100"></div>';
		this.show('Replace Color', html, (root, state, update, job) => {
			Object.assign(state, { fuzz: 40, h: 0, s: 0, l: 0, invert: false }, state);
			if (!state.color) state.color = [parseInt(config.COLOR.substr(1, 2), 16), parseInt(config.COLOR.substr(3, 2), 16), parseInt(config.COLOR.substr(5, 2), 16)];
			var preview = root.querySelector('#rc_preview');
			var W = job.w, H = job.h, sc = Math.min(220 / W, 160 / H);
			preview.width = Math.max(1, Math.round(W * sc));
			preview.height = Math.max(1, Math.round(H * sc));
			var draw = () => {
				var m = this.replace_mask(job.original.data, state);
				var c = document.createElement('canvas');
				c.width = W;
				c.height = H;
				var ctx = c.getContext('2d');
				var img = ctx.createImageData(W, H);
				for (var i = 0; i < m.length; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = m[i] * 255; img.data[i * 4 + 3] = 255; }
				ctx.putImageData(img, 0, 0);
				preview.getContext('2d').drawImage(c, 0, 0, preview.width, preview.height);
			};
			var bind = (id, key) => {
				var r = root.querySelector('#' + id), n = root.querySelector('#' + id + '_n');
				r.value = n.value = state[key];
				var set = (v) => { if (isNaN(v)) return; state[key] = v; r.value = n.value = v; if (key == 'fuzz') draw(); update(); };
				r.addEventListener('input', () => set(parseFloat(r.value)));
				n.addEventListener('change', () => set(parseFloat(n.value)));
			};
			bind('rc_fz', 'fuzz'); bind('rc_h', 'h'); bind('rc_s', 's'); bind('rc_l', 'l');
			var inv = root.querySelector('#rc_invert');
			inv.checked = state.invert;
			inv.addEventListener('change', () => { state.invert = inv.checked; draw(); update(); });
			preview.addEventListener('click', (e) => {
				var rect = preview.getBoundingClientRect();
				var x = Math.floor((e.clientX - rect.left) / rect.width * W), y = Math.floor((e.clientY - rect.top) / rect.height * H);
				var k = (Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))) * 4, d = job.original.data;
				state.color = [d[k], d[k + 1], d[k + 2]];
				draw();
				update();
			});
			draw();
		}, (state) => this.build_replace_color(state), 'replace_color');
	}

	replace_mask(d, state) {
		var n = d.length / 4, m = new Float32Array(n), c = state.color, f = state.fuzz / 2;
		for (var i = 0; i < n; i++) {
			var dist = Math.max(Math.abs(d[i * 4] - c[0]), Math.abs(d[i * 4 + 1] - c[1]), Math.abs(d[i * 4 + 2] - c[2]));
			var v = dist <= f ? 1 : Math.max(0, 1 - (dist - f) / Math.max(1, f));
			m[i] = state.invert ? 1 - v : v;
		}
		return m;
	}

	build_replace_color(state) {
		return (src, dst) => {
			var m = this.replace_mask(src, state);
			for (var i = 0; i < m.length; i++) {
				if (m[i] <= 0) continue;
				var k = i * 4;
				var hsl = rgb_to_hsl(src[k], src[k + 1], src[k + 2]);
				var h = (hsl[0] + state.h / 360 + 1) % 1;
				var s = clamp(hsl[1] * (1 + state.s / 100), 0, 1);
				var l = state.l >= 0 ? hsl[2] + (1 - hsl[2]) * state.l / 100 : hsl[2] * (1 + state.l / 100);
				var rgb = hsl_to_rgb(h, s, clamp(l, 0, 1));
				for (var c = 0; c < 3; c++) dst[k + c] = src[k + c] + (rgb[c] - src[k + c]) * m[i];
			}
		};
	}

	/**
	 * CS6 Variations: click thumbnails to add color/lightness shifts to the
	 * Shadows, Midtones, Highlights or the Saturation; Fine..Coarse sets the step
	 */
	variations() {
		var tile = (id, label) => '<div class="ps_var_tile" data-v="' + id + '"><canvas></canvas><span>' + label + '</span></div>';
		var html = '<div class="ps_var">'
			+ '<div class="ps_var_top">' + tile('original', 'Original') + tile('current', 'Current Pick') + '</div>'
			+ '<div class="ps_var_body"><div class="ps_var_grid">'
			+ tile('green', 'More Green') + tile('yellow', 'More Yellow') + tile('cyan', 'More Cyan')
			+ tile('red', 'More Red') + tile('pick', 'Current Pick') + tile('blue', 'More Blue')
			+ tile('magenta', 'More Magenta') + '</div>'
			+ '<div class="ps_var_side">' + tile('lighter', 'Lighter') + tile('pick2', 'Current Pick') + tile('darker', 'Darker') + '</div>'
			+ '<div class="ps_var_opts">'
			+ ['Shadows', 'Midtones', 'Highlights', 'Saturation'].map(t => '<label class="ps_adj_check"><input type="radio" name="var_tone" value="' + t + '"' + (t == 'Midtones' ? ' checked' : '') + '> ' + t + '</label>').join('')
			+ '<div class="ps_var_fine"><span>Fine</span><input type="range" id="var_amount" min="0" max="6" step="1" value="3"><span>Coarse</span></div>'
			+ '<label class="ps_adj_check"><input type="checkbox" id="var_clip" checked> Show Clipping</label>'
			+ '</div></div></div>';
		this.show('Variations', html, (root, state, update, job) => {
			root.querySelector('.ps_adj_preview').style.display = 'none';
			root.closest('.popup').classList.add('ps_variations_dialog');
			if (!state.t) state.t = { Shadows: [0, 0, 0, 0], Midtones: [0, 0, 0, 0], Highlights: [0, 0, 0, 0] };
			if (state.sat == null) state.sat = 0;
			state.tone = 'Midtones';
			state.amount = 3;
			//thumbnail source
			var sc = Math.min(1, 96 / Math.max(job.w, job.h));
			var tw = Math.max(1, Math.round(job.w * sc)), th = Math.max(1, Math.round(job.h * sc));
			var small = document.createElement('canvas');
			small.width = job.w;
			small.height = job.h;
			small.getContext('2d').putImageData(job.original, 0, 0);
			var thumb = document.createElement('canvas');
			thumb.width = tw;
			thumb.height = th;
			thumb.getContext('2d').drawImage(small, 0, 0, tw, th);
			var src = thumb.getContext('2d').getImageData(0, 0, tw, th).data;
			var DELTA = { red: [1, 0, 0, 0], cyan: [-1, 0, 0, 0], green: [0, 1, 0, 0], magenta: [0, -1, 0, 0], blue: [0, 0, 1, 0], yellow: [0, 0, -1, 0], lighter: [0, 0, 0, 1], darker: [0, 0, 0, -1] };
			var step = () => 3 * Math.pow(2, state.amount);
			var shifted = (id) => {
				var next = { t: JSON.parse(JSON.stringify(state.t)), sat: state.sat };
				var d = DELTA[id];
				if (!d) return next;
				if (state.tone == 'Saturation') {
					if (id == 'lighter' || id == 'darker') return next;
					//Saturation mode: the tiles become Less / More Saturation
					next.sat += (id == 'red' || id == 'blue' || id == 'green' ? 1 : -1) * step();
					return next;
				}
				for (var c = 0; c < 4; c++) next.t[state.tone][c] += d[c] * step();
				return next;
			};
			var paint = (canvas, st) => {
				canvas.width = tw;
				canvas.height = th;
				var ctx = canvas.getContext('2d');
				var img = ctx.createImageData(tw, th);
				img.data.set(src);
				if (st) this.build_variations(st, state.clip)(src, img.data);
				ctx.putImageData(img, 0, 0);
			};
			var draw = () => {
				root.querySelectorAll('.ps_var_tile').forEach((t) => {
					var id = t.dataset.v;
					var sat_mode = state.tone == 'Saturation';
					var hidden = sat_mode && !['original', 'current', 'pick', 'red', 'cyan'].includes(id);
					t.style.visibility = hidden ? 'hidden' : '';
					if (sat_mode && id == 'red') t.querySelector('span').textContent = 'More Saturation';
					else if (sat_mode && id == 'cyan') t.querySelector('span').textContent = 'Less Saturation';
					else if (id == 'red') t.querySelector('span').textContent = 'More Red';
					else if (id == 'cyan') t.querySelector('span').textContent = 'More Cyan';
					if (hidden) return;
					paint(t.querySelector('canvas'), id == 'original' ? null : shifted(id));
				});
			};
			root.querySelectorAll('.ps_var_tile').forEach((t) => t.addEventListener('click', () => {
				var id = t.dataset.v;
				if (id == 'original') {
					state.t = { Shadows: [0, 0, 0, 0], Midtones: [0, 0, 0, 0], Highlights: [0, 0, 0, 0] };
					state.sat = 0;
				}
				else if (DELTA[id]) {
					var next = shifted(id);
					state.t = next.t;
					state.sat = next.sat;
				}
				draw();
				update();
			}));
			root.querySelectorAll('input[name="var_tone"]').forEach((r) => r.addEventListener('change', () => { state.tone = r.value; draw(); }));
			root.querySelector('#var_amount').addEventListener('input', (e) => { state.amount = parseInt(e.target.value); draw(); });
			var clip = root.querySelector('#var_clip');
			state.clip = clip.checked;
			clip.addEventListener('change', () => { state.clip = clip.checked; draw(); });
			draw();
		}, (state) => this.build_variations(state, false), 'variations');
	}

	/**
	 * clip: show clipped (out of range) pixels in neon, for the thumbnails
	 */
	build_variations(state, clip) {
		var t = state.t || { Shadows: [0, 0, 0, 0], Midtones: [0, 0, 0, 0], Highlights: [0, 0, 0, 0] };
		var sat = (state.sat || 0) / 100;
		return (src, dst) => {
			for (var i = 0; i < src.length; i += 4) {
				var r = src[i], g = src[i + 1], b = src[i + 2];
				var l = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
				var ws = Math.max(0, 1 - l * 2.5), wh = Math.max(0, l * 2.5 - 1.5), wm = Math.max(0, 1 - Math.abs(l - 0.5) * 2.2);
				var add = [0, 0, 0];
				for (var [tone, w] of [['Shadows', ws], ['Midtones', wm], ['Highlights', wh]]) {
					var v = t[tone];
					for (var c = 0; c < 3; c++) add[c] += (v[c] + v[3]) * w;
				}
				var nr = r + add[0], ng = g + add[1], nb = b + add[2];
				if (sat) {
					var m = (nr + ng + nb) / 3;
					nr = m + (nr - m) * (1 + sat); ng = m + (ng - m) * (1 + sat); nb = m + (nb - m) * (1 + sat);
				}
				if (clip && (nr > 255.5 || ng > 255.5 || nb > 255.5 || nr < -0.5 || ng < -0.5 || nb < -0.5) && (sat || add[0] || add[1] || add[2])) {
					//CS6 shows clipping as neon
					dst[i] = 0; dst[i + 1] = 255; dst[i + 2] = 0;
					continue;
				}
				dst[i] = nr; dst[i + 1] = ng; dst[i + 2] = nb;
			}
		};
	}

	/**
	 * CS6 HDR Toning (on a flattened image): Local Adaptation (Edge Glow, Tone
	 * and Detail, Advanced), Equalize Histogram, Exposure and Gamma, Highlight Compression
	 */
	hdr_toning() {
		var P = {
			'Default': { radius: 16, strength: 0.52, gamma: 1, exposure: 0, detail: 30, shadow: 0, highlight: 0, vibrance: 0, saturation: 20 },
			'Flat': { radius: 16, strength: 0.3, gamma: 1.2, exposure: 0, detail: 0, shadow: 20, highlight: -20, vibrance: 0, saturation: 0 },
			'Monochromatic': { radius: 16, strength: 0.52, gamma: 1, exposure: 0, detail: 50, shadow: 0, highlight: 0, vibrance: 0, saturation: -100 },
			'Photorealistic': { radius: 30, strength: 0.6, gamma: 1, exposure: 0, detail: 40, shadow: 10, highlight: -10, vibrance: 10, saturation: 25 },
			'Saturated': { radius: 20, strength: 0.6, gamma: 1, exposure: 0, detail: 40, shadow: 0, highlight: 0, vibrance: 40, saturation: 60 },
			'Surrealistic': { radius: 100, strength: 2, gamma: 1, exposure: 0, detail: 150, shadow: 0, highlight: 0, vibrance: 30, saturation: 40 },
		};
		var F = [
			['radius', 'Radius:', 1, 500, 1, 'px', 'edge'], ['strength', 'Strength:', 0.1, 4, 0.01, '', 'edge'],
			['gamma', 'Gamma:', 0.1, 2, 0.01, '', 'tone'], ['exposure', 'Exposure:', -5, 5, 0.01, '', 'tone'], ['detail', 'Detail:', -100, 300, 1, '%', 'tone'],
			['shadow', 'Shadow:', -100, 100, 1, '%', 'adv'], ['highlight', 'Highlight:', -100, 100, 1, '%', 'adv'], ['vibrance', 'Vibrance:', -100, 100, 1, '%', 'adv'], ['saturation', 'Saturation:', -100, 100, 1, '%', 'adv'],
		];
		var row = (f) => '<div class="ps_adj_slider" data-hdr="' + f[0] + '"><span>' + f[1] + '</span><input type="number" id="hdr_' + f[0] + '_n" min="' + f[2] + '" max="' + f[3] + '" step="' + f[4] + '"><span class="ps_adj_unit">' + f[5] + '</span>'
			+ '<input type="range" id="hdr_' + f[0] + '" min="' + f[2] + '" max="' + f[3] + '" step="' + f[4] + '"></div>';
		var group = (key, title) => '<div class="ps_hdr_group" data-group="' + key + '"><div class="ps_adj_label">' + title + '</div>' + F.filter(f => f[6] == key).map(row).join('') + '</div>';
		var html = '<div class="ps_adj_row"><span>Preset:</span><select id="hdr_preset">' + Object.keys(P).map(k => '<option>' + k + '</option>').join('') + '<option>Custom</option></select></div>'
			+ '<div class="ps_adj_row"><span>Method:</span><select id="hdr_method"><option>Local Adaptation</option><option>Equalize Histogram</option><option>Exposure and Gamma</option><option>Highlight Compression</option></select></div>'
			+ group('edge', 'Edge Glow') + group('tone', 'Tone and Detail') + group('adv', 'Advanced')
			+ '<div class="ps_hdr_group" data-group="curve"><div class="ps_adj_label">Toning Curve and Histogram</div>'
			+ '<canvas id="hdr_curve" class="ps_hdr_curve" width="200" height="200"></canvas>'
			+ '<div class="ps_adj_row"><button type="button" class="button" id="hdr_curve_reset">Reset Curve</button></div></div>';
		var open = () => this.show('HDR Toning', html, (root, state, update) => {
			Object.assign(state, P.Default, { method: 'Local Adaptation', curve: [{ x: 0, y: 0 }, { x: 255, y: 255 }] });
			//Toning Curve: points over the luminance histogram; click adds, drag moves, drag off removes
			var cv = root.querySelector('#hdr_curve'), cctx = cv.getContext('2d');
			var hist = new Float64Array(256);
			var lyr = config.layer;
			if (lyr && lyr.link) {
				var hc = document.createElement('canvas');
				hc.width = Math.min(400, lyr.width_original);
				hc.height = Math.max(1, Math.round(lyr.height_original * hc.width / lyr.width_original));
				var hctx = hc.getContext('2d', { willReadFrequently: true });
				hctx.drawImage(lyr.link, 0, 0, hc.width, hc.height);
				var hd = hctx.getImageData(0, 0, hc.width, hc.height).data;
				for (var hi = 0; hi < hd.length; hi += 4) if (hd[hi + 3] > 0) hist[Math.round(hd[hi] * 0.299 + hd[hi + 1] * 0.587 + hd[hi + 2] * 0.114)]++;
			}
			var hmax = Math.max(1, ...hist);
			var draw_curve = () => {
				var W = cv.width, H = cv.height;
				cctx.fillStyle = '#fff';
				cctx.fillRect(0, 0, W, H);
				cctx.fillStyle = '#bbb';
				for (var x = 0; x < 256; x++) { var hh = Math.sqrt(hist[x] / hmax) * H; cctx.fillRect(x * W / 256, H - hh, W / 256 + 0.5, hh); }
				cctx.strokeStyle = '#ddd';
				cctx.beginPath();
				for (var g = 1; g < 4; g++) { cctx.moveTo(g * W / 4, 0); cctx.lineTo(g * W / 4, H); cctx.moveTo(0, g * H / 4); cctx.lineTo(W, g * H / 4); }
				cctx.stroke();
				var lut = curve_lut(state.curve);
				cctx.strokeStyle = '#000';
				cctx.beginPath();
				for (x = 0; x < 256; x++) { var px = x * W / 255, py = H - lut[x] * H / 255; x ? cctx.lineTo(px, py) : cctx.moveTo(px, py); }
				cctx.stroke();
				cctx.fillStyle = '#000';
				state.curve.forEach(q => cctx.fillRect(q.x * W / 255 - 3, H - q.y * H / 255 - 3, 6, 6));
			};
			var at = (e) => { var r = cv.getBoundingClientRect(); return { x: Math.max(0, Math.min(255, (e.clientX - r.left) / r.width * 255)), y: Math.max(0, Math.min(255, (1 - (e.clientY - r.top) / r.height) * 255)) }; };
			var dragging = null;
			cv.addEventListener('mousedown', (e) => {
				var p = at(e);
				var hit = state.curve.findIndex(q => Math.abs(q.x - p.x) < 8 && Math.abs(q.y - p.y) < 8);
				if (hit < 0) { state.curve.push(p); state.curve.sort((a, b) => a.x - b.x); hit = state.curve.indexOf(p); }
				dragging = state.curve[hit];
				preset.value = 'Custom';
				draw_curve(); update();
			});
			var move = (e) => {
				if (!cv.isConnected) { window.removeEventListener('mousemove', move); return; }
				if (!dragging) return;
				var r = cv.getBoundingClientRect(), p = at(e);
				var outside = e.clientX < r.left - 20 || e.clientX > r.right + 20 || e.clientY < r.top - 20 || e.clientY > r.bottom + 20;
				var ends = dragging === state.curve[0] || dragging === state.curve[state.curve.length - 1];
				if (outside && !ends && state.curve.length > 2) { state.curve.splice(state.curve.indexOf(dragging), 1); dragging = null; }
				else { dragging.x = ends ? dragging.x : p.x; dragging.y = p.y; state.curve.sort((a, b) => a.x - b.x); }
				draw_curve(); update();
			};
			window.addEventListener('mousemove', move);
			window.addEventListener('mouseup', () => { dragging = null; });
			root.querySelector('#hdr_curve_reset').addEventListener('click', () => { state.curve = [{ x: 0, y: 0 }, { x: 255, y: 255 }]; draw_curve(); update(); });
			draw_curve();
			var refresh = () => {
				for (var f of F) {
					root.querySelector('#hdr_' + f[0]).value = root.querySelector('#hdr_' + f[0] + '_n').value = state[f[0]];
					var show = state.method == 'Local Adaptation' || (state.method == 'Exposure and Gamma' && (f[0] == 'gamma' || f[0] == 'exposure'));
					root.querySelector('[data-hdr="' + f[0] + '"]').style.display = show ? '' : 'none';
				}
				root.querySelector('[data-group="curve"]').dataset.show = state.method == 'Local Adaptation' ? '1' : '';
				root.querySelectorAll('.ps_hdr_group').forEach((g) => {
					var any = g.dataset.group == 'curve' ? !!g.dataset.show : [...g.querySelectorAll('[data-hdr]')].some(r => r.style.display != 'none');
					g.style.display = any ? '' : 'none';
				});
			};
			var preset = root.querySelector('#hdr_preset');
			for (let f of F) {
				let r = root.querySelector('#hdr_' + f[0]), n = root.querySelector('#hdr_' + f[0] + '_n');
				let set = (v) => { if (isNaN(v)) return; state[f[0]] = Math.max(f[2], Math.min(f[3], v)); r.value = n.value = state[f[0]]; preset.value = 'Custom'; update(); };
				r.addEventListener('input', () => set(parseFloat(r.value)));
				n.addEventListener('change', () => set(parseFloat(n.value)));
			}
			preset.addEventListener('change', () => { if (P[preset.value]) { Object.assign(state, P[preset.value]); refresh(); update(); } });
			root.querySelector('#hdr_method').addEventListener('change', (e) => { state.method = e.target.value; refresh(); update(); });
			refresh();
		}, (state) => this.build_hdr_toning(state), 'hdr_toning');
		//CS6 flattens the document first
		if (config.layers.length > 1) {
			if (!window.confirm('HDR Toning will flatten the document. Flatten the image?')) return;
			var res = app.GUI.modules['ps/commands'].flatten_image();
			if (res && res.then) return res.then(open);
		}
		return open();
	}

	build_hdr_toning(state) {
		return (src, dst, w, h) => {
			var n = w * h, L = new Float32Array(n);
			for (var i = 0; i < n; i++) L[i] = (src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114) / 255;
			var out = new Float32Array(n);
			var method = state.method || 'Local Adaptation';
			if (method == 'Equalize Histogram') {
				var hist = new Float64Array(256);
				for (var a = 0; a < n; a++) hist[Math.round(L[a] * 255)]++;
				for (var b = 1; b < 256; b++) hist[b] += hist[b - 1];
				for (var c = 0; c < n; c++) out[c] = hist[Math.round(L[c] * 255)] / n;
			}
			else if (method == 'Highlight Compression') {
				//the brightest values roll off smoothly instead of clipping
				for (var d = 0; d < n; d++) out[d] = L[d] * (1 + L[d] / 1.44) / (1 + L[d]) * 1.44 / 1.2;
			}
			else if (method == 'Exposure and Gamma') {
				for (var e = 0; e < n; e++) out[e] = Math.pow(Math.max(0, L[e] * Math.pow(2, state.exposure)), 1 / state.gamma);
			}
			else {
				//local adaptation: compress the blurred base, keep / boost the detail around it
				var lum = document.createElement('canvas');
				lum.width = w;
				lum.height = h;
				var lctx = lum.getContext('2d', { willReadFrequently: true });
				var img = lctx.createImageData(w, h);
				for (var f = 0; f < n; f++) { img.data[f * 4] = img.data[f * 4 + 1] = img.data[f * 4 + 2] = L[f] * 255; img.data[f * 4 + 3] = 255; }
				lctx.putImageData(img, 0, 0);
				var blur = document.createElement('canvas');
				blur.width = w;
				blur.height = h;
				var bctx = blur.getContext('2d', { willReadFrequently: true });
				//pad with the edge pixels so the blur does not darken the borders
				var r = Math.max(1, state.radius);
				bctx.filter = 'blur(' + r + 'px)';
				bctx.drawImage(lum, -r * 2, -r * 2, w + r * 4, h + r * 4);
				bctx.drawImage(lum, 0, 0);
				var B = bctx.getImageData(0, 0, w, h).data;
				var comp = 1 / (1 + state.strength), boost = (1 + state.strength) * (1 + state.detail / 100);
				var sh = state.shadow / 100, hi = state.highlight / 100;
				for (var g = 0; g < n; g++) {
					var base = B[g * 4] / 255;
					var v = 0.5 + (base - 0.5) * comp + (L[g] - base) * boost;
					v = Math.pow(Math.max(0, v * Math.pow(2, state.exposure)), 1 / state.gamma);
					if (sh) v += sh * 0.5 * Math.pow(Math.max(0, 1 - v * 2), 2);
					if (hi) v += hi * 0.5 * Math.pow(Math.max(0, v * 2 - 1), 2);
					out[g] = v;
				}
			}
			if (method == 'Local Adaptation' && state.curve && (state.curve.length > 2 || state.curve.some(q => q.x != q.y))) {
				//Toning Curve on the toned luminance
				var tl = curve_lut(state.curve);
				for (var ci = 0; ci < n; ci++) { var tv = Math.max(0, Math.min(255, out[ci] * 255)), t0 = Math.floor(tv), t1 = Math.min(255, t0 + 1); out[ci] = (tl[t0] + (tl[t1] - tl[t0]) * (tv - t0)) / 255; }
			}
			var vib = method == 'Local Adaptation' ? state.vibrance / 100 : 0, sat = method == 'Local Adaptation' ? state.saturation / 100 : 0;
			for (var k = 0; k < n; k++) {
				var o = k * 4, ratio = out[k] / Math.max(L[k], 1 / 255);
				var R = src[o] * ratio, G = src[o + 1] * ratio, Bc = src[o + 2] * ratio;
				if (L[k] < 1 / 255) R = G = Bc = out[k] * 255;
				if (vib || sat) {
					var m = (R + G + Bc) / 3, mx = Math.max(R, G, Bc), mn = Math.min(R, G, Bc);
					var cur = mx > 0 ? (mx - mn) / mx : 0;
					var amt = Math.max(-1, sat + vib * (1 - cur));
					R = m + (R - m) * (1 + amt); G = m + (G - m) * (1 + amt); Bc = m + (Bc - m) * (1 + amt);
				}
				dst[o] = R; dst[o + 1] = G; dst[o + 2] = Bc;
			}
		};
	}

	/**
	 * CS6 Color Lookup: a 3D LUT from the built-in list (procedural looks named
	 * like the CS6 presets) or a loaded .CUBE file
	 */
	color_lookup() {
		var names = Object.keys(LOOKS);
		var html = '<div class="ps_adj_row ps_clut_row"><label class="ps_adj_check"><input type="radio" name="clut_kind" checked> 3DLUT File</label><select id="clut_file"><option value="">Load 3D LUT...</option>'
			+ names.map(n => '<option>' + n + '</option>').join('') + '</select></div>'
			+ '<div class="ps_adj_row ps_clut_row"><label class="ps_adj_check"><input type="radio" name="clut_kind" disabled> Abstract</label><select disabled><option>Load Abstract Profile...</option></select></div>'
			+ '<div class="ps_adj_row ps_clut_row"><label class="ps_adj_check"><input type="radio" name="clut_kind" disabled> Device Link</label><select disabled><option>Load DeviceLink Profile...</option></select></div>'
			+ '<label class="ps_adj_check"><input type="checkbox" id="clut_dither"> Dither</label>';
		this.show('Color Lookup', html, (root, state, update) => {
			var sel = root.querySelector('#clut_file');
			var refresh = () => {
				if (state.file) {
					var opt = sel.querySelector('option[data-file]');
					if (!opt) { opt = document.createElement('option'); opt.dataset.file = '1'; sel.insertBefore(opt, sel.options[1]); }
					opt.textContent = state.file.name;
					opt.value = '__file';
					sel.value = state.look == '__file' ? '__file' : (state.look || '');
				}
				else sel.value = state.look || '';
				root.querySelector('#clut_dither').checked = !!state.dither;
			};
			sel.addEventListener('change', () => {
				if (sel.value) { state.look = sel.value; update(); return; }
				//Load 3D LUT...
				var input = document.createElement('input');
				input.type = 'file';
				input.accept = '.cube,.CUBE';
				input.addEventListener('change', () => {
					var f = input.files[0];
					if (!f) return refresh();
					f.text().then((text) => {
						var lut = parse_cube(text);
						if (!lut) { alertify.error('Could not load the 3D LUT "' + f.name + '".'); return refresh(); }
						state.file = { name: f.name, n: lut.n, data: lut.data };
						state.look = '__file';
						refresh();
						update();
					});
				});
				input.click();
				refresh();
			});
			root.querySelector('#clut_dither').addEventListener('change', (e) => { state.dither = e.target.checked; update(); });
			refresh();
		}, (state) => this.build_color_lookup(state), 'color_lookup');
	}

	build_color_lookup(state) {
		var look = state.look;
		var fn = null;
		if (look == '__file' && state.file) {
			var n = state.file.n, d = state.file.data, m = n - 1;
			fn = (r, g, b) => {
				//trilinear, red fastest (CUBE order)
				var x = r * m, y = g * m, z = b * m;
				var x0 = Math.min(m - 1, Math.floor(x)), y0 = Math.min(m - 1, Math.floor(y)), z0 = Math.min(m - 1, Math.floor(z));
				if (m == 0) x0 = y0 = z0 = 0;
				var fx = x - x0, fy = y - y0, fz = z - z0, out = [0, 0, 0];
				for (var c = 0; c < 3; c++) {
					var at = (i, j, k) => d[((k * n + j) * n + i) * 3 + c];
					var c00 = at(x0, y0, z0) * (1 - fx) + at(x0 + 1, y0, z0) * fx, c10 = at(x0, y0 + 1, z0) * (1 - fx) + at(x0 + 1, y0 + 1, z0) * fx;
					var c01 = at(x0, y0, z0 + 1) * (1 - fx) + at(x0 + 1, y0, z0 + 1) * fx, c11 = at(x0, y0 + 1, z0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1, z0 + 1) * fx;
					out[c] = (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
				}
				return out;
			};
		}
		else if (LOOKS[look]) fn = LOOKS[look];
		var dither = !!state.dither;
		return (src, dst) => {
			if (!fn) return;
			for (var i = 0; i < src.length; i += 4) {
				var o = fn(src[i] / 255, src[i + 1] / 255, src[i + 2] / 255);
				var e = dither ? Math.random() - 0.5 : 0;
				dst[i] = o[0] * 255 + e; dst[i + 1] = o[1] * 255 + e; dst[i + 2] = o[2] * 255 + e;
			}
		};
	}

	/**
	 * Image > Mode > Indexed Color (after flattening, like CS6)
	 */
	indexed_color() {
		var palettes = ['Exact', 'System (Mac OS)', 'System (Windows)', 'Web', 'Uniform', 'Local (Perceptual)', 'Local (Selective)', 'Local (Adaptive)', 'Master (Perceptual)', 'Master (Selective)', 'Master (Adaptive)', 'Custom...', 'Previous'];
		var enabled = ['Web', 'Local (Perceptual)', 'Local (Selective)', 'Local (Adaptive)'];
		var html = '<div class="ps_adj_row"><span>Palette:</span><select id="ix_palette">' + palettes.map(p => '<option' + (enabled.includes(p) ? '' : ' disabled') + (p == 'Local (Selective)' ? ' selected' : '') + '>' + p + '</option>').join('') + '</select></div>'
			+ '<div class="ps_adj_row"><span>Colors:</span><input type="number" id="ix_colors" min="2" max="256" value="256" style="width:60px"></div>'
			+ '<div class="ps_adj_row"><span>Forced:</span><select disabled><option>Black and White</option></select></div>'
			+ '<label class="ps_adj_check"><input type="checkbox" id="ix_transparency" checked> Transparency</label>'
			+ '<div class="ps_adj_label">Options</div>'
			+ '<div class="ps_adj_row"><span>Matte:</span><select disabled><option>None</option></select></div>'
			+ '<div class="ps_adj_row"><span>Dither:</span><select id="ix_dither"><option>None</option><option selected>Diffusion</option><option disabled>Pattern</option><option disabled>Noise</option></select></div>'
			+ '<div class="ps_adj_row"><span>Amount:</span><input type="number" id="ix_amount" min="0" max="100" value="75" style="width:60px"><span>%</span></div>'
			+ '<label class="ps_adj_check disabled"><input type="checkbox" disabled> Preserve Exact Colors</label>';
		var open = () => this.show('Indexed Color', html, (root, state, update) => {
			Object.assign(state, { palette: 'Local (Selective)', colors: 256, transparency: true, dither: 'Diffusion', amount: 75 });
			root.querySelector('#ix_palette').addEventListener('change', (e) => { state.palette = e.target.value; if (state.palette == 'Web') { state.colors = 216; root.querySelector('#ix_colors').value = 216; } update(); });
			root.querySelector('#ix_colors').addEventListener('change', (e) => { state.colors = Math.max(2, Math.min(256, parseInt(e.target.value) || 256)); e.target.value = state.colors; update(); });
			root.querySelector('#ix_transparency').addEventListener('change', (e) => { state.transparency = e.target.checked; update(); });
			root.querySelector('#ix_dither').addEventListener('change', (e) => { state.dither = e.target.value; root.querySelector('#ix_amount').disabled = state.dither == 'None'; update(); });
			root.querySelector('#ix_amount').addEventListener('change', (e) => { state.amount = Math.max(0, Math.min(100, parseInt(e.target.value) || 0)); update(); });
		}, (state) => (src, dst, w, h) => {
			var q = quantize(src, w, h, { colors: state.colors, transparency: state.transparency, dither: state.dither == 'None' ? 0 : state.amount,
				reduction: state.palette == 'Web' ? 'Restrictive (Web)' : (state.palette == 'Local (Perceptual)' ? 'Perceptual' : 'Selective') });
			this.last_table = q.palette.filter((c, i) => i != q.transparent);
			for (var i = 0; i < w * h; i++) {
				var o = i * 4, k = q.index[i];
				if (k == q.transparent) { dst[o + 3] = 0; continue; }
				var c = q.palette[k];
				dst[o] = c[0]; dst[o + 1] = c[1]; dst[o + 2] = c[2]; dst[o + 3] = 255;
			}
		}, 'indexed', { extra: () => [new app.Actions.Update_config_action({ ps_mode: 'Indexed', ps_color_table: this.last_table })], after: () => app.GUI.Ps_workspace.enforce_mode() });
		if (config.layers.filter(l => l.type != null).length > 1) {
			if (!window.confirm('Flatten layers?')) return;
			var res = app.GUI.modules['ps/commands'].flatten_image();
			if (res && res.then) return res.then(open);
		}
		return open();
	}

	/**
	 * Image > Mode > Bitmap (from Grayscale, like CS6): 50% Threshold, Pattern
	 * Dither, Diffusion Dither, Halftone Screen
	 */
	bitmap_mode() {
		if (config.ps_mode != 'Grayscale') {
			alertify.error('Bitmap mode conversion requires a Grayscale image (Image > Mode > Grayscale first).');
			return;
		}
		var html = '<div class="ps_adj_label">Resolution</div><div class="ps_adj_row"><span>Output:</span><input type="number" value="72" disabled style="width:60px"><span>Pixels/Inch</span></div>'
			+ '<div class="ps_adj_label">Method</div><div class="ps_adj_row"><span>Use:</span><select id="bm_method"><option>50% Threshold</option><option>Pattern Dither</option><option selected>Diffusion Dither</option><option>Halftone Screen</option><option disabled>Custom Pattern</option></select></div>'
			+ '<div class="ps_adj_row" id="bm_screen"><span>Frequency:</span><input type="number" id="bm_freq" value="12" min="2" max="64" style="width:60px"><span>px cells</span><span>Angle:</span><input type="number" id="bm_angle" value="45" style="width:50px"><span>°</span></div>';
		var open = () => this.show('Bitmap', html, (root, state, update) => {
			Object.assign(state, { method: 'Diffusion Dither', cell: 12, angle: 45 });
			var screen = root.querySelector('#bm_screen');
			var sync = () => { screen.style.display = state.method == 'Halftone Screen' ? '' : 'none'; };
			root.querySelector('#bm_method').addEventListener('change', (e) => { state.method = e.target.value; sync(); update(); });
			root.querySelector('#bm_freq').addEventListener('change', (e) => { state.cell = Math.max(2, Math.min(64, parseInt(e.target.value) || 12)); update(); });
			root.querySelector('#bm_angle').addEventListener('change', (e) => { state.angle = parseFloat(e.target.value) || 0; update(); });
			sync();
		}, (state) => (src, dst, w, h) => {
			var n = w * h, g = new Float32Array(n);
			for (var i = 0; i < n; i++) g[i] = src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114;
			var BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
			var a = state.angle * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), cell = state.cell;
			for (var y = 0; y < h; y++) {
				for (var x = 0; x < w; x++) {
					var k = y * w + x, v = g[k], on;
					if (state.method == '50% Threshold') on = v >= 128;
					else if (state.method == 'Pattern Dither') on = v > (BAYER[(y % 8) * 8 + (x % 8)] + 0.5) * 4;
					else if (state.method == 'Halftone Screen') {
						//round dots on a rotated grid; dot size follows the darkness
						var u = (x * ca + y * sa) / cell, t = (-x * sa + y * ca) / cell;
						var du = u - Math.floor(u) - 0.5, dt = t - Math.floor(t) - 0.5;
						on = Math.hypot(du, dt) * 1.42 > 1 - v / 255;
					}
					else {
						on = v >= 128;
						var e = v - (on ? 255 : 0);
						if (x + 1 < w) g[k + 1] += e * 7 / 16;
						if (y + 1 < h) {
							if (x > 0) g[k + w - 1] += e * 3 / 16;
							g[k + w] += e * 5 / 16;
							if (x + 1 < w) g[k + w + 1] += e / 16;
						}
					}
					var o = k * 4, c = on ? 255 : 0;
					dst[o] = dst[o + 1] = dst[o + 2] = c;
				}
			}
		}, 'bitmap', { extra: () => [new app.Actions.Update_config_action({ ps_mode: 'Bitmap' })], after: () => app.GUI.Ps_workspace.enforce_mode() });
		if (config.layers.filter(l => l.type != null).length > 1) {
			if (!window.confirm('Flatten layers?')) return;
			var res = app.GUI.modules['ps/commands'].flatten_image();
			if (res && res.then) return res.then(open);
		}
		return open();
	}

	/**
	 * Image > Mode > Duotone (from Grayscale): Monotone / Duotone / Tritone /
	 * Quadtone inks; the gray value is mapped through the ink colors
	 */
	duotone_mode() {
		if (config.ps_mode != 'Grayscale' && config.ps_mode != 'Duotone') {
			alertify.error('Duotone mode conversion requires a Grayscale image (Image > Mode > Grayscale first).');
			return;
		}
		var inks = [['#000000', 'Black'], ['#e85a1e', 'PANTONE 165 C'], ['#2a6db0', 'PANTONE 285 C'], ['#f2c400', 'PANTONE 116 C']];
		var html = '<div class="ps_adj_row"><span>Preset:</span><select disabled><option>Custom</option></select></div>'
			+ '<div class="ps_adj_row"><span>Type:</span><select id="dt_type"><option>Monotone</option><option selected>Duotone</option><option>Tritone</option><option>Quadtone</option></select></div>'
			+ inks.map((k, i) => '<div class="ps_adj_row" data-ink="' + i + '"><span>Ink ' + (i + 1) + ':</span><button type="button" class="ps_sfw_matte" data-ink-color="' + i + '" style="background:' + k[0] + '"></button><span>' + k[1] + '</span></div>').join('');
		var state0 = this.duotone_state || { type: 'Duotone', inks: inks.map(k => k[0]) };
		this.show('Duotone Options', html, (root, state, update) => {
			Object.assign(state, JSON.parse(JSON.stringify(state0)));
			var n = { Monotone: 1, Duotone: 2, Tritone: 3, Quadtone: 4 };
			var sync = () => root.querySelectorAll('[data-ink]').forEach(r => { r.style.display = parseInt(r.dataset.ink) < n[state.type] ? '' : 'none'; });
			root.querySelector('#dt_type').value = state.type;
			root.querySelector('#dt_type').addEventListener('change', (e) => { state.type = e.target.value; sync(); update(); });
			root.querySelectorAll('[data-ink-color]').forEach(b => {
				var i = parseInt(b.dataset.inkColor);
				b.style.background = state.inks[i];
				b.addEventListener('click', () => app.GUI.Ps_workspace.color_dialog('Ink ' + (i + 1), state.inks[i], (hex) => { state.inks[i] = hex; b.style.background = hex; update(); }));
			});
			sync();
		}, (state) => {
			this.duotone_state = JSON.parse(JSON.stringify(state));
			var n = { Monotone: 1, Duotone: 2, Tritone: 3, Quadtone: 4 }[state.type];
			var cols = state.inks.slice(0, n).map(h => [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]);
			return (src, dst) => {
				for (var i = 0; i < src.length; i += 4) {
					var d = 1 - (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255;
					//each ink multiplies paper white; the first ink takes the whole range, the others the midtones
					var r = 255, g = 255, b = 255;
					cols.forEach((c, k) => {
						var cover = k == 0 ? d : Math.max(0, Math.sin(Math.PI * d)) * 0.6;
						r *= 1 - cover * (1 - c[0] / 255); g *= 1 - cover * (1 - c[1] / 255); b *= 1 - cover * (1 - c[2] / 255);
					});
					dst[i] = r; dst[i + 1] = g; dst[i + 2] = b;
				}
			};
		}, 'duotone', { extra: () => [new app.Actions.Update_config_action({ ps_mode: 'Duotone' })], after: () => app.GUI.Ps_workspace.enforce_mode() });
	}

	/**
	 * Image > Mode > Color Table (Indexed Color mode)
	 */
	color_table() {
		var table = config.ps_color_table || [];
		var html = '<div class="ps_adj_row"><span>Table:</span><select disabled><option>Custom</option></select></div><div class="ps_ctable">'
			+ table.map(c => '<span style="background:rgb(' + c.join(',') + ')" title="' + c.join(', ') + '"></span>').join('') + '</div>';
		var POP = new Dialog_class();
		POP.show({ title: 'Color Table', className: 'ps_adjust_dialog', params: [{ function() { return '<div class="ps_adj">' + html + '</div>'; } }] });
	}

	/**
	 * one-step adjustments (no dialog in CS6): Invert, Desaturate
	 */
	direct(title, fn) {
		var job = this.begin(title);
		if (!job) return;
		this.finish(job, fn, title);
	}

	invert() {
		this.direct('Invert', (src, dst) => {
			for (var i = 0; i < src.length; i += 4) { dst[i] = 255 - src[i]; dst[i + 1] = 255 - src[i + 1]; dst[i + 2] = 255 - src[i + 2]; }
		});
	}

	desaturate() {
		//CS6 Desaturate: lightness ((max + min) / 2)
		this.direct('Desaturate', (src, dst) => {
			for (var i = 0; i < src.length; i += 4) {
				var v = (Math.max(src[i], src[i + 1], src[i + 2]) + Math.min(src[i], src[i + 1], src[i + 2])) / 2;
				dst[i] = dst[i + 1] = dst[i + 2] = v;
			}
		});
	}

	/**
	 * CS6 Black & White: six color sliders and an optional Tint
	 */
	black_white() {
		var extra = '<div class="ps_adj_row"><span>Preset:</span><select disabled><option>Default</option></select></div>';
		this.sliders('Black & White', 'black_white', [
			{ key: 'reds', label: 'Reds:', min: -200, max: 300, value: 40 },
			{ key: 'yellows', label: 'Yellows:', min: -200, max: 300, value: 60 },
			{ key: 'greens', label: 'Greens:', min: -200, max: 300, value: 40 },
			{ key: 'cyans', label: 'Cyans:', min: -200, max: 300, value: 60 },
			{ key: 'blues', label: 'Blues:', min: -200, max: 300, value: 20 },
			{ key: 'magentas', label: 'Magentas:', min: -200, max: 300, value: 80 },
		], extra, (root, state, update) => {
			root.insertAdjacentHTML('beforeend', '<label class="ps_adj_check"><input type="checkbox" id="bw_tint"> Tint</label>'
				+ '<div class="ps_adj_slider"><span>Hue:</span><input type="number" id="bw_hue_n" min="0" max="360"><span class="ps_adj_unit">°</span><input type="range" id="bw_hue" min="0" max="360"></div>'
				+ '<div class="ps_adj_slider"><span>Saturation:</span><input type="number" id="bw_sat_n" min="0" max="100"><span class="ps_adj_unit">%</span><input type="range" id="bw_sat" min="0" max="100"></div>');
			root.appendChild(root.querySelector('.ps_adj_preview'));
			state.tint = !!state.tint;
			if (state.hue == null) state.hue = 42;
			if (state.sat == null) state.sat = 20;
			var t = root.querySelector('#bw_tint');
			t.checked = state.tint;
			t.addEventListener('change', () => { state.tint = t.checked; update(); });
			[['hue', 'bw_hue'], ['sat', 'bw_sat']].forEach(([k, id]) => {
				var r = root.querySelector('#' + id), n = root.querySelector('#' + id + '_n');
				r.value = n.value = state[k];
				var set = (v) => { if (isNaN(v)) return; state[k] = v; r.value = n.value = v; update(); };
				r.addEventListener('input', () => set(parseFloat(r.value)));
				n.addEventListener('change', () => set(parseFloat(n.value)));
			});
		});
	}

	build_black_white(state) {
		var w = {
			r: (state.reds == null ? 40 : state.reds) / 100, y: (state.yellows == null ? 60 : state.yellows) / 100,
			g: (state.greens == null ? 40 : state.greens) / 100, c: (state.cyans == null ? 60 : state.cyans) / 100,
			b: (state.blues == null ? 20 : state.blues) / 100, m: (state.magentas == null ? 80 : state.magentas) / 100,
		};
		var tint = state.tint ? hsl_to_rgb((state.hue == null ? 42 : state.hue) / 360, (state.sat == null ? 20 : state.sat) / 100, 0.5) : null;
		return (src, dst) => {
			for (var i = 0; i < src.length; i += 4) {
				var r = src[i], g = src[i + 1], b = src[i + 2];
				//gray = min + (mid-min) * secondary weight + (max-mid) * primary weight
				var max = Math.max(r, g, b), min = Math.min(r, g, b), mid = r + g + b - max - min;
				var primary = max == r ? w.r : (max == g ? w.g : w.b);
				var secondary;
				if (min == b) secondary = w.y; else if (min == r) secondary = w.c; else secondary = w.m;
				var v = min + (mid - min) * secondary + (max - mid) * primary;
				v = Math.max(0, Math.min(255, v));
				if (tint) {
					//tint keeps the gray value as luminosity
					var l = v / 255;
					var tl = (tint[0] * 0.299 + tint[1] * 0.587 + tint[2] * 0.114) / 255;
					var k = tl > 0 ? l / tl : 0;
					var mixr = tint[0] * k, mixg = tint[1] * k, mixb = tint[2] * k;
					var s = (state.sat == null ? 20 : state.sat) / 100;
					dst[i] = v + (mixr - v) * s * 2; dst[i + 1] = v + (mixg - v) * s * 2; dst[i + 2] = v + (mixb - v) * s * 2;
				}
				else {
					dst[i] = dst[i + 1] = dst[i + 2] = v;
				}
			}
		};
	}

	/**
	 * CS6 Threshold: histogram and Threshold Level
	 */
	threshold() {
		var html = '<div class="ps_adj_label">Threshold Level:</div><canvas id="th_hist" width="256" height="110" class="ps_adj_hist"></canvas>'
			+ '<div class="ps_adj_slider"><span>Level:</span><input type="number" id="th_n" min="1" max="255"><span class="ps_adj_unit"></span><input type="range" id="th_r" min="1" max="255"></div>';
		this.show('Threshold', html, (root, state, update, job) => {
			if (state.level == null) state.level = 128;
			if (job && job.original) this.draw_histogram(root.querySelector('#th_hist'), this.histogram(job, 'RGB'));
			var r = root.querySelector('#th_r'), n = root.querySelector('#th_n');
			r.value = n.value = state.level;
			var set = (v) => { if (isNaN(v)) return; state.level = Math.max(1, Math.min(255, Math.round(v))); r.value = n.value = state.level; update(); };
			r.addEventListener('input', () => set(parseFloat(r.value)));
			n.addEventListener('change', () => set(parseFloat(n.value)));
		}, (state) => this.build_threshold(state), 'threshold');
	}

	build_threshold(state) {
		var level = state.level == null ? 128 : state.level;
		return (src, dst) => {
			for (var i = 0; i < src.length; i += 4) {
				var v = src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114 >= level ? 255 : 0;
				dst[i] = dst[i + 1] = dst[i + 2] = v;
			}
		};
	}

	posterize() {
		this.sliders('Posterize', 'posterize', [{ key: 'levels', label: 'Levels:', min: 2, max: 255, value: 4 }]);
	}

	build_posterize(state) {
		var n = Math.max(2, Math.min(255, state.levels || 4));
		var lut = new Uint8ClampedArray(256);
		for (var x = 0; x < 256; x++) lut[x] = Math.round(Math.round(x / 255 * (n - 1)) * 255 / (n - 1));
		return (src, dst) => {
			for (var i = 0; i < src.length; i += 4) { dst[i] = lut[src[i]]; dst[i + 1] = lut[src[i + 1]]; dst[i + 2] = lut[src[i + 2]]; }
		};
	}

	selective_color() {
		var colors = ['Reds', 'Yellows', 'Greens', 'Cyans', 'Blues', 'Magentas', 'Whites', 'Neutrals', 'Blacks'];
		var extra = '<div class="ps_adj_row"><span>Colors:</span><select id="sc_color">' + colors.map(c => '<option>' + c + '</option>').join('') + '</select></div>';
		var method = '<div class="ps_adj_row"><span>Method:</span><label class="ps_adj_check"><input type="radio" name="sc_method" value="relative"> Relative</label>'
			+ '<label class="ps_adj_check"><input type="radio" name="sc_method" value="absolute"> Absolute</label></div>';
		this.sliders('Selective Color', 'selective_color', [
			{ key: 'c', label: 'Cyan:', min: -100, max: 100, value: 0 },
			{ key: 'm', label: 'Magenta:', min: -100, max: 100, value: 0 },
			{ key: 'y', label: 'Yellow:', min: -100, max: 100, value: 0 },
			{ key: 'k', label: 'Black:', min: -100, max: 100, value: 0 },
		], extra, (root, state, update) => {
			root.insertAdjacentHTML('beforeend', method);
			//keep Preview last
			root.appendChild(root.querySelector('.ps_adj_preview'));
			state.values = state.values || {};
			colors.forEach(c => { state.values[c] = state.values[c] || [0, 0, 0, 0]; });
			state.color = state.color || 'Reds';
			state.method = state.method || 'relative';
			var keys = ['c', 'm', 'y', 'k'];
			var load = () => keys.forEach((k, i) => {
				state[k] = state.values[state.color][i];
				root.querySelector('#adj_' + k).value = root.querySelector('#adj_' + k + '_n').value = state[k];
			});
			keys.forEach((k, i) => {
				var sync = () => { state.values[state.color][i] = state[k]; update(); };
				root.querySelector('#adj_' + k).addEventListener('input', sync);
				root.querySelector('#adj_' + k + '_n').addEventListener('input', sync);
			});
			root.querySelector('#sc_color').value = state.color;
			root.querySelector('#sc_color').addEventListener('change', (e) => { state.color = e.target.value; load(); });
			root.querySelectorAll('input[name="sc_method"]').forEach((r) => {
				r.checked = r.value == state.method;
				r.addEventListener('change', () => { if (r.checked) { state.method = r.value; update(); } });
			});
			load();
		});
	}

	/**
	 * CS6 Shadows/Highlights; Show More Options adds Tone Width, Radius and the
	 * Adjustments group
	 */
	shadows_highlights() {
		var F = [
			['shadows', 'Amount:', 0, 100, 35, '%', 'Shadows'], ['s_width', 'Tone Width:', 0, 100, 50, '%', 'Shadows'], ['s_radius', 'Radius:', 0, 2500, 30, 'px', 'Shadows'],
			['highlights', 'Amount:', 0, 100, 0, '%', 'Highlights'], ['h_width', 'Tone Width:', 0, 100, 50, '%', 'Highlights'], ['h_radius', 'Radius:', 0, 2500, 30, 'px', 'Highlights'],
			['color', 'Color Correction:', -100, 100, 20, '', 'Adjustments'], ['midtone', 'Midtone Contrast:', -100, 100, 0, '', 'Adjustments'],
			['black_clip', 'Black Clip:', 0, 50, 0.01, '%', 'Adjustments'], ['white_clip', 'White Clip:', 0, 50, 0.01, '%', 'Adjustments'],
		];
		var simple = { shadows: 'Shadows Amount:', highlights: 'Highlights Amount:' };
		var html = '';
		var group = null;
		for (var f of F) {
			if (f[6] != group) {
				group = f[6];
				html += '<div class="ps_adj_label ps_sh_more">' + group + '</div>';
			}
			var step = f[0].indexOf('clip') > 0 ? 0.01 : 1;
			html += '<div class="ps_adj_slider' + (simple[f[0]] ? '' : ' ps_sh_more') + '" data-sh="' + f[0] + '"><span data-label="' + f[0] + '">' + f[1] + '</span><input type="number" id="sh_' + f[0] + '_n" min="' + f[2] + '" max="' + f[3] + '" step="' + step + '">'
				+ '<span class="ps_adj_unit">' + f[5] + '</span><input type="range" id="sh_' + f[0] + '" min="' + f[2] + '" max="' + f[3] + '" step="' + step + '"></div>';
		}
		html += '<label class="ps_adj_check ps_sh_more disabled"><input type="checkbox" disabled> Save As Defaults</label>'
			+ '<label class="ps_adj_check"><input type="checkbox" id="sh_more"> Show More Options</label>';
		this.show('Shadows/Highlights', html, (root, state, update) => {
			for (let f of F) {
				if (state[f[0]] === undefined) state[f[0]] = f[4];
				let r = root.querySelector('#sh_' + f[0]), n = root.querySelector('#sh_' + f[0] + '_n');
				r.value = n.value = state[f[0]];
				let set = (v) => { if (isNaN(v)) return; state[f[0]] = Math.max(f[2], Math.min(f[3], v)); r.value = n.value = state[f[0]]; update(); };
				r.addEventListener('input', () => set(parseFloat(r.value)));
				n.addEventListener('change', () => set(parseFloat(n.value)));
			}
			var more = root.querySelector('#sh_more');
			var layout = () => {
				root.querySelectorAll('.ps_sh_more').forEach(e => e.style.display = more.checked ? '' : 'none');
				for (var k in simple) root.querySelector('[data-label="' + k + '"]').textContent = more.checked ? 'Amount:' : simple[k];
			};
			more.addEventListener('change', layout);
			layout();
		}, (state) => this.build_shadows_highlights(state), 'shadows_highlights');
	}

	/**
	 * Equalize: redistributes brightness so the composite histogram is flat (no dialog)
	 */
	equalize() {
		var job = this.begin('Equalize');
		if (!job) {
			return;
		}
		var d = job.original.data;
		var hist = new Float64Array(256), n = 0;
		for (var i = 0; i < d.length; i += 4) {
			if (d[i + 3] == 0) continue;
			hist[d[i]]++; hist[d[i + 1]]++; hist[d[i + 2]]++;
			n += 3;
		}
		var lut = new Uint8ClampedArray(256), acc = 0;
		for (var v = 0; v < 256; v++) {
			acc += hist[v];
			lut[v] = n ? Math.round(acc / n * 255) : v;
		}
		this.finish(job, (src, dst) => {
			for (var j = 0; j < src.length; j += 4) { dst[j] = lut[src[j]]; dst[j + 1] = lut[src[j + 1]]; dst[j + 2] = lut[src[j + 2]]; }
		}, 'Equalize');
	}

	// ---------- pixel functions for the slider adjustments ----------

	build_selective_color(state) {
		var v = state.values || {};
		var get = (c) => (v[c] || [0, 0, 0, 0]).map(x => x / 100);
		var T = { Reds: get('Reds'), Yellows: get('Yellows'), Greens: get('Greens'), Cyans: get('Cyans'), Blues: get('Blues'), Magentas: get('Magentas'), Whites: get('Whites'), Neutrals: get('Neutrals'), Blacks: get('Blacks') };
		var relative = state.method != 'absolute';
		//channel value x (0..1), ink adjustment a, black adjustment k
		var change = (x, a, k) => {
			var dx = (-1 - a) * k - a;
			if (relative) dx *= 1 - x;
			return dx;
		};
		return (src, dst) => {
			var w = [];
			for (var i = 0; i < src.length; i += 4) {
				var r = src[i] / 255, g = src[i + 1] / 255, b = src[i + 2] / 255;
				var max = Math.max(r, g, b), min = Math.min(r, g, b), mid = r + g + b - max - min;
				w.length = 0;
				if (r == max) w.push([T.Reds, max - mid]);
				if (b == min) w.push([T.Yellows, mid - min]);
				if (g == max) w.push([T.Greens, max - mid]);
				if (r == min) w.push([T.Cyans, mid - min]);
				if (b == max) w.push([T.Blues, max - mid]);
				if (g == min) w.push([T.Magentas, mid - min]);
				if (min > 0.5) w.push([T.Whites, (min - 0.5) * 2]);
				if (max < 0.5) w.push([T.Blacks, (0.5 - max) * 2]);
				if (max > 0 && min < 1) w.push([T.Neutrals, 1 - (Math.abs(max - 0.5) + Math.abs(min - 0.5))]);
				var nr = r, ng = g, nb = b;
				for (var [t, amount] of w) {
					if (amount <= 0 || (!t[0] && !t[1] && !t[2] && !t[3])) continue;
					nr += change(r, t[0], t[3]) * amount;
					ng += change(g, t[1], t[3]) * amount;
					nb += change(b, t[2], t[3]) * amount;
				}
				dst[i] = nr * 255; dst[i + 1] = ng * 255; dst[i + 2] = nb * 255;
			}
		};
	}

	build_shadows_highlights(state) {
		var v = (k, d) => state[k] == null ? d : state[k];
		var sa = v('shadows', 35) / 100, ha = v('highlights', 0) / 100;
		var sw = Math.max(0.01, v('s_width', 50) / 100), hw = Math.max(0.01, v('h_width', 50) / 100);
		var sr = v('s_radius', 30), hr = v('h_radius', 30);
		var cc = v('color', 20) / 100, mc = v('midtone', 0) / 100;
		var bclip = v('black_clip', 0.01) / 100, wclip = v('white_clip', 0.01) / 100;
		//local brightness: blurred luminance at a radius
		var local = (src, w, h, radius) => {
			var lum = document.createElement('canvas');
			lum.width = w;
			lum.height = h;
			var lctx = lum.getContext('2d', { willReadFrequently: true });
			var img = lctx.createImageData(w, h);
			for (var i = 0; i < src.length; i += 4) {
				var l = src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114;
				img.data[i] = img.data[i + 1] = img.data[i + 2] = l;
				img.data[i + 3] = 255;
			}
			lctx.putImageData(img, 0, 0);
			if (radius < 0.5) return img.data;
			var blur = document.createElement('canvas');
			blur.width = w;
			blur.height = h;
			var bctx = blur.getContext('2d', { willReadFrequently: true });
			bctx.filter = 'blur(' + radius + 'px)';
			bctx.drawImage(lum, 0, 0);
			return bctx.getImageData(0, 0, w, h).data;
		};
		return (src, dst, w, h) => {
			var BS = sa > 0 ? local(src, w, h, sr) : null;
			var BH = ha > 0 ? (hr == sr && BS ? BS : local(src, w, h, hr)) : null;
			for (var j = 0; j < src.length; j += 4) {
				var ws = BS ? Math.max(0, 1 - BS[j] / 255 / sw) : 0;
				var wh = BH ? Math.max(0, (BH[j] / 255 - (1 - hw)) / hw) : 0;
				var gs = 1 / (1 + sa * ws * 2.5), gh = 1 / (1 + ha * wh * 2.5);
				var l0 = (src[j] * 0.299 + src[j + 1] * 0.587 + src[j + 2] * 0.114) / 255;
				var out = [0, 0, 0];
				for (var c = 0; c < 3; c++) {
					var x = src[j + c] / 255;
					if (ws > 0 && sa > 0) x = Math.pow(x, gs);
					if (wh > 0 && ha > 0) x = 1 - Math.pow(1 - x, gh);
					out[c] = x;
				}
				var l1 = out[0] * 0.299 + out[1] * 0.587 + out[2] * 0.114;
				//Color Correction: saturation in the changed areas
				var changed = Math.min(1, Math.abs(l1 - l0) * 4);
				if (cc && changed > 0) {
					var f = 1 + cc * changed;
					for (var c2 = 0; c2 < 3; c2++) out[c2] = l1 + (out[c2] - l1) * f;
				}
				//Midtone Contrast
				if (mc) {
					for (var c3 = 0; c3 < 3; c3++) {
						var y = out[c3];
						out[c3] = y + (y - 0.5) * mc * (1 - Math.abs(2 * y - 1));
					}
				}
				dst[j] = out[0] * 255; dst[j + 1] = out[1] * 255; dst[j + 2] = out[2] * 255;
			}
			//Black Clip / White Clip: the given share of pixels becomes black / white
			if (bclip > 0.0001 || wclip > 0.0001) {
				var hist = new Uint32Array(256), n = 0;
				for (var q = 0; q < dst.length; q += 4) {
					if (src[q + 3] == 0) continue;
					hist[Math.max(0, Math.min(255, Math.round(dst[q] * 0.299 + dst[q + 1] * 0.587 + dst[q + 2] * 0.114)))]++;
					n++;
				}
				var lo = 0, hi = 255, acc = 0;
				while (lo < 254 && (acc += hist[lo]) <= n * bclip) lo++;
				acc = 0;
				while (hi > lo + 1 && (acc += hist[hi]) <= n * wclip) hi--;
				if (lo > 0 || hi < 255) {
					var scale = 255 / Math.max(1, hi - lo);
					for (var z = 0; z < dst.length; z += 4) {
						dst[z] = (dst[z] - lo) * scale; dst[z + 1] = (dst[z + 1] - lo) * scale; dst[z + 2] = (dst[z + 2] - lo) * scale;
					}
				}
			}
		};
	}

	build_exposure(state) {
		var lut = new Uint8ClampedArray(256);
		var mult = Math.pow(2, state.exposure || 0), off = state.offset || 0, g = 1 / Math.max(0.01, state.gamma || 1);
		for (var x = 0; x < 256; x++) {
			var v = Math.max(0, x / 255 * mult + off);
			lut[x] = Math.pow(v, g) * 255;
		}
		return (src, dst) => {
			for (var i = 0; i < src.length; i += 4) { dst[i] = lut[src[i]]; dst[i + 1] = lut[src[i + 1]]; dst[i + 2] = lut[src[i + 2]]; }
		};
	}

	build_vibrance(state) {
		var vib = (state.vibrance || 0) / 100, sat = (state.saturation || 0) / 100;
		return (src, dst) => {
			for (var i = 0; i < src.length; i += 4) {
				var r = src[i], g = src[i + 1], b = src[i + 2];
				var max = Math.max(r, g, b), min = Math.min(r, g, b);
				var avg = (r + g + b) / 3;
				var s_now = max == 0 ? 0 : (max - min) / max;
				//vibrance: stronger on low-saturated pixels
				var amount = sat + vib * (1 - s_now) * (vib > 0 ? 1.5 : 1);
				dst[i] = r + (r - avg) * amount;
				dst[i + 1] = g + (g - avg) * amount;
				dst[i + 2] = b + (b - avg) * amount;
			}
		};
	}

	build_color_balance(state) {
		var tones = state.tones || { Shadows: [0, 0, 0], Midtones: [0, 0, 0], Highlights: [0, 0, 0] };
		var preserve = state.preserve !== false;
		return (src, dst) => {
			for (var i = 0; i < src.length; i += 4) {
				var r = src[i], g = src[i + 1], b = src[i + 2];
				var l = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
				var ws = Math.max(0, 1 - l * 2.5) , wh = Math.max(0, l * 2.5 - 1.5), wm = Math.max(0, 1 - Math.abs(l - 0.5) * 2.2);
				var dr = 0, dg = 0, db = 0;
				for (var [t, w] of [['Shadows', ws], ['Midtones', wm], ['Highlights', wh]]) {
					var v = tones[t];
					dr += v[0] * w; dg += v[1] * w; db += v[2] * w;
				}
				var nr = r + dr * 0.6, ng = g + dg * 0.6, nb = b + db * 0.6;
				if (preserve) {
					var nl = (nr * 0.299 + ng * 0.587 + nb * 0.114) / 255;
					var k = nl > 0 ? l / nl : 1;
					nr *= k; ng *= k; nb *= k;
				}
				dst[i] = nr; dst[i + 1] = ng; dst[i + 2] = nb;
			}
		};
	}

	build_photo_filter(state) {
		var hex = state.color || '#ec8a00';
		var fr = parseInt(hex.substr(1, 2), 16), fg = parseInt(hex.substr(3, 2), 16), fb = parseInt(hex.substr(5, 2), 16);
		var d = (state.density == null ? 25 : state.density) / 100;
		var preserve = state.preserve !== false;
		return (src, dst) => {
			for (var i = 0; i < src.length; i += 4) {
				var r = src[i], g = src[i + 1], b = src[i + 2];
				var nr = r * (1 - d) + (r * fr / 255) * d * 1 + fr * d * 0.3;
				var ng = g * (1 - d) + (g * fg / 255) * d * 1 + fg * d * 0.3;
				var nb = b * (1 - d) + (b * fb / 255) * d * 1 + fb * d * 0.3;
				if (preserve) {
					var l0 = r * 0.299 + g * 0.587 + b * 0.114, l1 = nr * 0.299 + ng * 0.587 + nb * 0.114;
					var k = l1 > 0 ? l0 / l1 : 1;
					nr *= k; ng *= k; nb *= k;
				}
				dst[i] = nr; dst[i + 1] = ng; dst[i + 2] = nb;
			}
		};
	}

	build_channel_mixer(state) {
		var m = state.matrix || { Red: [100, 0, 0, 0], Green: [0, 100, 0, 0], Blue: [0, 0, 100, 0] };
		var rows = [m.Red, m.Green, m.Blue];
		return (src, dst) => {
			for (var i = 0; i < src.length; i += 4) {
				var r = src[i], g = src[i + 1], b = src[i + 2];
				for (var c = 0; c < 3; c++) {
					var row = rows[c];
					dst[i + c] = (r * row[0] + g * row[1] + b * row[2]) / 100 + row[3] * 2.55;
				}
			}
		};
	}

	build_gradient_map(state) {
		//the gradient's colors along the luminosity (its transparency is not used)
		var L = gradient_lut(state.gradient || two_color(state.c1, state.c2), !!state.reverse);
		var dither = !!state.dither;
		return (src, dst) => {
			for (var i = 0; i < src.length; i += 4) {
				var l = src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114;
				if (dither) l += Math.random() - 0.5;
				var k = (l < 0 ? 0 : (l > 255 ? 255 : Math.round(l))) * 4;
				dst[i] = L[k];
				dst[i + 1] = L[k + 1];
				dst[i + 2] = L[k + 2];
			}
		};
	}
}

export default Ps_adjust_class;
