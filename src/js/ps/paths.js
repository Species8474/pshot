/*
 * pshot - CS6 paths: Work Path and saved paths, the Paths panel, and the path
 * commands (Make Selection, Fill Path, Stroke Path, Make Work Path).
 *
 * config.ps_paths = [{ name, work, subpaths: [{ closed, pts: [{ x, y, ix, iy, ox, oy }] }] }]
 * (ix/iy = incoming handle, ox/oy = outgoing handle, document coordinates)
 * config.ps_path_active = index of the path shown/edited, -1 for none.
 *
 * Every change replaces config.ps_paths with a new array through
 * Update_config_action, so it is undoable and never mutates an older state.
 */

import app from './../app.js';
import config from './../config.js';
import zoomView from './../libs/zoomView.js';
import Dialog_class from './../libs/popup.js';
import { show_popup_menu } from './popup-menu.js';
import { fit_loop } from './curve-fit.js';
import { ensure_pixel_layer, alert_box } from './pixel-layer.js';

const S = 'fill="none" stroke="currentColor" stroke-width="1.2"';
const FOOTER = [
	['fill', 'Fill path with foreground color', `<circle cx="9" cy="9" r="6" fill="currentColor"/>`],
	['stroke', 'Stroke path with brush', `<circle cx="9" cy="9" r="6" ${S}/>`],
	['selection', 'Load path as a selection', `<circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 1.5"/>`],
	['work_path', 'Make work path from selection', `<rect x="3" y="3" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 1.5"/><path d="M6 12C6 7 12 11 12 6" ${S}/>`],
	['mask', 'Add a mask', `<rect x="2.5" y="4" width="13" height="10" ${S}/><circle cx="9" cy="9" r="3" fill="currentColor"/>`],
	['new', 'Create new path', `<rect x="4" y="3" width="10" height="12" ${S}/><path d="M11 3v3h3" ${S}/>`],
	['delete', 'Delete current path', `<path d="M5 5h8l-.8 10H5.8zM4 5h10M7.5 3h3" ${S}/>`],
];

function clone(paths) {
	return JSON.parse(JSON.stringify(paths || []));
}

function point(x, y) {
	return { x: x, y: y, ix: x, iy: y, ox: x, oy: y };
}

/**
 * canvas path for one subpath
 */
function trace(ctx, sp) {
	var pts = sp.pts;
	if (!pts.length) return;
	ctx.moveTo(pts[0].x, pts[0].y);
	var n = sp.closed ? pts.length : pts.length - 1;
	for (var i = 0; i < n; i++) {
		var a = pts[i], b = pts[(i + 1) % pts.length];
		ctx.bezierCurveTo(a.ox, a.oy, b.ix, b.iy, b.x, b.y);
	}
	if (sp.closed) ctx.closePath();
}

class Ps_paths_class {

	constructor() {
		//anchor selection for the Direct Selection tool: { sub, index }
		this.selected = null;
		this.drawing = false;
	}

	init() {
		if (!config.ps_paths) config.ps_paths = [];
		if (config.ps_path_active == null) config.ps_path_active = -1;
		this.render_panel();
	}

	active() {
		if (config.ps_path_active == 'layer') return this.layer_path();
		var paths = config.ps_paths || [];
		return paths[config.ps_path_active] || null;
	}

	/**
	 * CS6 shows a shape layer's path / a layer's vector mask as a temporary path
	 * (document coordinates); null when the active layer has none
	 */
	layer_path() {
		var l = config.layer;
		if (!l) return null;
		if (l.type == 'ps_shape' && l.ps_shape) {
			return { name: l.name + ' Shape Path', layer: l.id, subpaths: app.GUI.Ps_workspace.Shapes.current_subpaths(l) };
		}
		if (l.ps_vmask) {
			var vm = l.ps_vmask, dx = l.x - (vm.lx || 0), dy = l.y - (vm.ly || 0);
			return { name: l.name + ' Vector Mask', layer: l.id, subpaths: (vm.subpaths || []).map(sp => ({ closed: sp.closed, pts: sp.pts.map(p => ({ x: p.x + dx, y: p.y + dy, ix: p.ix + dx, iy: p.iy + dy, ox: p.ox + dx, oy: p.oy + dy })) })) };
		}
		return null;
	}

