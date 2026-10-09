/*
 * pshot - CS6 selection tools: Rectangular / Elliptical / Single Row / Single
 * Column Marquee, Lasso, Polygonal Lasso, Magnetic Lasso, Magic Wand.
 *
 * Modifiers at mouse down: Shift = add, Alt = subtract, Shift+Alt = intersect
 * (otherwise the options bar mode). While dragging a marquee: Shift constrains
 * to a square/circle, Alt draws from the center.
 */

import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';

const NAMES = {
	quick: 'Quick Selection', rect: 'Rectangular Marquee', ellipse: 'Elliptical Marquee', row: 'Single Row Marquee', col: 'Single Column Marquee',
	lasso: 'Lasso', polygon: 'Polygonal Lasso', magnetic: 'Magnetic Lasso', wand: 'Magic Wand',
};

class Ps_select_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.ctx = ctx;
		this.name = 'ps_select';
		this.drag = null;
		this.polygon = null;
	}

	selection() {
		return app.GUI.Ps_workspace.Selection;
	}

	attrs() {
		return config.TOOL.attributes;
	}

	is_canvas_event(event) {
		return event.target.id == 'canvas_minipaint' || event.target.id == 'main_wrapper';
	}

	world(event) {
		var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
		return app.Layers.get_world_coords(event.clientX - rect.left, event.clientY - rect.top);
	}

	op_from_event(event) {
		if (event.shiftKey && event.altKey) return 'intersect';
		if (event.shiftKey) return 'add';
		if (event.altKey) return 'subtract';
		return this.attrs().op || 'new';
	}

	load() {
		document.addEventListener('mousedown', (event) => {
			if (config.TOOL.name != this.name || config.space_hand || event.button != 0 || !this.is_canvas_event(event))
				return;
			event.preventDefault();
			this.mousedown(event);
		});
		document.addEventListener('mousemove', (event) => {
			if (config.TOOL.name != this.name)
				return;
			this.mousemove(event);
		});
		document.addEventListener('mouseup', (event) => {
			if (config.TOOL.name != this.name)
				return;
			this.mouseup(event);
		});
		document.addEventListener('dblclick', (event) => {
			if (config.TOOL.name == this.name && this.polygon && this.is_canvas_event(event)) {
				this.finish_polygon();
			}
		});
		document.addEventListener('keydown', (event) => {
			if (config.TOOL.name != this.name || !this.polygon)
				return;
			if (event.key == 'Enter') {
				this.finish_polygon();
				event.preventDefault();
			}
			if (event.key == 'Escape') {
				this.cancel_polygon();
			}
			if ((event.key == 'Backspace' || event.key == 'Delete') && this.polygon.magnetic) {
				//back to the previous anchor point
				var anchors = this.polygon.anchors;
				if (anchors.length > 1) {
					anchors.pop();
					this.polygon.points.length = anchors[anchors.length - 1] + 1;
					this.update_polygon_preview();
				}
				else {
					this.cancel_polygon();
				}
				event.preventDefault();
				event.stopPropagation();
				return;
			}
			if (event.key == 'Backspace' || event.key == 'Delete') {
				this.polygon.points.pop();
				if (this.polygon.points.length == 0) {
					this.cancel_polygon();
				}
				else {
					this.update_polygon_preview();
				}
				event.preventDefault();
				event.stopPropagation();
			}
		}, true);
	}

	mousedown(event) {
		var mode = this.attrs().mode;
		var p = this.world(event);
		var op = this.op_from_event(event);

		if (mode == 'quick') {
			//CS6 Quick Selection: the first stroke starts a selection, later strokes add to it
			var qop = event.altKey ? 'subtract' : (this.selection().has() ? 'add' : 'new');
			var a2 = this.attrs();
			this.quick = {
				op: qop,
				src: this.selection().sample_source(a2.sample_all),
				arr: null,
				last: null,
			};
			this.quick_add(p);
			return;
		}
		if (mode == 'wand') {
			var a = this.attrs();
			this.selection().select_color(p.x, p.y, a.tolerance, a.contiguous, a.sample_all, op, NAMES.wand);
			return;
		}
		if (mode == 'magnetic') {
			if (!this.polygon) {
				this.edges = this.edge_map();
				var s0 = this.snap(p);
				this.polygon = { points: [s0], op: op, magnetic: true, anchors: [0] };
			}
			else {
				var first0 = this.polygon.points[0];
				if (Math.hypot(first0.x - p.x, first0.y - p.y) * config.ZOOM < 10 && this.polygon.points.length > 2) {
					this.finish_polygon();
					return;
				}
				this.magnetic_to(p);
				this.polygon.anchors.push(this.polygon.points.length - 1);
			}
			this.update_polygon_preview();
			return;
		}
		if (mode == 'polygon') {
			if (!this.polygon) {
				this.polygon = { points: [p], op: op };
			}
			else {
				var first = this.polygon.points[0];
				var close = Math.hypot(first.x - p.x, first.y - p.y) * config.ZOOM < 6;
				if (close && this.polygon.points.length > 2) {
					this.finish_polygon();
					return;
				}
				this.polygon.points.push(p);
			}
			this.update_polygon_preview(p);
			return;
		}
		if (mode == 'row' || mode == 'col') {
			var x = mode == 'row' ? 0 : Math.floor(p.x);
			var y = mode == 'row' ? Math.floor(p.y) : 0;
			var w = mode == 'row' ? config.WIDTH : 1;
			var h = mode == 'row' ? 1 : config.HEIGHT;
			this.selection().select_rect(x, y, w, h, op, false, 0, NAMES[mode]);
			return;
		}
		this.drag = { start: p, op: op, points: [p], moved: false };
	}

	quick_add(p) {
		var q = this.quick;
		var r = Math.max(4, this.attrs().brush || 20);
		if (q.last && Math.hypot(p.x - q.last.x, p.y - q.last.y) < r / 2) {
			return;
		}
		q.last = p;
		var limit = { x0: Math.floor(p.x - r * 6), y0: Math.floor(p.y - r * 6), x1: Math.ceil(p.x + r * 6), y1: Math.ceil(p.y + r * 6) };
		//sample a few points across the brush so the stroke grabs the region it covers
		for (var dx of [-r / 2, 0, r / 2]) {
			for (var dy of [-r / 2, 0, r / 2]) {
				q.arr = this.selection().flood(q.src, p.x + dx, p.y + dy, 28, true, limit, q.arr);
			}
		}
		var preview = this.selection().array_to_mask(q.arr);
		this.selection().set_preview(null);
		this.selection().quick_preview = preview;
		this.selection().draw_overlay();
	}

	mousemove(event) {
		if (this.quick) {
			this.quick_add(this.world(event));
			return;
		}
		if (this.polygon && this.polygon.magnetic) {
			this.magnetic_to(this.world(event));
			this.update_polygon_preview();
			return;
		}
		if (this.polygon) {
			this.update_polygon_preview(this.world(event));
			return;
		}
		if (!this.drag) {
			return;
		}
		var p = this.world(event);
		//CS6: holding Space while dragging a marquee moves it
		if (config.space_hand && this.drag.last && (this.attrs().mode == 'rect' || this.attrs().mode == 'ellipse')) {
			this.drag.start = { x: this.drag.start.x + p.x - this.drag.last.x, y: this.drag.start.y + p.y - this.drag.last.y };
		}
		this.drag.last = p;
		this.drag.moved = true;
		var mode = this.attrs().mode;
		if (mode == 'lasso') {
			this.drag.points.push(p);
			this.selection().set_preview({ type: 'lasso', points: this.drag.points });
			return;
		}
		var r = this.marquee_rect(this.drag.start, p, event);
		this.selection().set_preview({ type: mode == 'ellipse' ? 'ellipse' : 'rect', x: r.x, y: r.y, w: r.w, h: r.h });
	}

	mouseup(event) {
		if (this.quick) {
			var q = this.quick;
			this.quick = null;
			var sel = this.selection();
			sel.quick_preview = null;
			if (q.arr) {
				sel.commit(sel.combine(sel.array_to_mask(q.arr), q.op), NAMES.quick);
			}
			return;
		}
		if (!this.drag) {
			return;
		}
		var drag = this.drag;
		this.drag = null;
		this.selection().set_preview(null);
		var mode = this.attrs().mode;
		var feather = this.attrs().feather || 0;
		if (!drag.moved && this.attrs().style == 'Fixed Size' && (mode == 'rect' || mode == 'ellipse')) {
			//Fixed Size: a click places the box
			var fr = this.marquee_rect(drag.start, drag.start, event);
			this.selection().select_rect(fr.x, fr.y, fr.w, fr.h, drag.op, mode == 'ellipse', feather, NAMES[mode]);
			return;
		}
		if (!drag.moved) {
			//CS6: a plain click with a marquee or lasso deselects
			if (drag.op == 'new') {
				this.selection().deselect();
			}
			return;
		}
		if (mode == 'lasso') {
			this.selection().select_polygon(drag.points, drag.op, feather, NAMES.lasso);
			return;
		}
		var r = this.marquee_rect(drag.start, this.world(event), event);
		if (Math.abs(r.w) < 1 || Math.abs(r.h) < 1) {
			return;
		}
		this.selection().select_rect(r.x, r.y, r.w, r.h, drag.op, mode == 'ellipse', feather, NAMES[mode]);
	}

	marquee_rect(a, b, event) {
		var at = this.attrs();
		var dx = b.x - a.x;
		var dy = b.y - a.y;
		//Style: Fixed Size - a box of that size whose corner (center with Alt) follows the pointer
		if (at.style == 'Fixed Size') {
			var fw = Math.max(1, at.size_w || 64), fh = Math.max(1, at.size_h || 64);
			return event.altKey ? { x: b.x - fw / 2, y: b.y - fh / 2, w: fw, h: fh } : { x: b.x, y: b.y, w: fw, h: fh };
		}
		//Style: Fixed Ratio - width:height kept, the larger drag direction wins
		if (at.style == 'Fixed Ratio') {
			var ratio = Math.max(0.001, at.ratio_w || 1) / Math.max(0.001, at.ratio_h || 1);
			if (Math.abs(dx) / ratio >= Math.abs(dy)) dy = Math.sign(dy || 1) * Math.abs(dx) / ratio;
			else dx = Math.sign(dx || 1) * Math.abs(dy) * ratio;
		}
		else if (event.shiftKey && this.drag && this.drag.op != 'add') {
			var size = Math.max(Math.abs(dx), Math.abs(dy));
			dx = Math.sign(dx || 1) * size;
			dy = Math.sign(dy || 1) * size;
		}
		var x = a.x, y = a.y, w = dx, h = dy;
		if (event.altKey && this.drag && this.drag.op != 'subtract') {
			x = a.x - dx;
			y = a.y - dy;
			w = dx * 2;
			h = dy * 2;
		}
		if (w < 0) { x += w; w = -w; }
		if (h < 0) { y += h; h = -h; }
		return { x: x, y: y, w: w, h: h };
	}

	/**
	 * Magnetic Lasso: gradient magnitude (0..1) of the layer (or all layers)
	 */
	edge_map() {
		var w = config.WIDTH, h = config.HEIGHT;
		var src = this.selection().sample_source(this.attrs().sample_all);
		var lum = new Float32Array(w * h);
		for (var i = 0; i < lum.length; i++) {
			var a = src[i * 4 + 3] / 255;
			lum[i] = (src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114) * a;
		}
		var edge = new Float32Array(w * h);
		for (var y = 1; y < h - 1; y++) {
			for (var x = 1; x < w - 1; x++) {
				var k = y * w + x;
				var gx = lum[k - w + 1] + 2 * lum[k + 1] + lum[k + w + 1] - lum[k - w - 1] - 2 * lum[k - 1] - lum[k + w - 1];
				var gy = lum[k + w - 1] + 2 * lum[k + w] + lum[k + w + 1] - lum[k - w - 1] - 2 * lum[k - w] - lum[k - w + 1];
				edge[k] = Math.min(1, Math.hypot(gx, gy) / 1020);
			}
		}
		return { w: w, h: h, data: edge };
	}

	/**
	 * the strongest edge within the Width radius (or p itself when there is no
	 * edge above the Contrast threshold)
	 */
	snap(p) {
		var e = this.edges;
		if (!e) return p;
		var r = Math.max(1, Math.round(this.attrs().width || 10));
		var threshold = (this.attrs().contrast == null ? 10 : this.attrs().contrast) / 100 * 0.5;
		var best = null, best_score = -1;
		var cx = Math.round(p.x), cy = Math.round(p.y);
		for (var y = Math.max(1, cy - r); y <= Math.min(e.h - 2, cy + r); y++) {
			for (var x = Math.max(1, cx - r); x <= Math.min(e.w - 2, cx + r); x++) {
				var d = Math.hypot(x - p.x, y - p.y);
				if (d > r) continue;
				var v = e.data[y * e.w + x];
				if (v < threshold) continue;
				var score = v - d / r * 0.15;
				if (score > best_score) { best_score = score; best = { x: x + 0.5, y: y + 0.5 }; }
			}
		}
		return best || p;
	}

	/**
	 * extend the magnetic path towards the cursor, snapping every few pixels;
	 * anchors are fastened automatically (Frequency)
	 */
	magnetic_to(p) {
		var poly = this.polygon;
		var last = poly.points[poly.points.length - 1];
		var dist = Math.hypot(p.x - last.x, p.y - last.y);
		var step = 2;
		if (dist < step) return;
		var freq = Math.max(1, Math.min(100, this.attrs().frequency || 57));
		var spacing = 4 + (100 - freq) * 0.6;
		var n = Math.floor(dist / step);
		for (var i = 1; i <= n; i++) {
			var q = this.snap({ x: last.x + (p.x - last.x) * i / n, y: last.y + (p.y - last.y) * i / n });
			var prev = poly.points[poly.points.length - 1];
			if (Math.hypot(q.x - prev.x, q.y - prev.y) < 0.5) continue;
			poly.points.push(q);
			var anchor = poly.points[poly.anchors[poly.anchors.length - 1]];
			if (Math.hypot(q.x - anchor.x, q.y - anchor.y) >= spacing) {
				poly.anchors.push(poly.points.length - 1);
			}
		}
	}

	update_polygon_preview(cursor) {
		this.selection().set_preview({ type: 'polygon', points: this.polygon.points, cursor: cursor || null });
	}

	finish_polygon() {
		var poly = this.polygon;
		this.polygon = null;
		this.selection().set_preview(null);
		if (poly && poly.points.length > 2) {
			this.selection().select_polygon(poly.points, poly.op, this.attrs().feather || 0, poly.magnetic ? NAMES.magnetic : NAMES.polygon);
		}
		this.edges = null;
	}

	cancel_polygon() {
		this.polygon = null;
		this.edges = null;
		this.selection().set_preview(null);
	}

	on_activate() {
		document.getElementById('main_wrapper').style.cursor = 'crosshair';
	}

	on_leave() {
		this.cancel_polygon();
		this.drag = null;
		return [];
	}
}

export default Ps_select_class;
