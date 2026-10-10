/*
 * pshot - CS6 Free Transform (Ctrl+T).
 *
 * Pixel layers (or the selected pixels) are transformed as a raster piece;
 * vector/text layers get new x/y/width/height/rotate. Handles: drag inside =
 * move, handle = scale (Shift keeps proportions, Alt scales from the center),
 * outside the box = rotate (Shift snaps to 15 degrees). Enter / double-click
 * commits, Esc cancels.
 *
 * Pixel layers can also be skewed / distorted / put in perspective (Ctrl,
 * Ctrl+Shift, Ctrl+Alt+Shift dragging a handle, or Edit > Transform). The box
 * then becomes a free quad (job.quad, corners TL TR BR BL) drawn through a
 * homography.
 */

import app from './../app.js';
import config from './../config.js';
import zoomView from './../libs/zoomView.js';
import { ensure_pixel_layer } from './pixel-layer.js';
import { Base_action } from './../actions/base.js';
import { seam_carve } from './seam-carve.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

const HANDLES = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];

//CS6 warp styles. X runs -1..1 across the bounds; Y uses the same unit, so it
//runs -a..a where a = height / width (t = 0 top .. 1 bottom); b = bend -1..1
const WARP_STYLES = {
	'None': (X, Y) => [X, Y],
	'Arc': (X, Y, b, a) => [X * (1 - b * 0.25 * Y / Math.max(1, a)), Y - b * (1 - X * X) * 0.5],
	'Arc Lower': (X, Y, b, a, t) => [X, Y + b * (1 - X * X) * t * 0.5],
	'Arc Upper': (X, Y, b, a, t) => [X, Y - b * (1 - X * X) * (1 - t) * 0.5],
	'Arch': (X, Y, b) => [X, Y - b * (1 - X * X) * 0.5],
	'Bulge': (X, Y, b) => [X, Y * (1 + b * (1 - X * X) * 0.7)],
	'Shell Lower': (X, Y, b, a, t) => [X * (1 - b * 0.4 * (1 - t)), Y + b * (1 - X * X) * t * 0.4],
	'Shell Upper': (X, Y, b, a, t) => [X * (1 - b * 0.4 * t), Y - b * (1 - X * X) * (1 - t) * 0.4],
	'Flag': (X, Y, b) => [X, Y - b * Math.sin(Math.PI * X) * 0.3],
	'Wave': (X, Y, b, a, t) => [X, Y - b * Math.sin(Math.PI * X) * 0.3 * (0.8 + 0.4 * t)],
	'Fish': (X, Y, b) => [X, Y * (1 + b * 0.5 * X) - b * Math.sin(Math.PI * X) * 0.2],
	'Rise': (X, Y, b) => [X, Y - b * Math.sin(X * Math.PI / 2) * 0.5],
	'Fisheye': (X, Y, b, a) => { var r2 = Math.min(1, (X * X + Y * Y) / (1 + a * a)), f = 1 + b * 0.6 * (1 - r2); return [X * f, Y * f]; },
	'Inflate': (X, Y, b, a) => [X * (1 + b * 0.35 * Math.min(1, a) * (1 - Y * Y / (a * a))), Y * (1 + b * 0.5 * (1 - X * X))],
	'Squeeze': (X, Y, b, a) => [X * (1 - b * 0.35 * Math.min(1, a) * (1 - Y * Y / (a * a))), Y * (1 - b * 0.5 * (1 - X * X))],
	'Twist': (X, Y, b, a) => { var r = Math.min(1, Math.sqrt((X * X + Y * Y) / (1 + a * a))), g = b * Math.PI / 2 * (1 - r); return [X * Math.cos(g) - Y * Math.sin(g), X * Math.sin(g) + Y * Math.cos(g)]; },
};

/**
 * Warp style -> 4x4 Bezier patch over the quad q (TL TR BR BL): the style's
 * displacement is sampled at thirds and fitted with an interpolating patch.
 * bend, h, v in -100..100.
 */
function warp_grid(q, style, bend, h, v, vertical) {
	var b = bend / 100, hd = h / 100, vd = v / 100;
	var fn = WARP_STYLES[style] || ((x, y) => [x, y]);
	var dist = (p, q2) => Math.hypot(p.x - q2.x, p.y - q2.y);
	var width = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2 || 1, height = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2 || 1;
	var a = vertical ? width / height : height / width;
	var map = (u, w) => {
		//local -1..1 coordinates, the style works horizontally
		var x = u * 2 - 1, y = w * 2 - 1;
		if (vertical) { var t = x; x = y; y = t; }
		var r = fn(x, y * a, b, a, (y + 1) / 2);
		x = r[0]; y = r[1] / a;
		if (vertical) { var t2 = x; x = y; y = t2; }
		//horizontal / vertical distortion (perspective-like)
		y *= 1 + hd * x * 0.5;
		x *= 1 + vd * y * 0.5;
		var U = (x + 1) / 2, V = (y + 1) / 2;
		var top = { x: q[0].x + (q[1].x - q[0].x) * U, y: q[0].y + (q[1].y - q[0].y) * U };
		var bot = { x: q[3].x + (q[2].x - q[3].x) * U, y: q[3].y + (q[2].y - q[3].y) * U };
		return { x: top.x + (bot.x - top.x) * V, y: top.y + (bot.y - top.y) * V };
	};
	//points at thirds -> Bezier control points
	var fit = (p0, pa, pb, p3) => {
		var A = { x: 27 * pa.x - 8 * p0.x - p3.x, y: 27 * pa.y - 8 * p0.y - p3.y };
		var B = { x: 27 * pb.x - p0.x - 8 * p3.x, y: 27 * pb.y - p0.y - 8 * p3.y };
		return [p0, { x: (2 * A.x - B.x) / 18, y: (2 * A.y - B.y) / 18 }, { x: (2 * B.x - A.x) / 18, y: (2 * B.y - A.y) / 18 }, p3];
	};
	var rows = [];
	for (var j = 0; j < 4; j++) {
		var pts = [0, 1, 2, 3].map(i => map(i / 3, j / 3));
		rows.push(fit(pts[0], pts[1], pts[2], pts[3]));
	}
	var grid = new Array(16);
	for (var i = 0; i < 4; i++) {
		var col = fit(rows[0][i], rows[1][i], rows[2][i], rows[3][i]);
		for (var k = 0; k < 4; k++) grid[k * 4 + i] = col[k];
	}
	return grid;
}

class Set_mask_action extends Base_action {
	constructor(selection, mask) {
		super('ps_selection', 'Transform Selection');
		this.selection = selection;
		this.mask = mask;
		this.old = null;
	}
	async do() {
		super.do();
		this.old = this.selection.mask;
		this.selection.set_mask_direct(this.mask);
	}
	async undo() {
		super.undo();
		this.selection.set_mask_direct(this.old);
	}
}

