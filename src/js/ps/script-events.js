/*
 * pshot - CS6 File > Scripts > Script Events Manager: an Action runs when a
 * document event happens (Start Application, New / Open / Save / Close /
 * Print / Export Document, Everything). The bindings are kept in the browser.
 */

import app from './../app.js';

const KEY = 'pshot_script_events_v1';
const EVENTS = [['start', 'Start Application'], ['new', 'New Document'], ['open', 'Open Document'], ['save', 'Save Document'], ['close', 'Close Document'], ['print', 'Print Document'], ['export', 'Export Document'], ['all', 'Everything']];

function esc(v) {
	return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

class Ps_script_events_class {

	constructor() {
		this.state = this.load();
	}

	load() {
		try { return Object.assign({ enabled: false, list: [] }, JSON.parse(localStorage.getItem(KEY) || 'null') || {}); } catch (e) { return { enabled: false, list: [] }; }
	}

	save() {
		try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) { /* storage blocked */ }
	}

	/**
	 * wraps the commands that make the events (after the command finishes)
	 */
	install() {
		var commands = app.GUI.modules['ps/commands'], print = app.GUI.modules['file/print'];
		var wrap = (obj, fn, event) => {
			if (!obj || typeof obj[fn] != 'function') return;
			var orig = obj[fn].bind(obj);
			obj[fn] = (...args) => {
				var r = orig(...args);
				Promise.resolve(r).then(() => this.fire(event));
				return r;
			};
		};
		wrap(commands, 'open', 'open');
		wrap(commands, 'save', 'save');
		wrap(commands, 'close_document', 'close');
		wrap(commands, 'save_for_web', 'export');
		wrap(commands, 'export_layers', 'export');
		wrap(print, 'print', 'print');
		//File > New builds its document after its dialog
		var docs = app.GUI.Ps_workspace.Documents, add = docs.add.bind(docs);
		docs.add = (name, file_name) => {
			var r = add(name, file_name);
			if (!name && !file_name) setTimeout(() => this.fire('new'), 400);
			return r;
		};
		setTimeout(() => this.fire('start'), 1000);
	}

	async fire(event) {
		var s = this.state;
		if (!s.enabled || this.running) return;
		var A = app.GUI.Ps_workspace.Actions;
		for (var b of s.list) {
			if (b.event != event && b.event != 'all') continue;
			var si = A.sets.findIndex(x => x.name == b.set);
			var ai = si >= 0 ? A.sets[si].actions.findIndex(x => x.name == b.action) : -1;
			if (ai < 0) continue;
			this.running = true;
			var keep = A.selected;
			try {
				A.selected = { set: si, action: ai };
				await A.play();
			}
			finally {
				A.selected = keep;
				this.running = false;
			}
		}
	}

	open() {
		var s = JSON.parse(JSON.stringify(this.state)), A = app.GUI.Ps_workspace.Actions;
		var sets = A.sets.map(x => x.name);
		var pick = { event: 'open', set: sets[0] || '', action: '' };
		var root = document.createElement('div');
		root.className = 'ps_grad_editor_wrap ps_pm_wrap';
		var render = () => {
			var set = A.sets.find(x => x.name == pick.set);
			var actions = set ? set.actions.map(x => x.name) : [];
			if (!actions.includes(pick.action)) pick.action = actions[0] || '';
			root.innerHTML = '<div class="ps_grad_editor ps_sem">'
				+ '<div class="ps_ge_title">Script Events Manager</div>'
				+ '<label class="ps_adj_check"><input type="checkbox" class="ps_sem_on"' + (s.enabled ? ' checked' : '') + '> Enable Events to Run Scripts/Actions:</label>'
				+ '<div class="ps_sem_list">' + (s.list.length ? s.list.map((b, i) => '<div class="ps_sem_row' + (i == this.sel ? ' active' : '') + '" data-i="' + i + '">' + esc(EVENTS.find(e => e[0] == b.event)[1]) + ': ' + esc(b.action) + ' (' + esc(b.set) + ')</div>').join('') : '<div class="ps_sem_empty">No events.</div>') + '</div>'
				+ '<div class="ps_ge_row"><label>Photoshop Event:</label><select class="ps_sem_event">' + EVENTS.map(e => '<option value="' + e[0] + '"' + (e[0] == pick.event ? ' selected' : '') + '>' + e[1] + '</option>').join('') + '</select></div>'
				+ '<div class="ps_ge_row"><label><input type="radio" disabled> Script:</label><select disabled><option>None</option></select></div>'
				+ '<div class="ps_ge_row"><label><input type="radio" checked> Action:</label><select class="ps_sem_set">' + sets.map(n => '<option' + (n == pick.set ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>'
				+ '<select class="ps_sem_action">' + actions.map(n => '<option' + (n == pick.action ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select></div>'
				+ '<div class="ps_ge_buttons ps_vars_buttons"><button type="button" data-a="done">Done</button><button type="button" data-a="add"' + (pick.action ? '' : ' disabled') + '>Add</button>'
				+ '<button type="button" data-a="remove"' + (this.sel >= 0 && s.list[this.sel] ? '' : ' disabled') + '>Remove</button><button type="button" data-a="remove_all"' + (s.list.length ? '' : ' disabled') + '>Remove All</button></div></div>';
			root.querySelector('.ps_sem_on').addEventListener('change', (e) => { s.enabled = e.target.checked; });
			root.querySelector('.ps_sem_event').addEventListener('change', (e) => { pick.event = e.target.value; });
			root.querySelector('.ps_sem_set').addEventListener('change', (e) => { pick.set = e.target.value; render(); });
			root.querySelector('.ps_sem_action').addEventListener('change', (e) => { pick.action = e.target.value; });
			root.querySelectorAll('.ps_sem_row').forEach(r => r.addEventListener('click', () => { this.sel = parseInt(r.dataset.i); render(); }));
			root.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
				var a = b.dataset.a;
				if (a == 'add' && pick.action) { s.list.push({ event: pick.event, set: pick.set, action: pick.action }); s.enabled = true; this.sel = s.list.length - 1; render(); }
				else if (a == 'remove') { s.list.splice(this.sel, 1); this.sel = -1; render(); }
				else if (a == 'remove_all') { s.list = []; this.sel = -1; render(); }
				else if (a == 'done') { this.state = s; this.save(); root.remove(); }
			}));
		};
		this.sel = -1;
		document.body.appendChild(root);
		render();
	}
}

export default Ps_script_events_class;
