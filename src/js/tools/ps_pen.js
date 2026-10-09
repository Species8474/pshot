/*
 * pshot - CS6 Pen Tool group, drawing paths (Paths panel):
 *   mode 'pen'      click = corner point, drag = smooth point; click the first
 *                   point to close. Auto Add/Delete: click a segment to add a
 *                   point, click a point to delete it. Enter/Esc end the path.
 *   mode 'add'      Add Anchor Point Tool
 *   mode 'delete'   Delete Anchor Point Tool
 *   mode 'convert'  Convert Point Tool: click = corner, drag = smooth handles
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
			if (config.TOOL.name != this.name || !this.drag) return;
			this.mousemove(e);
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
			subs.push(current);
		}
		current.pts.push(point(p.x, p.y));
		Paths.drawing = true;
		await Paths.commit(ed4.paths, ed4.index, description);
		this.drag = { kind: 'handles', hit: { sub: subs.length - 1, index: current.pts.length - 1 }, mirror: true };
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
