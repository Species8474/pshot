/*
 * pshot - the CS6 Filter Gallery effects (Artistic, Brush Strokes, Distort,
 * Sketch, Stylize, Texture). Each is an approximation of the CS6 look with the
 * CS6 controls: fn(src, dst, w, h, params, k) where src/dst are RGBA arrays
 * and k scales pixel-sized controls (previews are rendered smaller).
 */

import config from './../config.js';
import { gaussian, rank_filter } from './../modules/ps/filters.js';

function hexrgb(c) {
	return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)];
}
const FG = () => hexrgb(config.COLOR || '#000000');
const BG = () => hexrgb(config.BG_COLOR || '#ffffff');

function gray(src, w, h) {
	var g = new Float32Array(w * h);
	for (var i = 0; i < w * h; i++) g[i] = (src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114) / 255;
	return g;
}

function blur_gray(g, w, h, r) {
	if (r < 0.3) return g;
	var rgba = new Uint8ClampedArray(w * h * 4);
	for (var i = 0; i < w * h; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = g[i] * 255; rgba[i * 4 + 3] = 255; }
	var b = gaussian(rgba, w, h, r), out = new Float32Array(w * h);
	for (var j = 0; j < w * h; j++) out[j] = b[j * 4] / 255;
	return out;
}

function sobel(g, w, h) {
	var e = new Float32Array(w * h);
	var at = (x, y) => g[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];
	for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
		var gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
		var gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
		e[y * w + x] = Math.min(1, Math.hypot(gx, gy) / 4);
	}
	return e;
}

//relief of a height map lit from an angle (degrees): -1..1
function relief(g, w, h, angle, depth) {
	var a = angle * Math.PI / 180, lx = Math.cos(a), ly = -Math.sin(a), out = new Float32Array(w * h);
	var at = (x, y) => g[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];
	for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
		var dx = at(x + 1, y) - at(x - 1, y), dy = at(x, y + 1) - at(x, y - 1);
		out[y * w + x] = Math.max(-1, Math.min(1, (dx * lx + dy * ly) * depth));
	}
	return out;
}

function hash(x, y, s) {
	var n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
	return n - Math.floor(n);
}

//smooth value noise 0..1 with cells of `scale` px
function vnoise(w, h, scale, seed) {
	var out = new Float32Array(w * h), sm = (t) => t * t * (3 - 2 * t);
	scale = Math.max(0.5, scale);
	for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
		var fx = x / scale, fy = y / scale, i = Math.floor(fx), j = Math.floor(fy), u = sm(fx - i), v = sm(fy - j);
		var a = hash(i, j, seed), b = hash(i + 1, j, seed), c = hash(i, j + 1, seed), d = hash(i + 1, j + 1, seed);
		out[y * w + x] = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
	}
	return out;
}

function median(src, w, h, r) {
	var dst = new Uint8ClampedArray(src);
	if (r >= 0.5) rank_filter(src, dst, w, h, r, 0.5);
	return dst;
}

//average along a direction (motion blur), len in px
function motion(src, w, h, len, angle) {
	len = Math.max(1, Math.round(len));
	var a = angle * Math.PI / 180, dx = Math.cos(a), dy = -Math.sin(a), out = new Uint8ClampedArray(src.length);
	for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
		var r = 0, g = 0, b = 0, al = 0, n = 0;
		for (var t = -len; t <= len; t += Math.max(1, len / 6)) {
			var xx = Math.max(0, Math.min(w - 1, Math.round(x + dx * t))), yy = Math.max(0, Math.min(h - 1, Math.round(y + dy * t))), i = (yy * w + xx) * 4;
			r += src[i]; g += src[i + 1]; b += src[i + 2]; al += src[i + 3]; n++;
		}
		var o = (y * w + x) * 4;
		out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = al / n;
	}
	return out;
}

function displace(src, dst, w, h, fx) {
	for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
		var d = fx(x, y), sx = Math.max(0, Math.min(w - 1, Math.round(x + d[0]))), sy = Math.max(0, Math.min(h - 1, Math.round(y + d[1])));
		var i = (sy * w + sx) * 4, o = (y * w + x) * 4;
		dst[o] = src[i]; dst[o + 1] = src[i + 1]; dst[o + 2] = src[i + 2]; dst[o + 3] = src[i + 3];
	}
}

function each(dst, fn) {
	for (var i = 0, n = dst.length / 4; i < n; i++) fn(i, i * 4);
}

//two-color sketch: t in 0..1 (1 = foreground ink)
function two_tone(dst, t) {
	var f = FG(), b = BG();
	each(dst, (i, o) => { var v = Math.max(0, Math.min(1, t[i])); dst[o] = b[0] + (f[0] - b[0]) * v; dst[o + 1] = b[1] + (f[1] - b[1]) * v; dst[o + 2] = b[2] + (f[2] - b[2]) * v; });
}

function poster(v, levels) {
	return Math.round(v / 255 * (levels - 1)) / (levels - 1) * 255;
}

