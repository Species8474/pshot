/*
 * pshot - CS6 filters with their CS6 dialogs (live preview on the canvas,
 * selection respected). Ctrl+F repeats the last one with the same settings.
 *
 * Each filter is a pixel function (src, dst, w, h) over RGBA arrays, run
 * through the adjustment dialog machinery in ps/adjust.js.
 */

import app from './../../app.js';
import config from './../../config.js';

function canvas_of(src, w, h) {
	var c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(src), w, h), 0, 0);
	return c;
}

/**
 * draw `src` (canvas) through a canvas filter with its edge pixels extended,
 * so edges don't fade to transparent (Photoshop repeats edge pixels)
 */
function filtered(src, w, h, filter, pad) {
	pad = Math.ceil(pad);
	var big = document.createElement('canvas');
	big.width = w + pad * 2;
	big.height = h + pad * 2;
	var b = big.getContext('2d');
	b.drawImage(src, pad, pad);
	if (pad > 0) {
		b.drawImage(src, 0, 0, w, 1, pad, 0, w, pad);
		b.drawImage(src, 0, h - 1, w, 1, pad, h + pad, w, pad);
		b.drawImage(big, pad, 0, 1, h + pad * 2, 0, 0, pad, h + pad * 2);
		b.drawImage(big, w + pad - 1, 0, 1, h + pad * 2, w + pad, 0, pad, h + pad * 2);
	}
	var out = document.createElement('canvas');
	out.width = big.width;
	out.height = big.height;
	var o = out.getContext('2d', { willReadFrequently: true });
	if (typeof filter == 'function') filter(o, big);
	else {
		o.filter = filter;
		o.drawImage(big, 0, 0);
	}
	return o.getImageData(pad, pad, w, h).data;
}

function gaussian(src, w, h, radius) {
	if (radius <= 0) return new Uint8ClampedArray(src);
	return filtered(canvas_of(src, w, h), w, h, 'blur(' + radius + 'px)', radius * 3);
}

function gauss_random() {
	var u = 1 - Math.random(), v = Math.random();
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sample(src, w, h, x, y, out, o) {
	//bilinear, edge clamped
	x = Math.max(0, Math.min(w - 1.001, x));
	y = Math.max(0, Math.min(h - 1.001, y));
	var x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
	var i00 = (y0 * w + x0) * 4, i10 = i00 + 4, i01 = i00 + w * 4, i11 = i01 + 4;
	for (var c = 0; c < 4; c++) {
		var top = src[i00 + c] + (src[i10 + c] - src[i00 + c]) * fx;
		var bot = src[i01 + c] + (src[i11 + c] - src[i01 + c]) * fx;
		out[o + c] = top + (bot - top) * fy;
	}
}

/**
 * radial distortion around the center: fn(r_norm, angle) -> [r_norm, angle] source
 */
function distort(src, dst, w, h, fn) {
	var cx = w / 2, cy = h / 2, R = Math.min(cx, cy);
	for (var y = 0; y < h; y++) {
		for (var x = 0; x < w; x++) {
			var dx = x + 0.5 - cx, dy = y + 0.5 - cy;
			var r = Math.hypot(dx, dy) / R, a = Math.atan2(dy, dx);
			var o = (y * w + x) * 4;
			if (r >= 1) continue;
			var s = fn(r, a);
			sample(src, w, h, cx + Math.cos(s[1]) * s[0] * R - 0.5, cy + Math.sin(s[1]) * s[0] * R - 0.5, dst, o);
		}
	}
}

/**
 * per-channel rank filter in a (2r+1)^2 window with a sliding histogram
 * rank: 0 = minimum, 0.5 = median, 1 = maximum
 */
function rank_filter(src, dst, w, h, r, rank) {
	r = Math.max(1, Math.round(r));
	var hist = new Uint32Array(256);
	for (var c = 0; c < 4; c++) {
		if (c == 3 && rank == 0.5) {
			for (var i = 3; i < src.length; i += 4) dst[i] = src[i];
			continue;
		}
		for (var y = 0; y < h; y++) {
			hist.fill(0);
			var n = 0;
			var y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
			for (var yy = y0; yy <= y1; yy++) {
				for (var xx = 0; xx <= Math.min(w - 1, r); xx++) { hist[src[(yy * w + xx) * 4 + c]]++; n++; }
			}
			for (var x = 0; x < w; x++) {
				if (x > 0) {
					var xo = x - r - 1, xi = x + r;
					for (var y2 = y0; y2 <= y1; y2++) {
						if (xo >= 0) { hist[src[(y2 * w + xo) * 4 + c]]--; n--; }
						if (xi < w) { hist[src[(y2 * w + xi) * 4 + c]]++; n++; }
					}
				}
				var target = Math.min(n - 1, Math.floor((n - 1) * rank)), acc = 0, v = 0;
				for (v = 0; v < 256; v++) { acc += hist[v]; if (acc > target) break; }
				dst[(y * w + x) * 4 + c] = v;
			}
		}
	}
}

//value noise fBm in 0..1 (Clouds)
function clouds(w, h, seed) {
	var rnd = (i, j) => {
		var n = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453;
		return n - Math.floor(n);
	};
	var smooth = (t) => t * t * (3 - 2 * t);
	var noise = (x, y) => {
		var i = Math.floor(x), j = Math.floor(y), fx = smooth(x - i), fy = smooth(y - j);
		var a = rnd(i, j), b = rnd(i + 1, j), c = rnd(i, j + 1), d = rnd(i + 1, j + 1);
		return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
	};
	var out = new Float32Array(w * h);
	var base = 128;
	for (var y = 0; y < h; y++) {
		for (var x = 0; x < w; x++) {
			var v = 0, amp = 0.5, f = 1 / base;
			for (var o = 0; o < 6; o++) { v += noise(x * f, y * f) * amp; amp /= 2; f *= 2; }
			out[y * w + x] = v / 0.984;
		}
	}
	return out;
}

function hex(c) {
	return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)];
}

class Ps_filters_class {

	constructor() {
		this.last = null;
	}

	adjust() {
		return app.GUI.modules['ps/commands'].Adjust;
	}

