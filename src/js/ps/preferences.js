/*
 * pshot - CS6 Edit > Preferences (Ctrl+K): the CS6 panes with their controls.
 * Settings pshot can honour are live (interface color theme, transparency grid,
 * ruler units, grid spacing, history states); the others are shown greyed.
 * Stored in browser storage.
 */

import app from './../app.js';
import config from './../config.js';

const KEY = 'pshot_prefs_v1';

const DEFAULTS = {
	theme: 2,
	history_states: 20,
	transparency_size: 'Medium',
	transparency_colors: 'Light',
	ruler_units: 'Pixels',
	type_units: 'Points',
	grid_every: 50,
	grid_subdivisions: 4,
	guide_color: 'Cyan',
	guide_custom: '#4af0ff',
	guide_style: 'Lines',
	smart_color: 'Magenta',
	smart_custom: '#ff44ff',
	grid_color: 'Custom',
	grid_custom: '#888888',
	grid_style: 'Lines',
	slice_color: 'Light Blue',
	slice_custom: '#2196f3',
	slice_numbers: true,
	interpolation: 'Bicubic Automatic',
	shift_tool_switch: true,
	zoom_wheel: false,
	zoom_center: false,
	zoom_resizes: false,
	place_resize: true,
	place_smart: true,
	smart_quotes: true,
	channels_in_color: false,
	painting_cursor: 'Normal Brush Tip',
	crosshair_in_tip: false,
	crosshair_only: false,
};

//CS6 guide / grid / slice colors
const LINE_COLORS = { 'Light Blue': '#4a90e2', 'Light Red': '#ff6a6a', 'Green': '#00b000', 'Medium Blue': '#0050ff', 'Yellow': '#e8e800', 'Magenta': '#ff00ff', 'Cyan': '#00e5ff', 'Light Gray': '#c0c0c0', 'Black': '#000000', 'Custom': null };

//CS6 interface brightness: Black, Dark Gray (default), Medium Gray, Light Gray
const THEMES = {
	1: { panel: '#323232', 'panel-dark': '#262626', tabstrip: '#1f1f1f', pasteboard: '#1b1b1b', border: '#141414', bevel: '#3e3e3e', field: '#222222', 'field-border': '#121212', text: '#d6d6d6', 'text-dim': '#8a8a8a', 'text-disabled': '#646464', hover: '#3d3d3d', 'hover-strong': '#4a4a4a', 'text-strong': '#ffffff', icon: '#b8b8b8', control: '#383838', 'control-light': '#424242', well: '#161616', 'grad-top': '#444444', 'grad-bottom': '#363636', 'grad-hover-top': '#505050', 'grad-hover-bottom': '#404040', 'pressed-top': '#141414', 'pressed-bottom': '#1c1c1c' },
	2: null,
	3: { panel: '#b8b8b8', 'panel-dark': '#a8a8a8', tabstrip: '#9c9c9c', pasteboard: '#a0a0a0', border: '#8a8a8a', bevel: '#cacaca', field: '#d9d9d9', 'field-border': '#8c8c8c', text: '#141414', 'text-dim': '#3c3c3c', 'text-disabled': '#7a7a7a', hover: '#c8c8c8', 'hover-strong': '#d4d4d4', 'text-strong': '#000000', icon: '#2a2a2a', control: '#c6c6c6', 'control-light': '#cdcdcd', well: '#9a9a9a', 'grad-top': '#d2d2d2', 'grad-bottom': '#bdbdbd', 'grad-hover-top': '#dcdcdc', 'grad-hover-bottom': '#c8c8c8', 'pressed-top': '#8e8e8e', 'pressed-bottom': '#9c9c9c' },
	4: { panel: '#d6d6d6', 'panel-dark': '#c8c8c8', tabstrip: '#bcbcbc', pasteboard: '#bdbdbd', border: '#a3a3a3', bevel: '#e6e6e6', field: '#f2f2f2', 'field-border': '#a6a6a6', text: '#111111', 'text-dim': '#3a3a3a', 'text-disabled': '#8a8a8a', hover: '#e4e4e4', 'hover-strong': '#f0f0f0', 'text-strong': '#000000', icon: '#2a2a2a', control: '#e2e2e2', 'control-light': '#e8e8e8', well: '#b0b0b0', 'grad-top': '#ececec', 'grad-bottom': '#d6d6d6', 'grad-hover-top': '#f6f6f6', 'grad-hover-bottom': '#e2e2e2', 'pressed-top': '#a8a8a8', 'pressed-bottom': '#b6b6b6' },
};
const THEME_SWATCH = { 1: '#282828', 2: '#535353', 3: '#b8b8b8', 4: '#d6d6d6' };