//texture height maps for Texturizer / Rough Pastels / Conte Crayon
function texture(kind, w, h, scale) {
	var s = Math.max(0.2, scale / 100), out = new Float32Array(w * h);
	for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
		var v;
		if (kind == 'Brick') {
			var bw = 40 * s, bh = 18 * s, row = Math.floor(y / bh), off = row % 2 ? bw / 2 : 0;
			var mx = ((x + off) % bw) / bw, my = (y % bh) / bh;
			v = (mx < 0.06 || my < 0.12) ? 0 : 0.8 + hash(Math.floor((x + off) / bw), row, 3) * 0.2;
		}
		else if (kind == 'Burlap') {
			v = 0.5 + 0.25 * Math.sin(x / (2.2 * s)) * Math.sin(y / (2.6 * s)) + 0.25 * (hash(Math.floor(x / (3 * s)), Math.floor(y / (3 * s)), 5) - 0.5);
		}
		else if (kind == 'Sandstone') {
			v = hash(x, y, 9) * 0.6 + 0.2;
		}
		else {
			//Canvas
			v = 0.5 + 0.25 * Math.sin(x / (1.6 * s)) + 0.25 * Math.sin(y / (1.6 * s));
		}
		out[y * w + x] = v;
	}
	return kind == 'Sandstone' ? blur_gray(out, w, h, 0.8 * s) : out;
}

function apply_relief(dst, rel, amount) {
	each(dst, (i, o) => {
		var l = rel[i] * amount * 120;
		dst[o] += l; dst[o + 1] += l; dst[o + 2] += l;
	});
}

const E = {};
function def(key, name, cat, params, fn) {
	E[key] = { key: key, name: name, cat: cat, params: params, fn: fn };
}

