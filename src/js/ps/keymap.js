/*
 * pshot - Photoshop CS6 keyboard shortcuts.
 *
 * One capture-phase listener on window runs before miniPaint's per-module
 * keydown handlers. Menu shortcuts come from config-menu.js; tool letters from
 * tools-def.js. Keys pshot doesn't use are swallowed so miniPaint's old
 * single-letter shortcuts (N, D, S, G, ...) can't fire.
 */

import app from './../app.js';
import config from './../config.js';
import { nudge_selected_pixels } from './move-selection.js';
import menuDefinition from './../config-menu.js';
import { run_target } from './adjustments-def.js';

// keys that still go to miniPaint's own handlers (tools, dialogs, text editing)
const PASSTHROUGH = ['Escape', 'Enter', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
	'Shift', 'Control', 'Alt', 'Meta', 'CapsLock'];
// combos left to the browser / miniPaint because they need native events (clipboard)
const NATIVE = ['Ctrl+V'];

class Ps_keymap_class {

	constructor(workspace) {
		this.workspace = workspace;
		this.map = {};
	}

	/**
	 * normalized combo string: Ctrl+Alt+Shift+KEY
	 */
	normalize(ctrl, alt, shift, key) {
		var parts = [];
		if (ctrl) parts.push('Ctrl');
		if (alt) parts.push('Alt');
		if (shift) parts.push('Shift');
		parts.push(key.length == 1 ? key.toUpperCase() : key);
		return parts.join('+');
	}

	parse_shortcut(text) {
		var key = text;
		var mods = '';
		//"Ctrl++" (zoom in) ends with a literal plus
		var match = text.match(/^((?:(?:Ctrl|Alt|Shift)\+)*)(.+)$/);
		if (match) {
			mods = match[1];
			key = match[2];
		}
		return this.normalize(mods.includes('Ctrl'), mods.includes('Alt'), mods.includes('Shift'), key);
	}

	collect(items) {
		for (var item of items) {
			if (item.children) {
				this.collect(item.children);
			}
			else if (item.shortcut && item.target && !NATIVE.includes(item.shortcut)) {
				var combo = this.parse_shortcut(item.shortcut);
				if (!(combo in this.map)) {
					this.map[combo] = {target: item.target, parameter: item.parameter};
				}
			}
		}
	}

	install() {
		this.build_map();
		window.addEventListener('keydown', (event) => this.on_keydown(event), true);
		window.addEventListener('keyup', (event) => this.on_keyup(event), true);
	}

	/**
	 * (re)build the combo map from the menu definitions (after Keyboard Shortcuts edits too)
	 */
	build_map() {
		this.map = {};
		this.collect(menuDefinition);
		//Ctrl+= is the unshifted Ctrl++ on most keyboards
		this.map['Ctrl+='] = this.map['Ctrl++'];
		this.map['Ctrl+Shift+='] = this.map['Ctrl++'];
		this.map['Alt+Ctrl+Backspace'] = null;
		//CS6 shortcuts without a menu item
		this.map[this.parse_shortcut('Alt+Shift+Ctrl+E')] = { target: 'ps/commands.stamp_visible' };
		this.map[this.parse_shortcut('Alt+Shift+Ctrl+N')] = { target: 'ps/commands.new_layer_silent' };
		this.map[this.parse_shortcut('Alt+]')] = { target: 'ps/commands.select_layer_step', parameter: 1 };
		this.map[this.parse_shortcut('Alt+[')] = { target: 'ps/commands.select_layer_step', parameter: -1 };
	}

	is_typing(target) {
		if (!target) return false;
		var tag = target.tagName;
		return tag == 'INPUT' || tag == 'TEXTAREA' || tag == 'SELECT' || target.isContentEditable
			|| target.closest('.ui_color_picker_gradient, .ui_number_input, .ui_range, .ui_swatches') != null;
	}

	key_name(event) {
		//use the physical key for letters/digits so Shift/Alt don't change it
		var code = event.code || '';
		if (code.indexOf('Key') === 0) return code.substr(3);
		if (code.indexOf('Digit') === 0) return code.substr(5);
		var special = {
			BracketLeft: '[', BracketRight: ']', Comma: ',', Semicolon: ';', Quote: "'", Slash: '/',
			Minus: '-', Equal: '=', NumpadAdd: '+', NumpadSubtract: '-', Backslash: '\\', Period: '.',
		};
		if (special[code]) return special[code];
		return event.key;
	}

