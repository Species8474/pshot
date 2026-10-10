/*
 * pshot - CS6 Note Tool (I) and Notes panel: notes are document-level
 * annotations (config.ps_notes = [{ x, y, author, color, text }]) shown as
 * icons on the canvas; the Notes panel edits the selected note. Adding, moving
 * and deleting notes are History steps; they are saved in PSD as annotations.
 */

import app from './../app.js';
import config from './../config.js';
import zoomView from './../libs/zoomView.js';

const S = 'fill="none" stroke="currentColor" stroke-width="1.2"';

class Ps_notes_class {

	constructor() {
		this.selected = -1;
	}

	list() {
		return config.ps_notes || [];
	}

	install() {
		var Selection = app.GUI.Ps_workspace.Selection;
		Selection.overlays = Selection.overlays || [];
		Selection.overlays.push({
			active: () => this.list().length && app.GUI.Ps_workspace.show_notes !== false,
			draw: (ctx) => this.draw(ctx),
		});
	}

	async commit(list, description, selected) {
		await app.State.do_action(new app.Actions.Bundle_action('notes', description, [
			new app.Actions.Update_config_action({ ps_notes: list }),
		]));
		if (selected !== undefined) this.selected = selected;
		this.refresh();
	}

	refresh() {
		var ws = app.GUI.Ps_workspace;
		ws.Selection.draw_overlay();
		if (ws.open_popout == 'notes') this.render();
	}

	attrs() {
		return config.TOOL.attributes || {};
	}

	hit(p) {
		var t = 10 / zoomView.getScale();
		var list = this.list();
		for (var i = list.length - 1; i >= 0; i--) {
			var n = list[i];
			if (p.x >= n.x - 1 && p.x <= n.x + t * 1.6 && p.y >= n.y - 1 && p.y <= n.y + t * 1.8) return i;
		}
		return -1;
	}

	/**
	 * Note tool mousedown: select (and drag) a note, or add one
	 */
	mousedown(p) {
		var i = this.hit(p);
		if (i >= 0) {
			this.selected = i;
			this.drag = { index: i, dx: p.x - this.list()[i].x, dy: p.y - this.list()[i].y, moved: false, start: { x: this.list()[i].x, y: this.list()[i].y } };
			this.refresh();
			setTimeout(() => this.open_panel(), 60);
			return;
		}
		var a = this.attrs();
		var list = this.list().concat([{ x: p.x, y: p.y, author: a.note_author || '', color: a.note_color || '#ffde4a', text: '' }]);
		this.commit(list, 'New Note', list.length - 1).then(() => {
			//after the click: a click on the canvas closes popout panels
			setTimeout(() => {
				this.open_panel();
				var ta = document.querySelector('#ps_notes textarea');
				if (ta) ta.focus();
			}, 60);
		});
	}

	mousemove(p) {
		var d = this.drag;
		if (!d) return;
		var n = this.list()[d.index];
		if (!n) return;
		//moving is previewed in place and committed on release
		n.x = p.x - d.dx;
		n.y = p.y - d.dy;
		d.moved = true;
		app.GUI.Ps_workspace.Selection.draw_overlay();
	}

	mouseup() {
		var d = this.drag;
		this.drag = null;
		if (!d || !d.moved) return;
		var list = this.list().map(n => Object.assign({}, n));
		var n = this.list()[d.index];
		var end = { x: n.x, y: n.y };
		n.x = d.start.x;
		n.y = d.start.y;
		list[d.index].x = end.x;
		list[d.index].y = end.y;
		this.commit(list, 'Move Note', d.index);
	}

	remove(index) {
		var list = this.list().slice();
		if (index < 0 || index >= list.length) return;
		list.splice(index, 1);
		this.commit(list, 'Delete Note', Math.min(index, list.length - 1));
	}

	clear_all() {
		if (!this.list().length) return;
		this.commit([], 'Delete All Notes', -1);
	}

	open_panel() {
		var ws = app.GUI.Ps_workspace;
		if (ws.open_popout != 'notes') ws.toggle_panel('notes');
		else this.render();
	}

	draw(ctx) {
		var s = zoomView.getScale();
		var list = this.list();
		ctx.save();
		ctx.lineWidth = 1 / s;
		list.forEach((n, i) => {
			var w = 16 / s, h = 18 / s, f = 5 / s;
			ctx.beginPath();
			ctx.moveTo(n.x, n.y);
			ctx.lineTo(n.x + w - f, n.y);
			ctx.lineTo(n.x + w, n.y + f);
			ctx.lineTo(n.x + w, n.y + h);
			ctx.lineTo(n.x, n.y + h);
			ctx.closePath();
			ctx.fillStyle = n.color || '#ffde4a';
			ctx.fill();
			ctx.strokeStyle = '#000';
			ctx.stroke();
			ctx.beginPath();
			for (var k = 0; k < 3; k++) {
				ctx.moveTo(n.x + 3 / s, n.y + (7 + k * 3.5) / s);
				ctx.lineTo(n.x + w - 3 / s, n.y + (7 + k * 3.5) / s);
			}
			ctx.stroke();
			if (i == this.selected) {
				ctx.strokeStyle = '#3f689a';
				ctx.lineWidth = 2 / s;
				ctx.strokeRect(n.x - 2 / s, n.y - 2 / s, w + 4 / s, h + 4 / s);
				ctx.lineWidth = 1 / s;
			}
		});
		ctx.restore();
	}

