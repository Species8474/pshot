/*
 * pshot - CS6 Slice Tool (drag a user slice; Style Normal / Fixed Aspect
 * Ratio / Fixed Size) and Slice Select Tool (click to select, drag to move,
 * handles to resize, double-click for Slice Options, Delete removes).
 */

import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';

class Ps_slice_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.ctx = ctx;
		this.name = 'ps_slice';
		this.drag = null;
		this.draft = null;
	}

	slices() {
		return app.GUI.Ps_workspace.Slices;
	}

	world(e) {
		var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
		return app.Layers.get_world_coords(e.clientX - rect.left, e.clientY - rect.top);
	}

	mode() {
		return config.TOOL.attributes.mode || 'slice';
	}

	load() {
		var on_canvas = (e) => e.target && (e.target.id == 'canvas_minipaint' || e.target.id == 'main_wrapper' || e.target.id == 'ps_selection_overlay');
		document.addEventListener('mousedown', (e) => {
			if (config.TOOL.name != this.name || config.space_hand || e.button != 0 || !on_canvas(e)) return;
			e.preventDefault();
			this.mousedown(e);
		});
		document.addEventListener('mousemove', (e) => {
			if (config.TOOL.name != this.name || !this.drag) return;
			this.mousemove(e);
		});
		document.addEventListener('mouseup', (e) => {
			if (config.TOOL.name != this.name || !this.drag) return;
			this.mouseup(e);
		});
		document.addEventListener('dblclick', (e) => {
			if (config.TOOL.name != this.name || this.mode() != 'slice_select' || !on_canvas(e)) return;
			this.slices().options(this.slices().hit(this.world(e)));
		});
		document.addEventListener('keydown', (e) => {
			if (config.TOOL.name != this.name || (e.key != 'Delete' && e.key != 'Backspace')) return;
			if (e.target && (e.target.tagName == 'INPUT' || e.target.tagName == 'TEXTAREA')) return;
			var s = this.slices().selected();
			if (s && !this.slices().locked) {
				e.preventDefault();
				e.stopPropagation();
				this.slices().remove(s.id);
			}
		}, true);
		var Selection = app.GUI.Ps_workspace && app.GUI.Ps_workspace.Selection;
		setTimeout(() => {
			var Sel = app.GUI.Ps_workspace.Selection;
			Sel.overlays = Sel.overlays || [];
			Sel.overlays.push({
				active: () => config.TOOL.name == this.name && this.draft,
				draw: (ctx, scale) => {
					var r = this.draft;
					ctx.save();
					ctx.lineWidth = 1 / scale;
					ctx.strokeStyle = '#2196f3';
					ctx.strokeRect(r.x, r.y, r.w, r.h);
					ctx.restore();
				},
			});
		}, 0);
		return Selection;
	}

	box(a, b, e) {
		var at = config.TOOL.attributes;
		var dx = b.x - a.x, dy = b.y - a.y;
		if (at.slice_style == 'Fixed Size') {
			return { x: b.x, y: b.y, w: Math.max(1, at.slice_w || 64), h: Math.max(1, at.slice_h || 64) };
		}
		if (at.slice_style == 'Fixed Aspect Ratio' || e.shiftKey) {
			var ratio = at.slice_style == 'Fixed Aspect Ratio' ? Math.max(0.001, at.slice_w || 1) / Math.max(0.001, at.slice_h || 1) : 1;
			if (Math.abs(dx) / ratio >= Math.abs(dy)) dy = Math.sign(dy || 1) * Math.abs(dx) / ratio;
			else dx = Math.sign(dx || 1) * Math.abs(dy) * ratio;
		}
		var x = Math.min(a.x, a.x + dx), y = Math.min(a.y, a.y + dy);
		x = Math.max(0, x);
		y = Math.max(0, y);
		return { x: Math.round(x), y: Math.round(y), w: Math.round(Math.min(config.WIDTH - x, Math.abs(dx))), h: Math.round(Math.min(config.HEIGHT - y, Math.abs(dy))) };
	}

	mousedown(e) {
		var p = this.world(e);
		var S = this.slices();
		if (this.mode() == 'slice') {
			if (S.locked) {
				app.GUI.Ps_workspace.status_message('Slices are locked (View > Lock Slices).');
				return;
			}
			this.drag = { kind: 'new', start: p };
			return;
		}
		//Slice Select: handles of the selected user slice, then any slice
		var sel = S.selected();
		if (sel && sel.type == 'user' && !S.locked) {
			var r = S.rect(sel), t = 6 / config.ZOOM;
			for (var hx of [0, 0.5, 1]) for (var hy of [0, 0.5, 1]) {
				if (hx == 0.5 && hy == 0.5) continue;
				if (Math.abs(p.x - (r.x + r.w * hx)) <= t && Math.abs(p.y - (r.y + r.h * hy)) <= t) {
					this.drag = { kind: 'resize', hx: hx, hy: hy, start: p, orig: Object.assign({}, r), id: sel.id };
					return;
				}
			}
		}
		var hit = S.hit(p);
		config.ps_slice_selected = hit && hit.slice ? hit.slice.id : null;
		this.entry = hit;
		S.refresh();
		app.GUI.Ps_workspace.Options_bar.render();
		if (hit && hit.slice && hit.slice.type == 'user' && !S.locked) {
			this.drag = { kind: 'move', start: p, orig: Object.assign({}, hit.rect), id: hit.slice.id };
		}
	}

	mousemove(e) {
		var p = this.world(e), d = this.drag;
		d.moved = true;
		if (d.kind == 'new') {
			this.draft = this.box(d.start, p, e);
		}
		else {
			var dx = Math.round(p.x - d.start.x), dy = Math.round(p.y - d.start.y), o = d.orig, r;
			if (d.kind == 'move') r = { x: o.x + dx, y: o.y + dy, w: o.w, h: o.h };
			else {
				var x0 = o.x + (d.hx == 0 ? dx : 0), x1 = o.x + o.w + (d.hx == 1 ? dx : 0);
				var y0 = o.y + (d.hy == 0 ? dy : 0), y1 = o.y + o.h + (d.hy == 1 ? dy : 0);
				r = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.max(1, Math.abs(x1 - x0)), h: Math.max(1, Math.abs(y1 - y0)) };
			}
			d.rect = r;
			var s = this.slices().list().find(x => x.id == d.id);
			if (s) Object.assign(s, r);
		}
		this.slices().refresh();
	}

	mouseup(e) {
		var d = this.drag, S = this.slices();
		this.drag = null;
		if (d.kind == 'new') {
			var r = d.moved ? this.box(d.start, this.world(e), e) : null;
			if (!r && config.TOOL.attributes.slice_style == 'Fixed Size') r = this.box(d.start, d.start, e);
			this.draft = null;
			if (r && r.w > 0 && r.h > 0) S.add(r, 'Slice Tool');
			else S.refresh();
			return;
		}
		if (!d.moved || !d.rect) return;
		//put the live edit back, then record it
		var list = JSON.parse(JSON.stringify(S.list()));
		var s = S.list().find(x => x.id == d.id);
		if (s) Object.assign(s, { x: d.orig.x, y: d.orig.y, w: d.orig.w, h: d.orig.h });
		var t = list.find(x => x.id == d.id);
		Object.assign(t, d.rect);
		S.commit(list, d.id, d.kind == 'move' ? 'Move Slice' : 'Resize Slice');
	}

	promote() {
		var S = this.slices();
		var sel = S.selected();
		var entry = sel ? S.numbered().find(e => e.slice && e.slice.id == sel.id) : this.entry;
		if (entry && (entry.type != 'user')) S.promote(entry);
	}

	on_activate() {
		document.getElementById('main_wrapper').style.cursor = 'crosshair';
	}
}

export default Ps_slice_class;