const CHECKER = {
	'Light': ['#ffffff', '#cccccc'], 'Medium': ['#999999', '#666666'], 'Dark': ['#666666', '#333333'],
	'Red': ['#ffffff', '#ffcccc'], 'Orange': ['#ffffff', '#ffe5cc'], 'Green': ['#ffffff', '#ccffcc'], 'Blue': ['#ffffff', '#cce5ff'], 'Purple': ['#ffffff', '#e5ccff'],
};
const CHECKER_SIZE = { 'None': 0, 'Small': 4, 'Medium': 8, 'Large': 16 };

//CS6 ruler units -> miniPaint unit setting (null: not available)
const UNITS = { 'Pixels': 'pixels', 'Inches': 'inches', 'Centimeters': 'centimeters', 'Millimeters': 'millimetres', 'Points': null, 'Picas': null, 'Percent': null };

/**
 * theme -> CSS variables (pshot's and miniPaint's), null for the default
 */
function theme_vars(t) {
	if (!t) return null;
	var out = {};
	for (var k in t) out['--ps-' + k] = t[k];
	var light = t.text < '#808080';
	Object.assign(out, {
		'--background': t.panel, '--area-background-color': t.panel, '--block-background-color': t.panel, '--menu-background-color': t.panel,
		'--section-background-color': t['panel-dark'], '--header-background-color': t['panel-dark'],
		'--text-color': t.text, '--menu-text-color': t.text, '--text-color-muted': t['text-dim'],
		'--input-background-color': t.field, '--input-background-color-hover': t.hover, '--input-border-color': t['field-border'], '--input-text-color': t.text,
		'--input-group-border-color': t.border, '--border-color': t.border, '--background-color-hover': t.hover,
		'--button-background-color': light ? t.field : t.bevel, '--button-background-color-hover': t.hover,
		'--button-toggle-background-color': t['panel-dark'], '--button-toggle-background-color-hover': t.hover,
		'--scrollbar-track-color': t['panel-dark'], '--scrollbar-thumb-color': light ? '#8f8f8f' : t.bevel,
		'--menu-icons-filter': light ? 'none' : 'invert(0.88)',
	});
	return out;
}

class Ps_preferences_class {

	constructor() {
		this.values = this.load();
	}

	load() {
		try {
			var raw = localStorage.getItem(KEY);
			if (raw) return Object.assign({}, DEFAULTS, JSON.parse(raw));
		} catch (e) { /* storage blocked */ }
		return Object.assign({}, DEFAULTS);
	}

	save() {
		try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch (e) { /* storage blocked */ }
	}

	/**
	 * apply everything (startup and after OK)
	 */
	apply() {
		var v = this.values;
		var style = document.body.style;
		var vars = theme_vars(THEMES[v.theme]);
		for (var k of Object.keys(theme_vars(THEMES[1]))) {
			if (vars) style.setProperty(k, vars[k]);
			else style.removeProperty(k);
		}
		document.body.classList.toggle('ps_theme_light', v.theme >= 3);
		app.State.action_history_max = Math.max(1, Math.min(1000, parseInt(v.history_states) || 20));
		app.GUI.grid_size = [Math.max(2, parseInt(v.grid_every) || 50), Math.max(2, parseInt(v.grid_every) || 50)];
		this.apply_checker();
		config.need_render = true;
	}