// ---------- Artistic ----------
def('colored_pencil', 'Colored Pencil', 'Artistic', [['width', 'Pencil Width', 1, 24, 4], ['pressure', 'Stroke Pressure', 0, 15, 8], ['paper', 'Paper Brightness', 0, 50, 25]], (s, d, w, h, p, k) => {
	var e = sobel(blur_gray(gray(s, w, h), w, h, 0.5 * k), w, h), m = motion(s, w, h, p.width * k, 45), b = BG(), pb = p.paper / 50;
	each(d, (i, o) => { var t = Math.min(1, e[i] * (1 + p.pressure / 3)); for (var c = 0; c < 3; c++) d[o + c] = (b[c] * pb + 255 * (1 - pb)) * (1 - t) + m[o + c] * t; });
});
def('cutout', 'Cutout', 'Artistic', [['levels', 'Number of Levels', 2, 8, 4], ['simplicity', 'Edge Simplicity', 0, 10, 4], ['fidelity', 'Edge Fidelity', 1, 3, 2]], (s, d, w, h, p, k) => {
	var b = gaussian(s, w, h, (p.simplicity + 1) * k / p.fidelity);
	each(d, (i, o) => { for (var c = 0; c < 3; c++) d[o + c] = poster(b[o + c], p.levels); });
});
def('dry_brush', 'Dry Brush', 'Artistic', [['size', 'Brush Size', 0, 10, 2], ['detail', 'Brush Detail', 0, 10, 8], ['texture', 'Texture', 1, 3, 1]], (s, d, w, h, p, k) => {
	var m = median(s, w, h, (p.size + 1) * k), n = vnoise(w, h, 1.5, 2), lv = 4 + p.detail;
	each(d, (i, o) => { var t = (n[i] - 0.5) * p.texture * 18; for (var c = 0; c < 3; c++) d[o + c] = poster(m[o + c], lv) + t; });
});
def('film_grain', 'Film Grain', 'Artistic', [['grain', 'Grain', 0, 20, 4], ['highlight', 'Highlight Area', 0, 20, 0], ['intensity', 'Intensity', 0, 10, 10]], (s, d, w, h, p) => {
	each(d, (i, o) => {
		var l = (s[o] * 0.299 + s[o + 1] * 0.587 + s[o + 2] * 0.114) / 255, g = (hash(i % w, Math.floor(i / w), 1) - 0.5) * p.grain * 6 * (1 - Math.abs(l - 0.5));
		var hl = l > 1 - p.highlight / 25 ? (p.intensity / 10) * (l - (1 - p.highlight / 25)) * 255 : 0;
		for (var c = 0; c < 3; c++) d[o + c] = s[o + c] + g + hl;
	});
});
def('fresco', 'Fresco', 'Artistic', [['size', 'Brush Size', 0, 10, 2], ['detail', 'Brush Detail', 0, 10, 8], ['texture', 'Texture', 1, 3, 1]], (s, d, w, h, p, k) => {
	var m = median(s, w, h, (p.size + 1) * k), e = sobel(gray(m, w, h), w, h), n = vnoise(w, h, 2, 4);
	each(d, (i, o) => { var dark = 1 - Math.min(0.8, e[i] * 1.6), t = (n[i] - 0.5) * p.texture * 20; for (var c = 0; c < 3; c++) d[o + c] = (m[o + c] * 1.15 - 20) * dark + t; });
});
def('neon_glow', 'Neon Glow', 'Artistic', [['size', 'Glow Size', -24, 24, 5], ['brightness', 'Glow Brightness', 0, 50, 15]], (s, d, w, h, p, k) => {
	var g = gray(s, w, h), gb = blur_gray(g, w, h, Math.abs(p.size) * k + 0.5), col = [80, 160, 255], fg = FG();
	each(d, (i, o) => {
		var glow = (p.size >= 0 ? gb[i] : 1 - gb[i]) * p.brightness / 25;
		for (var c = 0; c < 3; c++) d[o + c] = fg[c] * (1 - g[i]) * 0.5 + g[i] * 160 + col[c] * glow;
	});
});
def('paint_daubs', 'Paint Daubs', 'Artistic', [['size', 'Brush Size', 1, 50, 8], ['sharpness', 'Sharpness', 0, 40, 7]], (s, d, w, h, p, k) => {
	var m = median(s, w, h, p.size / 2.5 * k), b = gaussian(m, w, h, 1.5 * k);
	each(d, (i, o) => { for (var c = 0; c < 3; c++) d[o + c] = m[o + c] + (m[o + c] - b[o + c]) * p.sharpness / 10; });
});
def('palette_knife', 'Palette Knife', 'Artistic', [['size', 'Stroke Size', 1, 50, 25], ['detail', 'Stroke Detail', 1, 3, 3], ['softness', 'Softness', 0, 10, 0]], (s, d, w, h, p, k) => {
	var m = median(s, w, h, p.size / 6 * k), b = gaussian(m, w, h, p.softness / 3 * k);
	each(d, (i, o) => { for (var c = 0; c < 3; c++) d[o + c] = poster(b[o + c], 4 + p.detail * 3); });
});
def('plastic_wrap', 'Plastic Wrap', 'Artistic', [['strength', 'Highlight Strength', 0, 20, 15], ['detail', 'Detail', 1, 15, 9], ['smoothness', 'Smoothness', 1, 15, 7]], (s, d, w, h, p, k) => {
	var r = relief(blur_gray(gray(s, w, h), w, h, (16 - p.detail + p.smoothness) / 3 * k), w, h, 135, 30);
	each(d, (i, o) => { var hl = Math.max(0, r[i]) ** 2 * p.strength * 18; for (var c = 0; c < 3; c++) d[o + c] = s[o + c] * 0.9 + hl; });
});
def('poster_edges', 'Poster Edges', 'Artistic', [['thickness', 'Edge Thickness', 0, 10, 2], ['intensity', 'Edge Intensity', 0, 10, 1], ['posterization', 'Posterization', 0, 6, 2]], (s, d, w, h, p, k) => {
	var e = sobel(blur_gray(gray(s, w, h), w, h, p.thickness * 0.3 * k), w, h), lv = 2 + p.posterization * 2;
	each(d, (i, o) => { var dark = e[i] * (0.5 + p.intensity / 3) > 0.25 ? 0.15 : 1; for (var c = 0; c < 3; c++) d[o + c] = poster(s[o + c], lv) * dark; });
});
def('rough_pastels', 'Rough Pastels', 'Artistic', [['length', 'Stroke Length', 0, 40, 6], ['detail', 'Stroke Detail', 1, 20, 4], ['scaling', 'Scaling', 50, 200, 100], ['relief', 'Relief', 0, 50, 20]], (s, d, w, h, p, k) => {
	var m = motion(s, w, h, p.length * k / 2 + 1, 45), r = relief(texture('Canvas', w, h, p.scaling * k), w, h, 135, 3);
	each(d, (i, o) => { for (var c = 0; c < 3; c++) d[o + c] = m[o + c] * 1.05 + r[i] * p.relief * 3; });
});
def('smudge_stick', 'Smudge Stick', 'Artistic', [['length', 'Stroke Length', 0, 10, 2], ['area', 'Highlight Area', 0, 20, 0], ['intensity', 'Intensity', 0, 10, 10]], (s, d, w, h, p, k) => {
	var m = motion(s, w, h, (p.length + 1) * 2 * k, 45);
	each(d, (i, o) => { var l = (m[o] + m[o + 1] + m[o + 2]) / 765, hl = l > 1 - p.area / 25 ? p.intensity * 10 : 0; for (var c = 0; c < 3; c++) d[o + c] = m[o + c] * 0.92 + hl; });
});
def('sponge', 'Sponge', 'Artistic', [['size', 'Brush Size', 0, 10, 2], ['definition', 'Definition', 0, 25, 12], ['smoothness', 'Smoothness', 1, 15, 5]], (s, d, w, h, p, k) => {
	var b = gaussian(s, w, h, (p.size + 1) * 0.6 * k), n = blur_gray(vnoise(w, h, 2 + p.size * k, 6), w, h, p.smoothness / 5);
	each(d, (i, o) => { var t = (n[i] - 0.5) * p.definition * 8; for (var c = 0; c < 3; c++) d[o + c] = b[o + c] + t; });
});
def('underpainting', 'Underpainting', 'Artistic', [['size', 'Brush Size', 0, 40, 6], ['coverage', 'Texture Coverage', 0, 40, 16], ['scaling', 'Scaling', 50, 200, 100], ['relief', 'Relief', 0, 50, 4]], (s, d, w, h, p, k) => {
	var b = gaussian(median(s, w, h, p.size / 4 * k), w, h, p.coverage / 10 * k), r = relief(texture('Canvas', w, h, p.scaling * k), w, h, 135, 3);
	each(d, (i, o) => { for (var c = 0; c < 3; c++) d[o + c] = b[o + c] + r[i] * p.relief * 4; });
});
def('watercolor', 'Watercolor', 'Artistic', [['detail', 'Brush Detail', 1, 14, 9], ['shadow', 'Shadow Intensity', 0, 10, 1], ['texture', 'Texture', 1, 3, 1]], (s, d, w, h, p, k) => {
	var m = median(s, w, h, (15 - p.detail) / 3 * k), e = sobel(gray(m, w, h), w, h), n = vnoise(w, h, 3, 8);
	each(d, (i, o) => { var dark = 1 - Math.min(0.7, e[i] * (1 + p.shadow)), t = (n[i] - 0.5) * p.texture * 14; for (var c = 0; c < 3; c++) d[o + c] = m[o + c] * dark + t; });
});

