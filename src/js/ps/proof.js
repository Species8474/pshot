/*
 * pshot - CS6 View > Proof Setup / Proof Colors (Ctrl+Y) / Gamut Warning
 * (Shift+Ctrl+Y). Display only: the rendered document pixels are converted on
 * screen. Working CMYK is approximated by a SWOP-like gamut (maximum Lab
 * chroma by hue and lightness); the plates use a naive CMYK separation; color
 * blindness uses the Vienot 1999 dichromat matrices.
 */

import app from './../app.js';
import config from './../config.js';
import { converter, SRGB } from './color-management.js';

const SETUPS = {
	cmyk: 'CMYK', cyan: 'Cyan Plate', magenta: 'Magenta Plate', yellow: 'Yellow Plate', black: 'Black Plate', cmy: 'CMY Plates',
	custom: 'Custom', mac: 'Legacy Macintosh RGB', srgb: 'Internet Standard RGB', monitor: 'Monitor RGB', protanopia: 'Protanopia', deuteranopia: 'Deuteranopia',
};

//[hue degrees, max chroma, lightness of that chroma]
const GAMUT = [[0, 72, 50], [30, 80, 55], [60, 86, 70], [90, 92, 88], [120, 70, 75], [150, 62, 55], [180, 46, 55], [210, 42, 55],
	[240, 45, 45], [270, 56, 30], [300, 64, 35], [330, 72, 45], [360, 72, 50]];

const DICHROMAT = {
	protanopia: [0.11238, 0.88762, 0, 0.11238, 0.88762, 0, 0.00401, -0.00401, 1],
	deuteranopia: [0.29275, 0.70725, 0, 0.29275, 0.70725, 0, -0.02234, 0.02234, 1],
};

