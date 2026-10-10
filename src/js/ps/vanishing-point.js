/*
 * pshot - CS6 Filter > Vanishing Point (Alt+Ctrl+V).
 *
 * Perspective planes (four corners, Create Plane / Edit Plane) define a
 * mapping from the plane's own square (u, v in 0..1) to the image. The
 * Marquee, Stamp and Brush tools work in that space: a marquee dragged with
 * Alt copies its pixels along the plane, Ctrl+V pastes the clipboard onto the
 * plane, the Stamp clones and the Brush paints with dabs that shrink with
 * distance. Planes are kept with the document. OK writes the result to the
 * active layer as one History step.
 */

import app from './../app.js';
import config from './../config.js';
import { ensure_pixel_layer, alert_box } from './pixel-layer.js';

const TOOLS = [
	['edit', 'Edit Plane Tool (V)', 'V', '<path d="M4 3l9 6-4 1 3 5-2 1-3-5-3 3z" fill="currentColor"/>'],
	['create', 'Create Plane Tool (C)', 'C', '<path d="M3 15L6 4h9l-3 11z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 8h3M9.5 6.5v3" stroke="currentColor" stroke-width="1.2"/>'],
	['marquee', 'Marquee Tool (M)', 'M', '<path d="M3 15L6 4h9l-3 11z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 1.5"/>'],
	['stamp', 'Stamp Tool (S)', 'S', '<path d="M6 3h6v4l-1 2h3v3H4V9h3L6 7z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M4 14h10" stroke="currentColor" stroke-width="1.6"/>'],
	['brush', 'Brush Tool (B)', 'B', '<path d="M14 3L8 10M8 10c-2-1-4 1-4 3 0 1-1 2-2 2 3 1 6 0 6-3" fill="none" stroke="currentColor" stroke-width="1.3"/>'],
	['transform', 'Transform Tool (T)', 'T', '<rect x="4" y="4" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2 2h3v3H2zM13 2h3v3h-3zM2 13h3v3H2zM13 13h3v3h-3z" fill="currentColor"/>'],
	['eyedropper', 'Eyedropper Tool (I)', 'I', '<path d="M12 3l3 3-7 7H5v-3zM10 5l3 3" fill="none" stroke="currentColor" stroke-width="1.3"/>'],
	['measure', 'Measure Tool (R)', 'R', '<path d="M2 12l10-10 4 4L6 16z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5 9l1.5 1.5M7.5 6.5L9 8M10 4l1.5 1.5" stroke="currentColor" stroke-width="1.1"/>'],
	['hand', 'Hand Tool (H)', 'H', '<path d="M6 9V4.5a1 1 0 0 1 2 0V9V3.5a1 1 0 0 1 2 0V9V4.5a1 1 0 0 1 2 0V10l1-1.5a1 1 0 0 1 1.7 1L12 15H7l-3-4a1 1 0 0 1 1.5-1.3z" fill="none" stroke="currentColor" stroke-width="1.1"/>'],
	['zoom', 'Zoom Tool (Z)', 'Z', '<circle cx="7.5" cy="7.5" r="4.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M11 11l5 5" stroke="currentColor" stroke-width="1.6"/>'],
];
const UNBUILT = ['transform', 'measure', 'hand', 'zoom'];

// ---------- homography: the unit square -> a quad ----------

function square_to_quad(q) {
	var [p0, p1, p2, p3] = q;
	var sx = p0.x - p1.x + p2.x - p3.x, sy = p0.y - p1.y + p2.y - p3.y;
	var a, b, c, d, e, f, g, h;
	if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
		a = p1.x - p0.x; b = p2.x - p1.x; c = p0.x;
		d = p1.y - p0.y; e = p2.y - p1.y; f = p0.y;
		g = 0; h = 0;
	}
	else {
		var dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dy1 = p1.y - p2.y, dy2 = p3.y - p2.y;
		var den = dx1 * dy2 - dx2 * dy1;
		g = (sx * dy2 - dx2 * sy) / den;
		h = (dx1 * sy - sx * dy1) / den;
		a = p1.x - p0.x + g * p1.x; b = p3.x - p0.x + h * p3.x; c = p0.x;
		d = p1.y - p0.y + g * p1.y; e = p3.y - p0.y + h * p3.y; f = p0.y;
	}
	//p0 = (0,0), p1 = (1,0), p2 = (1,1), p3 = (0,1)
	return [a, b, c, d, e, f, g, h, 1];
}