// ---------- Brush Strokes ----------
def('accented_edges', 'Accented Edges', 'Brush Strokes', [['width', 'Edge Width', 1, 14, 2], ['brightness', 'Edge Brightness', 0, 50, 38], ['smoothness', 'Smoothness', 1, 15, 5]], (s, d, w, h, p, k) => {
	var e = sobel(blur_gray(gray(s, w, h), w, h, p.smoothness / 6 * k), w, h), eb = blur_gray(e, w, h, p.width / 3 * k), v = (p.brightness - 25) * 10;
	each(d, (i, o) => { var t = Math.min(1, eb[i] * 3); for (var c = 0; c < 3; c++) d[o + c] = s[o + c] + v * t; });
});
def('angled_strokes', 'Angled Strokes', 'Brush Strokes', [['balance', 'Direction Balance', 0, 100, 50], ['length', 'Stroke Length', 3, 50, 15], ['sharpness', 'Sharpness', 0, 10, 3]], (s, d, w, h, p, k) => {
	var a = motion(s, w, h, p.length / 4 * k, 45), b = motion(s, w, h, p.length / 4 * k, 135), g = gray(s, w, h);
	each(d, (i, o) => { var useA = g[i] * 100 > p.balance; for (var c = 0; c < 3; c++) { var v = useA ? a[o + c] : b[o + c]; d[o + c] = v + (s[o + c] - v) * p.sharpness / 15; } });
});
def('crosshatch', 'Crosshatch', 'Brush Strokes', [['length', 'Stroke Length', 3, 50, 9], ['sharpness', 'Sharpness', 0, 20, 6], ['strength', 'Strength', 1, 3, 1]], (s, d, w, h, p, k) => {
	var a = motion(s, w, h, p.length / 4 * k, 45), b = motion(s, w, h, p.length / 4 * k, 135);
	each(d, (i, o) => { var hatch = (Math.floor(((i % w) + Math.floor(i / w)) / 3) % 2) ? a : b; for (var c = 0; c < 3; c++) d[o + c] = hatch[o + c] + (s[o + c] - hatch[o + c]) * p.sharpness / 25 + (hatch === a ? -6 : 6) * p.strength; });
});
def('dark_strokes', 'Dark Strokes', 'Brush Strokes', [['balance', 'Balance', 0, 10, 5], ['black', 'Black Intensity', 0, 10, 6], ['white', 'White Intensity', 0, 10, 2]], (s, d, w, h, p, k) => {
	var a = motion(s, w, h, 3 * k, 45), b = motion(s, w, h, 3 * k, 135), g = gray(s, w, h);
	each(d, (i, o) => { var dark = g[i] < p.balance / 10; var m = dark ? a : b; for (var c = 0; c < 3; c++) d[o + c] = dark ? m[o + c] * (1 - p.black / 14) : m[o + c] + (255 - m[o + c]) * p.white / 14; });
});
def('ink_outlines', 'Ink Outlines', 'Brush Strokes', [['length', 'Stroke Length', 1, 50, 4], ['dark', 'Dark Intensity', 0, 50, 20], ['light', 'Light Intensity', 0, 50, 10]], (s, d, w, h, p, k) => {
	var m = motion(s, w, h, p.length / 4 * k, 45), e = sobel(gray(s, w, h), w, h);
	each(d, (i, o) => { var t = Math.min(1, e[i] * p.dark / 8); for (var c = 0; c < 3; c++) d[o + c] = (m[o + c] + (255 - m[o + c]) * p.light / 120) * (1 - t); });
});
def('spatter', 'Spatter', 'Brush Strokes', [['radius', 'Spray Radius', 0, 25, 10], ['smoothness', 'Smoothness', 1, 15, 5]], (s, d, w, h, p, k) => {
	var nx = blur_gray(vnoise(w, h, 1, 11), w, h, p.smoothness / 6), ny = blur_gray(vnoise(w, h, 1, 12), w, h, p.smoothness / 6), r = p.radius * k;
	displace(s, d, w, h, (x, y) => [(nx[y * w + x] - 0.5) * 2 * r, (ny[y * w + x] - 0.5) * 2 * r]);
});
def('sprayed_strokes', 'Sprayed Strokes', 'Brush Strokes', [['length', 'Stroke Length', 0, 20, 12], ['radius', 'Spray Radius', 0, 25, 7]], (s, d, w, h, p, k) => {
	var m = motion(s, w, h, p.length / 2 * k + 1, 135), n = vnoise(w, h, 1, 13), r = p.radius * k;
	displace(m, d, w, h, (x, y) => [(n[y * w + x] - 0.5) * 2 * r, (n[y * w + x] - 0.5) * -2 * r]);
});
def('sumi_e', 'Sumi-e', 'Brush Strokes', [['width', 'Stroke Width', 3, 15, 10], ['pressure', 'Stroke Pressure', 0, 15, 2], ['contrast', 'Contrast', 0, 40, 16]], (s, d, w, h, p, k) => {
	var m = gaussian(motion(s, w, h, p.width / 3 * k, 45), w, h, 1 * k);
	each(d, (i, o) => { for (var c = 0; c < 3; c++) d[o + c] = (m[o + c] - 128) * (1 + p.contrast / 20) + 128 - p.pressure * 6; });
});

