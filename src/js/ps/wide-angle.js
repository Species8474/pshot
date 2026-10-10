/*
 * pshot - CS6 Filter > Adaptive Wide Angle (Alt+Shift+Ctrl+A).
 *
 * The lens model (Fisheye, Perspective, Full Spherical; focal length and crop
 * factor) maps the picture to a rectilinear view. Constraint lines drawn on
 * the preview pin the image there; Horizontal / Vertical constraints (Shift
 * while drawing, or right-click) are straightened with a moving least squares
 * warp. OK applies the result to the full-resolution layer as one step.
 */

import app from './../app.js';
import config from './../config.js';
import { ensure_pixel_layer, alert_box } from './pixel-layer.js';
import { show_popup_menu } from './popup-menu.js';

const TOOLS = [
	['constraint', 'Constraint Tool (C)', 'C', '<path d="M3 14L15 4" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="3" cy="14" r="2" fill="currentColor"/><circle cx="15" cy="4" r="2" fill="currentColor"/>'],
	['polygon', 'Polygon Constraint Tool (Y)', 'Y', '<path d="M3 14L6 4l9 3-4 8z" fill="none" stroke="currentColor" stroke-width="1.3"/>'],
	['move', 'Move Tool (M)', 'M', '<path d="M9 2v14M2 9h14M9 2l-2 2M9 2l2 2M9 16l-2-2M9 16l2-2M2 9l2-2M2 9l2 2M16 9l-2-2M16 9l-2 2" fill="none" stroke="currentColor" stroke-width="1.2"/>'],
	['hand', 'Hand Tool (H)', 'H', '<path d="M6 9V4.5a1 1 0 0 1 2 0V9V3.5a1 1 0 0 1 2 0V9V4.5a1 1 0 0 1 2 0V10l1-1.5a1 1 0 0 1 1.7 1L12 15H7l-3-4a1 1 0 0 1 1.5-1.3z" fill="none" stroke="currentColor" stroke-width="1.1"/>'],
	['zoom', 'Zoom Tool (Z)', 'Z', '<circle cx="7.5" cy="7.5" r="4.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M11 11l5 5" stroke="currentColor" stroke-width="1.6"/>'],
];
const COLORS = { h: '#ffd400', v: '#ff3cf0', null: '#00d5ff' };

/**
 * output pixel (x, y) -> source pixel for the lens model; null outside the source
 */
function projector(p, W, H) {
	var cx = W / 2, cy = H / 2;
	var diag = Math.hypot(W, H);
	var f = Math.max(1, p.focal) * Math.max(0.1, p.crop) * diag / 43.27;
	var sc = Math.max(0.05, p.scale / 100);
	if (p.correction == 'Full Spherical') {
		//equirectangular (2:1) source seen through a rectilinear lens
		return (x, y) => {
			var u = (x - cx) / sc / f, v = (y - cy) / sc / f;
			var len = Math.hypot(u, v, 1);
			var lon = Math.atan2(u, 1), lat = Math.asin(v / len);
			return [(lon / Math.PI + 1) / 2 * W, (lat / (Math.PI / 2) + 1) / 2 * H];
		};
	}
	if (p.correction == 'Perspective') {
		//rectilinear wide angle -> stereographic: less stretching toward the corners
		return (x, y) => {
			var dx = (x - cx) / sc, dy = (y - cy) / sc, r = Math.hypot(dx, dy);
			if (r < 1e-6) return [cx, cy];
			var theta = 2 * Math.atan(r / (2 * f));
			if (theta >= Math.PI / 2 - 1e-3) return null;
			var rs = f * Math.tan(theta);
			return [cx + dx / r * rs, cy + dy / r * rs];
		};
	}
	//Fisheye (equidistant) -> rectilinear
	return (x, y) => {
		var dx = (x - cx) / sc, dy = (y - cy) / sc, r = Math.hypot(dx, dy);
		if (r < 1e-6) return [cx, cy];
		var rs = f * Math.atan(r / f);
		return [cx + dx / r * rs, cy + dy / r * rs];
	};
}

/**
 * moving least squares (similarity): pairs [{ d: [x, y] target, r: [x, y] original }]
 * returns v -> original position
 */
