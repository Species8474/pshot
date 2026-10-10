/*
 * pshot - CS6 Character Styles and Paragraph Styles panels. Styles belong to
 * the document (config.ps_char_styles / ps_para_styles). A character style is
 * font, style, size, leading, tracking, color, underline, strikethrough; a
 * paragraph style adds the alignment. Clicking a style applies it to the
 * selected type layer (or its selected text while editing) and the Type tool.
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';
import { show_popup_menu } from './popup-menu.js';
import { type_get, type_set } from './type-panels.js';

const CHAR_KEYS = ['font', 'bold', 'italic', 'size', 'leading', 'kerning', 'fill', 'underline', 'strikethrough'];

function esc(v) {
	return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

class Ps_type_styles_class {

	list(kind) {
		var key = kind == 'para' ? 'ps_para_styles' : 'ps_char_styles';
		return config[key] || [];
	}

	commit(kind, list, description) {
		var key = kind == 'para' ? 'ps_para_styles' : 'ps_char_styles';
		return app.State.do_action(new app.Actions.Bundle_action('type_styles', description, [
			new app.Actions.Update_config_action({ [key]: list }),
		])).then(() => this.render_all());
	}

	/**
	 * the Type tool's current settings (and the selected type layer's alignment)
	 */
	capture(kind) {
		var s = {};
		for (var k of CHAR_KEYS) s[k] = type_get(k);
		if (kind == 'para') {
			var l = config.layer && config.layer.type == 'text' ? config.layer : null;
			s.align = l && l.params ? l.params.halign : 'left';
		}
		return s;
	}

	create(kind) {
		var list = this.list(kind);
		var base = kind == 'para' ? 'Paragraph Style ' : 'Character Style ';
		var n = 1;
		while (list.some(s => s.name == base + n)) n++;
		var style = Object.assign({ name: base + n }, this.capture(kind));
		this.commit(kind, list.concat([style]), 'New ' + (kind == 'para' ? 'Paragraph' : 'Character') + ' Style');
	}

	apply(kind, index) {
		var style = this.list(kind)[index];
		if (!style) return;
		this.current = { kind: kind, index: index };
		for (var k of CHAR_KEYS) if (style[k] !== undefined) type_set(k, style[k]);
		var l = config.layer && config.layer.type == 'text' ? config.layer : null;
		if (kind == 'para' && l && style.align && l.params.halign != style.align) {
			app.State.do_action(new app.Actions.Bundle_action('paragraph', 'Paragraph Style', [
				new app.Actions.Update_layer_action(l.id, { params: Object.assign({}, l.params, { halign: style.align }) }),
			]));
		}
		this.render_all();
	}

	remove(kind, index) {
		var list = this.list(kind).slice();
		list.splice(index, 1);
		this.current = null;
		this.commit(kind, list, 'Delete Style');
	}

	/**
	 * Redefine Style by Selection: the style takes the current settings
	 */
	redefine(kind, index) {
		var list = JSON.parse(JSON.stringify(this.list(kind)));
		if (!list[index]) return;
		Object.assign(list[index], this.capture(kind));
		this.commit(kind, list, 'Redefine Style');
	}

	/**
	 * Character / Paragraph Style Options (double-click)
	 */
	options(kind, index) {
		var list = JSON.parse(JSON.stringify(this.list(kind)));
		var s = list[index];
		if (!s) return;
		var params = [
			{ name: 'name', title: 'Style Name:', value: s.name },
			{ name: 'font', title: 'Font Family:', value: s.font || '' },
			{ name: 'style', title: 'Font Style:', values: ['Regular', 'Italic', 'Bold', 'Bold Italic'], value: s.bold ? (s.italic ? 'Bold Italic' : 'Bold') : (s.italic ? 'Italic' : 'Regular'), type: 'select' },
			{ name: 'size', title: 'Size (pt):', value: s.size },
			{ name: 'leading', title: 'Leading (pt):', value: s.leading || 0 },
			{ name: 'kerning', title: 'Tracking:', value: s.kerning || 0 },
			{ name: 'underline', title: 'Underline', value: !!s.underline },
			{ name: 'strikethrough', title: 'Strikethrough', value: !!s.strikethrough },
		];
		if (kind == 'para') params.push({ name: 'align', title: 'Alignment:', values: ['left', 'center', 'right'], value: s.align || 'left', type: 'select' });
		var POP = new Dialog_class();
		POP.show({
			title: kind == 'para' ? 'Paragraph Style Options' : 'Character Style Options',
			params: params,
			on_finish: (p) => {
				Object.assign(s, {
					name: p.name || s.name, font: p.font || s.font, bold: p.style.indexOf('Bold') >= 0, italic: p.style.indexOf('Italic') >= 0,
					size: parseFloat(p.size) || s.size, leading: parseFloat(p.leading) || 0, kerning: parseFloat(p.kerning) || 0,
					underline: !!p.underline, strikethrough: !!p.strikethrough,
				});
				if (kind == 'para') s.align = p.align;
				this.commit(kind, list, 'Style Options');
			},
		});
	}

	render_all() {
		this.render('char');
		this.render('para');
	}

	render(kind) {
		var el = document.getElementById(kind == 'para' ? 'ps_para_styles' : 'ps_char_styles');
		if (!el || !el.closest('.ps_popout, .ps_panel.active')) return;
		var list = this.list(kind);
		var cur = this.current && this.current.kind == kind ? this.current.index : -1;
		var html = '<div class="ps_tstyle_list">'
			+ '<div class="ps_tstyle_row' + (cur < 0 ? ' active' : '') + '" data-i="-1">' + (kind == 'para' ? 'Basic Paragraph' : 'No Character Style') + '</div>'
			+ list.map((s, i) => '<div class="ps_tstyle_row' + (i == cur ? ' active' : '') + '" data-i="' + i + '">' + esc(s.name) + '</div>').join('')
			+ '</div><div class="ps_panel_footer">'
			+ '<button type="button" data-a="redefine" title="Redefine style by selection"' + (cur < 0 ? ' class="disabled"' : '') + '>&#10003;</button>'
			+ '<button type="button" data-a="new" title="Create new ' + (kind == 'para' ? 'paragraph' : 'character') + ' style">&#43;</button>'
			+ '<button type="button" data-a="delete" title="Delete current style"' + (cur < 0 ? ' class="disabled"' : '') + '>&#128465;</button></div>';
		el.innerHTML = html;
		el.querySelectorAll('.ps_tstyle_row').forEach(r => {
			var i = parseInt(r.dataset.i);
			r.addEventListener('click', () => {
				if (i < 0) { this.current = null; this.render(kind); return; }
				this.apply(kind, i);
			});
			if (i >= 0) r.addEventListener('dblclick', () => this.options(kind, i));
			if (i >= 0) r.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				show_popup_menu(r, [
					{ name: 'Style Options...', action: () => this.options(kind, i) },
					{ name: 'Redefine Style', action: () => this.redefine(kind, i) },
					{ divider: true },
					{ name: 'Duplicate Style', action: () => {
						var list = JSON.parse(JSON.stringify(this.list(kind)));
						list.splice(i + 1, 0, Object.assign({}, list[i], { name: list[i].name + ' copy' }));
						this.commit(kind, list, 'Duplicate Style');
					} },
					{ name: 'Delete Style', action: () => this.remove(kind, i) },
				], { point: { x: e.clientX, y: e.clientY } });
			});
		});
		el.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
			if (b.classList.contains('disabled')) return;
			if (b.dataset.a == 'new') this.create(kind);
			if (b.dataset.a == 'delete') this.remove(kind, cur);
			if (b.dataset.a == 'redefine') this.redefine(kind, cur);
		}));
	}
}

export default Ps_type_styles_class;