	/**
	 * a color preference (menu name or its Custom color)
	 */
	color(key) {
		var v = this.values;
		return LINE_COLORS[v[key + '_color']] || v[key + '_custom'] || '#888888';
	}

	apply_checker() {
		var target = document.getElementById('canvas_minipaint_background');
		if (!target) return;
		var v = this.values, size = CHECKER_SIZE[v.transparency_size];
		if (!size) {
			target.style.background = '#ffffff';
			return;
		}
		var c = CHECKER[v.transparency_colors] || CHECKER.Light;
		target.style.background = 'repeating-conic-gradient(' + c[1] + ' 0% 25%, ' + c[0] + ' 0% 50%) 0 0 / ' + (size * 2) + 'px ' + (size * 2) + 'px';
		target.style.imageRendering = 'pixelated';
	}

	install() {
		//re-apply the checkerboard whenever miniPaint redraws the canvas background
		var gui = app.GUI;
		var original = gui.render_canvas_background.bind(gui);
		gui.render_canvas_background = (canvas_id, gap) => {
			var r = original(canvas_id, gap);
			if (canvas_id == 'canvas_minipaint') this.apply_checker();
			return r;
		};
		this.apply();
	}

	panes() {
		return [
			['General', [
				{ type: 'row', items: [{ type: 'select', label: 'Color Picker:', values: ['Adobe'], disabled: true }] },
				{ type: 'row', items: [{ type: 'select', label: 'HUD Color Picker:', values: ['Hue Strip (Small)'], disabled: true }] },
				{ type: 'row', items: [{ type: 'select', key: 'interpolation', label: 'Image Interpolation:', values: ['Nearest Neighbor (preserve hard edges)', 'Bilinear', 'Bicubic (best for smooth gradients)', 'Bicubic Smoother (best for enlargement)', 'Bicubic Sharper (best for reduction)', 'Bicubic Automatic'] }] },
				{ type: 'group', label: 'Options' },
				//the options pshot honours have keys; the others are shown as CS6 sets them
				...[['Auto-Update Open Documents'], ['Beep When Done'], ['Dynamic Color Sliders'], ['Export Clipboard'], ['Use Shift Key for Tool Switch', 'shift_tool_switch'], ['Resize Image During Place', 'place_resize'], ['Animated Zoom'], ['Zoom Resizes Windows', 'zoom_resizes'], ['Zoom with Scroll Wheel', 'zoom_wheel'], ['Zoom Clicked Point to Center', 'zoom_center'], ['Enable Flick Panning'], ['Place or Drag Raster Images as Smart Objects', 'place_smart']]
					.map(([l, key], i) => key ? { type: 'check', key: key, label: l } : { type: 'check', label: l, value: [1, 2, 3, 6, 10].includes(i), disabled: true }),
				{ type: 'group', label: 'History Log' },
				{ type: 'check', label: 'History Log', value: false, disabled: true },
			]],
			['Interface', [
				{ type: 'group', label: 'Appearance' },
				{ type: 'theme', key: 'theme', label: 'Color Theme:' },
				{ type: 'row', items: [{ type: 'select', label: 'Standard Screen Mode:', values: ['Default'], disabled: true }, { type: 'select', label: 'Border:', values: ['Drop Shadow'], disabled: true }] },
				{ type: 'group', label: 'Options' },
				...[['Auto-Collapse Iconic Panels'], ['Auto-Show Hidden Panels'], ['Open Documents as Tabs'], ['Enable Floating Document Window Docking'], ['Large Tabs'], ['Show Transformation Values'], ['Show Tool Tips'], ['Show Channels in Color', 'channels_in_color'], ['Show Menu Colors']]
					.map(([l, key], i) => key ? { type: 'check', key: key, label: l } : { type: 'check', label: l, value: [1, 2, 3, 5, 6, 8].includes(i), disabled: true }),
				{ type: 'group', label: 'Text' },
				{ type: 'row', items: [{ type: 'select', label: 'UI Language:', values: ['English'], disabled: true }, { type: 'select', label: 'UI Font Size:', values: ['Small'], disabled: true }] },
			]],
			['File Handling', [
				{ type: 'group', label: 'File Saving Options' },
				{ type: 'row', items: [{ type: 'select', label: 'Image Previews:', values: ['Always Save'], disabled: true }, { type: 'select', label: 'File Extension:', values: ['Use Lower Case'], disabled: true }] },
				{ type: 'check', label: 'Save As to Original Folder', value: true, disabled: true },
				{ type: 'check', label: 'Save in Background', value: true, disabled: true },
				{ type: 'check', label: 'Automatically Save Recovery Information Every:', value: true, disabled: true },
				{ type: 'group', label: 'File Compatibility' },
				{ type: 'check', label: 'Ignore EXIF Profile Tag', value: false, disabled: true },
				{ type: 'check', label: 'Ask Before Saving Layered TIFF Files', value: true, disabled: true },
				{ type: 'row', items: [{ type: 'select', label: 'Maximize PSD and PSB File Compatibility:', values: ['Always'], disabled: true }] },
				{ type: 'row', items: [{ type: 'num', label: 'Recent File List Contains:', value: 10, unit: 'files', disabled: true }] },
			]],
			['Performance', [
				{ type: 'group', label: 'Memory Usage' },
				{ type: 'row', items: [{ type: 'readout', label: 'Available RAM:', text: navigator.deviceMemory ? navigator.deviceMemory * 1024 + ' MB' : 'n/a' }] },
				{ type: 'group', label: 'History & Cache' },
				{ type: 'row', items: [{ type: 'num', key: 'history_states', label: 'History States:', min: 1, max: 1000 }] },
				{ type: 'row', items: [{ type: 'num', label: 'Cache Levels:', value: 4, disabled: true }, { type: 'num', label: 'Cache Tile Size:', value: 128, unit: 'K', disabled: true }] },
				{ type: 'group', label: 'Graphics Processor Settings' },
				{ type: 'check', label: 'Use Graphics Processor', value: true, disabled: true },
			]],
			['Cursors', [
				{ type: 'group', label: 'Painting Cursors' },
				{ type: 'row', items: [{ type: 'select', key: 'painting_cursor', label: '', values: ['Standard', 'Precise', 'Normal Brush Tip', 'Full Size Brush Tip'] }] },
				{ type: 'check', key: 'crosshair_in_tip', label: 'Show Crosshair in Brush Tip' },
				{ type: 'check', key: 'crosshair_only', label: 'Show Only Crosshair While Painting' },
				{ type: 'group', label: 'Other Cursors' },
				{ type: 'row', items: [{ type: 'select', label: '', values: ['Standard'], disabled: true }] },
			]],
			['Transparency & Gamut', [
				{ type: 'group', label: 'Transparency Settings' },
				{ type: 'row', items: [{ type: 'select', key: 'transparency_size', label: 'Grid Size:', values: Object.keys(CHECKER_SIZE) }] },
				{ type: 'row', items: [{ type: 'select', key: 'transparency_colors', label: 'Grid Colors:', values: Object.keys(CHECKER) }, { type: 'checker' }] },
				{ type: 'check', label: 'Use video alpha (requires hardware support)', value: false, disabled: true },
				{ type: 'group', label: 'Gamut Warning' },
				{ type: 'row', items: [{ type: 'readout', label: 'Color:', text: '' }, { type: 'num', label: 'Opacity:', value: 100, unit: '%', disabled: true }] },
			]],
			['Units & Rulers', [
				{ type: 'group', label: 'Units' },
				{ type: 'row', items: [{ type: 'select', key: 'ruler_units', label: 'Rulers:', values: Object.keys(UNITS), disabled_values: Object.keys(UNITS).filter(u => !UNITS[u]) }] },
				{ type: 'row', items: [{ type: 'select', label: 'Type:', values: ['Points'], disabled: true }] },
				{ type: 'group', label: 'Column Size' },
				{ type: 'row', items: [{ type: 'num', label: 'Width:', value: 180, unit: 'Points', disabled: true }, { type: 'num', label: 'Gutter:', value: 12, unit: 'Points', disabled: true }] },
				{ type: 'group', label: 'New Document Preset Resolutions' },
				{ type: 'row', items: [{ type: 'num', label: 'Print Resolution:', value: 300, unit: 'Pixels/Inch', disabled: true }, { type: 'num', label: 'Screen Resolution:', value: 72, unit: 'Pixels/Inch', disabled: true }] },
			]],
			['Guides, Grid & Slices', [
				{ type: 'group', label: 'Guides' },
				{ type: 'row', items: [{ type: 'select', key: 'guide_color', label: 'Color:', values: Object.keys(LINE_COLORS) }, { type: 'color', key: 'guide_custom', of: 'guide_color' }, { type: 'select', key: 'guide_style', label: 'Style:', values: ['Lines', 'Dashed Lines'] }] },
				{ type: 'group', label: 'Smart Guides' },
				{ type: 'row', items: [{ type: 'select', key: 'smart_color', label: 'Color:', values: Object.keys(LINE_COLORS) }, { type: 'color', key: 'smart_custom', of: 'smart_color' }] },
				{ type: 'group', label: 'Grid' },
				{ type: 'row', items: [{ type: 'select', key: 'grid_color', label: 'Color:', values: Object.keys(LINE_COLORS) }, { type: 'color', key: 'grid_custom', of: 'grid_color' }, { type: 'num', key: 'grid_every', label: 'Gridline Every:', min: 2, max: 1000, unit: 'Pixels' }] },
				{ type: 'row', items: [{ type: 'select', key: 'grid_style', label: 'Style:', values: ['Lines', 'Dashed Lines', 'Dots'] }, { type: 'num', key: 'grid_subdivisions', label: 'Subdivisions:', min: 1, max: 100 }] },
				{ type: 'group', label: 'Slices' },
				{ type: 'row', items: [{ type: 'select', key: 'slice_color', label: 'Line Color:', values: Object.keys(LINE_COLORS) }, { type: 'color', key: 'slice_custom', of: 'slice_color' }] },
				{ type: 'check', key: 'slice_numbers', label: 'Show Slice Numbers' },
			]],
			['Plug-Ins', [
				{ type: 'check', label: 'Additional Plug-Ins Folder', value: false, disabled: true },
				{ type: 'group', label: 'Extension Panels' },
				{ type: 'check', label: 'Allow Extensions to Connect to the Internet', value: true, disabled: true },
				{ type: 'check', label: 'Load Extension Panels', value: true, disabled: true },
			]],
			['Type', [
				{ type: 'group', label: 'Type Options' },
				{ type: 'check', key: 'smart_quotes', label: 'Use Smart Quotes' },
				{ type: 'check', label: 'Enable Missing Glyph Protection', value: true, disabled: true },
				{ type: 'check', label: 'Show Font Names in English', value: true, disabled: true },
				{ type: 'row', items: [{ type: 'select', label: 'Choose Text Engine Options:', values: ['East Asian'], disabled: true }] },
			]],
			['3D', [
				{ type: 'readout', label: '3D features are not available in pshot.' },
			]],
		];
	}