// ---------- Distort ----------
def('diffuse_glow', 'Diffuse Glow', 'Distort', [['graininess', 'Graininess', 0, 10, 6], ['glow', 'Glow Amount', 0, 20, 10], ['clear', 'Clear Amount', 0, 20, 15]], (s, d, w, h, p) => {
	var b = BG();
	each(d, (i, o) => {
		var l = (s[o] * 0.299 + s[o + 1] * 0.587 + s[o + 2] * 0.114) / 255, glow = Math.max(0, l - p.clear / 25) * p.glow / 10;
		var grain = hash(i % w, Math.floor(i / w), 21) < p.graininess / 25 ? 1 : 0;
		var t = Math.min(1, glow + grain * glow);
		for (var c = 0; c < 3; c++) d[o + c] = s[o + c] + (b[c] - s[o + c]) * t;
	});
});
def('glass', 'Glass', 'Distort', [['distortion', 'Distortion', 0, 20, 5], ['smoothness', 'Smoothness', 1, 15, 3], ['scaling', 'Scaling', 50, 200, 100]], (s, d, w, h, p, k) => {
	var sc = 8 * p.scaling / 100 * k, nx = blur_gray(vnoise(w, h, sc, 31), w, h, p.smoothness / 4), ny = blur_gray(vnoise(w, h, sc, 32), w, h, p.smoothness / 4), r = p.distortion * 1.5 * k;
	displace(s, d, w, h, (x, y) => [(nx[y * w + x] - 0.5) * 2 * r, (ny[y * w + x] - 0.5) * 2 * r]);
});
def('ocean_ripple', 'Ocean Ripple', 'Distort', [['size', 'Ripple Size', 1, 15, 9], ['magnitude', 'Ripple Magnitude', 0, 20, 9]], (s, d, w, h, p, k) => {
	var n = vnoise(w, h, p.size * 1.5 * k, 41), r = p.magnitude * 0.8 * k;
	displace(s, d, w, h, (x, y) => { var v = n[y * w + x] * Math.PI * 4; return [Math.cos(v) * r, Math.sin(v) * r]; });
});