	on_keydown(event) {
		if (this.is_typing(event.target)) {
			return;
		}
		//dialog open: only Enter/Escape etc. reach it
		if (document.querySelector('#popups .popup')) {
			if (!PASSTHROUGH.includes(event.key)) {
				event.stopPropagation();
			}
			return;
		}
		//menu bar keyboard navigation
		if (event.target.closest && event.target.closest('#main_menu')) {
			return;
		}
		//text tool editing happens in a textarea (covered by is_typing)

		var key = this.key_name(event);
		var ctrl = event.ctrlKey || event.metaKey;
		var combo = this.normalize(ctrl, event.altKey, event.shiftKey, key);

		//Crop tool: Enter commits, Esc cancels (CS6)
		if (config.TOOL.name == 'crop' && (event.key == 'Enter' || event.key == 'Escape')) {
			var crop = app.GUI.GUI_tools.tools_modules.crop.object;
			if (event.key == 'Enter') {
				crop.on_params_update();
			}
			else {
				crop.selection = { x: null, y: null, width: null, height: null };
				config.need_render = true;
			}
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		//Ctrl+2 composite, Ctrl+3.. the color channels, then the alpha channels (CS6)
		if (ctrl && !event.altKey && !event.shiftKey && /^[2-9]$/.test(key)) {
			var n = parseInt(key), CV = this.workspace.Channel_view;
			var done = CV.by_number(n);
			if (!done) {
				var ai = n - 3 - CV.keys().length;
				if (ai >= 0 && config.ps_alpha && config.ps_alpha[ai]) { config.ps_alpha_active = ai; this.workspace.render_channels(true); done = true; }
			}
			if (done !== false) {
				event.preventDefault();
				event.stopPropagation();
				return;
			}
		}

		//arrow keys with a selection: the Move tool nudges the selected pixels, the
		//selection tools nudge the outline (1 px, Shift 10 px)
		var arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
		if (arrows[event.key] && !ctrl && !event.altKey && this.workspace.Selection.has()
			&& (config.TOOL.name == 'select' || config.TOOL.name == 'ps_select') && !this.workspace.Transform.active()) {
			var step = event.shiftKey ? 10 : 1;
			var d = arrows[event.key];
			if (config.TOOL.name == 'select') {
				nudge_selected_pixels(d[0] * step, d[1] * step);
			}
			else {
				var Sel = this.workspace.Selection;
				var moved = document.createElement('canvas');
				moved.width = Sel.mask.width;
				moved.height = Sel.mask.height;
				moved.getContext('2d').drawImage(Sel.mask, d[0] * step, d[1] * step);
				Sel.commit(moved, 'Nudge Selection');
			}
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		//Ctrl+Enter: load the active path as a selection (CS6)
		if (ctrl && event.key == 'Enter' && this.workspace.Paths.active()) {
			this.workspace.Paths.make_selection(event.shiftKey ? 'add' : (event.altKey ? 'subtract' : 'new'));
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		//Delete / Backspace with a path tool: delete the selected anchor / subpath
		if ((event.key == 'Delete' || event.key == 'Backspace') && (config.TOOL.name == 'ps_path_select' || config.TOOL.name == 'ps_pen') && this.workspace.Paths.selected) {
			this.workspace.Paths.delete_selected();
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		//Delete / Backspace clear the selected pixels (CS6)
		if ((event.key == 'Delete' || (event.key == 'Backspace' && !ctrl && !event.altKey)) && this.workspace.Selection.has()) {
			run_target('ps/commands.clear');
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		//Ctrl+V normally goes to the browser's paste event; when the last copy could
		//only reach pshot's internal clipboard, paste from there instead
		if (combo == 'Ctrl+V' && app.GUI.modules['ps/commands'].clipboard_internal_only) {
			run_target('ps/commands.paste');
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		if (NATIVE.includes(combo) || PASSTHROUGH.includes(event.key)) {
			return;
		}

		//Action Options function keys (F2..F12, with Shift / Ctrl)
		if (/^F([2-9]|1[0-2])$/.test(event.key) && this.workspace.Actions.play_by_key((event.shiftKey ? 'Shift+' : '') + (ctrl ? 'Ctrl+' : '') + event.key)) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		//\\: the layer mask as a red overlay (CS6)
		if (event.key == '\\' && !ctrl && !event.altKey && this.workspace.Mask.toggle_overlay()) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		var handled = this.handle(combo, key, ctrl, event);
		//block everything else from miniPaint's legacy single-key handlers
		event.stopPropagation();
		if (handled || ctrl || event.altKey || key.length == 1 || key == 'Tab' || key == 'Backspace') {
			event.preventDefault();
		}
	}

	on_keyup(event) {
		if (event.code == 'Space' && config.space_hand) {
			config.space_hand = false;
			document.getElementById('main_wrapper').style.cursor = '';
		}
	}

	handle(combo, key, ctrl, event) {
		var ws = this.workspace;

		if (combo in this.map) {
			var entry = this.map[combo];
			if (entry) {
				run_target(entry.target, entry.parameter);
			}
			return true;
		}

		//temporary Hand tool while Space is held
		if (key == ' ' || event.code == 'Space') {
			if (!event.repeat) {
				config.space_hand = true;
				document.getElementById('main_wrapper').style.cursor = 'grab';
			}
			return true;
		}

		if (!ctrl && !event.altKey) {
			if (/^[A-Z]$/.test(key)) {
				switch (key) {
					case 'D': ws.default_colors(); return true;
					case 'X': ws.switch_colors(); return true;
					case 'F': ws.cycle_screen_mode(event.shiftKey); return true;
					case 'Q': ws.Selection.toggle_quick_mask(); return true;
				}
				//Preferences > Use Shift Key for Tool Switch off: the letter itself cycles the group
				return ws.select_by_key(key, event.shiftKey || (ws.Preferences && ws.Preferences.values.shift_tool_switch === false));
			}
			if (key == 'Tab') {
				ws.toggle_panels(event.shiftKey);
				return true;
			}
			if (key == '[' || key == ']') {
				return event.shiftKey ? this.change_brush_hardness(key == ']' ? 1 : -1) : this.change_brush_size(key == ']' ? 1 : -1);
			}
			if (/^[0-9]$/.test(key)) {
				return this.set_tool_opacity(key);
			}
		}

		//Alt+Backspace: fill with foreground, Ctrl+Backspace: fill with background (CS6)
		if (key == 'Backspace') {
			var commands = app.GUI.modules['ps/commands'];
			if (event.altKey && !ctrl) {
				commands.fill_with(config.COLOR, 1, 'Fill');
				return true;
			}
			if (ctrl && !event.altKey) {
				commands.fill_with(config.BG_COLOR, 1, 'Fill');
				return true;
			}
		}
		return false;
	}

	/**
	 * [ and ] change the brush size like CS6 (steps grow with size)
	 */
	change_brush_size(direction) {
		var attrs = config.TOOL.attributes;
		var key = 'size' in attrs ? 'size' : null;
		if (key === null) {
			return false;
		}
		var value = typeof attrs[key] == 'object' ? attrs[key].value : attrs[key];
		var step = value < 10 ? 1 : value < 50 ? 5 : value < 100 ? 10 : 25;
		value = Math.max(1, Math.min(999, value + direction * step));
		if (typeof attrs[key] == 'object') {
			attrs[key].value = value;
		}
		else {
			attrs[key] = value;
		}
		app.GUI.GUI_tools.show_action_attributes();
		return true;
	}

	/**
	 * Shift+[ / Shift+]: brush hardness in 25% steps
	 */
	change_brush_hardness(direction) {
		var attrs = config.TOOL.attributes;
		if (!('hardness' in attrs)) {
			return false;
		}
		attrs.hardness = Math.max(0, Math.min(100, Math.round((attrs.hardness + direction * 25) / 25) * 25));
		app.GUI.GUI_tools.show_action_attributes();
		return true;
	}

	/**
	 * number keys set tool opacity/strength: 1 = 10% ... 0 = 100%
	 */
	set_tool_opacity(digit) {
		var attrs = config.TOOL.attributes;
		var key = ['opacity', 'power', 'strength'].find(k => k in attrs);
		if (!key) {
			return false;
		}
		var value = digit == '0' ? 100 : parseInt(digit) * 10;
		if (typeof attrs[key] == 'object') {
			attrs[key].value = value;
		}
		else {
			attrs[key] = value;
		}
		app.GUI.GUI_tools.show_action_attributes();
		return true;
	}
}

export default Ps_keymap_class;
