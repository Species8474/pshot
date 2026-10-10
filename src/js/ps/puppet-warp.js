/*
 * pshot - CS6 Edit > Puppet Warp: a triangle mesh covers the layer's pixels;
 * click the mesh to add pins, drag pins to deform (the other pins hold their
 * place), Alt+click a pin to delete it. The mesh follows the pins by moving
 * least squares (Rigid / Normal / Distort modes); the pixels are drawn per
 * triangle. Enter commits (one History step), Esc cancels.
 */

import app from './../app.js';
import config from './../config.js';
import zoomView from './../libs/zoomView.js';
import { ensure_pixel_layer, alert_box } from './pixel-layer.js';

const DENSITY = { 'Fewer Points': 48, 'Normal': 28, 'More Points': 16 };

/**
 * moving least squares deformation of point v by pins (p -> q)
 */
function mls(v, pins, mode) {
	var n = pins.length;
	if (n == 0) return { x: v.x, y: v.y };
	if (n == 1) return { x: v.x + pins[0].q.x - pins[0].p.x, y: v.y + pins[0].q.y - pins[0].p.y };
	var w = new Array(n), sw = 0, psx = 0, psy = 0, qsx = 0, qsy = 0;
	for (var i = 0; i < n; i++) {
		var dx = pins[i].p.x - v.x, dy = pins[i].p.y - v.y, d2 = dx * dx + dy * dy;
		if (d2 < 1e-6) return { x: pins[i].q.x, y: pins[i].q.y };
		w[i] = 1 / d2;
		sw += w[i];
		psx += w[i] * pins[i].p.x; psy += w[i] * pins[i].p.y;
		qsx += w[i] * pins[i].q.x; qsy += w[i] * pins[i].q.y;
	}
	psx /= sw; psy /= sw; qsx /= sw; qsy /= sw;
	var vx = v.x - psx, vy = v.y - psy;
	if (mode == 'Distort') {
		//affine
		var m11 = 0, m12 = 0, m22 = 0, b11 = 0, b12 = 0, b21 = 0, b22 = 0;
		for (var a = 0; a < n; a++) {
			var px = pins[a].p.x - psx, py = pins[a].p.y - psy, qx = pins[a].q.x - qsx, qy = pins[a].q.y - qsy;
			m11 += w[a] * px * px; m12 += w[a] * px * py; m22 += w[a] * py * py;
			b11 += w[a] * px * qx; b12 += w[a] * px * qy; b21 += w[a] * py * qx; b22 += w[a] * py * qy;
		}
		var det = m11 * m22 - m12 * m12;
		if (Math.abs(det) < 1e-9) return { x: v.x + qsx - psx, y: v.y + qsy - psy };
		var i11 = m22 / det, i12 = -m12 / det, i22 = m11 / det;
		var tx = vx * i11 + vy * i12, ty = vx * i12 + vy * i22;
		return { x: tx * b11 + ty * b21 + qsx, y: tx * b12 + ty * b22 + qsy };
	}
	var fx = 0, fy = 0, mu = 0;
	for (var k = 0; k < n; k++) {
		var phx = pins[k].p.x - psx, phy = pins[k].p.y - psy, qhx = pins[k].q.x - qsx, qhy = pins[k].q.y - qsy;
		var a11 = phx * vx + phy * vy, a12 = phx * vy - phy * vx;
		fx += w[k] * (qhx * a11 - qhy * a12);
		fy += w[k] * (qhx * a12 + qhy * a11);
		mu += w[k] * (phx * phx + phy * phy);
	}
	if (mode == 'Rigid') {
		var len = Math.hypot(fx, fy), dl = Math.hypot(vx, vy);
		if (len < 1e-9) return { x: qsx, y: qsy };
		return { x: fx / len * dl + qsx, y: fy / len * dl + qsy };
	}
	//Normal: similarity
	return { x: fx / mu + qsx, y: fy / mu + qsy };
}