function doc_canvas() {
	var c = document.createElement('canvas');
	c.width = config.WIDTH;
	c.height = config.HEIGHT;
	return c;
}

/**
 * homography mapping the unit square to quad q (TL, TR, BR, BL)
 */
function square_to_quad(q) {
	var x0 = q[0].x, y0 = q[0].y, x1 = q[1].x, y1 = q[1].y, x2 = q[2].x, y2 = q[2].y, x3 = q[3].x, y3 = q[3].y;
	var dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
	var sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
	var g = 0, h = 0;
	if (sx != 0 || sy != 0) {
		var den = dx1 * dy2 - dx2 * dy1;
		g = (sx * dy2 - dx2 * sy) / den;
		h = (dx1 * sy - sx * dy1) / den;
	}
	var a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0;
	var d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
	return (u, v) => {
		var w = g * u + h * v + 1;
		return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w };
	};
}

/**
 * draws `img` mapped onto quad q, as a mesh of affine triangles
 */
function draw_quad(ctx, img, q) {
	var H = square_to_quad(q);
	var W = img.width, Hh = img.height;
	var n = Math.max(4, Math.min(24, Math.round(Math.max(W, Hh) / 40)));
	var tri = (s0, s1, s2, d0, d1, d2) => {
		//slightly enlarged clip hides the seams between triangles
		var cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3;
		var grow = (p) => { var dx = p.x - cx, dy = p.y - cy, l = Math.hypot(dx, dy) || 1; return { x: p.x + dx / l * 0.6, y: p.y + dy / l * 0.6 }; };
		var g0 = grow(d0), g1 = grow(d1), g2 = grow(d2);
		ctx.save();
		ctx.beginPath();
		ctx.moveTo(g0.x, g0.y); ctx.lineTo(g1.x, g1.y); ctx.lineTo(g2.x, g2.y);
		ctx.closePath();
		ctx.clip();
		var den = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
		if (Math.abs(den) < 1e-9) { ctx.restore(); return; }
		var a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / den;
		var b = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / den;
		var c = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / den;
		var d = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / den;
		var e = d0.x - a * s0.x - c * s0.y, f = d0.y - b * s0.x - d * s0.y;
		ctx.transform(a, b, c, d, e, f);
		ctx.drawImage(img, 0, 0);
		ctx.restore();
	};
	for (var j = 0; j < n; j++) {
		for (var i = 0; i < n; i++) {
			var u0 = i / n, u1 = (i + 1) / n, v0 = j / n, v1 = (j + 1) / n;
			var s00 = { x: u0 * W, y: v0 * Hh }, s10 = { x: u1 * W, y: v0 * Hh }, s01 = { x: u0 * W, y: v1 * Hh }, s11 = { x: u1 * W, y: v1 * Hh };
			var d00 = H(u0, v0), d10 = H(u1, v0), d01 = H(u0, v1), d11 = H(u1, v1);
			tri(s00, s10, s11, d00, d10, d11);
			tri(s00, s11, s01, d00, d11, d01);
		}
	}
}

/**
 * exact rendering for the final result: every destination pixel is sampled
 * (bilinear) through the inverse homography
 */
function draw_quad_exact(ctx, img, q) {
	var W = img.width, H = img.height;
	var x0 = q[0].x, y0 = q[0].y, x1 = q[1].x, y1 = q[1].y, x2 = q[2].x, y2 = q[2].y, x3 = q[3].x, y3 = q[3].y;
	var dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
	var sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
	var g = 0, h = 0;
	if (sx != 0 || sy != 0) {
		var den = dx1 * dy2 - dx2 * dy1;
		g = (sx * dy2 - dx2 * sy) / den;
		h = (dx1 * sy - sx * dy1) / den;
	}
	var a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0;
	var d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
	//inverse of [a b c; d e f; g h 1]
	var A = e - f * h, B = c * h - b, C = b * f - c * e;
	var D = f * g - d, E = a - c * g, F = c * d - a * f;
	var G = d * h - e * g, Hh = b * g - a * h, I = a * e - b * d;
	var minx = Math.max(0, Math.floor(Math.min(x0, x1, x2, x3))), maxx = Math.min(ctx.canvas.width, Math.ceil(Math.max(x0, x1, x2, x3)));
	var miny = Math.max(0, Math.floor(Math.min(y0, y1, y2, y3))), maxy = Math.min(ctx.canvas.height, Math.ceil(Math.max(y0, y1, y2, y3)));
	var w = maxx - minx, hh = maxy - miny;
	if (w <= 0 || hh <= 0) return;
	var src = img.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
	var out = new ImageData(w, hh);
	var o = out.data;
	for (var py = 0; py < hh; py++) {
		for (var px = 0; px < w; px++) {
			var X = minx + px + 0.5, Y = miny + py + 0.5;
			var z = G * X + Hh * Y + I;
			var u = (A * X + B * Y + C) / z, v = (D * X + E * Y + F) / z;
			if (u < 0 || v < 0 || u > 1 || v > 1) continue;
			var fx = u * W - 0.5, fy = v * H - 0.5;
			var ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
			var k = (py * w + px) * 4;
			for (var ch = 0; ch < 4; ch++) {
				var s00 = src[((Math.max(0, iy) * W) + Math.max(0, ix)) * 4 + ch];
				var s10 = src[((Math.max(0, iy) * W) + Math.min(W - 1, ix + 1)) * 4 + ch];
				var s01 = src[((Math.min(H - 1, iy + 1) * W) + Math.max(0, ix)) * 4 + ch];
				var s11 = src[((Math.min(H - 1, iy + 1) * W) + Math.min(W - 1, ix + 1)) * 4 + ch];
				o[k + ch] = (s00 * (1 - tx) + s10 * tx) * (1 - ty) + (s01 * (1 - tx) + s11 * tx) * ty;
			}
		}
	}
	var tmp = document.createElement('canvas');
	tmp.width = w;
	tmp.height = hh;
	tmp.getContext('2d').putImageData(out, 0, 0);
	ctx.drawImage(tmp, minx, miny);
}

// ---------- Warp: cubic Bezier patch (4x4 control points, row-major) ----------