	render() {
		var el = document.getElementById('ps_notes');
		if (!el) return;
		var esc = app.GUI.Ps_workspace.Helper.escapeHtml;
		var list = this.list();
		if (this.selected >= list.length) this.selected = list.length - 1;
		//keep typing focus across re-renders (History changes re-render the panel)
		var old = el.querySelector('textarea');
		var focus = old && document.activeElement === old ? { start: old.selectionStart, end: old.selectionEnd } : null;
		var n = list[this.selected];
		el.innerHTML = '<div class="ps_notes_author">' + (n ? esc(n.author || '') : '') + '</div>'
			+ '<textarea class="ps_notes_text"' + (n ? '' : ' disabled') + '>' + (n ? esc(n.text || '') : '') + '</textarea>'
			+ '<div class="ps_panel_footer">'
			+ '<button type="button" data-n="prev" title="Select previous note"' + (list.length > 1 ? '' : ' disabled') + '><svg viewBox="0 0 18 18" width="16" height="16"><path d="M11 4L6 9l5 5" ' + S + '/></svg></button>'
			+ '<button type="button" data-n="next" title="Select next note"' + (list.length > 1 ? '' : ' disabled') + '><svg viewBox="0 0 18 18" width="16" height="16"><path d="M7 4l5 5-5 5" ' + S + '/></svg></button>'
			+ '<span class="ps_notes_count">' + (n ? (this.selected + 1) + ' of ' + list.length : '0 of 0') + '</span>'
			+ '<button type="button" data-n="delete" title="Delete note"' + (n ? '' : ' disabled') + '><svg viewBox="0 0 18 18" width="16" height="16"><path d="M5 5h8l-.8 10H5.8zM4 5h10M7.5 3h3" ' + S + '/></svg></button></div>';
		var ta = el.querySelector('textarea');
		if (focus && n) {
			ta.focus();
			ta.setSelectionRange(focus.start, focus.end);
		}
		ta.addEventListener('input', () => { if (list[this.selected]) list[this.selected].text = ta.value; });
		ta.addEventListener('keydown', (e) => e.stopPropagation());
		el.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => {
			var k = b.dataset.n;
			if (k == 'delete') return this.remove(this.selected);
			if (!list.length) return;
			this.selected = (this.selected + (k == 'next' ? 1 : -1) + list.length) % list.length;
			this.refresh();
		}));
	}

	// ---------- PSD ----------

	/**
	 * Export Notes: the notes as a text file (author, position, text)
	 */
	export_text() {
		var lines = this.list().map((n, i) => 'Note ' + (i + 1) + (n.author ? ' (' + n.author + ')' : '') + ' at ' + Math.round(n.x) + ', ' + Math.round(n.y) + ':\n' + (n.text || '') + '\n');
		var a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
		a.download = app.GUI.Ps_workspace.document_name().replace(/\.[^.]+$/, '') + ' Notes.txt';
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 5000);
	}

	to_psd() {
		var list = this.list();
		if (!list.length) return undefined;
		var hex = (c) => ({ r: parseInt(c.substr(1, 2), 16), g: parseInt(c.substr(3, 2), 16), b: parseInt(c.substr(5, 2), 16) });
		return list.map((n) => ({
			type: 'text', open: false,
			iconLocation: { left: n.x, top: n.y, right: n.x + 16, bottom: n.y + 18 },
			popupLocation: { left: n.x + 20, top: n.y, right: n.x + 220, bottom: n.y + 120 },
			color: hex(n.color || '#ffde4a'), author: n.author || '', name: '', date: '', data: n.text || '',
		}));
	}

	from_psd(list) {
		if (!list || !list.length) return [];
		var h = (v) => Math.max(0, Math.min(255, Math.round(v || 0))).toString(16).padStart(2, '0');
		return list.filter(a => a.type == 'text').map((a) => ({
			x: a.iconLocation ? a.iconLocation.left : 0, y: a.iconLocation ? a.iconLocation.top : 0,
			author: a.author || '', color: a.color && a.color.r !== undefined ? '#' + h(a.color.r) + h(a.color.g) + h(a.color.b) : '#ffde4a',
			text: typeof a.data == 'string' ? a.data : '',
		}));
	}
}

export default Ps_notes_class;
