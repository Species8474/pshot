/*
 * pshot - CS6 layer styles (fx): Drop Shadow, Inner Shadow, Outer Glow,
 * Inner Glow, Stroke, Bevel & Emboss, Satin, Color Overlay, Gradient Overlay,
 * plus Fill Opacity.
 *
 * layer.ps_styles = { drop_shadow: {...}, ... }; each entry has `enabled`.
 * Effects are drawn at render time (non-destructive) from the layer's alpha.
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';
import Patterns from './patterns.js';

const BLEND = {
	'Normal': 'source-over', 'Multiply': 'multiply', 'Screen': 'screen', 'Overlay': 'overlay', 'Darken': 'darken',
	'Lighten': 'lighten', 'Color Dodge': 'color-dodge', 'Color Burn': 'color-burn', 'Linear Dodge (Add)': 'lighter',
	'Soft Light': 'soft-light', 'Hard Light': 'hard-light', 'Difference': 'difference', 'Exclusion': 'exclusion',
	'Hue': 'hue', 'Saturation': 'saturation', 'Color': 'color', 'Luminosity': 'luminosity',
};
const BLEND_NAMES = Object.keys(BLEND);

//CS6 contour presets: t (0..1 along the edge) -> 0..1
const CONTOURS = {
	'Linear': (t) => t,
	'Cone': (t) => 1 - Math.abs(2 * t - 1),
	'Cone - Inverted': (t) => Math.abs(2 * t - 1),
	'Cove - Deep': (t) => t * t * t,
	'Cove - Shallow': (t) => t * t,
	'Gaussian': (t) => t * t * (3 - 2 * t),
	'Half Round': (t) => Math.sqrt(1 - (1 - t) * (1 - t)),
	'Ring': (t) => Math.sin(t * Math.PI),
	'Ring - Double': (t) => Math.abs(Math.sin(t * Math.PI * 2)),
	'Rolling Slope - Descending': (t) => 1 - t + Math.sin(t * Math.PI) * 0.3,
	'Rounded Steps': (t) => { var s = Math.floor(t * 4) / 4, f = t * 4 - Math.floor(t * 4); return Math.min(1, s + (f * f * (3 - 2 * f)) / 4); },
	'Sawtooth 1': (t) => (t * 3) % 1,
};
const CONTOUR_NAMES = Object.keys(CONTOURS);

// CS6 defaults
const DEFAULTS = {
	drop_shadow: { enabled: false, blend: 'Multiply', color: '#000000', opacity: 75, angle: 120, distance: 5, size: 5, contour: 'Linear' },
	inner_shadow: { enabled: false, blend: 'Multiply', color: '#000000', opacity: 75, angle: 120, distance: 5, size: 5, contour: 'Linear' },
	outer_glow: { enabled: false, blend: 'Screen', color: '#ffffbe', opacity: 75, size: 5, contour: 'Linear' },
	inner_glow: { enabled: false, blend: 'Screen', color: '#ffffbe', opacity: 75, size: 5, contour: 'Linear' },
	stroke: { enabled: false, blend: 'Normal', color: '#ff0000', opacity: 100, size: 3, position: 'Outside' },
	bevel: { enabled: false, style: 'Inner Bevel', technique: 'Smooth', depth: 100, direction: 'Up', size: 5, soften: 0, angle: 120, altitude: 30,
		highlight_blend: 'Screen', highlight_color: '#ffffff', highlight_opacity: 75, shadow_blend: 'Multiply', shadow_color: '#000000', shadow_opacity: 75,
		contour_on: false, contour: 'Linear', contour_range: 50, texture_on: false, texture_pattern: 'Checkerboard', texture_scale: 100, texture_depth: 100, texture_invert: false },
	satin: { enabled: false, blend: 'Multiply', color: '#000000', opacity: 50, angle: 19, distance: 11, size: 14, invert: true },
	color_overlay: { enabled: false, blend: 'Normal', color: '#ff0000', opacity: 100 },
	gradient_overlay: { enabled: false, blend: 'Normal', opacity: 100, color_1: '#000000', color_2: '#ffffff', angle: 90, reverse: false },
	pattern_overlay: { enabled: false, blend: 'Normal', opacity: 100, pattern: 'Checkerboard', scale: 100 },
};

// left column of the CS6 Layer Style dialog (null = not available yet)
const LIST = [
	['blending', 'Blending Options: Default'],
	['bevel', 'Bevel & Emboss'], ['bevel_contour', 'Contour'], ['bevel_texture', 'Texture'],
	['stroke', 'Stroke'],
	['inner_shadow', 'Inner Shadow'],
	['inner_glow', 'Inner Glow'],
	['satin', 'Satin'],
	['color_overlay', 'Color Overlay'],
	['gradient_overlay', 'Gradient Overlay'],
	['pattern_overlay', 'Pattern Overlay'],
	['outer_glow', 'Outer Glow'],
	['drop_shadow', 'Drop Shadow'],
];

const TITLES = {};
for (const [key, title] of LIST) if (key) TITLES[key] = title;
//Contour and Texture are parts of Bevel & Emboss
const SUB = { bevel_contour: 'contour_on', bevel_texture: 'texture_on' };

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
		if (!s || config.ps_fx_hidden) return false;
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

	alpha_of(canvas) {
		var d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
		var a = new Float32Array(canvas.width * canvas.height);
		for (var i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] / 255;
		return a;
	}

	blurred(src, blur) {
		var out = canvas_like(src);
		var ctx = out.getContext('2d');
		if (blur > 0) ctx.filter = 'blur(' + blur + 'px)';
		ctx.drawImage(src, 0, 0);
		return out;
	}

	/**
	 * a canvas of `color` whose alpha is `alpha` (0..1 per pixel) times opacity
	 */
	from_alpha(w, h, alpha, color, opacity) {
		var out = document.createElement('canvas');
		out.width = w;
		out.height = h;
		var ctx = out.getContext('2d');
		var img = ctx.createImageData(w, h);
		var r = parseInt(color.substr(1, 2), 16), g = parseInt(color.substr(3, 2), 16), b = parseInt(color.substr(5, 2), 16);
		for (var i = 0; i < alpha.length; i++) {
			if (alpha[i] <= 0) continue;
			img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b;
			img.data[i * 4 + 3] = Math.min(255, alpha[i] * opacity * 255);
		}
		ctx.putImageData(img, 0, 0);
		return out;
	}

	/**
	 * Bevel & Emboss: shading of a height map built from the layer's alpha.
	 * returns { inner: [highlight, shadow], outer: [highlight, shadow] } canvases
	 */
	bevel(content, e, scale) {
		var w = content.width, h = content.height;
		var size = Math.max(1, e.size * scale);
		var style = e.style || 'Inner Bevel';
		var shape = this.alpha_of(content);
		var height;
		if (style == 'Inner Bevel') {
			//ramp inside the edge: blur of the shape, kept inside
			height = this.alpha_of(this.blurred(this.inverted(content), size / 2));
			for (var i = 0; i < height.length; i++) height[i] = 1 - height[i];
		}
		else if (style == 'Outer Bevel') {
			height = this.alpha_of(this.blurred(content, size / 2));
		}
		else {
			height = this.alpha_of(this.blurred(content, size / 2));
		}
		//Contour: reshape the edge profile (Range 50% = the full contour)
		if (e.contour_on && CONTOURS[e.contour] && e.contour != 'Linear') {
			var cf = CONTOURS[e.contour], mixk = Math.min(1, (e.contour_range == null ? 50 : e.contour_range) / 50);
			for (var ci = 0; ci < height.length; ci++) height[ci] = height[ci] + (cf(height[ci]) - height[ci]) * mixk;
		}
		//Texture: the pattern's brightness adds relief inside the shape
		if (e.texture_on) {
			var tex = Patterns.tiled(e.texture_pattern || 'Checkerboard', w, h, (e.texture_scale || 100) * scale, 0, 0);
			var td = tex.getContext('2d').getImageData(0, 0, w, h).data, tk = (e.texture_depth == null ? 100 : e.texture_depth) / 100 * 0.25 * (e.texture_invert ? -1 : 1);
			for (var ti = 0; ti < height.length; ti++) {
				var tv = (td[ti * 4] * 0.299 + td[ti * 4 + 1] * 0.587 + td[ti * 4 + 2] * 0.114) / 255;
				height[ti] += (tv - 0.5) * tk * shape[ti];
			}
		}
		var depth = (e.depth == null ? 100 : e.depth) / 100 * (e.direction == 'Down' ? -1 : 1);
		var k = size * depth * 1.5;
		var th = (e.angle || 0) * Math.PI / 180, ph = (e.altitude == null ? 30 : e.altitude) * Math.PI / 180;
		var lx = Math.cos(ph) * Math.cos(th), ly = -Math.cos(ph) * Math.sin(th), lz = Math.sin(ph);
		var hi = new Float32Array(w * h), sh = new Float32Array(w * h);
		for (var y = 1; y < h - 1; y++) {
			for (var x = 1; x < w - 1; x++) {
				var p = y * w + x;
				var gx = (height[p + 1] - height[p - 1]) / 2 * k, gy = (height[p + w] - height[p - w]) / 2 * k;
				if (gx == 0 && gy == 0) continue;
				var len = Math.sqrt(gx * gx + gy * gy + 1);
				var shade = (-gx * lx - gy * ly + lz) / len - lz;
				var inside = shape[p];
				var weight = style == 'Inner Bevel' ? inside : (style == 'Outer Bevel' ? 1 - inside : 1);
				if (shade > 0) hi[p] = Math.min(1, shade / (1 - lz + 0.001)) * weight;
				else sh[p] = Math.min(1, -shade / (lz + 0.001)) * weight;
			}
		}
		var soften = (e.soften || 0) * scale;
		var mk = (a, color, opacity) => {
			var c = this.from_alpha(w, h, a, color, opacity / 100);
			return soften > 0 ? this.blurred(c, soften) : c;
		};
		return [mk(hi, e.highlight_color, e.highlight_opacity), mk(sh, e.shadow_color, e.shadow_opacity)];
	}

	/**
	 * Quality > Contour for shadows and glows: reshape the falloff of a
	 * colored effect canvas (alpha relative to the effect's opacity)
	 */
	contoured(c, e) {
		var f = CONTOURS[e.contour];
		if (!f || e.contour == 'Linear') return c;
		var ctx = c.getContext('2d', { willReadFrequently: true });
		var img = ctx.getImageData(0, 0, c.width, c.height), d = img.data, max = Math.max(1, (e.opacity == null ? 100 : e.opacity) / 100 * 255);
		for (var i = 3; i < d.length; i += 4) {
			if (!d[i]) continue;
			d[i] = Math.max(0, Math.min(1, f(Math.min(1, d[i] / max)))) * max;
		}
		ctx.putImageData(img, 0, 0);
		return c;
	}

	/**
	 * Satin: difference of two offset, blurred copies of the shape
	 */
	satin(content, e, scale) {
		var w = content.width, h = content.height;
		var a = (e.angle || 0) * Math.PI / 180;
		var dx = Math.cos(a) * e.distance * scale, dy = -Math.sin(a) * e.distance * scale;
		var blur = e.size * scale / 2;
		var a1 = this.alpha_of(this.shadow_only(content, '#000000', 100, dx, dy, blur));
		var a2 = this.alpha_of(this.shadow_only(content, '#000000', 100, -dx, -dy, blur));
		var out = new Float32Array(w * h);
		for (var i = 0; i < out.length; i++) {
			var v = Math.abs(a1[i] - a2[i]);
			out[i] = e.invert ? 1 - v : v;
		}
		return this.from_alpha(w, h, out, e.color, e.opacity / 100);
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
			ctx.drawImage(this.contoured(this.shadow_only(content, e.color, e.opacity, o.dx, o.dy, e.size * scale), e), 0, 0);
		}
		if (on('outer_glow')) {
			var g = s.outer_glow;
			ctx.globalCompositeOperation = BLEND[g.blend] || 'screen';
			var glow = this.contoured(this.shadow_only(content, g.color, g.opacity, 0, 0, g.size * scale * 1.2), g);
			ctx.drawImage(glow, 0, 0);
			ctx.drawImage(glow, 0, 0);
		}
		//outer part of Bevel & Emboss
		var bevel = on('bevel') ? this.bevel(content, s.bevel, scale) : null;
		if (bevel && (s.bevel.style || 'Inner Bevel') != 'Inner Bevel') {
			var outside = (c) => {
				var o = canvas_like(content);
				var octx = o.getContext('2d');
				octx.drawImage(c, 0, 0);
				octx.globalCompositeOperation = 'destination-out';
				octx.drawImage(content, 0, 0);
				return o;
			};
			ctx.globalCompositeOperation = BLEND[s.bevel.highlight_blend] || 'screen';
			ctx.drawImage(outside(bevel[0]), 0, 0);
			ctx.globalCompositeOperation = BLEND[s.bevel.shadow_blend] || 'multiply';
			ctx.drawImage(outside(bevel[1]), 0, 0);
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
		if (on('pattern_overlay')) {
			var po = s.pattern_overlay;
			var pc = canvas_like(content);
			var pctx = pc.getContext('2d');
			pctx.globalAlpha = po.opacity / 100;
			pctx.fillStyle = Patterns.pattern(pctx, po.pattern, (po.scale || 100) * scale);
			pctx.fillRect(0, 0, pc.width, pc.height);
			bctx.globalCompositeOperation = BLEND[po.blend] || 'source-over';
			bctx.drawImage(clip_to_shape(pc), 0, 0);
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
		if (on('color_overlay')) {
			var co = s.color_overlay;
			var fillc = canvas_like(content);
			var fctx = fillc.getContext('2d');
			fctx.fillStyle = rgba(co.color, co.opacity / 100);
			fctx.fillRect(0, 0, fillc.width, fillc.height);
			bctx.globalCompositeOperation = BLEND[co.blend] || 'source-over';
			bctx.drawImage(clip_to_shape(fillc), 0, 0);
		}
		if (on('satin')) {
			bctx.globalCompositeOperation = BLEND[s.satin.blend] || 'multiply';
			bctx.drawImage(clip_to_shape(this.satin(content, s.satin, scale)), 0, 0);
		}
		if (on('inner_glow')) {
			var ig = s.inner_glow;
			bctx.globalCompositeOperation = BLEND[ig.blend] || 'screen';
			bctx.drawImage(clip_to_shape(this.contoured(this.shadow_only(this.inverted(content), ig.color, ig.opacity, 0, 0, ig.size * scale * 1.2), ig)), 0, 0);
		}
		if (on('inner_shadow')) {
			var is = s.inner_shadow, io = offset(is);
			bctx.globalCompositeOperation = BLEND[is.blend] || 'multiply';
			bctx.drawImage(clip_to_shape(this.contoured(this.shadow_only(this.inverted(content), is.color, is.opacity, io.dx, io.dy, is.size * scale), is)), 0, 0);
		}
		if (bevel && (s.bevel.style || 'Inner Bevel') != 'Outer Bevel') {
			bctx.globalCompositeOperation = BLEND[s.bevel.highlight_blend] || 'screen';
			bctx.drawImage(clip_to_shape(bevel[0]), 0, 0);
			bctx.globalCompositeOperation = BLEND[s.bevel.shadow_blend] || 'multiply';
			bctx.drawImage(clip_to_shape(bevel[1]), 0, 0);
		}
		ctx.globalCompositeOperation = 'source-over';
		ctx.drawImage(body, 0, 0);
		//Stroke sits above the layer's pixels (CS6)
		if (on('stroke')) {
			var st = s.stroke;
			var r = Math.max(1, st.size * scale);
			var grow = (src, rr) => {
				var g = canvas_like(content);
				var gctx = g.getContext('2d');
				gctx.drawImage(src, 0, 0);
				if (rr <= 0) return g;
				var steps = Math.max(16, Math.round(rr * 4));
				for (var i = 0; i < steps; i++) {
					var a = i / steps * Math.PI * 2;
					for (var k = Math.max(1, rr / 2); k <= rr; k += Math.max(1, rr / 2)) gctx.drawImage(src, Math.cos(a) * k, Math.sin(a) * k);
				}
				return g;
			};
			var erode = (rr) => rr <= 0 ? content : this.inverted(grow(this.inverted(content), rr));
			var pos = st.position || 'Outside';
			var outer = pos == 'Outside' ? grow(content, r) : (pos == 'Center' ? grow(content, r / 2) : content);
			var inner = pos == 'Outside' ? content : erode(pos == 'Center' ? r / 2 : r);
			var ring = canvas_like(content);
			var rctx = ring.getContext('2d');
			rctx.drawImage(outer, 0, 0);
			rctx.globalCompositeOperation = 'destination-out';
			rctx.drawImage(inner, 0, 0);
			rctx.globalCompositeOperation = 'source-in';
			rctx.fillStyle = st.color;
			rctx.fillRect(0, 0, ring.width, ring.height);
			ctx.globalCompositeOperation = BLEND[st.blend] || 'source-over';
			ctx.globalAlpha = st.opacity / 100;
			ctx.drawImage(ring, 0, 0);
			ctx.globalAlpha = 1;
		}

		ctx.globalCompositeOperation = 'source-over';
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
				: '<div class="ps_fx_item' + (k ? '' : ' disabled') + (SUB[k] ? ' ps_fx_sub' : '') + (state.current == k ? ' active' : '') + '" data-key="' + (k || '') + '">'
					+ '<input type="checkbox"' + (k && (SUB[k] ? styles.bevel[SUB[k]] : styles[k].enabled) ? ' checked' : '') + (k ? '' : ' disabled') + ' data-check="' + (k || '') + '"> ' + t + '</div>').join('')
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
				var set_on = (on) => {
					if (SUB[key]) {
						state.styles.bevel[SUB[key]] = on;
						//turning on Contour / Texture turns on Bevel & Emboss
						if (on && !state.styles.bevel.enabled) {
							state.styles.bevel.enabled = true;
							root.querySelector('[data-check="bevel"]').checked = true;
						}
					}
					else state.styles[key].enabled = on;
				};
				var is_on = () => SUB[key] ? state.styles.bevel[SUB[key]] : state.styles[key].enabled;
				if (e.target.matches('input[type="checkbox"]')) {
					set_on(e.target.checked);
					apply_preview();
				}
				else if (key != 'blending' && !is_on()) {
					//CS6: clicking a style name turns it on and shows its settings
					set_on(true);
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
		else if (SUB[key]) {
			var bv = state.styles.bevel;
			if (key == 'bevel_contour') {
				html += '<div class="ps_fx_head">Contour</div><div class="ps_fx_group">Elements</div>'
					+ row('Contour:', select('contour', CONTOUR_NAMES, bv.contour) + '<label class="ps_fx_check disabled"><input type="checkbox" checked disabled> Anti-aliased</label>')
					+ row('Range:', num('contour_range', bv.contour_range, '%', 1, 100));
			}
			else {
				html += '<div class="ps_fx_head">Texture</div><div class="ps_fx_group">Elements</div>'
					+ row('Pattern:', select('texture_pattern', Patterns.names(), bv.texture_pattern))
					+ row('Scale:', num('texture_scale', bv.texture_scale, '%', 1, 1000))
					+ row('Depth:', num('texture_depth', bv.texture_depth, '%', -1000, 1000))
					+ row('', '<label class="ps_fx_check"><input type="checkbox" data-field="texture_invert"' + (bv.texture_invert ? ' checked' : '') + '> Invert</label>'
						+ '<label class="ps_fx_check disabled"><input type="checkbox" checked disabled> Link with Layer</label>');
			}
		}
		else {
			var e = state.styles[key];
			html += '<div class="ps_fx_head">' + TITLES[key] + '</div><div class="ps_fx_group">Structure</div>';
			if (key == 'stroke') {
				html += row('Size:', num('size', e.size, 'px', 1, 250))
					+ row('Position:', select('position', ['Outside', 'Inside', 'Center'], e.position))
					+ row('Blend Mode:', select('blend', BLEND_NAMES, e.blend))
					+ row('Opacity:', num('opacity', e.opacity, '%', 0, 100))
					+ row('Color:', swatch('color', e.color));
			}
			else if (key == 'bevel') {
				html += row('Style:', select('style', ['Outer Bevel', 'Inner Bevel', 'Emboss', 'Pillow Emboss', 'Stroke Emboss'], e.style))
					+ row('Technique:', select('technique', ['Smooth', 'Chisel Hard', 'Chisel Soft'], e.technique))
					+ row('Depth:', num('depth', e.depth, '%', 1, 1000))
					+ row('Direction:', '<label class="ps_fx_check"><input type="radio" name="ps_fx_dir" data-field="direction" value="Up"' + (e.direction != 'Down' ? ' checked' : '') + '> Up</label>'
						+ '<label class="ps_fx_check"><input type="radio" name="ps_fx_dir" data-field="direction" value="Down"' + (e.direction == 'Down' ? ' checked' : '') + '> Down</label>')
					+ row('Size:', num('size', e.size, 'px', 0, 250))
					+ row('Soften:', num('soften', e.soften, 'px', 0, 16))
					+ '<div class="ps_fx_group">Shading</div>'
					+ row('Angle:', num('angle', e.angle, '°', -180, 180))
					+ row('Altitude:', num('altitude', e.altitude, '°', 0, 90))
					+ row('Highlight Mode:', select('highlight_blend', BLEND_NAMES, e.highlight_blend) + swatch('highlight_color', e.highlight_color))
					+ row('Opacity:', num('highlight_opacity', e.highlight_opacity, '%', 0, 100))
					+ row('Shadow Mode:', select('shadow_blend', BLEND_NAMES, e.shadow_blend) + swatch('shadow_color', e.shadow_color))
					+ row('Opacity:', num('shadow_opacity', e.shadow_opacity, '%', 0, 100));
			}
			else if (key == 'pattern_overlay') {
				html += row('Blend Mode:', select('blend', BLEND_NAMES, e.blend))
					+ row('Opacity:', num('opacity', e.opacity, '%', 0, 100))
					+ row('Pattern:', select('pattern', Patterns.names(), e.pattern))
					+ row('Scale:', num('scale', e.scale, '%', 1, 1000));
			}
			else if (key == 'satin') {
				html += row('Blend Mode:', select('blend', BLEND_NAMES, e.blend) + swatch('color', e.color))
					+ row('Opacity:', num('opacity', e.opacity, '%', 0, 100))
					+ row('Angle:', num('angle', e.angle, '°', -180, 180))
					+ row('Distance:', num('distance', e.distance, 'px', 0, 250))
					+ row('Size:', num('size', e.size, 'px', 0, 250))
					+ row('', '<label class="ps_fx_check"><input type="checkbox" data-field="invert"' + (e.invert ? ' checked' : '') + '> Invert</label>');
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
				if ('contour' in e) {
					html += '<div class="ps_fx_group">Quality</div>' + row('Contour:', select('contour', CONTOUR_NAMES, e.contour));
				}
			}
		}
		panel.innerHTML = html;
		var target = () => key == 'blending' ? null : (SUB[key] ? state.styles.bevel : state.styles[key]);
		panel.querySelectorAll('[data-field]').forEach((input) => {
			var update = () => {
				var field = input.dataset.field;
				if (input.type == 'radio' && !input.checked) return;
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