function bern(t) {
	var u = 1 - t;
	return [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
}

function bern_d(t) {
	var u = 1 - t;
	return [-3 * u * u, 3 * u * u - 6 * u * t, 6 * u * t - 3 * t * t, 3 * t * t];
}

function patch_at(g, u, v) {
	var bu = bern(u), bv = bern(v), x = 0, y = 0;
	for (var j = 0; j < 4; j++) for (var i = 0; i < 4; i++) {
		var w = bu[i] * bv[j], p = g[j * 4 + i];
		x += p.x * w; y += p.y * w;
	}
	return { x: x, y: y };
}

/**
 * preview: the patch as a mesh of affine triangles (same technique as draw_quad)
 */
function draw_patch(ctx, img, g) {
	var n = 16, W = img.width, H = img.height;
	var pts = [];
	for (var j = 0; j <= n; j++) for (var i = 0; i <= n; i++) pts.push(patch_at(g, i / n, j / n));
	var tri = (s0, s1, s2, d0, d1, d2) => {
		var cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3;
		var grow = (p) => { var dx = p.x - cx, dy = p.y - cy, l = Math.hypot(dx, dy) || 1; return { x: p.x + dx / l * 0.6, y: p.y + dy / l * 0.6 }; };
		var g0 = grow(d0), g1 = grow(d1), g2 = grow(d2);
		ctx.save();
		ctx.beginPath();
		ctx.moveTo(g0.x, g0.y); ctx.lineTo(g1.x, g1.y); ctx.lineTo(g2.x, g2.y);
		ctx.closePath();
		ctx.clip();
		var den = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
		if (Math.abs(den) < 1e-9) { ctx.restore(); return; }
		var a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / den;
		var b = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / den;
		var c = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / den;
		var d = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / den;
		ctx.transform(a, b, c, d, d0.x - a * s0.x - c * s0.y, d0.y - b * s0.x - d * s0.y);
		ctx.drawImage(img, 0, 0);
		ctx.restore();
	};
	for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
		var k = y * (n + 1) + x;
		var s00 = { x: x / n * W, y: y / n * H }, s10 = { x: (x + 1) / n * W, y: y / n * H }, s01 = { x: x / n * W, y: (y + 1) / n * H }, s11 = { x: (x + 1) / n * W, y: (y + 1) / n * H };
		tri(s00, s10, s11, pts[k], pts[k + 1], pts[k + n + 2]);
		tri(s00, s11, s01, pts[k], pts[k + n + 2], pts[k + n + 1]);
	}
}

/**
 * commit: every destination pixel is solved back to (u, v) with Newton steps
 * from a coarse lookup, then sampled bilinearly
 */
function draw_patch_exact(ctx, img, g) {
	var W = img.width, H = img.height;
	var N = 48, lut = [];
	for (var j = 0; j <= N; j++) for (var i = 0; i <= N; i++) { var q = patch_at(g, i / N, j / N); lut.push({ x: q.x, y: q.y, u: i / N, v: j / N }); }
	var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
	for (var q2 of lut) { minx = Math.min(minx, q2.x); miny = Math.min(miny, q2.y); maxx = Math.max(maxx, q2.x); maxy = Math.max(maxy, q2.y); }
	minx = Math.max(0, Math.floor(minx)); miny = Math.max(0, Math.floor(miny));
	maxx = Math.min(ctx.canvas.width, Math.ceil(maxx)); maxy = Math.min(ctx.canvas.height, Math.ceil(maxy));
	var w = maxx - minx, h = maxy - miny;
	if (w <= 0 || h <= 0) return;
	//spatial buckets for the initial guess
	var cell = 8, bw = Math.ceil(w / cell) + 1, buckets = new Map();
	for (var q3 of lut) {
		var key = Math.floor((q3.y - miny) / cell) * bw + Math.floor((q3.x - minx) / cell);
		if (!buckets.has(key)) buckets.set(key, []);
		buckets.get(key).push(q3);
	}
	var src = img.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
	var out = new ImageData(w, h), o = out.data;
	var prev = null;
	for (var py = 0; py < h; py++) {
		for (var px = 0; px < w; px++) {
			var X = minx + px + 0.5, Y = miny + py + 0.5;
			var u, v;
			if (prev && px > 0) { u = prev.u; v = prev.v; }
			else {
				var best = null, bd = Infinity, bx = Math.floor((X - minx) / cell), by = Math.floor((Y - miny) / cell);
				for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
					var list = buckets.get((by + dy) * bw + bx + dx);
					if (!list) continue;
					for (var c of list) { var dd = (c.x - X) * (c.x - X) + (c.y - Y) * (c.y - Y); if (dd < bd) { bd = dd; best = c; } }
				}
				if (!best) { prev = null; continue; }
				u = best.u; v = best.v;
			}
			var ok = false;
			for (var it = 0; it < 8; it++) {
				var bu = bern(u), bv = bern(v), du = bern_d(u), dv = bern_d(v);
				var fx = 0, fy = 0, xu = 0, yu = 0, xv = 0, yv = 0;
				for (var jj = 0; jj < 4; jj++) for (var ii = 0; ii < 4; ii++) {
					var p = g[jj * 4 + ii];
					fx += p.x * bu[ii] * bv[jj]; fy += p.y * bu[ii] * bv[jj];
					xu += p.x * du[ii] * bv[jj]; yu += p.y * du[ii] * bv[jj];
					xv += p.x * bu[ii] * dv[jj]; yv += p.y * bu[ii] * dv[jj];
				}
				var ex = fx - X, ey = fy - Y;
				if (ex * ex + ey * ey < 0.0025) { ok = true; break; }
				var det = xu * yv - xv * yu;
				if (Math.abs(det) < 1e-9) break;
				u -= (ex * yv - ey * xv) / det;
				v -= (ey * xu - ex * yu) / det;
			}
			if (!ok || u < -0.001 || v < -0.001 || u > 1.001 || v > 1.001) { prev = null; continue; }
			prev = { u: u, v: v };
			var sx = Math.min(W - 1.001, Math.max(0, u * W - 0.5)), sy = Math.min(H - 1.001, Math.max(0, v * H - 0.5));
			var ix = sx | 0, iy = sy | 0, tx = sx - ix, ty = sy - iy, k = (py * w + px) * 4;
			var a00 = (iy * W + ix) * 4, a10 = a00 + 4, a01 = a00 + W * 4, a11 = a01 + 4;
			for (var ch = 0; ch < 4; ch++) {
				o[k + ch] = (src[a00 + ch] * (1 - tx) + src[a10 + ch] * tx) * (1 - ty) + (src[a01 + ch] * (1 - tx) + src[a11 + ch] * tx) * ty;
			}
		}
	}
	var tmp = document.createElement('canvas');
	tmp.width = w;
	tmp.height = h;
	tmp.getContext('2d').putImageData(out, 0, 0);
	ctx.drawImage(tmp, minx, miny);
}

function point_in_quad(p, q) {
	var inside = false;
	for (var i = 0, j = 3; i < 4; j = i++) {
		if (((q[i].y > p.y) != (q[j].y > p.y)) && (p.x < (q[j].x - q[i].x) * (p.y - q[i].y) / (q[j].y - q[i].y) + q[i].x)) inside = !inside;
	}
	return inside;
}

