/*
 * pshot - CS6 floating document windows (Window > Arrange, Move to New Window,
 * dragging a tab out of the tab bar). The active document's live view moves
 * into its window; other floating documents show a picture of their view
 * until they are clicked. Dragging a window's title bar onto the tab bar
 * docks it again.
 */

import app from './../app.js';
import config from './../config.js';
import { show_popup_menu } from './popup-menu.js';

const TITLE_H = 20;
const MIN_W = 160, MIN_H = 100;

class Ps_float_windows_class {

	constructor() {
		this.z = 1;
	}

	docs() {
		return app.GUI.Ps_workspace.Documents;
	}

	layer() {
		var el = document.getElementById('ps_float_layer');
		if (!el) {
			el = document.createElement('div');
			el.id = 'ps_float_layer';
			el.className = 'ps_float_layer';
			document.getElementById('ps_docarea').appendChild(el);
		}
		return el;
	}

	/**
	 * the area windows live in: below the tab bar, above the status bar
	 */
	bounds() {
		var area = document.getElementById('ps_docarea').getBoundingClientRect();
		var tabs = document.getElementById('ps_doctabs').getBoundingClientRect();
		var status = document.getElementById('ps_statusbar').getBoundingClientRect();
		var top = tabs.height ? tabs.bottom - area.top : 0;
		var bottom = status.height ? status.top - area.top : area.height;
		return { x: 0, y: top, w: area.width, h: Math.max(MIN_H, bottom - top) };
	}

	any() {
		return this.docs().docs.some(d => d.float);
	}

	/**
	 * a background document's picture: its merged image at its zoom, centered
	 */
	draw_inactive(doc, canvas) {
		var body = canvas.parentNode;
		var w = Math.max(1, body.clientWidth), h = Math.max(1, body.clientHeight);
		if (canvas.width != w) canvas.width = w;
		if (canvas.height != h) canvas.height = h;
		var ctx = canvas.getContext('2d');
		ctx.fillStyle = getComputedStyle(document.getElementById('ps_docarea')).backgroundColor || '#282828';
		ctx.fillRect(0, 0, w, h);
		var flat = doc.flat, st = doc.state;
		if (!flat) return;
		var z = st && st.ZOOM ? st.ZOOM : 1;
		var dw = flat.width * z, dh = flat.height * z;
		var x = Math.round((w - dw) / 2), y = Math.round((h - dh) / 2);
		ctx.imageSmoothingEnabled = z < 1;
		ctx.fillStyle = '#000';
		ctx.fillRect(x - 1, y - 1, dw + 2, dh + 2);
		ctx.fillStyle = '#fff';
		ctx.fillRect(x, y, dw, dh);
		ctx.drawImage(flat, x, y, dw, dh);
	}

	default_rect(n) {
		var b = this.bounds();
		var w = Math.max(MIN_W, Math.round(b.w * 0.6)), h = Math.max(MIN_H, Math.round(b.h * 0.6));
		var step = (n % 8) * 24;
		return { x: 20 + step, y: b.y + 20 + step, w: w, h: h };
	}

	set_float(doc, rect) {
		doc.float = rect;
		if (rect) doc.float_z = ++this.z;
	}

