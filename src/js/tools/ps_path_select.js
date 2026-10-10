/*
 * pshot - CS6 Path Selection Tool (mode 'path': drag moves a whole subpath)
 * and Direct Selection Tool (mode 'direct': drag anchor points and handles;
 * dragging a segment moves its two anchors).
 */

import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';

class Ps_path_select_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.ctx = ctx;
		this.name = 'ps_path_select';
		this.drag = null;
	}

	paths() {
		return app.GUI.Ps_workspace.Paths;
	}

	world(e) {
		var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
		return app.Layers.get_world_coords(e.clientX - rect.left, e.clientY - rect.top);
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
		document.addEventListener('mouseup', () => {
			if (config.TOOL.name != this.name || !this.drag) return;
			this.mouseup();
		});
	}

	/**
	 * which subpath contains p (inside the filled shape or on its outline)
	 */
	hit_subpath(p) {
		var Paths = this.paths();
		var path = Paths.active();
		if (!path) return null;
		var anchor = Paths.hit_anchor(p);
		if (anchor) return anchor.sub;
		var seg = Paths.hit_segment(p);
		if (seg) return seg.sub;
		var ctx = document.createElement('canvas').getContext('2d');
		for (var si = path.subpaths.length - 1; si >= 0; si--) {
			ctx.beginPath();
			var sp = path.subpaths[si];
			if (!sp.pts.length) continue;
			ctx.moveTo(sp.pts[0].x, sp.pts[0].y);
			for (var i = 0; i < sp.pts.length; i++) {
				var a = sp.pts[i], b = sp.pts[(i + 1) % sp.pts.length];
				ctx.bezierCurveTo(a.ox, a.oy, b.ix, b.iy, b.x, b.y);
			}
			if (ctx.isPointInPath(p.x, p.y)) return si;
		}
		return null;
	}

	/**
	 * Select: All Layers - a click on another shape layer's shape targets it
	 */
	async pick_layer(p) {
		var Shapes = app.GUI.Ps_workspace.Shapes;
		var ctx = document.createElement('canvas').getContext('2d');
		var ordered = app.GUI.Ps_workspace.Groups.ordered();
		for (var l of ordered) {
			if (l.type != 'ps_shape' || l.visible === false || l === config.layer) continue;
			if (!ctx.isPointInPath(Shapes.path2d(Shapes.current_subpaths(l)), p.x, p.y, 'evenodd')) continue;
			await app.State.do_action(new app.Actions.Select_layer_action(l.id));
			config.ps_path_active = 'layer';
			this.paths().changed();
			return true;
		}
		return false;
	}

	async mousedown(e) {
		var Paths = this.paths();
		var p = this.world(e);
		var direct = (config.TOOL.attributes.mode || 'path') == 'direct';
		if (config.TOOL.attributes.path_layers == 'All Layers' && !(Paths.active() && this.hit_subpath(p) != null)) {
			await this.pick_layer(p);
		}
		if (!Paths.active()) return;
		var targets = null;
		if (direct) {
			var handle = Paths.hit_handle(p);
			var anchor = handle ? null : Paths.hit_anchor(p);
			if (handle) {
				targets = { handle: handle };
			}
			else if (anchor) {
				Paths.selected = anchor;
				targets = { anchors: [anchor] };
			}
			else {
				var seg = Paths.hit_segment(p);
				if (seg) {
					var sp = Paths.active().subpaths[seg.sub];
					targets = { anchors: [{ sub: seg.sub, index: seg.index }, { sub: seg.sub, index: (seg.index + 1) % sp.pts.length }] };
					Paths.selected = null;
				}
			}
		}
		else {
			var sub = this.hit_subpath(p);
			if (sub != null) {
				Paths.selected = { sub: sub, all: true };
				targets = { anchors: Paths.active().subpaths[sub].pts.map((_, i) => ({ sub: sub, index: i })) };
			}
		}
		if (!targets) {
			//click on empty canvas: deselect the anchors
			Paths.selected = null;
			Paths.changed();
			return;
		}
		var ed = Paths.editable();
		this.drag = { start: p, ed: ed, targets: targets, origin: JSON.parse(JSON.stringify(ed.path.subpaths)), moved: false };
		Paths.changed();
	}

	mousemove(e) {
		var d = this.drag;
		var p = this.world(e);
		var dx = p.x - d.start.x, dy = p.y - d.start.y;
		if (!d.moved && Math.hypot(dx, dy) < 1) return;
		d.moved = true;
		var subs = d.ed.path.subpaths;
		if (d.targets.handle) {
			var h = d.targets.handle;
			var a = subs[h.sub].pts[h.index], o = d.origin[h.sub].pts[h.index];
			var key = h.handle == 'out' ? ['ox', 'oy', 'ix', 'iy'] : ['ix', 'iy', 'ox', 'oy'];
			a[key[0]] = o[key[0]] + dx;
			a[key[1]] = o[key[1]] + dy;
			//a smooth point keeps its handles in line (the other keeps its length); Alt breaks it
			var ol = Math.hypot(o[key[2]] - o.x, o[key[3]] - o.y);
			var smooth = ol > 0 && Math.abs((o[key[0]] - o.x) * (o[key[3]] - o.y) - (o[key[1]] - o.y) * (o[key[2]] - o.x)) < 1e-3 * (ol + 1) * (ol + 1);
			if (smooth && !e.altKey) {
				var vx = a[key[0]] - a.x, vy = a[key[1]] - a.y, vl = Math.hypot(vx, vy) || 1;
				a[key[2]] = a.x - vx / vl * ol;
				a[key[3]] = a.y - vy / vl * ol;
			}
		}
		else {
			for (var t of d.targets.anchors) {
				var pt = subs[t.sub].pts[t.index], og = d.origin[t.sub].pts[t.index];
				for (var k of ['x', 'ix', 'ox']) pt[k] = og[k] + dx;
				for (var k2 of ['y', 'iy', 'oy']) pt[k2] = og[k2] + dy;
			}
		}
		//preview without History: show the edited copy
		this.preview(d.ed);
	}

	preview(ed) {
		if (ed.paths._layer_path) {
			//shape path / vector mask: the layer follows live; the outline is the layer's own
			if (this.restore_layer) this.restore_layer();
			this.restore_layer = this.paths().preview_layer_path(ed.path);
			app.GUI.Ps_workspace.Selection.draw_overlay();
			return;
		}
		this.saved = this.saved || { paths: config.ps_paths, active: config.ps_path_active };
		config.ps_paths = ed.paths;
		config.ps_path_active = ed.index;
		app.GUI.Ps_workspace.Selection.draw_overlay();
	}

	async mouseup() {
		var d = this.drag;
		this.drag = null;
		if (this.saved) {
			config.ps_paths = this.saved.paths;
			config.ps_path_active = this.saved.active;
			this.saved = null;
		}
		if (this.restore_layer) {
			this.restore_layer();
			this.restore_layer = null;
		}
		if (!d.moved) return;
		var name = d.targets.handle ? 'Drag Handle' : ((config.TOOL.attributes.mode || 'path') == 'direct' ? 'Drag Anchor Point' : 'Drag Path');
		await this.paths().commit(d.ed.paths, d.ed.index, name);
	}

	on_activate() {
		document.getElementById('main_wrapper').style.cursor = 'default';
		this.paths().changed();
	}
}

export default Ps_path_select_class;