class Ps_transform_class {

	constructor() {
		this.job = null;
		this.drag = null;
		this.install();
	}

	active() {
		return this.job !== null;
	}

	selection() {
		return app.GUI.Ps_workspace.Selection;
	}

	// ---------- start ----------

	start() {
		if (this.job) {
			return;
		}
		var layer = config.layer;
		if (!layer || layer.type == null) {
			ensure_pixel_layer();
			layer = config.layer;
		}
		if (!layer || layer.type == null) {
			alertify.error('Could not complete the Free Transform command because the layer is empty.');
			return;
		}
		var sel = this.selection();
		if (layer.type == 'image') {
			this.start_pixels(layer, sel.has() ? sel : null);
		}
		else {
			this.start_vector(layer);
		}
		if (!this.job) {
			return;
		}
		this.job.box0 = Object.assign({}, this.job.box);
		app.GUI.Ps_workspace.Options_bar.render_transform();
		app.GUI.Ps_workspace.status_message('Free Transform: drag handles to scale, outside to rotate. Enter commits, Esc cancels.');
		sel.decorate = (ctx, scale) => this.draw_box(ctx, scale);
		sel.draw_overlay();
	}

	/**
	 * Smart Objects: the layer's pixels from a (new) source at its current box/quad
	 */
	render_smart(layer, source) {
		var smart = layer.ps_smart;
		//Smart Filters run on the source before the transform
		if (smart.filters && smart.filters.length) source = app.GUI.Ps_workspace.Smart_filters.filtered(Object.assign({}, smart, { source: source }));
		var dx = layer.x - smart.lx, dy = layer.y - smart.ly;
		var out = doc_canvas();
		var ctx = out.getContext('2d');
		if (smart.warp) {
			draw_patch_exact(ctx, source, smart.warp.map(c => ({ x: c.x + dx, y: c.y + dy })));
		}
		else if (smart.quad) {
			draw_quad_exact(ctx, source, smart.quad.map(c => ({ x: c.x + dx, y: c.y + dy })));
		}
		else {
			var b = smart.box;
			ctx.save();
			ctx.translate(b.cx + dx, b.cy + dy);
			ctx.rotate(b.angle);
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(source, -b.w / 2, -b.h / 2, b.w, b.h);
			ctx.restore();
		}
		return out;
	}

	/**
	 * Smart Objects: transform from the original pixels (non-destructive)
	 */
	start_smart(layer) {
		var smart = layer.ps_smart;
		var dx = layer.x - smart.lx, dy = layer.y - smart.ly;
		var box = Object.assign({}, smart.box);
		box.cx += dx;
		box.cy += dy;
		this.job = {
			kind: 'pixels',
			smart: true,
			layer: layer,
			piece: smart.filters && smart.filters.length ? app.GUI.Ps_workspace.Smart_filters.filtered(smart) : smart.source,
			smart_source: smart.source,
			smart_state: smart,
			hole: doc_canvas(),
			mask_piece: null,
			geometry: { x: layer.x, y: layer.y, width: layer.width, height: layer.height, width_original: layer.width_original, height_original: layer.height_original },
			box: box,
			quad: smart.quad ? smart.quad.map(c => ({ x: c.x + dx, y: c.y + dy })) : null,
			warp: smart.warp ? smart.warp.map(c => ({ x: c.x + dx, y: c.y + dy })) : null,
			w0: smart.source.width,
			h0: smart.source.height,
		};
		Object.assign(layer, { x: 0, y: 0, width: config.WIDTH, height: config.HEIGHT, width_original: config.WIDTH, height_original: config.HEIGHT });
		this.preview();
	}

	start_pixels(layer, sel) {
		if (layer.ps_smart && !sel) {
			return this.start_smart(layer);
		}
		//everything in document space
		var full = doc_canvas();
		var fctx = full.getContext('2d');
		fctx.drawImage(layer.link, layer.x, layer.y, layer.width, layer.height);
		var bounds;
		var piece_src = doc_canvas();
		var pctx = piece_src.getContext('2d');
		pctx.drawImage(full, 0, 0);
		var hole = doc_canvas();
		var hctx = hole.getContext('2d');
		if (sel) {
			pctx.globalCompositeOperation = 'destination-in';
			pctx.drawImage(sel.mask, 0, 0);
			hctx.drawImage(full, 0, 0);
			hctx.globalCompositeOperation = 'destination-out';
			hctx.drawImage(sel.mask, 0, 0);
			bounds = sel.bounds;
		}
		else {
			bounds = this.alpha_bounds(full) || { x: 0, y: 0, width: config.WIDTH, height: config.HEIGHT };
		}
		if (!bounds) {
			return;
		}
		var piece = document.createElement('canvas');
		piece.width = bounds.width;
		piece.height = bounds.height;
		piece.getContext('2d').drawImage(piece_src, -bounds.x, -bounds.y);

		this.job = {
			kind: 'pixels',
			layer: layer,
			piece: piece,
			hole: hole,
			mask_piece: sel ? this.crop(sel.mask, bounds) : null,
			geometry: { x: layer.x, y: layer.y, width: layer.width, height: layer.height, width_original: layer.width_original, height_original: layer.height_original },
			box: { cx: bounds.x + bounds.width / 2, cy: bounds.y + bounds.height / 2, w: bounds.width, h: bounds.height, angle: 0 },
			w0: bounds.width,
			h0: bounds.height,
		};
		//preview: the layer temporarily covers the document and shows link_canvas
		Object.assign(layer, { x: 0, y: 0, width: config.WIDTH, height: config.HEIGHT, width_original: config.WIDTH, height_original: config.HEIGHT });
		this.preview();
	}

	start_vector(layer) {
		if (layer.width == null || layer.height == null) {
			alertify.error('This layer can not be transformed.');
			return;
		}
		var w = Math.abs(layer.width), h = Math.abs(layer.height);
		this.job = {
			kind: 'vector',
			layer: layer,
			original: { x: layer.x, y: layer.y, width: layer.width, height: layer.height, rotate: layer.rotate || 0 },
			box: { cx: layer.x + w / 2, cy: layer.y + h / 2, w: w, h: h, angle: (layer.rotate || 0) * Math.PI / 180 },
			w0: w,
			h0: h,
		};
	}

	crop(canvas, b) {
		var c = document.createElement('canvas');
		c.width = b.width;
		c.height = b.height;
		c.getContext('2d').drawImage(canvas, -b.x, -b.y);
		return c;
	}