	/**
	 * the layer settings for an edited layer path
	 */
	layer_path_settings(l, subpaths) {
		var settings;
		if (l.type == 'ps_shape') {
			var xs = [], ys = [];
			subpaths.forEach(sp => sp.pts.forEach(p => { xs.push(p.x); ys.push(p.y); }));
			var sh = Object.assign({}, l.ps_shape, { subpaths: subpaths });
			if (xs.length) {
				sh.bx = Math.min.apply(null, xs); sh.by = Math.min.apply(null, ys);
				sh.bw = Math.max(1, Math.max.apply(null, xs) - sh.bx); sh.bh = Math.max(1, Math.max.apply(null, ys) - sh.by);
			}
			settings = { ps_shape: sh, x: sh.bx, y: sh.by, width: sh.bw, height: sh.bh, rotate: 0 };
		}
		else {
			settings = { ps_vmask: Object.assign({}, l.ps_vmask, { subpaths: subpaths, lx: l.x, ly: l.y }) };
		}
		return settings;
	}

	/**
	 * live preview while dragging (no History); returns the restore function
	 */
	preview_layer_path(path) {
		var l = config.layer;
		if (!l || path.layer != l.id) return null;
		var settings = this.layer_path_settings(l, path.subpaths);
		var saved = {};
		for (var k in settings) saved[k] = l[k];
		Object.assign(l, settings);
		config.need_render = true;
		return () => { Object.assign(l, saved); config.need_render = true; };
	}

	/**
	 * write an edited layer path back to its shape layer / vector mask
	 */
	async commit_layer_path(path, description) {
		var l = config.layer;
		if (!l || path.layer != l.id) return;
		var settings = this.layer_path_settings(l, path.subpaths);
		await app.State.do_action(new app.Actions.Bundle_action('paths', description, [
			new app.Actions.Update_layer_action(l.id, settings),
		]));
		app.GUI.GUI_layers.render_layers();
		this.changed();
	}

	/**
	 * records a new paths state in History
	 */
	async commit(paths, active, description) {
		if (paths._layer_path) {
			return this.commit_layer_path(paths[0], description);
		}
		var settings = { ps_paths: paths };
		if (active !== undefined) settings.ps_path_active = active;
		await app.State.do_action(new app.Actions.Bundle_action('paths', description, [
			new app.Actions.Update_config_action(settings),
		]));
		this.changed();
	}

	changed() {
		this.render_panel();
		config.need_render = true;
		app.GUI.Ps_workspace.Selection.draw_overlay();
	}

	/**
	 * a copy of the paths with the active one ready to edit; creates the Work Path
	 * (replacing an unsaved one, as CS6 does) when no path is active
	 */
	editable() {
		var lp = config.ps_path_active == 'layer' ? this.layer_path() : null;
		if (lp) {
			var only = [clone([lp])[0]];
			only._layer_path = true;
			return { paths: only, index: 0, path: only[0] };
		}
		var paths = clone(config.ps_paths);
		var index = config.ps_path_active;
		if (!paths[index]) {
			paths = paths.filter(p => !p.work);
			paths.push({ name: 'Work Path', work: true, subpaths: [] });
			index = paths.length - 1;
		}
		return { paths: paths, index: index, path: paths[index] };
	}

	// ---------- drawing on the overlay ----------