	/**
	 * fields: [{ key, label, min, max, step, value, unit }] or { key, label, type: 'select'|'check'|'radio', values, value }
	 */
	dialog(key, title, fields, build) {
		this.builders = this.builders || {};
		this.builders[key] = { title: title, build: build, fields: fields };
		if (this.silent) return;
		var defaults = {};
		fields.forEach(f => { defaults[f.key] = f.value; });
		var saved = (this.saved = this.saved || {})[key];
		var html = fields.map((f) => {
			if (f.type == 'select') {
				return '<div class="ps_adj_row"><span>' + f.label + '</span><select data-key="' + f.key + '">' + f.values.map(v => '<option>' + v + '</option>').join('') + '</select></div>';
			}
			if (f.type == 'radio') {
				return '<div class="ps_adj_row ps_adj_radios"><span>' + f.label + '</span>' + f.values.map(v => '<label class="ps_adj_check"><input type="radio" name="flt_' + f.key + '" data-key="' + f.key + '" value="' + v + '"> ' + v + '</label>').join('') + '</div>';
			}
			if (f.type == 'check') {
				return '<label class="ps_adj_check"><input type="checkbox" data-key="' + f.key + '"> ' + f.label + '</label>';
			}
			return '<div class="ps_adj_slider"><span>' + f.label + '</span><input type="number" data-num="' + f.key + '" min="' + f.min + '" max="' + f.max + '" step="' + (f.step || 1) + '">'
				+ (f.unit ? '<span class="ps_adj_unit">' + f.unit + '</span>' : '')
				+ '<input type="range" data-range="' + f.key + '" min="' + f.min + '" max="' + f.max + '" step="' + (f.step || 1) + '"></div>';
		}).join('');
		var adjust = this.adjust();
		adjust.show(title, html, (root, state, update) => {
			Object.assign(state, defaults, saved || {});
			fields.forEach((f) => {
				if (f.type == 'select') {
					var sel = root.querySelector('[data-key="' + f.key + '"]');
					sel.value = state[f.key];
					sel.addEventListener('change', () => { state[f.key] = sel.value; update(); });
				}
				else if (f.type == 'radio') {
					root.querySelectorAll('[data-key="' + f.key + '"]').forEach((r) => {
						r.checked = r.value == state[f.key];
						r.addEventListener('change', () => { if (r.checked) { state[f.key] = r.value; update(); } });
					});
				}
				else if (f.type == 'check') {
					var cb = root.querySelector('[data-key="' + f.key + '"]');
					cb.checked = !!state[f.key];
					cb.addEventListener('change', () => { state[f.key] = cb.checked; update(); });
				}
				else {
					var num = root.querySelector('[data-num="' + f.key + '"]'), range = root.querySelector('[data-range="' + f.key + '"]');
					num.value = range.value = state[f.key];
					var set = (v) => { if (isNaN(v)) return; state[f.key] = Math.max(f.min, Math.min(f.max, v)); range.value = num.value = state[f.key]; update(); };
					range.addEventListener('input', () => set(parseFloat(range.value)));
					num.addEventListener('change', () => set(parseFloat(num.value)));
				}
			});
		}, (state) => {
			this.saved[key] = Object.assign({}, state);
			this.last = { key: key, title: title, build: build };
			return build(state);
		}, key);
	}

	/**
	 * Actions playback: a filter with given settings, no dialog
	 */
	apply_settings(key, settings) {
		this.builders = this.builders || {};
		if (!this.builders[key] && typeof this[key] == 'function') {
			this.silent = true;
			try { this[key](); } finally { this.silent = false; }
		}
		var b = this.builders[key];
		if (!b) return false;
		var state = {};
		b.fields.forEach(f => { state[f.key] = f.value; });
		Object.assign(state, settings);
		var adjust = this.adjust();
		var job = adjust.begin(b.title);
		if (!job) return true;
		adjust.finish(job, b.build(state), b.title);
		return true;
	}

	/**
	 * Ctrl+F: the last filter again, same settings, no dialog
	 */
	repeat() {
		if (!this.last) return false;
		var adjust = this.adjust();
		var job = adjust.begin(this.last.title);
		if (!job) return true;
		adjust.finish(job, this.last.build(this.saved[this.last.key]), this.last.title);
		return true;
	}

	/**
	 * filters without a dialog (Average, Clouds, ...)
	 */
	direct(key, title, fn) {
		var adjust = this.adjust();
		var job = adjust.begin(title);
		if (!job) return;
		this.last = { key: key, title: title, build: () => fn };
		this.saved = this.saved || {};
		adjust.finish(job, fn, title);
	}

	// ---------- Blur ----------

	gaussian_blur() {
		this.dialog('gaussian_blur', 'Gaussian Blur', [{ key: 'radius', label: 'Radius:', min: 0.1, max: 250, step: 0.1, value: 1, unit: 'Pixels' }],
			(s) => (src, dst, w, h) => dst.set(gaussian(src, w, h, s.radius)));
	}

	motion_blur() {
		this.dialog('motion_blur', 'Motion Blur', [
			{ key: 'angle', label: 'Angle:', min: -360, max: 360, value: 0, unit: '°' },
			{ key: 'distance', label: 'Distance:', min: 1, max: 999, value: 10, unit: 'Pixels' },
		], (s) => (src, dst, w, h) => {
			var a = s.angle * Math.PI / 180, d = s.distance;
			var n = Math.max(2, Math.min(64, Math.round(d)));
			dst.set(filtered(canvas_of(src, w, h), w, h, (o, big) => {
				o.globalCompositeOperation = 'lighter';
				o.globalAlpha = 1 / n;
				for (var i = 0; i < n; i++) {
					var t = (i / (n - 1) - 0.5) * d;
					o.drawImage(big, Math.cos(a) * t, -Math.sin(a) * t);
				}
			}, d));
		});
	}

	average() {
		this.direct('average', 'Average', (src, dst) => {
			var sum = [0, 0, 0], n = 0;
			for (var i = 0; i < src.length; i += 4) {
				if (src[i + 3] == 0) continue;
				sum[0] += src[i]; sum[1] += src[i + 1]; sum[2] += src[i + 2]; n++;
			}
			if (!n) return;
			for (var j = 0; j < dst.length; j += 4) {
				if (src[j + 3] == 0) continue;
				dst[j] = sum[0] / n; dst[j + 1] = sum[1] / n; dst[j + 2] = sum[2] / n;
			}
		});
	}

	// ---------- Sharpen ----------

	unsharp_mask() {
		this.dialog('unsharp_mask', 'Unsharp Mask', [
			{ key: 'amount', label: 'Amount:', min: 1, max: 500, value: 50, unit: '%' },
			{ key: 'radius', label: 'Radius:', min: 0.1, max: 1000, step: 0.1, value: 1, unit: 'Pixels' },
			{ key: 'threshold', label: 'Threshold:', min: 0, max: 255, value: 0, unit: 'levels' },
		], (s) => (src, dst, w, h) => {
			var blur = gaussian(src, w, h, s.radius), k = s.amount / 100;
			for (var i = 0; i < src.length; i += 4) {
				for (var c = 0; c < 3; c++) {
					var diff = src[i + c] - blur[i + c];
					if (Math.abs(diff) >= s.threshold) dst[i + c] = src[i + c] + diff * k;
				}
			}
		});
	}

	smart_sharpen() {
		this.dialog('smart_sharpen', 'Smart Sharpen', [
			{ key: 'amount', label: 'Amount:', min: 1, max: 500, value: 100, unit: '%' },
			{ key: 'radius', label: 'Radius:', min: 0.1, max: 64, step: 0.1, value: 1, unit: 'px' },
			{ key: 'remove', label: 'Remove:', type: 'select', values: ['Gaussian Blur', 'Lens Blur', 'Motion Blur'], value: 'Gaussian Blur' },
		], (s) => (src, dst, w, h) => {
			//sharpen the luminosity only (avoids color fringes)
			var blur = gaussian(src, w, h, s.radius), k = s.amount / 100;
			for (var i = 0; i < src.length; i += 4) {
				var l0 = src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114;
				var l1 = blur[i] * 0.299 + blur[i + 1] * 0.587 + blur[i + 2] * 0.114;
				var d = (l0 - l1) * k;
				dst[i] = src[i] + d; dst[i + 1] = src[i + 1] + d; dst[i + 2] = src[i + 2] + d;
			}
		});
	}

	// ---------- Noise ----------

