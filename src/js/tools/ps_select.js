/*
 * pshot - CS6 selection tools: Rectangular / Elliptical / Single Row / Single
 * Column Marquee, Lasso, Polygonal Lasso, Magic Wand.
 *
 * Modifiers at mouse down: Shift = add, Alt = subtract, Shift+Alt = intersect
 * (otherwise the options bar mode). While dragging a marquee: Shift constrains
 * to a square/circle, Alt draws from the center.
 */

import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';

const NAMES = {
	rect: 'Rectangular Marquee', ellipse: 'Elliptical Marquee', row: 'Single Row Marquee', col: 'Single Column Marquee',
	lasso: 'Lasso', polygon: 'Polygonal Lasso', wand: 'Magic Wand',
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

		if (mode == 'wand') {
			var a = this.attrs();
			this.selection().select_color(p.x, p.y, a.tolerance, a.contiguous, a.sample_all, op, NAMES.wand);
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

	mousemove(event) {
		if (this.polygon) {
			this.update_polygon_preview(this.world(event));
			return;
		}
		if (!this.drag) {
			return;
		}
		var p = this.world(event);
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
		if (!this.drag) {
			return;
		}
		var drag = this.drag;
		this.drag = null;
		this.selection().set_preview(null);
		var mode = this.attrs().mode;
		var feather = this.attrs().feather || 0;
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
		var dx = b.x - a.x;
		var dy = b.y - a.y;
		if (event.shiftKey && this.drag && this.drag.op != 'add') {
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

	update_polygon_preview(cursor) {
		this.selection().set_preview({ type: 'polygon', points: this.polygon.points, cursor: cursor || null });
	}

	finish_polygon() {
		var poly = this.polygon;
		this.polygon = null;
		this.selection().set_preview(null);
		if (poly && poly.points.length > 2) {
			this.selection().select_polygon(poly.points, poly.op, this.attrs().feather || 0, NAMES.polygon);
		}
	}

	cancel_polygon() {
		this.polygon = null;
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
