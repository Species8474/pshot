/*
 * pshot - CS6 Edit > Keyboard Shortcuts (Alt+Shift+Ctrl+K): view and edit the
 * shortcuts of the application menus and the tool letters. Changes are kept in
 * browser storage and applied to the menu definitions and the keymap.
 */

import app from './../app.js';
import menuDefinition from './../config-menu.js';

const KEY = 'pshot_shortcuts_v1';
const S = 'fill="none" stroke="currentColor" stroke-width="1.2"';

class Ps_shortcuts_class {

	constructor(workspace) {
		this.workspace = workspace;
		this.defaults = { menus: {}, tools: {} };
	}

	/**
	 * leaf menu items with their path ("Edit > Transform > Again")
	 */
	walk(fn) {
		var visit = (items, path) => {
			for (var it of items) {
				if (it.divider) continue;
				var p = path ? path + ' > ' + it.name : it.name;
				if (it.children) visit(it.children, p);
				else fn(it, p);
			}
		};
		visit(menuDefinition, '');
	}

	members() {
		var out = [];
		var seen = {};
		for (var g of this.workspace.groups) {
			for (var m of g.members) {
				if (!seen[m.id]) { seen[m.id] = true; out.push(m); }
			}
		}
		return out;
	}

	load() {
		try {
			var raw = localStorage.getItem(KEY);
			if (raw) return JSON.parse(raw);
		} catch (e) { /* storage blocked */ }
		return { menus: {}, tools: {} };
	}

	/**
	 * remembers the defaults and applies the stored changes (before the keymap is built)
	 */
	install() {
		this.walk((it, p) => { this.defaults.menus[p] = it.shortcut || ''; });
		for (var m of this.members()) this.defaults.tools[m.id] = m.key || '';
		this.apply(this.load());
	}

	apply(changes) {
		this.walk((it, p) => {
			var v = p in changes.menus ? changes.menus[p] : this.defaults.menus[p];
			if (v) it.shortcut = v;
			else delete it.shortcut;
		});
		for (var m of this.members()) {
			m.key = m.id in changes.tools ? changes.tools[m.id] : this.defaults.tools[m.id];
		}
		if (this.workspace.Keymap) this.workspace.Keymap.build_map();
	}

	/**
	 * current shortcuts -> stored changes (only what differs from the defaults)
	 */
	changes_of(draft) {
		var out = { menus: {}, tools: {} };
		for (var p in draft.menus) if (draft.menus[p] != this.defaults.menus[p]) out.menus[p] = draft.menus[p];
		for (var id in draft.tools) if (draft.tools[id] != this.defaults.tools[id]) out.tools[id] = draft.tools[id];
		return out;
	}