	add_noise() {
		this.dialog('add_noise', 'Add Noise', [
			{ key: 'amount', label: 'Amount:', min: 0.1, max: 400, step: 0.1, value: 12.5, unit: '%' },
			{ key: 'distribution', label: 'Distribution:', type: 'radio', values: ['Uniform', 'Gaussian'], value: 'Uniform' },
			{ key: 'mono', label: 'Monochromatic', type: 'check', value: false },
		], (s) => {
			var amp = s.amount / 100 * 255;
			var noise = s.distribution == 'Gaussian' ? () => gauss_random() * amp * 0.5 : () => (Math.random() * 2 - 1) * amp * 0.5;
			return (src, dst) => {
				for (var i = 0; i < src.length; i += 4) {
					if (s.mono) {
						var n = noise();
						dst[i] = src[i] + n; dst[i + 1] = src[i + 1] + n; dst[i + 2] = src[i + 2] + n;
					}
					else {
						dst[i] = src[i] + noise(); dst[i + 1] = src[i + 1] + noise(); dst[i + 2] = src[i + 2] + noise();
					}
				}
			};
		});
	}

	median() {
		this.dialog('median', 'Median', [{ key: 'radius', label: 'Radius:', min: 1, max: 100, value: 1, unit: 'Pixels' }],
			(s) => (src, dst, w, h) => rank_filter(src, dst, w, h, s.radius, 0.5));
	}

	dust_scratches() {
		this.dialog('dust_scratches', 'Dust & Scratches', [
			{ key: 'radius', label: 'Radius:', min: 1, max: 100, value: 1, unit: 'Pixels' },
			{ key: 'threshold', label: 'Threshold:', min: 0, max: 255, value: 0, unit: 'levels' },
		], (s) => (src, dst, w, h) => {
			var med = new Uint8ClampedArray(src.length);
			rank_filter(src, med, w, h, s.radius, 0.5);
			for (var i = 0; i < src.length; i += 4) {
				for (var c = 0; c < 3; c++) {
					dst[i + c] = Math.abs(src[i + c] - med[i + c]) > s.threshold ? med[i + c] : src[i + c];
				}
			}
		});
	}

	// ---------- Other ----------

	high_pass() {
		this.dialog('high_pass', 'High Pass', [{ key: 'radius', label: 'Radius:', min: 0.1, max: 1000, step: 0.1, value: 10, unit: 'Pixels' }],
			(s) => (src, dst, w, h) => {
				var blur = gaussian(src, w, h, s.radius);
				for (var i = 0; i < src.length; i += 4) {
					for (var c = 0; c < 3; c++) dst[i + c] = 128 + src[i + c] - blur[i + c];
				}
			});
	}

	minimum() {
		this.dialog('minimum', 'Minimum', [{ key: 'radius', label: 'Radius:', min: 1, max: 100, value: 1, unit: 'Pixels' }],
			(s) => (src, dst, w, h) => rank_filter(src, dst, w, h, s.radius, 0));
	}

	maximum() {
		this.dialog('maximum', 'Maximum', [{ key: 'radius', label: 'Radius:', min: 1, max: 100, value: 1, unit: 'Pixels' }],
			(s) => (src, dst, w, h) => rank_filter(src, dst, w, h, s.radius, 1));
	}

	offset() {
		this.dialog('offset', 'Offset', [
			{ key: 'h', label: 'Horizontal:', min: -30000, max: 30000, value: 0, unit: 'pixels right' },
			{ key: 'v', label: 'Vertical:', min: -30000, max: 30000, value: 0, unit: 'pixels down' },
			{ key: 'edge', label: 'Undefined Areas:', type: 'radio', values: ['Set to Transparent', 'Repeat Edge Pixels', 'Wrap Around'], value: 'Wrap Around' },
		], (s) => (src, dst, w, h) => {
			for (var y = 0; y < h; y++) {
				for (var x = 0; x < w; x++) {
					var sx = x - s.h, sy = y - s.v, o = (y * w + x) * 4;
					if (s.edge == 'Wrap Around') { sx = ((sx % w) + w) % w; sy = ((sy % h) + h) % h; }
					else if (s.edge == 'Repeat Edge Pixels') { sx = Math.max(0, Math.min(w - 1, sx)); sy = Math.max(0, Math.min(h - 1, sy)); }
					else if (sx < 0 || sy < 0 || sx >= w || sy >= h) { dst[o] = dst[o + 1] = dst[o + 2] = dst[o + 3] = 0; continue; }
					var i = (sy * w + sx) * 4;
					dst[o] = src[i]; dst[o + 1] = src[i + 1]; dst[o + 2] = src[i + 2]; dst[o + 3] = src[i + 3];
				}
			}
		});
	}

	// ---------- Distort ----------

	twirl() {
		this.dialog('twirl', 'Twirl', [{ key: 'angle', label: 'Angle:', min: -999, max: 999, value: 50, unit: '°' }],
			(s) => (src, dst, w, h) => distort(src, dst, w, h, (r, a) => [r, a - s.angle * Math.PI / 180 * (1 - r) * (1 - r)]));
	}

	pinch() {
		this.dialog('pinch', 'Pinch', [{ key: 'amount', label: 'Amount:', min: -100, max: 100, value: 50, unit: '%' }],
			(s) => (src, dst, w, h) => {
				var k = s.amount / 100;
				distort(src, dst, w, h, (r, a) => [Math.pow(r, k >= 0 ? 1 - k * 0.5 * (1 - r) : 1 / (1 + -k * 0.5 * (1 - r))) , a]);
			});
	}

	spherize() {
		this.dialog('spherize', 'Spherize', [{ key: 'amount', label: 'Amount:', min: -100, max: 100, value: 100, unit: '%' }],
			(s) => (src, dst, w, h) => {
				var k = s.amount / 100;
				distort(src, dst, w, h, (r, a) => {
					var sph = Math.asin(r) / (Math.PI / 2);
					return [r + (sph - r) * k, a];
				});
			});
	}

	polar_coordinates() {
		this.dialog('polar_coordinates', 'Polar Coordinates', [
			{ key: 'mode', label: '', type: 'radio', values: ['Rectangular to Polar', 'Polar to Rectangular'], value: 'Rectangular to Polar' },
		], (s) => (src, dst, w, h) => {
			var cx = w / 2, cy = h / 2;
			for (var y = 0; y < h; y++) {
				for (var x = 0; x < w; x++) {
					var o = (y * w + x) * 4, sx, sy;
					if (s.mode == 'Rectangular to Polar') {
						var dx = x - cx, dy = y - cy;
						var a = Math.atan2(dx, -dy);
						if (a < 0) a += Math.PI * 2;
						sx = a / (Math.PI * 2) * w;
						sy = Math.hypot(dx / cx, dy / cy) * h;
					}
					else {
						var ang = x / w * Math.PI * 2, rad = y / h;
						sx = cx + Math.sin(ang) * rad * cx;
						sy = cy - Math.cos(ang) * rad * cy;
					}
					if (sy >= h || sy < 0) { dst[o + 3] = 0; continue; }
					sample(src, w, h, sx, sy, dst, o);
				}
			}
		});
	}

	ripple() {
		this.dialog('ripple', 'Ripple', [
			{ key: 'amount', label: 'Amount:', min: -999, max: 999, value: 100, unit: '%' },
			{ key: 'size', label: 'Size:', type: 'select', values: ['Small', 'Medium', 'Large'], value: 'Medium' },
		], (s) => (src, dst, w, h) => {
			var wl = { Small: 6, Medium: 12, Large: 24 }[s.size], amp = s.amount / 100 * 3;
			for (var y = 0; y < h; y++) {
				for (var x = 0; x < w; x++) {
					sample(src, w, h, x + Math.sin(y / wl * Math.PI * 2) * amp, y + Math.sin(x / wl * Math.PI * 2) * amp, dst, (y * w + x) * 4);
				}
			}
		});
	}