	/**
	 * (re)builds the windows; called when tabs or titles change
	 */
	render(labels) {
		var docs = this.docs().docs, active = this.docs().active;
		this.labels = labels || this.labels || [];
		var layer = this.layer();
		var middle = document.getElementById('middle_area');
		var area = document.getElementById('ps_docarea');
		var status = document.getElementById('ps_statusbar');
		var moved = false;
		//remove windows of documents that are gone or docked
		layer.querySelectorAll('.ps_float_win').forEach((w) => {
			var doc = docs.find(d => d.float_id == w.dataset.fid);
			if (!doc || !doc.float) {
				if (w.contains(middle)) { area.insertBefore(middle, status); moved = true; }
				w.remove();
			}
		});
		docs.forEach((doc, i) => {
			if (!doc.float) return;
			if (!doc.float_id) doc.float_id = 'f' + (++this.z);
			var win = layer.querySelector('.ps_float_win[data-fid="' + doc.float_id + '"]');
			if (!win) win = this.build(doc);
			var r = doc.float;
			Object.assign(win.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', zIndex: i == active ? 100000 : (doc.float_z || 1) });
			win.classList.toggle('active', i == active);
			win.querySelector('.ps_float_label').textContent = this.labels[i] || doc.name;
			var body = win.querySelector('.ps_float_body');
			if (i == active) {
				if (!body.contains(middle)) {
					body.innerHTML = '';
					body.appendChild(middle);
					moved = true;
				}
			}
			else {
				if (body.contains(middle)) {
					area.insertBefore(middle, status);
					moved = true;
				}
				var pic = body.querySelector('canvas.ps_float_pic');
				if (!pic) {
					body.innerHTML = '<canvas class="ps_float_pic"></canvas>';
					pic = body.querySelector('canvas.ps_float_pic');
				}
				this.draw_inactive(doc, pic);
			}
		});
		this.render_views();
		//the active document is tabbed: its view goes back under the tab bar
		var cur = docs[active];
		if (cur && !cur.float && middle.parentNode !== area) {
			area.insertBefore(middle, status);
			moved = true;
		}
		if (moved) app.GUI.Ps_workspace.relayout();
	}

	build(doc) {
		var win = document.createElement('div');
		win.className = 'ps_float_win';
		win.dataset.fid = doc.float_id;
		win.innerHTML = '<div class="ps_float_title"><span class="ps_float_label"></span><button type="button" class="ps_float_close" title="Close">&times;</button></div>'
			+ '<div class="ps_float_body"></div><div class="ps_float_grip" title="Resize"></div>';
		var index = () => this.docs().docs.findIndex(d => d.float_id == win.dataset.fid);
		var activate = () => {
			var i = index();
			if (i >= 0 && i != this.docs().active) {
				this.docs().docs[i].float_z = ++this.z;
				this.docs().switch_to(i);
			}
		};
		win.addEventListener('mousedown', (e) => {
			if (e.target.closest('.ps_float_close')) return;
			activate();
		}, true);
		win.querySelector('.ps_float_close').addEventListener('click', () => {
			var i = index();
			if (i >= 0) this.docs().close(i);
		});
		var title = win.querySelector('.ps_float_title');
		title.addEventListener('mousedown', (e) => {
			if (e.button != 0 || e.target.closest('.ps_float_close')) return;
			e.preventDefault();
			this.drag(e, win, 'move');
		});
		title.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			var i = index();
			show_popup_menu(title, [
				{ name: 'Move to New Window' },
				{ divider: true },
				{ name: 'Close', action: () => this.docs().close(i) },
				{ name: 'Close All', action: () => app.GUI.modules['ps/commands'].close_all() },
				{ divider: true },
				{ name: 'Consolidate All to Tabs', action: () => this.consolidate() },
			], { point: { x: e.clientX, y: e.clientY } });
		});
		win.querySelector('.ps_float_grip').addEventListener('mousedown', (e) => {
			if (e.button != 0) return;
			e.preventDefault();
			e.stopPropagation();
			this.drag(e, win, 'resize');
		});
		this.layer().appendChild(win);
		return win;
	}

	drag(e, win, kind) {
		var doc = this.docs().docs.find(d => d.float_id == win.dataset.fid);
		if (!doc) return;
		var start = { x: e.clientX, y: e.clientY }, orig = Object.assign({}, doc.float);
		var tabs = document.getElementById('ps_doctabs');
		var move = (ev) => {
			var dx = ev.clientX - start.x, dy = ev.clientY - start.y;
			if (kind == 'move') {
				doc.float.x = orig.x + dx;
				doc.float.y = Math.max(0, orig.y + dy);
				tabs.classList.toggle('ps_dock_target', this.over_tabs(ev));
			}
			else {
				doc.float.w = Math.max(MIN_W, orig.w + dx);
				doc.float.h = Math.max(MIN_H, orig.h + dy);
			}
			Object.assign(win.style, { left: doc.float.x + 'px', top: doc.float.y + 'px', width: doc.float.w + 'px', height: doc.float.h + 'px' });
		};
		var up = (ev) => {
			document.removeEventListener('mousemove', move, true);
			document.removeEventListener('mouseup', up, true);
			tabs.classList.remove('ps_dock_target');
			if (kind == 'move' && this.over_tabs(ev)) {
				//dropped on the tab bar: dock the document again
				doc.float = null;
				this.refresh();
				return;
			}
			if (win.classList.contains('active')) {
				//the view moved: mouse positions are measured from the canvas
				if (kind == 'resize') app.GUI.Ps_workspace.relayout();
				else app.GUI.check_canvas_offset();
			}
			else if (kind == 'resize') {
				var pic = win.querySelector('canvas.ps_float_pic');
				if (pic) this.draw_inactive(doc, pic);
			}
		};
		document.addEventListener('mousemove', move, true);
		document.addEventListener('mouseup', up, true);
	}

	// ---------- Window > Arrange > New Window for <document> ----------

	/**
	 * a second window on the active document: its own zoom and scroll, redrawn as the document changes
	 */
	new_view() {
		var doc = this.docs().current();
		if (!doc) return;
		doc.views = doc.views || [];
		var r = this.default_rect(doc.views.length + 1);
		doc.views.push({ vid: 'v' + (++this.z), rect: r, zoom: config.ZOOM, ox: 0, oy: 0, z: ++this.z });
		this.refresh();
	}

	view_source(doc) {
		if (doc !== this.docs().current()) return doc.flat;
		var sig = app.State.action_history_index + ':' + app.State.action_history.length + ':' + config.layers.length;
		if (!this.live || this.live_sig !== sig || this.live_doc !== doc) {
			var c = this.live && this.live.width == config.WIDTH && this.live.height == config.HEIGHT ? this.live : document.createElement('canvas');
			c.width = config.WIDTH;
			c.height = config.HEIGHT;
			var ctx = c.getContext('2d');
			ctx.clearRect(0, 0, c.width, c.height);
			app.Layers.convert_layers_to_canvas(ctx, null, false);
			this.live = c;
			this.live_sig = sig;
			this.live_doc = doc;
		}
		return this.live;
	}

	draw_view(doc, view, canvas) {
		var body = canvas.parentNode, w = Math.max(1, body.clientWidth), h = Math.max(1, body.clientHeight);
		if (canvas.width != w) canvas.width = w;
		if (canvas.height != h) canvas.height = h;
		var ctx = canvas.getContext('2d');
		ctx.fillStyle = getComputedStyle(document.getElementById('ps_docarea')).backgroundColor || '#282828';
		ctx.fillRect(0, 0, w, h);
		var src = this.view_source(doc);
		if (!src) return;
		var z = view.zoom, dw = src.width * z, dh = src.height * z;
		var x = Math.round((w - dw) / 2 + view.ox), y = Math.round((h - dh) / 2 + view.oy);
		ctx.imageSmoothingEnabled = z < 1;
		ctx.fillStyle = '#fff';
		ctx.fillRect(x, y, dw, dh);
		ctx.drawImage(src, x, y, dw, dh);
	}

	render_views() {
		var layer = this.layer(), docs = this.docs().docs;
		var live_ids = [];
		docs.forEach((doc, i) => {
			(doc.views || []).forEach((view) => {
				live_ids.push(view.vid);
				var win = layer.querySelector('.ps_float_win[data-vid="' + view.vid + '"]');
				if (!win) win = this.build_view(doc, view);
				var r = view.rect;
				Object.assign(win.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', zIndex: view.z });
				var label = (this.labels[i] || doc.name).replace(/ @ \d+(\.\d+)?%/, ' @ ' + Math.round(view.zoom * 100) + '%');
				win.querySelector('.ps_float_label').textContent = label;
				this.draw_view(doc, view, win.querySelector('canvas.ps_float_pic'));
			});
		});
		layer.querySelectorAll('.ps_float_win[data-vid]').forEach(w => { if (!live_ids.includes(w.dataset.vid)) w.remove(); });
	}

	/**
	 * the views of the active document follow its edits (called from the workspace tick)
	 */
	update_views() {
		var doc = this.docs().current();
		if (!doc || !(doc.views || []).length) return;
		var sig = app.State.action_history_index + ':' + app.State.action_history.length;
		if (sig === this.views_sig) return;
		this.views_sig = sig;
		this.render_views();
	}

	build_view(doc, view) {
		var win = document.createElement('div');
		win.className = 'ps_float_win ps_float_view';
		win.dataset.vid = view.vid;
		win.innerHTML = '<div class="ps_float_title"><span class="ps_float_label"></span><button type="button" class="ps_float_close" title="Close">&times;</button></div>'
			+ '<div class="ps_float_body"><canvas class="ps_float_pic"></canvas></div><div class="ps_float_grip" title="Resize"></div>';
		var find = () => {
			for (var d of this.docs().docs) for (var v of (d.views || [])) if (v.vid == view.vid) return [d, v];
			return [null, null];
		};
		win.addEventListener('mousedown', (e) => {
			if (e.target.closest('.ps_float_close')) return;
			var [d] = find();
			view.z = ++this.z;
			win.style.zIndex = view.z;
			var i = this.docs().docs.indexOf(d);
			if (i >= 0 && i != this.docs().active) this.docs().switch_to(i);
		}, true);
		win.querySelector('.ps_float_close').addEventListener('click', () => {
			var [d] = find();
			if (d) d.views = d.views.filter(v => v.vid != view.vid);
			this.render_views();
		});
		var drag = (e, kind) => {
			e.preventDefault();
			var start = { x: e.clientX, y: e.clientY }, orig = Object.assign({}, view.rect), o = { x: view.ox, y: view.oy };
			var move = (ev) => {
				var dx = ev.clientX - start.x, dy = ev.clientY - start.y;
				if (kind == 'move') { view.rect.x = orig.x + dx; view.rect.y = Math.max(0, orig.y + dy); }
				else if (kind == 'resize') { view.rect.w = Math.max(MIN_W, orig.w + dx); view.rect.h = Math.max(MIN_H, orig.h + dy); }
				else { view.ox = o.x + dx; view.oy = o.y + dy; }
				this.render_views();
			};
			var up = () => {
				document.removeEventListener('mousemove', move, true);
				document.removeEventListener('mouseup', up, true);
			};
			document.addEventListener('mousemove', move, true);
			document.addEventListener('mouseup', up, true);
		};
		win.querySelector('.ps_float_title').addEventListener('mousedown', (e) => { if (e.button == 0 && !e.target.closest('.ps_float_close')) drag(e, 'move'); });
		win.querySelector('.ps_float_grip').addEventListener('mousedown', (e) => { if (e.button == 0) { e.stopPropagation(); drag(e, 'resize'); } });
		//drag in the view to scroll it, wheel to zoom
		win.querySelector('.ps_float_body').addEventListener('mousedown', (e) => { if (e.button == 0) drag(e, 'pan'); });
		win.querySelector('.ps_float_body').addEventListener('wheel', (e) => {
			e.preventDefault();
			view.zoom = Math.max(0.05, Math.min(32, view.zoom * (e.deltaY < 0 ? 1.25 : 0.8)));
			this.render_views();
		}, { passive: false });
		this.layer().appendChild(win);
		return win;
	}

	over_tabs(e) {
		var r = document.getElementById('ps_doctabs').getBoundingClientRect();
		return r.height > 0 && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 4 && e.clientY <= r.bottom + 4;
	}

	refresh() {
		var ws = app.GUI.Ps_workspace;
		ws.last_tab_label = null;
		ws.render_document_tab();
	}

	/**
	 * a tab dragged out of the tab bar floats its document (CS6)
	 */
	tab_drag(e, index) {
		var start = { x: e.clientX, y: e.clientY };
		var move = (ev) => {
			if (Math.abs(ev.clientY - start.y) < 24) return;
			cleanup();
			var docs = this.docs();
			if (index != docs.active) docs.switch_to(index);
			var doc = docs.current();
			var area = document.getElementById('ps_docarea').getBoundingClientRect();
			var r = this.default_rect(0);
			r.x = Math.max(0, ev.clientX - area.left - 60);
			r.y = Math.max(this.bounds().y, ev.clientY - area.top - 10);
			this.set_float(doc, r);
			this.refresh();
			var win = this.layer().querySelector('.ps_float_win[data-fid="' + doc.float_id + '"]');
			if (win) this.drag(ev, win, 'move');
		};
		var cleanup = () => {
			document.removeEventListener('mousemove', move, true);
			document.removeEventListener('mouseup', cleanup, true);
		};
		document.addEventListener('mousemove', move, true);
		document.addEventListener('mouseup', cleanup, true);
	}

	// ---------- Window > Arrange ----------

	float_current() {
		var doc = this.docs().current();
		if (!doc || doc.float) return;
		this.set_float(doc, this.default_rect(this.docs().docs.filter(d => d.float).length));
		this.refresh();
	}

	float_all() {
		var n = 0;
		for (var doc of this.docs().docs) {
			if (!doc.float) this.set_float(doc, this.default_rect(n++));
		}
		this.refresh();
	}

	consolidate() {
		for (var doc of this.docs().docs) doc.float = null;
		this.refresh();
	}

	cascade() {
		var docs = this.docs().docs, b = this.bounds();
		var w = Math.max(MIN_W, Math.round(b.w * 0.6)), h = Math.max(MIN_H, Math.round(b.h * 0.6));
		docs.forEach((doc, i) => {
			var step = (i % 10) * 26;
			this.set_float(doc, { x: 10 + step, y: b.y + 10 + step, w: w, h: h });
		});
		var cur = this.docs().current();
		if (cur) cur.float_z = ++this.z;
		this.refresh();
	}

	/**
	 * tile layouts: cells as fractions of the area [x, y, w, h]
	 */
	tile(layout) {
		var docs = this.docs().docs, n = docs.length, cells;
		var grid = (cols, rows, count) => {
			var out = [];
			for (var i = 0; i < count; i++) out.push([(i % cols) / cols, Math.floor(i / cols) / rows, 1 / cols, 1 / rows]);
			return out;
		};
		if (layout == 'vertical') cells = grid(n, 1, n);
		else if (layout == 'horizontal') cells = grid(1, n, n);
		else if (layout == '2v') cells = grid(2, 1, 2);
		else if (layout == '2h') cells = grid(1, 2, 2);
		else if (layout == '3v') cells = grid(3, 1, 3);
		else if (layout == '3h') cells = grid(1, 3, 3);
		else if (layout == '3s') cells = [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]];
		else if (layout == '4') cells = grid(2, 2, 4);
		else if (layout == '6') cells = grid(3, 2, 6);
		else {
			var cols = Math.ceil(Math.sqrt(n));
			cells = grid(cols, Math.ceil(n / cols), n);
		}
		var b = this.bounds();
		//the active document first, then the others in tab order
		var order = [this.docs().current()].concat(docs.filter(d => d !== this.docs().current()));
		order.forEach((doc, i) => {
			var c = cells[i];
			if (!c) {
				doc.float = null;
				return;
			}
			this.set_float(doc, { x: Math.round(b.x + c[0] * b.w), y: Math.round(b.y + c[1] * b.h), w: Math.round(c[2] * b.w) - 2, h: Math.round(c[3] * b.h) - 2 });
		});
		this.refresh();
	}

	/**
	 * Match Zoom / Location / Rotation / All: the other documents take the active one's view
	 */
	match(what) {
		var ws = app.GUI.Ps_workspace;
		var cur = this.docs().capture();
		for (var doc of this.docs().docs) {
			var st = doc.state;
			if (!st || doc === this.docs().current()) continue;
			if (what == 'zoom' || what == 'all') {
				st.view.scale = cur.view.scale;
				st.ZOOM = cur.ZOOM;
			}
			if (what == 'location' || what == 'all') {
				st.view.x = cur.view.x;
				st.view.y = cur.view.y;
			}
			if (what == 'rotation' || what == 'all') st.view.rotation = cur.view.rotation;
		}
		ws.status_message('The other documents will use this view when they are shown.');
		this.refresh();
	}
}

export default Ps_float_windows_class;
