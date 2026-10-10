/*
 * pshot - CS6 Actions panel: record menu commands and shortcuts into actions,
 * play them back. Filters replay with their recorded settings (no dialog);
 * other commands that have a dialog open it during playback, like CS6 with
 * the dialog toggle on. Actions persist in browser storage, like CS6 sets.
 */

import app from './../app.js';
import config from './../config.js';
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
		//shortcuts without a menu item of their own: the CS6 step names
		found = found || { 'ps/commands.new_layer_silent': 'Make Layer' }[target];
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

	duplicate() {
		var s = this.selected;
		if (!s || !this.sets[s.set]) return;
		if (s.action == null) {
			var set = JSON.parse(JSON.stringify(this.sets[s.set]));
			set.name += ' copy';
			this.sets.splice(s.set + 1, 0, set);
		}
		else {
			var a = JSON.parse(JSON.stringify(this.sets[s.set].actions[s.action]));
			a.name += ' copy';
			this.sets[s.set].actions.splice(s.action + 1, 0, a);
			this.selected = { set: s.set, action: s.action + 1 };
		}
		this.save();
		this.render();
	}

	clear_all() {
		if (!window.confirm('Delete all actions?')) return;
		this.sets = [];
		this.selected = null;
		this.save();
		this.render();
	}

	reset() {
		this.sets = JSON.parse(JSON.stringify(DEFAULTS));
		this.selected = null;
		this.save();
		this.render();
	}

	save_file() {
		var s = this.selected, sets = s && this.sets[s.set] ? [this.sets[s.set]] : this.sets;
		var a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([JSON.stringify({ pshot_actions: 1, sets: sets })], { type: 'application/json' }));
		a.download = (sets.length == 1 ? sets[0].name : 'Actions') + '.json';
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 5000);
	}

	load_file(replace) {
		var input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json,application/json';
		input.addEventListener('change', async () => {
			var f = input.files && input.files[0];
			if (!f) return;
			try {
				var data = JSON.parse(await f.text());
				if (!data || !Array.isArray(data.sets)) throw new Error('not an actions file');
				this.sets = replace ? data.sets : this.sets.concat(data.sets);
				this.save();
				this.render();
			}
			catch (e) {
				app.GUI.Ps_workspace.status_message('Could not load the actions: ' + e.message);
			}
		});
		input.click();
	}

	/**
	 * Allow Tool Recording (CS6): brush and pencil strokes become steps
	 */
	record_stroke(tool_name, points) {
		if (!this.recording || this.playing || !this.allow_tools || !points.length) return;
		var ws = app.GUI.Ps_workspace;
		var member = ws.active_member;
		this.recording.steps.push({
			target: 'ps/commands.replay_stroke',
			parameter: { member: member ? member.id : tool_name, attrs: JSON.parse(JSON.stringify(config.TOOL.attributes)), color: config.COLOR, points: points },
			name: (member ? member.name.replace(/ Tool$/, '') : 'Brush') + ' Tool',
		});
		this.save();
		this.render();
	}

	/**
	 * a Stop step during playback: the message, Continue (when allowed) or Stop
	 */
	show_stop(p) {
		return new Promise((resolve) => {
			var POP = new Dialog_class();
			POP.show({
				title: 'Message',
				params: [{ title: '', html: '<div class="ps_act_stopmsg">' + app.GUI.Ps_workspace.Helper.escapeHtml(p.message || 'Stop') + '</div>' }],
				on_finish: () => resolve(!!p.allow_continue),
				on_cancel: () => resolve(false),
			});
		});
	}

	/**
	 * Button Mode: every action as a button (its color); a click plays it
	 */
	render_buttons(el) {
		var html = '<div class="ps_act_buttons">';
		this.sets.forEach((set, si) => set.actions.forEach((a, ai) => {
			html += '<button type="button" class="ps_act_button' + (a.color && a.color != 'None' ? ' label_' + a.color.toLowerCase() : '') + '" data-set="' + si + '" data-action="' + ai + '">'
				+ app.GUI.Ps_workspace.Helper.escapeHtml(a.name) + (a.key ? '<span class="ps_act_key">' + (a.key_shift ? 'Shift+' : '') + (a.key_ctrl ? 'Ctrl+' : '') + a.key + '</span>' : '') + '</button>';
		}));
		el.innerHTML = html + '</div>';
		el.querySelectorAll('.ps_act_button').forEach((b) => b.addEventListener('click', () => {
			this.selected = { set: parseInt(b.dataset.set), action: parseInt(b.dataset.action) };
			this.play();
		}));
	}

	insert_step(step) {
		var a = this.current_action();
		if (!a) return;
		a.steps.push(step);
		this.save();
		this.render();
	}

	insert_stop() {
		var POP = new Dialog_class();
		POP.show({
			title: 'Record Stop',
			params: [
				{ name: 'message', title: 'Message:', value: '' },
				{ name: 'allow_continue', title: 'Allow Continue', value: true },
			],
			on_finish: (p) => this.insert_step({ target: 'ps/commands.action_stop', parameter: { message: p.message, allow_continue: !!p.allow_continue }, name: 'Stop' }),
		});
	}

	/**
	 * Insert Menu Item: any menu command as a step (it is not run now)
	 */
	insert_menu_item() {
		var items = [];
		var visit = (list, path) => {
			for (var it of list) {
				if (it.divider) continue;
				var p = path ? path + ' > ' + it.name : it.name;
				if (it.children) visit(it.children, p);
				else if (it.target) items.push({ path: p, target: it.target, parameter: it.parameter });
			}
		};
		visit(menuDefinition, '');
		var POP = new Dialog_class();
		POP.show({
			title: 'Insert Menu Item',
			params: [{ name: 'item', title: 'Menu Item:', values: items.map(i => i.path), value: items[0].path, type: 'select' }],
			on_finish: (p) => {
				var it = items.find(i => i.path == p.item);
				if (it) this.insert_step({ target: it.target, parameter: it.parameter, name: this.label(it.target, it.parameter) });
			},
		});
	}

	/**
	 * Insert Path: the active path becomes a step that makes it the work path again
	 */
	insert_path() {
		var P = app.GUI.Ps_workspace.Paths, path = P.active();
		if (!path || !path.subpaths || !path.subpaths.length) {
			app.GUI.Ps_workspace.status_message('Select a path in the Paths panel first.');
			return;
		}
		this.insert_step({ target: 'ps/commands.action_path', parameter: JSON.parse(JSON.stringify(path.subpaths)), name: 'Set Work Path' });
	}

	/**
	 * Action Options: name, function key and color
	 */
	action_options() {
		var a = this.current_action();
		if (!a) return;
		var keys = ['None'].concat(Array.from({ length: 11 }, (_, i) => 'F' + (i + 2)));
		var POP = new Dialog_class();
		POP.show({
			title: 'Action Options',
			params: [
				{ name: 'name', title: 'Name:', value: a.name },
				{ name: 'key', title: 'Function Key:', values: keys, value: a.key || 'None', type: 'select' },
				{ name: 'shift', title: 'Shift', value: !!a.key_shift },
				{ name: 'ctrl', title: 'Control', value: !!a.key_ctrl },
				{ name: 'color', title: 'Color:', values: ['None', 'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Violet', 'Gray'], value: a.color || 'None', type: 'select' },
			],
			on_finish: (p) => {
				Object.assign(a, { name: p.name || a.name, key: p.key == 'None' ? '' : p.key, key_shift: !!p.shift, key_ctrl: !!p.ctrl, color: p.color == 'None' ? '' : p.color });
				this.save();
				this.render();
			},
		});
	}

	/**
	 * a function key combo ("Shift+F5") plays the action it was given
	 */
	play_by_key(combo) {
		for (var si = 0; si < this.sets.length; si++) {
			var acts = this.sets[si].actions;
			for (var ai = 0; ai < acts.length; ai++) {
				var a = acts[ai];
				if (!a.key) continue;
				var want = (a.key_shift ? 'Shift+' : '') + (a.key_ctrl ? 'Ctrl+' : '') + a.key;
				if (want == combo) {
					this.selected = { set: si, action: ai };
					this.play();
					return true;
				}
			}
		}
		return false;
	}

	playback_options() {
		var o = this.playback || { mode: 'Accelerated', pause: 1 };
		var POP = new Dialog_class();
		POP.show({
			title: 'Playback Options',
			params: [
				{ name: 'mode', title: 'Performance:', values: ['Accelerated', 'Step by Step', 'Pause For'], value: o.mode },
				{ name: 'pause', title: 'Pause For (seconds):', value: o.pause || 1, range: [0, 60], step: 1 },
			],
			on_finish: (p) => { this.playback = { mode: p.mode, pause: parseFloat(p.pause) || 0 }; },
		});
	}

	panel_menu_items() {
		var has = !!this.current_action(), sel = !!this.selected;
		return [
			{ name: 'Button Mode', checked: !!this.button_mode, action: () => { this.button_mode = !this.button_mode; this.render(); } },
			{ divider: true },
			{ name: 'New Action...', action: () => this.new_action(true) },
			{ name: 'New Set...', action: () => this.new_set() },
			{ name: 'Duplicate', action: sel ? () => this.duplicate() : null },
			{ name: 'Delete', action: sel ? () => this.remove() : null },
			{ name: 'Play', action: has ? () => this.play() : null },
			{ divider: true },
			{ name: 'Start Recording', action: has && !this.recording ? () => this.start_recording() : null },
			{ name: 'Record Again...', action: has && !this.recording ? () => this.play(true) : null },
			{ name: 'Insert Menu Item...', action: has ? () => this.insert_menu_item() : null },
			{ name: 'Insert Stop...', action: has ? () => this.insert_stop() : null },
			{ name: 'Insert Conditional...', action: has ? () => this.insert_conditional() : null },
			{ name: 'Insert Path', action: has ? () => this.insert_path() : null },
			{ divider: true },
			{ name: 'Allow Tool Recording', checked: !!this.allow_tools, action: () => { this.allow_tools = !this.allow_tools; } },
			{ divider: true },
			{ name: 'Action Options...', action: has ? () => this.action_options() : null },
			{ name: 'Playback Options...', action: () => this.playback_options() },
			{ divider: true },
			{ name: 'Clear All Actions', action: () => this.clear_all() },
			{ name: 'Reset Actions', action: () => this.reset() },
			{ name: 'Load Actions...', action: () => this.load_file(false) },
			{ name: 'Replace Actions...', action: () => this.load_file(true) },
			{ name: 'Save Actions...', action: () => this.save_file() },
		];
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
	/**
	 * Play; Record Again (`again`) shows every filter's dialog and keeps the new settings
	 */
	async play(again) {
		var a = this.current_action();
		if (!a || this.playing) return;
		this.playing = true;
		this.render();
		//commands' confirmation prompts don't stop an action (CS6)
		var confirm = window.confirm;
		window.confirm = () => true;
		try {
			await this.run_steps(a, again === true, 0);
		} finally {
			window.confirm = confirm;
			this.playing = false;
			this.save();
			this.render();
		}
	}

	async run_steps(a, again, depth) {
		var opts = this.playback || { mode: 'Accelerated', pause: 0 };
		for (var step of a.steps) {
			//unchecked steps are skipped (CS6 check column)
			if (step.off) continue;
			if (step.target == 'ps/commands.action_stop') {
				var go_on = await this.show_stop(step.parameter || {});
				if (!go_on) return false;
				continue;
			}
			if (step.target == 'ps/commands.action_conditional') {
				//If Current ... Then Play Action / Else Play Action (actions of the same set)
				var p = step.parameter || {};
				var name = this.condition(p.cond) ? p.then : p.else;
				var set = this.sets.find(s => s.actions.includes(a));
				var other = name && set ? set.actions.find(x => x.name == name) : null;
				if (other && other !== a && depth < 8 && await this.run_steps(other, again, depth + 1) === false) return false;
				continue;
			}
			if (opts.mode == 'Step by Step') await new Promise(r => setTimeout(r, 400));
			else if (opts.mode == 'Pause For') await new Promise(r => setTimeout(r, Math.max(0, opts.pause || 0) * 1000));
			var filters = app.GUI.modules['ps/filters'];
			if (step.target.indexOf('ps/filters.') === 0 && step.settings) {
				var key = step.target.split('.')[1];
				if (again || step.dialog) {
					//the dialog toggle: the filter's dialog opens with the recorded settings
					filters.saved = filters.saved || {};
					filters.saved[key] = Object.assign({}, step.settings);
					filters[key]();
					await this.idle();
					if (again && filters.saved[key]) step.settings = Object.assign({}, filters.saved[key]);
					continue;
				}
				if (!filters.apply_settings(key, step.settings)) filters[key]();
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
		return true;
	}

	/**
	 * Insert Conditional: the CS6 If Current conditions
	 */
	condition(c) {
		var sel = app.GUI.Ps_workspace.Selection, l = config.layer;
		var pixel_layers = config.layers.filter(x => x.type != null && x.type != 'ps_group');
		switch (c) {
			case 'Document Is Landscape Mode': return config.WIDTH > config.HEIGHT;
			case 'Document Is Portrait Mode': return config.HEIGHT > config.WIDTH;
			case 'Document Is Square': return config.WIDTH == config.HEIGHT;
			case 'Document Is in RGB Mode': return !config.ps_mode || config.ps_mode == 'RGB';
			case 'Document Is in CMYK Mode': return config.ps_mode == 'CMYK';
			case 'Document Is in Grayscale Mode': return config.ps_mode == 'Grayscale';
			case 'Document Has Layers': return pixel_layers.length > 1 || (pixel_layers.length == 1 && pixel_layers[0].name != 'Background');
			case 'Document Has Selection': return !!(sel && sel.has());
			case 'Document Has Layer Comps': return !!(config.ps_comps && config.ps_comps.length);
			case 'Layer Is Visible': return !!l && l.visible !== false;
			case 'Layer Has Layer Mask': return !!(l && l.ps_mask);
			case 'Layer Has Vector Mask': return !!(l && l.ps_vmask);
			case 'Layer Has Effects': return !!(l && l.ps_styles && Object.keys(l.ps_styles).length);
			case 'Layer Is Type': return !!l && l.type == 'text';
			case 'Layer Is Shape': return !!l && l.type == 'ps_shape';
			case 'Layer Is Smart Object': return !!(l && l.ps_smart);
			case 'Layer Is Adjustment': return !!l && l.type == 'ps_adjust';
			case 'Layer Is Group': return !!l && l.type == 'ps_group';
			case 'Quick Mask Is On': return !!(sel && sel.quick_mask);
			default: return false;
		}
	}

	insert_conditional() {
		var a = this.current_action();
		if (!a) return;
		var set = this.sets[this.selected.set];
		var names = ['None'].concat(set.actions.filter(x => x !== a).map(x => x.name));
		var conds = ['Document Is Landscape Mode', 'Document Is Portrait Mode', 'Document Is Square', 'Document Is in RGB Mode', 'Document Is in CMYK Mode', 'Document Is in Grayscale Mode',
			'Document Has Layers', 'Document Has Selection', 'Document Has Layer Comps', 'Layer Is Visible', 'Layer Has Layer Mask', 'Layer Has Vector Mask', 'Layer Has Effects',
			'Layer Is Type', 'Layer Is Shape', 'Layer Is Smart Object', 'Layer Is Adjustment', 'Layer Is Group', 'Quick Mask Is On'];
		var POP = new Dialog_class();
		POP.show({
			title: 'Conditional Action',
			params: [
				{ name: 'cond', title: 'If Current:', values: conds, value: conds[0], type: 'select' },
				{ name: 'then', title: 'Then Play Action:', values: names, value: names[1] || 'None', type: 'select' },
				{ name: 'else', title: 'Else Play Action:', values: names, value: 'None', type: 'select' },
			],
			on_finish: (p) => {
				var then = p.then == 'None' ? '' : p.then, other = p.else == 'None' ? '' : p.else;
				this.insert_step({ target: 'ps/commands.action_conditional', parameter: { cond: p.cond, then: then, else: other },
					name: 'If ' + p.cond.replace(/^(Document|Layer) /, '') + (then ? ' Then Play Action "' + then + '"' : '') + (other ? ' Else Play Action "' + other + '"' : '') });
			},
		});
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
		if (this.button_mode) return this.render_buttons(el);
		var html = '<div class="ps_actions_list">';
		this.sets.forEach((set, si) => {
			var ssel = this.selected && this.selected.set == si && this.selected.action == null;
			html += '<div class="ps_act_row ps_act_set' + (ssel ? ' active' : '') + '" data-set="' + si + '"><span class="ps_act_check">&#10003;</span><span class="ps_act_dialog"></span><span class="ps_act_toggle" data-toggle="' + si + '">' + (set.open ? '&#9662;' : '&#9656;') + '</span>'
				+ '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M1.5 4h5l1 1.5h7v8h-13z" fill="currentColor" opacity=".8"/></svg> ' + app.GUI.Ps_workspace.Helper.escapeHtml(set.name) + '</div>';
			if (!set.open) return;
			set.actions.forEach((a, ai) => {
				var asel = this.selected && this.selected.set == si && this.selected.action == ai;
				var rec = this.recording === a;
				html += '<div class="ps_act_row ps_act_action' + (asel ? ' active' : '') + (a.color ? ' label_' + a.color.toLowerCase() : '') + '" data-set="' + si + '" data-action="' + ai + '"><span class="ps_act_check">&#10003;</span><span class="ps_act_dialog' + (a.steps.some(x => x.dialog) ? ' on' : '') + '">' + (a.steps.some(x => x.dialog) ? '&#9633;' : '') + '</span><span class="ps_act_indent"></span>'
					+ (rec ? '<span class="ps_act_rec">&#9679;</span> ' : '') + app.GUI.Ps_workspace.Helper.escapeHtml(a.name) + (a.key ? '<span class="ps_act_key">' + (a.key_shift ? 'Shift+' : '') + (a.key_ctrl ? 'Ctrl+' : '') + a.key + '</span>' : '') + '</div>';
				if (asel) {
					a.steps.forEach((st, sti) => {
						//the dialog column: steps with settings can show their dialog during playback
						var dlg = st.settings ? '<span class="ps_act_dialog' + (st.dialog ? ' on' : '') + '" data-dialog="' + sti + '" title="Toggle dialog on/off">&#9633;</span>' : '<span class="ps_act_dialog"></span>';
						html += '<div class="ps_act_row ps_act_step' + (st.off ? ' off' : '') + '"><span class="ps_act_check" data-step="' + sti + '" title="Toggle item on/off">' + (st.off ? '' : '&#10003;') + '</span>' + dlg + '<span class="ps_act_indent2"></span>' + app.GUI.Ps_workspace.Helper.escapeHtml(st.name) + '</div>';
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
		el.querySelectorAll('[data-step]').forEach((c) => c.addEventListener('click', (e) => {
			e.stopPropagation();
			var a = this.current_action(), st = a && a.steps[parseInt(c.dataset.step)];
			if (!st) return;
			st.off = !st.off;
			this.save();
			this.render();
		}));
		el.querySelectorAll('[data-dialog]').forEach((c) => c.addEventListener('click', (e) => {
			e.stopPropagation();
			var a = this.current_action(), st = a && a.steps[parseInt(c.dataset.dialog)];
			if (!st) return;
			st.dialog = !st.dialog;
			this.save();
			this.render();
		}));
		el.querySelectorAll('.ps_act_set, .ps_act_action').forEach((row) => row.addEventListener('dblclick', () => {
			if (row.dataset.action != null) this.action_options();
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
