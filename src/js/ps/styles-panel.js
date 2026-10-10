/*
 * pshot - CS6 Styles panel: style presets shown as live thumbnails; a click
 * gives the active layer that style (Shift adds its effects to the layer's),
 * New Style... keeps the layer's effects as a preset, right-click renames or
 * deletes a user style. The default set approximates CS6's Default Styles.
 */

import app from './../app.js';
import config from './../config.js';
import { STYLE_DEFAULTS } from './styles.js';
import { show_popup_menu, prompt_name } from './popup-menu.js';

const KEY = 'pshot_styles_v1';

//a style from partial effects (each merged over the CS6 defaults, enabled)
function S(name, fx) {
	var styles = {};
	for (var k in fx) styles[k] = Object.assign({}, STYLE_DEFAULTS[k], { enabled: true }, fx[k]);
	return { name: name, styles: styles };
}

const DEFAULTS = [
	{ name: 'Default Style (None)', styles: {} },
	S('Blue Glass (Button)', { gradient_overlay: { color_1: '#0a2a8a', color_2: '#4fa2ff', angle: 90 }, inner_shadow: { opacity: 60, distance: 3, size: 6 }, bevel: { size: 6, depth: 150, soften: 2 }, drop_shadow: { opacity: 55, distance: 4, size: 6 } }),
	S('Mixed Color (Button)', { gradient_overlay: { color_1: '#c4291c', color_2: '#f7d046', angle: 135 }, bevel: { size: 5, depth: 120 }, stroke: { color: '#5a1a10', size: 1, position: 'Inside' } }),
	S('Sunset Sky (Text)', { gradient_overlay: { color_1: '#3a1c71', color_2: '#ffaf7b', angle: 90 }, drop_shadow: { opacity: 60, distance: 3, size: 4 } }),
	S('Double Ring Glow (Button)', { outer_glow: { color: '#ffd200', size: 10, opacity: 85 }, inner_glow: { color: '#ffffff', size: 6 }, stroke: { color: '#6b4a00', size: 2 } }),
	S('Chiseled Sky (Text)', { gradient_overlay: { color_1: '#6fb1fc', color_2: '#ffffff', angle: 90 }, bevel: { technique: 'Chisel Hard', size: 4, depth: 200 } }),
	S('Basic Drop Shadow', { drop_shadow: { opacity: 75, distance: 5, size: 5 } }),
	S('Simple Sharp Pillow Emboss', { bevel: { style: 'Pillow Emboss', technique: 'Chisel Hard', size: 4 } }),
	S('Simple Inner Bevel', { bevel: { size: 5 } }),
	S('Outer Glow', { outer_glow: { size: 12, opacity: 75 } }),
	S('Inner Shadow', { inner_shadow: { distance: 4, size: 6 } }),
	S('Red Stroke', { stroke: { color: '#ff0000', size: 3 } }),
	S('Satin Black', { color_overlay: { color: '#1b1b1b' }, satin: { color: '#ffffff', blend: 'Screen', opacity: 35 }, bevel: { size: 4, highlight_opacity: 50 } }),
	S('Gold Bevel', { gradient_overlay: { color_1: '#8a6a1f', color_2: '#f9e29a', angle: 90 }, bevel: { size: 6, depth: 180, technique: 'Chisel Soft' }, stroke: { color: '#5c4413', size: 1 } }),
	S('Plastic Green', { color_overlay: { color: '#21a038' }, inner_glow: { color: '#d8ffd8', size: 8, opacity: 60 }, bevel: { size: 8, soften: 4 } }),
	S('Checker Pattern', { pattern_overlay: { pattern: 'Checkerboard', scale: 100 }, stroke: { color: '#000000', size: 1 } }),
];

class Ps_styles_panel_class {

	constructor() {
		try { this.user = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { this.user = []; }
		this.view = 'Small Thumbnail';
	}

	list() {
		return DEFAULTS.concat(this.user);
	}

	save() {
		try { localStorage.setItem(KEY, JSON.stringify(this.user)); } catch (e) { /* storage blocked */ }
		this.render();
	}

	/**
	 * a rounded square with the style, for the panel
	 */
	thumb(preset, px) {
		var c = document.createElement('canvas');
		c.width = c.height = px;
		var content = document.createElement('canvas');
		content.width = content.height = px;
		var g = content.getContext('2d'), m = Math.round(px * 0.18), r = px * 0.12;
		g.fillStyle = '#9a9a9a';
		g.beginPath();
		if (g.roundRect) g.roundRect(m, m, px - m * 2, px - m * 2, r);
		else g.rect(m, m, px - m * 2, px - m * 2);
		g.fill();
		var ctx = c.getContext('2d');
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, px, px);
		var styles = app.GUI.Ps_workspace.Styles;
		ctx.drawImage(Object.keys(preset.styles).length ? styles.compose(content, { ps_styles: preset.styles }, px / 48) : content, 0, 0);
		return c;
	}