function mls(pairs) {
	if (!pairs.length) return null;
	return (x, y) => {
		var sw = 0, dsx = 0, dsy = 0, rsx = 0, rsy = 0, ws = new Array(pairs.length);
		for (var i = 0; i < pairs.length; i++) {
			var d = pairs[i].d, dd = (d[0] - x) * (d[0] - x) + (d[1] - y) * (d[1] - y);
			if (dd < 1e-8) return [pairs[i].r[0], pairs[i].r[1]];
			var w = 1 / dd;
			ws[i] = w;
			sw += w;
			dsx += w * d[0]; dsy += w * d[1];
			rsx += w * pairs[i].r[0]; rsy += w * pairs[i].r[1];
		}
		dsx /= sw; dsy /= sw; rsx /= sw; rsy /= sw;
		var vx = x - dsx, vy = y - dsy, mu = 0, ox = 0, oy = 0;
		for (i = 0; i < pairs.length; i++) {
			var hx = pairs[i].d[0] - dsx, hy = pairs[i].d[1] - dsy;
			mu += ws[i] * (hx * hx + hy * hy);
		}
		if (mu < 1e-9) return [x - dsx + rsx, y - dsy + rsy];
		for (i = 0; i < pairs.length; i++) {
			var w2 = ws[i] / mu;
			hx = pairs[i].d[0] - dsx; hy = pairs[i].d[1] - dsy;
			var rx = pairs[i].r[0] - rsx, ry = pairs[i].r[1] - rsy;
			//A = w * [[hx, hy], [hy, -hx]] * [[vx, vy], [vy, -vx]]
			var a00 = hx * vx + hy * vy, a01 = hx * vy - hy * vx, a10 = hy * vx - hx * vy, a11 = hy * vy + hx * vx;
			ox += w2 * (rx * a00 + ry * a10);
			oy += w2 * (rx * a01 + ry * a11);
		}
		return [ox + rsx, oy + rsy];
	};
}

/**
 * constraint pairs: unfixed ones pin their points, Horizontal / Vertical ones are straightened
 */
function constraint_pairs(list, W, H) {
	var pairs = [];
	if (!list.some(c => c.orient)) return pairs;
	for (var c of list) {
		var a = [c.a[0] * W, c.a[1] * H], b = [c.b[0] * W, c.b[1] * H];
		var ta = a, tb = b;
		if (c.orient) {
			var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, len = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2;
			if (c.orient == 'h') { var sx = a[0] <= b[0] ? -1 : 1; ta = [mx + sx * len, my]; tb = [mx - sx * len, my]; }
			else { var sy = a[1] <= b[1] ? -1 : 1; ta = [mx, my + sy * len]; tb = [mx, my - sy * len]; }
		}
		for (var t = 0; t <= 4; t++) {
			var k = t / 4;
			pairs.push({ d: [ta[0] + (tb[0] - ta[0]) * k, ta[1] + (tb[1] - ta[1]) * k], r: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k] });
		}
	}
	return pairs;
}

/**
 * the corrected image: out(x) = src(lens(mls(x)))
 */
function correct(src, out, W, H, p, constraints, sample_w, sample_h) {
	var lens = projector(p, W, H);
	var warp = mls(constraint_pairs(constraints, W, H));
	//the warp is smooth: evaluate it on a grid and interpolate
	var G = 8, gw = Math.ceil(W / G) + 1, gh = Math.ceil(H / G) + 1;
	var gx = new Float32Array(gw * gh), gy = new Float32Array(gw * gh);
	for (var j = 0; j < gh; j++) for (var i = 0; i < gw; i++) {
		var q = warp ? warp(i * G, j * G) : [i * G, j * G];
		gx[j * gw + i] = q[0];
		gy[j * gw + i] = q[1];
	}
	for (var y = 0; y < H; y++) {
		var fy = y / G, j0 = Math.min(gh - 2, fy | 0), ty = fy - j0;
		for (var x = 0; x < W; x++) {
			var fx = x / G, i0 = Math.min(gw - 2, fx | 0), tx = fx - i0;
			var k00 = j0 * gw + i0, k10 = k00 + 1, k01 = k00 + gw, k11 = k01 + 1;
			var wx = (gx[k00] * (1 - tx) + gx[k10] * tx) * (1 - ty) + (gx[k01] * (1 - tx) + gx[k11] * tx) * ty;
			var wy = (gy[k00] * (1 - tx) + gy[k10] * tx) * (1 - ty) + (gy[k01] * (1 - tx) + gy[k11] * tx) * ty;
			var s = lens(wx, wy), o = (y * W + x) * 4;
			if (!s || s[0] < 0 || s[1] < 0 || s[0] > W - 1 || s[1] > H - 1) {
				out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
				continue;
			}
			var sx = s[0] * sample_w / W, sy = s[1] * sample_h / H;
			var x0 = Math.min(sample_w - 2, sx | 0), y0 = Math.min(sample_h - 2, sy | 0), ax = sx - x0, ay = sy - y0;
			if (sample_w < 2 || sample_h < 2) { x0 = y0 = 0; ax = ay = 0; }
			var a = (y0 * sample_w + x0) * 4, b = a + 4, c = a + sample_w * 4, d = c + 4;
			for (var ch = 0; ch < 4; ch++) {
				out[o + ch] = (src[a + ch] * (1 - ax) + src[b + ch] * ax) * (1 - ay) + (src[c + ch] * (1 - ax) + src[d + ch] * ax) * ay;
			}
		}
	}
	return warp;
}