// ---------- Sketch (foreground / background colors) ----------
def('bas_relief', 'Bas Relief', 'Sketch', [['detail', 'Detail', 1, 15, 13], ['smoothness', 'Smoothness', 1, 15, 3], ['light', 'Light', 0, 7, 0]], (s, d, w, h, p, k) => {
	var r = relief(blur_gray(gray(s, w, h), w, h, (16 - p.detail + p.smoothness) / 6 * k), w, h, [90, 45, 0, 315, 270, 225, 180, 135][p.light] || 90, 8);
	var t = new Float32Array(w * h);
	for (var i = 0; i < t.length; i++) t[i] = 0.5 - r[i] * 0.5;
	two_tone(d, t);
});
def('chalk_charcoal', 'Chalk & Charcoal', 'Sketch', [['charcoal', 'Charcoal Area', 0, 20, 6], ['chalk', 'Chalk Area', 0, 20, 6], ['pressure', 'Stroke Pressure', 0, 5, 1]], (s, d, w, h, p, k) => {
	var g = gray(motion(s, w, h, 2 * k, 45), w, h), f = FG(), b = BG();
	each(d, (i, o) => {
		var l = g[i];
		for (var c = 0; c < 3; c++) d[o + c] = l < p.charcoal / 30 ? f[c] : (l > 1 - p.chalk / 30 ? b[c] : 128 + (l - 0.5) * p.pressure * 40);
	});
});
def('charcoal', 'Charcoal', 'Sketch', [['thickness', 'Charcoal Thickness', 1, 7, 1], ['detail', 'Detail', 0, 5, 5], ['balance', 'Light/Dark Balance', 0, 100, 50]], (s, d, w, h, p, k) => {
	var g = gray(motion(s, w, h, (p.thickness + 1) * k, 45), w, h), e = sobel(g, w, h), t = new Float32Array(w * h);
	for (var i = 0; i < t.length; i++) t[i] = Math.min(1, (g[i] < p.balance / 100 ? 0.8 : 0) + e[i] * p.detail / 2);
	two_tone(d, t);
});
def('chrome', 'Chrome', 'Sketch', [['detail', 'Detail', 0, 10, 4], ['smoothness', 'Smoothness', 0, 10, 7]], (s, d, w, h, p, k) => {
	var g = blur_gray(gray(s, w, h), w, h, (p.smoothness + 10 - p.detail) / 5 * k);
	each(d, (i, o) => { var v = 0.5 + 0.5 * Math.sin(g[i] * Math.PI * 3); d[o] = d[o + 1] = d[o + 2] = v * 255; });
});
def('conte_crayon', 'Conte Crayon', 'Sketch', [['fg', 'Foreground Level', 1, 15, 11], ['bg', 'Background Level', 1, 15, 7], ['scaling', 'Scaling', 50, 200, 100], ['relief', 'Relief', 0, 50, 4]], (s, d, w, h, p, k) => {
	var g = gray(s, w, h), r = relief(texture('Canvas', w, h, p.scaling * k), w, h, 135, 3), t = new Float32Array(w * h);
	for (var i = 0; i < t.length; i++) t[i] = Math.max(0, Math.min(1, (1 - g[i]) * p.fg / 10 - (g[i]) * p.bg / 30 + r[i] * p.relief / 50));
	two_tone(d, t);
});
def('graphic_pen', 'Graphic Pen', 'Sketch', [['length', 'Stroke Length', 1, 15, 15], ['balance', 'Light/Dark Balance', 0, 100, 50], ['direction', 'Stroke Direction', 0, 3, 0]], (s, d, w, h, p, k) => {
	var ang = [45, 0, 90, 135][p.direction] || 45, n = new Uint8ClampedArray(s.length);
	each(n, (i, o) => { var v = hash(i % w, Math.floor(i / w), 51) * 255; n[o] = n[o + 1] = n[o + 2] = v; n[o + 3] = 255; });
	var m = gray(motion(n, w, h, p.length / 2 * k, ang), w, h), g = gray(s, w, h), t = new Float32Array(w * h);
	for (var i = 0; i < t.length; i++) t[i] = g[i] + (m[i] - 0.5) * 0.9 < p.balance / 100 ? 1 : 0;
	two_tone(d, t);
});
def('halftone_pattern', 'Halftone Pattern', 'Sketch', [['size', 'Size', 1, 12, 1], ['contrast', 'Contrast', 0, 50, 5], ['type', 'Pattern Type (Circle/Dot/Line)', 0, 2, 1]], (s, d, w, h, p, k) => {
	var g = gray(s, w, h), cell = (p.size + 2) * 2 * k, t = new Float32Array(w * h);
	for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
		var i = y * w + x, v = 1 - g[i], pat;
		if (p.type == 2) pat = Math.abs(((y % cell) / cell) - 0.5) * 2;
		else if (p.type == 0) pat = (Math.hypot(x - w / 2, y - h / 2) % cell) / cell;
		else pat = Math.hypot((x % cell) / cell - 0.5, (y % cell) / cell - 0.5) * 1.414;
		t[i] = Math.max(0, Math.min(1, 0.5 + (v - pat) * (1 + p.contrast / 5)));
	}
	two_tone(d, t);
});
def('note_paper', 'Note Paper', 'Sketch', [['balance', 'Image Balance', 0, 50, 25], ['graininess', 'Graininess', 0, 20, 10], ['relief', 'Relief', 0, 25, 11]], (s, d, w, h, p) => {
	var g = gray(s, w, h), t = new Float32Array(w * h);
	for (var i = 0; i < t.length; i++) t[i] = g[i] < p.balance / 50 ? 1 : 0;
	var r = relief(blur_gray(t, w, h, 1), w, h, 135, 3);
	two_tone(d, t.map((v, i) => v * 0.25));
	each(d, (i, o) => { var gr = (hash(i % w, Math.floor(i / w), 61) - 0.5) * p.graininess * 3; for (var c = 0; c < 3; c++) d[o + c] += r[i] * p.relief * 4 + gr; });
});
def('photocopy', 'Photocopy', 'Sketch', [['detail', 'Detail', 1, 24, 7], ['darkness', 'Darkness', 1, 50, 8]], (s, d, w, h, p, k) => {
	var g = gray(s, w, h), b = blur_gray(g, w, h, (p.detail / 2 + 1) * k), t = new Float32Array(w * h);
	for (var i = 0; i < t.length; i++) t[i] = Math.max(0, Math.min(1, (b[i] - g[i]) * p.darkness * 2));
	two_tone(d, t);
});
def('plaster', 'Plaster', 'Sketch', [['balance', 'Image Balance', 0, 50, 20], ['smoothness', 'Smoothness', 1, 15, 2], ['light', 'Light', 0, 7, 0]], (s, d, w, h, p, k) => {
	var g = blur_gray(gray(s, w, h), w, h, p.smoothness / 2 * k), th = new Float32Array(w * h);
	for (var i = 0; i < th.length; i++) th[i] = g[i] < p.balance / 50 ? 1 : 0;
	var r = relief(blur_gray(th, w, h, 1.5 * k), w, h, [90, 45, 0, 315, 270, 225, 180, 135][p.light] || 90, 4);
	two_tone(d, th.map((v, i) => 0.5 - r[i] * 0.5));
});
def('reticulation', 'Reticulation', 'Sketch', [['density', 'Density', 0, 50, 12], ['fg', 'Foreground Level', 0, 50, 40], ['bg', 'Background Level', 0, 50, 5]], (s, d, w, h, p) => {
	var g = gray(s, w, h), t = new Float32Array(w * h);
	for (var i = 0; i < t.length; i++) t[i] = (1 - g[i]) * (p.fg / 50) + (hash(i % w, Math.floor(i / w), 71) - 0.5) * p.density / 30 - p.bg / 100 > 0.4 ? 1 : 0;
	two_tone(d, t);
});
def('stamp', 'Stamp', 'Sketch', [['balance', 'Light/Dark Balance', 0, 50, 25], ['smoothness', 'Smoothness', 1, 50, 5]], (s, d, w, h, p, k) => {
	var g = blur_gray(gray(s, w, h), w, h, p.smoothness / 5 * k), t = new Float32Array(w * h);
	for (var i = 0; i < t.length; i++) t[i] = g[i] < p.balance / 50 ? 1 : 0;
	two_tone(d, t);
});
def('torn_edges', 'Torn Edges', 'Sketch', [['balance', 'Image Balance', 0, 50, 25], ['smoothness', 'Smoothness', 1, 15, 11], ['contrast', 'Contrast', 1, 25, 17]], (s, d, w, h, p, k) => {
	var g = gray(s, w, h), n = vnoise(w, h, 1.2, 81), t = new Float32Array(w * h);
	for (var i = 0; i < t.length; i++) t[i] = Math.max(0, Math.min(1, 0.5 + ((p.balance / 50) - g[i] + (n[i] - 0.5) * (16 - p.smoothness) / 30) * p.contrast));
	two_tone(d, blur_gray(t, w, h, 0.5 * k));
});
def('water_paper', 'Water Paper', 'Sketch', [['length', 'Fiber Length', 3, 50, 15], ['brightness', 'Brightness', 0, 100, 60], ['contrast', 'Contrast', 0, 100, 80]], (s, d, w, h, p, k) => {
	var m = motion(s, w, h, p.length / 6 * k, 90), m2 = motion(m, w, h, p.length / 8 * k, 0);
	each(d, (i, o) => { for (var c = 0; c < 3; c++) d[o + c] = (m2[o + c] - 128) * p.contrast / 60 + 128 + (p.brightness - 50) * 1.5; });
});

