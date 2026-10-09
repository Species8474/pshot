/*
 * pshot - the CS6 blend modes the canvas cannot composite (Dissolve, Linear
 * Burn, Darker Color, Lighter Color, Vivid Light, Linear Light, Pin Light,
 * Hard Mix, Subtract, Divide), plus all the others, per pixel. Layers use
 * them through composition ids 'ps-...'; tools through the mode names.
 */

//composition id <-> CS6 name for the modes canvas lacks
const CUSTOM = {
	'ps-dissolve': 'Dissolve', 'ps-linear-burn': 'Linear Burn', 'ps-darker-color': 'Darker Color', 'ps-lighter-color': 'Lighter Color',
	'ps-vivid-light': 'Vivid Light', 'ps-linear-light': 'Linear Light', 'ps-pin-light': 'Pin Light', 'ps-hard-mix': 'Hard Mix',
	'ps-subtract': 'Subtract', 'ps-divide': 'Divide',
};

function is_custom(composition) {
	return typeof composition == 'string' && composition.indexOf('ps-') === 0;
}

const clamp = (v) => (v < 0 ? 0 : (v > 1 ? 1 : v));
const burn = (b, s) => (b >= 1 ? 1 : (s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s)));
const dodge = (b, s) => (b <= 0 ? 0 : (s >= 1 ? 1 : Math.min(1, b / (1 - s))));
const hard = (b, s) => (s <= 0.5 ? b * 2 * s : b + (2 * s - 1) - b * (2 * s - 1));
const soft = (b, s) => {
	if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
	var d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
	return b + (2 * s - 1) * (d - b);
};
const vivid = (b, s) => (s <= 0.5 ? burn(b, 2 * s) : dodge(b, 2 * s - 1));

const SEPARABLE = {
	'Normal': (b, s) => s,
	'Darken': Math.min,
	'Multiply': (b, s) => b * s,
	'Color Burn': burn,
	'Linear Burn': (b, s) => clamp(b + s - 1),
	'Lighten': Math.max,
	'Screen': (b, s) => b + s - b * s,
	'Color Dodge': dodge,
	'Linear Dodge (Add)': (b, s) => clamp(b + s),
	'Overlay': (b, s) => hard(s, b),
	'Soft Light': soft,
	'Hard Light': hard,
	'Vivid Light': vivid,
	'Linear Light': (b, s) => clamp(b + 2 * s - 1),
	'Pin Light': (b, s) => (s <= 0.5 ? Math.min(b, 2 * s) : Math.max(b, 2 * s - 1)),
	'Hard Mix': (b, s) => (b + s >= 1 ? 1 : 0),
	'Difference': (b, s) => Math.abs(b - s),
	'Exclusion': (b, s) => b + s - 2 * b * s,
	'Subtract': (b, s) => clamp(b - s),
	'Divide': (b, s) => (s <= 0 ? (b > 0 ? 1 : 0) : clamp(b / s)),
};

const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
function clip_color(c) {
	var l = lum(c), n = Math.min(c[0], c[1], c[2]), x = Math.max(c[0], c[1], c[2]);
	if (n < 0) c = c.map(v => l + (v - l) * l / (l - n || 1e-9));
	if (x > 1) c = c.map(v => l + (v - l) * (1 - l) / (x - l || 1e-9));
	return c;
}
function set_lum(c, l) {
	var d = l - lum(c);
	return clip_color([c[0] + d, c[1] + d, c[2] + d]);
}
function sat(c) {
	return Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
}
function set_sat(c, s) {
	var idx = [0, 1, 2].sort((a, b) => c[a] - c[b]), out = [0, 0, 0];
	var mn = c[idx[0]], md = c[idx[1]], mx = c[idx[2]];
	if (mx > mn) {
		out[idx[1]] = (md - mn) * s / (mx - mn);
		out[idx[2]] = s;
	}
	return out;
}

const NONSEPARABLE = {
	'Darker Color': (b, s) => (lum(s) < lum(b) ? s : b),
	'Lighter Color': (b, s) => (lum(s) > lum(b) ? s : b),
	'Hue': (b, s) => set_lum(set_sat(s, sat(b)), lum(b)),
	'Saturation': (b, s) => set_lum(set_sat(b, sat(s)), lum(b)),
	'Color': (b, s) => set_lum(s, lum(b)),
	'Luminosity': (b, s) => set_lum(b, lum(s)),
};

/**
 * blended color of source s over base b (0..1 rgb arrays) for a CS6 mode name
 */
function blend_rgb(mode, b, s) {
	var f = SEPARABLE[mode];
	if (f) return [f(b[0], s[0]), f(b[1], s[1]), f(b[2], s[2])];
	var n = NONSEPARABLE[mode];
	return n ? n(b, s) : s;
}

//a stable per-pixel threshold for Dissolve
function noise(x, y) {
	var h = (x * 374761393 + y * 668265263) | 0;
	h = (h ^ (h >>> 13)) * 1274126177;
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * composites RGBA `src` over RGBA `dst` (same size, Uint8ClampedArray) in place
 * with the mode and opacity (0..1); w is the row width (for Dissolve's noise)
 */
function composite(dst, src, mode, opacity, w) {
	var dissolve = mode == 'Dissolve';
	var b = [0, 0, 0], s = [0, 0, 0];
	for (var i = 0; i < src.length; i += 4) {
		var as = src[i + 3] / 255 * opacity;
		if (as <= 0) continue;
		if (dissolve) {
			var p = i / 4;
			if (noise(p % w, Math.floor(p / w)) >= as) continue;
			dst[i] = src[i]; dst[i + 1] = src[i + 1]; dst[i + 2] = src[i + 2]; dst[i + 3] = 255;
			continue;
		}
		var ab = dst[i + 3] / 255;
		b[0] = dst[i] / 255; b[1] = dst[i + 1] / 255; b[2] = dst[i + 2] / 255;
		s[0] = src[i] / 255; s[1] = src[i + 1] / 255; s[2] = src[i + 2] / 255;
		var m = blend_rgb(mode, b, s);
		var ao = as + ab * (1 - as);
		for (var c = 0; c < 3; c++) {
			//W3C compositing: the blended color where both exist
			var co = as * (1 - ab) * s[c] + as * ab * clamp(m[c]) + (1 - as) * ab * b[c];
			dst[i + c] = ao > 0 ? co / ao * 255 : 0;
		}
		dst[i + 3] = ao * 255;
	}
}

export { CUSTOM, is_custom, blend_rgb, composite };
