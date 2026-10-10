/*
 * pshot - the CS6 panel menus (the ≡ button of each panel) for the panels
 * whose menus are not built by their own module: Channels, Color, Swatches,
 * Histogram, Navigator, Styles, Character, Paragraph, Layer Comps, Brush
 * Presets, Tool Presets, Notes, Character / Paragraph Styles, Adjustments.
 * Items CS6 has but pshot cannot do yet are listed greyed.
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';
import { type_get, type_set } from './type-panels.js';

function cmd(name, param) {
	return () => app.GUI.modules['ps/commands'][name](param);
}

function copy_text(text, what) {
	var done = () => app.GUI.Ps_workspace.status_message(what + ' copied: ' + text);
	if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
	else done();
}

/**
 * a footer button of a panel, clicked (the panel already does the work)
 */
function footer(panel_id, selector) {
	return () => {
		var b = document.querySelector('#' + panel_id + ' ' + selector);
		if (b) b.click();
	};
}

function panel_menu(ws, panel) {
	var A = ws.Alpha, alpha = config.ps_alpha || [], ai = config.ps_alpha_active;
	var has_alpha = ai != null && ai >= 0 && !!alpha[ai];
	switch (panel) {
		case 'channels': return [
			{ name: 'New Channel...', action: () => A.new_channel() },
			{ name: 'Duplicate Channel...', action: () => A.duplicate_channel(has_alpha ? ai : (ws.Channel_view.state().target.length == 1 ? ['r', 'g', 'b'][ws.Channel_view.state().target[0]] : 'rgb')) },
			{ name: 'Delete Channel', action: has_alpha ? () => A.delete_channel() : null },
			{ divider: true },
			{ name: 'New Spot Channel...' },
			{ name: 'Merge Spot Channel' },
			{ divider: true },
			{ name: 'Channel Options...', action: has_alpha ? () => A.channel_options(ai) : null },
			{ divider: true },
			{ name: 'Split Channels', action: () => split_channels(ws) },
			{ name: 'Merge Channels...' },
			{ divider: true },
			{ name: 'Panel Options...' },
		];
		case 'color': {
			var hex = (config.COLOR || '#000000').toLowerCase();
			var o = ws.ramp_options();
			var ramp = (v, name) => ({ name: name, checked: o.mode == v, action: () => ws.set_ramp({ mode: v }) });
			return [
				{ name: 'Grayscale Slider' }, { name: 'RGB Sliders', checked: true, action: () => {} }, { name: 'HSB Sliders' }, { name: 'CMYK Sliders' }, { name: 'Lab Sliders' }, { name: 'Web Color Sliders' },
				{ divider: true },
				{ name: 'Copy Color as HTML', action: () => copy_text('color="' + hex + '"', 'Color') },
				{ name: "Copy Color's Hex Code", action: () => copy_text(hex.substr(1), 'Hex code') },
				{ divider: true },
				ramp('rgb', 'RGB Spectrum'), ramp('cmyk', 'CMYK Spectrum'), ramp('gray', 'Grayscale Ramp'), ramp('current', 'Current Colors'),
				{ divider: true },
				{ name: 'Make Ramp Web Safe', checked: o.web_safe, action: () => ws.set_ramp({ web_safe: !o.web_safe }) },
			];
		}
		case 'swatches': return [
			{ name: 'New Swatch...', action: () => ws.new_swatch() },
			{ divider: true },
			{ name: 'Small Thumbnail', checked: true, action: () => {} },
			{ name: 'Small List' },
			{ divider: true },
			{ name: 'Preset Manager...', action: cmd('preset_manager') },
			{ divider: true },
			{ name: 'Reset Swatches...', action: () => { if (window.confirm('Replace current color swatches with the default colors?')) reset_swatches(ws); } },
			{ name: 'Load Swatches...', action: () => load_swatches(ws, false) },
			{ name: 'Save Swatches...', action: () => save_swatches(ws) },
			{ name: 'Replace Swatches...', action: () => load_swatches(ws, true) },
		];
		case 'histogram': return ws.histogram_menu_items();
		case 'navigator': return [{ name: 'Panel Options...', action: () => navigator_options(ws) }];
		case 'styles': return ws.Styles_panel.menu_items();
		case 'character': {
			var toggle = (key, label) => ({ name: label, checked: !!type_get(key), action: () => type_set(key, !type_get(key)) });
			var opt = (key, v, label) => ({ name: label, checked: type_get(key) == v, action: () => type_set(key, type_get(key) == v ? '' : v) });
			var ot = (key, label) => ({ name: label, checked: app.GUI.modules['ps/commands'].opentype_is(key), action: cmd('opentype', key) });
			return [
				toggle('bold', 'Faux Bold'), toggle('italic', 'Faux Italic'), opt('caps', 'all', 'All Caps'), opt('caps', 'small', 'Small Caps'),
				opt('position', 'super', 'Superscript'), opt('position', 'sub', 'Subscript'), toggle('underline', 'Underline'), toggle('strikethrough', 'Strikethrough'),
				{ divider: true },
				ot('liga', 'Standard Ligatures'), ot('ordn', 'Ordinals'), ot('frac', 'Fractions'),
				{ divider: true },
				{ name: 'Fractional Widths', checked: true, action: () => {} },
				{ name: 'No Break' },
				{ divider: true },
				{ name: 'Reset Character', action: () => { ['bold', 'italic', 'underline', 'strikethrough'].forEach(k => type_set(k, false)); type_set('caps', ''); type_set('position', ''); } },
			];
		}
		case 'paragraph': return [
			{ name: 'Roman Hanging Punctuation' },
			{ divider: true },
			{ name: 'Justification...' },
			{ name: 'Hyphenation...' },
			{ divider: true },
			{ name: 'Adobe Single-line Composer' },
			{ name: 'Adobe Every-line Composer', checked: true, action: () => {} },
			{ divider: true },
			{ name: 'Reset Paragraph', action: () => reset_paragraph() },
		];
		case 'comps': {
			var active = config.ps_comp_active != null && config.ps_comp_active >= 0;
			return [
				{ name: 'New Layer Comp...', action: footer('ps_layer_comps', '[data-cmd=new]') },
				{ name: 'Duplicate Layer Comp', action: active ? () => duplicate_comp(ws) : null },
				{ name: 'Delete Layer Comp', action: active ? footer('ps_layer_comps', '[data-cmd=delete]') : null },
				{ name: 'Update Layer Comp', action: active ? footer('ps_layer_comps', '[data-cmd=update]') : null },
				{ name: 'Apply Layer Comp', action: active ? () => ws.Comps.apply(config.ps_comp_active) : null },
				{ name: 'Next Layer Comp', action: footer('ps_layer_comps', '[data-cmd=next]') },
				{ name: 'Previous Layer Comp', action: footer('ps_layer_comps', '[data-cmd=prev]') },
				{ divider: true },
				{ name: 'Export Layer Comps...', action: cmd('comps_to_files') },
			];
		}
		case 'brush_presets': return [
			{ name: 'New Brush Preset...', action: () => ws.Brush_presets.new_preset() },
			{ divider: true },
			{ name: 'Preset Manager...', action: cmd('preset_manager') },
		];
		case 'tool_presets': return [
			{ name: 'New Tool Preset...', action: () => ws.Tool_presets.create() },
			{ divider: true },
			{ name: 'Reset Tool', action: () => ws.Tool_presets.reset_tool() },
			{ name: 'Reset All Tools', action: () => ws.Tool_presets.reset_all() },
			{ divider: true },
			{ name: 'Preset Manager...', action: cmd('preset_manager') },
		];
		case 'notes': return [
			{ name: 'Delete All Notes', action: (config.ps_notes || []).length ? () => ws.Notes.clear_all() : null },
			{ name: 'Export Notes...', action: (config.ps_notes || []).length ? () => ws.Notes.export_text() : null },
		];
		case 'char_styles':
		case 'para_styles': {
			var kind = panel == 'para_styles' ? 'para' : 'char', T = ws.Type_styles;
			var cur = T.current && T.current.kind == kind ? T.current.index : -1;
			var label = kind == 'para' ? 'Paragraph' : 'Character';
			return [
				{ name: 'New ' + label + ' Style...', action: () => T.create(kind) },
				{ name: 'Duplicate Style', action: cur >= 0 ? () => duplicate_type_style(T, kind, cur) : null },
				{ name: 'Delete Style', action: cur >= 0 ? () => T.remove(kind, cur) : null },
				{ divider: true },
				{ name: 'Redefine Style', action: cur >= 0 ? () => T.redefine(kind, cur) : null },
				{ name: 'Style Options...', action: cur >= 0 ? () => T.options(kind, cur) : null },
				{ divider: true },
				{ name: 'Save Default Type Styles', action: cmd('save_default_type_styles') },
				{ name: 'Load Default Type Styles', action: cmd('load_default_type_styles') },
			];
		}
		case 'adjustments': return [{ name: 'Add Mask by Default', checked: true }];
	}
	return null;
}

