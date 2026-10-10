/*
 * pshot - CS6 Layer > Copy CSS (layer context menu): CSS for the selected
 * shape, type or pixel layers (position, size, fill, stroke, corner radius,
 * opacity, blend mode and the layer styles that have a CSS form), copied to
 * the clipboard.
 */

import app from './../app.js';
import config from './../config.js';

const BLEND = { Multiply: 'multiply', Screen: 'screen', Overlay: 'overlay', Darken: 'darken', Lighten: 'lighten', 'Color Dodge': 'color-dodge', 'Color Burn': 'color-burn', 'Soft Light': 'soft-light', 'Hard Light': 'hard-light', Difference: 'difference', Exclusion: 'exclusion', Hue: 'hue', Saturation: 'saturation', Color: 'color', Luminosity: 'luminosity' };
const COMPOSITION = { multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten', 'color-dodge': 'color-dodge', 'color-burn': 'color-burn', 'soft-light': 'soft-light', 'hard-light': 'hard-light', difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity' };

function rgba(hex, opacity) {
	hex = hex || '#000000';
	var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
	var a = opacity == null ? 1 : opacity / 100;
	return a >= 1 ? hex.toLowerCase() : 'rgba(' + r + ', ' + g + ', ' + b + ', ' + +a.toFixed(2) + ')';
}

function class_name(name) {
	var n = String(name || 'layer').trim().replace(/[^\w-]+/g, '_').replace(/^(\d)/, '_$1');
	return n || 'layer';
}

/**
 * the layer's box in the document (alpha bounds for pixel layers)
 */
function box(layer) {
	if (layer.type == 'ps_shape' && layer.ps_shape) {
		var s = layer.ps_shape;
		return { x: Math.round(s.bx), y: Math.round(s.by), w: Math.round(s.bw), h: Math.round(s.bh) };
	}
	var c = app.Layers.convert_layer_to_canvas(layer.id, false, false);
	var b = app.GUI.Ps_workspace.Transform.alpha_bounds(c);
	return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : { x: Math.round(layer.x), y: Math.round(layer.y), w: Math.round(layer.width), h: Math.round(layer.height) };
}

