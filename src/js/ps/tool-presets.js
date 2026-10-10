/*
 * pshot - CS6 tool presets: a tool with its options saved under a name. The
 * Tool Preset picker (left end of the options bar) and the Tool Presets panel
 * list them, optionally for the current tool only; choosing one selects the
 * tool and restores its options.
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';
import { show_popup_menu } from './popup-menu.js';

var USER = [];
try { USER = JSON.parse(localStorage.getItem('pshot_tool_presets_v1') || '[]'); } catch (e) { USER = []; }

function save() {
	try { localStorage.setItem('pshot_tool_presets_v1', JSON.stringify(USER)); } catch (e) { /* storage blocked */ }
}

class Ps_tool_presets_class {

	constructor() {
		this.current_only = false;
	}

	member() {
		return app.GUI.Ps_workspace.active_member;
	}

	visible() {
		var m = this.member();
		return this.current_only && m ? USER.filter(p => p.member == m.id) : USER;
	}

	icon(member_id) {
		var ws = app.GUI.Ps_workspace;
		for (var g of ws.groups) for (var m of g.members) if (m.id == member_id) return m.icon;
		return '';
	}

	apply(preset) {
		var ws = app.GUI.Ps_workspace;
		ws.Extras.select_tool(preset.member);
		Object.assign(config.TOOL.attributes, JSON.parse(JSON.stringify(preset.attributes)));
		this.current = preset;
		ws.Options_bar.render();
		this.render();
	}

	/**
	 * New Tool Preset: the current tool and its options
	 */
	create() {
		var m = this.member();
		if (!m) return;
		var POP = new Dialog_class();
		POP.show({
			title: 'New Tool Preset',
			params: [{ name: 'name', title: 'Name:', value: m.name.replace(/ Tool$/, '') + ' 1' }],
			on_finish: (p) => {
				var preset = { name: p.name || m.name, member: m.id, attributes: JSON.parse(JSON.stringify(config.TOOL.attributes)) };
				USER.push(preset);
				save();
				this.current = preset;
				this.render();
			},
		});
	}

	user_list() {
		return USER;
	}

	rename(preset, name) {
		if (USER.includes(preset) && name) {
			preset.name = name;
			save();
		}
	}

	import_presets(list) {
		for (var p of list || []) USER.push(p);
		save();
	}

	remove(preset) {
		var i = USER.indexOf(preset);
		if (i < 0) return;
		USER.splice(i, 1);
		save();
		if (this.current === preset) this.current = null;
		this.render();
	}

	rows_html(list) {
		if (!list.length) return '<div class="ps_tpre_empty">' + (this.current_only ? 'No tool presets for the current tool.' : 'No tool presets.') + '</div>';
		return list.map(p => '<div class="ps_tpre_row' + (p === this.current ? ' active' : '') + '" data-i="' + USER.indexOf(p) + '"><svg viewBox="0 0 18 18" width="16" height="16">' + this.icon(p.member) + '</svg><span>'
			+ app.GUI.Ps_workspace.Helper.escapeHtml(p.name) + '</span></div>').join('');
	}

	/**
	 * the options bar Tool Preset picker
	 */
	picker(anchor) {
		var existing = document.querySelector('.ps_tpre_picker');
		if (existing) { existing.remove(); return; }
		var pop = document.createElement('div');
		pop.className = 'ps_tpre_picker';
		var draw = () => {
			pop.innerHTML = '<div class="ps_tpre_head"><span></span><button type="button" class="ps_tpre_new" title="Create new tool preset">&#43;</button><button type="button" class="ps_tpre_menu" title="Tool preset options">&#9881;</button></div>'
				+ '<div class="ps_tpre_list">' + this.rows_html(this.visible()) + '</div>'
				+ '<label class="ps_tpre_only"><input type="checkbox"' + (this.current_only ? ' checked' : '') + '> Current Tool Only</label>';
			pop.querySelector('.ps_tpre_new').addEventListener('click', () => { close(); this.create(); });
			pop.querySelector('.ps_tpre_menu').addEventListener('click', (e) => {
				show_popup_menu(e.currentTarget, [
					{ name: 'New Tool Preset...', action: () => { close(); this.create(); } },
					{ name: 'Delete Tool Preset', action: this.current ? () => { this.remove(this.current); draw(); } : null },
					{ divider: true },
					{ name: 'Reset All Tools', action: () => { close(); this.reset_all(); } },
				]);
			});
			pop.querySelector('.ps_tpre_only input').addEventListener('change', (e) => { this.current_only = e.target.checked; draw(); this.render(); });
			pop.querySelectorAll('.ps_tpre_row').forEach(r => r.addEventListener('click', () => { close(); this.apply(USER[parseInt(r.dataset.i)]); }));
		};
		draw();
		document.body.appendChild(pop);
		var rect = anchor.getBoundingClientRect();
		pop.style.left = rect.left + 'px';
		pop.style.top = (rect.bottom + 2) + 'px';
		var close = () => {
			pop.remove();
			document.removeEventListener('mousedown', outside, true);
		};
		var outside = (e) => {
			if (!pop.contains(e.target) && !anchor.contains(e.target) && !e.target.closest('.ps_popup_menu, #popups')) close();
		};
		setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
	}

	/**
	 * Reset All Tools: every tool's options back to the defaults
	 */
	reset_all() {
		if (!this.defaults) return;
		for (var t of config.TOOLS) {
			if (this.defaults[t.name]) t.attributes = JSON.parse(JSON.stringify(this.defaults[t.name]));
		}
		var ws = app.GUI.Ps_workspace;
		var m = this.member();
		if (m) ws.Extras.select_tool(m.id);
		ws.Options_bar.render();
	}

	install() {
		//defaults for Reset All Tools
		this.defaults = {};
		for (var t of config.TOOLS) {
			try { this.defaults[t.name] = JSON.parse(JSON.stringify(t.attributes)); } catch (e) { /* not cloneable */ }
		}
		var el = document.getElementById('ps_tool_preset');
		if (el) {
			el.disabled = false;
			el.addEventListener('click', () => this.picker(el));
		}
	}

	// ---------- Tool Presets panel ----------

	render() {
		var el = document.getElementById('ps_tool_presets');
		if (!el || !el.closest('.ps_popout, .ps_panel.active')) return;
		el.innerHTML = '<div class="ps_tpre_list">' + this.rows_html(this.visible()) + '</div>'
			+ '<div class="ps_panel_footer"><label class="ps_tpre_only"><input type="checkbox"' + (this.current_only ? ' checked' : '') + '> Current Tool Only</label>'
			+ '<button type="button" data-a="new" title="Create new tool preset">&#43;</button>'
			+ '<button type="button" data-a="delete" title="Delete tool preset"' + (this.current ? '' : ' class="disabled"') + '>&#128465;</button></div>';
		el.querySelectorAll('.ps_tpre_row').forEach(r => r.addEventListener('click', () => this.apply(USER[parseInt(r.dataset.i)])));
		el.querySelector('.ps_tpre_only input').addEventListener('change', (e) => { this.current_only = e.target.checked; this.render(); });
		el.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
			if (b.classList.contains('disabled')) return;
			if (b.dataset.a == 'new') this.create();
			if (b.dataset.a == 'delete') this.remove(this.current);
		}));
	}
}

export default Ps_tool_presets_class;
