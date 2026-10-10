/*
 * pshot - CS6 Pen Tool group, drawing paths (Paths panel):
 *   mode 'pen'      click = corner point, drag = smooth point; click the first
 *                   point to close. Auto Add/Delete: click a segment to add a
 *                   point, click a point to delete it. Enter/Esc end the path.
 *   mode 'add'      Add Anchor Point Tool
 *   mode 'delete'   Delete Anchor Point Tool
 *   mode 'convert'  Convert Point Tool: click = corner, drag = smooth handles
 *   mode 'freeform' Freeform Pen Tool: drag draws; the trail is fitted to a path (Curve Fit)
 */

import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import { point } from './../ps/paths.js';

class Ps_pen_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.ctx = ctx;
		this.name = 'ps_pen';
		this.drag = null;
	}

	paths() {
		return app.GUI.Ps_workspace.Paths;
	}

	world(e) {
		var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
		return app.Layers.get_world_coords(e.clientX - rect.left, e.clientY - rect.top);
	}

	mode() {
		return config.TOOL.attributes.mode || 'pen';
	}

	load() {
		document.addEventListener('mousedown', (e) => {
			if (config.TOOL.name != this.name || config.space_hand || e.button != 0) return;
			if (e.target.id != 'canvas_minipaint' && e.target.id != 'main_wrapper') return;
			e.preventDefault();
			this.mousedown(e);
		});
		document.addEventListener('mousemove', (e) => {
			if (config.TOOL.name != this.name) return;
			if (!this.drag) {
				//Rubber Band (gear): the next segment follows the pointer
				if (config.TOOL.attributes.rubber_band && (config.TOOL.attributes.mode || 'pen') == 'pen' && this.paths().drawing) {
					this.hover = this.world(e);
					app.GUI.Ps_workspace.Selection.draw_overlay();
				}
				return;
			}
			this.mousemove(e);
		});
		var Selection = app.GUI.Ps_workspace.Selection;
		Selection.overlays = Selection.overlays || [];
		Selection.overlays.push({
			active: () => config.TOOL.name == this.name && config.TOOL.attributes.rubber_band && !this.drag && !!this.hover && this.paths().drawing,
			draw: (ctx, scale) => {
				var path = this.paths().active();
				var sp = path && path.subpaths.length ? path.subpaths[path.subpaths.length - 1] : null;
				if (!sp || sp.closed || !sp.pts.length) return;
				var a = sp.pts[sp.pts.length - 1];
				ctx.save();
				ctx.lineWidth = 1 / scale;
				ctx.strokeStyle = '#2a6fd6';
				ctx.beginPath();
				ctx.moveTo(a.x, a.y);
				ctx.bezierCurveTo(a.ox, a.oy, this.hover.x, this.hover.y, this.hover.x, this.hover.y);
				ctx.stroke();
				ctx.restore();
			},
		});
		document.addEventListener('mouseup', (e) => {
			if (config.TOOL.name != this.name || !this.drag) return;
			var d = this.drag;
			this.drag = null;
			this.paths().changed();
			if (d.after) d.after();
		});
		document.addEventListener('keydown', (e) => {
			if (config.TOOL.name != this.name || !this.paths().drawing) return;
			if (e.key == 'Enter' && !(e.ctrlKey || e.metaKey) || e.key == 'Escape') {
				this.end_drawing();
				e.preventDefault();
				e.stopPropagation();
			}
		}, true);
	}

	end_drawing() {
		this.paths().drawing = false;
		this.paths().selected = null;
		this.paths().changed();
	}

	async mousedown(e) {
		var Paths = this.paths();
		var p = this.world(e);
		var mode = this.mode();
		if (mode == 'freeform') {
			//Freeform Pen: collect the pointer trail, fit a path on release
			this.magnet = null;
			if (config.TOOL.attributes.magnetic) {
				//Magnetic: the trail snaps to the strongest edge near the pointer (the Magnetic Lasso's edges)
				var S = app.GUI.GUI_tools.tools_modules.ps_select && app.GUI.GUI_tools.tools_modules.ps_select.object;
				if (S) {
					S.edges = S.edge_map();
					this.magnet = S;
					p = S.snap(p);
				}
			}
			this.drag = { kind: 'freeform', pts: [p], after: () => this.finish_freeform() };
			this.install_overlay();
			return;
		}
		var path = Paths.active();
		var auto = mode == 'pen' && config.TOOL.attributes.auto_add !== false;

		if (mode == 'convert') {
			var hit = Paths.hit_anchor(p);
			if (!hit) return;
			var ed = Paths.editable();
			var a = ed.path.subpaths[hit.sub].pts[hit.index];
			//click: retract the handles (corner point); drag pulls out smooth handles
			a.ix = a.x; a.iy = a.y; a.ox = a.x; a.oy = a.y;
			await Paths.commit(ed.paths, ed.index, 'Convert Point');
			Paths.selected = hit;
			this.drag = { kind: 'handles', hit: hit };
			return;
		}

		//on an existing point / segment of the active path (not while it's being closed)
		if (path && (mode == 'delete' || (auto && !this.closing_hit(p)))) {
			var anchor = Paths.hit_anchor(p);
			if (anchor && (mode == 'delete' || !Paths.drawing || !this.is_drawing_end(anchor))) {
				var ed2 = Paths.editable();
				var sp = ed2.path.subpaths[anchor.sub];
				sp.pts.splice(anchor.index, 1);
				if (sp.pts.length == 0) ed2.path.subpaths.splice(anchor.sub, 1);
				else if (sp.pts.length < 3) sp.closed = false;
				Paths.selected = null;
				await Paths.commit(ed2.paths, ed2.index, 'Delete Anchor Point');
				return;
			}
		}
		if (path && (mode == 'add' || (auto && !Paths.drawing))) {
			var seg = Paths.hit_segment(p);
			if (seg) {
				var ed3 = Paths.editable();
				Paths.split(ed3.path.subpaths[seg.sub], seg.index, seg.t);
				Paths.selected = { sub: seg.sub, index: seg.index + 1 };
				await Paths.commit(ed3.paths, ed3.index, 'Add Anchor Point');
				return;
			}
		}
		if (mode != 'pen') return;

		//Shape mode: a new path starts a new shape layer (CS6)
		if (config.TOOL.attributes.pen_mode == 'Shape' && !Paths.drawing && !(config.ps_path_active == 'layer' && config.layer && config.layer.type == 'ps_shape')) {
			await app.GUI.Ps_workspace.Shapes.create_empty(p.x, p.y);
		}

		var ed4 = Paths.editable();
		var subs = ed4.path.subpaths;
		var current = Paths.drawing && subs.length ? subs[subs.length - 1] : null;
		if (current && !current.closed && current.pts.length >= 2 && this.closing_hit(p)) {
			current.closed = true;
			await Paths.commit(ed4.paths, ed4.index, 'Close Path');
			Paths.drawing = false;
			Paths.selected = { sub: subs.length - 1, index: 0 };
			this.drag = { kind: 'handles', hit: { sub: subs.length - 1, index: 0 } };
			return;
		}
		var description = 'Add Anchor Point';
		if (!current || current.closed) {
			description = config.ps_path_active == 'layer' || (config.ps_paths && config.ps_paths[config.ps_path_active]) ? 'Add Anchor Point' : 'New Work Path';
			current = { closed: false, pts: [] };
			Paths.tag_op(subs, current, app.GUI.Ps_workspace.path_op);
			subs.push(current);
		}
		//Align Edges: Shape mode anchors land on whole pixels
		var snap = config.TOOL.attributes.align_edges && config.TOOL.attributes.pen_mode == 'Shape';
		current.pts.push(snap ? point(Math.round(p.x), Math.round(p.y)) : point(p.x, p.y));
		Paths.drawing = true;
		await Paths.commit(ed4.paths, ed4.index, description);
		this.drag = { kind: 'handles', hit: { sub: subs.length - 1, index: current.pts.length - 1 }, mirror: true };
	}

	install_overlay() {
		if (this.overlay_installed) return;
		this.overlay_installed = true;
		var Selection = app.GUI.Ps_workspace.Selection;
		Selection.overlays = Selection.overlays || [];
		Selection.overlays.push({
			active: () => this.freeform && this.freeform.length > 1,
			draw: (ctx, scale) => {
				ctx.save();
				ctx.lineWidth = 1 / scale;
				ctx.strokeStyle = '#1a1a1a';
				ctx.beginPath();
				this.freeform.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y));
				ctx.stroke();
				ctx.restore();
			},
		});
	}

	/**
	 * the trail -> a smooth subpath (Douglas-Peucker with Curve Fit px, Catmull-Rom handles)
	 */
	async finish_freeform() {
		var pts = this.freeform || [];
		this.freeform = null;
		if (this.magnet) { this.magnet.edges = null; this.magnet = null; }
		app.GUI.Ps_workspace.Selection.draw_overlay();
		if (pts.length < 2) return;
		var tol = Math.max(0.5, config.TOOL.attributes.curve_fit || 2);
		var simplify = (list) => {
			if (list.length < 3) return list;
			var a = list[0], b = list[list.length - 1], best = -1, bd = 0;
			var len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
			for (var i = 1; i < list.length - 1; i++) {
				var d = Math.abs((b.x - a.x) * (a.y - list[i].y) - (a.x - list[i].x) * (b.y - a.y)) / len;
				if (d > bd) { bd = d; best = i; }
			}
			if (bd <= tol) return [a, b];
			return simplify(list.slice(0, best + 1)).slice(0, -1).concat(simplify(list.slice(best)));
		};
		var first = pts[0], end = pts[pts.length - 1];
		var closed = pts.length > 4 && Math.hypot(end.x - first.x, end.y - first.y) * (config.ZOOM || 1) < 10;
		var simple;
		if (closed) {
			//a loop: split at the point farthest from the start, simplify both halves
			var far = 0, fd = 0;
			pts.forEach((q, i) => { var d = Math.hypot(q.x - first.x, q.y - first.y); if (d > fd) { fd = d; far = i; } });
			simple = simplify(pts.slice(0, far + 1)).slice(0, -1).concat(simplify(pts.slice(far)));
			if (simple.length > 2) simple.pop();
		}
		else simple = simplify(pts);
		var n = simple.length;
		var anchors = simple.map((q, i) => {
			var prev = simple[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], next = simple[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
			var corner = !closed && (i == 0 || i == n - 1);
			var tx = corner ? 0 : (next.x - prev.x) / 6, ty = corner ? 0 : (next.y - prev.y) / 6;
			return { x: q.x, y: q.y, ix: q.x - tx, iy: q.y - ty, ox: q.x + tx, oy: q.y + ty };
		});
		var Paths = this.paths();
		if (config.TOOL.attributes.pen_mode == 'Shape' && !(config.ps_path_active == 'layer' && config.layer && config.layer.type == 'ps_shape')) {
			await app.GUI.Ps_workspace.Shapes.create_empty(first.x, first.y);
		}
		var ed = Paths.editable();
		if (config.TOOL.attributes.align_edges && config.TOOL.attributes.pen_mode == 'Shape') {
			anchors.forEach((a) => {
				var dx = Math.round(a.x) - a.x, dy = Math.round(a.y) - a.y;
				a.x += dx; a.ix += dx; a.ox += dx;
				a.y += dy; a.iy += dy; a.oy += dy;
			});
		}
		var added = { closed: closed, pts: anchors };
		Paths.tag_op(ed.path.subpaths, added, app.GUI.Ps_workspace.path_op);
		ed.path.subpaths.push(added);
		await Paths.commit(ed.paths, ed.index, ed.path.subpaths.length == 1 && !ed.paths._layer_path ? 'New Work Path' : 'Freeform Pen');
	}

	/**
	 * the first point of the path being drawn
	 */
	closing_hit(p) {
		var Paths = this.paths();
		var path = Paths.active();
		if (!path || !Paths.drawing || !path.subpaths.length) return false;
		var sp = path.subpaths[path.subpaths.length - 1];
		if (sp.closed || sp.pts.length < 2) return false;
		var t = Paths.tolerance();
		return Math.abs(sp.pts[0].x - p.x) <= t && Math.abs(sp.pts[0].y - p.y) <= t;
	}

	is_drawing_end(hit) {
		var path = this.paths().active();
		return hit.sub == path.subpaths.length - 1;
	}

	/**
	 * dragging out handles: symmetric smooth point (Alt breaks the symmetry)
	 */
	mousemove(e) {
		var d = this.drag;
		if (d.kind == 'freeform') {
			var fp = this.world(e), last = d.pts[d.pts.length - 1];
			if (this.magnet) {
				var dist = Math.hypot(fp.x - last.x, fp.y - last.y), n = Math.floor(dist / 2);
				for (var si = 1; si <= n; si++) {
					var q = this.magnet.snap({ x: last.x + (fp.x - last.x) * si / n, y: last.y + (fp.y - last.y) * si / n });
					var prev = d.pts[d.pts.length - 1];
					if (Math.hypot(q.x - prev.x, q.y - prev.y) >= 0.5) d.pts.push(q);
				}
			}
			else if (Math.hypot(fp.x - last.x, fp.y - last.y) * (config.ZOOM || 1) >= 2) d.pts.push(fp);
			this.freeform = d.pts;
			app.GUI.Ps_workspace.Selection.draw_overlay();
			return;
		}
		if (d.kind != 'handles') return;
		var p = this.world(e);
		var path = this.paths().active();
		if (!path) return;
		var sp = path.subpaths[d.hit.sub];
		if (!sp) return;
		var a = sp.pts[d.hit.index];
		//the History state recorded at mousedown holds this array; the drag finishes that state
		a.ox = p.x;
		a.oy = p.y;
		if (!e.altKey) {
			a.ix = 2 * a.x - p.x;
			a.iy = 2 * a.y - p.y;
		}
		app.GUI.Ps_workspace.Selection.draw_overlay();
	}

	on_activate() {
		document.getElementById('main_wrapper').style.cursor = 'crosshair';
	}

	on_leave() {
		this.paths().drawing = false;
	}
}

export default Ps_pen_class;