	/**
	 * CS6 display order: Alt+Shift+Ctrl+Key
	 */
	combo_text(e) {
		var key = this.workspace.Keymap.key_name(e);
		if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return null;
		if (key.length == 1) key = key.toUpperCase();
		return (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + key;
	}

	open() {
		this.close();
		var menus = {}, tools = {};
		this.walk((it, p) => { menus[p] = it.shortcut || ''; });
		for (var m of this.members()) tools[m.id] = m.key || '';
		this.draft = { menus: menus, tools: tools };
		this.kind = 'menus';
		this.open_paths = {};
		this.editing = null;
		var el = document.createElement('div');
		el.className = 'popup ps_kbd';
		el.style.display = 'block';
		el.innerHTML = '<h2>Keyboard Shortcuts and Menus</h2>'
			+ '<div class="ps_kbd_tabs"><button type="button" class="active">Keyboard Shortcuts</button><button type="button" disabled>Menus</button></div>'
			+ '<div class="ps_kbd_body"><div class="ps_kbd_main">'
			+ '<div class="ps_kbd_row"><span>Set:</span><select id="kbd_set"><option>Photoshop Defaults</option></select>'
			+ '<button type="button" class="ps_opt_icon" disabled title="Save all changes to the current set of shortcuts"><svg viewBox="0 0 18 18" width="14" height="14"><path d="M3 3h10l2 2v10H3z M6 3v4h6V3" ' + S + '/></svg></button>'
			+ '<button type="button" class="ps_opt_icon" disabled title="Create a new set based on the current set of shortcuts"><svg viewBox="0 0 18 18" width="14" height="14"><rect x="4" y="3" width="10" height="12" ' + S + '/></svg></button>'
			+ '<button type="button" class="ps_opt_icon" disabled title="Delete the current set of shortcuts"><svg viewBox="0 0 18 18" width="14" height="14"><path d="M5 5h8l-.8 10H5.8zM4 5h10" ' + S + '/></svg></button></div>'
			+ '<div class="ps_kbd_row"><span>Shortcuts For:</span><select id="kbd_for"><option value="menus">Application Menus</option><option value="panels" disabled>Panel Menus</option><option value="tools">Tools</option></select></div>'
			+ '<div class="ps_kbd_table"><div class="ps_kbd_head"><span>Application Menu Command</span><span>Shortcut</span></div><div class="ps_kbd_list"></div></div>'
			+ '<div class="ps_kbd_msg"></div></div>'
			+ '<div class="ps_kbd_buttons"><button type="button" class="button" data-b="ok">OK</button><button type="button" class="button" data-b="cancel">Cancel</button>'
			+ '<button type="button" class="button" data-b="accept" disabled>Accept</button><button type="button" class="button" data-b="undo" disabled>Undo</button>'
			+ '<button type="button" class="button" data-b="default">Use Default</button><button type="button" class="button" disabled>Add Shortcut</button>'
			+ '<button type="button" class="button" data-b="delete">Delete Shortcut</button><button type="button" class="button" disabled>Summarize...</button></div></div>';
		document.getElementById('popups').appendChild(el);
		this.el = el;
		el.querySelector('#kbd_for').addEventListener('change', (e) => { this.kind = e.target.value; this.editing = null; this.render(); });
		el.querySelector('[data-b="ok"]').addEventListener('click', () => this.ok());
		el.querySelector('[data-b="cancel"]').addEventListener('click', () => this.close());
		el.querySelector('[data-b="accept"]').addEventListener('click', () => this.accept());
		el.querySelector('[data-b="undo"]').addEventListener('click', () => { this.editing = null; this.render(); });
		el.querySelector('[data-b="default"]').addEventListener('click', () => this.use_default());
		el.querySelector('[data-b="delete"]').addEventListener('click', () => this.delete_shortcut());
		this.keys = (e) => this.on_key(e);
		window.addEventListener('keydown', this.keys, true);
		this.render();
	}

	/**
	 * rows: menus (collapsible) or tools
	 */
	render() {
		var esc = app.GUI.Ps_workspace.Helper.escapeHtml;
		var list = this.el.querySelector('.ps_kbd_list');
		this.el.querySelector('.ps_kbd_head span').textContent = this.kind == 'tools' ? 'Tool Panel Command' : 'Application Menu Command';
		var html = '';
		var cell = (id, value, editable) => {
			var ed = this.editing && this.editing.id == id;
			return '<span class="ps_kbd_short' + (ed ? ' editing' : '') + (editable ? '' : ' disabled') + '" data-edit="' + esc(id) + '">' + esc(ed ? this.editing.value : value) + '</span>';
		};
		if (this.kind == 'tools') {
			for (var m of this.members()) {
				var sel = this.selected == m.id;
				html += '<div class="ps_kbd_item' + (sel ? ' selected' : '') + '" data-id="' + esc(m.id) + '"><span>' + esc(m.name) + '</span>' + cell(m.id, this.draft.tools[m.id], true) + '</div>';
			}
		}
		else {
			var visit = (items, path, depth) => {
				for (var it of items) {
					if (it.divider) continue;
					var p = path ? path + ' > ' + it.name : it.name;
					if (it.children) {
						var open = !!this.open_paths[p];
						html += '<div class="ps_kbd_item ps_kbd_menu" data-toggle="' + esc(p) + '" style="padding-left:' + (4 + depth * 14) + 'px"><span>' + (depth == 0 ? (open ? '&#9662; ' : '&#9656; ') : '') + esc(it.name) + '</span><span></span></div>';
						if (open || depth > 0) visit(it.children, p, depth + 1);
					}
					else {
						var selected = this.selected == p;
						html += '<div class="ps_kbd_item' + (selected ? ' selected' : '') + (it.target ? '' : ' disabled') + '" data-id="' + esc(p) + '" style="padding-left:' + (4 + depth * 14) + 'px"><span>' + esc(it.name) + '</span>'
							+ cell(p, this.draft.menus[p], !!it.target) + '</div>';
					}
				}
			};
			visit(menuDefinition, '', 0);
		}
		list.innerHTML = html;
		list.querySelectorAll('[data-toggle]').forEach((r) => r.addEventListener('click', () => {
			this.open_paths[r.dataset.toggle] = !this.open_paths[r.dataset.toggle];
			this.render();
		}));
		list.querySelectorAll('.ps_kbd_item[data-id]').forEach((r) => r.addEventListener('click', (e) => {
			this.selected = r.dataset.id;
			if (r.classList.contains('disabled')) { this.render(); return; }
			if (e.target.closest('[data-edit]') || this.editing) {
				var value = this.kind == 'tools' ? this.draft.tools[r.dataset.id] : this.draft.menus[r.dataset.id];
				this.editing = { id: r.dataset.id, value: value || '', original: value || '' };
			}
			this.render();
			var ed = list.querySelector('.ps_kbd_short.editing');
			if (ed) ed.scrollIntoView({ block: 'nearest' });
		}));
		var editing = !!this.editing;
		this.el.querySelector('[data-b="accept"]').disabled = !editing;
		this.el.querySelector('[data-b="undo"]').disabled = !editing;
		this.message();
	}

	/**
	 * conflicts / validation under the list
	 */
	message() {
		var msg = '';
		var e = this.editing;
		this.conflict = null;
		if (e && e.value) {
			if (this.kind == 'tools') {
				if (!/^[A-Z]$/.test(e.value)) msg = 'Tool shortcuts must be a single letter.';
			}
			else {
				if (!/Ctrl\+|^F\d+$|\+F\d+$/.test(e.value)) msg = 'Shortcuts must include Ctrl and/or a function key.';
				else {
					var K = this.workspace.Keymap;
					var mine = K.parse_shortcut(e.value);
					for (var p in this.draft.menus) {
						if (p != e.id && this.draft.menus[p] && K.parse_shortcut(this.draft.menus[p]) == mine) {
							this.conflict = p;
							msg = e.value + ' is already in use and will be removed from ' + p + ' if accepted.';
							break;
						}
					}
				}
			}
		}
		this.el.querySelector('.ps_kbd_msg').textContent = msg;
		this.invalid = !!msg && !this.conflict;
	}

	on_key(e) {
		if (!this.el) return;
		if (this.editing) {
			e.preventDefault();
			e.stopImmediatePropagation();
			if (e.key == 'Escape') { this.editing = null; this.render(); return; }
			if (e.key == 'Enter') { this.accept(); return; }
			if (e.key == 'Backspace' || e.key == 'Delete') { this.editing.value = ''; this.render(); return; }
			var text = this.kind == 'tools' ? (/^[a-z]$/i.test(e.key) && !e.ctrlKey && !e.altKey ? e.key.toUpperCase() : this.editing.value) : this.combo_text(e);
			if (text != null) { this.editing.value = text; this.render(); }
			return;
		}
		if (e.key == 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.close(); return; }
		if (e.key == 'Enter' && e.target.tagName != 'SELECT') { e.preventDefault(); e.stopImmediatePropagation(); this.ok(); return; }
		e.stopPropagation();
	}

	accept() {
		var e = this.editing;
		if (!e) return;
		this.message();
		if (this.invalid) return;
		if (this.kind == 'tools') this.draft.tools[e.id] = e.value;
		else {
			if (this.conflict) this.draft.menus[this.conflict] = '';
			this.draft.menus[e.id] = e.value;
		}
		this.editing = null;
		this.render();
	}

	use_default() {
		var id = this.editing ? this.editing.id : this.selected;
		if (!id) return;
		if (this.kind == 'tools') this.draft.tools[id] = this.defaults.tools[id];
		else this.draft.menus[id] = this.defaults.menus[id];
		this.editing = null;
		this.render();
	}

	delete_shortcut() {
		var id = this.editing ? this.editing.id : this.selected;
		if (!id) return;
		if (this.kind == 'tools') this.draft.tools[id] = '';
		else this.draft.menus[id] = '';
		this.editing = null;
		this.render();
	}

	ok() {
		if (this.editing) this.accept();
		var changes = this.changes_of(this.draft);
		try { localStorage.setItem(KEY, JSON.stringify(changes)); } catch (e) { /* storage blocked */ }
		this.apply(changes);
		this.close();
	}

	close() {
		if (this.keys) window.removeEventListener('keydown', this.keys, true);
		this.keys = null;
		if (this.el) this.el.remove();
		this.el = null;
	}
}

export default Ps_shortcuts_class;