class Ps_wide_angle_class {

	open() {
		ensure_pixel_layer();
		var layer = config.layer;
		if (!layer || layer.type != 'image' || !layer.link) {
			alert_box('Could not complete the Adaptive Wide Angle command because the active layer is not a pixel layer.');
			return;
		}
		var W = layer.width_original, H = layer.height_original;
		var max_w = Math.min(900, window.innerWidth - 380), max_h = Math.min(620, window.innerHeight - 160);
		var scale = Math.min(1, max_w / W, max_h / H);
		var pw = Math.max(2, Math.round(W * scale)), ph = Math.max(2, Math.round(H * scale));
		var c = document.createElement('canvas');
		c.width = pw;
		c.height = ph;
		var cctx = c.getContext('2d', { willReadFrequently: true });
		cctx.imageSmoothingQuality = 'high';
		cctx.drawImage(layer.link, 0, 0, pw, ph);
		var last = this.last || {};
		this.state = {
			layer: layer, W: W, H: H, pw: pw, ph: ph, scale: scale,
			src: cctx.getImageData(0, 0, pw, ph).data,
			tool: 'constraint',
			params: Object.assign({ correction: 'Fisheye', scale: 100, focal: 12, crop: 1, as_shot: false }, last.params || {}),
			constraints: [],
			preview: true, show_constraints: true,
		};
		this.build_ui();
		this.render();
	}