function css_for(layer) {
	var b = box(layer), lines = [];
	var p = (k, v) => lines.push('  ' + k + ': ' + v + ';');
	p('position', 'absolute');
	p('left', b.x + 'px');
	p('top', b.y + 'px');
	var st = layer.ps_styles || {}, on = (k) => st[k] && st[k].enabled;
	if (layer.type == 'text') {
		var meta = (((layer.data || [])[0] || [])[0] || {}).meta || {};
		var text = (layer.data || []).map(line => line.map(s => s.text).join('')).join(' ');
		p('width', b.w + 'px');
		p('height', b.h + 'px');
		p('font-family', '"' + (meta.family || 'Arial') + '"');
		p('font-size', (meta.size || 40) + 'px');
		if (meta.bold) p('font-weight', 'bold');
		if (meta.italic) p('font-style', 'italic');
		if (meta.kerning) p('letter-spacing', +(meta.kerning / 1000).toFixed(3) + 'em');
		if (meta.leading) p('line-height', meta.leading + 'px');
		p('color', rgba(on('color_overlay') ? st.color_overlay.color : (meta.fill_color || '#000000')));
		if (layer.params && layer.params.halign && layer.params.halign != 'left') p('text-align', layer.params.halign);
		if (on('drop_shadow')) {
			var ds = st.drop_shadow, a = (ds.angle || 120) * Math.PI / 180;
			p('text-shadow', Math.round(-Math.cos(a) * ds.distance) + 'px ' + Math.round(Math.sin(a) * ds.distance) + 'px ' + (ds.size || 0) + 'px ' + rgba(ds.color, ds.opacity));
		}
		lines.unshift('  /* ' + text.replace(/\*\//g, '') + ' */');
	}
	else {
		p('width', b.w + 'px');
		p('height', b.h + 'px');
		if (layer.type == 'ps_shape' && layer.ps_shape) {
			var sh = layer.ps_shape;
			if (on('gradient_overlay')) {
				var go = st.gradient_overlay, g = go.gradient;
				var col = (c) => (c == 'fg' ? config.COLOR : (c == 'bg' ? config.BG_COLOR : c));
				var stops = g && g.stops ? g.stops.map(s => rgba(col(s.color)) + ' ' + Math.round(s.pos * 100) + '%') : [rgba(go.color_1) + ' 0%', rgba(go.color_2) + ' 100%'];
				if (go.reverse) stops.reverse();
				p('background-image', 'linear-gradient(' + (90 - (go.angle == null ? 90 : go.angle)) + 'deg, ' + stops.join(', ') + ')');
			}
			else if (sh.fill) p('background-color', rgba(on('color_overlay') ? st.color_overlay.color : sh.fill));
			if (sh.stroke && sh.stroke.width) p('border', sh.stroke.width + 'px solid ' + rgba(sh.stroke.color));
			else if (on('stroke')) p('border', (st.stroke.size || 1) + 'px solid ' + rgba(st.stroke.color, st.stroke.opacity));
			//one closed subpath of 4 curved points: an ellipse; 8 points: a rounded rectangle
			var sp = (sh.subpaths || [])[0];
			if (sp && sh.subpaths.length == 1) {
				var curved = sp.pts.some(q => Math.abs(q.ox - q.x) + Math.abs(q.oy - q.y) > 0.5);
				if (sp.pts.length == 4 && curved) p('border-radius', '50%');
				else if (sp.pts.length == 8 && curved) p('border-radius', Math.round(Math.min(Math.hypot(sp.pts[1].x - sp.pts[0].x, sp.pts[1].y - sp.pts[0].y), Math.hypot(sp.pts[2].x - sp.pts[1].x, sp.pts[2].y - sp.pts[1].y)) / 2) + 'px');
			}
		}
		else {
			p('background-image', 'url("' + class_name(layer.name) + '.png")');
		}
		var shadows = [];
		if (on('drop_shadow')) {
			var d = st.drop_shadow, an = (d.angle || 120) * Math.PI / 180;
			shadows.push(Math.round(-Math.cos(an) * d.distance) + 'px ' + Math.round(Math.sin(an) * d.distance) + 'px ' + (d.size || 0) + 'px ' + Math.round((d.spread || 0) * (d.size || 0) / 100) + 'px ' + rgba(d.color, d.opacity));
		}
		if (on('inner_shadow')) {
			var is = st.inner_shadow, ai = (is.angle || 120) * Math.PI / 180;
			shadows.push('inset ' + Math.round(-Math.cos(ai) * is.distance) + 'px ' + Math.round(Math.sin(ai) * is.distance) + 'px ' + (is.size || 0) + 'px ' + rgba(is.color, is.opacity));
		}
		if (on('outer_glow')) shadows.push('0 0 ' + (st.outer_glow.size || 0) + 'px ' + rgba(st.outer_glow.color, st.outer_glow.opacity));
		if (on('inner_glow')) shadows.push('inset 0 0 ' + (st.inner_glow.size || 0) + 'px ' + rgba(st.inner_glow.color, st.inner_glow.opacity));
		if (shadows.length) p('box-shadow', shadows.join(', '));
	}
	if (layer.opacity != null && layer.opacity < 100) p('opacity', +(layer.opacity / 100).toFixed(2));
	if (COMPOSITION[layer.composition]) p('mix-blend-mode', COMPOSITION[layer.composition]);
	if (layer.ps_fill != null && layer.ps_fill < 100 && layer.type == 'ps_shape') lines.push('  /* fill opacity ' + layer.ps_fill + '% */');
	if (layer.rotate) p('transform', 'rotate(' + layer.rotate + 'deg)');
	return '.' + class_name(layer.name) + ' {\n' + lines.join('\n') + '\n}';
}

function copy_css() {
	var ws = app.GUI.Ps_workspace;
	var layers = ws.Multi.multiple() ? ws.Multi.selected() : [config.layer];
	layers = layers.filter(l => l && l.type != null && l.type != 'ps_group' && l.type != 'ps_adjust');
	if (!layers.length) return null;
	var css = layers.map(css_for).join('\n\n') + '\n';
	try { navigator.clipboard.writeText(css); } catch (e) { /* clipboard blocked */ }
	ws.last_css = css;
	ws.status_message('CSS copied for ' + layers.length + ' layer' + (layers.length == 1 ? '' : 's') + '.');
	return css;
}

export { copy_css, css_for, BLEND as CSS_BLEND };