	// ---------- Render ----------

	clouds() {
		var fg = hex(config.COLOR), bg = hex(config.BG_COLOR), seed = Math.random() * 1000;
		this.direct('clouds', 'Clouds', (src, dst, w, h) => {
			var n = clouds(w, h, seed);
			for (var i = 0; i < n.length; i++) {
				for (var c = 0; c < 3; c++) dst[i * 4 + c] = fg[c] + (bg[c] - fg[c]) * n[i];
				dst[i * 4 + 3] = 255;
			}
		});
	}

	difference_clouds() {
		var fg = hex(config.COLOR), bg = hex(config.BG_COLOR), seed = Math.random() * 1000;
		this.direct('difference_clouds', 'Difference Clouds', (src, dst, w, h) => {
			var n = clouds(w, h, seed);
			for (var i = 0; i < n.length; i++) {
				for (var c = 0; c < 3; c++) dst[i * 4 + c] = Math.abs(src[i * 4 + c] - (fg[c] + (bg[c] - fg[c]) * n[i]));
			}
		});
	}

	// ---------- one-step filters (no dialog in CS6) ----------

	/**
	 * 3x3 convolution with edge clamping
	 */
	convolve(src, dst, w, h, k, div, bias) {
		for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
			var o = (y * w + x) * 4;
			for (var c = 0; c < 3; c++) {
				var v = 0, n = 0;
				for (var j = -1; j <= 1; j++) for (var i = -1; i <= 1; i++) {
					var sx = Math.max(0, Math.min(w - 1, x + i)), sy = Math.max(0, Math.min(h - 1, y + j));
					v += src[(sy * w + sx) * 4 + c] * k[n++];
				}
				dst[o + c] = v / div + (bias || 0);
			}
		}
	}

	blur() { this.direct('blur', 'Blur', (src, dst, w, h) => this.convolve(src, dst, w, h, [1, 2, 1, 2, 4, 2, 1, 2, 1], 16)); }
	blur_more() { this.direct('blur_more', 'Blur More', (src, dst, w, h) => dst.set(gaussian(src, w, h, 1.6))); }
	sharpen() { this.direct('sharpen', 'Sharpen', (src, dst, w, h) => this.convolve(src, dst, w, h, [0, -1, 0, -1, 8, -1, 0, -1, 0], 4)); }
	sharpen_more() { this.direct('sharpen_more', 'Sharpen More', (src, dst, w, h) => this.convolve(src, dst, w, h, [-1, -1, -1, -1, 12, -1, -1, -1, -1], 4)); }
	despeckle() {
		this.direct('despeckle', 'Despeckle', (src, dst, w, h) => {
			//median except on edges (edge-preserving)
			var med = new Uint8ClampedArray(src.length);
			rank_filter(src, med, w, h, 1, 0.5);
			var blur = gaussian(src, w, h, 1);
			for (var i = 0; i < src.length; i += 4) for (var c = 0; c < 3; c++) {
				var edge = Math.abs(src[i + c] - blur[i + c]) > 18;
				dst[i + c] = edge ? src[i + c] : med[i + c];
			}
		});
	}
	find_edges() {
		this.direct('find_edges', 'Find Edges', (src, dst, w, h) => {
			for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
				var o = (y * w + x) * 4;
				for (var c = 0; c < 3; c++) {
					var g = (xx, yy) => src[(Math.max(0, Math.min(h - 1, yy)) * w + Math.max(0, Math.min(w - 1, xx))) * 4 + c];
					var gx = g(x + 1, y - 1) + 2 * g(x + 1, y) + g(x + 1, y + 1) - g(x - 1, y - 1) - 2 * g(x - 1, y) - g(x - 1, y + 1);
					var gy = g(x - 1, y + 1) + 2 * g(x, y + 1) + g(x + 1, y + 1) - g(x - 1, y - 1) - 2 * g(x, y - 1) - g(x + 1, y - 1);
					dst[o + c] = 255 - Math.min(255, Math.hypot(gx, gy) / 2);
				}
			}
		});
	}
	solarize() {
		this.direct('solarize', 'Solarize', (src, dst) => {
			for (var i = 0; i < src.length; i += 4) for (var c = 0; c < 3; c++) dst[i + c] = src[i + c] > 127 ? 255 - src[i + c] : src[i + c];
		});
	}

	// ---------- dialog filters ----------

	box_blur() {
		this.dialog('box_blur', 'Box Blur', [{ key: 'radius', label: 'Radius:', min: 1, max: 999, value: 5, unit: 'Pixels' }], (s) => (src, dst, w, h) => {
			var r = Math.round(s.radius);
			dst.set(filtered(canvas_of(src, w, h), w, h, (o, big) => {
				//two passes of a running box average = box blur
				var bw = big.width, bh = big.height;
				var d = big.getContext('2d').getImageData(0, 0, bw, bh).data, t = new Float32Array(d.length);
				for (var y = 0; y < bh; y++) {
					var acc = [0, 0, 0, 0];
					for (var x = -r; x <= r; x++) { var xi = Math.max(0, Math.min(bw - 1, x)); for (var c = 0; c < 4; c++) acc[c] += d[(y * bw + xi) * 4 + c]; }
					for (var x2 = 0; x2 < bw; x2++) {
						for (var c2 = 0; c2 < 4; c2++) t[(y * bw + x2) * 4 + c2] = acc[c2] / (2 * r + 1);
						var xo = Math.max(0, x2 - r), xn = Math.min(bw - 1, x2 + r + 1);
						for (var c3 = 0; c3 < 4; c3++) acc[c3] += d[(y * bw + xn) * 4 + c3] - d[(y * bw + xo) * 4 + c3];
					}
				}
				var out = o.createImageData(bw, bh), od = out.data;
				for (var x3 = 0; x3 < bw; x3++) {
					var acc2 = [0, 0, 0, 0];
					for (var y3 = -r; y3 <= r; y3++) { var yi = Math.max(0, Math.min(bh - 1, y3)); for (var c4 = 0; c4 < 4; c4++) acc2[c4] += t[(yi * bw + x3) * 4 + c4]; }
					for (var y4 = 0; y4 < bh; y4++) {
						for (var c5 = 0; c5 < 4; c5++) od[(y4 * bw + x3) * 4 + c5] = acc2[c5] / (2 * r + 1);
						var yo = Math.max(0, y4 - r), yn = Math.min(bh - 1, y4 + r + 1);
						for (var c6 = 0; c6 < 4; c6++) acc2[c6] += t[(yn * bw + x3) * 4 + c6] - t[(yo * bw + x3) * 4 + c6];
					}
				}
				o.putImageData(out, 0, 0);
			}, r));
		});
	}

	radial_blur() {
		this.dialog('radial_blur', 'Radial Blur', [
			{ key: 'amount', label: 'Amount:', min: 1, max: 100, value: 10 },
			{ key: 'method', label: 'Blur Method:', type: 'radio', values: ['Spin', 'Zoom'], value: 'Spin' },
			{ key: 'quality', label: 'Quality:', type: 'radio', values: ['Draft', 'Good', 'Best'], value: 'Good' },
		], (s) => (src, dst, w, h) => {
			var cx = w / 2, cy = h / 2;
			var n = { Draft: 6, Good: 12, Best: 24 }[s.quality];
			var acc = new Float32Array(src.length);
			for (var k = 0; k < n; k++) {
				var t = (k / (n - 1) - 0.5);
				for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
					var dx = x - cx, dy = y - cy, sx, sy;
					if (s.method == 'Spin') {
						var a = t * s.amount / 100 * 0.6, cos = Math.cos(a), sin = Math.sin(a);
						sx = cx + dx * cos - dy * sin; sy = cy + dx * sin + dy * cos;
					}
					else {
						var f = 1 + t * s.amount / 100 * 0.5;
						sx = cx + dx * f; sy = cy + dy * f;
					}
					var ix = Math.max(0, Math.min(w - 1, Math.round(sx))), iy = Math.max(0, Math.min(h - 1, Math.round(sy)));
					var i = (iy * w + ix) * 4, o = (y * w + x) * 4;
					for (var c = 0; c < 4; c++) acc[o + c] += src[i + c];
				}
			}
			for (var j = 0; j < dst.length; j++) dst[j] = acc[j] / n;
		});
	}

	reduce_noise() {
		this.dialog('reduce_noise', 'Reduce Noise', [
			{ key: 'strength', label: 'Strength:', min: 0, max: 10, value: 6 },
			{ key: 'details', label: 'Preserve Details:', min: 0, max: 100, value: 60, unit: '%' },
			{ key: 'color', label: 'Reduce Color Noise:', min: 0, max: 100, value: 45, unit: '%' },
			{ key: 'sharpen', label: 'Sharpen Details:', min: 0, max: 100, value: 25, unit: '%' },
		], (s) => (src, dst, w, h) => {
			var r = s.strength / 3;
			var blur = gaussian(src, w, h, Math.max(0.3, r));
			var cblur = gaussian(src, w, h, Math.max(0.3, s.color / 100 * 4));
			var t = 8 + (100 - s.details) / 100 * 40;
			for (var i = 0; i < src.length; i += 4) {
				//luminance: smooth where the change is small (noise), keep edges
				var l0 = src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114;
				var l1 = blur[i] * 0.299 + blur[i + 1] * 0.587 + blur[i + 2] * 0.114;
				var d = l0 - l1, k = Math.abs(d) < t ? 1 : 0.2;
				var nl = l0 - d * k * (s.strength / 10) + (Math.abs(d) >= t ? d * s.sharpen / 100 : 0);
				//color noise: chroma from the more blurred copy
				var cl = cblur[i] * 0.299 + cblur[i + 1] * 0.587 + cblur[i + 2] * 0.114;
				var mix = s.color / 100;
				for (var c = 0; c < 3; c++) {
					var chroma = (src[i + c] - l0) * (1 - mix) + (cblur[i + c] - cl) * mix;
					dst[i + c] = nl + chroma;
				}
			}
		});
	}

	mosaic() {
		this.dialog('mosaic', 'Mosaic', [{ key: 'size', label: 'Cell Size:', min: 2, max: 200, value: 10, unit: 'square' }], (s) => (src, dst, w, h) => {
			var n = Math.round(s.size);
			for (var by = 0; by < h; by += n) for (var bx = 0; bx < w; bx += n) {
				var sum = [0, 0, 0, 0], k = 0;
				for (var y = by; y < Math.min(h, by + n); y++) for (var x = bx; x < Math.min(w, bx + n); x++) { var i = (y * w + x) * 4; for (var c = 0; c < 4; c++) sum[c] += src[i + c]; k++; }
				for (var y2 = by; y2 < Math.min(h, by + n); y2++) for (var x2 = bx; x2 < Math.min(w, bx + n); x2++) { var o = (y2 * w + x2) * 4; for (var c2 = 0; c2 < 4; c2++) dst[o + c2] = sum[c2] / k; }
			}
		});
	}

	emboss() {
		this.dialog('emboss', 'Emboss', [
			{ key: 'angle', label: 'Angle:', min: -180, max: 180, value: 135, unit: '°' },
			{ key: 'height', label: 'Height:', min: 1, max: 100, value: 3, unit: 'Pixels' },
			{ key: 'amount', label: 'Amount:', min: 1, max: 500, value: 100, unit: '%' },
		], (s) => (src, dst, w, h) => {
			var a = s.angle * Math.PI / 180, dx = Math.cos(a) * s.height, dy = -Math.sin(a) * s.height, k = s.amount / 100;
			for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
				var o = (y * w + x) * 4;
				var ax = Math.max(0, Math.min(w - 1, Math.round(x + dx))), ay = Math.max(0, Math.min(h - 1, Math.round(y + dy)));
				var bx = Math.max(0, Math.min(w - 1, Math.round(x - dx))), by = Math.max(0, Math.min(h - 1, Math.round(y - dy)));
				var la = (ay * w + ax) * 4, lb = (by * w + bx) * 4;
				var lum = (i) => src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114;
				var v = 128 + (lum(la) - lum(lb)) * k;
				dst[o] = dst[o + 1] = dst[o + 2] = v;
			}
		});
	}

	color_halftone() {
		this.dialog('color_halftone', 'Color Halftone', [
			{ key: 'radius', label: 'Max. Radius:', min: 4, max: 127, value: 8, unit: '(Pixels)' },
			{ key: 'c1', label: 'Channel 1:', min: 0, max: 360, value: 108 },
			{ key: 'c2', label: 'Channel 2:', min: 0, max: 360, value: 162 },
			{ key: 'c3', label: 'Channel 3:', min: 0, max: 360, value: 90 },
		], (s) => (src, dst, w, h) => {
			var r = s.radius, cell = r * 2;
			[s.c1, s.c2, s.c3].forEach((angle, c) => {
				var a = angle * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
				for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
					//rotated grid cell center
					var u = x * cos + y * sin, v = -x * sin + y * cos;
					var cu = (Math.floor(u / cell) + 0.5) * cell, cv = (Math.floor(v / cell) + 0.5) * cell;
					var cx = cu * cos - cv * sin, cy = cu * sin + cv * cos;
					var sx = Math.max(0, Math.min(w - 1, Math.round(cx))), sy = Math.max(0, Math.min(h - 1, Math.round(cy)));
					var level = src[(sy * w + sx) * 4 + c] / 255;
					var dot = Math.sqrt(1 - level) * r;
					var d = Math.hypot(u - cu, v - cv);
					dst[(y * w + x) * 4 + c] = d < dot ? 0 : 255;
				}
			});
		});
	}

	oil_paint() {
		this.dialog('oil_paint', 'Oil Paint', [
			{ key: 'stylization', label: 'Stylization:', min: 0.1, max: 10, step: 0.1, value: 4 },
			{ key: 'cleanliness', label: 'Cleanliness:', min: 0, max: 10, step: 0.1, value: 6 },
			{ key: 'scale', label: 'Scale:', min: 0.1, max: 10, step: 0.1, value: 0.5 },
			{ key: 'bristle', label: 'Bristle Detail:', min: 0, max: 10, step: 0.1, value: 2 },
		], (s) => (src, dst, w, h) => {
			//Kuwahara-style: each pixel takes the mean of its least-varied quadrant, then a light emboss for bristles
			var r = Math.max(1, Math.round(s.stylization * 0.8 + s.scale));
			for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
				var best = null, bv = Infinity;
				for (var [qx, qy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
					var sum = [0, 0, 0], sq = 0, n = 0;
					for (var j = 0; j <= r; j += Math.max(1, r >> 2)) for (var i = 0; i <= r; i += Math.max(1, r >> 2)) {
						var sx = Math.max(0, Math.min(w - 1, x + i * qx)), sy = Math.max(0, Math.min(h - 1, y + j * qy)), k = (sy * w + sx) * 4;
						var l = src[k] + src[k + 1] + src[k + 2];
						sum[0] += src[k]; sum[1] += src[k + 1]; sum[2] += src[k + 2]; sq += l * l; n++;
					}
					var mean = (sum[0] + sum[1] + sum[2]) / n, variance = sq / n - mean * mean;
					if (variance < bv) { bv = variance; best = [sum[0] / n, sum[1] / n, sum[2] / n]; }
				}
				var o = (y * w + x) * 4;
				dst[o] = best[0]; dst[o + 1] = best[1]; dst[o + 2] = best[2];
			}
			if (s.bristle > 0) {
				var copy = new Uint8ClampedArray(dst);
				for (var y2 = 1; y2 < h - 1; y2++) for (var x2 = 1; x2 < w - 1; x2++) {
					var o2 = (y2 * w + x2) * 4, a = ((y2 - 1) * w + x2 - 1) * 4, b = ((y2 + 1) * w + x2 + 1) * 4;
					var e = ((copy[a] + copy[a + 1] + copy[a + 2]) - (copy[b] + copy[b + 1] + copy[b + 2])) / 3 * s.bristle / 10;
					for (var c = 0; c < 3; c++) dst[o2 + c] = copy[o2 + c] + e;
				}
			}
		});
	}

	// ---------- more Blur / Sharpen ----------

	surface_blur() {
		this.dialog('surface_blur', 'Surface Blur', [
			{ key: 'radius', label: 'Radius:', min: 1, max: 100, value: 5, unit: 'Pixels' },
			{ key: 'threshold', label: 'Threshold:', min: 2, max: 255, value: 15, unit: 'levels' },
		], (s) => (src, dst, w, h) => {
			//edge-preserving: neighbours closer in value than Threshold are averaged
			var r = Math.round(s.radius), t = s.threshold;
			var step = Math.max(1, Math.round(r / 4));
			for (var y = 0; y < h; y++) {
				for (var x = 0; x < w; x++) {
					var o = (y * w + x) * 4;
					for (var c = 0; c < 3; c++) {
						var v0 = src[o + c], sum = 0, wsum = 0;
						for (var yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy += step) {
							for (var xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx += step) {
								var v = src[(yy * w + xx) * 4 + c], dv = Math.abs(v - v0);
								if (dv > t) continue;
								var wt = 1 - dv / t;
								sum += v * wt; wsum += wt;
							}
						}
						dst[o + c] = wsum ? sum / wsum : v0;
					}
				}
			}
		});
	}

	smart_blur() {
		this.dialog('smart_blur', 'Smart Blur', [
			{ key: 'radius', label: 'Radius:', min: 0.1, max: 100, step: 0.1, value: 3 },
			{ key: 'threshold', label: 'Threshold:', min: 0.1, max: 100, step: 0.1, value: 25 },
		], (s) => (src, dst, w, h) => {
			var blur = gaussian(src, w, h, s.radius), t = s.threshold * 2.55;
			for (var i = 0; i < src.length; i += 4) {
				for (var c = 0; c < 3; c++) dst[i + c] = Math.abs(src[i + c] - blur[i + c]) < t ? blur[i + c] : src[i + c];
			}
		});
	}

	sharpen_edges() {
		this.direct('sharpen_edges', 'Sharpen Edges', (src, dst, w, h) => {
			var blur = gaussian(src, w, h, 1);
			for (var i = 0; i < src.length; i += 4) {
				for (var c = 0; c < 3; c++) {
					var diff = src[i + c] - blur[i + c];
					if (Math.abs(diff) > 6) dst[i + c] = src[i + c] + diff * 1.2;
				}
			}
		});
	}

	// ---------- more Distort ----------

	wave() {
		this.dialog('wave', 'Wave', [
			{ key: 'wavelength', label: 'Wavelength:', min: 2, max: 999, value: 60 },
			{ key: 'amplitude', label: 'Amplitude:', min: 1, max: 999, value: 15 },
			{ key: 'type', label: 'Type:', type: 'radio', values: ['Sine', 'Triangle', 'Square'], value: 'Sine' },
		], (s) => (src, dst, w, h) => {
			var wave = (t) => {
				var p = t - Math.floor(t);
				if (s.type == 'Triangle') return 1 - 4 * Math.abs(p - 0.5);
				if (s.type == 'Square') return p < 0.5 ? 1 : -1;
				return Math.sin(p * Math.PI * 2);
			};
			for (var y = 0; y < h; y++) {
				for (var x = 0; x < w; x++) {
					sample(src, w, h, x + wave(y / s.wavelength) * s.amplitude, y + wave(x / s.wavelength) * s.amplitude, dst, (y * w + x) * 4);
				}
			}
		});
	}

	zigzag() {
		this.dialog('zigzag', 'ZigZag', [
			{ key: 'amount', label: 'Amount:', min: -100, max: 100, value: 10 },
			{ key: 'ridges', label: 'Ridges:', min: 1, max: 20, value: 5 },
		], (s) => (src, dst, w, h) => distort(src, dst, w, h, (r, a) => [r + Math.sin(r * s.ridges * Math.PI * 2) * s.amount / 100 * 0.1 * (1 - r), a]));
	}

	shear() {
		this.dialog('shear', 'Shear', [
			{ key: 'amount', label: 'Amount:', min: -100, max: 100, value: 30 },
			{ key: 'edge', label: 'Undefined Areas:', type: 'radio', values: ['Wrap Around', 'Repeat Edge Pixels'], value: 'Wrap Around' },
		], (s) => (src, dst, w, h) => {
			for (var y = 0; y < h; y++) {
				var t = y / Math.max(1, h - 1);
				var off = Math.sin(t * Math.PI) * s.amount / 100 * w * 0.25;
				for (var x = 0; x < w; x++) {
					var sx = x - off;
					if (s.edge == 'Wrap Around') sx = ((sx % w) + w) % w;
					sample(src, w, h, sx, y, dst, (y * w + x) * 4);
				}
			}
		});
	}

	// ---------- Pixelate ----------

	/**
	 * random cells (Crystallize / Pointillize): nearest-seed lookup on a grid
	 */
	cells(w, h, size) {
		var gw = Math.ceil(w / size), gh = Math.ceil(h / size), seeds = [];
		for (var gy = 0; gy < gh; gy++) for (var gx = 0; gx < gw; gx++) seeds.push({ x: (gx + Math.random()) * size, y: (gy + Math.random()) * size });
		var nearest = (x, y) => {
			var gx = Math.floor(x / size), gy = Math.floor(y / size), best = 0, bd = 1e18;
			for (var j = gy - 1; j <= gy + 1; j++) for (var i = gx - 1; i <= gx + 1; i++) {
				if (i < 0 || j < 0 || i >= gw || j >= gh) continue;
				var k = j * gw + i, sd = seeds[k], d = (sd.x - x) * (sd.x - x) + (sd.y - y) * (sd.y - y);
				if (d < bd) { bd = d; best = k; }
			}
			return [best, Math.sqrt(bd)];
		};
		return { seeds: seeds, nearest: nearest };
	}

	crystallize() {
		this.dialog('crystallize', 'Crystallize', [{ key: 'size', label: 'Cell Size:', min: 3, max: 300, value: 10 }], (s) => (src, dst, w, h) => {
			var cells = this.cells(w, h, s.size);
			var sum = new Float64Array(cells.seeds.length * 4), n = new Uint32Array(cells.seeds.length), owner = new Int32Array(w * h);
			for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
				var k = cells.nearest(x + 0.5, y + 0.5)[0], i = (y * w + x) * 4;
				owner[y * w + x] = k; n[k]++;
				for (var c = 0; c < 4; c++) sum[k * 4 + c] += src[i + c];
			}
			for (var p = 0; p < w * h; p++) { var o = owner[p]; for (var c2 = 0; c2 < 4; c2++) dst[p * 4 + c2] = sum[o * 4 + c2] / n[o]; }
		});
	}

	pointillize() {
		var bg = config.BG_COLOR;
		var b = [parseInt(bg.substr(1, 2), 16), parseInt(bg.substr(3, 2), 16), parseInt(bg.substr(5, 2), 16)];
		this.dialog('pointillize', 'Pointillize', [{ key: 'size', label: 'Cell Size:', min: 3, max: 300, value: 5 }], (s) => (src, dst, w, h) => {
			var cells = this.cells(w, h, s.size);
			var r = s.size * 0.55;
			for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
				var nd = cells.nearest(x + 0.5, y + 0.5), sd = cells.seeds[nd[0]], o = (y * w + x) * 4;
				if (nd[1] > r) { dst[o] = b[0]; dst[o + 1] = b[1]; dst[o + 2] = b[2]; continue; }
				var sx = Math.max(0, Math.min(w - 1, Math.round(sd.x))), sy = Math.max(0, Math.min(h - 1, Math.round(sd.y))), i = (sy * w + sx) * 4;
				dst[o] = src[i]; dst[o + 1] = src[i + 1]; dst[o + 2] = src[i + 2];
			}
		});
	}

	facet() {
		this.direct('facet', 'Facet', (src, dst, w, h) => {
			//flatten small variations into blocks of solid color (median, then posterize)
			rank_filter(src, dst, w, h, 2, 0.5);
			for (var i = 0; i < dst.length; i += 4) for (var c = 0; c < 3; c++) dst[i + c] = Math.round(dst[i + c] / 24) * 24;
		});
	}

	fragment() {
		this.direct('fragment', 'Fragment', (src, dst, w, h) => {
			//four copies offset by 4 px, averaged
			for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
				var o = (y * w + x) * 4;
				for (var c = 0; c < 4; c++) {
					var v = 0;
					for (var [dx, dy] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
						var sx = Math.max(0, Math.min(w - 1, x + dx)), sy = Math.max(0, Math.min(h - 1, y + dy));
						v += src[(sy * w + sx) * 4 + c];
					}
					dst[o + c] = v / 4;
				}
			}
		});
	}

	mezzotint() {
		this.dialog('mezzotint', 'Mezzotint', [{ key: 'type', label: 'Type:', type: 'select', values: ['Fine Dots', 'Medium Dots', 'Grainy Dots', 'Coarse Dots', 'Short Lines', 'Medium Lines', 'Long Lines'], value: 'Fine Dots' }],
			(s) => (src, dst, w, h) => {
				var len = { 'Short Lines': 3, 'Medium Lines': 7, 'Long Lines': 14 }[s.type] || 1;
				var grain = { 'Fine Dots': 1, 'Medium Dots': 2, 'Grainy Dots': 1, 'Coarse Dots': 3 }[s.type] || 1;
				for (var y = 0; y < h; y += grain) for (var x = 0; x < w; x += (len > 1 ? len : grain)) {
					var rnd = [Math.random() * 255, Math.random() * 255, Math.random() * 255];
					for (var yy = y; yy < Math.min(h, y + grain); yy++) for (var xx = x; xx < Math.min(w, x + Math.max(len, grain)); xx++) {
						var o = (yy * w + xx) * 4;
						for (var c = 0; c < 3; c++) dst[o + c] = src[o + c] > (s.type == 'Grainy Dots' ? Math.random() * 255 : rnd[c]) ? 255 : 0;
					}
				}
			});
	}

	// ---------- more Render ----------

	fibers() {
		var fg = hex(config.COLOR), bg = hex(config.BG_COLOR);
		this.dialog('fibers', 'Fibers', [
			{ key: 'variance', label: 'Variance:', min: 1, max: 64, value: 16 },
			{ key: 'strength', label: 'Strength:', min: 1, max: 64, value: 4 },
		], (s) => {
			var seed = Math.random() * 1000;
			return (src, dst, w, h) => {
				//vertical streaks: noise stretched along y by Strength
				var n = clouds(Math.ceil(w), Math.max(1, Math.ceil(h / (s.strength * 4))), seed);
				var nh = Math.max(1, Math.ceil(h / (s.strength * 4)));
				for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
					var v = n[Math.min(nh - 1, Math.floor(y / (s.strength * 4))) * w + x];
					v = Math.max(0, Math.min(1, 0.5 + (v - 0.5) * s.variance / 8));
					var o = (y * w + x) * 4;
					for (var c = 0; c < 3; c++) dst[o + c] = fg[c] + (bg[c] - fg[c]) * v;
					dst[o + 3] = 255;
				}
			};
		});
	}

	lens_flare() {
		this.dialog('lens_flare', 'Lens Flare', [
			{ key: 'brightness', label: 'Brightness:', min: 10, max: 300, value: 100, unit: '%' },
			{ key: 'x', label: 'Center X:', min: 0, max: 100, value: 30, unit: '%' },
			{ key: 'y', label: 'Center Y:', min: 0, max: 100, value: 30, unit: '%' },
			{ key: 'lens', label: 'Lens Type:', type: 'radio', values: ['50-300mm Zoom', '35mm Prime', '105mm Prime', 'Movie Prime'], value: '50-300mm Zoom' },
		], (s) => (src, dst, w, h) => {
			var c = canvas_of(src, w, h), ctx = c.getContext('2d', { willReadFrequently: true });
			var cx = s.x / 100 * w, cy = s.y / 100 * h, k = s.brightness / 100, R = Math.max(w, h);
			ctx.globalCompositeOperation = 'screen';
			var glow = (x, y, r, col, a) => {
				var g = ctx.createRadialGradient(x, y, 0, x, y, r);
				g.addColorStop(0, 'rgba(' + col + ',' + Math.min(1, a * k) + ')');
				g.addColorStop(1, 'rgba(' + col + ',0)');
				ctx.fillStyle = g;
				ctx.fillRect(x - r, y - r, r * 2, r * 2);
			};
			glow(cx, cy, R * 0.12, '255,255,240', 1);
			glow(cx, cy, R * 0.35, '255,220,160', 0.35);
			//ghosts along the line through the center of the image
			var ex = w / 2 - cx, ey = h / 2 - cy;
			[[0.5, 0.03, '120,200,255', 0.35], [0.8, 0.05, '255,160,80', 0.25], [1.3, 0.02, '160,255,160', 0.4], [1.7, 0.08, '200,140,255', 0.18]].forEach(([t, r, col, a]) => glow(cx + ex * 2 * t, cy + ey * 2 * t, R * r, col, a));
			dst.set(ctx.getImageData(0, 0, w, h).data);
		});
	}

	// ---------- Stylize ----------

	tiles() {
		this.dialog('tiles', 'Tiles', [
			{ key: 'number', label: 'Number Of Tiles:', min: 1, max: 99, value: 10 },
			{ key: 'offset', label: 'Maximum Offset:', min: 1, max: 99, value: 10, unit: '%' },
		], (s) => (src, dst, w, h) => {
			var size = Math.max(2, Math.floor(Math.min(w, h) / s.number));
			var bg = hex(config.BG_COLOR);
			for (var i = 0; i < dst.length; i += 4) { dst[i] = bg[0]; dst[i + 1] = bg[1]; dst[i + 2] = bg[2]; dst[i + 3] = 255; }
			for (var ty = 0; ty < h; ty += size) for (var tx = 0; tx < w; tx += size) {
				var ox = Math.round((Math.random() * 2 - 1) * size * s.offset / 100), oy = Math.round((Math.random() * 2 - 1) * size * s.offset / 100);
				for (var y = ty; y < Math.min(h, ty + size); y++) for (var x = tx; x < Math.min(w, tx + size); x++) {
					var dx = x + ox, dy = y + oy;
					if (dx < 0 || dy < 0 || dx >= w || dy >= h) continue;
					var si = (y * w + x) * 4, di = (dy * w + dx) * 4;
					dst[di] = src[si]; dst[di + 1] = src[si + 1]; dst[di + 2] = src[si + 2]; dst[di + 3] = src[si + 3];
				}
			}
		});
	}

	trace_contour() {
		this.dialog('trace_contour', 'Trace Contour', [
			{ key: 'level', label: 'Level:', min: 0, max: 255, value: 128 },
			{ key: 'edge', label: 'Edge:', type: 'radio', values: ['Lower', 'Upper'], value: 'Upper' },
		], (s) => (src, dst, w, h) => {
			for (var i = 0; i < dst.length; i += 4) { dst[i] = dst[i + 1] = dst[i + 2] = 255; }
			for (var y = 0; y < h - 1; y++) for (var x = 0; x < w - 1; x++) {
				var o = (y * w + x) * 4;
				for (var c = 0; c < 3; c++) {
					var a = src[o + c] >= s.level, b = src[o + 4 + c] >= s.level, d = src[o + w * 4 + c] >= s.level;
					if ((a != b || a != d) && (s.edge == 'Upper' ? a : !a)) dst[o + c] = 0;
				}
			}
		});
	}

	wind() {
		this.dialog('wind', 'Wind', [
			{ key: 'method', label: 'Method:', type: 'radio', values: ['Wind', 'Blast', 'Stagger'], value: 'Wind' },
			{ key: 'direction', label: 'Direction:', type: 'radio', values: ['From the Right', 'From the Left'], value: 'From the Right' },
		], (s) => (src, dst, w, h) => {
			var len = { Wind: 12, Blast: 30, Stagger: 18 }[s.method], dir = s.direction == 'From the Right' ? 1 : -1;
			for (var y = 0; y < h; y++) {
				for (var x = 0; x < w; x++) {
					var o = (y * w + x) * 4;
					//streaks trail from bright edges in the wind direction
					var best = [src[o], src[o + 1], src[o + 2]];
					var l = (s.method == 'Stagger' ? (y % 3 + 1) * len / 2 : len) * (0.5 + ((x * 7 + y * 13) % 10) / 20);
					for (var k = 1; k <= l; k++) {
						var sx = x + dir * k;
						if (sx < 0 || sx >= w) break;
						var j = (y * w + sx) * 4, f = 1 - k / l;
						for (var c = 0; c < 3; c++) best[c] = Math.max(best[c], src[j + c] * f + src[o + c] * (1 - f));
					}
					dst[o] = best[0]; dst[o + 1] = best[1]; dst[o + 2] = best[2];
				}
			}
		});
	}

	extrude() {
		this.dialog('extrude', 'Extrude', [
			{ key: 'size', label: 'Size:', min: 2, max: 255, value: 30, unit: 'pixels' },
			{ key: 'depth', label: 'Depth:', min: 1, max: 255, value: 30 },
		], (s) => (src, dst, w, h) => {
			//flat-faced blocks: each block's face is its average color, sides darkened
			var b = s.size;
			for (var by = 0; by < h; by += b) for (var bx = 0; bx < w; bx += b) {
				var sum = [0, 0, 0], n = 0;
				for (var y = by; y < Math.min(h, by + b); y++) for (var x = bx; x < Math.min(w, bx + b); x++) { var i = (y * w + x) * 4; sum[0] += src[i]; sum[1] += src[i + 1]; sum[2] += src[i + 2]; n++; }
				var edge = Math.max(1, Math.round(b * s.depth / 255 * 0.3));
				for (var y2 = by; y2 < Math.min(h, by + b); y2++) for (var x2 = bx; x2 < Math.min(w, bx + b); x2++) {
					var o = (y2 * w + x2) * 4, side = x2 - bx < edge ? 1.25 : (y2 - by < edge ? 1.15 : (bx + b - 1 - x2 < edge ? 0.7 : (by + b - 1 - y2 < edge ? 0.8 : 1)));
					for (var c = 0; c < 3; c++) dst[o + c] = sum[c] / n * side;
				}
			}
		});
	}

	// ---------- Other ----------

	custom() {
		var fields = [];
		for (var i = 0; i < 9; i++) fields.push({ key: 'k' + i, label: ['Top-left', 'Top', 'Top-right', 'Left', 'Center', 'Right', 'Bottom-left', 'Bottom', 'Bottom-right'][i] + ':', min: -999, max: 999, value: i == 4 ? 5 : ([1, 3, 5, 7].includes(i) ? -1 : 0) });
		fields.push({ key: 'scale', label: 'Scale:', min: 1, max: 9999, value: 1 });
		fields.push({ key: 'offset', label: 'Offset:', min: -9999, max: 9999, value: 0 });
		this.dialog('custom', 'Custom', fields, (s) => (src, dst, w, h) => {
			var k = [];
			for (var i = 0; i < 9; i++) k.push(s['k' + i]);
			for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
				var o = (y * w + x) * 4;
				for (var c = 0; c < 3; c++) {
					var v = 0, n = 0;
					for (var j = -1; j <= 1; j++) for (var ii = -1; ii <= 1; ii++) {
						var sx = Math.max(0, Math.min(w - 1, x + ii)), sy = Math.max(0, Math.min(h - 1, y + j));
						v += src[(sy * w + sx) * 4 + c] * k[n++];
					}
					dst[o + c] = v / s.scale + s.offset;
				}
			}
		});
	}

	// ---------- Stylize ----------

	diffuse() {
		this.dialog('diffuse', 'Diffuse', [
			{ key: 'mode', label: 'Mode:', type: 'radio', values: ['Normal', 'Darken Only', 'Lighten Only'], value: 'Normal' },
		], (s) => (src, dst, w, h) => {
			for (var y = 0; y < h; y++) {
				for (var x = 0; x < w; x++) {
					var sx = Math.max(0, Math.min(w - 1, x + Math.round(Math.random() * 2 - 1)));
					var sy = Math.max(0, Math.min(h - 1, y + Math.round(Math.random() * 2 - 1)));
					var o = (y * w + x) * 4, i = (sy * w + sx) * 4;
					var lo = src[o] + src[o + 1] + src[o + 2], li = src[i] + src[i + 1] + src[i + 2];
					if ((s.mode == 'Darken Only' && li > lo) || (s.mode == 'Lighten Only' && li < lo)) continue;
					dst[o] = src[i]; dst[o + 1] = src[i + 1]; dst[o + 2] = src[i + 2]; dst[o + 3] = src[i + 3];
				}
			}
		});
	}
}

export { gaussian, rank_filter, clouds, sample };
export default Ps_filters_class;