function invert(m) {
	var [a, b, c, d, e, f, g, h, i] = m;
	var A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
	var det = a * A + b * B + c * C;
	if (Math.abs(det) < 1e-12) return null;
	return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

function apply(m, x, y) {
	var w = m[6] * x + m[7] * y + m[8];
	return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

/**
 * a usable plane: convex, corners in order (CS6 shows other planes red)
 */
function valid(pts) {
	if (pts.length != 4) return false;
	var sign = 0;
	for (var i = 0; i < 4; i++) {
		var a = pts[i], b = pts[(i + 1) % 4], c = pts[(i + 2) % 4];
		var cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
		if (Math.abs(cr) < 1e-6) return false;
		var s = cr > 0 ? 1 : -1;
		if (sign && s != sign) return false;
		sign = s;
	}
	return true;
}

function inside(pts, x, y) {
	var c = false;
	for (var i = 0, j = 3; i < 4; j = i++) {
		if ((pts[i].y > y) != (pts[j].y > y) && x < (pts[j].x - pts[i].x) * (y - pts[i].y) / (pts[j].y - pts[i].y) + pts[i].x) c = !c;
	}
	return c;
}

class Ps_vanishing_point_class {

	open() {
		ensure_pixel_layer();
		var layer = config.layer;
		if (!layer || layer.type != 'image' || !layer.link) {
			alert_box('Could not complete the Vanishing Point command because the active layer is not a pixel layer.');
			return;
		}
		var W = layer.width_original, H = layer.height_original;
		var work = document.createElement('canvas');
		work.width = W;
		work.height = H;
		var wctx = work.getContext('2d', { willReadFrequently: true });
		wctx.drawImage(layer.link, 0, 0);
		var max_w = Math.min(960, window.innerWidth - 300), max_h = Math.min(620, window.innerHeight - 190);
		var k = Math.min(1, max_w / W, max_h / H);
		this.state = {
			layer: layer, W: W, H: H, k: k, vw: Math.max(1, Math.round(W * k)), vh: Math.max(1, Math.round(H * k)),
			work: work, wctx: wctx, img: wctx.getImageData(0, 0, W, H),
			planes: JSON.parse(JSON.stringify(config.ps_vp_planes || [])),
			selected: -1, pending: [], tool: (config.ps_vp_planes || []).length ? 'edit' : 'create',
			grid: 100, diameter: 40, hardness: 50, opacity: 100, color: config.COLOR, aligned: true, mode: 'Destination',
			marquee: null, source: null,
		};
		if (this.state.planes.length) this.state.selected = 0;
		this.build_ui();
		this.render();
	}

	plane_matrix(i) {
		var p = this.state.planes[i];
		if (!p || !valid(p.pts)) return null;
		var m = square_to_quad(p.pts);
		return { m: m, inv: invert(m) };
	}

	plane_at(x, y) {
		var s = this.state;
		for (var i = s.planes.length - 1; i >= 0; i--) if (valid(s.planes[i].pts) && inside(s.planes[i].pts, x, y)) return i;
		return -1;
	}

	build_ui() {
		var s = this.state;
		var el = document.createElement('div');
		el.className = 'popup ps_liquify ps_vp';
		el.style.display = 'block';
		el.innerHTML = '<h2>Vanishing Point</h2>'
			+ '<div class="ps_vp_options"></div>'
			+ '<div class="ps_lq_body">'
			+ '<div class="ps_lq_tools">' + TOOLS.map(([key, title, , icon]) => '<button type="button" data-tool="' + key + '" title="' + title + '"' + (key == s.tool ? ' class="pressed"' : '') + (UNBUILT.includes(key) ? ' disabled' : '') + '><svg viewBox="0 0 18 18" width="18" height="18">' + icon + '</svg></button>').join('') + '</div>'
			+ '<div class="ps_lq_view"><canvas width="' + s.vw + '" height="' + s.vh + '"></canvas></div>'
			+ '<div class="ps_lq_side ps_vp_side"><button type="button" class="button ps_lq_ok">OK</button><button type="button" class="button ps_lq_cancel">Cancel</button>'
			+ '<div class="ps_awa_hint ps_vp_hint"></div></div>'
			+ '</div>';
		document.getElementById('popups').appendChild(el);
		this.el = el;
		this.canvas = el.querySelector('canvas');
		this.ctx = this.canvas.getContext('2d');
		el.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => { if (!b.disabled) this.set_tool(b.dataset.tool); }));
		el.querySelector('.ps_lq_ok').addEventListener('click', () => this.apply());
		el.querySelector('.ps_lq_cancel').addEventListener('click', () => this.close());
		this.render_options();

		var pos = (e) => {
			var r = this.canvas.getBoundingClientRect();
			return { x: (e.clientX - r.left) / r.width * s.W, y: (e.clientY - r.top) / r.height * s.H };
		};
		this.canvas.addEventListener('mousedown', (e) => {
			if (e.button != 0) return;
			e.preventDefault();
			this.down(pos(e), e);
		});
		this.move = (e) => {
			if (!this.el) return;
			var r = this.canvas.getBoundingClientRect();
			if (!this.drag && (e.clientX < r.left || e.clientY < r.top || e.clientX > r.right || e.clientY > r.bottom)) return;
			this.cursor = pos(e);
			if (this.drag) this.drag_move(this.cursor, e);
			this.render();
		};
		this.up = (e) => {
			if (this.drag) this.drag_end(pos(e), e);
			this.drag = null;
		};
		window.addEventListener('mousemove', this.move);
		window.addEventListener('mouseup', this.up);
		this.keys = (e) => {
			if (!this.el) return;
			if (e.key == 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (s.pending.length) { s.pending = []; this.render(); } else this.close(); return; }
			if (e.key == 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); this.apply(); return; }
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() == 'v') { e.preventDefault(); e.stopImmediatePropagation(); this.paste(); return; }
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() == 'd') { e.preventDefault(); e.stopImmediatePropagation(); this.commit_float(); s.marquee = null; this.render(); return; }
			if ((e.key == 'Delete' || e.key == 'Backspace') && e.target.tagName != 'INPUT') {
				e.preventDefault(); e.stopImmediatePropagation();
				if (s.marquee) { s.marquee = null; }
				else if (s.selected >= 0) { s.planes.splice(s.selected, 1); s.selected = s.planes.length - 1; }
				this.render();
				return;
			}
			if (e.key == '[' || e.key == ']') { s.diameter = Math.max(1, s.diameter + (e.key == ']' ? 5 : -5)); this.render_options(); this.render(); e.preventDefault(); e.stopImmediatePropagation(); return; }
			var t = TOOLS.find(x => x[2] == e.key.toUpperCase());
			if (t && !UNBUILT.includes(t[0]) && !e.ctrlKey && !e.metaKey && !e.altKey && e.target.tagName != 'INPUT') { this.set_tool(t[0]); e.preventDefault(); e.stopImmediatePropagation(); }
		};
		window.addEventListener('keydown', this.keys, true);
	}

	set_tool(tool) {
		var s = this.state;
		if (tool != 'marquee') this.commit_float();
		s.tool = tool;
		this.el.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('pressed', b.dataset.tool == tool));
		this.render_options();
		this.render();
	}

	render_options() {
		var s = this.state, bar = this.el.querySelector('.ps_vp_options');
		var num = (key, label, min, max, unit) => '<label class="ps_vp_opt">' + label + ' <input type="number" data-o="' + key + '" min="' + min + '" max="' + max + '" value="' + s[key] + '">' + (unit || '') + '</label>';
		var hint = {
			edit: 'Drag a corner to adjust the plane; Delete removes it.',
			create: 'Click four corners to define a plane in perspective.',
			marquee: 'Drag on a plane to select. Alt+drag the selection to copy it along the plane; Ctrl+V pastes the clipboard.',
			stamp: 'Alt+click to set the source, then paint to clone in perspective.',
			brush: 'Paint in perspective with the brush color.',
			eyedropper: 'Click to pick the brush color.',
		}[s.tool] || '';
		var html = '';
		if (s.tool == 'edit' || s.tool == 'create') html = num('grid', 'Grid Size:', 4, 1000);
		else if (s.tool == 'marquee') html = '<label class="ps_vp_opt">Feather: <input type="number" value="1" disabled></label>' + num('opacity', 'Opacity:', 1, 100, '%') + '<label class="ps_vp_opt">Heal: <select disabled><option>Off</option></select></label>'
			+ '<label class="ps_vp_opt">Move Mode: <select data-o="mode"><option' + (s.mode == 'Destination' ? ' selected' : '') + '>Destination</option><option' + (s.mode == 'Source' ? ' selected' : '') + '>Source</option></select></label>';
		else if (s.tool == 'stamp') html = num('diameter', 'Diameter:', 1, 500) + num('hardness', 'Hardness:', 0, 100) + num('opacity', 'Opacity:', 1, 100, '%') + '<label class="ps_vp_opt"><input type="checkbox" data-o="aligned"' + (s.aligned ? ' checked' : '') + '> Aligned</label>';
		else if (s.tool == 'brush') html = num('diameter', 'Diameter:', 1, 500) + num('hardness', 'Hardness:', 0, 100) + num('opacity', 'Opacity:', 1, 100, '%') + '<label class="ps_vp_opt">Brush Color: <button type="button" class="ps_vp_color" style="background:' + s.color + '"></button></label>';
		bar.innerHTML = html;
		this.el.querySelector('.ps_vp_hint').textContent = hint;
		bar.querySelectorAll('[data-o]').forEach((input) => {
			input.addEventListener('keydown', (e) => e.stopPropagation());
			input.addEventListener('change', () => {
				var key = input.dataset.o;
				if (input.type == 'checkbox') s[key] = input.checked;
				else if (input.tagName == 'SELECT') s[key] = input.value;
				else {
					var v = parseFloat(input.value);
					if (!isNaN(v)) s[key] = Math.max(parseFloat(input.min), Math.min(parseFloat(input.max), v));
					input.value = s[key];
				}
				this.render();
			});
		});
		var cb = bar.querySelector('.ps_vp_color');
		if (cb) cb.addEventListener('click', () => app.GUI.Ps_workspace.color_dialog('Brush Color', s.color, (hex) => { s.color = hex; this.render_options(); }));
	}

	// ---------- mouse ----------

	down(p, e) {
		var s = this.state, tol = 8 / s.k;
		if (s.tool == 'create') {
			s.pending.push(p);
			if (s.pending.length == 4) {
				s.planes.push({ pts: s.pending });
				s.pending = [];
				s.selected = s.planes.length - 1;
				//CS6: after the fourth corner the Edit Plane tool is active
				this.set_tool('edit');
			}
			this.render();
			return;
		}
		if (s.tool == 'edit') {
			for (var i = s.planes.length - 1; i >= 0; i--) {
				var pts = s.planes[i].pts;
				for (var c = 0; c < 4; c++) {
					if (Math.hypot(pts[c].x - p.x, pts[c].y - p.y) <= tol) {
						s.selected = i;
						this.drag = { kind: 'corner', plane: i, corner: c };
						return;
					}
				}
			}
			var hit = this.plane_at(p.x, p.y);
			s.selected = hit;
			if (hit >= 0) this.drag = { kind: 'plane', plane: hit, last: p };
			this.render();
			return;
		}
		if (s.tool == 'eyedropper') {
			var o = (Math.round(Math.min(s.H - 1, Math.max(0, p.y))) * s.W + Math.round(Math.min(s.W - 1, Math.max(0, p.x)))) * 4, d = s.img.data;
			s.color = '#' + [d[o], d[o + 1], d[o + 2]].map(v => v.toString(16).padStart(2, '0')).join('');
			this.render_options();
			return;
		}
		var pi = this.plane_at(p.x, p.y);
		if (s.tool == 'stamp') {
			if (e.altKey) {
				if (pi >= 0) s.source = { plane: pi, uv: this.to_uv(pi, p) };
				this.render();
				return;
			}
			if (!s.source || pi < 0) return;
			var uv = this.to_uv(pi, p);
			if (!s.aligned || !s.offset || s.offset.plane != pi) s.offset = { plane: pi, du: uv[0] - s.source.uv[0], dv: uv[1] - s.source.uv[1] };
			this.drag = { kind: 'paint', plane: pi, last: p };
			this.dab(pi, p);
			return;
		}
		if (s.tool == 'brush') {
			if (pi < 0) return;
			this.drag = { kind: 'paint', plane: pi, last: p };
			this.dab(pi, p);
			return;
		}
		if (s.tool == 'marquee') {
			var m = s.marquee;
			if (m && pi == m.plane && this.in_marquee(p)) {
				var uv0 = this.to_uv(m.plane, p);
				if (e.altKey && !m.float) m.float = { du: 0, dv: 0, src: [m.u0, m.v0, m.u1, m.v1] };
				if ((e.ctrlKey || e.metaKey) && !m.float) m.float = { du: 0, dv: 0, src: [m.u0, m.v0, m.u1, m.v1], fill_from: true };
				this.drag = { kind: 'marquee_move', start: uv0, orig: [m.u0, m.v0, m.u1, m.v1] };
				return;
			}
			this.commit_float();
			if (pi < 0) {
				s.marquee = null;
				this.render();
				return;
			}
			var uv1 = this.to_uv(pi, p);
			s.marquee = { plane: pi, u0: uv1[0], v0: uv1[1], u1: uv1[0], v1: uv1[1], float: null };
			this.drag = { kind: 'marquee_new' };
		}
	}

	drag_move(p, e) {
		var s = this.state, d = this.drag;
		if (d.kind == 'corner') {
			s.planes[d.plane].pts[d.corner] = p;
		}
		else if (d.kind == 'plane') {
			var dx = p.x - d.last.x, dy = p.y - d.last.y;
			s.planes[d.plane].pts = s.planes[d.plane].pts.map(q => ({ x: q.x + dx, y: q.y + dy }));
			d.last = p;
		}
		else if (d.kind == 'paint') {
			var step = Math.max(1, s.diameter / 4), dist = Math.hypot(p.x - d.last.x, p.y - d.last.y);
			for (var t = step; t <= dist; t += step) {
				var q = { x: d.last.x + (p.x - d.last.x) * t / dist, y: d.last.y + (p.y - d.last.y) * t / dist };
				if (inside(s.planes[d.plane].pts, q.x, q.y)) this.dab(d.plane, q);
			}
			if (dist >= step) d.last = p;
		}
		else if (d.kind == 'marquee_new') {
			var uv = this.to_uv(s.marquee.plane, p);
			s.marquee.u1 = uv[0];
			s.marquee.v1 = uv[1];
		}
		else if (d.kind == 'marquee_move') {
			var m = s.marquee, cur = this.to_uv(m.plane, p);
			var du = cur[0] - d.start[0], dv = cur[1] - d.start[1];
			if (m.float && m.float.fill_from) {
				//Ctrl+drag: the selection shows (and takes) the pixels under the pointer
				m.float.du = -du; m.float.dv = -dv;
				return;
			}
			m.u0 = d.orig[0] + du; m.v0 = d.orig[1] + dv; m.u1 = d.orig[2] + du; m.v1 = d.orig[3] + dv;
			if (m.float) { m.float.du = m.u0 - m.float.src[0]; m.float.dv = m.v0 - m.float.src[1]; }
		}
	}

	drag_end() {
		var s = this.state, d = this.drag;
		if (d.kind == 'marquee_new') {
			var m = s.marquee;
			if (Math.abs(m.u1 - m.u0) < 1e-3 || Math.abs(m.v1 - m.v0) < 1e-3) s.marquee = null;
			else {
				var u0 = Math.min(m.u0, m.u1), u1 = Math.max(m.u0, m.u1), v0 = Math.min(m.v0, m.v1), v1 = Math.max(m.v0, m.v1);
				Object.assign(m, { u0: u0, u1: u1, v0: v0, v1: v1 });
			}
		}
		if (d.kind == 'marquee_move' && s.marquee && s.marquee.float && s.marquee.float.fill_from) {
			this.commit_float();
		}
		this.render();
	}

	to_uv(plane, p) {
		var pm = this.plane_matrix(plane);
		return pm ? apply(pm.inv, p.x, p.y) : [0, 0];
	}

	in_marquee(p) {
		var m = this.state.marquee;
		var uv = this.to_uv(m.plane, p);
		return uv[0] >= m.u0 && uv[0] <= m.u1 && uv[1] >= m.v0 && uv[1] <= m.v1;
	}

	/**
	 * the plane's local scale at p (1 = the plane's average)
	 */
	local_scale(plane, p) {
		var pm = this.plane_matrix(plane), s = this.state;
		var uv = apply(pm.inv, p.x, p.y), e = 1e-3;
		var a = apply(pm.m, uv[0] + e, uv[1]), b = apply(pm.m, uv[0], uv[1] + e);
		var area = Math.abs((a[0] - p.x) * (b[1] - p.y) - (a[1] - p.y) * (b[0] - p.x)) / (e * e);
		var pts = s.planes[plane].pts;
		var mean = Math.abs((pts[0].x * pts[1].y - pts[1].x * pts[0].y) + (pts[1].x * pts[2].y - pts[2].x * pts[1].y) + (pts[2].x * pts[3].y - pts[3].x * pts[2].y) + (pts[3].x * pts[0].y - pts[0].x * pts[3].y)) / 2;
		return Math.sqrt(area / Math.max(1e-6, mean));
	}

	/**
	 * one Stamp / Brush dab at p on a plane
	 */
	dab(plane, p) {
		var s = this.state, pm = this.plane_matrix(plane);
		if (!pm) return;
		var r = Math.max(0.5, s.diameter / 2 * this.local_scale(plane, p));
		var d = s.img.data, W = s.W, H = s.H, op = s.opacity / 100, hard = s.hardness / 100;
		var col = [parseInt(s.color.slice(1, 3), 16), parseInt(s.color.slice(3, 5), 16), parseInt(s.color.slice(5, 7), 16)];
		var x0 = Math.max(0, Math.floor(p.x - r)), x1 = Math.min(W - 1, Math.ceil(p.x + r));
		var y0 = Math.max(0, Math.floor(p.y - r)), y1 = Math.min(H - 1, Math.ceil(p.y + r));
		var pts = s.planes[plane].pts;
		for (var y = y0; y <= y1; y++) {
			for (var x = x0; x <= x1; x++) {
				var dist = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) / r;
				if (dist > 1 || !inside(pts, x + 0.5, y + 0.5)) continue;
				var a = (dist <= hard ? 1 : Math.max(0, (1 - dist) / Math.max(1e-6, 1 - hard))) * op;
				var o = (y * W + x) * 4, rgb;
				if (s.tool == 'stamp') {
					var uv = apply(pm.inv, x + 0.5, y + 0.5);
					var q = apply(pm.m, uv[0] - s.offset.du, uv[1] - s.offset.dv);
					var sx = Math.round(q[0] - 0.5), sy = Math.round(q[1] - 0.5);
					if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
					var so = (sy * W + sx) * 4;
					rgb = [d[so], d[so + 1], d[so + 2], d[so + 3]];
				}
				else rgb = [col[0], col[1], col[2], 255];
				for (var c = 0; c < 4; c++) d[o + c] = d[o + c] + (rgb[c] - d[o + c]) * a;
			}
		}
		this.dirty = true;
	}

	// ---------- marquee copies and paste ----------

	/**
	 * the floating pixels (copied area or pasted image) written into the image
	 */
	commit_float() {
		var s = this.state, m = s.marquee;
		if (!m || !m.float) return;
		var f = m.float;
		if (!f.du && !f.dv && !f.image) { m.float = null; return; }
		var pm = this.plane_matrix(m.plane);
		var target = f.fill_from ? f.src : [m.u0, m.v0, m.u1, m.v1];
		var out = this.render_float(pm, m, target);
		if (out) {
			var d = s.img.data, op = s.opacity / 100;
			for (var i = 0; i < out.mask.length; i++) {
				var a = out.mask[i] * op;
				if (!a) continue;
				var o = out.index[i];
				for (var c = 0; c < 4; c++) d[o + c] = d[o + c] + (out.rgba[i * 4 + c] - d[o + c]) * a;
			}
			this.dirty = true;
		}
		if (f.fill_from) { m.u0 = f.src[0]; m.v0 = f.src[1]; m.u1 = f.src[2]; m.v1 = f.src[3]; }
		m.float = null;
	}

	/**
	 * pixels of the float over its target rectangle [u0, v0, u1, v1]
	 */
	render_float(pm, m, target) {
		var s = this.state, f = m.float, W = s.W, H = s.H, d = s.img.data;
		if (!pm) return null;
		var corners = [[target[0], target[1]], [target[2], target[1]], [target[2], target[3]], [target[0], target[3]]].map(c => apply(pm.m, c[0], c[1]));
		var bx0 = Math.max(0, Math.floor(Math.min(...corners.map(c => c[0])))), bx1 = Math.min(W - 1, Math.ceil(Math.max(...corners.map(c => c[0]))));
		var by0 = Math.max(0, Math.floor(Math.min(...corners.map(c => c[1])))), by1 = Math.min(H - 1, Math.ceil(Math.max(...corners.map(c => c[1]))));
		var index = [], mask = [], rgba = [];
		for (var y = by0; y <= by1; y++) {
			for (var x = bx0; x <= bx1; x++) {
				var uv = apply(pm.inv, x + 0.5, y + 0.5);
				if (uv[0] < target[0] || uv[0] > target[2] || uv[1] < target[1] || uv[1] > target[3]) continue;
				var px;
				if (f.image) {
					var iu = (uv[0] - target[0]) / (target[2] - target[0]), iv = (uv[1] - target[1]) / (target[3] - target[1]);
					var ix = Math.min(f.image.width - 1, Math.max(0, Math.floor(iu * f.image.width))), iy = Math.min(f.image.height - 1, Math.max(0, Math.floor(iv * f.image.height)));
					var io = (iy * f.image.width + ix) * 4;
					px = [f.image.data[io], f.image.data[io + 1], f.image.data[io + 2], f.image.data[io + 3]];
				}
				else {
					var q = apply(pm.m, uv[0] - f.du, uv[1] - f.dv);
					var sx = Math.floor(q[0]), sy = Math.floor(q[1]);
					if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
					var so = (sy * W + sx) * 4;
					px = [d[so], d[so + 1], d[so + 2], d[so + 3]];
				}
				index.push((y * W + x) * 4);
				mask.push(f.image ? px[3] / 255 : 1);
				rgba.push(px[0], px[1], px[2], f.image ? 255 : px[3]);
			}
		}
		return { index: index, mask: mask, rgba: rgba };
	}

	/**
	 * Ctrl+V: the clipboard on the selected plane (drag it into place, Ctrl+D to drop)
	 */
	paste() {
		var s = this.state, commands = app.GUI.modules['ps/commands'];
		var clip = commands.clipboard && commands.clipboard.canvas;
		var pi = s.selected >= 0 ? s.selected : 0;
		if (!clip || !this.plane_matrix(pi)) {
			app.GUI.Ps_workspace.status_message(clip ? 'Create a plane first.' : 'Copy something first (Edit > Copy) to paste it onto a plane.');
			return;
		}
		this.commit_float();
		var img = clip.getContext('2d').getImageData(0, 0, clip.width, clip.height);
		//sized to the plane, keeping the pasted image's proportions roughly
		var pts = s.planes[pi].pts;
		var pw = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y), ph = Math.hypot(pts[3].x - pts[0].x, pts[3].y - pts[0].y);
		var fu = Math.min(0.8, clip.width / Math.max(1, pw)), fv = Math.min(0.8, clip.height / Math.max(1, ph));
		var ratio = Math.min(1, 0.8 / Math.max(fu, fv, 1e-6));
		fu *= ratio; fv *= ratio;
		s.marquee = { plane: pi, u0: 0.5 - fu / 2, v0: 0.5 - fv / 2, u1: 0.5 + fu / 2, v1: 0.5 + fv / 2, float: { du: 0, dv: 0, image: img, src: [0, 0, 0, 0] } };
		this.set_tool('marquee');
	}

	// ---------- drawing ----------

	render() {
		var s = this.state, ctx = this.ctx, k = s.k;
		if (this.dirty) {
			s.wctx.putImageData(s.img, 0, 0);
			this.dirty = false;
		}
		ctx.clearRect(0, 0, s.vw, s.vh);
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, s.vw, s.vh);
		ctx.drawImage(s.work, 0, 0, s.vw, s.vh);
		//a float (Alt-drag copy or paste) shows at its place
		var m = s.marquee;
		if (m && m.float) {
			var pm = this.plane_matrix(m.plane);
			var target = m.float.fill_from ? m.float.src : [m.u0, m.v0, m.u1, m.v1];
			var out = this.render_float(pm, m, target);
			if (out && out.index.length) {
				var tmp = document.createElement('canvas');
				tmp.width = s.W;
				tmp.height = s.H;
				var tctx = tmp.getContext('2d');
				var id = tctx.createImageData(s.W, s.H);
				for (var i = 0; i < out.index.length; i++) {
					var o = out.index[i];
					id.data[o] = out.rgba[i * 4]; id.data[o + 1] = out.rgba[i * 4 + 1]; id.data[o + 2] = out.rgba[i * 4 + 2];
					id.data[o + 3] = out.mask[i] * 255 * s.opacity / 100;
				}
				tctx.putImageData(id, 0, 0);
				ctx.drawImage(tmp, 0, 0, s.vw, s.vh);
			}
		}
		ctx.save();
		ctx.scale(k, k);
		ctx.lineWidth = 1 / k;
		s.planes.forEach((plane, i) => {
			var ok = valid(plane.pts), pts = plane.pts;
			ctx.strokeStyle = ok ? (i == s.selected ? '#3d8bff' : '#2a5fb0') : '#ff3b30';
			if (ok) {
				//the perspective grid
				var mm = square_to_quad(pts), side = Math.max(Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y), Math.hypot(pts[3].x - pts[0].x, pts[3].y - pts[0].y));
				var n = Math.max(1, Math.min(64, Math.round(side / s.grid)));
				ctx.globalAlpha = 0.55;
				ctx.beginPath();
				for (var g = 1; g < n; g++) {
					var t = g / n, a = apply(mm, t, 0), b = apply(mm, t, 1), c = apply(mm, 0, t), d = apply(mm, 1, t);
					ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
					ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
				}
				ctx.stroke();
				ctx.globalAlpha = 1;
			}
			ctx.beginPath();
			pts.forEach((q, j) => (j ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
			ctx.closePath();
			ctx.stroke();
			if (s.tool == 'edit' && i == s.selected) {
				ctx.fillStyle = '#fff';
				var hs = 4 / k;
				pts.forEach(q => { ctx.fillRect(q.x - hs, q.y - hs, hs * 2, hs * 2); ctx.strokeRect(q.x - hs, q.y - hs, hs * 2, hs * 2); });
			}
		});
		if (s.pending.length) {
			ctx.strokeStyle = '#3d8bff';
			ctx.beginPath();
			s.pending.forEach((q, j) => (j ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
			if (this.cursor) ctx.lineTo(this.cursor.x, this.cursor.y);
			ctx.stroke();
			ctx.fillStyle = '#fff';
			s.pending.forEach(q => ctx.fillRect(q.x - 3 / k, q.y - 3 / k, 6 / k, 6 / k));
		}
		if (m) {
			var mm2 = this.plane_matrix(m.plane);
			if (mm2) {
				var q4 = [[m.u0, m.v0], [m.u1, m.v0], [m.u1, m.v1], [m.u0, m.v1]].map(c => apply(mm2.m, c[0], c[1]));
				ctx.setLineDash([4 / k, 3 / k]);
				ctx.strokeStyle = '#000';
				ctx.beginPath();
				q4.forEach((q, j) => (j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
				ctx.closePath();
				ctx.stroke();
				ctx.strokeStyle = '#fff';
				ctx.lineDashOffset = 3.5 / k;
				ctx.stroke();
				ctx.setLineDash([]);
			}
		}
		if (this.cursor && (s.tool == 'stamp' || s.tool == 'brush')) {
			var pc = this.plane_at(this.cursor.x, this.cursor.y);
			var rr = s.diameter / 2 * (pc >= 0 ? this.local_scale(pc, this.cursor) : 1);
			ctx.strokeStyle = '#000';
			ctx.beginPath();
			ctx.arc(this.cursor.x, this.cursor.y, rr, 0, Math.PI * 2);
			ctx.stroke();
		}
		if (s.source && s.tool == 'stamp') {
			var sp = apply(this.plane_matrix(s.source.plane) ? this.plane_matrix(s.source.plane).m : [1, 0, 0, 0, 1, 0, 0, 0, 1], s.source.uv[0], s.source.uv[1]);
			ctx.strokeStyle = '#fff';
			ctx.beginPath();
			ctx.moveTo(sp[0] - 6 / k, sp[1]); ctx.lineTo(sp[0] + 6 / k, sp[1]);
			ctx.moveTo(sp[0], sp[1] - 6 / k); ctx.lineTo(sp[0], sp[1] + 6 / k);
			ctx.stroke();
		}
		ctx.restore();
	}

	apply() {
		var s = this.state;
		this.commit_float();
		if (this.dirty) s.wctx.putImageData(s.img, 0, 0);
		var layer = s.layer, planes = s.planes;
		var result = app.GUI.Ps_workspace.Selection.restrict(s.work, layer);
		this.close();
		//the planes stay with the document (CS6)
		config.ps_vp_planes = planes;
		app.State.do_action(new app.Actions.Bundle_action('vanishing_point', 'Vanishing Point', [
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
		this.drag = null;
	}
}

export default Ps_vanishing_point_class;
export { square_to_quad, invert, apply, valid };
