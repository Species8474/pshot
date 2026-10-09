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

	show(title, html, setup, build_fn) {
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
			state.values = {};
			for (var c in channels) state.values[c] = { ib: 0, g: 1, iw: 255, ob: 0, ow: 255 };
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
		}, (state) => {
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
		});
	}

	// ---------- Curves ----------

	curves() {
		var html = '<div class="ps_adj_row"><span>Channel:</span><select id="cv_channel"><option>RGB</option><option>Red</option><option>Green</option><option>Blue</option></select></div>'
			+ '<canvas id="cv_graph" width="256" height="256" class="ps_adj_curve"></canvas>'
			+ '<div class="ps_adj_pair"><span>Output: <b id="cv_out">-</b></span><span>Input: <b id="cv_in">-</b></span></div>'
			+ '<div class="ps_adj_hint">Click to add a point, drag to move it, drag it off the graph to remove it.</div>';
		this.show('Curves', html, (root, state, update, job) => {
			state.points = {};
			for (var c of ['RGB', 'Red', 'Green', 'Blue']) state.points[c] = [{ x: 0, y: 0 }, { x: 255, y: 255 }];
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
		}, (state) => {
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
		});
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
			state.h = 0; state.s = 0; state.l = 0; state.colorize = false;
			for (let [id, key] of [['hs_hue', 'h'], ['hs_sat', 's'], ['hs_light', 'l']]) {
				var range = root.querySelector('#' + id), num = root.querySelector('#' + id + '_n');
				var set = (v) => { state[key] = v; range.value = v; num.value = v; update(); };
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
		}, (state) => {
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
		});
	}

	// ---------- Brightness/Contrast ----------

	brightness_contrast() {
		var row = (id, label, min, max) => '<div class="ps_adj_slider"><span>' + label + '</span><input type="number" id="' + id + '_n" value="0" min="' + min + '" max="' + max + '">'
			+ '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" value="0"></div>';
		var html = row('bc_b', 'Brightness:', -150, 150) + row('bc_c', 'Contrast:', -50, 100)
			+ '<label class="ps_adj_check"><input type="checkbox" id="bc_legacy"> Use Legacy</label>';
		this.show('Brightness/Contrast', html, (root, state, update) => {
			state.b = 0; state.c = 0; state.legacy = false;
			for (let [id, key] of [['bc_b', 'b'], ['bc_c', 'c']]) {
				var range = root.querySelector('#' + id), num = root.querySelector('#' + id + '_n');
				var set = (v) => { state[key] = v; range.value = v; num.value = v; update(); };
				range.addEventListener('input', () => set(parseInt(range.value)));
				num.addEventListener('input', () => { var v = parseInt(num.value); if (!isNaN(v)) set(v); });
			}
			root.querySelector('#bc_legacy').addEventListener('change', (e) => { state.legacy = e.target.checked; update(); });
		}, (state) => {
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
		});
	}
}

export default Ps_adjust_class;