/**
 * Channels > Split Channels: each color channel as its own grayscale document
 */
async function split_channels(ws) {
	if (config.ps_mode && config.ps_mode != 'RGB') {
		app.GUI.Ps_workspace.status_message('Split Channels needs an RGB document.');
		return;
	}
	var W = config.WIDTH, H = config.HEIGHT, base = ws.document_name().replace(/\.[^.]+$/, '');
	var c = document.createElement('canvas');
	c.width = W;
	c.height = H;
	var ctx = c.getContext('2d', { willReadFrequently: true });
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, W, H);
	app.Layers.convert_layers_to_canvas(ctx, null, false);
	var d = ctx.getImageData(0, 0, W, H).data;
	var ppi = ws.Documents.current().ppi, source = ws.Documents.active;
	for (var [ci, suffix] of [[0, 'R'], [1, 'G'], [2, 'B']]) {
		var out = document.createElement('canvas');
		out.width = W;
		out.height = H;
		var o = out.getContext('2d'), img = o.createImageData(W, H);
		for (var i = 0; i < d.length; i += 4) { img.data[i] = img.data[i + 1] = img.data[i + 2] = d[i + ci]; img.data[i + 3] = 255; }
		o.putImageData(img, 0, 0);
		var pic = new Image();
		pic.src = out.toDataURL();
		await pic.decode();
		ws.Documents.add(base + '_' + suffix);
		await app.State.do_action(new app.Actions.Bundle_action('split_channels', 'Split Channels', [
			new app.Actions.Prepare_canvas_action('undo'),
			new app.Actions.Update_config_action({ WIDTH: W, HEIGHT: H, ps_mode: 'Grayscale' }),
			new app.Actions.Reset_layers_action(),
			new app.Actions.Insert_layer_action({ type: 'image', name: 'Background', link: pic, x: 0, y: 0, width: W, height: H, width_original: W, height_original: H }, false),
			new app.Actions.Prepare_canvas_action('do'),
		]));
		if (ppi) ws.Documents.current().ppi = ppi;
		app.GUI.GUI_preview.zoom_auto(true);
	}
	//the original document is closed
	await ws.Documents.close(source, true);
	ws.Documents.switch_to(ws.Documents.docs.length - 1);
}