	open(pane) {
		this.close();
		this.draft = Object.assign({}, this.values);
		var settings = app.GUI.modules['tools/settings'];
		var units = settings ? settings.get_setting('default_units') : 'pixels';
		this.draft.ruler_units = Object.keys(UNITS).find(u => UNITS[u] == units) || 'Pixels';
		var panes = this.panes();
		var index = Math.max(0, panes.findIndex(p => p[0] == pane));
		var el = document.createElement('div');
		el.className = 'popup ps_prefs';
		el.style.display = 'block';
		el.innerHTML = '<h2>Preferences</h2><div class="ps_prefs_body"><div class="ps_prefs_list">'
			+ panes.map((p, i) => '<div class="ps_prefs_item" data-pane="' + i + '">' + p[0] + '</div>').join('')
			+ '</div><div class="ps_prefs_pane"></div><div class="ps_prefs_buttons">'
			+ '<button type="button" class="button" data-b="ok">OK</button><button type="button" class="button" data-b="cancel">Cancel</button>'
			+ '<button type="button" class="button" data-b="prev">Prev</button><button type="button" class="button" data-b="next">Next</button></div></div>';
		document.getElementById('popups').appendChild(el);
		this.el = el;
		var show = (i) => {
			index = (i + panes.length) % panes.length;
			el.querySelectorAll('.ps_prefs_item').forEach(it => it.classList.toggle('active', parseInt(it.dataset.pane) == index));
			this.render_pane(el.querySelector('.ps_prefs_pane'), panes[index]);
		};
		el.querySelectorAll('.ps_prefs_item').forEach(it => it.addEventListener('click', () => show(parseInt(it.dataset.pane))));
		el.querySelector('[data-b="ok"]').addEventListener('click', () => this.ok());
		el.querySelector('[data-b="cancel"]').addEventListener('click', () => this.close());
		el.querySelector('[data-b="prev"]').addEventListener('click', () => show(index - 1));
		el.querySelector('[data-b="next"]').addEventListener('click', () => show(index + 1));
		this.keys = (e) => {
			if (!this.el) return;
			if (e.key == 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.close(); }
			else if (e.key == 'Enter' && e.target.tagName != 'SELECT') { e.preventDefault(); e.stopImmediatePropagation(); this.ok(); }
			else e.stopPropagation();
		};
		window.addEventListener('keydown', this.keys, true);
		show(index);
	}