	draw(ctx, scale) {
		var path = this.active();
		if (!path) return;
		ctx.save();
		ctx.lineWidth = 1 / scale;
		ctx.strokeStyle = '#1a1a1a';
		ctx.beginPath();
		for (var sp of path.subpaths) trace(ctx, sp);
		ctx.stroke();
		ctx.strokeStyle = 'rgba(255,255,255,0.6)';
		ctx.setLineDash([2 / scale, 2 / scale]);
		ctx.stroke();
		ctx.setLineDash([]);
		var tool = config.TOOL.name;
		if (tool == 'ps_pen' || tool == 'ps_path_select') {
			var r = 3 / scale;
			path.subpaths.forEach((sp, si) => {
				sp.pts.forEach((p, pi) => {
					var sel = this.selected && this.selected.sub == si && (this.selected.index == pi || this.selected.all);
					var last = this.drawing && si == path.subpaths.length - 1 && pi == sp.pts.length - 1;
					if (sel || last) {
						//handles of the selected anchor
						ctx.strokeStyle = '#1a1a1a';
						ctx.beginPath();
						ctx.moveTo(p.ix, p.iy); ctx.lineTo(p.x, p.y); ctx.lineTo(p.ox, p.oy);
						ctx.stroke();
						for (var [hx, hy] of [[p.ix, p.iy], [p.ox, p.oy]]) {
							if (hx == p.x && hy == p.y) continue;
							ctx.fillStyle = '#1a1a1a';
							ctx.beginPath();
							ctx.arc(hx, hy, r * 0.8, 0, Math.PI * 2);
							ctx.fill();
						}
					}
					ctx.fillStyle = sel || last ? '#1a1a1a' : '#ffffff';
					ctx.strokeStyle = '#1a1a1a';
					ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
					ctx.strokeRect(p.x - r, p.y - r, r * 2, r * 2);
				});
			});
		}
		ctx.restore();
	}

	// ---------- hit tests (document coordinates; tolerance in screen pixels) ----------

	tolerance() {
		return 6 / zoomView.getScale();
	}

	hit_anchor(p, path) {
		path = path || this.active();
		if (!path) return null;
		var t = this.tolerance();
		for (var si = path.subpaths.length - 1; si >= 0; si--) {
			var pts = path.subpaths[si].pts;
			for (var pi = 0; pi < pts.length; pi++) {
				if (Math.abs(pts[pi].x - p.x) <= t && Math.abs(pts[pi].y - p.y) <= t) return { sub: si, index: pi };
			}
		}
		return null;
	}

	hit_handle(p) {
		var path = this.active();
		if (!path || !this.selected) return null;
		var t = this.tolerance();
		var sp = path.subpaths[this.selected.sub];
		if (!sp) return null;
		var a = sp.pts[this.selected.index];
		if (!a) return null;
		if (Math.hypot(a.ox - p.x, a.oy - p.y) <= t && (a.ox != a.x || a.oy != a.y)) return { sub: this.selected.sub, index: this.selected.index, handle: 'out' };
		if (Math.hypot(a.ix - p.x, a.iy - p.y) <= t && (a.ix != a.x || a.iy != a.y)) return { sub: this.selected.sub, index: this.selected.index, handle: 'in' };
		return null;
	}

	/**
	 * nearest segment under p: { sub, index (segment start), t }
	 */
	hit_segment(p) {
		var path = this.active();
		if (!path) return null;
		var tol = this.tolerance(), best = null;
		path.subpaths.forEach((sp, si) => {
			var n = sp.closed ? sp.pts.length : sp.pts.length - 1;
			for (var i = 0; i < n; i++) {
				var a = sp.pts[i], b = sp.pts[(i + 1) % sp.pts.length];
				for (var k = 0; k <= 40; k++) {
					var t = k / 40, q = this.bezier(a, b, t);
					var d = Math.hypot(q.x - p.x, q.y - p.y);
					if (d <= tol && (!best || d < best.d)) best = { sub: si, index: i, t: t, d: d };
				}
			}
		});
		return best;
	}

	bezier(a, b, t) {
		var u = 1 - t;
		return {
			x: u * u * u * a.x + 3 * u * u * t * a.ox + 3 * u * t * t * b.ix + t * t * t * b.x,
			y: u * u * u * a.y + 3 * u * u * t * a.oy + 3 * u * t * t * b.iy + t * t * t * b.y,
		};
	}

