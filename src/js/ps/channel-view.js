/*
 * pshot - CS6 channel viewing and targeting (Channels panel, Ctrl+2..5):
 * clicking a color channel shows and targets only it (Shift adds more), the
 * eye column shows / hides a channel without targeting it. Display only for
 * viewing: one channel shows as gray (or in its color with Preferences >
 * Interface > Show Channels in Color), two show their mix. While some RGB
 * channels are targeted, pixel edits change only those channels (and keep
 * the layer's transparency), like CS6.
 */

import app from './../app.js';
import config from './../config.js';
import { channel_value } from './proof.js';

const TINT = { 0: [255, 0, 0], 1: [0, 255, 0], 2: [0, 0, 255], c: [0, 174, 239], m: [236, 0, 140], y: [255, 242, 0], k: [0, 0, 0] };

class Ps_channel_view_class {

	/**
	 * the color channels of the document's mode
	 */
	keys() {
		return { Grayscale: [], CMYK: ['c', 'm', 'y', 'k'], Lab: ['L', 'a', 'b'], Multichannel: ['c', 'm', 'y'] }[config.ps_mode] || [0, 1, 2];
	}

	state() {
		var all = this.keys();
		var s = config.ps_channels || {};
		return { shown: s.shown || all, target: s.target || all, all: all };
	}

	is_composite() {
		var s = this.state();
		return s.shown.length == s.all.length && s.target.length == s.all.length;
	}

	set(shown, target) {
		var all = this.keys();
		var full = (list) => !list || list.length == all.length;
		config.ps_channels = full(shown) && full(target) ? null : { shown: shown || all, target: target || all };
		config.need_render = true;
		app.GUI.Ps_workspace.render_channels(true);
	}

	/**
	 * a click on a channel row: that channel alone (Shift: added / removed)
	 */
	select(key, add) {
		var s = this.state();
		if (key == null) return this.set(null, null);
		var target = add ? (s.target.includes(key) ? s.target.filter(k => k !== key) : s.target.concat([key])) : [key];
		if (!target.length) target = [key];
		target = s.all.filter(k => target.includes(k));
		this.set(target, target);
	}

	toggle_eye(key) {
		var s = this.state();
		if (key == null) {
			//the composite eye shows every channel
			return this.set(s.all.length == s.shown.length ? s.shown : s.all, s.target);
		}
		var shown = s.shown.includes(key) ? s.shown.filter(k => k !== key) : s.all.filter(k => s.shown.includes(k) || k === key);
		if (!shown.length) return;
		this.set(shown, s.target);
	}

	/**
	 * Ctrl+2 composite, Ctrl+3.. the channels
	 */
	by_number(n) {
		var all = this.keys();
		if (n == 2) return this.select(null);
		var key = all[n - 3];
		if (key === undefined) return false;
		this.select(key, false);
		return true;
	}

	/**
	 * the document area of the screen canvas shows the visible channels
	 */
	apply(ctx) {
		var s = this.state();
		if (s.shown.length == s.all.length) return;
		var t = ctx.getTransform(), cv = ctx.canvas;
		var x0 = Math.max(0, Math.floor(t.e)), y0 = Math.max(0, Math.floor(t.f));
		var x1 = Math.min(cv.width, Math.ceil(t.e + config.WIDTH * t.a)), y1 = Math.min(cv.height, Math.ceil(t.f + config.HEIGHT * t.d));
		if (x1 <= x0 || y1 <= y0) return;
		var img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0), d = img.data;
		var prefs = app.GUI.Ps_workspace.Preferences;
		var in_color = prefs && prefs.values.channels_in_color;
		var rgb = typeof s.all[0] == 'number';
		for (var i = 0; i < d.length; i += 4) {
			var r = d[i], g = d[i + 1], b = d[i + 2];
			if (s.shown.length == 1) {
				var key = s.shown[0], v = channel_value(r, g, b, key);
				if (in_color && TINT[key]) {
					//the channel in its own color: full color where the channel is full
					var tint = TINT[key], f = rgb ? v / 255 : 1 - v / 255;
					for (var c = 0; c < 3; c++) d[i + c] = rgb ? tint[c] * f : 255 - (255 - tint[c]) * f;
				}
				else {
					d[i] = d[i + 1] = d[i + 2] = v;
				}
			}
			else if (rgb) {
				//two RGB channels: the hidden one is empty
				if (!s.shown.includes(0)) d[i] = 0;
				if (!s.shown.includes(1)) d[i + 1] = 0;
				if (!s.shown.includes(2)) d[i + 2] = 0;
			}
		}
		ctx.putImageData(img, x0, y0);
	}

	/**
	 * pixel edits with some RGB channels targeted: the other channels and the
	 * transparency stay as they were (called before a layer image is replaced)
	 */
	restrict(layer, canvas) {
		var s = this.state();
		if (s.target.length == s.all.length || typeof s.all[0] != 'number' || !layer || !layer.link) return canvas;
		if (canvas.width != layer.width_original || canvas.height != layer.height_original) return canvas;
		if (layer.link.complete === false) return canvas;
		var w = canvas.width, h = canvas.height;
		var old = document.createElement('canvas');
		old.width = w;
		old.height = h;
		var octx = old.getContext('2d', { willReadFrequently: true });
		octx.drawImage(layer.link, 0, 0);
		var od = octx.getImageData(0, 0, w, h).data;
		var out = document.createElement('canvas');
		out.width = w;
		out.height = h;
		var ctx = out.getContext('2d', { willReadFrequently: true });
		ctx.drawImage(canvas, 0, 0);
		var img = ctx.getImageData(0, 0, w, h), nd = img.data;
		for (var i = 0; i < nd.length; i += 4) {
			var a = nd[i + 3] / 255;
			for (var c = 0; c < 3; c++) {
				//a targeted channel takes the edit (as composited over the old pixel)
				nd[i + c] = s.target.includes(c) ? Math.round(nd[i + c] * a + od[i + c] * (1 - a)) : od[i + c];
			}
			nd[i + 3] = od[i + 3];
		}
		ctx.putImageData(img, 0, 0);
		return out;
	}
}

export default Ps_channel_view_class;