class Ps_puppet_warp_class {

	constructor() {
		this.job = null;
		this.drag = null;
		this.install();
	}

	active() {
		return this.job !== null;
	}

	start() {
		if (this.job) return;
		if (app.GUI.Ps_workspace.Transform.active()) app.GUI.Ps_workspace.Transform.commit();
		ensure_pixel_layer();
		var layer = config.layer;
		if (!layer || layer.type != 'image' || !layer.link || layer.ps_smart) {
			alert_box('Could not complete the Puppet Warp command because the layer is not a pixel layer.');
			return;
		}
		//the layer in document space
		var full = document.createElement('canvas');
		full.width = config.WIDTH;
		full.height = config.HEIGHT;
		full.getContext('2d').drawImage(layer.link, layer.x, layer.y, layer.width, layer.height);
		var alpha = full.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, full.width, full.height).data;
		this.job = {
			layer: layer, full: full, alpha: alpha,
			geometry: { x: layer.x, y: layer.y, width: layer.width, height: layer.height, width_original: layer.width_original, height_original: layer.height_original },
			pins: [], selected: null,
			mode: 'Normal', density: 'Normal', expansion: 2, show_mesh: app.GUI.Ps_workspace.show_mesh !== false,
		};
		this.build_mesh();
		if (!this.job.tris.length) {
			this.job = null;
			alert_box('Could not complete the Puppet Warp command because the layer is empty.');
			return;
		}
		Object.assign(layer, { x: 0, y: 0, width: config.WIDTH, height: config.HEIGHT, width_original: config.WIDTH, height_original: config.HEIGHT });
		var sel = app.GUI.Ps_workspace.Selection;
		sel.decorate = (ctx) => this.draw_overlay(ctx);
		this.preview();
		app.GUI.Ps_workspace.Options_bar.render_puppet();
		app.GUI.Ps_workspace.status_message('Puppet Warp: click to add pins, drag to warp, Alt+click deletes a pin. Enter commits, Esc cancels.');
	}

	/**
	 * grid vertices over the pixels (grown by Expansion), two triangles per cell
	 */
	build_mesh() {
		var j = this.job, W = config.WIDTH, H = config.HEIGHT, A = j.alpha;
		var step = DENSITY[j.density] || 28, grow = Math.max(0, j.expansion);
		var minx = W, miny = H, maxx = -1, maxy = -1;
		for (var y = 0; y < H; y += 2) for (var x = 0; x < W; x += 2) {
			if (A[(y * W + x) * 4 + 3] > 8) {
				if (x < minx) minx = x;
				if (x > maxx) maxx = x;
				if (y < miny) miny = y;
				if (y > maxy) maxy = y;
			}
		}
		j.verts = [];
		j.tris = [];
		if (maxx < 0) return;
		minx -= grow + 2; miny -= grow + 2; maxx += grow + 2; maxy += grow + 2;
		var cols = Math.max(1, Math.ceil((maxx - minx) / step)), rows = Math.max(1, Math.ceil((maxy - miny) / step));
		var sx = (maxx - minx) / cols, sy = (maxy - miny) / rows;
		//a cell is used when it holds pixels (checked on a few samples, grown by Expansion)
		var covered = (cx, cy) => {
			var x0 = minx + cx * sx - grow, y0 = miny + cy * sy - grow, x1 = x0 + sx + grow * 2, y1 = y0 + sy + grow * 2;
			for (var yy = y0; yy <= y1; yy += Math.max(1, sy / 6)) {
				for (var xx = x0; xx <= x1; xx += Math.max(1, sx / 6)) {
					var ix = Math.round(xx), iy = Math.round(yy);
					if (ix >= 0 && iy >= 0 && ix < W && iy < H && A[(iy * W + ix) * 4 + 3] > 8) return true;
				}
			}
			return false;
		};
		var index = {};
		var vert = (gx, gy) => {
			var key = gx + ',' + gy;
			if (!(key in index)) {
				index[key] = j.verts.length;
				var p = { x: minx + gx * sx, y: miny + gy * sy };
				j.verts.push({ p: p, q: { x: p.x, y: p.y } });
			}
			return index[key];
		};
		for (var cy = 0; cy < rows; cy++) {
			for (var cx = 0; cx < cols; cx++) {
				if (!covered(cx, cy)) continue;
				var a = vert(cx, cy), b = vert(cx + 1, cy), c = vert(cx + 1, cy + 1), d = vert(cx, cy + 1);
				j.tris.push([a, b, c], [a, c, d]);
			}
		}
	}

	deform() {
		var j = this.job;
		var pins = j.pins.map(p => ({ p: p.p, q: p.q }));
		for (var v of j.verts) v.q = mls(v.p, pins, j.mode);
	}

	render_canvas() {
		var j = this.job;
		var out = document.createElement('canvas');
		out.width = config.WIDTH;
		out.height = config.HEIGHT;
		var ctx = out.getContext('2d');
		ctx.imageSmoothingQuality = 'high';
		for (var t of j.tris) {
			var s0 = j.verts[t[0]].p, s1 = j.verts[t[1]].p, s2 = j.verts[t[2]].p;
			var d0 = j.verts[t[0]].q, d1 = j.verts[t[1]].q, d2 = j.verts[t[2]].q;
			//grow the clip slightly so neighbouring triangles leave no seams
			var cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3;
			var grow = (p) => { var dx = p.x - cx, dy = p.y - cy, l = Math.hypot(dx, dy) || 1; return { x: p.x + dx / l * 0.6, y: p.y + dy / l * 0.6 }; };
			var g0 = grow(d0), g1 = grow(d1), g2 = grow(d2);
			var den = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
			if (Math.abs(den) < 1e-9) continue;
			var a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / den;
			var b = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / den;
			var c = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / den;
			var d = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / den;
			ctx.save();
			ctx.beginPath();
			ctx.moveTo(g0.x, g0.y); ctx.lineTo(g1.x, g1.y); ctx.lineTo(g2.x, g2.y);
			ctx.closePath();
			ctx.clip();
			ctx.transform(a, b, c, d, d0.x - a * s0.x - c * s0.y, d0.y - b * s0.x - d * s0.y);
			ctx.drawImage(j.full, 0, 0);
			ctx.restore();
		}
		return out;
	}

	/**
	 * commit: every destination pixel maps back through its triangle
	 * (barycentric), sampled bilinearly (premultiplied) - no seams
	 */
	render_exact() {
		var j = this.job, W = config.WIDTH, H = config.HEIGHT;
		var S = j.full.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
		var out = new ImageData(W, H), O = out.data, done = new Uint8Array(W * H);
		var sample = (x, y, o) => {
			x -= 0.5; y -= 0.5;
			var x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
			var r = 0, g = 0, b = 0, a = 0;
			for (var k = 0; k < 4; k++) {
				var xx = x0 + (k & 1), yy = y0 + (k >> 1);
				if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
				var wgt = ((k & 1) ? fx : 1 - fx) * ((k >> 1) ? fy : 1 - fy), i = (yy * W + xx) * 4, al = S[i + 3] * wgt;
				r += S[i] * al; g += S[i + 1] * al; b += S[i + 2] * al; a += al;
			}
			if (a > 0) { O[o] = r / a; O[o + 1] = g / a; O[o + 2] = b / a; }
			O[o + 3] = a;
		};
		for (var t of j.tris) {
			var s0 = j.verts[t[0]].p, s1 = j.verts[t[1]].p, s2 = j.verts[t[2]].p;
			var d0 = j.verts[t[0]].q, d1 = j.verts[t[1]].q, d2 = j.verts[t[2]].q;
			var den = (d1.y - d2.y) * (d0.x - d2.x) + (d2.x - d1.x) * (d0.y - d2.y);
			if (Math.abs(den) < 1e-9) continue;
			var x0 = Math.max(0, Math.floor(Math.min(d0.x, d1.x, d2.x))), x1 = Math.min(W - 1, Math.ceil(Math.max(d0.x, d1.x, d2.x)));
			var y0 = Math.max(0, Math.floor(Math.min(d0.y, d1.y, d2.y))), y1 = Math.min(H - 1, Math.ceil(Math.max(d0.y, d1.y, d2.y)));
			for (var y = y0; y <= y1; y++) {
				for (var x = x0; x <= x1; x++) {
					var k = y * W + x;
					if (done[k]) continue;
					var px = x + 0.5, py = y + 0.5;
					var l1 = ((d1.y - d2.y) * (px - d2.x) + (d2.x - d1.x) * (py - d2.y)) / den;
					var l2 = ((d2.y - d0.y) * (px - d2.x) + (d0.x - d2.x) * (py - d2.y)) / den;
					var l3 = 1 - l1 - l2;
					if (l1 < -1e-7 || l2 < -1e-7 || l3 < -1e-7) continue;
					done[k] = 1;
					sample(l1 * s0.x + l2 * s1.x + l3 * s2.x, l1 * s0.y + l2 * s1.y + l3 * s2.y, k * 4);
				}
			}
		}
		var c = document.createElement('canvas');
		c.width = W;
		c.height = H;
		c.getContext('2d').putImageData(out, 0, 0);
		return c;
	}

	preview() {
		this.deform();
		this.job.layer.link_canvas = this.render_canvas();
		config.need_render = true;
		app.GUI.Ps_workspace.Selection.draw_overlay();
	}

	draw_overlay(ctx) {
		var j = this.job;
		if (!j) return;
		var s = zoomView.getScale();
		ctx.save();
		if (j.show_mesh) {
			ctx.beginPath();
			for (var t of j.tris) {
				var a = j.verts[t[0]].q, b = j.verts[t[1]].q, c = j.verts[t[2]].q;
				ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.closePath();
			}
			ctx.strokeStyle = 'rgba(70,70,70,0.75)';
			ctx.lineWidth = 1 / s;
			ctx.stroke();
		}
		//View > Show > Edit Pins
		if (app.GUI.Ps_workspace.show_pins !== false) for (var pin of j.pins) {
			var sel = pin === j.selected;
			ctx.beginPath();
			ctx.arc(pin.q.x, pin.q.y, (sel ? 6 : 5) / s, 0, Math.PI * 2);
			ctx.fillStyle = sel ? '#000' : '#ffd400';
			ctx.fill();
			ctx.lineWidth = 1.5 / s;
			ctx.strokeStyle = sel ? '#ffd400' : '#000';
			ctx.stroke();
			if (sel) {
				ctx.beginPath();
				ctx.arc(pin.q.x, pin.q.y, 2 / s, 0, Math.PI * 2);
				ctx.fillStyle = '#fff';
				ctx.fill();
			}
		}
		ctx.restore();
	}

	world(e) {
		var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
		return app.Layers.get_world_coords(e.clientX - rect.left, e.clientY - rect.top);
	}

	on_mesh(p) {
		var j = this.job;
		var inside = (a, b, c) => {
			var d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
			var d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
			var d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
			return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
		};
		for (var t of j.tris) {
			var a = j.verts[t[0]], b = j.verts[t[1]], c = j.verts[t[2]];
			if (inside(a.q, b.q, c.q)) {
				//the pin's rest position: the same barycentric point on the undeformed triangle
				var den = (b.q.y - c.q.y) * (a.q.x - c.q.x) + (c.q.x - b.q.x) * (a.q.y - c.q.y);
				if (Math.abs(den) < 1e-9) return { x: p.x, y: p.y };
				var l1 = ((b.q.y - c.q.y) * (p.x - c.q.x) + (c.q.x - b.q.x) * (p.y - c.q.y)) / den;
				var l2 = ((c.q.y - a.q.y) * (p.x - c.q.x) + (a.q.x - c.q.x) * (p.y - c.q.y)) / den;
				var l3 = 1 - l1 - l2;
				return { x: l1 * a.p.x + l2 * b.p.x + l3 * c.p.x, y: l1 * a.p.y + l2 * b.p.y + l3 * c.p.y };
			}
		}
		return null;
	}

	install() {
		var on_canvas = (e) => e.target.id == 'canvas_minipaint' || e.target.id == 'main_wrapper' || e.target.id == 'ps_selection_overlay';
		document.addEventListener('mousedown', (e) => {
			if (!this.job || e.button != 0 || !on_canvas(e)) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			var j = this.job, p = this.world(e), tol = 8 / zoomView.getScale();
			var hit = j.pins.find(pin => Math.hypot(pin.q.x - p.x, pin.q.y - p.y) <= tol);
			if (hit && e.altKey) {
				j.pins = j.pins.filter(x => x !== hit);
				j.selected = null;
				this.preview();
				return;
			}
			if (!hit) {
				var rest = this.on_mesh(p);
				if (!rest) return;
				hit = { p: rest, q: { x: p.x, y: p.y } };
				j.pins.push(hit);
			}
			j.selected = hit;
			this.drag = { pin: hit, dx: hit.q.x - p.x, dy: hit.q.y - p.y };
			this.preview();
		}, true);
		document.addEventListener('mousemove', (e) => {
			if (!this.job || !this.drag) return;
			var p = this.world(e);
			this.drag.pin.q = { x: p.x + this.drag.dx, y: p.y + this.drag.dy };
			this.preview();
		}, true);
		document.addEventListener('mouseup', () => { this.drag = null; }, true);
		window.addEventListener('keydown', (e) => {
			if (!this.job) return;
			if (e.target && (e.target.tagName == 'INPUT' || e.target.tagName == 'SELECT')) return;
			if (e.key == 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); this.commit(); }
			else if (e.key == 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.cancel(); }
			else if ((e.key == 'Delete' || e.key == 'Backspace') && this.job.selected) {
				e.preventDefault(); e.stopImmediatePropagation();
				this.job.pins = this.job.pins.filter(x => x !== this.job.selected);
				this.job.selected = null;
				this.preview();
			}
		}, true);
	}

	/**
	 * options bar changes
	 */
	set_option(key, value) {
		var j = this.job;
		if (!j) return;
		j[key] = value;
		if (key == 'density' || key == 'expansion') {
			//rebuild the mesh; pins keep their rest and current positions
			this.build_mesh();
		}
		this.preview();
	}

	remove_all() {
		if (!this.job) return;
		this.job.pins = [];
		this.job.selected = null;
		this.preview();
	}

	cleanup() {
		var sel = app.GUI.Ps_workspace.Selection;
		sel.decorate = null;
		this.job = null;
		this.drag = null;
		sel.draw_overlay();
		config.need_render = true;
		if (!app.GUI.Ps_workspace.Options_bar.render()) app.GUI.GUI_tools.show_action_attributes();
	}

	cancel() {
		var j = this.job;
		if (!j) return;
		delete j.layer.link_canvas;
		Object.assign(j.layer, j.geometry);
		this.cleanup();
	}

	commit() {
		var j = this.job;
		if (!j) return;
		this.deform();
		var result = this.render_exact();
		delete j.layer.link_canvas;
		Object.assign(j.layer, j.geometry);
		var layer = j.layer;
		this.cleanup();
		app.State.do_action(new app.Actions.Bundle_action('puppet_warp', 'Puppet Warp', [
			new app.Actions.Update_layer_action(layer.id, { x: 0, y: 0, width: config.WIDTH, height: config.HEIGHT, width_original: config.WIDTH, height_original: config.HEIGHT }),
			new app.Actions.Update_layer_image_action(result, layer.id),
		]));
	}
}

export { mls };
export default Ps_puppet_warp_class;
