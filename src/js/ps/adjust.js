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

class Ps_adjust_class {

	/**
	 * prepares the active layer for an adjustment; returns null when impossible
	 */
	begin(title) {
		ensure_pixel_layer();
		var layer = config.layer;
		if (!layer || layer.type != 'image' || !layer.link) {
			alertify.error('Could not complete the ' + title + ' command because the active layer is not a pixel layer.');
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
		fn(job.original.data, out.data);
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

	finish(job, fn, title) {
		delete job.layer.link_canvas;
		var canvas = this.render(job, fn);
		app.State.do_action(new app.Actions.Bundle_action('adjust', title, [
			new app.Actions.Update_layer_image_action(canvas, job.layer.id),
		]));
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

	show(title, html, setup, build_fn, kind) {
		if (this.layer_mode) {
			return this.show_for_layer(title, html, setup, kind);
		}
		var POP = new Dialog_class();
		var job = this.begin(title);
		if (!job) {
			return;
		}
		var _this = this;
		var state = {};
		POP.show({
			title: title,
			className: 'ps_adjust_dialog',
			params: [{ function() { return '<div class="ps_adj">' + html + '<label class="ps_adj_preview"><input type="checkbox" id="ps_adj_preview" checked> Preview</label></div>'; } }],
			on_finish() {
				_this.finish(job, build_fn(state), title);
			},
			on_cancel() {
				_this.cancel(job);
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
		var html = '<div class="ps_adj_row"><span>Preset:</span><select disabled><option>Default</option></select></div>'
			+ '<div class="ps_adj_row"><select disabled><option>Master</option></select></div>'
			+ row('hs_hue', 'Hue:', -180, 180) + row('hs_sat', 'Saturation:', -100, 100) + row('hs_light', 'Lightness:', -100, 100)
			+ '<label class="ps_adj_check"><input type="checkbox" id="hs_colorize"> Colorize</label>';
		this.show('Hue/Saturation', html, (root, state, update) => {
			state.h = state.h || 0; state.s = state.s || 0; state.l = state.l || 0; state.colorize = !!state.colorize;
			root.querySelector('#hs_colorize').checked = state.colorize;
			for (let [id, key] of [['hs_hue', 'h'], ['hs_sat', 's'], ['hs_light', 'l']]) {
				let range = root.querySelector('#' + id), num = root.querySelector('#' + id + '_n');
				range.value = num.value = state[key];
				let set = (v) => { state[key] = v; range.value = v; num.value = v; update(); };
				range.addEventListener('input', () => set(parseInt(range.value)));
				num.addEventListener('input', () => { var v = parseInt(num.value); if (!isNaN(v)) set(v); });
			}
			root.querySelector('#hs_colorize').addEventListener('change', (e) => {
				state.colorize = e.target.checked;
				if (state.colorize && state.s == 0) {
					state.s = 25;
					root.querySelector('#hs_sat').value = 25;
					root.querySelector('#hs_sat_n').value = 25;
				}
				update();
			});
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
			var dh = state.h / 360, ds = state.s / 100, dl = state.l / 100, colorize = state.colorize;
			return (src, dst) => {
				for (var i = 0; i < src.length; i += 4) {
					var hsl = rgb_to_hsl(src[i], src[i + 1], src[i + 2]);
					var h = hsl[0], s = hsl[1], l = hsl[2];
					if (colorize) {
						h = ((state.h + 360) % 360) / 360;
						s = clamp(state.s / 100, 0, 1);
					}
					else {
						h = (h + dh + 1) % 1;
						s = ds > 0 ? s + (1 - s) * ds : s * (1 + ds);
					}
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
		var extra = '<div class="ps_adj_row"><span>Gradient:</span><span class="ps_adj_gradient" id="gm_preview"></span></div>'
			+ '<label class="ps_adj_check"><input type="checkbox" id="gm_reverse"> Reverse</label>';
		this.show('Gradient Map', extra, (root, state, update) => {
			state.c1 = state.c1 || config.COLOR;
			state.c2 = state.c2 || config.BG_COLOR;
			state.reverse = !!state.reverse;
			var paint = () => { root.querySelector('#gm_preview').style.background = 'linear-gradient(90deg,' + (state.reverse ? state.c2 : state.c1) + ',' + (state.reverse ? state.c1 : state.c2) + ')'; };
			root.querySelector('#gm_reverse').checked = state.reverse;
			root.querySelector('#gm_reverse').addEventListener('change', (e) => { state.reverse = e.target.checked; paint(); update(); });
			paint();
		}, (state) => this.build_gradient_map(state), 'gradient_map');
	}

	// ---------- pixel functions for the slider adjustments ----------

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
		var c1 = state.reverse ? state.c2 : state.c1, c2 = state.reverse ? state.c1 : state.c2;
		c1 = c1 || '#000000';
		c2 = c2 || '#ffffff';
		var a = [parseInt(c1.substr(1, 2), 16), parseInt(c1.substr(3, 2), 16), parseInt(c1.substr(5, 2), 16)];
		var b = [parseInt(c2.substr(1, 2), 16), parseInt(c2.substr(3, 2), 16), parseInt(c2.substr(5, 2), 16)];
		return (src, dst) => {
			for (var i = 0; i < src.length; i += 4) {
				var l = (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255;
				dst[i] = a[0] + (b[0] - a[0]) * l;
				dst[i + 1] = a[1] + (b[1] - a[1]) * l;
				dst[i + 2] = a[2] + (b[2] - a[2]) * l;
			}
		};
	}
}

export default Ps_adjust_class;