	/**
	 * split a segment at t (de Casteljau); returns the new anchor
	 */
	split(sp, index, t) {
		var a = sp.pts[index], b = sp.pts[(index + 1) % sp.pts.length];
		var lerp = (p, q) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
		var p0 = { x: a.x, y: a.y }, p1 = { x: a.ox, y: a.oy }, p2 = { x: b.ix, y: b.iy }, p3 = { x: b.x, y: b.y };
		var q0 = lerp(p0, p1), q1 = lerp(p1, p2), q2 = lerp(p2, p3);
		var r0 = lerp(q0, q1), r1 = lerp(q1, q2), s = lerp(r0, r1);
		a.ox = q0.x; a.oy = q0.y;
		b.ix = q2.x; b.iy = q2.y;
		var np = { x: s.x, y: s.y, ix: r0.x, iy: r0.y, ox: r1.x, oy: r1.y };
		sp.pts.splice(index + 1, 0, np);
		return np;
	}

	// ---------- path -> pixels ----------

	shape_canvas(path, fill_rule) {
		var canvas = document.createElement('canvas');
		canvas.width = config.WIDTH;
		canvas.height = config.HEIGHT;
		var ctx = canvas.getContext('2d');
		ctx.fillStyle = '#000';
		//path operations: each component is combined with the ones below it
		var GCO = { combine: 'source-over', subtract: 'destination-out', intersect: 'destination-in', exclude: 'xor' };
		for (var comp of app.GUI.Ps_workspace.Shapes.components(path.subpaths)) {
			ctx.globalCompositeOperation = GCO[comp.op] || 'source-over';
			ctx.beginPath();
			for (var sp of comp.subpaths) trace(ctx, sp);
			ctx.fill(fill_rule || 'evenodd');
		}
		return canvas;
	}

	/**
	 * a new subpath joins the path with the options bar's path operation
	 */
	tag_op(subs, sp, op) {
		if (!subs.length || !op) return;
		var last = 'combine';
		for (var s of subs) if (s.op) last = s.op;
		if (op != 'combine' || last != 'combine') sp.op = op;
	}

	/**
	 * Path operations menu (Pen, Freeform Pen, Path Selection): the operation
	 * for new subpaths, or with the Path Selection tool the selected subpath's
	 */
	ops_menu(anchor, for_selection) {
		var ws = app.GUI.Ps_workspace;
		var path = this.active(), sel = this.selected;
		var target = for_selection && path && sel && sel.all ? path.subpaths[sel.sub] : null;
		var cur = for_selection ? (target ? target.op || 'combine' : null) : ws.path_op || 'combine';
		var set = (op) => {
			if (!for_selection) { ws.path_op = op; return; }
			if (!target) return;
			var ed = this.editable();
			var sp = ed.path.subpaths[sel.sub];
			if (sel.sub == 0) delete sp.op;
			else sp.op = op;
			this.commit(ed.paths, ed.index, 'Path Operation');
		};
		var item = (name, op) => ({ name: name, checked: cur == op, action: !for_selection || target ? () => set(op) : null });
		show_popup_menu(anchor, [
			item('Combine Shapes', 'combine'),
			item('Subtract Front Shape', 'subtract'),
			item('Intersect Shape Areas', 'intersect'),
			item('Exclude Overlapping Shapes', 'exclude'),
			{ divider: true },
			{ name: 'Merge Shape Components', action: path && path.subpaths.length > 1 ? () => this.merge_components() : null },
		]);
	}

	/**
	 * the visible result of the path's operations as plain subpaths
	 */
	async merge_components() {
		if (config.ps_path_active == 'layer' && config.layer && config.layer.type == 'ps_shape') {
			return app.GUI.Ps_workspace.Shapes.merge_components();
		}
		var ed = this.editable();
		if (!ed || !ed.path.subpaths.length) return;
		var subpaths = this.trace_mask(this.shape_canvas(ed.path, 'nonzero'), 0.75);
		if (!subpaths.length) return;
		ed.path.subpaths = subpaths;
		this.selected = null;
		await this.commit(ed.paths, ed.index, 'Merge Shape Components');
	}