	alpha_bounds(canvas) {
		var w = canvas.width, h = canvas.height;
		var d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
		var minx = w, miny = h, maxx = -1, maxy = -1;
		for (var y = 0; y < h; y++) {
			for (var x = 0; x < w; x++) {
				if (d[(y * w + x) * 4 + 3] > 0) {
					if (x < minx) minx = x;
					if (x > maxx) maxx = x;
					if (y < miny) miny = y;
					if (y > maxy) maxy = y;
				}
			}
		}
		return maxx < 0 ? null : { x: minx, y: miny, width: maxx - minx + 1, height: maxy - miny + 1 };
	}

	// ---------- rendering ----------

	draw_piece(ctx, piece, exact) {
		if (this.job.warp) {
			ctx.save();
			ctx.imageSmoothingQuality = 'high';
			if (exact) draw_patch_exact(ctx, piece, this.job.warp);
			else draw_patch(ctx, piece, this.job.warp);
			ctx.restore();
			return;
		}
		if (this.job.quad) {
			ctx.save();
			ctx.imageSmoothingQuality = 'high';
			if (exact) draw_quad_exact(ctx, piece, this.job.quad);
			else draw_quad(ctx, piece, this.job.quad);
			ctx.restore();
			return;
		}
		var b = this.job.box;
		ctx.save();
		ctx.translate(b.cx, b.cy);
		ctx.rotate(b.angle);
		ctx.scale(b.w / this.job.w0, b.h / this.job.h0);
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(piece, -this.job.w0 / 2, -this.job.h0 / 2);
		ctx.restore();
	}

	result_canvas(exact) {
		var out = doc_canvas();
		var ctx = out.getContext('2d');
		ctx.drawImage(this.job.hole, 0, 0);
		this.draw_piece(ctx, this.job.piece, exact);
		return out;
	}

	preview() {
		var job = this.job;
		if (job.kind == 'selection') {
			//show the transformed outline (no History until committed)
			var mask = doc_canvas();
			this.draw_piece(mask.getContext('2d'), job.piece);
			this.selection().set_mask_direct(mask);
			config.need_render = true;
			this.selection().draw_overlay();
			return;
		}
		if (job.kind == 'pixels') {
			job.layer.link_canvas = this.result_canvas();
		}
		else {
			var b = job.box;
			job.layer.x = b.cx - b.w / 2;
			job.layer.y = b.cy - b.h / 2;
			job.layer.width = b.w;
			job.layer.height = b.h;
			job.layer.rotate = b.angle * 180 / Math.PI;
		}
		config.need_render = true;
		this.selection().draw_overlay();
		app.GUI.Ps_workspace.Options_bar.update_transform_fields();
	}

	corners() {
		if (this.job.quad) {
			var q = this.job.quad, mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
			return [q[0], mid(q[0], q[1]), q[1], mid(q[1], q[2]), q[2], mid(q[2], q[3]), q[3], mid(q[3], q[0])];
		}
		var b = this.job.box;
		var cos = Math.cos(b.angle), sin = Math.sin(b.angle);
		return HANDLES.map(([hx, hy]) => {
			var lx = hx * b.w / 2, ly = hy * b.h / 2;
			return { x: b.cx + lx * cos - ly * sin, y: b.cy + lx * sin + ly * cos };
		});
	}