// ---------- Stylize ----------
def('glowing_edges', 'Glowing Edges', 'Stylize', [['width', 'Edge Width', 1, 14, 2], ['brightness', 'Edge Brightness', 0, 20, 6], ['smoothness', 'Smoothness', 1, 15, 5]], (s, d, w, h, p, k) => {
	var b = gaussian(s, w, h, p.smoothness / 5 * k);
	var ch = [0, 1, 2].map(c => { var g = new Float32Array(w * h); for (var i = 0; i < g.length; i++) g[i] = b[i * 4 + c] / 255; return blur_gray(sobel(g, w, h), w, h, (p.width - 1) / 3 * k); });
	each(d, (i, o) => { for (var c = 0; c < 3; c++) d[o + c] = Math.min(255, ch[c][i] * p.brightness * 90); });
});

// ---------- Texture ----------
def('craquelure', 'Craquelure', 'Texture', [['spacing', 'Crack Spacing', 2, 100, 15], ['depth', 'Crack Depth', 0, 10, 6], ['brightness', 'Crack Brightness', 0, 10, 9]], (s, d, w, h, p, k) => {
	var cell = Math.max(3, p.spacing * k), cracks = new Float32Array(w * h);
	for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
		var gx = Math.floor(x / cell), gy = Math.floor(y / cell), d1 = 1e9, d2 = 1e9;
		for (var j = -1; j <= 1; j++) for (var i = -1; i <= 1; i++) {
			var cx = (gx + i + hash(gx + i, gy + j, 91)) * cell, cy = (gy + j + hash(gx + i, gy + j, 92)) * cell, dd = Math.hypot(x - cx, y - cy);
			if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
		}
		cracks[y * w + x] = d2 - d1 < 1.2 * k ? 0 : 1;
	}
	var r = relief(cracks, w, h, 135, 0.5);
	each(d, (i, o) => { for (var c = 0; c < 3; c++) d[o + c] = s[o + c] * (cracks[i] ? 1 : 1 - p.depth / 14) + r[i] * p.brightness * 6; });
});
def('grain', 'Grain', 'Texture', [['intensity', 'Intensity', 0, 100, 40], ['contrast', 'Contrast', 0, 100, 50]], (s, d, w, h, p) => {
	each(d, (i, o) => { var n = (hash(i % w, Math.floor(i / w), 101) - 0.5) * p.intensity * 2.5; for (var c = 0; c < 3; c++) d[o + c] = (s[o + c] - 128) * (0.5 + p.contrast / 100) + 128 + n; });
});
def('mosaic_tiles', 'Mosaic Tiles', 'Texture', [['size', 'Tile Size', 2, 100, 12], ['grout', 'Grout Width', 1, 15, 3], ['lighten', 'Lighten Grout', 0, 10, 9]], (s, d, w, h, p, k) => {
	var size = Math.max(3, p.size * k), gw = Math.max(1, p.grout * 0.6 * k);
	each(d, (i, o) => {
		var x = i % w, y = Math.floor(i / w), jx = (hash(Math.floor(x / size), Math.floor(y / size), 111) - 0.5) * size * 0.3;
		var grout = (x + jx) % size < gw || y % size < gw;
		for (var c = 0; c < 3; c++) d[o + c] = grout ? s[o + c] * 0.4 + p.lighten * 15 : s[o + c];
	});
});
def('patchwork', 'Patchwork', 'Texture', [['size', 'Square Size', 0, 10, 4], ['relief', 'Relief', 0, 25, 8]], (s, d, w, h, p, k) => {
	var size = Math.max(2, (p.size + 2) * 1.5 * k);
	each(d, (i, o) => {
		var x = i % w, y = Math.floor(i / w), cx = Math.min(w - 1, Math.floor(Math.floor(x / size) * size + size / 2)), cy = Math.min(h - 1, Math.floor(Math.floor(y / size) * size + size / 2));
		var si = (cy * w + cx) * 4, fx = (x % size) / size, fy = (y % size) / size;
		var shade = (fx < 0.15 || fy < 0.15 ? 1 : (fx > 0.85 || fy > 0.85 ? -1 : 0)) * p.relief * 2;
		for (var c = 0; c < 3; c++) d[o + c] = s[si + c] + shade;
	});
});
def('stained_glass', 'Stained Glass', 'Texture', [['size', 'Cell Size', 2, 50, 10], ['border', 'Border Thickness', 1, 20, 4], ['light', 'Light Intensity', 0, 10, 3]], (s, d, w, h, p, k) => {
	var cell = Math.max(3, p.size * 2 * k), fg = FG();
	for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
		var gx = Math.floor(x / cell), gy = Math.floor(y / cell), d1 = 1e9, d2 = 1e9, best = null;
		for (var j = -1; j <= 1; j++) for (var i = -1; i <= 1; i++) {
			var cx = (gx + i + hash(gx + i, gy + j, 121)) * cell, cy = (gy + j + hash(gx + i, gy + j, 122)) * cell, dd = Math.hypot(x - cx, y - cy);
			if (dd < d1) { d2 = d1; d1 = dd; best = [cx, cy]; } else if (dd < d2) d2 = dd;
		}
		var o = (y * w + x) * 4;
		if (d2 - d1 < p.border * 0.5 * k) { d[o] = fg[0]; d[o + 1] = fg[1]; d[o + 2] = fg[2]; continue; }
		var sx = Math.max(0, Math.min(w - 1, Math.round(best[0]))), sy = Math.max(0, Math.min(h - 1, Math.round(best[1]))), si = (sy * w + sx) * 4;
		var lc = Math.max(0, 1 - Math.hypot(x - w / 2, y - h / 2) / Math.max(w, h)) * p.light * 15;
		d[o] = s[si] + lc; d[o + 1] = s[si + 1] + lc; d[o + 2] = s[si + 2] + lc;
	}
});
def('texturizer', 'Texturizer', 'Texture', [['texture', 'Texture (Brick/Burlap/Canvas/Sandstone)', 0, 3, 2], ['scaling', 'Scaling', 50, 200, 100], ['relief', 'Relief', 0, 50, 4], ['light', 'Light', 0, 7, 1]], (s, d, w, h, p, k) => {
	var kind = ['Brick', 'Burlap', 'Canvas', 'Sandstone'][p.texture] || 'Canvas';
	var r = relief(texture(kind, w, h, p.scaling * k), w, h, [90, 45, 0, 315, 270, 225, 180, 135][p.light] || 45, 3);
	each(d, (i, o) => { for (var c = 0; c < 3; c++) d[o + c] = s[o + c] + r[i] * p.relief * 4; });
});

const CATEGORIES = ['Artistic', 'Brush Strokes', 'Distort', 'Sketch', 'Stylize', 'Texture'];

function defaults(key) {
	var p = {};
	for (var x of E[key].params) p[x[0]] = x[4];
	return p;
}

/**
 * apply a stack of effect layers [{ key, params, visible }] to RGBA data
 */
function run_stack(src, w, h, stack, k) {
	var cur = new Uint8ClampedArray(src);
	for (var layer of stack) {
		if (layer.visible === false || !E[layer.key]) continue;
		var dst = new Uint8ClampedArray(cur);
		E[layer.key].fn(cur, dst, w, h, layer.params, k);
		//filters keep the layer's transparency
		for (var i = 3; i < dst.length; i += 4) dst[i] = cur[i];
		cur = dst;
	}
	return cur;
}

export { E as EFFECTS, CATEGORIES, defaults, run_stack };