	/**
	 * Ctrl+Enter / "Load path as a selection"
	 */
	make_selection(op, feather) {
		var path = this.active();
		if (!path || !path.subpaths.length) return;
		var Selection = app.GUI.Ps_workspace.Selection;
		var mask = this.shape_canvas(path);
		var combined = Selection.combine(mask, op || 'new');
		Selection.commit(feather ? Selection.feather_mask(combined, feather) : combined, 'Make Selection');
	}

	make_selection_dialog() {
		if (!this.active()) return;
		var POP = new Dialog_class();
		POP.show({
			title: 'Make Selection',
			params: [
				{ name: 'feather', title: 'Feather Radius (pixels):', value: 0, range: [0, 250] },
				{ name: 'op', title: 'Operation:', values: ['New Selection', 'Add to Selection', 'Subtract from Selection', 'Intersect with Selection'], value: 'New Selection' },
			],
			on_finish: (params) => {
				var ops = { 'New Selection': 'new', 'Add to Selection': 'add', 'Subtract from Selection': 'subtract', 'Intersect with Selection': 'intersect' };
				this.make_selection(ops[params.op], parseFloat(params.feather) || 0);
			},
		});
	}

	async paint(kind) {
		var path = this.active();
		if (!path || !path.subpaths.length) return;
		ensure_pixel_layer();
		var layer = config.layer;
		if (!layer || layer.type != 'image' || !layer.link) {
			alert_box('Could not complete your request because the target layer is not a pixel layer.');
			return;
		}
		var paint = document.createElement('canvas');
		paint.width = config.WIDTH;
		paint.height = config.HEIGHT;
		var ctx = paint.getContext('2d');
		ctx.beginPath();
		for (var sp of path.subpaths) trace(ctx, sp);
		if (kind == 'fill') {
			ctx.fillStyle = config.COLOR;
			ctx.fill('evenodd');
		}
		else {
			//Stroke Path: the Brush tool's size, hardness and color
			var brush = config.TOOLS.find(t => t.name == 'brush').attributes;
			var size = brush.size || 1, hardness = brush.hardness == null ? 100 : brush.hardness;
			ctx.strokeStyle = config.COLOR;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			ctx.lineWidth = size * (0.6 + 0.4 * hardness / 100);
			if (hardness < 100) ctx.filter = 'blur(' + (size * (1 - hardness / 100) / 8) + 'px)';
			ctx.stroke();
		}
		//into the layer's pixel space, inside the selection
		var Selection = app.GUI.Ps_workspace.Selection;
		var out = document.createElement('canvas');
		out.width = layer.width_original;
		out.height = layer.height_original;
		var octx = out.getContext('2d');
		octx.drawImage(layer.link, 0, 0);
		var piece = document.createElement('canvas');
		piece.width = out.width;
		piece.height = out.height;
		var pctx = piece.getContext('2d');
		var sx = layer.width_original / layer.width, sy = layer.height_original / layer.height;
		pctx.setTransform(sx, 0, 0, sy, -layer.x * sx, -layer.y * sy);
		pctx.drawImage(paint, 0, 0);
		pctx.setTransform(1, 0, 0, 1, 0, 0);
		if (Selection.has()) {
			pctx.globalCompositeOperation = 'destination-in';
			pctx.drawImage(Selection.mask_for_layer(layer), 0, 0);
		}
		if (layer.ps_lock && layer.ps_lock.transparency) octx.globalCompositeOperation = 'source-atop';
		octx.drawImage(piece, 0, 0);
		await app.State.do_action(new app.Actions.Bundle_action('paths', kind == 'fill' ? 'Fill Path' : 'Stroke Path', [
			new app.Actions.Update_layer_image_action(out, layer.id),
		]));
	}

