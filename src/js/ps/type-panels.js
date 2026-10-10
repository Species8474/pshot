/*
 * pshot - CS6 Character and Paragraph panels. They edit the Type tool's
 * settings, and the selected text when a type layer is being edited.
 */

import app from './../app.js';
import { font_button } from './font-menu.js';
import config from './../config.js';

function text_tool() {
	return config.TOOLS.find(t => t.name == 'text');
}

function get(key) {
	var a = text_tool().attributes[key];
	return a !== null && typeof a == 'object' && 'value' in a ? a.value : a;
}

function set(key, value) {
	var attrs = text_tool().attributes;
	if (attrs[key] !== null && typeof attrs[key] == 'object' && 'value' in attrs[key]) {
		attrs[key].value = value;
	}
	else {
		attrs[key] = value;
	}
	var module = app.GUI.GUI_tools.tools_modules.text;
	if (module && config.layer && config.layer.type == 'text') {
		var tool = module.object;
		var editor = tool.get_editor(config.layer);
		//CS6: with the type layer selected but not being edited, the change applies to all its text
		var whole = config.TOOL.name != 'text' || !tool.focused;
		if (whole) {
			var last = editor.document.lines.length - 1;
			tool.layer = config.layer;
			editor.selection.set_position(0, 0);
			editor.selection.set_position(last, editor.document.get_line_character_count(last), true);
		}
		tool.on_params_update({ key: key, value: value });
		if (whole) {
			editor.selection.set_position(0, 0);
		}
	}
	if (config.TOOL.name == 'text') {
		app.GUI.GUI_tools.show_action_attributes();
	}
}

const ICONS = {
	left: '<svg viewBox="0 0 18 18" width="16" height="16"><path d="M2 4h14M2 7.5h9M2 11h14M2 14.5h9" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
	center: '<svg viewBox="0 0 18 18" width="16" height="16"><path d="M2 4h14M4.5 7.5h9M2 11h14M4.5 14.5h9" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
	right: '<svg viewBox="0 0 18 18" width="16" height="16"><path d="M2 4h14M7 7.5h9M2 11h14M7 14.5h9" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
};

