/*
 * pshot - CS6 fill layers (Layer > New Fill Layer): live Solid Color, Gradient
 * and Pattern layers that fill the whole document. layer.type = 'ps_fill',
 * layer.ps_fill_layer = { kind: 'solid' | 'gradient' | 'pattern', color,
 * gradient, style, angle, scale, reverse, dither, pattern }. Double-click the
 * thumbnail (or Layer > Layer Content Options) to edit; saved to PSD as fill
 * layers (vectorFill without a vector mask).
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';
import Patterns from './patterns.js';
import { PRESETS, render as render_gradient, css as gradient_css, picker as gradient_picker, editor as gradient_editor, resolve, two_color } from './gradients.js';

const STYLES = ['Linear', 'Radial', 'Angle', 'Reflected', 'Diamond'];

function hex_rgb(hex) {
	return { r: parseInt(hex.substr(1, 2), 16), g: parseInt(hex.substr(3, 2), 16), b: parseInt(hex.substr(5, 2), 16) };
}

function rgb_hex(c) {
	if (!c) return '#000000';
	var h = (v) => Math.max(0, Math.min(255, Math.round(v || 0))).toString(16).padStart(2, '0');
	return '#' + h(c.r) + h(c.g) + h(c.b);
}

class Ps_fill_layers_class {

	/**
	 * the fill as a document-sized canvas (cached per settings)
	 */
	canvas(layer) {
		var f = layer.ps_fill_layer, W = config.WIDTH, H = config.HEIGHT;
		var key = JSON.stringify([f, W, H]);
		if (layer._ps_fill_cache && layer._ps_fill_cache.key == key) return layer._ps_fill_cache.canvas;
		var c;
		if (f.kind == 'gradient') {
			//CS6: centered, the angle measured counter-clockwise, Scale stretches the length
			var a = (f.angle == null ? 90 : f.angle) * Math.PI / 180, s = (f.scale || 100) / 100;
			var cx = W / 2, cy = H / 2, dx = Math.cos(a), dy = -Math.sin(a);
			var len = (Math.abs(dx) * W + Math.abs(dy) * H) / 2 * s;
			var type = (f.style || 'Linear').toLowerCase();
			var x1 = cx - dx * len, y1 = cy - dy * len, x2 = cx + dx * len, y2 = cy + dy * len;
			if (type == 'radial' || type == 'angle' || type == 'diamond') { x1 = cx; y1 = cy; }
			if (type == 'reflected') { x1 = cx; y1 = cy; }
			c = render_gradient(W, H, f.gradient || two_color(config.COLOR, config.BG_COLOR), type, x1, y1, x2, y2, { reverse: f.reverse, dither: f.dither });
		}
		else if (f.kind == 'pattern') {
			c = Patterns.tiled(f.pattern || Patterns.names()[0], W, H, f.scale || 100);
		}
		else {
			c = document.createElement('canvas');
			c.width = W;
			c.height = H;
			var ctx = c.getContext('2d');
			ctx.fillStyle = f.color || '#000000';
			ctx.fillRect(0, 0, W, H);
		}
		layer._ps_fill_cache = { key: key, canvas: c };
		return c;
	}

	render(ctx, layer) {
		if (!layer.ps_fill_layer) return;
		ctx.drawImage(this.canvas(layer), 0, 0);
	}

	thumb(canvas, layer) {
		var ctx = canvas.getContext('2d'), s = canvas.width;
		ctx.clearRect(0, 0, s, s);
		ctx.drawImage(this.canvas(layer), 0, 0, s, s);
	}

	next_name(base) {
		var n = 1;
		while (config.layers.some(l => l.name == base + ' ' + n)) n++;
		return base + ' ' + n;
	}

	/**
	 * Layer > New Fill Layer > Solid Color / Gradient / Pattern: the settings
	 * dialog, then the layer (the selection becomes its mask)
	 */
	create(kind) {
		var f = kind == 'gradient' ? { kind: 'gradient', gradient: resolve(PRESETS[0]), style: 'Linear', angle: 90, scale: 100, reverse: false, dither: false }
			: (kind == 'pattern' ? { kind: 'pattern', pattern: Patterns.names()[0], scale: 100 } : { kind: 'solid', color: config.COLOR });
		var base = { solid: 'Color Fill', gradient: 'Gradient Fill', pattern: 'Pattern Fill' }[kind];
		this.dialog(f, async (settings) => {
			var sel = app.GUI.Ps_workspace.Selection;
			var layer = { name: this.next_name(base), type: 'ps_fill', x: 0, y: 0, width: config.WIDTH, height: config.HEIGHT, is_vector: true, ps_fill_layer: settings };
			if (sel.has()) {
				var mask = document.createElement('canvas');
				mask.width = sel.mask.width;
				mask.height = sel.mask.height;
				mask.getContext('2d').drawImage(sel.mask, 0, 0);
				Object.assign(layer, { ps_mask: mask, ps_mask_x: 0, ps_mask_y: 0 });
			}
			await app.State.do_action(new app.Actions.Bundle_action('fill_layer', 'New Fill Layer', [new app.Actions.Insert_layer_action(layer)]));
			if (sel.has()) sel.deselect();
			app.GUI.GUI_layers.render_layers();
		});
	}

	/**
	 * double-click the thumbnail / Layer Content Options
	 */
	edit(layer) {
		layer = layer || config.layer;
		if (!layer || layer.type != 'ps_fill') return false;
		var before = JSON.parse(JSON.stringify(layer.ps_fill_layer));
		this.dialog(before, (settings) => {
			delete layer._ps_preview;
			app.State.do_action(new app.Actions.Bundle_action('fill_layer', 'Change Fill Layer', [
				new app.Actions.Update_layer_action(layer.id, { ps_fill_layer: settings }),
			]));
		}, (preview) => {
			//live preview without History
			layer.ps_fill_layer = preview;
			config.need_render = true;
		}, () => {
			layer.ps_fill_layer = before;
			config.need_render = true;
		});
		return true;
	}

	dialog(initial, on_ok, on_preview, on_cancel) {
		var f = JSON.parse(JSON.stringify(initial));
		if (f.kind == 'solid') {
			app.GUI.Ps_workspace.color_dialog('Pick a solid color:', f.color || config.COLOR, (hex) => on_ok(Object.assign(f, { color: hex })));
			return;
		}
		var POP = new Dialog_class();
		var params;
		if (f.kind == 'gradient') {
			params = [
				{ title: 'Gradient:', html: '<span class="ps_adj_gradient" id="gf_preview" title="Click to edit the gradient"></span><span class="ps_caret" id="gf_caret" title="Gradient presets">&#9662;</span>' },
				{ name: 'style', title: 'Style:', values: STYLES, value: f.style || 'Linear', type: 'select' },
				{ name: 'angle', title: 'Angle:', value: f.angle == null ? 90 : f.angle, range: [-180, 180] },
				{ name: 'scale', title: 'Scale (%):', value: f.scale || 100, range: [10, 150] },
				{ name: 'reverse', title: 'Reverse', value: !!f.reverse },
				{ name: 'dither', title: 'Dither', value: !!f.dither },
			];
		}
		else {
			params = [
				{ name: 'pattern', title: 'Pattern:', values: Patterns.names(), value: f.pattern || Patterns.names()[0], type: 'select' },
				{ name: 'scale', title: 'Scale (%):', value: f.scale || 100, range: [1, 1000] },
			];
		}
		var read = (p) => {
			if (f.kind == 'gradient') Object.assign(f, { style: p.style, angle: parseFloat(p.angle) || 0, scale: parseFloat(p.scale) || 100, reverse: !!p.reverse, dither: !!p.dither });
			else Object.assign(f, { pattern: p.pattern, scale: parseFloat(p.scale) || 100 });
			return JSON.parse(JSON.stringify(f));
		};
		POP.show({
			title: f.kind == 'gradient' ? 'Gradient Fill' : 'Pattern Fill',
			params: params,
			on_load: (p, pop) => {
				if (f.kind != 'gradient') return;
				var preview = pop.el.querySelector('#gf_preview');
				var paint = () => { preview.style.background = gradient_css(f.gradient); };
				var set = (g) => { f.gradient = resolve(g); paint(); if (on_preview) on_preview(JSON.parse(JSON.stringify(f))); };
				preview.addEventListener('click', () => gradient_editor(f.gradient, set, (g) => set(g)));
				pop.el.querySelector('#gf_caret').addEventListener('click', (e) => gradient_picker(e.currentTarget, set));
				paint();
			},
			on_change: (p) => { if (on_preview) on_preview(read(p)); },
			on_finish: (p) => on_ok(read(p)),
			on_cancel: () => { if (on_cancel) on_cancel(); },
		});
	}

	/**
	 * Layer > Rasterize > Fill Content
	 */
	async rasterize(layer) {
		layer = layer || config.layer;
		if (!layer || layer.type != 'ps_fill') return;
		var c = this.canvas(layer);
		var copy = document.createElement('canvas');
		copy.width = c.width;
		copy.height = c.height;
		copy.getContext('2d').drawImage(c, 0, 0);
		await app.State.do_action(new app.Actions.Bundle_action('rasterize', 'Rasterize Fill Content', [
			new app.Actions.Update_layer_action(layer.id, {
				type: 'image', x: 0, y: 0, width: copy.width, height: copy.height, width_original: copy.width, height_original: copy.height,
				is_vector: false, ps_fill_layer: null, render_function: null,
			}),
			new app.Actions.Update_layer_image_action(copy, layer.id),
		]));
		app.GUI.GUI_layers.render_layers();
	}

	// ---------- PSD ----------

	to_psd(layer) {
		var f = layer.ps_fill_layer;
		if (f.kind == 'gradient') {
			var g = resolve(f.gradient || two_color(config.COLOR, config.BG_COLOR));
			return { vectorFill: {
				type: 'solid', name: g.name || 'Custom', style: (f.style || 'Linear').toLowerCase(), angle: f.angle == null ? 90 : f.angle, scale: f.scale || 100,
				reverse: !!f.reverse, dither: !!f.dither, align: true,
				colorStops: g.stops.map(s => ({ color: hex_rgb(s.color), location: Math.round(s.pos * 4096), midpoint: 50 })),
				opacityStops: (g.alphas || []).map(o => ({ opacity: o.a, location: Math.round(o.pos * 4096), midpoint: 50 })),
			} };
		}
		if (f.kind == 'pattern') return { vectorFill: { type: 'pattern', name: f.pattern, id: f.pattern } };
		return { vectorFill: { type: 'color', color: hex_rgb(f.color || '#000000') } };
	}

	/**
	 * a PSD fill layer (vectorFill without a vector mask) -> settings, or null
	 */
	from_psd(child, W, H) {
		var v = child.vectorFill;
		if (!v || child.vectorMask) return null;
		var f;
		if (v.type == 'color') f = { kind: 'solid', color: rgb_hex(v.color) };
		else if (v.type == 'pattern') f = { kind: 'pattern', pattern: Patterns.names().includes(v.name) ? v.name : Patterns.names()[0], scale: 100 };
		else if (v.type == 'solid') {
			var loc = (x, i, n) => (x == null ? (n > 1 ? i / (n - 1) : 0) : (x > 1 ? x / 4096 : x));
			var cs = v.colorStops || [], os = v.opacityStops || [];
			var g = { name: v.name || 'Custom', stops: cs.map((s, i) => ({ pos: loc(s.location, i, cs.length), color: rgb_hex(s.color) })),
				alphas: os.length ? os.map((o, i) => ({ pos: loc(o.location, i, os.length), a: o.opacity == null ? 1 : o.opacity })) : [{ pos: 0, a: 1 }, { pos: 1, a: 1 }] };
			if (g.stops.length < 2) g = two_color('#000000', '#ffffff');
			var style = (v.style || 'linear');
			f = { kind: 'gradient', gradient: g, style: style.charAt(0).toUpperCase() + style.slice(1), angle: v.angle == null ? 90 : v.angle, scale: v.scale || 100, reverse: !!v.reverse, dither: !!v.dither };
		}
		else return null;
		return { name: child.name || 'Fill', type: 'ps_fill', x: 0, y: 0, width: W, height: H, is_vector: true, ps_fill_layer: f };
	}
}

export default Ps_fill_layers_class;
