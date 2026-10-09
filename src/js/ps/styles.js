/*
 * pshot - CS6 layer styles (fx): Drop Shadow, Inner Shadow, Outer Glow,
 * Inner Glow, Stroke, Color Overlay, Gradient Overlay, plus Fill Opacity.
 *
 * layer.ps_styles = { drop_shadow: {...}, ... }; each entry has `enabled`.
 * Effects are drawn at render time (non-destructive) from the layer's alpha.
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';

const BLEND = {
	'Normal': 'source-over', 'Multiply': 'multiply', 'Screen': 'screen', 'Overlay': 'overlay', 'Darken': 'darken',
	'Lighten': 'lighten', 'Color Dodge': 'color-dodge', 'Color Burn': 'color-burn', 'Linear Dodge (Add)': 'lighter',
	'Soft Light': 'soft-light', 'Hard Light': 'hard-light', 'Difference': 'difference', 'Exclusion': 'exclusion',
	'Hue': 'hue', 'Saturation': 'saturation', 'Color': 'color', 'Luminosity': 'luminosity',
};
const BLEND_NAMES = Object.keys(BLEND);

// CS6 defaults
const DEFAULTS = {
	drop_shadow: { enabled: false, blend: 'Multiply', color: '#000000', opacity: 75, angle: 120, distance: 5, size: 5 },
	inner_shadow: { enabled: false, blend: 'Multiply', color: '#000000', opacity: 75, angle: 120, distance: 5, size: 5 },
	outer_glow: { enabled: false, blend: 'Screen', color: '#ffffbe', opacity: 75, size: 5 },
	inner_glow: { enabled: false, blend: 'Screen', color: '#ffffbe', opacity: 75, size: 5 },
	stroke: { enabled: false, blend: 'Normal', color: '#ff0000', opacity: 100, size: 3, position: 'Outside' },
	color_overlay: { enabled: false, blend: 'Normal', color: '#ff0000', opacity: 100 },
	gradient_overlay: { enabled: false, blend: 'Normal', opacity: 100, color_1: '#000000', color_2: '#ffffff', angle: 90, reverse: false },
};

// left column of the CS6 Layer Style dialog (null = not available yet)
const LIST = [
	['blending', 'Blending Options: Default'],
	[null, 'Bevel & Emboss'], [null, 'Contour'], [null, 'Texture'],
	['stroke', 'Stroke'],
	['inner_shadow', 'Inner Shadow'],
	['inner_glow', 'Inner Glow'],
	[null, 'Satin'],
	['color_overlay', 'Color Overlay'],
	['gradient_overlay', 'Gradient Overlay'],
	[null, 'Pattern Overlay'],
	['outer_glow', 'Outer Glow'],
	['drop_shadow', 'Drop Shadow'],
];

const TITLES = {};
for (const [key, title] of LIST) if (key) TITLES[key] = title;

function rgba(hex, alpha) {
	var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
	return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

function canvas_like(c) {
	var out = document.createElement('canvas');
	out.width = c.width;
	out.height = c.height;
	return out;
}

class Ps_styles_class {

	has(layer) {
		var s = layer && layer.ps_styles;
		if (!s) return false;
		for (var k in s) if (s[k] && s[k].enabled) return true;
		return false;
	}

	needs_offscreen(layer) {
		return this.has(layer) || (layer && layer.ps_fill != null && layer.ps_fill < 100);
	}

	/**
	 * only the effect's shape: a shadow of `src` (alpha), offset and blurred
	 */
	shadow_only(src, color, opacity, dx, dy, blur) {
		var out = canvas_like(src);
		var ctx = out.getContext('2d');
		var far = src.width + 1000;
		ctx.shadowColor = rgba(color, opacity / 100);
		ctx.shadowBlur = blur;
		ctx.shadowOffsetX = dx + far;
		ctx.shadowOffsetY = dy;
		ctx.drawImage(src, -far, 0);
		return out;
	}

	inverted(src) {
		var out = canvas_like(src);
		var ctx = out.getContext('2d');
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, out.width, out.height);
		ctx.globalCompositeOperation = 'destination-out';
		ctx.drawImage(src, 0, 0);
		return out;
	}

	colored(src, color) {
		var out = canvas_like(src);
		var ctx = out.getContext('2d');
		ctx.drawImage(src, 0, 0);
		ctx.globalCompositeOperation = 'source-in';
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, out.width, out.height);
		return out;
	}

	/**
	 * content: the layer rendered on a canvas the size of the target (screen space)
	 * scale: document -> screen scale, for sizes given in document pixels
	 */
	compose(content, layer, scale) {
		var s = Object.assign({}, layer.ps_styles || {});
		var fill = layer.ps_fill == null ? 100 : layer.ps_fill;
		var out = canvas_like(content);
		var ctx = out.getContext('2d');
		var on = (k) => s[k] && s[k].enabled;
		var offset = (e) => {
			var a = (e.angle || 0) * Math.PI / 180;
			return { dx: -Math.cos(a) * e.distance * scale, dy: Math.sin(a) * e.distance * scale };
		};

		//below the layer
		if (on('drop_shadow')) {
			var e = s.drop_shadow, o = offset(e);
			ctx.globalCompositeOperation = BLEND[e.blend] || 'multiply';
			ctx.drawImage(this.shadow_only(content, e.color, e.opacity, o.dx, o.dy, e.size * scale), 0, 0);
		}
		if (on('outer_glow')) {
			var g = s.outer_glow;
			ctx.globalCompositeOperation = BLEND[g.blend] || 'screen';
			var glow = this.shadow_only(content, g.color, g.opacity, 0, 0, g.size * scale * 1.2);
			ctx.drawImage(glow, 0, 0);
			ctx.drawImage(glow, 0, 0);
		}
		if (on('stroke')) {
			var st = s.stroke;
			var r = Math.max(1, st.size * scale);
			var ring = canvas_like(content);
			var rctx = ring.getContext('2d');
			var shape = this.colored(content, st.color);
			var steps = Math.max(16, Math.round(r * 4));
			for (var i = 0; i < steps; i++) {
				var a = i / steps * Math.PI * 2;
				rctx.drawImage(shape, Math.cos(a) * r, Math.sin(a) * r);
			}
			rctx.drawImage(shape, 0, 0);
			if (st.position == 'Outside') {
				rctx.globalCompositeOperation = 'destination-out';
				rctx.drawImage(content, 0, 0);
			}
			ctx.globalCompositeOperation = BLEND[st.blend] || 'source-over';
			ctx.globalAlpha = st.opacity / 100;
			ctx.drawImage(ring, 0, 0);
			ctx.globalAlpha = 1;
		}

		//the layer itself, at Fill opacity, with the inner effects on top of it
		var body = canvas_like(content);
		var bctx = body.getContext('2d');
		bctx.globalAlpha = fill / 100;
		bctx.drawImage(content, 0, 0);
		bctx.globalAlpha = 1;
		var clip_to_shape = (layer_canvas) => {
			var c = canvas_like(content);
			var cctx = c.getContext('2d');
			cctx.drawImage(layer_canvas, 0, 0);
			cctx.globalCompositeOperation = 'destination-in';
			cctx.drawImage(content, 0, 0);
			return c;
		};
		if (on('inner_shadow')) {
			var is = s.inner_shadow, io = offset(is);
			bctx.globalCompositeOperation = BLEND[is.blend] || 'multiply';
			bctx.drawImage(clip_to_shape(this.shadow_only(this.inverted(content), is.color, is.opacity, io.dx, io.dy, is.size * scale)), 0, 0);
		}
		if (on('inner_glow')) {
			var ig = s.inner_glow;
			bctx.globalCompositeOperation = BLEND[ig.blend] || 'screen';
			bctx.drawImage(clip_to_shape(this.shadow_only(this.inverted(content), ig.color, ig.opacity, 0, 0, ig.size * scale * 1.2)), 0, 0);
		}
		if (on('color_overlay')) {
			var co = s.color_overlay;
			var fillc = canvas_like(content);
			var fctx = fillc.getContext('2d');
			fctx.fillStyle = rgba(co.color, co.opacity / 100);
			fctx.fillRect(0, 0, fillc.width, fillc.height);
			bctx.globalCompositeOperation = BLEND[co.blend] || 'source-over';
			bctx.drawImage(clip_to_shape(fillc), 0, 0);
		}
		if (on('gradient_overlay')) {
			var go = s.gradient_overlay;
			var gc = canvas_like(content);
			var gctx = gc.getContext('2d');
			var ang = (go.angle || 0) * Math.PI / 180;
			var cx = gc.width / 2, cy = gc.height / 2, len = Math.max(gc.width, gc.height) / 2;
			var grad = gctx.createLinearGradient(cx - Math.cos(ang) * len, cy + Math.sin(ang) * len, cx + Math.cos(ang) * len, cy - Math.sin(ang) * len);
			grad.addColorStop(0, go.reverse ? go.color_2 : go.color_1);
			grad.addColorStop(1, go.reverse ? go.color_1 : go.color_2);
			gctx.globalAlpha = go.opacity / 100;
			gctx.fillStyle = grad;
			gctx.fillRect(0, 0, gc.width, gc.height);
			bctx.globalCompositeOperation = BLEND[go.blend] || 'source-over';
			bctx.drawImage(clip_to_shape(gc), 0, 0);
		}
		ctx.globalCompositeOperation = 'source-over';
		ctx.drawImage(body, 0, 0);
		return out;
	}

	enabled_names(layer) {
		var s = layer.ps_styles || {};
		return LIST.filter(([k]) => k && k != 'blending' && s[k] && s[k].enabled).map(([k, t]) => [k, t]);
	}

	// ---------- Layer Style dialog ----------

	open(layer, focus) {
		layer = layer || config.layer;
		if (!layer || layer.type == null || layer.type == 'ps_group') {
			return;
		}
		var original = { styles: JSON.parse(JSON.stringify(layer.ps_styles || {})), fill: layer.ps_fill, opacity: layer.opacity, composition: layer.composition };
		var styles = JSON.parse(JSON.stringify(layer.ps_styles || {}));
		for (var k in DEFAULTS) {
			styles[k] = Object.assign({}, DEFAULTS[k], styles[k] || {});
		}
		//CS6: picking a style from the fx menu turns it on
		if (focus && focus != 'blending' && styles[focus]) {
			styles[focus].enabled = true;
		}
		var state = { current: focus || 'blending', styles: styles, fill: layer.ps_fill == null ? 100 : layer.ps_fill, opacity: layer.opacity, composition: layer.composition };
		var apply_preview = () => {
			layer.ps_styles = state.styles;
			layer.ps_fill = state.fill;
			layer.opacity = state.opacity;
			layer.composition = state.composition;
			config.need_render = true;
		};
		var POP = new Dialog_class();
		var html = '<div class="ps_fx"><div class="ps_fx_list">'
			+ '<div class="ps_fx_title">Styles</div>'
			+ LIST.map(([k, t]) => k == 'blending'
				? '<div class="ps_fx_item' + (state.current == k ? ' active' : '') + '" data-key="blending">' + t + '</div>'
				: '<div class="ps_fx_item' + (k ? '' : ' disabled') + (state.current == k ? ' active' : '') + '" data-key="' + (k || '') + '">'
					+ '<input type="checkbox"' + (k && styles[k].enabled ? ' checked' : '') + (k ? '' : ' disabled') + ' data-check="' + (k || '') + '"> ' + t + '</div>').join('')
			+ '</div><div class="ps_fx_panel" id="ps_fx_panel"></div></div>';
		POP.show({
			title: 'Layer Style',
			className: 'ps_fx_dialog',
			params: [{ function() { return html; } }],
			on_finish: () => {
				//restore, then apply through History
				Object.assign(layer, { ps_styles: original.styles, ps_fill: original.fill, opacity: original.opacity, composition: original.composition });
				var clean = {};
				for (var key in state.styles) {
					if (state.styles[key].enabled) clean[key] = state.styles[key];
				}
				app.State.do_action(new app.Actions.Bundle_action('layer_style', 'Layer Style', [
					new app.Actions.Update_layer_action(layer.id, { ps_styles: clean, ps_fill: state.fill, opacity: state.opacity, composition: state.composition }),
				])).then(() => app.GUI.GUI_layers.render_layers());
			},
			on_cancel: () => {
				Object.assign(layer, { ps_styles: original.styles, ps_fill: original.fill, opacity: original.opacity, composition: original.composition });
				config.need_render = true;
			},
		});
		var root = document.querySelector('#popups .popup .ps_fx');
		var panel = root.querySelector('#ps_fx_panel');
		var render_panel = () => this.render_panel(panel, state, apply_preview);
		root.querySelectorAll('.ps_fx_item').forEach((item) => {
			item.addEventListener('click', (e) => {
				var key = item.dataset.key;
				if (!key) return;
				if (e.target.matches('input[type="checkbox"]')) {
					state.styles[key].enabled = e.target.checked;
					apply_preview();
				}
				else if (key != 'blending' && !state.styles[key].enabled) {
					//CS6: clicking a style name turns it on and shows its settings
					state.styles[key].enabled = true;
					item.querySelector('input').checked = true;
					apply_preview();
				}
				state.current = key;
				root.querySelectorAll('.ps_fx_item').forEach(i => i.classList.toggle('active', i === item));
				render_panel();
			});
		});
		render_panel();
		apply_preview();
	}

	render_panel(panel, state, apply_preview) {
		var key = state.current;
		var row = (label, control) => '<div class="ps_fx_row"><label>' + label + '</label>' + control + '</div>';
		var num = (name, value, unit, min, max) => '<input type="number" data-field="' + name + '" value="' + value + '" min="' + (min == null ? 0 : min) + '" max="' + (max == null ? 999 : max) + '"><span class="ps_fx_unit">' + (unit || '') + '</span>';
		var select = (name, values, value) => '<select data-field="' + name + '">' + values.map(v => '<option' + (v == value ? ' selected' : '') + '>' + v + '</option>').join('') + '</select>';
		var swatch = (name, value) => '<button type="button" class="ps_fx_swatch" data-color="' + name + '" style="background:' + value + '"></button>';
		var html = '';
		if (key == 'blending') {
			var modes = { 'source-over': 'Normal' };
			for (var n in BLEND) modes[BLEND[n]] = n;
			html += '<div class="ps_fx_head">Blending Options</div><div class="ps_fx_group">General Blending</div>'
				+ row('Blend Mode:', select('composition', BLEND_NAMES, modes[state.composition] || 'Normal'))
				+ row('Opacity:', num('opacity', state.opacity, '%', 0, 100))
				+ '<div class="ps_fx_group">Advanced Blending</div>'
				+ row('Fill Opacity:', num('fill', state.fill, '%', 0, 100));
		}
		else {
			var e = state.styles[key];
			html += '<div class="ps_fx_head">' + TITLES[key] + '</div><div class="ps_fx_group">Structure</div>';
			if (key == 'stroke') {
				html += row('Size:', num('size', e.size, 'px', 1, 250))
					+ row('Position:', select('position', ['Outside', 'Center'], e.position))
					+ row('Blend Mode:', select('blend', BLEND_NAMES, e.blend))
					+ row('Opacity:', num('opacity', e.opacity, '%', 0, 100))
					+ row('Color:', swatch('color', e.color));
			}
			else if (key == 'gradient_overlay') {
				html += row('Blend Mode:', select('blend', BLEND_NAMES, e.blend))
					+ row('Opacity:', num('opacity', e.opacity, '%', 0, 100))
					+ row('Gradient:', swatch('color_1', e.color_1) + swatch('color_2', e.color_2) + '<label class="ps_fx_check"><input type="checkbox" data-field="reverse"' + (e.reverse ? ' checked' : '') + '> Reverse</label>')
					+ row('Angle:', num('angle', e.angle, '°', -180, 180));
			}
			else {
				html += row('Blend Mode:', select('blend', BLEND_NAMES, e.blend) + swatch('color', e.color))
					+ row('Opacity:', num('opacity', e.opacity, '%', 0, 100));
				if ('angle' in e) {
					html += row('Angle:', num('angle', e.angle, '°', -180, 180))
						+ row('Distance:', num('distance', e.distance, 'px', 0, 30000));
				}
				if ('size' in e) {
					html += row('Size:', num('size', e.size, 'px', 0, 250));
				}
			}
		}
		panel.innerHTML = html;
		var target = () => key == 'blending' ? null : state.styles[key];
		panel.querySelectorAll('[data-field]').forEach((input) => {
			var update = () => {
				var field = input.dataset.field;
				var value = input.type == 'checkbox' ? input.checked : (input.type == 'number' ? parseFloat(input.value) : input.value);
				if (input.type == 'number' && isNaN(value)) return;
				if (key == 'blending') {
					if (field == 'composition') state.composition = BLEND[value] || 'source-over';
					else state[field] = value;
				}
				else {
					target()[field] = value;
				}
				apply_preview();
			};
			input.addEventListener('input', update);
			input.addEventListener('change', update);
		});
		panel.querySelectorAll('[data-color]').forEach((button) => {
			button.addEventListener('click', () => {
				var field = button.dataset.color;
				app.GUI.Ps_workspace.color_dialog('Color', target()[field], (hex) => {
					target()[field] = hex;
					button.style.background = hex;
					apply_preview();
				});
			});
		});
	}

	clear(layer) {
		layer = layer || config.layer;
		if (!layer || !this.has(layer)) return;
		return app.State.do_action(new app.Actions.Bundle_action('clear_layer_style', 'Clear Layer Style', [
			new app.Actions.Update_layer_action(layer.id, { ps_styles: {} }),
		])).then(() => app.GUI.GUI_layers.render_layers());
	}

	copy(layer) {
		layer = layer || config.layer;
		this.clipboard = JSON.parse(JSON.stringify({ styles: layer.ps_styles || {}, fill: layer.ps_fill }));
	}

	paste(layer) {
		layer = layer || config.layer;
		if (!this.clipboard || !layer) return;
		return app.State.do_action(new app.Actions.Bundle_action('paste_layer_style', 'Paste Layer Style', [
			new app.Actions.Update_layer_action(layer.id, { ps_styles: JSON.parse(JSON.stringify(this.clipboard.styles)), ps_fill: this.clipboard.fill }),
		])).then(() => app.GUI.GUI_layers.render_layers());
	}
}

export default Ps_styles_class;
export { DEFAULTS as STYLE_DEFAULTS };