	render_pane(root, pane) {
		var esc = app.GUI.Ps_workspace.Helper.escapeHtml;
		var d = this.draft;
		var control = (c) => {
			var dis = c.disabled ? ' disabled' : '';
			var label = c.label ? '<span class="ps_prefs_label">' + esc(c.label) + '</span>' : '';
			if (c.type == 'select') {
				var cur = c.key ? d[c.key] : c.values[0];
				return '<label class="ps_prefs_field' + (c.disabled ? ' disabled' : '') + '">' + label + '<select' + (c.key ? ' data-key="' + c.key + '"' : '') + dis + '>'
					+ c.values.map(v => '<option' + (v == cur ? ' selected' : '') + ((c.disabled_values || []).includes(v) ? ' disabled' : '') + '>' + esc(v) + '</option>').join('') + '</select></label>';
			}
			if (c.type == 'num') {
				var val = c.key ? d[c.key] : c.value;
				return '<label class="ps_prefs_field' + (c.disabled ? ' disabled' : '') + '">' + label + '<input type="number"' + (c.key ? ' data-key="' + c.key + '"' : '') + ' value="' + val + '"'
					+ (c.min != null ? ' min="' + c.min + '"' : '') + (c.max != null ? ' max="' + c.max + '"' : '') + dis + '>' + (c.unit ? '<span class="ps_prefs_unit">' + esc(c.unit) + '</span>' : '') + '</label>';
			}
			if (c.type == 'readout') return '<span class="ps_prefs_field">' + label + '<span>' + esc(c.text || '') + '</span></span>';
			//Custom...: the color well next to a color menu
			if (c.type == 'color') return '<input type="color" class="ps_prefs_color" data-key="' + c.key + '" data-of="' + c.of + '" value="' + (d[c.key] || '#000000') + '"' + (d[c.of] == 'Custom' ? '' : ' style="visibility:hidden"') + '>';
			if (c.type == 'checker') return '<span class="ps_prefs_checker"></span>';
			return '';
		};
		var html = '<div class="ps_prefs_title">' + esc(pane[0]) + '</div>';
		for (var c of pane[1]) {
			if (c.type == 'group') html += '<div class="ps_prefs_group">' + esc(c.label) + '</div>';
			else if (c.type == 'check') html += '<label class="ps_adj_check' + (c.disabled ? ' disabled' : '') + '"><input type="checkbox"' + (c.key ? ' data-key="' + c.key + '"' : '') + ((c.key ? d[c.key] : c.value) ? ' checked' : '') + (c.disabled ? ' disabled' : '') + '> ' + esc(c.label) + '</label>';
			else if (c.type == 'row') html += '<div class="ps_prefs_row">' + c.items.map(control).join('') + '</div>';
			else if (c.type == 'theme') html += '<div class="ps_prefs_row"><span class="ps_prefs_label">' + esc(c.label) + '</span>'
				+ [1, 2, 3, 4].map(t => '<button type="button" class="ps_prefs_theme' + (d.theme == t ? ' active' : '') + '" data-theme="' + t + '" style="background:' + THEME_SWATCH[t] + '" title="Color theme ' + t + '"></button>').join('') + '</div>';
			else html += control(c);
		}
		root.innerHTML = html;
		root.querySelectorAll('[data-theme]').forEach(b => b.addEventListener('click', () => {
			d.theme = parseInt(b.dataset.theme);
			root.querySelectorAll('[data-theme]').forEach(x => x.classList.toggle('active', x === b));
			//CS6 previews the theme immediately
			var saved = this.values;
			this.values = d;
			this.apply();
			this.values = saved;
		}));
		root.querySelectorAll('[data-key]').forEach((input) => input.addEventListener('change', () => {
			var k = input.dataset.key;
			d[k] = input.type == 'number' ? parseFloat(input.value) : (input.type == 'checkbox' ? input.checked : input.value);
			root.querySelectorAll('.ps_prefs_color[data-of="' + k + '"]').forEach(w => { w.style.visibility = d[k] == 'Custom' ? '' : 'hidden'; });
			this.draw_checker(root);
		}));
		this.draw_checker(root);
	}

