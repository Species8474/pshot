/*
 * pshot - CS6 Actions panel: record menu commands and shortcuts into actions,
 * play them back. Filters replay with their recorded settings (no dialog);
 * other commands that have a dialog open it during playback, like CS6 with
 * the dialog toggle on. Actions persist in browser storage, like CS6 sets.
 */

import app from './../app.js';
import Dialog_class from './../libs/popup.js';
import menuDefinition from './../config-menu.js';

const KEY = 'pshot_actions_v1';
const S = 'fill="none" stroke="currentColor" stroke-width="1.2"';

const DEFAULTS = [{
	name: 'Default Actions', open: true, actions: [
		{ name: 'Sepia Toning (layer)', steps: [
			{ target: 'ps/commands.layer_via_copy', name: 'Layer Via Copy' },
			{ target: 'ps/commands.desaturate', name: 'Desaturate' },
			{ target: 'ps/commands.new_adjustment_layer', parameter: 'photo_filter', name: 'Make Photo Filter Layer' },
		] },
		{ name: 'Custom RGB to Grayscale', steps: [{ target: 'ps/commands.mode_grayscale', name: 'Convert Mode' }] },
		{ name: 'Gradient Map', steps: [{ target: 'ps/commands.new_adjustment_layer', parameter: 'gradient_map', name: 'Make Gradient Map Layer' }] },
		{ name: 'Flatten and Sharpen', steps: [{ target: 'ps/commands.flatten_image', name: 'Flatten Image' }, { target: 'ps/filters.unsharp_mask', name: 'Unsharp Mask', settings: { amount: 80, radius: 1, threshold: 2 } }] },
	],
}];

class Ps_actions_panel_class {

	constructor() {
		this.sets = this.load();
		this.selected = null; //{ set, action }
		this.recording = null; //action being recorded
		this.playing = false;
	}

	load() {
		try {
			var raw = localStorage.getItem(KEY);
			if (raw) return JSON.parse(raw);
		} catch (e) { /* storage blocked */ }
		return JSON.parse(JSON.stringify(DEFAULTS));
	}

	save() {
		try { localStorage.setItem(KEY, JSON.stringify(this.sets)); } catch (e) { /* storage blocked */ }
	}

	label(target, parameter) {
		//the menu item's name
		var found = null;
		var walk = (items) => {
			for (var it of items || []) {
				if (found) return;
				if (it.children) walk(it.children);
				else if (it.target == target && (it.parameter == null || it.parameter == parameter)) found = it.name;
			}
		};
		walk(menuDefinition);
		return (found || target.split('.').pop().replace(/_/g, ' ')).replace(/\.\.\.$/, '').replace(/^\w/, c => c.toUpperCase());
	}

	/**
	 * called for every menu command / shortcut
	 */
	record(target, parameter) {
		if (!this.recording || this.playing) return;
		if (/toggle_panel|toggle_options_bar|toggle_toolbox|^view\/|zoom|screen_mode|workspace/.test(target)) return;
		this.attach_settings();
		this.recording.steps.push({ target: target, parameter: parameter == null ? undefined : parameter, name: this.label(target, parameter) });
		this.save();
		this.render();
	}

	/**
	 * a recorded filter keeps the settings it was applied with
	 */
	attach_settings() {
		var steps = this.recording ? this.recording.steps : [];
		var last = steps[steps.length - 1];
		if (last && last.target.indexOf('ps/filters.') === 0 && !last.settings) {
			var filters = app.GUI.modules['ps/filters'];
			var key = last.target.split('.')[1];
			if (filters.saved && filters.saved[key]) last.settings = Object.assign({}, filters.saved[key]);
		}
	}

	start_recording() {
		var a = this.current_action();
		if (!a) return this.new_action(true);
		this.recording = a;
		this.render();
	}

	stop() {
		this.attach_settings();
		this.recording = null;
		this.save();
		this.render();
	}

	current_action() {
		var s = this.selected;
		return s && this.sets[s.set] ? this.sets[s.set].actions[s.action] : null;
	}

	new_action(and_record) {
		var POP = new Dialog_class();
		var set = this.selected ? this.selected.set : 0;
		POP.show({
			title: 'New Action',
			params: [
				{ name: 'name', title: 'Name:', value: 'Action ' + (this.sets[set].actions.length + 1) },
				{ name: 'set', title: 'Set:', values: this.sets.map(s => s.name), value: this.sets[set].name, type: 'select' },
			],
			on_finish: (params) => {
				var si = Math.max(0, this.sets.findIndex(s => s.name == params.set));
				this.sets[si].actions.push({ name: params.name || 'Action', steps: [] });
				this.selected = { set: si, action: this.sets[si].actions.length - 1 };
				this.sets[si].open = true;
				this.recording = and_record !== false ? this.sets[si].actions[this.selected.action] : null;
				this.save();
				this.render();
			},
		});
	}

	new_set() {
		var POP = new Dialog_class();
		POP.show({
			title: 'New Set',
			params: [{ name: 'name', title: 'Name:', value: 'Set ' + (this.sets.length + 1) }],
			on_finish: (params) => {
				this.sets.push({ name: params.name || 'Set', open: true, actions: [] });
				this.save();
				this.render();
			},
		});
	}

	remove() {
		var s = this.selected;
		if (!s || !this.sets[s.set]) return;
		if (s.action == null) this.sets.splice(s.set, 1);
		else this.sets[s.set].actions.splice(s.action, 1);
		this.selected = null;
		this.save();
		this.render();
	}

