/*
 * pshot - CS6 adjustment layers. A 'ps_adjust' layer changes everything
 * composited below it (respecting its opacity and layer mask) at render time.
 * layer.ps_adjust = { kind, state }.
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';

function hex_rgb(hex) {
	return { r: parseInt(hex.substr(1, 2), 16), g: parseInt(hex.substr(3, 2), 16), b: parseInt(hex.substr(5, 2), 16) };
}

function rgb_hex(c) {
	if (!c || c.r === undefined) return '#000000';
	var h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
	return '#' + h(c.r) + h(c.g) + h(c.b);
}

const KINDS = {
	brightness_contrast: { title: 'Brightness/Contrast', dialog: 'brightness_contrast' },
	levels: { title: 'Levels', dialog: 'levels' },
	curves: { title: 'Curves', dialog: 'curves' },
	hue_saturation: { title: 'Hue/Saturation', dialog: 'hue_saturation' },
	black_white: { title: 'Black & White' },
	exposure: { title: 'Exposure', dialog: 'exposure' },
	vibrance: { title: 'Vibrance', dialog: 'vibrance' },
	color_balance: { title: 'Color Balance', dialog: 'color_balance' },
	photo_filter: { title: 'Photo Filter', dialog: 'photo_filter' },
	channel_mixer: { title: 'Channel Mixer', dialog: 'channel_mixer' },
	gradient_map: { title: 'Gradient Map', dialog: 'gradient_map' },
	invert: { title: 'Invert' },
	posterize: { title: 'Posterize', state: { levels: 4 } },
	threshold: { title: 'Threshold', state: { level: 128 } },
};

class Ps_adjustment_layers_class {

	kinds() {
		return KINDS;
	}

	adjust() {
		return app.GUI.modules['ps/commands'].Adjust;
	}

	/**
	 * (src, dst) pixel function for an adjustment
	 */
	pixel_fn(adj) {
		var state = adj.state || {};
		switch (adj.kind) {
			case 'brightness_contrast': return this.adjust().build_brightness_contrast(Object.assign({ b: 0, c: 0, legacy: false }, state));
			case 'levels': return state.values ? this.adjust().build_levels(state) : null;
			case 'curves': return state.points ? this.adjust().build_curves(state) : null;
			case 'hue_saturation': return this.adjust().build_hue_saturation(Object.assign({ h: 0, s: 0, l: 0, colorize: false }, state));
			case 'exposure': return this.adjust().build_exposure(state);
			case 'vibrance': return this.adjust().build_vibrance(state);
			case 'color_balance': return this.adjust().build_color_balance(state);
			case 'photo_filter': return this.adjust().build_photo_filter(state);
			case 'channel_mixer': return this.adjust().build_channel_mixer(state);
			case 'gradient_map': return this.adjust().build_gradient_map(state);
			case 'invert': return (src, dst) => {
				for (var i = 0; i < src.length; i += 4) { dst[i] = 255 - src[i]; dst[i + 1] = 255 - src[i + 1]; dst[i + 2] = 255 - src[i + 2]; }
			};
			case 'black_white': return (src, dst) => {
				for (var i = 0; i < src.length; i += 4) {
					var v = src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114;
					dst[i] = dst[i + 1] = dst[i + 2] = v;
				}
			};
			case 'posterize': {
				var n = Math.max(2, Math.min(255, state.levels || 4));
				var lut = new Uint8ClampedArray(256);
				for (var x = 0; x < 256; x++) lut[x] = Math.round(Math.round(x / 255 * (n - 1)) / (n - 1) * 255);
				return (src, dst) => {
					for (var i = 0; i < src.length; i += 4) { dst[i] = lut[src[i]]; dst[i + 1] = lut[src[i + 1]]; dst[i + 2] = lut[src[i + 2]]; }
				};
			}
			case 'threshold': {
				var level = state.level == null ? 128 : state.level;
				return (src, dst) => {
					for (var i = 0; i < src.length; i += 4) {
						var v = (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) >= level ? 255 : 0;
						dst[i] = dst[i + 1] = dst[i + 2] = v;
					}
				};
			}
		}
		return null;
	}

	/**
	 * render step: adjust what's on ctx so far (screen pixels)
	 */
	apply(ctx, layer, group_opacity) {
		var fn = this.pixel_fn(layer.ps_adjust || {});
		if (!fn) {
			return;
		}
		var w = ctx.canvas.width, h = ctx.canvas.height;
		if (!w || !h) return;
		var img = ctx.getImageData(0, 0, w, h);
		var src = img.data;
		var dst = new Uint8ClampedArray(src);
		fn(src, dst);
		var opacity = (layer.opacity == null ? 100 : layer.opacity) / 100 * (group_opacity == null ? 1 : group_opacity);
		var mask = null;
		if (layer.ps_mask && !layer.ps_mask_disabled) {
			var mc = document.createElement('canvas');
			mc.width = w;
			mc.height = h;
			var mctx = mc.getContext('2d');
			mctx.setTransform(ctx.getTransform());
			mctx.drawImage(layer.ps_mask, (layer.x || 0) - layer.ps_mask_x, (layer.y || 0) - layer.ps_mask_y);
			mask = mctx.getImageData(0, 0, w, h).data;
		}
		if (opacity < 1 || mask) {
			for (var i = 0; i < src.length; i += 4) {
				var m = opacity * (mask ? mask[i + 3] / 255 : 1);
				if (m >= 1) continue;
				dst[i] = src[i] + (dst[i] - src[i]) * m;
				dst[i + 1] = src[i + 1] + (dst[i + 1] - src[i + 1]) * m;
				dst[i + 2] = src[i + 2] + (dst[i + 2] - src[i + 2]) * m;
			}
		}
		img.data.set(dst);
		ctx.putImageData(img, 0, 0);
	}

	next_name(title) {
		var n = 0;
		var re = new RegExp('^' + title.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + ' (\\d+)$');
		for (var l of config.layers) {
			var m = re.exec(l.name);
			if (m) n = Math.max(n, parseInt(m[1]));
		}
		return title + ' ' + (n + 1);
	}

	/**
	 * Adjustments panel / Layer > New Adjustment Layer
	 */
	async create(kind) {
		var info = KINDS[kind];
		if (!info) return;
		var mask = document.createElement('canvas');
		mask.width = config.WIDTH;
		mask.height = config.HEIGHT;
		var mctx = mask.getContext('2d');
		mctx.fillStyle = '#fff';
		mctx.fillRect(0, 0, mask.width, mask.height);
		await app.State.do_action(new app.Actions.Bundle_action('new_adjustment', 'New ' + info.title + ' Layer', [
			new app.Actions.Insert_layer_action({
				type: 'ps_adjust',
				name: this.next_name(info.title),
				x: 0, y: 0, width: config.WIDTH, height: config.HEIGHT,
				ps_adjust: { kind: kind, state: JSON.parse(JSON.stringify(info.state || {})) },
			}, false),
		]));
		var layer = config.layer;
		layer.ps_mask = mask;
		layer.ps_mask_x = 0;
		layer.ps_mask_y = 0;
		layer.ps_mask_editing = true;
		app.GUI.GUI_layers.render_layers();
		config.need_render = true;
		this.edit(layer);
	}

	/**
	 * Properties: CS6 edits adjustment settings in the Properties panel; pshot
	 * opens the matching dialog
	 */
	edit(layer) {
		var adj = layer.ps_adjust;
		var info = KINDS[adj.kind];
		if (info.dialog) {
			var Adjust = this.adjust();
			Adjust.layer_mode = { layer: layer, description: 'Modify ' + info.title + ' Layer' };
			Adjust[info.dialog]();
			return;
		}
		if (adj.kind == 'posterize' || adj.kind == 'threshold') {
			var key = adj.kind == 'posterize' ? 'levels' : 'level';
			var original = JSON.parse(JSON.stringify(adj));
			var POP = new Dialog_class();
			POP.show({
				title: info.title,
				params: [{ name: 'value', title: adj.kind == 'posterize' ? 'Levels:' : 'Threshold Level:', value: adj.state[key], range: adj.kind == 'posterize' ? [2, 255] : [1, 255] }],
				on_change: (params) => {
					layer.ps_adjust = { kind: adj.kind, state: { [key]: parseInt(params.value) } };
					config.need_render = true;
				},
				on_finish: (params) => {
					layer.ps_adjust = original;
					app.State.do_action(new app.Actions.Bundle_action('adjustment_layer', 'Modify ' + info.title + ' Layer', [
						new app.Actions.Update_layer_action(layer.id, { ps_adjust: { kind: adj.kind, state: { [key]: parseInt(params.value) } } }),
					]));
				},
				on_cancel: () => {
					layer.ps_adjust = original;
					config.need_render = true;
				},
			});
		}
	}

	// ---------- PSD ----------

	to_psd(adj) {
		var s = adj.state || {};
		switch (adj.kind) {
			case 'brightness_contrast': return { type: 'brightness/contrast', brightness: s.b || 0, contrast: s.c || 0, useLegacy: !!s.legacy };
			case 'invert': return { type: 'invert' };
			case 'posterize': return { type: 'posterize', levels: s.levels || 4 };
			case 'threshold': return { type: 'threshold', level: s.level == null ? 128 : s.level };
			case 'black_white': return { type: 'black & white', reds: 40, yellows: 60, greens: 40, cyans: 60, blues: 20, magentas: 80 };
			case 'hue_saturation': return { type: 'hue/saturation', colorize: !!s.colorize, master: { a: 0, b: 0, c: 0, d: 0, hue: s.h || 0, saturation: s.s || 0, lightness: s.l || 0 } };
			case 'exposure': return { type: 'exposure', exposure: s.exposure || 0, offset: s.offset || 0, gamma: s.gamma || 1 };
			case 'vibrance': return { type: 'vibrance', vibrance: s.vibrance || 0, saturation: s.saturation || 0 };
			case 'photo_filter': return { type: 'photo filter', color: hex_rgb(s.color || '#ec8a00'), density: s.density == null ? 25 : s.density, preserveLuminosity: s.preserve !== false };
			case 'color_balance': {
				var t = s.tones || { Shadows: [0, 0, 0], Midtones: [0, 0, 0], Highlights: [0, 0, 0] };
				var cb = (v) => ({ cyanRed: v[0], magentaGreen: v[1], yellowBlue: v[2] });
				return { type: 'color balance', shadows: cb(t.Shadows), midtones: cb(t.Midtones), highlights: cb(t.Highlights), preserveLuminosity: s.preserve !== false };
			}
			case 'channel_mixer': {
				var m = s.matrix || { Red: [100, 0, 0, 0], Green: [0, 100, 0, 0], Blue: [0, 0, 100, 0] };
				var ch = (v) => ({ red: v[0], green: v[1], blue: v[2], constant: v[3] });
				return { type: 'channel mixer', monochrome: !!s.mono, red: ch(m.Red), green: ch(m.Green), blue: ch(m.Blue) };
			}
			case 'gradient_map': return { type: 'gradient map', gradientType: 'solid', name: 'Custom', reverse: !!s.reverse,
				colorStops: [{ color: hex_rgb(s.c1 || '#000000'), location: 0, midpoint: 50 }, { color: hex_rgb(s.c2 || '#ffffff'), location: 4096, midpoint: 50 }],
				opacityStops: [{ opacity: 1, location: 0, midpoint: 50 }, { opacity: 1, location: 4096, midpoint: 50 }] };
			case 'levels': {
				if (!s.values) return { type: 'levels' };
				var ch = (v) => ({ shadowInput: v.ib, highlightInput: v.iw, shadowOutput: v.ob, highlightOutput: v.ow, midtoneInput: v.g });
				return { type: 'levels', rgb: ch(s.values.RGB), red: ch(s.values.Red), green: ch(s.values.Green), blue: ch(s.values.Blue) };
			}
			case 'curves': {
				if (!s.points) return { type: 'curves' };
				var pts = (list) => list.slice().sort((a, b) => a.x - b.x).map(p => ({ input: p.x, output: p.y }));
				return { type: 'curves', rgb: pts(s.points.RGB), red: pts(s.points.Red), green: pts(s.points.Green), blue: pts(s.points.Blue) };
			}
		}
		return null;
	}

	from_psd(a) {
		if (!a) return null;
		switch (a.type) {
			case 'brightness/contrast': return { kind: 'brightness_contrast', state: { b: a.brightness || 0, c: a.contrast || 0, legacy: !!a.useLegacy } };
			case 'invert': return { kind: 'invert', state: {} };
			case 'posterize': return { kind: 'posterize', state: { levels: a.levels || 4 } };
			case 'threshold': return { kind: 'threshold', state: { level: a.level == null ? 128 : a.level } };
			case 'black & white': return { kind: 'black_white', state: {} };
			case 'hue/saturation': {
				var m = a.master || {};
				return { kind: 'hue_saturation', state: { h: m.hue || 0, s: m.saturation || 0, l: m.lightness || 0, colorize: !!a.colorize } };
			}
			case 'exposure': return { kind: 'exposure', state: { exposure: a.exposure || 0, offset: a.offset || 0, gamma: a.gamma || 1 } };
			case 'vibrance': return { kind: 'vibrance', state: { vibrance: a.vibrance || 0, saturation: a.saturation || 0 } };
			case 'photo filter': return { kind: 'photo_filter', state: { color: rgb_hex(a.color), density: a.density == null ? 25 : a.density, preserve: a.preserveLuminosity !== false, filter: 'Custom' } };
			case 'color balance': {
				var cbv = (v) => v ? [v.cyanRed || 0, v.magentaGreen || 0, v.yellowBlue || 0] : [0, 0, 0];
				return { kind: 'color_balance', state: { tones: { Shadows: cbv(a.shadows), Midtones: cbv(a.midtones), Highlights: cbv(a.highlights) }, preserve: a.preserveLuminosity !== false } };
			}
			case 'channel mixer': {
				var cm = (v, d) => v ? [v.red || 0, v.green || 0, v.blue || 0, v.constant || 0] : d;
				return { kind: 'channel_mixer', state: { mono: !!a.monochrome, matrix: { Red: cm(a.red, [100, 0, 0, 0]), Green: cm(a.green, [0, 100, 0, 0]), Blue: cm(a.blue, [0, 0, 100, 0]) } } };
			}
			case 'gradient map': {
				var stops = a.colorStops || [];
				return { kind: 'gradient_map', state: { c1: rgb_hex(stops[0] && stops[0].color), c2: rgb_hex(stops[stops.length - 1] && stops[stops.length - 1].color), reverse: !!a.reverse } };
			}
			case 'levels': {
				var ch = (c) => c ? { ib: c.shadowInput, g: c.midtoneInput || 1, iw: c.highlightInput, ob: c.shadowOutput, ow: c.highlightOutput } : { ib: 0, g: 1, iw: 255, ob: 0, ow: 255 };
				return { kind: 'levels', state: { values: { RGB: ch(a.rgb), Red: ch(a.red), Green: ch(a.green), Blue: ch(a.blue) } } };
			}
			case 'curves': {
				var pts = (c) => c && c.length ? c.map(p => ({ x: p.input, y: p.output })) : [{ x: 0, y: 0 }, { x: 255, y: 255 }];
				return { kind: 'curves', state: { points: { RGB: pts(a.rgb), Red: pts(a.red), Green: pts(a.green), Blue: pts(a.blue) } } };
			}
		}
		return null;
	}
}

export default Ps_adjustment_layers_class;