	draw_checker(root) {
		var sw = root.querySelector('.ps_prefs_checker');
		if (!sw) return;
		var c = CHECKER[this.draft.transparency_colors] || CHECKER.Light, size = CHECKER_SIZE[this.draft.transparency_size] || 0;
		sw.style.background = size ? 'repeating-conic-gradient(' + c[1] + ' 0% 25%, ' + c[0] + ' 0% 50%) 0 0 / ' + (size * 2) + 'px ' + (size * 2) + 'px' : '#fff';
	}

	ok() {
		var d = this.draft;
		this.values = d;
		this.save();
		var settings = app.GUI.modules['tools/settings'];
		if (settings && UNITS[d.ruler_units]) {
			settings.save_setting('default_units', UNITS[d.ruler_units]);
			settings.save_setting('default_units_short', settings.default_units_config[UNITS[d.ruler_units]]);
			app.GUI.GUI_information.update_units();
		}
		this.close(true);
		this.apply();
	}

	close(keep) {
		if (this.keys) window.removeEventListener('keydown', this.keys, true);
		this.keys = null;
		if (this.el) this.el.remove();
		this.el = null;
		//Cancel undoes a previewed theme
		if (!keep && this.draft && this.draft.theme != this.values.theme) this.apply();
		this.draft = null;
	}
}

export default Ps_preferences_class;