	/**
	 * a click: the layer takes the style (Shift: the style's effects are added)
	 */
	apply(preset, add) {
		var l = config.layer;
		if (!l || l.type == null || l.type == 'ps_group') {
			app.GUI.Ps_workspace.status_message('Select a layer to apply a style.');
			return;
		}
		if (l.name == 'Background' && l.type == 'image' && !Object.keys(preset.styles).length) return;
		var styles = add ? Object.assign({}, JSON.parse(JSON.stringify(l.ps_styles || {})), JSON.parse(JSON.stringify(preset.styles))) : JSON.parse(JSON.stringify(preset.styles));
		app.State.do_action(new app.Actions.Bundle_action('layer_style', 'Apply Style', [
			new app.Actions.Update_layer_action(l.id, { ps_styles: Object.keys(styles).length ? styles : null }),
		])).then(() => app.GUI.GUI_layers.render_layers());
	}

	/**
	 * New Style...: the active layer's effects as a preset
	 */
	new_style() {
		var l = config.layer;
		var styles = l && l.ps_styles ? l.ps_styles : {};
		prompt_name('New Style', 'Style ' + (this.user.length + 1), (name) => {
			this.user.push({ name: name, styles: JSON.parse(JSON.stringify(styles)) });
			this.save();
		});
	}

	reset() {
		this.user = [];
		this.save();
	}

	menu_items() {
		var view = (v) => ({ name: v, checked: this.view == v, action: () => { this.view = v; this.render(); } });
		return [
			{ name: 'New Style...', action: () => this.new_style() },
			{ divider: true },
			view('Text Only'), view('Small Thumbnail'), view('Large Thumbnail'), view('Small List'), view('Large List'),
			{ divider: true },
			{ name: 'Preset Manager...', action: () => app.GUI.modules['ps/commands'].preset_manager() },
			{ divider: true },
			{ name: 'Reset Styles...', action: this.user.length ? () => { if (window.confirm('Replace current styles with the default styles?')) this.reset(); } : null },
		];
	}

	render() {
		var el = document.getElementById('ps_styles');
		if (!el) return;
		var list_mode = /List|Text/.test(this.view), large = /Large/.test(this.view);
		el.innerHTML = '<div class="ps_style_grid' + (list_mode ? ' list' : '') + (large ? ' large' : '') + '"></div>';
		var grid = el.firstChild, px = large ? 46 : 26;
		this.list().forEach((p, i) => {
			var cell = document.createElement('div');
			cell.className = 'ps_style';
			cell.title = p.name;
			if (this.view != 'Text Only') cell.appendChild(this.thumb(p, list_mode ? (large ? 30 : 18) : px));
			if (list_mode) {
				var label = document.createElement('span');
				label.textContent = p.name;
				cell.appendChild(label);
			}
			cell.addEventListener('click', (e) => this.apply(p, e.shiftKey));
			var user = i >= DEFAULTS.length;
			cell.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				show_popup_menu(cell, [
					{ name: 'New Style...', action: () => this.new_style() },
					{ divider: true },
					{ name: 'Rename Style...', action: user ? () => prompt_name('Style Name', p.name, (n) => { p.name = n; this.save(); }) : null },
					{ name: 'Delete Style', action: user ? () => { this.user.splice(i - DEFAULTS.length, 1); this.save(); } : null },
				], { point: { x: e.clientX, y: e.clientY } });
			});
			grid.appendChild(cell);
		});
		var footer = document.createElement('div');
		footer.className = 'ps_panel_footer';
		footer.innerHTML = '<button type="button" data-st="clear" title="Clear Style"><svg viewBox="0 0 18 18" width="16" height="16"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M4.8 13.2l8.4-8.4" stroke="currentColor" stroke-width="1.2"/></svg></button>'
			+ '<button type="button" data-st="new" title="Create new style"><svg viewBox="0 0 18 18" width="16" height="16"><rect x="4" y="3" width="10" height="12" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M11 3v3h3" fill="none" stroke="currentColor" stroke-width="1.2"/></svg></button>';
		el.appendChild(footer);
		footer.querySelector('[data-st=clear]').addEventListener('click', () => this.apply(DEFAULTS[0], false));
		footer.querySelector('[data-st=new]').addEventListener('click', () => this.new_style());
	}
}

export default Ps_styles_panel_class;
