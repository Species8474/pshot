/*
 * pshot - CS6 slices: user slices (Slice Tool), layer-based slices (Layer >
 * New Layer Based Slice: follow the layer's pixels) and auto slices that cover
 * the rest. config.ps_slices = [{ id, type: 'user' | 'layer', x, y, w, h,
 * layer_id, name, url, target, alt }]; the slice tools edit them through
 * History. Numbers go left to right, top to bottom, as in CS6.
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';

function clone(v) {
	return JSON.parse(JSON.stringify(v));
}

class Ps_slices_class {

	constructor() {
		this.show = true;
		this.locked = false;
		this.hide_auto = false;
	}

	list() {
		return config.ps_slices || [];
	}

	has() {
		return this.list().length > 0;
	}

	/**
	 * a slice's rectangle (layer slices follow the layer's pixel bounds)
	 */
	rect(s) {
		if (s.type == 'layer') {
			var l = app.Layers.get_layer(s.layer_id);
			if (!l) return { x: 0, y: 0, w: 0, h: 0 };
			var b = app.GUI.Ps_workspace.Multi.bounds(l);
			return { x: Math.max(0, b.x), y: Math.max(0, b.y), w: Math.min(config.WIDTH, b.x + b.width) - Math.max(0, b.x), h: Math.min(config.HEIGHT, b.y + b.height) - Math.max(0, b.y) };
		}
		return { x: s.x, y: s.y, w: s.w, h: s.h };
	}

	/**
	 * the auto slices: the area outside user / layer slices cut into rectangles
	 * along the slices' edges
	 */
	auto() {
		var W = config.WIDTH, H = config.HEIGHT;
		var rects = this.list().map(s => this.rect(s)).filter(r => r.w > 0 && r.h > 0);
		if (!rects.length) return [];
		var xs = new Set([0, W]), ys = new Set([0, H]);
		rects.forEach(r => { xs.add(Math.max(0, Math.min(W, r.x))); xs.add(Math.max(0, Math.min(W, r.x + r.w))); ys.add(Math.max(0, Math.min(H, r.y))); ys.add(Math.max(0, Math.min(H, r.y + r.h))); });
		xs = Array.from(xs).sort((a, b) => a - b);
		ys = Array.from(ys).sort((a, b) => a - b);
		var covered = (cx, cy) => rects.some(r => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h);
		//runs of free cells per row, then rows with the same runs merged downwards
		var out = [], open = [];
		for (var j = 0; j < ys.length - 1; j++) {
			var y0 = ys[j], y1 = ys[j + 1], runs = [], start = null;
			for (var i = 0; i < xs.length - 1; i++) {
				var free = !covered((xs[i] + xs[i + 1]) / 2, (y0 + y1) / 2);
				if (free && start == null) start = xs[i];
				if (!free && start != null) { runs.push([start, xs[i]]); start = null; }
			}
			if (start != null) runs.push([start, W]);
			var next = [];
			for (var run of runs) {
				var prev = open.find(o => o.x == run[0] && o.x + o.w == run[1] && o.y + o.h == y0);
				if (prev) { prev.h += y1 - y0; next.push(prev); }
				else { var r = { x: run[0], y: y0, w: run[1] - run[0], h: y1 - y0, type: 'auto' }; out.push(r); next.push(r); }
			}
			open = next;
		}
		return out;
	}

	/**
	 * every slice in CS6 numbering order: [{ slice (or null), rect, type, number }]
	 */
	numbered() {
		var all = this.list().map(s => ({ slice: s, rect: this.rect(s), type: s.type })).concat(this.auto().map(r => ({ slice: null, rect: r, type: 'auto' })));
		all.sort((a, b) => (a.rect.y - b.rect.y) || (a.rect.x - b.rect.x));
		all.forEach((e, i) => { e.number = i + 1; });
		return all;
	}

	hit(p) {
		var all = this.numbered();
		//user and layer slices are above the auto ones
		var found = null;
		for (var e of all) {
			var r = e.rect;
			if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
				if (!found || (found.type == 'auto' && e.type != 'auto')) found = e;
			}
		}
		return found;
	}

	async commit(slices, selected, description) {
		await app.State.do_action(new app.Actions.Bundle_action('slices', description, [
			new app.Actions.Update_config_action({ ps_slices: slices, ps_slice_selected: selected == null ? null : selected }),
		]));
		this.refresh();
	}

	refresh() {
		config.need_render = true;
		app.GUI.Ps_workspace.Selection.draw_overlay();
	}

	next_id() {
		return this.list().reduce((m, s) => Math.max(m, s.id || 0), 0) + 1;
	}

	add(rect, description) {
		var s = { id: this.next_id(), type: 'user', x: Math.round(rect.x), y: Math.round(rect.y), w: Math.max(1, Math.round(rect.w)), h: Math.max(1, Math.round(rect.h)), name: '', url: '', target: '', alt: '' };
		return this.commit(this.list().concat([s]), s.id, description || 'Slice Tool');
	}

	selected() {
		var id = config.ps_slice_selected;
		return id == null ? null : this.list().find(s => s.id == id) || null;
	}

	/**
	 * Layer > New Layer Based Slice
	 */
	layer_based() {
		var l = config.layer;
		if (!l || l.type == null) return;
		var s = { id: this.next_id(), type: 'layer', layer_id: l.id, name: '', url: '', target: '', alt: '' };
		return this.commit(this.list().concat([s]), s.id, 'New Layer Based Slice');
	}

	/**
	 * Promote: a layer-based or auto slice becomes a user slice
	 */
	promote(entry) {
		var list = clone(this.list());
		var r = entry.rect;
		if (entry.slice) {
			var s = list.find(x => x.id == entry.slice.id);
			Object.assign(s, { type: 'user', x: r.x, y: r.y, w: r.w, h: r.h });
			delete s.layer_id;
			return this.commit(list, s.id, 'Promote to User Slice');
		}
		var n = { id: this.next_id(), type: 'user', x: r.x, y: r.y, w: r.w, h: r.h, name: '', url: '', target: '', alt: '' };
		return this.commit(list.concat([n]), n.id, 'Promote to User Slice');
	}

	remove(id) {
		return this.commit(this.list().filter(s => s.id != id), null, 'Delete Slice');
	}

	clear() {
		if (!this.has()) return;
		return this.commit([], null, 'Clear Slices');
	}

	/**
	 * the selected slice brought forward / backward in the stacking order
	 */
	arrange(how) {
		var s = this.selected();
		if (!s) return;
		var list = this.list().filter(x => x.id != s.id), i = this.list().indexOf(s);
		var at = how == 'front' ? list.length : (how == 'back' ? 0 : Math.max(0, Math.min(list.length, i + (how == 'forward' ? 1 : -1))));
		list.splice(at, 0, s);
		return this.commit(clone(list), s.id, 'Arrange Slices');
	}

	/**
	 * Slices From Guides: a user slice for every cell between the guides
	 */
	from_guides() {
		var gx = [0, config.WIDTH], gy = [0, config.HEIGHT];
		for (var g of config.guides || []) {
			if (g.y === null || g.y === undefined) gx.push(Math.round(g.x));
			else gy.push(Math.round(g.y));
		}
		gx = Array.from(new Set(gx)).filter(v => v >= 0 && v <= config.WIDTH).sort((a, b) => a - b);
		gy = Array.from(new Set(gy)).filter(v => v >= 0 && v <= config.HEIGHT).sort((a, b) => a - b);
		if (gx.length < 3 && gy.length < 3) {
			app.GUI.Ps_workspace.status_message('Slices From Guides needs guides.');
			return;
		}
		var list = [], id = 1;
		for (var j = 0; j < gy.length - 1; j++) for (var i = 0; i < gx.length - 1; i++) {
			list.push({ id: id++, type: 'user', x: gx[i], y: gy[j], w: gx[i + 1] - gx[i], h: gy[j + 1] - gy[j], name: '', url: '', target: '', alt: '' });
		}
		return this.commit(list, null, 'Slices From Guides');
	}

	/**
	 * Divide Slice: the selected user slice split into equal parts
	 */
	divide() {
		var s = this.selected();
		if (!s || s.type != 'user') {
			app.GUI.Ps_workspace.status_message('Select a user slice to divide.');
			return;
		}
		var POP = new Dialog_class();
		POP.show({
			title: 'Divide Slice',
			params: [
				{ name: 'h', title: 'Divide Horizontally Into (slices down):', value: 2 },
				{ name: 'v', title: 'Divide Vertically Into (slices across):', value: 1 },
			],
			on_finish: (p) => {
				var rows = Math.max(1, parseInt(p.h) || 1), cols = Math.max(1, parseInt(p.v) || 1);
				var list = this.list().filter(x => x.id != s.id), id = this.next_id();
				for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
					var x0 = s.x + Math.round(s.w * c / cols), x1 = s.x + Math.round(s.w * (c + 1) / cols);
					var y0 = s.y + Math.round(s.h * r / rows), y1 = s.y + Math.round(s.h * (r + 1) / rows);
					list.push({ id: id++, type: 'user', x: x0, y: y0, w: x1 - x0, h: y1 - y0, name: '', url: '', target: '', alt: '' });
				}
				this.commit(clone(list), null, 'Divide Slice');
			},
		});
	}

	/**
	 * Slice Options (double-click with the Slice Select Tool)
	 */
	options(entry) {
		if (!entry) return;
		var number = entry.number;
		var doc = (app.GUI.Ps_workspace.Documents.current().name || 'Untitled').replace(/\.[^.]+$/, '');
		var s = entry.slice;
		var name = (s && s.name) || doc + '_' + String(number).padStart(2, '0');
		var r = entry.rect;
		var POP = new Dialog_class();
		POP.show({
			title: 'Slice Options',
			params: [
				{ name: 'type', title: 'Slice Type:', values: ['Image', 'No Image'], value: (s && s.no_image) ? 'No Image' : 'Image', type: 'select' },
				{ name: 'name', title: 'Name:', value: name },
				{ name: 'url', title: 'URL:', value: (s && s.url) || '' },
				{ name: 'target', title: 'Target:', value: (s && s.target) || '' },
				{ name: 'alt', title: 'Alt Tag:', value: (s && s.alt) || '' },
				{ name: 'x', title: 'X:', value: r.x },
				{ name: 'y', title: 'Y:', value: r.y },
				{ name: 'w', title: 'W:', value: r.w },
				{ name: 'h', title: 'H:', value: r.h },
			],
			on_finish: (p) => {
				var list = clone(this.list());
				var t = s ? list.find(x => x.id == s.id) : null;
				if (!t) {
					//an auto slice becomes a user slice when its options are set
					t = { id: this.next_id(), type: 'user' };
					list.push(t);
				}
				Object.assign(t, { name: p.name, url: p.url, target: p.target, alt: p.alt, no_image: p.type == 'No Image' });
				if (t.type == 'user') Object.assign(t, { x: parseFloat(p.x) || 0, y: parseFloat(p.y) || 0, w: Math.max(1, parseFloat(p.w) || 1), h: Math.max(1, parseFloat(p.h) || 1) });
				this.commit(list, t.id, 'Slice Options');
			},
		});
	}

	// ---------- overlay ----------

	install() {
		var Selection = app.GUI.Ps_workspace.Selection;
		Selection.overlays = Selection.overlays || [];
		Selection.overlays.push({
			active: () => this.has() && (this.show || ['ps_slice'].includes(config.TOOL.name)) && app.GUI.Ps_workspace.extras !== false,
			draw: (ctx, scale) => this.draw(ctx, scale),
		});
	}

	draw(ctx, scale) {
		var sel = config.ps_slice_selected;
		var tool = config.TOOL.name == 'ps_slice';
		ctx.save();
		ctx.lineWidth = 1 / scale;
		ctx.font = (10 / scale) + 'px sans-serif';
		ctx.textBaseline = 'top';
		for (var e of this.numbered()) {
			if (e.type == 'auto' && this.hide_auto) continue;
			var r = e.rect, user = e.type != 'auto', chosen = e.slice && e.slice.id == sel;
			ctx.setLineDash(user ? [] : [3 / scale, 3 / scale]);
			ctx.strokeStyle = chosen ? '#d6a000' : (user ? '#2196f3' : '#9a9a9a');
			ctx.strokeRect(r.x + 0.5 / scale, r.y + 0.5 / scale, r.w - 1 / scale, r.h - 1 / scale);
			ctx.setLineDash([]);
			//the number badge, with a mark for layer-based slices
			var label = String(e.number).padStart(2, '0') + (e.type == 'layer' ? ' ▣' : '');
			var bw = ctx.measureText(label).width + 6 / scale, bh = 13 / scale;
			ctx.fillStyle = user ? (chosen ? '#d6a000' : '#2196f3') : '#9a9a9a';
			ctx.fillRect(r.x + 1 / scale, r.y + 1 / scale, bw, bh);
			ctx.fillStyle = '#ffffff';
			ctx.fillText(label, r.x + 4 / scale, r.y + 2.5 / scale);
			if (chosen && tool && e.type == 'user') {
				//resize handles
				ctx.fillStyle = '#d6a000';
				var hs = 6 / scale;
				for (var hx of [0, 0.5, 1]) for (var hy of [0, 0.5, 1]) {
					if (hx == 0.5 && hy == 0.5) continue;
					ctx.fillRect(r.x + r.w * hx - hs / 2, r.y + r.h * hy - hs / 2, hs, hs);
				}
			}
		}
		ctx.restore();
	}

	// ---------- export (Save for Web) ----------

	/**
	 * every slice that has an image: { name, rect, url, alt } (doc file name prefix)
	 */
	export_list() {
		var doc = (app.GUI.Ps_workspace.Documents.current().name || 'Untitled').replace(/\.[^.]+$/, '');
		return this.numbered().filter(e => !(e.slice && e.slice.no_image) && e.rect.w > 0 && e.rect.h > 0).map(e => ({
			name: (e.slice && e.slice.name) || doc + '_' + String(e.number).padStart(2, '0'),
			rect: e.rect, url: e.slice && e.slice.url, alt: e.slice && e.slice.alt, target: e.slice && e.slice.target,
		}));
	}
}

export default Ps_slices_class;