	build_ui() {
		var s = this.state, p = s.params;
		var el = document.createElement('div');
		el.className = 'popup ps_liquify ps_awa';
		el.style.display = 'block';
		var num = (key, label, min, max, step, unit) => '<div class="ps_lq_field"><span>' + label + '</span><input type="number" data-p="' + key + '" min="' + min + '" max="' + max + '" step="' + step + '">' + (unit ? '<span class="ps_awa_unit">' + unit + '</span>' : '') + '</div>';
		el.innerHTML = '<h2>Adaptive Wide Angle</h2>'
			+ '<div class="ps_lq_body">'
			+ '<div class="ps_lq_tools">' + TOOLS.map(([k, title, , icon]) => '<button type="button" data-tool="' + k + '" title="' + title + '"' + (k == s.tool ? ' class="pressed"' : '') + (k == 'polygon' || k == 'hand' || k == 'zoom' ? ' disabled' : '') + '><svg viewBox="0 0 18 18" width="18" height="18">' + icon + '</svg></button>').join('') + '</div>'
			+ '<div class="ps_lq_view"><canvas width="' + s.pw + '" height="' + s.ph + '"></canvas></div>'
			+ '<div class="ps_lq_side">'
			+ '<button type="button" class="button ps_lq_ok">OK</button><button type="button" class="button ps_lq_cancel">Cancel</button>'
			+ '<fieldset><legend>Correction</legend><div class="ps_lq_field"><span>Correction:</span><select data-p="correction">'
			+ ['Fisheye', 'Perspective', 'Auto', 'Full Spherical'].map(v => '<option' + (v == 'Auto' ? ' disabled' : '') + '>' + v + '</option>').join('') + '</select></div>'
			+ num('scale', 'Scale:', 50, 150, 1, '%') + num('focal', 'Focal Length:', 1, 200, 0.1, 'mm') + num('crop', 'Crop Factor:', 0.1, 10, 0.01, '')
			+ '<label class="ps_adj_check"><input type="checkbox" disabled> As Shot</label></fieldset>'
			+ '<fieldset><legend>View</legend>'
			+ '<label class="ps_adj_check"><input type="checkbox" class="ps_awa_preview" checked> Preview</label>'
			+ '<label class="ps_adj_check"><input type="checkbox" class="ps_awa_show" checked> Show Constraints</label>'
			+ '<label class="ps_adj_check"><input type="checkbox" disabled> Show Mesh</label></fieldset>'
			+ '<div class="ps_awa_hint">Drag along a line that should be straight. Shift: horizontal or vertical. Right-click a constraint to change it; Alt+click deletes.</div>'
			+ '</div></div>';
		document.getElementById('popups').appendChild(el);
		this.el = el;
		this.canvas = el.querySelector('canvas');
		this.ctx = this.canvas.getContext('2d');
		el.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => { if (!b.disabled) this.set_tool(b.dataset.tool); }));
		el.querySelectorAll('[data-p]').forEach((input) => {
			input.value = p[input.dataset.p];
			input.addEventListener('change', () => {
				var k = input.dataset.p;
				if (input.tagName == 'SELECT') p[k] = input.value;
				else {
					var v = parseFloat(input.value);
					if (!isNaN(v)) p[k] = Math.max(parseFloat(input.min), Math.min(parseFloat(input.max), v));
					input.value = p[k];
				}
				this.render();
			});
		});
		el.querySelector('.ps_awa_preview').addEventListener('change', (e) => { s.preview = e.target.checked; this.render(); });
		el.querySelector('.ps_awa_show').addEventListener('change', (e) => { s.show_constraints = e.target.checked; this.render(); });
		el.querySelector('.ps_lq_ok').addEventListener('click', () => this.apply());
		el.querySelector('.ps_lq_cancel').addEventListener('click', () => this.close());

		var pos = (e) => {
			var r = this.canvas.getBoundingClientRect();
			return [(e.clientX - r.left) * s.pw / r.width, (e.clientY - r.top) * s.ph / r.height];
		};
		//preview point -> constraint coordinates (before the constraint warp), 0..1
		var to_norm = (v, warp) => {
			warp = warp === undefined ? this.warp : warp;
			var q = warp ? warp(v[0], v[1]) : v;
			return [q[0] / s.pw, q[1] / s.ph];
		};
		var drag = null;
		this.canvas.addEventListener('mousedown', (e) => {
			if (e.button != 0) return;
			e.preventDefault();
			var v = pos(e), hit = this.hit(v);
			if (hit && e.altKey) {
				s.constraints.splice(hit.index, 1);
				this.render();
				return;
			}
			//points are placed through the warp as it was when the drag began
			if (hit && (s.tool == 'move' || hit.end)) {
				drag = { kind: 'end', hit: hit, warp: this.warp };
				return;
			}
			if (s.tool == 'constraint') {
				var n = to_norm(v);
				var c = { a: n, b: n, orient: null };
				s.constraints.push(c);
				drag = { kind: 'new', c: c, start: v, warp: this.warp };
			}
		});
		this.move = (e) => {
			if (!drag) return;
			var v = pos(e);
			if (drag.kind == 'new') {
				drag.c.b = to_norm(v, drag.warp);
				drag.c.orient = e.shiftKey ? (Math.abs(v[0] - drag.start[0]) >= Math.abs(v[1] - drag.start[1]) ? 'h' : 'v') : null;
				drag.moved = true;
			}
			else {
				var c2 = s.constraints[drag.hit.index];
				c2[drag.hit.end || 'b'] = to_norm(v, drag.warp);
			}
			this.render(true);
		};
		this.up = () => {
			if (drag && drag.kind == 'new' && !drag.moved) s.constraints.pop();
			if (drag) this.render();
			drag = null;
		};
		window.addEventListener('mousemove', this.move);
		window.addEventListener('mouseup', this.up);
		this.canvas.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			var hit = this.hit(pos(e));
			if (!hit) return;
			var c = s.constraints[hit.index];
			var set = (o) => () => { c.orient = o; this.render(); };
			show_popup_menu(this.canvas, [
				{ name: 'Unfixed', checked: !c.orient, action: set(null) },
				{ name: 'Horizontal', checked: c.orient == 'h', action: set('h') },
				{ name: 'Vertical', checked: c.orient == 'v', action: set('v') },
				{ name: 'Arbitrary' },
				{ divider: true },
				{ name: 'Delete', action: () => { s.constraints.splice(hit.index, 1); this.render(); } },
			], { point: { x: e.clientX, y: e.clientY } });
		});
		this.keys = (e) => {
			if (e.key == 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.close(); return; }
			if (e.key == 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); this.apply(); return; }
			var t = TOOLS.find(x => x[2] == e.key.toUpperCase());
			if (t && !e.ctrlKey && !e.metaKey && e.target.tagName != 'INPUT' && t[0] != 'polygon' && t[0] != 'hand' && t[0] != 'zoom') {
				this.set_tool(t[0]);
				e.preventDefault();
				e.stopImmediatePropagation();
			}
		};
		window.addEventListener('keydown', this.keys, true);
	}

	set_tool(tool) {
		this.state.tool = tool;
		this.el.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('pressed', b.dataset.tool == tool));
	}

	/**
	 * a constraint's screen points: where its ends show on the preview
	 */
	screen_points(c) {
		var s = this.state;
		var pairs = constraint_pairs([c], s.pw, s.ph);
		if (pairs.length) return [pairs[0].d, pairs[pairs.length - 1].d];
		return [[c.a[0] * s.pw, c.a[1] * s.ph], [c.b[0] * s.pw, c.b[1] * s.ph]];
	}

	hit(v) {
		var s = this.state, best = null;
		s.constraints.forEach((c, i) => {
			var [a, b] = this.screen_points(c);
			for (var [end, p] of [['a', a], ['b', b]]) {
				if (Math.hypot(p[0] - v[0], p[1] - v[1]) < 7) best = { index: i, end: end };
			}
			if (best) return;
			var dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
			var t = l2 ? Math.max(0, Math.min(1, ((v[0] - a[0]) * dx + (v[1] - a[1]) * dy) / l2)) : 0;
			if (Math.hypot(a[0] + dx * t - v[0], a[1] + dy * t - v[1]) < 5) best = best || { index: i, end: null };
		});
		return best;
	}

	render(fast) {
		var s = this.state;
		var ctx = this.ctx;
		//while dragging a new unfixed constraint the image does not change
		var oriented = s.constraints.some(c => c.orient);
		if (!fast || oriented || !this.image) {
			var out = ctx.createImageData(s.pw, s.ph);
			if (s.preview) {
				this.warp = correct(s.src, out.data, s.pw, s.ph, s.params, s.constraints, s.pw, s.ph);
			}
			else {
				out.data.set(s.src);
				this.warp = null;
			}
			this.image = out;
		}
		ctx.clearRect(0, 0, s.pw, s.ph);
		//transparent areas: checkerboard
		for (var y = 0; y < s.ph; y += 8) for (var x = 0; x < s.pw; x += 8) {
			ctx.fillStyle = ((x + y) / 8) % 2 ? '#cccccc' : '#ffffff';
			ctx.fillRect(x, y, 8, 8);
		}
		var tmp = document.createElement('canvas');
		tmp.width = s.pw;
		tmp.height = s.ph;
		tmp.getContext('2d').putImageData(this.image, 0, 0);
		ctx.drawImage(tmp, 0, 0);
		if (!s.show_constraints) return;
		for (var c of s.constraints) {
			var [a, b] = this.screen_points(c);
			ctx.strokeStyle = COLORS[c.orient] || COLORS.null;
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(a[0], a[1]);
			ctx.lineTo(b[0], b[1]);
			ctx.stroke();
			ctx.fillStyle = '#fff';
			for (var p of [a, b]) {
				ctx.beginPath();
				ctx.arc(p[0], p[1], 3.5, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
			}
		}
	}

	apply() {
		var s = this.state;
		var full = document.createElement('canvas');
		full.width = s.W;
		full.height = s.H;
		var fctx = full.getContext('2d', { willReadFrequently: true });
		fctx.drawImage(s.layer.link, 0, 0);
		var src = fctx.getImageData(0, 0, s.W, s.H);
		var out = fctx.createImageData(s.W, s.H);
		correct(src.data, out.data, s.W, s.H, s.params, s.constraints, s.W, s.H);
		fctx.putImageData(out, 0, 0);
		var layer = s.layer;
		this.last = { params: Object.assign({}, s.params) };
		this.close();
		var result = app.GUI.Ps_workspace.Selection.restrict(full, layer);
		app.State.do_action(new app.Actions.Bundle_action('adaptive_wide_angle', 'Adaptive Wide Angle', [
			new app.Actions.Update_layer_image_action(result, layer.id),
		]));
	}

	close() {
		window.removeEventListener('mousemove', this.move);
		window.removeEventListener('mouseup', this.up);
		window.removeEventListener('keydown', this.keys, true);
		if (this.el) this.el.remove();
		this.el = null;
		this.state = null;
		this.image = null;
		this.warp = null;
	}
}

export default Ps_wide_angle_class;
export { projector, mls, constraint_pairs };