	/**
	 * Make Work Path from selection: traces the selection outline (tolerance 2 px)
	 */
	async from_selection(tolerance, source_mask) {
		var Selection = app.GUI.Ps_workspace.Selection;
		if (!source_mask && !Selection.has()) return;
		var paths = clone(config.ps_paths).filter(p => !p.work);
		paths.push({ name: 'Work Path', work: true, subpaths: this.trace_mask(source_mask || Selection.mask, tolerance) });
		await this.commit(paths, paths.length - 1, 'Make Work Path');
		if (!source_mask) Selection.deselect();
	}

	/**
	 * the outline of a mask's opaque pixels as closed subpaths
	 */
	trace_mask(mask, tolerance) {
		var w = mask.width, h = mask.height;
		var d = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
		var inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 127;
		//boundary edges between inside and outside pixels, chained into loops
		var edges = new Map();
		var key = (x, y) => x + ',' + y;
		var add = (x1, y1, x2, y2) => { edges.set(key(x1, y1), [x2, y2]); };
		for (var y = 0; y <= h; y++) {
			for (var x = 0; x <= w; x++) {
				var a = inside(x, y), up = inside(x, y - 1), left = inside(x - 1, y);
				if (a && !up) add(x, y, x + 1, y);
				if (!a && up) add(x + 1, y, x, y);
				if (a && !left) add(x, y + 1, x, y);
				if (!a && left) add(x, y, x, y + 1);
			}
		}
		var loops = [];
		while (edges.size) {
			var start = edges.keys().next().value;
			var loop = [];
			var k = start;
			while (edges.has(k)) {
				var next = edges.get(k);
				edges.delete(k);
				var c = k.split(',').map(Number);
				loop.push({ x: c[0], y: c[1] });
				k = key(next[0], next[1]);
			}
			if (loop.length > 3) loops.push(loop);
		}
		var tol = tolerance == null ? 2 : tolerance;
		var simplify = (pts) => {
			//Douglas-Peucker on a closed loop
			var dp = (list, from, to, out) => {
				var a = list[from], b = list[to], max = 0, idx = -1;
				for (var i = from + 1; i < to; i++) {
					var p = list[i];
					var len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
					var dist = Math.abs((b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x) / len;
					if (dist > max) { max = dist; idx = i; }
				}
				if (max > tol && idx > 0) { dp(list, from, idx, out); out.push(list[idx]); dp(list, idx, to, out); }
			};
			var mid = Math.floor(pts.length / 2);
			var out = [pts[0]];
			dp(pts, 0, mid, out);
			out.push(pts[mid]);
			dp(pts.concat([pts[0]]), mid, pts.length, out);
			return out;
		};
		//CS6: smooth outlines become curves, straight runs keep their corners
		return loops.map(l => {
			var simple = simplify(l);
			var straight = simple.length <= 8 && simple.every((p, i) => { var q = simple[(i + 1) % simple.length]; return p.x == q.x || p.y == q.y; });
			return { closed: true, pts: straight ? simple.map(p => point(p.x, p.y)) : fit_loop(l, Math.max(0.5, tol)) };
		});
	}

	// ---------- panel ----------

	render_panel() {
		var el = document.getElementById('ps_paths');
		if (!el) return;
		var paths = config.ps_paths || [];
		var html = '<div class="ps_paths_list">';
		var lp = this.layer_path();
		if (lp) {
			html += '<div class="ps_path_row' + (config.ps_path_active == 'layer' ? ' active' : '') + '" data-index="layer">'
				+ '<canvas class="ps_path_thumb" width="36" height="28" data-index="layer"></canvas>'
				+ '<span class="ps_path_name work">' + app.GUI.Ps_workspace.Helper.escapeHtml(lp.name) + '</span></div>';
		}
		paths.forEach((p, i) => {
			html += '<div class="ps_path_row' + (i == config.ps_path_active ? ' active' : '') + '" data-index="' + i + '">'
				+ '<canvas class="ps_path_thumb" width="36" height="28" data-index="' + i + '"></canvas>'
				+ '<span class="ps_path_name' + (p.work ? ' work' : '') + (config.ps_clip_path && !p.work && config.ps_clip_path.name == p.name ? ' clipping' : '') + '">' + app.GUI.Ps_workspace.Helper.escapeHtml(p.name) + '</span></div>';
		});
		html += '</div><div class="ps_panel_footer">';
		var has = !!this.active();
		var sel = app.GUI.Ps_workspace.Selection && app.GUI.Ps_workspace.Selection.has();
		for (var [k, title, icon] of FOOTER) {
			var enabled = k == 'new' || (k == 'work_path' ? sel : (k == 'mask' ? false : has));
			html += '<button type="button" data-path-action="' + k + '" title="' + title + '"' + (enabled ? '' : ' class="disabled"') + '><svg viewBox="0 0 18 18" width="16" height="16">' + icon + '</svg></button>';
		}
		html += '</div>';
		el.innerHTML = html;
		el.querySelectorAll('canvas.ps_path_thumb').forEach((c) => this.draw_thumb(c, c.dataset.index == 'layer' ? lp : paths[c.dataset.index]));
		el.querySelectorAll('.ps_path_row').forEach((row) => {
			row.addEventListener('click', (e) => {
				e.stopPropagation();
				config.ps_path_active = row.dataset.index == 'layer' ? 'layer' : parseInt(row.dataset.index);
				this.selected = null;
				this.changed();
			});
			row.addEventListener('dblclick', () => { if (row.dataset.index != 'layer') this.rename(parseInt(row.dataset.index)); });
		});
		el.querySelector('.ps_paths_list').addEventListener('click', (e) => {
			//CS6: clicking the empty area deselects the path (hides it)
			if (e.target.classList.contains('ps_paths_list')) {
				config.ps_path_active = -1;
				this.changed();
			}
		});
		el.querySelectorAll('[data-path-action]').forEach((b) => b.addEventListener('click', () => {
			if (b.classList.contains('disabled')) return;
			this.action(b.dataset.pathAction);
		}));
	}

	draw_thumb(canvas, path) {
		var ctx = canvas.getContext('2d');
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		var s = Math.min(canvas.width / config.WIDTH, canvas.height / config.HEIGHT);
		ctx.setTransform(s, 0, 0, s, (canvas.width - config.WIDTH * s) / 2, (canvas.height - config.HEIGHT * s) / 2);
		ctx.fillStyle = '#7a7a7a';
		ctx.beginPath();
		for (var sp of path.subpaths) trace(ctx, sp);
		ctx.fill('evenodd');
		ctx.lineWidth = 1 / s;
		ctx.strokeStyle = '#333';
		ctx.stroke();
	}

	action(kind) {
		switch (kind) {
			case 'fill': return this.paint('fill');
			case 'stroke': return this.paint('stroke');
			case 'selection': return this.make_selection('new');
			case 'work_path': return this.from_selection();
			case 'new': return this.new_path();
			case 'delete': return this.delete_path();
		}
	}

	next_name() {
		var n = 0;
		for (var p of config.ps_paths || []) {
			var m = /^Path (\d+)$/.exec(p.name);
			if (m) n = Math.max(n, parseInt(m[1]));
		}
		return 'Path ' + (n + 1);
	}

	/**
	 * Delete key: the selected anchor (Direct Selection) or subpath (Path Selection)
	 */
	async delete_selected() {
		var sel = this.selected;
		if (!sel || !this.active()) return;
		var ed = this.editable();
		var sp = ed.path.subpaths[sel.sub];
		if (!sp) return;
		if (sel.all) {
			ed.path.subpaths.splice(sel.sub, 1);
		}
		else {
			sp.pts.splice(sel.index, 1);
			if (sp.pts.length == 0) ed.path.subpaths.splice(sel.sub, 1);
			else if (sp.pts.length < 3) sp.closed = false;
		}
		this.selected = null;
		await this.commit(ed.paths, ed.index, sel.all ? 'Delete Path' : 'Delete Anchor Point');
	}

	async new_path() {
		var paths = clone(config.ps_paths);
		paths.push({ name: this.next_name(), work: false, subpaths: [] });
		await this.commit(paths, paths.length - 1, 'New Path');
	}

	async delete_path() {
		var index = config.ps_path_active;
		if (!this.active()) return;
		var paths = clone(config.ps_paths);
		paths.splice(index, 1);
		this.selected = null;
		await this.commit(paths, -1, 'Delete Path');
	}

	/**
	 * Save Path (Work Path) / Rename Path
	 */
	rename(index) {
		var path = (config.ps_paths || [])[index];
		if (!path) return;
		var POP = new Dialog_class();
		POP.show({
			title: path.work ? 'Save Path' : 'Rename Path',
			params: [{ name: 'name', title: 'Name:', value: path.work ? this.next_name() : path.name }],
			on_finish: (params) => {
				var paths = clone(config.ps_paths);
				paths[index].name = params.name || paths[index].name;
				paths[index].work = false;
				this.commit(paths, index, path.work ? 'Save Path' : 'Rename Path');
			},
		});
	}

	panel_menu_items() {
		var has = !!this.active();
		var path = this.active();
		return [
			{ name: 'New Path...', action: () => this.new_path() },
			{ name: 'Duplicate Path...', action: has && !path.work ? () => this.duplicate() : null },
			{ name: 'Delete Path', action: has ? () => this.delete_path() : null },
			{ divider: true },
			{ name: 'Make Work Path...', action: app.GUI.Ps_workspace.Selection.has() ? () => this.from_selection() : null },
			{ divider: true },
			{ name: 'Make Selection...', action: has ? () => this.make_selection_dialog() : null },
			{ name: 'Fill Path...', action: has ? () => this.paint('fill') : null },
			{ name: 'Stroke Path...', action: has ? () => this.paint('stroke') : null },
			{ divider: true },
			{ name: 'Save Path...', action: has && path.work ? () => this.rename(config.ps_path_active) : null },
			{ name: 'Clipping Path...', action: () => this.clipping_path_dialog() },
			{ divider: true },
			{ name: 'Panel Options...' },
			{ divider: true },
			{ name: 'Close', action: () => app.GUI.Ps_workspace.toggle_panel('paths') },
			{ name: 'Close Tab Group', action: () => app.GUI.Ps_workspace.toggle_panel('paths') },
		];
	}

	/**
	 * Clipping Path...: the saved path that crops the image when it is placed elsewhere (saved in PSD)
	 */
	clipping_path_dialog() {
		var saved = (config.ps_paths || []).filter(p => !p.work).map(p => p.name);
		if (!saved.length) {
			app.GUI.Ps_workspace.status_message('Save the work path first (Save Path...).');
			return;
		}
		var cur = config.ps_clip_path || {};
		var active = this.active();
		var POP = new Dialog_class();
		POP.show({
			title: 'Clipping Path',
			params: [
				{ name: 'path', title: 'Path:', values: ['None'].concat(saved), value: cur.name || (active && !active.work ? active.name : saved[0]), type: 'select' },
				{ name: 'flatness', title: 'Flatness (device pixels):', value: cur.flatness || '' },
			],
			on_finish: (p) => {
				var value = p.path == 'None' ? null : { name: p.path, flatness: parseFloat(p.flatness) || 0 };
				app.State.do_action(new app.Actions.Bundle_action('clipping_path', 'Clipping Path', [
					new app.Actions.Update_config_action({ ps_clip_path: value }),
				])).then(() => this.render_panel());
			},
		});
	}

	async duplicate() {
		var path = this.active();
		if (!path) return;
		var paths = clone(config.ps_paths);
		var copy = clone([path])[0];
		copy.name = path.name + ' copy';
		paths.push(copy);
		await this.commit(paths, paths.length - 1, 'Duplicate Path');
	}

	show_menu(anchor) {
		show_popup_menu(anchor, this.panel_menu_items(), { placement: 'below' });
	}
}

export default Ps_paths_class;
export { point, clone, trace };