function render_character(host) {
	var attr = text_tool().attributes.font;
	var fonts = (typeof attr.values == 'function' ? attr.values() : attr.values).filter(f => f && f.indexOf('[') != 0);
	var bold = !!get('bold'), italic = !!get('italic');
	var style = bold ? (italic ? 'Bold Italic' : 'Bold') : (italic ? 'Italic' : 'Regular');
	host.innerHTML = '<div class="ps_typ">'
		+ '<div class="ps_typ_row"><span id="ch_font_host" class="ps_typ_wide"></span>'
		+ '<select id="ch_style">' + ['Regular', 'Italic', 'Bold', 'Bold Italic'].map(v => '<option' + (v == style ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></div>'
		+ '<div class="ps_typ_row"><span class="ps_typ_icon">T</span><input type="number" id="ch_size" value="' + get('size') + '" min="1"><span>pt</span>'
		+ '<span class="ps_typ_icon">A</span><input type="number" id="ch_leading" value="' + (get('leading') || 0) + '"><span>pt</span></div>'
		+ '<div class="ps_typ_row"><span class="ps_typ_icon">V/A</span><select disabled><option>Metrics</option></select>'
		+ '<span class="ps_typ_icon">VA</span><input type="number" id="ch_tracking" value="' + (get('kerning') || 0) + '"></div>'
		+ '<div class="ps_typ_row"><span>Color:</span><button type="button" class="ps_typ_color" id="ch_color" style="background:' + get('fill') + '"></button></div>'
		+ '<div class="ps_typ_row ps_typ_faux">'
		+ '<button type="button" data-faux="bold" class="' + (bold ? 'pressed' : '') + '" title="Faux Bold"><b>T</b></button>'
		+ '<button type="button" data-faux="italic" class="' + (italic ? 'pressed' : '') + '" title="Faux Italic"><i>T</i></button>'
		+ '<button type="button" class="disabled" title="All Caps">TT</button><button type="button" class="disabled" title="Small Caps">Tт</button>'
		+ '<button type="button" class="disabled" title="Superscript">T¹</button><button type="button" class="disabled" title="Subscript">T₁</button>'
		+ '<button type="button" data-faux="underline" class="' + (get('underline') ? 'pressed' : '') + '" title="Underline"><u>T</u></button>'
		+ '<button type="button" data-faux="strikethrough" class="' + (get('strikethrough') ? 'pressed' : '') + '" title="Strikethrough"><s>T</s></button>'
		+ '</div>'
		+ '<div class="ps_typ_row"><select disabled><option>English: USA</option></select><select id="ch_aa" title="Set the anti-aliasing method">'
		+ ['None', 'Sharp', 'Crisp', 'Strong', 'Smooth'].map(v => '<option' + (v.toLowerCase() == app.GUI.Ps_workspace.Text_aa.current() ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></div>'
		+ '</div>';
	var $ = (id) => host.querySelector('#' + id);
	$('ch_font_host').appendChild(font_button(fonts, get('font'), (f) => { set('font', f); render_character(host); }, 'ps_typ_font'));
	$('ch_aa').addEventListener('change', (e) => app.GUI.Ps_workspace.Text_aa.set(e.target.value.toLowerCase()));
	$('ch_style').addEventListener('change', (e) => {
		set('bold', e.target.value.indexOf('Bold') >= 0);
		set('italic', e.target.value.indexOf('Italic') >= 0);
		render_character(host);
	});
	$('ch_size').addEventListener('change', (e) => { var v = parseFloat(e.target.value); if (v > 0) set('size', v); });
	$('ch_leading').addEventListener('change', (e) => { var v = parseFloat(e.target.value); if (!isNaN(v)) set('leading', v); });
	$('ch_tracking').addEventListener('change', (e) => { var v = parseFloat(e.target.value); if (!isNaN(v)) set('kerning', v); });
	$('ch_color').addEventListener('click', () => {
		app.GUI.Ps_workspace.color_dialog('Text Color', get('fill'), (hex) => {
			set('fill', hex);
			$('ch_color').style.background = hex;
		});
	});
	host.querySelectorAll('[data-faux]').forEach((b) => b.addEventListener('click', () => {
		set(b.dataset.faux, !get(b.dataset.faux));
		render_character(host);
	}));
}

function render_paragraph(host) {
	var layer = config.layer && config.layer.type == 'text' ? config.layer : null;
	var align = layer && layer.params ? layer.params.halign : 'left';
	host.innerHTML = '<div class="ps_typ">'
		+ '<div class="ps_typ_row ps_typ_align">'
		+ ['left', 'center', 'right'].map(a => '<button type="button" data-align="' + a + '" class="' + (a == align ? 'pressed' : '') + (layer ? '' : ' disabled') + '" title="' + a[0].toUpperCase() + a.slice(1) + ' align text">' + ICONS[a] + '</button>').join('')
		+ '<button type="button" class="disabled" title="Justify last left">≡</button><button type="button" class="disabled" title="Justify all">≣</button>'
		+ '</div>'
		+ '<div class="ps_typ_row"><span>Indent left:</span><input type="number" value="0" disabled><span>pt</span></div>'
		+ '<div class="ps_typ_row"><span>Indent right:</span><input type="number" value="0" disabled><span>pt</span></div>'
		+ '<div class="ps_typ_row"><span>Space before:</span><input type="number" value="0" disabled><span>pt</span></div>'
		+ '<div class="ps_typ_row"><span>Space after:</span><input type="number" value="0" disabled><span>pt</span></div>'
		+ '<label class="ps_typ_row"><input type="checkbox" checked disabled> Hyphenate</label>'
		+ (layer ? '' : '<div class="ps_typ_hint">Select a type layer to set its alignment.</div>')
		+ '</div>';
	host.querySelectorAll('[data-align]').forEach((b) => b.addEventListener('click', () => {
		if (!layer) return;
		var params = Object.assign({}, layer.params, { halign: b.dataset.align });
		app.State.do_action(new app.Actions.Bundle_action('paragraph', 'Paragraph Alignment', [
			new app.Actions.Update_layer_action(layer.id, { params: params }),
		])).then(() => render_paragraph(host));
	}));
}

export { render_character, render_paragraph, get as type_get, set as type_set };
