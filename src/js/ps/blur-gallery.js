/*
 * pshot - CS6 Filter > Blur > Field Blur / Iris Blur / Tilt-Shift (the Blur
 * Gallery). Pins are placed on a preview; each pin defines where the image
 * stays sharp and how much it blurs elsewhere:
 *   field  - blur amount at the pin, blended between pins by distance
 *   iris   - sharp inside the feather of a rotated ellipse, full blur outside
 *   tilt   - sharp band along a line (solid lines), fading to full blur at the
 *            dashed lines
 * The image is rendered from a few blur levels mixed per pixel by the blur map,
 * at preview size while editing and at full size on OK (one History step).
 */

import app from './../app.js';
import config from './../config.js';
import { ensure_pixel_layer, alert_box } from './pixel-layer.js';

const TITLES = { field: 'Field Blur', iris: 'Iris Blur', tilt: 'Tilt-Shift' };

function smoothstep(a, b, x) {
	if (b <= a) return x < a ? 0 : 1;
	var t = Math.max(0, Math.min(1, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
}

/**
 * canvas blurred with edge pixels extended (no dark/transparent border)
 */
function blurred(src, w, h, radius) {
	var out = document.createElement('canvas');
	out.width = w;
	out.height = h;
	var octx = out.getContext('2d', { willReadFrequently: true });
	if (radius < 0.3) {
		octx.drawImage(src, 0, 0);
		return octx.getImageData(0, 0, w, h).data;
	}
	var p = Math.ceil(radius * 3);
	var pad = document.createElement('canvas');
	pad.width = w + p * 2;
	pad.height = h + p * 2;
	var pctx = pad.getContext('2d');
	pctx.drawImage(src, p, p);
	pctx.drawImage(src, 0, 0, w, 1, p, 0, w, p);
	pctx.drawImage(src, 0, h - 1, w, 1, p, h + p, w, p);
	pctx.drawImage(src, 0, 0, 1, h, 0, p, p, h);
	pctx.drawImage(src, w - 1, 0, 1, h, w + p, p, p, h);
	pctx.drawImage(src, 0, 0, 1, 1, 0, 0, p, p);
	pctx.drawImage(src, w - 1, 0, 1, 1, w + p, 0, p, p);
	pctx.drawImage(src, 0, h - 1, 1, 1, 0, h + p, p, p);
	pctx.drawImage(src, w - 1, h - 1, 1, 1, w + p, h + p, p, p);
	octx.filter = 'blur(' + radius + 'px)';
	octx.drawImage(pad, -p, -p);
	return octx.getImageData(0, 0, w, h).data;
}

/**
 * blur radius per pixel (image units scaled by k) for the pins
 */
function blur_map(pins, w, h, k) {
	var map = new Float32Array(w * h);
	var field = pins.filter(p => p.type == 'field'), shaped = pins.filter(p => p.type != 'field');
	for (var y = 0; y < h; y++) {
		for (var x = 0; x < w; x++) {
			var X = x / k, Y = y / k;
			var f = -1;
			if (field.length) {
				var sw = 0, sv = 0;
				for (var fp of field) {
					var d2 = (X - fp.x) * (X - fp.x) + (Y - fp.y) * (Y - fp.y);
					if (d2 < 1) { sw = 1; sv = fp.blur; break; }
					var wgt = 1 / d2;
					sw += wgt;
					sv += fp.blur * wgt;
				}
				f = sv / sw;
			}
			var s = -1;
			for (var sp of shaped) {
				var dx = X - sp.x, dy = Y - sp.y, c = Math.cos(sp.angle), sn = Math.sin(sp.angle), v;
				//Focus: how sharp the pin's center stays (100% = no blur there)
				var floor = 1 - (sp.focus == null ? 100 : sp.focus) / 100;
				if (sp.type == 'iris') {
					var u = (dx * c + dy * sn) / sp.rx, vv = (-dx * sn + dy * c) / sp.ry;
					v = sp.blur * (floor + (1 - floor) * smoothstep(sp.feather, 1, Math.sqrt(u * u + vv * vv)));
				}
				else {
					var dist = Math.abs(-dx * sn + dy * c);
					v = sp.blur * (floor + (1 - floor) * smoothstep(sp.h1, sp.h2, dist));
				}
				s = s < 0 ? v : Math.min(s, v);
			}
			map[y * w + x] = (f < 0 ? Math.max(0, s) : (s < 0 ? f : Math.max(f, s))) * k;
		}
	}
	return map;
}

/**
 * float Gaussian blur (three box passes) of an RGB float array, edges clamped
 */
function float_blur(src, w, h, sigma) {
	var n = 3, ideal = Math.sqrt(12 * sigma * sigma / n + 1), wl = Math.floor(ideal);
	if (wl % 2 == 0) wl--;
	var m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
	var sizes = [];
	for (var i = 0; i < n; i++) sizes.push(i < m ? wl : wl + 2);
	var a = Float32Array.from(src), b = new Float32Array(src.length);
	var pass = (from, to, r, horizontal) => {
		var len = horizontal ? w : h, lines = horizontal ? h : w, inv = 1 / (r + r + 1);
		for (var l = 0; l < lines; l++) {
			var at = (k) => horizontal ? (l * w + k) * 3 : (k * w + l) * 3;
			for (var c = 0; c < 3; c++) {
				var first = from[at(0) + c], last = from[at(len - 1) + c], acc = (r + 1) * first;
				for (var k = 0; k < r; k++) acc += from[at(Math.min(len - 1, k)) + c];
				for (var k2 = 0; k2 < len; k2++) {
					acc += from[at(Math.min(len - 1, k2 + r)) + c] - (k2 - r - 1 >= 0 ? from[at(k2 - r - 1) + c] : first);
					to[at(k2) + c] = acc * inv;
				}
			}
		}
	};
	for (var s of sizes) {
		var r = (s - 1) / 2;
		pass(a, b, r, true);
		pass(b, a, r, false);
	}
	return a;
}

/**
 * src canvas -> ImageData blurred by the map
 */
function render_blur(src, w, h, map, fx) {
	fx = fx || {};
	var max = 0;
	for (var i = 0; i < map.length; i++) if (map[i] > max) max = map[i];
	var out = new ImageData(w, h);
	var base = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
	if (max < 0.3) { out.data.set(base); return out; }
	//High Quality: more blur steps between sharp and the largest radius
	var levels = fx.hq ? [0, max / 16, max / 8, max / 6, max / 4, max / 3, max / 2, max * 2 / 3, max * 3 / 4, max * 7 / 8, max] : [0, max / 8, max / 4, max / 2, max * 3 / 4, max];
	var data = levels.map(r => r == 0 ? base : blurred(src, w, h, r));
	//Light Bokeh: the bright pixels (Light Range) bloom in the blurred areas; Bokeh Color saturates them
	var bokeh = (fx.bokeh || 0) / 100, glow = null;
	if (bokeh > 0) {
		var lo = fx.lo == null ? 191 : fx.lo, hi = fx.hi == null ? 255 : fx.hi, sat = 1 + (fx.color || 0) / 100 * 2;
		var hl = new Float32Array(w * h * 3), any = false;
		for (var q0 = 0, p0 = 0; q0 < base.length; q0 += 4, p0 += 3) {
			var lum = base[q0] * 0.299 + base[q0 + 1] * 0.587 + base[q0 + 2] * 0.114;
			if (lum < lo || lum > hi + 0.5) continue;
			var wgt = hi > lo ? Math.min(1, (lum - lo) / Math.max(1, (hi - lo) * 0.5)) : 1;
			for (var c0 = 0; c0 < 3; c0++) hl[p0 + c0] = Math.max(0, Math.min(255, lum + (base[q0 + c0] - lum) * sat)) * wgt;
			any = true;
		}
		if (any) glow = levels.map(r => r == 0 ? null : float_blur(hl, w, h, r));
	}
	var o = out.data;
	for (var j = 0; j < map.length; j++) {
		var r = map[j], li = 0;
		while (li < levels.length - 2 && levels[li + 1] < r) li++;
		var t = Math.max(0, Math.min(1, (r - levels[li]) / (levels[li + 1] - levels[li])));
		var a = data[li], b = data[li + 1], q = j * 4;
		o[q] = a[q] + (b[q] - a[q]) * t;
		o[q + 1] = a[q + 1] + (b[q + 1] - a[q + 1]) * t;
		o[q + 2] = a[q + 2] + (b[q + 2] - a[q + 2]) * t;
		o[q + 3] = a[q + 3] + (b[q + 3] - a[q + 3]) * t;
		if (glow && r > 0.3) {
			//a highlight spread over the blur keeps its brightness (a bright out-of-focus light)
			var ga = glow[li], gb = glow[li + 1], p3 = j * 3, gain = bokeh * Math.max(1.5, r * r / 12);
			for (var c = 0; c < 3; c++) {
				var gv = ga ? ga[p3 + c] + (gb[p3 + c] - ga[p3 + c]) * t : gb[p3 + c] * t;
				o[q + c] = o[q + c] + gv * gain;
			}
		}
	}
	return out;
}

class Ps_blur_gallery_class {

	open(mode) {
		ensure_pixel_layer();
		var layer = config.layer;
		if (!layer || layer.type != 'image' || !layer.link) {
			alert_box('Could not complete the ' + TITLES[mode] + ' command because the active layer is not a pixel layer.');
			return;
		}
		var W = layer.width_original, H = layer.height_original;
		var max_w = Math.min(960, window.innerWidth - 300), max_h = Math.min(660, window.innerHeight - 160);
		var k = Math.min(1, max_w / W, max_h / H);
		var pw = Math.max(1, Math.round(W * k)), ph = Math.max(1, Math.round(H * k));
		var small = document.createElement('canvas');
		small.width = pw;
		small.height = ph;
		var sctx = small.getContext('2d');
		sctx.imageSmoothingQuality = 'high';
		sctx.drawImage(layer.link, 0, 0, pw, ph);
		this.state = { layer: layer, W: W, H: H, k: k, pw: pw, ph: ph, small: small, pins: [], selected: null, tool: mode, preview: true, enabled: { field: true, iris: true, tilt: true },
			fx: { bokeh: 0, color: 0, lo: 191, hi: 255, hq: false }, save_mask: false };
		this.build_ui();
		this.add_pin(mode, W / 2, H / 2);
		this.sync_panel();
		this.render();
	}

	add_pin(type, x, y) {
		var s = this.state, m = Math.min(s.W, s.H);
		var pin = { type: type, x: x, y: y, blur: 15 };
		if (type == 'iris') Object.assign(pin, { rx: m * 0.25, ry: m * 0.2, angle: 0, feather: 0.5 });
		if (type == 'tilt') Object.assign(pin, { angle: 0, h1: s.H * 0.08, h2: s.H * 0.22 });
		if (type == 'field' && s.pins.some(p => p.type == 'field')) pin.blur = 0;
		s.pins.push(pin);
		s.selected = pin;
		return pin;
	}

	build_ui() {
		var s = this.state;
		var section = (type) => '<div class="ps_bg_section" data-section="' + type + '"><div class="ps_bg_head"><label class="ps_adj_check"><input type="checkbox" data-enable="' + type + '" checked></label><span>' + TITLES[type] + '</span></div>'
			+ '<div class="ps_adj_slider"><span>Blur:</span><input type="number" data-blur="' + type + '" min="0" max="500"><span class="ps_adj_unit">px</span><input type="range" data-blur-range="' + type + '" min="0" max="500"></div>'
			+ (type == 'tilt' ? '<div class="ps_adj_slider disabled"><span>Distortion:</span><input type="number" value="0" disabled><span class="ps_adj_unit">%</span><input type="range" value="0" disabled></div><label class="ps_adj_check disabled"><input type="checkbox" disabled> Symmetric Distortion</label>' : '')
			+ '</div>';
		var el = document.createElement('div');
		el.className = 'popup ps_blurgallery';
		el.style.display = 'block';
		el.innerHTML = '<h2>Blur Gallery</h2>'
			+ '<div class="ps_bg_bar"><span class="ps_bg_disabled">Selection Bleed: <input type="number" value="0" disabled>%</span><span class="ps_bg_focus">Focus: <input type="number" class="ps_bg_focus_n" value="100" min="0" max="100">%</span>'
			+ '<label class="ps_adj_check"><input type="checkbox" class="ps_bg_savemask"> Save Mask to Channels</label><label class="ps_adj_check"><input type="checkbox" class="ps_bg_hq"> High Quality</label>'
			+ '<label class="ps_adj_check"><input type="checkbox" class="ps_bg_preview" checked> Preview</label>'
			+ '<button type="button" class="button ps_bg_remove" title="Remove all pins">Remove All Pins</button><button type="button" class="button ps_bg_cancel">Cancel</button><button type="button" class="button ps_bg_ok">OK</button></div>'
			+ '<div class="ps_bg_body"><div class="ps_bg_view"><canvas width="' + s.pw + '" height="' + s.ph + '"></canvas></div>'
			+ '<div class="ps_bg_side"><div class="ps_bg_panel"><div class="ps_bg_panel_title">Blur Tools</div>' + section('field') + section('iris') + section('tilt') + '</div>'
			+ '<div class="ps_bg_panel"><div class="ps_bg_panel_title">Blur Effects</div>'
			+ '<div class="ps_adj_slider"><span>Light Bokeh:</span><input type="number" data-fx="bokeh" min="0" max="100" value="0"><span class="ps_adj_unit">%</span><input type="range" data-fx-range="bokeh" min="0" max="100" value="0"></div>'
			+ '<div class="ps_adj_slider"><span>Bokeh Color:</span><input type="number" data-fx="color" min="0" max="100" value="0"><span class="ps_adj_unit">%</span><input type="range" data-fx-range="color" min="0" max="100" value="0"></div>'
			+ '<div class="ps_adj_slider ps_bg_lrange"><span>Light Range:</span><input type="number" data-fx="lo" min="0" max="255" value="191"><input type="number" data-fx="hi" min="0" max="255" value="255"></div>'
			+ '</div></div></div>';
		document.getElementById('popups').appendChild(el);
		this.el = el;
		this.canvas = el.querySelector('canvas');
		this.ctx = this.canvas.getContext('2d');
		el.querySelector('.ps_bg_ok').addEventListener('click', () => this.apply());
		el.querySelector('.ps_bg_cancel').addEventListener('click', () => this.close());
		el.querySelector('.ps_bg_remove').addEventListener('click', () => { s.pins = []; s.selected = null; this.sync_panel(); this.render(); });
		el.querySelector('.ps_bg_preview').addEventListener('change', (e) => { s.preview = e.target.checked; this.render(); });
		el.querySelector('.ps_bg_hq').addEventListener('change', (e) => { s.fx.hq = e.target.checked; });
		el.querySelector('.ps_bg_savemask').addEventListener('change', (e) => { s.save_mask = e.target.checked; });
		el.querySelector('.ps_bg_focus_n').addEventListener('change', (e) => {
			var v = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
			e.target.value = v;
			if (s.selected && s.selected.type != 'field') s.selected.focus = v;
			this.render();
		});
		el.querySelectorAll('[data-fx]').forEach((input) => {
			var key = input.dataset.fx, range = el.querySelector('[data-fx-range="' + key + '"]');
			var set = (v) => {
				if (isNaN(v)) return;
				s.fx[key] = Math.max(0, Math.min(key == 'lo' || key == 'hi' ? 255 : 100, v));
				input.value = s.fx[key];
				if (range) range.value = s.fx[key];
				this.render();
			};
			input.addEventListener('change', () => set(parseFloat(input.value)));
			if (range) range.addEventListener('input', () => set(parseFloat(range.value)));
		});
		el.querySelectorAll('[data-section]').forEach((sec) => sec.addEventListener('mousedown', () => { s.tool = sec.dataset.section; this.sync_panel(); }));
		el.querySelectorAll('[data-enable]').forEach((c) => c.addEventListener('change', () => { s.enabled[c.dataset.enable] = c.checked; this.render(); }));
		el.querySelectorAll('[data-blur]').forEach((input) => {
			var type = input.dataset.blur, range = el.querySelector('[data-blur-range="' + type + '"]');
			var set = (v) => {
				if (isNaN(v)) return;
				v = Math.max(0, Math.min(500, v));
				var pin = s.selected && s.selected.type == type ? s.selected : null;
				if (pin) pin.blur = v;
				input.value = range.value = v;
				this.render();
			};
			input.addEventListener('change', () => set(parseFloat(input.value)));
			range.addEventListener('input', () => set(parseFloat(range.value)));
		});

		var pos = (e) => {
			var r = this.canvas.getBoundingClientRect();
			return { x: (e.clientX - r.left) * s.pw / r.width / s.k, y: (e.clientY - r.top) * s.ph / r.height / s.k };
		};
		this.canvas.addEventListener('mousedown', (e) => {
			if (e.button != 0) return;
			e.preventDefault();
			var p = pos(e);
			var hit = this.hit(p);
			if (!hit) {
				//clicking an empty spot adds a pin of the current blur
				var pin = this.add_pin(s.tool, p.x, p.y);
				hit = { pin: pin, part: 'move' };
			}
			s.selected = hit.pin;
			this.drag = Object.assign(hit, { start: p, orig: Object.assign({}, hit.pin) });
			this.sync_panel();
			this.render(true);
		});
		this.move = (e) => {
			if (!this.drag) return;
			this.drag_to(pos(e));
			this.render(true);
		};
		this.up = () => {
			if (!this.drag) return;
			this.drag = null;
			this.render();
		};
		window.addEventListener('mousemove', this.move);
		window.addEventListener('mouseup', this.up);
		this.keys = (e) => {
			if (e.target.tagName == 'INPUT' && e.key != 'Escape' && e.key != 'Enter') return;
			if (e.key == 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.close(); return; }
			if (e.key == 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); this.apply(); return; }
			if ((e.key == 'Delete' || e.key == 'Backspace') && s.selected) {
				s.pins = s.pins.filter(p => p !== s.selected);
				s.selected = s.pins[s.pins.length - 1] || null;
				this.sync_panel();
				this.render();
			}
			else if (e.key.toUpperCase() == 'P' && !e.ctrlKey) {
				s.preview = !s.preview;
				el.querySelector('.ps_bg_preview').checked = s.preview;
				this.render();
			}
			e.preventDefault();
			e.stopImmediatePropagation();
		};
		window.addEventListener('keydown', this.keys, true);
	}

	/**
	 * handle positions of a pin (image units)
	 */
	handles(pin) {
		var c = Math.cos(pin.angle || 0), sn = Math.sin(pin.angle || 0);
		var at = (u, v) => ({ x: pin.x + u * c - v * sn, y: pin.y + u * sn + v * c });
		if (pin.type == 'iris') {
			var f = pin.feather, d = Math.SQRT1_2;
			return [
				{ part: 'rx', p: at(pin.rx, 0) }, { part: 'rx', p: at(-pin.rx, 0) }, { part: 'ry', p: at(0, pin.ry) }, { part: 'ry', p: at(0, -pin.ry) },
				{ part: 'feather', p: at(pin.rx * f * d, pin.ry * f * d) }, { part: 'feather', p: at(-pin.rx * f * d, pin.ry * f * d) },
				{ part: 'feather', p: at(pin.rx * f * d, -pin.ry * f * d) }, { part: 'feather', p: at(-pin.rx * f * d, -pin.ry * f * d) },
			];
		}
		if (pin.type == 'tilt') {
			return [{ part: 'rotate', p: at(0, -pin.h1) }, { part: 'rotate', p: at(0, pin.h1) }];
		}
		return [];
	}

	hit(p) {
		var s = this.state, tol = 7 / s.k;
		var near = (q) => Math.hypot(q.x - p.x, q.y - p.y) <= tol;
		var order = s.selected ? [s.selected].concat(s.pins.filter(x => x !== s.selected)) : s.pins;
		for (var pin of order) {
			if (pin.type != 'field' && !s.enabled[pin.type]) continue;
			if (near(pin)) return { pin: pin, part: 'move' };
			if (pin !== s.selected) continue;
			for (var h of this.handles(pin)) if (near(h.p)) return { pin: pin, part: h.part };
			if (pin.type == 'tilt') {
				var c = Math.cos(pin.angle), sn = Math.sin(pin.angle);
				var dist = -(p.x - pin.x) * sn + (p.y - pin.y) * c;
				if (Math.abs(Math.abs(dist) - pin.h1) <= tol) return { pin: pin, part: 'h1' };
				if (Math.abs(Math.abs(dist) - pin.h2) <= tol) return { pin: pin, part: 'h2' };
			}
			if (pin.type == 'iris') {
				var cc = Math.cos(pin.angle), ss = Math.sin(pin.angle);
				var u = ((p.x - pin.x) * cc + (p.y - pin.y) * ss) / pin.rx, v = (-(p.x - pin.x) * ss + (p.y - pin.y) * cc) / pin.ry;
				if (Math.abs(Math.sqrt(u * u + v * v) - 1) * Math.min(pin.rx, pin.ry) <= tol) return { pin: pin, part: 'ellipse' };
			}
		}
		return null;
	}

	drag_to(p) {
		var d = this.drag, pin = d.pin, o = d.orig;
		var dx = p.x - pin.x, dy = p.y - pin.y;
		if (d.part == 'move') {
			pin.x = o.x + (p.x - d.start.x);
			pin.y = o.y + (p.y - d.start.y);
			return;
		}
		var c = Math.cos(pin.angle || 0), sn = Math.sin(pin.angle || 0);
		var u = dx * c + dy * sn, v = -dx * sn + dy * c;
		if (d.part == 'rx') { pin.rx = Math.max(4, Math.hypot(dx, dy)); pin.angle = Math.atan2(dy, dx) + (u < 0 ? Math.PI : 0); }
		else if (d.part == 'ry') { pin.ry = Math.max(4, Math.hypot(dx, dy)); pin.angle = Math.atan2(dy, dx) - Math.PI / 2 + (v < 0 ? Math.PI : 0); }
		else if (d.part == 'ellipse') {
			var ratio = Math.hypot(dx, dy) / Math.max(1e-6, Math.hypot(d.start.x - o.x, d.start.y - o.y));
			pin.rx = Math.max(4, o.rx * ratio);
			pin.ry = Math.max(4, o.ry * ratio);
		}
		else if (d.part == 'feather') {
			var e = Math.sqrt((u / pin.rx) * (u / pin.rx) + (v / pin.ry) * (v / pin.ry));
			pin.feather = Math.max(0, Math.min(0.98, e));
		}
		else if (d.part == 'h1') pin.h1 = Math.max(0, Math.min(pin.h2 - 1, Math.abs(v)));
		else if (d.part == 'h2') pin.h2 = Math.max(pin.h1 + 1, Math.abs(v));
		else if (d.part == 'rotate') pin.angle = Math.atan2(dy, dx) + (v < 0 ? Math.PI / 2 : -Math.PI / 2);
	}

	sync_panel() {
		var s = this.state, el = this.el;
		el.querySelectorAll('[data-section]').forEach((sec) => sec.classList.toggle('active', sec.dataset.section == s.tool));
		el.querySelectorAll('[data-blur]').forEach((input) => {
			var type = input.dataset.blur, range = el.querySelector('[data-blur-range="' + type + '"]');
			var pin = s.selected && s.selected.type == type ? s.selected : s.pins.slice().reverse().find(p => p.type == type);
			input.value = range.value = pin ? Math.round(pin.blur) : 15;
		});
		var focus = el.querySelector('.ps_bg_focus_n'), fp = s.selected && s.selected.type != 'field' ? s.selected : null;
		focus.value = fp && fp.focus != null ? fp.focus : 100;
		focus.disabled = !fp;
	}

	active_pins() {
		var s = this.state;
		return s.pins.filter(p => s.enabled[p.type]);
	}

	/**
	 * fast: while dragging only the overlay moves; the blur follows on release
	 */
	render(fast) {
		var s = this.state, ctx = this.ctx;
		if (!fast || !this.last_preview) {
			if (s.preview && this.active_pins().length) {
				var map = blur_map(this.active_pins(), s.pw, s.ph, s.k);
				this.last_preview = render_blur(s.small, s.pw, s.ph, map, s.fx);
			}
			else {
				this.last_preview = s.small.getContext('2d').getImageData(0, 0, s.pw, s.ph);
			}
		}
		ctx.putImageData(this.last_preview, 0, 0);
		this.draw_overlay();
	}

	draw_overlay() {
		var s = this.state, ctx = this.ctx, k = s.k;
		ctx.save();
		var line = (fn, dash) => {
			ctx.setLineDash(dash || []);
			ctx.strokeStyle = 'rgba(0,0,0,0.6)';
			ctx.lineWidth = 3;
			ctx.beginPath(); fn(); ctx.stroke();
			ctx.strokeStyle = '#fff';
			ctx.lineWidth = 1;
			ctx.beginPath(); fn(); ctx.stroke();
			ctx.setLineDash([]);
		};
		var dot = (p, r, fill) => {
			ctx.beginPath();
			ctx.arc(p.x * k, p.y * k, r, 0, Math.PI * 2);
			ctx.fillStyle = fill;
			ctx.fill();
			ctx.strokeStyle = 'rgba(0,0,0,0.7)';
			ctx.lineWidth = 1;
			ctx.stroke();
		};
		for (var pin of s.pins) {
			if (pin.type != 'field' && !s.enabled[pin.type]) continue;
			var sel = pin === s.selected;
			if (sel && pin.type == 'iris') {
				line(() => ctx.ellipse(pin.x * k, pin.y * k, pin.rx * k, pin.ry * k, pin.angle, 0, Math.PI * 2));
			}
			if (sel && pin.type == 'tilt') {
				var c = Math.cos(pin.angle), sn = Math.sin(pin.angle), L = (s.pw + s.ph) * 2;
				var seg = (off, dash) => line(() => {
					var cx = pin.x * k - sn * off * k, cy = pin.y * k + c * off * k;
					ctx.moveTo(cx - c * L, cy - sn * L);
					ctx.lineTo(cx + c * L, cy + sn * L);
				}, dash);
				seg(-pin.h1); seg(pin.h1); seg(-pin.h2, [6, 4]); seg(pin.h2, [6, 4]);
			}
			if (sel) {
				for (var h of this.handles(pin)) {
					if (h.part == 'feather' || h.part == 'rotate') dot(h.p, 3.5, '#fff');
					else {
						ctx.fillStyle = '#fff';
						ctx.fillRect(h.p.x * k - 3.5, h.p.y * k - 3.5, 7, 7);
						ctx.strokeStyle = 'rgba(0,0,0,0.7)';
						ctx.strokeRect(h.p.x * k - 3.5, h.p.y * k - 3.5, 7, 7);
					}
				}
			}
			//the pin: a ring with a center dot (the CS6 blur ring is larger when selected)
			ctx.beginPath();
			ctx.arc(pin.x * k, pin.y * k, sel ? 14 : 8, 0, Math.PI * 2);
			ctx.strokeStyle = 'rgba(0,0,0,0.6)';
			ctx.lineWidth = sel ? 4 : 3;
			ctx.stroke();
			ctx.strokeStyle = sel ? '#fff' : '#ddd';
			ctx.lineWidth = sel ? 2 : 1.5;
			ctx.stroke();
			if (sel) {
				//blur amount arc
				ctx.beginPath();
				ctx.arc(pin.x * k, pin.y * k, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, pin.blur / 500));
				ctx.strokeStyle = '#7fb2ff';
				ctx.lineWidth = 2;
				ctx.stroke();
			}
			dot(pin, 3, sel ? '#fff' : '#ccc');
		}
		ctx.restore();
	}

	apply() {
		var s = this.state;
		var pins = this.active_pins();
		var layer = s.layer;
		if (!pins.length) { this.close(); return; }
		var full = document.createElement('canvas');
		full.width = s.W;
		full.height = s.H;
		full.getContext('2d').drawImage(layer.link, 0, 0);
		var map = blur_map(pins, s.W, s.H, 1);
		var out = render_blur(full, s.W, s.H, map, s.fx);
		var mask_action = s.save_mask ? this.mask_channel(map, s) : null;
		var result = document.createElement('canvas');
		result.width = s.W;
		result.height = s.H;
		result.getContext('2d').putImageData(out, 0, 0);
		var title = TITLES[s.pins.length ? s.pins[s.pins.length - 1].type : s.tool];
		this.close();
		result = app.GUI.Ps_workspace.Selection.restrict(result, layer);
		app.State.do_action(new app.Actions.Bundle_action('blur_gallery', title, [
			new app.Actions.Update_layer_image_action(result, layer.id),
		].concat(mask_action ? [mask_action] : []))).then(() => { if (mask_action) app.GUI.Ps_workspace.render_channels(true); });
	}

	/**
	 * Save Mask to Channels: the blur mask as an alpha channel (white = sharp)
	 */
	mask_channel(map, s) {
		var max = 0;
		for (var i = 0; i < map.length; i++) if (map[i] > max) max = map[i];
		var m = document.createElement('canvas');
		m.width = s.W;
		m.height = s.H;
		var mctx = m.getContext('2d'), img = mctx.createImageData(s.W, s.H);
		for (var j = 0; j < map.length; j++) img.data[j * 4 + 3] = max > 0 ? 255 * (1 - map[j] / max) : 255;
		mctx.putImageData(img, 0, 0);
		var doc = document.createElement('canvas');
		doc.width = config.WIDTH;
		doc.height = config.HEIGHT;
		doc.getContext('2d').drawImage(m, s.layer.x, s.layer.y, s.layer.width, s.layer.height);
		var A = app.GUI.Ps_workspace.Alpha;
		var list = A.list().slice();
		list.push({ name: 'Blur Mask', mask: doc });
		return new app.Actions.Update_config_action({ ps_alpha: list, ps_alpha_active: config.ps_alpha_active == null ? -1 : config.ps_alpha_active });
	}

	close() {
		window.removeEventListener('mousemove', this.move);
		window.removeEventListener('mouseup', this.up);
		window.removeEventListener('keydown', this.keys, true);
		if (this.el) this.el.remove();
		this.el = null;
		this.state = null;
		this.last_preview = null;
		this.drag = null;
	}
}

export default Ps_blur_gallery_class;