	draw_box(ctx, scale) {
		if (!this.job) {
			return;
		}
		if (this.job.warp) {
			var g = this.job.warp;
			ctx.save();
			ctx.lineWidth = 1 / scale;
			ctx.strokeStyle = '#000';
			for (var t = 0; t <= 3; t++) {
				ctx.beginPath();
				for (var k = 0; k <= 24; k++) { var a = patch_at(g, k / 24, t / 3); k == 0 ? ctx.moveTo(a.x, a.y) : ctx.lineTo(a.x, a.y); }
				ctx.stroke();
				ctx.beginPath();
				for (var k2 = 0; k2 <= 24; k2++) { var b = patch_at(g, t / 3, k2 / 24); k2 == 0 ? ctx.moveTo(b.x, b.y) : ctx.lineTo(b.x, b.y); }
				ctx.stroke();
			}
			//control handles: lines from each corner to its two handles
			ctx.strokeStyle = 'rgba(0,0,0,0.6)';
			ctx.beginPath();
			for (var [c0, h1, h2] of [[0, 1, 4], [3, 2, 7], [12, 13, 8], [15, 14, 11]]) {
				ctx.moveTo(g[h1].x, g[h1].y); ctx.lineTo(g[c0].x, g[c0].y); ctx.lineTo(g[h2].x, g[h2].y);
			}
			ctx.stroke();
			var s = 6 / scale;
			g.forEach((p, i) => {
				ctx.fillStyle = [0, 3, 12, 15].includes(i) ? '#fff' : '#ddd';
				ctx.strokeStyle = '#000';
				if ([5, 6, 9, 10].includes(i)) { ctx.beginPath(); ctx.arc(p.x, p.y, s / 2.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); return; }
				ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
				ctx.strokeRect(p.x - s / 2, p.y - s / 2, s, s);
			});
			ctx.restore();
			return;
		}
		var pts = this.corners();
		var corners = [pts[0], pts[2], pts[4], pts[6]];
		ctx.save();
		ctx.lineWidth = 1 / scale;
		ctx.strokeStyle = '#000';
		ctx.beginPath();
		corners.forEach((p, i) => i == 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
		ctx.closePath();
		ctx.stroke();
		var s = 7 / scale;
		for (var p of pts) {
			ctx.fillStyle = '#fff';
			ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
			ctx.strokeRect(p.x - s / 2, p.y - s / 2, s, s);
		}
		//reference point
		ctx.beginPath();
		ctx.arc(this.job.box.cx, this.job.box.cy, 3 / scale, 0, Math.PI * 2);
		ctx.stroke();
		ctx.restore();
	}

	// ---------- interaction ----------

	world(event) {
		var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
		return app.Layers.get_world_coords(event.clientX - rect.left, event.clientY - rect.top);
	}

	to_local(p) {
		var b = this.job.box;
		var dx = p.x - b.cx, dy = p.y - b.cy;
		var cos = Math.cos(-b.angle), sin = Math.sin(-b.angle);
		return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
	}

	hit(p) {
		var tol = 8 / zoomView.getScale();
		var pts = this.corners();
		for (var i = 0; i < pts.length; i++) {
			if (Math.abs(pts[i].x - p.x) <= tol && Math.abs(pts[i].y - p.y) <= tol) {
				return { mode: 'scale', handle: i };
			}
		}
		if (this.job.quad) {
			return { mode: point_in_quad(p, this.job.quad) ? 'move' : 'rotate' };
		}
		var l = this.to_local(p);
		var b = this.job.box;
		if (Math.abs(l.x) <= b.w / 2 && Math.abs(l.y) <= b.h / 2) {
			return { mode: 'move' };
		}
		return { mode: 'rotate' };
	}

	install() {
		var on_canvas = (e) => e.target.id == 'canvas_minipaint' || e.target.id == 'main_wrapper' || e.target.id == 'ps_selection_overlay';

		document.addEventListener('mousedown', (e) => {
			if (!this.job) return;
			if (!on_canvas(e)) {
				//clicking UI (menus, panels) keeps transforming, except the toolbox which commits (CS6 asks)
				if (e.target.closest && e.target.closest('#tools_container')) this.commit();
				return;
			}
			e.stopImmediatePropagation();
			e.preventDefault();
			var p = this.world(e);
			if (this.job.warp) {
				var tol = 8 / zoomView.getScale();
				var wi = this.job.warp.findIndex(c => Math.abs(c.x - p.x) <= tol && Math.abs(c.y - p.y) <= tol);
				this.drag = { mode: 'warp', index: wi, start: p, warp: this.job.warp.map(c => ({ x: c.x, y: c.y })) };
				return;
			}
			var h = this.hit(p);
			//Ctrl = Distort, Ctrl+Shift = Skew, Ctrl+Alt+Shift = Perspective (pixels only)
			var ctrl = e.ctrlKey || e.metaKey;
			var shape = this.job.mode_override || (ctrl ? (e.shiftKey && e.altKey ? 'perspective' : (e.shiftKey ? 'skew' : 'distort')) : null);
			if (h.mode == 'scale' && !this.job.content_aware && (shape || this.job.quad) && (this.job.kind == 'pixels' || this.job.kind == 'selection')) {
				this.ensure_quad();
				h.mode = shape || 'distort';
			}
			this.drag = Object.assign(h, { start: p, box: Object.assign({}, this.job.box), quad: this.job.quad ? this.job.quad.map(c => ({ x: c.x, y: c.y })) : null });
		}, true);

		document.addEventListener('mousemove', (e) => {
			if (!this.job) return;
			if (!this.drag) {
				if (on_canvas(e)) {
					var mode = this.hit(this.world(e)).mode;
					document.getElementById('main_wrapper').style.cursor = mode == 'move' ? 'move' : (mode == 'rotate' ? 'alias' : 'nwse-resize');
				}
				return;
			}
			e.stopImmediatePropagation();
			this.apply_drag(this.world(e), e);
			this.preview();
		}, true);

		document.addEventListener('mouseup', (e) => {
			if (!this.job || !this.drag) return;
			e.stopImmediatePropagation();
			this.drag = null;
		}, true);

		document.addEventListener('dblclick', (e) => {
			if (this.job && on_canvas(e)) {
				e.stopImmediatePropagation();
				this.commit();
			}
		}, true);

		window.addEventListener('keydown', (e) => {
			if (!this.job) return;
			//typing in the options bar fields (Enter applies the value there)
			if (e.target && (e.target.tagName == 'INPUT' || e.target.tagName == 'SELECT')) return;
			if (e.key == 'Enter') {
				e.preventDefault();
				e.stopImmediatePropagation();
				this.commit();
			}
			else if (e.key == 'Escape') {
				e.preventDefault();
				e.stopImmediatePropagation();
				this.cancel();
			}
		}, true);
	}

	ensure_quad() {
		if (this.job.quad) return;
		var c = this.corners();
		this.job.quad = [c[0], c[2], c[4], c[6]].map(p => ({ x: p.x, y: p.y }));
	}

	/**
	 * Skew / Distort / Perspective drags on the quad
	 */
	apply_quad_drag(p, e) {
		var d = this.drag, q = this.job.quad, s = d.quad;
		var dx = p.x - d.start.x, dy = p.y - d.start.y;
		if (d.mode == 'move') {
			for (var i = 0; i < 4; i++) { q[i].x = s[i].x + dx; q[i].y = s[i].y + dy; }
			return;
		}
		if (d.mode == 'rotate') {
			var cx = (s[0].x + s[1].x + s[2].x + s[3].x) / 4, cy = (s[0].y + s[1].y + s[2].y + s[3].y) / 4;
			var a = Math.atan2(p.y - cy, p.x - cx) - Math.atan2(d.start.y - cy, d.start.x - cx);
			if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
			var cos = Math.cos(a), sin = Math.sin(a);
			for (var k = 0; k < 4; k++) {
				var rx = s[k].x - cx, ry = s[k].y - cy;
				q[k].x = cx + rx * cos - ry * sin;
				q[k].y = cy + rx * sin + ry * cos;
			}
			return;
		}
		var handle = d.handle;
		if (handle % 2 == 0) {
			//corner
			var ci = handle / 2;
			if (d.mode == 'perspective') {
				//the corner on the same side moves the opposite way
				var horizontal = Math.abs(dx) >= Math.abs(dy);
				var partner = horizontal ? [1, 0, 3, 2][ci] : [3, 2, 1, 0][ci];
				for (var k2 = 0; k2 < 4; k2++) { q[k2].x = s[k2].x; q[k2].y = s[k2].y; }
				if (horizontal) { q[ci].x = s[ci].x + dx; q[partner].x = s[partner].x - dx; }
				else { q[ci].y = s[ci].y + dy; q[partner].y = s[partner].y - dy; }
			}
			else if (d.mode == 'skew') {
				//a corner slides along one axis only
				q[ci].x = s[ci].x + (Math.abs(dx) >= Math.abs(dy) ? dx : 0);
				q[ci].y = s[ci].y + (Math.abs(dx) >= Math.abs(dy) ? 0 : dy);
			}
			else {
				q[ci].x = s[ci].x + dx;
				q[ci].y = s[ci].y + dy;
			}
			return;
		}
		//side handle: its two corners
		var side = [[0, 1], [1, 2], [2, 3], [3, 0]][(handle - 1) / 2];
		var ax = s[side[1]].x - s[side[0]].x, ay = s[side[1]].y - s[side[0]].y, al = Math.hypot(ax, ay) || 1;
		var mx = dx, my = dy;
		if (d.mode == 'skew' || d.mode == 'perspective') {
			//along the side only
			var t = (dx * ax + dy * ay) / al;
			mx = ax / al * t;
			my = ay / al * t;
		}
		for (var k3 = 0; k3 < 4; k3++) { q[k3].x = s[k3].x; q[k3].y = s[k3].y; }
		for (var c of side) { q[c].x = s[c].x + mx; q[c].y = s[c].y + my; }
	}

	apply_drag(p, e) {
		var d = this.drag;
		if (d.mode == 'warp') {
			var dx = p.x - d.start.x, dy = p.y - d.start.y, g = this.job.warp;
			if (this.job.warp_style && this.job.warp_style.style != 'Custom') {
				this.job.warp_style = null;
				app.GUI.Ps_workspace.Options_bar.render_transform();
			}
			if (d.index < 0) {
				//dragging the surface moves the whole mesh
				g.forEach((c, i) => { c.x = d.warp[i].x + dx; c.y = d.warp[i].y + dy; });
				return;
			}
			g[d.index].x = d.warp[d.index].x + dx;
			g[d.index].y = d.warp[d.index].y + dy;
			//a corner carries its handles
			var carry = { 0: [1, 4, 5], 3: [2, 7, 6], 12: [13, 8, 9], 15: [14, 11, 10] }[d.index];
			if (carry) carry.forEach(i => { g[i].x = d.warp[i].x + dx; g[i].y = d.warp[i].y + dy; });
			return;
		}
		if (this.job.quad) {
			return this.apply_quad_drag(p, e);
		}
		var b = this.job.box;
		var start = d.box;
		if (d.mode == 'move') {
			b.cx = start.cx + (p.x - d.start.x);
			b.cy = start.cy + (p.y - d.start.y);
			return;
		}
		if (d.mode == 'rotate') {
			var a0 = Math.atan2(d.start.y - start.cy, d.start.x - start.cx);
			var a1 = Math.atan2(p.y - start.cy, p.x - start.cx);
			var angle = start.angle + (a1 - a0);
			if (e.shiftKey) {
				var step = Math.PI / 12;
				angle = Math.round(angle / step) * step;
			}
			b.angle = angle;
			return;
		}
		//scale: work in the box's local (unrotated) frame of the drag start
		var cos = Math.cos(-start.angle), sin = Math.sin(-start.angle);
		var dx = p.x - start.cx, dy = p.y - start.cy;
		var lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
		var hx = HANDLES[d.handle][0], hy = HANDLES[d.handle][1];
		var left = -start.w / 2, right = start.w / 2, top = -start.h / 2, bottom = start.h / 2;
		if (e.altKey) {
			//scale around the center
			if (hx != 0) { left = -Math.abs(lx); right = Math.abs(lx); }
			if (hy != 0) { top = -Math.abs(ly); bottom = Math.abs(ly); }
		}
		else {
			if (hx == -1) left = lx;
			if (hx == 1) right = lx;
			if (hy == -1) top = ly;
			if (hy == 1) bottom = ly;
		}
		var w = right - left, h = bottom - top;
		if (e.shiftKey && hx != 0 && hy != 0) {
			//keep proportions
			var ratio = start.w / start.h;
			if (Math.abs(w) / ratio > Math.abs(h)) {
				h = Math.sign(h || 1) * Math.abs(w) / ratio;
			}
			else {
				w = Math.sign(w || 1) * Math.abs(h) * ratio;
			}
			if (!e.altKey) {
				if (hx == -1) left = right - w; else right = left + w;
				if (hy == -1) top = bottom - h; else bottom = top + h;
			}
			else {
				left = -w / 2; right = w / 2; top = -h / 2; bottom = h / 2;
			}
		}
		if (Math.abs(w) < 1) w = w < 0 ? -1 : 1;
		if (Math.abs(h) < 1) h = h < 0 ? -1 : 1;
		var mx = (left + right) / 2, my = (top + bottom) / 2;
		var cosb = Math.cos(start.angle), sinb = Math.sin(start.angle);
		b.cx = start.cx + mx * cosb - my * sinb;
		b.cy = start.cy + mx * sinb + my * cosb;
		b.w = right - left;
		b.h = bottom - top;
		b.angle = start.angle;
	}

	// ---------- finish ----------

	cleanup() {
		var sel = this.selection();
		sel.decorate = null;
		sel.draw_overlay();
		document.getElementById('main_wrapper').style.cursor = '';
		this.job = null;
		this.drag = null;
		config.need_render = true;
		//back to the tool's options bar
		if (!app.GUI.Ps_workspace.Options_bar.render()) app.GUI.GUI_tools.show_action_attributes();
	}

	cancel() {
		var job = this.job;
		if (!job) return;
		if (job.kind == 'selection') {
			this.selection().set_mask_direct(job.original_mask);
		}
		else if (job.kind == 'pixels') {
			delete job.layer.link_canvas;
			Object.assign(job.layer, job.geometry);
		}
		else {
			Object.assign(job.layer, job.original);
		}
		this.cleanup();
	}

	/**
	 * Transform Again needs the last transform relative to its starting bounds
	 */
	remember(job) {
		var b0 = { x: job.box0.cx - job.box0.w / 2, y: job.box0.cy - job.box0.h / 2, w: job.box0.w, h: job.box0.h };
		var corners = this.corners();
		var quad = job.quad || [corners[0], corners[2], corners[4], corners[6]];
		this.last = quad.map(c => ({ u: (c.x - b0.x) / b0.w, v: (c.y - b0.y) / b0.h }));
	}

	/**
	 * Edit > Transform > Again (Shift+Ctrl+T)
	 */
	again() {
		if (!this.last) return;
		var rel = this.last;
		this.start();
		if (!this.job) return;
		var b = this.job.box;
		var x = b.cx - b.w / 2, y = b.cy - b.h / 2;
		var quad = rel.map(r => ({ x: x + r.u * b.w, y: y + r.v * b.h }));
		if (this.job.kind == 'pixels') {
			this.job.quad = quad;
		}
		else {
			//vector layers: scale/rotate/move only
			var cx = (quad[0].x + quad[2].x) / 2, cy = (quad[0].y + quad[2].y) / 2;
			b.angle = Math.atan2(quad[1].y - quad[0].y, quad[1].x - quad[0].x);
			b.w = Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y);
			b.h = Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y);
			b.cx = cx;
			b.cy = cy;
		}
		this.commit();
	}

	/**
	 * Select > Transform Selection: transforms only the selection outline
	 */
	start_selection() {
		var sel = this.selection();
		if (this.job || !sel.has() || !sel.bounds) {
			return;
		}
		var b = sel.bounds;
		var piece = this.crop(sel.mask, b);
		this.job = {
			kind: 'selection',
			layer: config.layer,
			piece: piece,
			original_mask: sel.mask,
			box: { cx: b.x + b.width / 2, cy: b.y + b.height / 2, w: b.width, h: b.height, angle: 0 },
			w0: b.width,
			h0: b.height,
		};
		this.job.box0 = Object.assign({}, this.job.box);
		sel.decorate = (ctx, scale) => this.draw_box(ctx, scale);
		app.GUI.Ps_workspace.Options_bar.render_transform();
		app.GUI.Ps_workspace.status_message('Transform Selection: drag handles to scale, outside to rotate. Enter commits, Esc cancels.');
		this.preview();
	}

	selection_result() {
		var mask = doc_canvas();
		this.draw_piece(mask.getContext('2d'), this.job.piece, true);
		return mask;
	}

	/**
	 * CS6 Warp styles (options bar), relative to the bounds when warping began
	 */
	warp_preset(style, bend, h, v, vertical) {
		var job = this.job;
		if (!job) return;
		job.warp_style = { style: style, bend: bend, h: h, v: v, vertical: !!vertical };
		if (style == 'Custom') return;
		var c = this.corners(), q = [c[0], c[2], c[4], c[6]];
		if (job.base_quad) q = job.base_quad;
		else job.base_quad = q.map(p => ({ x: p.x, y: p.y }));
		var grid = warp_grid(q, style, bend, h, v, vertical);
		job.warp = grid;
		job.quad = null;
		this.preview();
	}

	/**
	 * Edit > Transform > Skew / Distort / Perspective
	 */
	/**
	 * the transform's context menu: Rotate 180° / 90° CW / 90° CCW, Flip
	 * Horizontal / Vertical of the box (and its distort or warp points)
	 */
	orient(kind, angle) {
		var job = this.job;
		if (!job) return;
		var b = job.box;
		var cos0 = Math.cos(b.angle), sin0 = Math.sin(b.angle);
		var f;
		if (kind == 'rotate') {
			var cos = Math.cos(angle), sin = Math.sin(angle);
			f = (p) => { var dx = p.x - b.cx, dy = p.y - b.cy; return { x: b.cx + dx * cos - dy * sin, y: b.cy + dx * sin + dy * cos }; };
			b.angle += angle;
		}
		else {
			//mirror across the box's own vertical (flip_h) or horizontal axis
			f = (p) => {
				var dx = p.x - b.cx, dy = p.y - b.cy;
				var lx = dx * cos0 + dy * sin0, ly = -dx * sin0 + dy * cos0;
				if (kind == 'flip_h') lx = -lx; else ly = -ly;
				return { x: b.cx + lx * cos0 - ly * sin0, y: b.cy + lx * sin0 + ly * cos0 };
			};
			if (kind == 'flip_h') b.w = -b.w; else b.h = -b.h;
		}
		if (job.quad) job.quad = job.quad.map(f);
		if (job.warp) job.warp = job.warp.map(f);
		this.preview();
		app.GUI.Ps_workspace.Options_bar.render_transform();
	}

	start_mode(mode) {
		var layer = config.layer;
		if (mode == 'warp') {
			this.start();
			if (!this.job || this.job.kind == 'vector') {
				if (this.job) this.cancel();
				alertify.error('Could not complete the Warp command because the layer is not a pixel layer.');
				return;
			}
			var c = this.corners(), q = [c[0], c[2], c[4], c[6]];
			var lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
			var grid = [];
			for (var j = 0; j < 4; j++) {
				var left = lerp(q[0], q[3], j / 3), right = lerp(q[1], q[2], j / 3);
				for (var i = 0; i < 4; i++) grid.push(lerp(left, right, i / 3));
			}
			this.job.warp = grid;
			this.job.quad = null;
			this.preview();
			app.GUI.Ps_workspace.Options_bar.render_transform();
			return;
		}
		if (layer && layer.type != 'image' && layer.type != null) {
			alertify.error('Could not complete the ' + mode[0].toUpperCase() + mode.slice(1) + ' command because the layer is not a pixel layer.');
			return;
		}
		this.start();
		if (this.job) this.job.mode_override = mode;
	}

	/**
	 * Edit > Content-Aware Scale (Alt+Shift+Ctrl+C): a Free Transform box whose
	 * scaling is applied by seam carving on commit
	 */
	start_content_aware() {
		var layer = config.layer;
		if (layer && layer.type != 'image' && layer.type != null || layer && layer.ps_smart) {
			alertify.error('Could not complete the Content-Aware Scale command because the layer is not a pixel layer.');
			return;
		}
		this.start();
		if (!this.job) return;
		this.job.content_aware = true;
		app.GUI.Ps_workspace.status_message('Content-Aware Scale: drag handles to scale. Enter commits, Esc cancels.');
	}

	commit() {
		var job = this.job;
		if (!job) return;
		var actions = [];
		if (job.kind == 'selection') {
			var final_mask = this.selection_result();
			this.selection().set_mask_direct(job.original_mask);
			actions.push(new Set_mask_action(this.selection(), final_mask));
			this.remember(job);
			this.cleanup();
			app.State.do_action(new app.Actions.Bundle_action('transform_selection', 'Transform Selection', actions));
			return;
		}
		if (job.kind == 'pixels') {
			if (job.content_aware) {
				//Content-Aware Scale: seams are removed/duplicated to the box size, then only rotation is left
				var b = job.box, tw = Math.max(1, Math.round(b.w)), th = Math.max(1, Math.round(b.h));
				job.piece = seam_carve(job.piece, tw, th);
				if (job.mask_piece) job.mask_piece = seam_carve(job.mask_piece, tw, th);
				job.w0 = tw;
				job.h0 = th;
			}
			var result = this.result_canvas(true);
			delete job.layer.link_canvas;
			Object.assign(job.layer, job.geometry);
			actions.push(new app.Actions.Update_layer_action(job.layer.id, {
				x: 0, y: 0, width: config.WIDTH, height: config.HEIGHT, width_original: config.WIDTH, height_original: config.HEIGHT,
			}));
			actions.push(new app.Actions.Update_layer_image_action(result, job.layer.id));
			if (job.smart) {
				actions.push(new app.Actions.Update_layer_action(job.layer.id, { ps_smart: Object.assign({}, job.smart_state, {
					source: job.smart_source || job.piece, box: Object.assign({}, job.box), quad: job.quad ? job.quad.map(c => ({ x: c.x, y: c.y })) : null,
					warp: job.warp ? job.warp.map(c => ({ x: c.x, y: c.y })) : null, lx: 0, ly: 0,
				}) }));
			}
			if (job.mask_piece) {
				var mask = doc_canvas();
				this.draw_piece(mask.getContext('2d'), job.mask_piece, true);
				actions.push(new Set_mask_action(this.selection(), mask));
			}
		}
		else {
			var b = job.box;
			var settings = { x: b.cx - b.w / 2, y: b.cy - b.h / 2, width: b.w, height: b.h, rotate: b.angle * 180 / Math.PI };
			Object.assign(job.layer, job.original);
			actions.push(new app.Actions.Update_layer_action(job.layer.id, settings));
		}
		this.remember(job);
		this.cleanup();
		app.State.do_action(new app.Actions.Bundle_action('free_transform', job.content_aware ? 'Content-Aware Scale' : (job.warp ? 'Warp' : 'Free Transform'), actions));
	}
}

export { warp_grid, draw_patch, draw_patch_exact, WARP_STYLES };
export default Ps_transform_class;