var LIN = new Float32Array(256);
for (var i = 0; i < 256; i++) { var c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function gamma(v) {
	v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
	return Math.max(0, Math.min(255, Math.round(v * 255)));
}

function lab(r, g, b) {
	var R = LIN[r], G = LIN[g], B = LIN[b];
	var x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, y = R * 0.2126 + G * 0.7152 + B * 0.0722, z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
	var f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
	var fx = f(x), fy = f(y), fz = f(z);
	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function lab_rgb(L, a, bb) {
	var fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - bb / 200;
	var inv = (t) => (t * t * t > 0.008856 ? t * t * t : (t - 16 / 116) / 7.787);
	var x = inv(fx) * 0.95047, y = inv(fy), z = inv(fz) * 1.08883;
	return [gamma(x * 3.2406 - y * 1.5372 - z * 0.4986), gamma(-x * 0.9689 + y * 1.8758 + z * 0.0415), gamma(x * 0.0557 - y * 0.2040 + z * 1.0570)];
}

//the gamut cusp (lightness of the most saturated color) for a hue
function cusp(h) {
	var k = 0;
	while (k < GAMUT.length - 2 && GAMUT[k + 1][0] < h) k++;
	var p = GAMUT[k], q = GAMUT[k + 1], t = (h - p[0]) / (q[0] - p[0]);
	return [p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
}

function max_chroma(L, h) {
	var c = cusp(h), d = (L - c[1]) / (L > c[1] ? 100 - c[1] : c[1]);
	return c[0] * Math.max(0, 1 - d * d);
}

/**
 * a color moved into the (U.S. Web Coated SWOP-like) CMYK gamut
 */
function cmyk_safe(r, g, b) {
	var l = lab(r, g, b), ch = Math.hypot(l[1], l[2]);
	var h = (Math.atan2(l[2], l[1]) * 180 / Math.PI + 360) % 360;
	var m = max_chroma(l[0], h);
	//neutrals (and rounding noise around them) are always printable
	if (ch > m + 1 && ch > 2) {
		//out of gamut: toward the cusp lightness, then the chroma clipped
		var L2 = l[0] + (cusp(h)[1] - l[0]) * Math.min(1, (ch - m) / ch) * 0.6;
		var k = Math.min(1, max_chroma(L2, h) / ch);
		return lab_rgb(L2, l[1] * k, l[2] * k);
	}
	return [r, g, b];
}

/**
 * a channel's grayscale value (0..255) for the Channels panel and Duplicate Channel:
 * 0 1 2 = R G B, c m y k = ink (white = none), L a b = Lab, gray = luminosity
 */
function channel_value(r, g, b, key) {
	if (key === 0 || key === '0') return r;
	if (key === 1 || key === '1') return g;
	if (key === 2 || key === '2') return b;
	if (key == 'c' || key == 'm' || key == 'y' || key == 'k') {
		var k = 1 - Math.max(r, g, b) / 255, d = 1 - k || 1;
		var ink = key == 'k' ? k : (1 - { c: r, m: g, y: b }[key] / 255 - k) / d;
		return Math.round(255 * (1 - ink));
	}
	if (key == 'L' || key == 'a' || key == 'b') {
		var l = lab(r, g, b);
		if (key == 'L') return Math.round(l[0] / 100 * 255);
		return Math.max(0, Math.min(255, Math.round(128 + (key == 'a' ? l[1] : l[2]))));
	}
	return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

class Ps_proof_class {

	constructor() {
		this.setup = 'cmyk';
		this.colors = false;
		this.gamut = false;
		this.cache = new Map();
		this.hdr_exposure = 0;
		this.hdr_gamma = 1;
	}

	active() {
		return this.colors || this.gamut || this.forced();
	}

	/**
	 * CMYK documents always show CMYK colors; 32-bit documents their preview exposure
	 */
	forced() {
		var cm = app.GUI && app.GUI.Ps_workspace && app.GUI.Ps_workspace.Color;
		return config.ps_mode == 'CMYK' || (config.ps_depth == 32 && (this.hdr_exposure || this.hdr_gamma != 1)) || !!(cm && cm.display_converter());
	}

	label() {
		if (this.colors && this.setup == 'custom' && this.custom) return this.custom.device.replace(/ \(.*$/, '');
		return this.colors ? SETUPS[this.setup] : '';
	}

	/**
	 * View > Proof Setup > Custom: { device, preserve, paper, black }
	 */
	set_custom(c) {
		this.custom = c;
		var rgb = converter(SRGB, c.device), back = converter(c.device, SRGB);
		this.custom_fns = { to: rgb, back: back };
		this.set_setup('custom');
		this.colors = true;
	}

	set_setup(s) {
		this.setup = s;
		this.cache.clear();
		config.need_render = true;
	}

	toggle_colors() {
		this.colors = !this.colors;
		this.cache.clear();
		config.need_render = true;
	}

	toggle_gamut() {
		this.gamut = !this.gamut;
		this.cache.clear();
		config.need_render = true;
	}

	/**
	 * one color -> packed display color
	 */
	convert(r, g, b) {
		//the document's profile shown on an sRGB monitor
		var cm = app.GUI.Ps_workspace.Color, dc = cm && cm.display_converter();
		if (dc) [r, g, b] = dc(r, g, b);
		if (config.ps_depth == 32 && (this.hdr_exposure || this.hdr_gamma != 1)) {
			//View > 32-bit Preview Options: exposure (stops) and gamma
			var e = Math.pow(2, this.hdr_exposure || 0), gm = 1 / (this.hdr_gamma || 1);
			r = gamma(Math.pow(Math.min(1, LIN[r] * e), gm));
			g = gamma(Math.pow(Math.min(1, LIN[g] * e), gm));
			b = gamma(Math.pow(Math.min(1, LIN[b] * e), gm));
		}
		if (config.ps_mode == 'CMYK') [r, g, b] = cmyk_safe(r, g, b);
		if (this.gamut) {
			var lg = lab(r, g, b), C = Math.hypot(lg[1], lg[2]);
			var hg = (Math.atan2(lg[2], lg[1]) * 180 / Math.PI + 360) % 360;
			if (C > max_chroma(lg[0], hg) + 1) {
				//Preferences > Transparency & Gamut > Gamut Warning color / opacity
				var gp = app.GUI.Ps_workspace.Preferences ? app.GUI.Ps_workspace.Preferences.values : {};
				var gc = gp.gamut_color || '#808080', go = (gp.gamut_opacity == null ? 100 : gp.gamut_opacity) / 100;
				var mixc = (k, v) => Math.round(v + (parseInt(gc.substr(1 + k * 2, 2), 16) - v) * go);
				return (mixc(0, r) << 16) | (mixc(1, g) << 8) | mixc(2, b);
			}
		}
		if (this.colors) {
			var s = this.setup;
			if (s == 'custom' && this.custom) {
				var cu = this.custom, fns = this.custom_fns || {};
				if (!fns.to && !fns.back && cu.device != SRGB) {
					//a press (CMYK) condition: its gamut, then paper white and black ink
					[r, g, b] = cmyk_safe(r, g, b);
					if (cu.paper) { r = r * 246 / 255; g = g * 243 / 255; b = b * 232 / 255; }
					if (cu.black) { r = 26 + r * (1 - 26 / 255); g = 24 + g * (1 - 24 / 255); b = 24 + b * (1 - 24 / 255); }
				}
				else if (cu.preserve && fns.back) [r, g, b] = fns.back(r, g, b);
				else if (fns.to && fns.back) { var t = fns.to(r, g, b); [r, g, b] = fns.back(t[0], t[1], t[2]); }
			}
			else if (s == 'cmyk') {
				var l = lab(r, g, b), ch = Math.hypot(l[1], l[2]);
				var h = (Math.atan2(l[2], l[1]) * 180 / Math.PI + 360) % 360;
				var m = max_chroma(l[0], h);
				if (ch > m + 1 && ch > 2) {
					//out of gamut: toward the cusp lightness, then the chroma clipped
					var L2 = l[0] + (cusp(h)[1] - l[0]) * Math.min(1, (ch - m) / ch) * 0.6;
					var k = Math.min(1, max_chroma(L2, h) / ch);
					[r, g, b] = lab_rgb(L2, l[1] * k, l[2] * k);
				}
			}
			else if (s == 'cyan' || s == 'magenta' || s == 'yellow' || s == 'black' || s == 'cmy') {
				var kk = 1 - Math.max(r, g, b) / 255, d = 1 - kk || 1;
				var cc = (1 - r / 255 - kk) / d, mm = (1 - g / 255 - kk) / d, yy = (1 - b / 255 - kk) / d;
				if (s == 'cmy') { r = 255 * (1 - cc); g = 255 * (1 - mm); b = 255 * (1 - yy); }
				else {
					var v = 255 * (1 - { cyan: cc, magenta: mm, yellow: yy, black: kk }[s]);
					r = g = b = v;
				}
			}
			else if (s == 'mac') {
				var gk = 1.8 / 2.2;
				r = 255 * Math.pow(r / 255, gk); g = 255 * Math.pow(g / 255, gk); b = 255 * Math.pow(b / 255, gk);
			}
			else if (DICHROMAT[s]) {
				var M = DICHROMAT[s], R = LIN[r], G = LIN[g], B = LIN[b];
				r = gamma(M[0] * R + M[1] * G + M[2] * B);
				g = gamma(M[3] * R + M[4] * G + M[5] * B);
				b = gamma(M[6] * R + M[7] * G + M[8] * B);
			}
		}
		return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
	}

	/**
	 * converts the document area of the screen canvas (after the layers render)
	 */
	apply(ctx) {
		if (!this.active()) return;
		//the cache holds results for one set of settings
		var gp = app.GUI.Ps_workspace.Preferences ? app.GUI.Ps_workspace.Preferences.values : {};
		var key = config.ps_mode + '|' + config.ps_depth + '|' + this.hdr_exposure + '|' + this.hdr_gamma + '|' + config.ps_profile + '|' + gp.gamut_color + gp.gamut_opacity;
		if (this.cache_key !== key) { this.cache.clear(); this.cache_key = key; }
		var t = ctx.getTransform(), cv = ctx.canvas;
		var x0 = Math.max(0, Math.floor(t.e)), y0 = Math.max(0, Math.floor(t.f));
		var x1 = Math.min(cv.width, Math.ceil(t.e + config.WIDTH * t.a)), y1 = Math.min(cv.height, Math.ceil(t.f + config.HEIGHT * t.d));
		if (x1 <= x0 || y1 <= y0) return;
		var img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0), d = img.data, cache = this.cache;
		for (var i = 0; i < d.length; i += 4) {
			var key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
			var out = cache.get(key);
			if (out === undefined) {
				out = this.convert(d[i], d[i + 1], d[i + 2]);
				if (cache.size < 300000) cache.set(key, out);
			}
			d[i] = out >> 16; d[i + 1] = (out >> 8) & 255; d[i + 2] = out & 255;
		}
		ctx.putImageData(img, x0, y0);
	}
}

export default Ps_proof_class;
export { cmyk_safe, channel_value, lab };