	/**
	 * play the selected action, step by step (each waits for its dialog)
	 */
	async play() {
		var a = this.current_action();
		if (!a || this.playing) return;
		this.playing = true;
		this.render();
		try {
			for (var step of a.steps) {
				if (step.target.indexOf('ps/filters.') === 0 && step.settings) {
					var key = step.target.split('.')[1];
					if (!app.GUI.modules['ps/filters'].apply_settings(key, step.settings)) {
						app.GUI.modules['ps/filters'][key]();
					}
				}
				else {
					var parts = step.target.split('.');
					var module = app.GUI.modules[parts[0]];
					if (!module || typeof module[parts[1]] != 'function') continue;
					var res = module[parts[1]](step.parameter);
					if (res && res.then) await res;
				}
				await this.idle();
			}
		} finally {
			this.playing = false;
			this.render();
		}
	}

	/**
	 * until no dialog is open and the step has settled
	 */
	idle() {
		return new Promise((resolve) => {
			var check = () => {
				var busy = document.querySelector('#popups .popup') || (app.GUI.Ps_workspace.Transform && app.GUI.Ps_workspace.Transform.active());
				if (busy) setTimeout(check, 150);
				else setTimeout(resolve, 150);
			};
			setTimeout(check, 100);
		});
	}

	render() {
		var el = document.getElementById('ps_actions');
		if (!el) return;
		var html = '<div class="ps_actions_list">';
		this.sets.forEach((set, si) => {
			var ssel = this.selected && this.selected.set == si && this.selected.action == null;
			html += '<div class="ps_act_row ps_act_set' + (ssel ? ' active' : '') + '" data-set="' + si + '"><span class="ps_act_check">&#10003;</span><span class="ps_act_toggle" data-toggle="' + si + '">' + (set.open ? '&#9662;' : '&#9656;') + '</span>'
				+ '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M1.5 4h5l1 1.5h7v8h-13z" fill="currentColor" opacity=".8"/></svg> ' + app.GUI.Ps_workspace.Helper.escapeHtml(set.name) + '</div>';
			if (!set.open) return;
			set.actions.forEach((a, ai) => {
				var asel = this.selected && this.selected.set == si && this.selected.action == ai;
				var rec = this.recording === a;
				html += '<div class="ps_act_row ps_act_action' + (asel ? ' active' : '') + '" data-set="' + si + '" data-action="' + ai + '"><span class="ps_act_check">&#10003;</span><span class="ps_act_indent"></span>'
					+ (rec ? '<span class="ps_act_rec">&#9679;</span> ' : '') + app.GUI.Ps_workspace.Helper.escapeHtml(a.name) + '</div>';
				if (asel) {
					a.steps.forEach((st) => {
						html += '<div class="ps_act_row ps_act_step"><span class="ps_act_check">&#10003;</span><span class="ps_act_indent2"></span>' + app.GUI.Ps_workspace.Helper.escapeHtml(st.name) + '</div>';
					});
				}
			});
		});
		html += '</div><div class="ps_panel_footer">'
			+ '<button type="button" data-act="stop" title="Stop playing/recording"><svg viewBox="0 0 18 18" width="14" height="14"><rect x="5" y="5" width="8" height="8" fill="currentColor"/></svg></button>'
			+ '<button type="button" data-act="record" class="' + (this.recording ? 'recording' : '') + '" title="Begin recording"><svg viewBox="0 0 18 18" width="14" height="14"><circle cx="9" cy="9" r="4.5" fill="currentColor"/></svg></button>'
			+ '<button type="button" data-act="play" title="Play selection"><svg viewBox="0 0 18 18" width="14" height="14"><path d="M6 4l8 5-8 5z" fill="currentColor"/></svg></button>'
			+ '<button type="button" data-act="set" title="Create new set"><svg viewBox="0 0 18 18" width="16" height="16"><path d="M2 5h5l1 1.5h8v8H2z" ' + S + '/></svg></button>'
			+ '<button type="button" data-act="new" title="Create new action"><svg viewBox="0 0 18 18" width="16" height="16"><rect x="4" y="3" width="10" height="12" ' + S + '/><path d="M11 3v3h3" ' + S + '/></svg></button>'
			+ '<button type="button" data-act="delete" title="Delete"><svg viewBox="0 0 18 18" width="16" height="16"><path d="M5 5h8l-.8 10H5.8zM4 5h10M7.5 3h3" ' + S + '/></svg></button></div>';
		el.innerHTML = html;
		el.querySelectorAll('[data-toggle]').forEach((t) => t.addEventListener('click', (e) => {
			e.stopPropagation();
			var set = this.sets[parseInt(t.dataset.toggle)];
			set.open = !set.open;
			this.save();
			this.render();
		}));
		el.querySelectorAll('.ps_act_set, .ps_act_action').forEach((row) => row.addEventListener('click', () => {
			this.selected = { set: parseInt(row.dataset.set), action: row.dataset.action == null ? null : parseInt(row.dataset.action) };
			this.render();
		}));
		el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
			var k = b.dataset.act;
			if (k == 'stop') this.stop();
			else if (k == 'record') this.start_recording();
			else if (k == 'play') this.play();
			else if (k == 'set') this.new_set();
			else if (k == 'new') this.new_action();
			else if (k == 'delete') this.remove();
		}));
	}
}

export default Ps_actions_panel_class;