/**
 * Navigator > Panel Options: the view box color
 */
function navigator_options(ws) {
	var POP = new Dialog_class();
	POP.show({
		title: 'Panel Options',
		params: [{ name: 'color', title: 'Color:', value: ws.navigator_color || '#ff2020', type: 'color' }],
		on_finish: (p) => {
			ws.navigator_color = p.color || '#ff2020';
			try { localStorage.setItem('pshot_navigator_color', ws.navigator_color); } catch (e) { /* storage blocked */ }
			app.GUI.GUI_preview.render_preview_active_zone();
		},
	});
}

function reset_swatches(ws) {
	try { localStorage.removeItem('pshot_swatches_v1'); } catch (e) { /* storage blocked */ }
	ws.swatches = null;
	ws.render_swatches();
}

/**
 * Save Swatches: an Adobe Color Swatch file (.aco, version 1 + 2, RGB)
 */
function save_swatches(ws) {
	var list = ws.swatch_list(), parts = [];
	var u16 = (v) => parts.push(v >> 8 & 255, v & 255);
	var color = (hex) => { u16(0); [1, 3, 5].forEach(i => { var v = parseInt(hex.substr(i, 2), 16); u16(v * 257); }); u16(0); };
	u16(1); u16(list.length);
	list.forEach(sw => color(sw.hex));
	u16(2); u16(list.length);
	list.forEach(sw => {
		color(sw.hex);
		var name = sw.name || '';
		u16(0); u16(name.length + 1);
		for (var i = 0; i < name.length; i++) u16(name.charCodeAt(i));
		u16(0);
	});
	var a = document.createElement('a');
	a.href = URL.createObjectURL(new Blob([new Uint8Array(parts)], { type: 'application/octet-stream' }));
	a.download = 'Swatches.aco';
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * Load / Replace Swatches: an .aco file (RGB, HSB and grayscale colors)
 */
function load_swatches(ws, replace) {
	var input = document.createElement('input');
	input.type = 'file';
	input.accept = '.aco';
	input.onchange = async () => {
		var file = input.files[0];
		if (!file) return;
		var v = new DataView(await file.arrayBuffer()), pos = 0;
		var u16 = () => { var x = v.getUint16(pos); pos += 2; return x; };
		var read = (version) => {
			var out = [], n = u16();
			for (var k = 0; k < n; k++) {
				var space = u16(), w = u16(), x = u16(), y = u16();
				u16();
				var rgb = null;
				if (space == 0) rgb = [w, x, y].map(c => Math.round(c / 257));
				else if (space == 1) {
					var h = w / 182.04, s = x / 65535, b = y / 65535, f = (m) => { var t = (m + h / 60) % 6; return b - b * s * Math.max(0, Math.min(t, 4 - t, 1)); };
					rgb = [f(5), f(3), f(1)].map(c => Math.round(c * 255));
				}
				else if (space == 8) rgb = [0, 0, 0].map(() => Math.round(255 - w / 10000 * 255));
				var name = null;
				if (version == 2) {
					u16();
					var len = u16();
					name = '';
					for (var i = 0; i < len; i++) { var ch = u16(); if (ch) name += String.fromCharCode(ch); }
				}
				if (rgb) {
					var hex = '#' + rgb.map(c => c.toString(16).padStart(2, '0')).join('');
					out.push({ hex: hex, name: name || hex });
				}
			}
			return out;
		};
		try {
			var list = read(u16());
			if (pos < v.byteLength && v.getUint16(pos) == 2) { pos += 2; list = read(2); }
			ws.swatches = (replace ? [] : ws.swatch_list()).concat(list);
			ws.save_swatches();
		}
		catch (e) {
			alert('Could not complete the Load Swatches command because the file is not compatible.');
		}
	};
	input.click();
}

function reset_paragraph() {
	var l = config.layer;
	if (!l || l.type != 'text') return;
	var params = Object.assign({}, l.params, { halign: 'left', indent_left: 0, indent_right: 0, indent_first: 0, space_before: 0, space_after: 0 });
	app.State.do_action(new app.Actions.Bundle_action('paragraph', 'Reset Paragraph', [new app.Actions.Update_layer_action(l.id, { params: params })]));
}

function duplicate_comp(ws) {
	var list = ws.Comps.list().slice(), i = config.ps_comp_active, comp = list[i];
	list.splice(i + 1, 0, Object.assign(JSON.parse(JSON.stringify(comp)), { name: comp.name + ' copy' }));
	ws.Comps.set_list(list, i + 1, 'Duplicate Layer Comp');
}

function duplicate_type_style(T, kind, index) {
	var list = T.list(kind).slice(), style = list[index];
	list.splice(index + 1, 0, Object.assign(JSON.parse(JSON.stringify(style)), { name: style.name + ' copy' }));
	T.commit(kind, list, 'Duplicate Style');
}

export { panel_menu };
