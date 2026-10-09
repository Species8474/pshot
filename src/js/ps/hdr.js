/*
 * pshot - Merge to HDR Pro: exposure fusion (Mertens et al.). Each exposure
 * is weighted per pixel by contrast, saturation and well-exposedness, and the
 * weighted images are blended through Laplacian pyramids so there are no seams.
 */

const K = [1, 4, 6, 4, 1];

/**
 * separable 5-tap blur of a planar float image with `ch` channels
 */
function blur(src, w, h, ch) {
	var tmp = new Float32Array(src.length), out = new Float32Array(src.length);
	for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) for (var c = 0; c < ch; c++) {
		var s = 0;
		for (var k = -2; k <= 2; k++) {
			var xx = Math.min(w - 1, Math.max(0, x + k));
			s += src[(y * w + xx) * ch + c] * K[k + 2];
		}
		tmp[(y * w + x) * ch + c] = s / 16;
	}
	for (var y2 = 0; y2 < h; y2++) for (var x2 = 0; x2 < w; x2++) for (var c2 = 0; c2 < ch; c2++) {
		var s2 = 0;
		for (var k2 = -2; k2 <= 2; k2++) {
			var yy = Math.min(h - 1, Math.max(0, y2 + k2));
			s2 += tmp[(yy * w + x2) * ch + c2] * K[k2 + 2];
		}
		out[(y2 * w + x2) * ch + c2] = s2 / 16;
	}
	return out;
}

function down(src, w, h, ch) {
	var b = blur(src, w, h, ch), nw = Math.ceil(w / 2), nh = Math.ceil(h / 2), out = new Float32Array(nw * nh * ch);
	for (var y = 0; y < nh; y++) for (var x = 0; x < nw; x++) for (var c = 0; c < ch; c++) out[(y * nw + x) * ch + c] = b[(y * 2 * w + x * 2) * ch + c];
	return { data: out, w: nw, h: nh };
}

function up(src, sw, sh, w, h, ch) {
	var out = new Float32Array(w * h * ch);
	for (var y = 0; y < h; y++) {
		var fy = Math.min(sh - 1, (y + 0.5) / 2 - 0.5), y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(sh - 1, y0 + 1), ty = Math.max(0, fy - y0);
		for (var x = 0; x < w; x++) {
			var fx = Math.min(sw - 1, (x + 0.5) / 2 - 0.5), x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(sw - 1, x0 + 1), tx = Math.max(0, fx - x0);
			for (var c = 0; c < ch; c++) {
				var a = src[(y0 * sw + x0) * ch + c] * (1 - tx) + src[(y0 * sw + x1) * ch + c] * tx;
				var b = src[(y1 * sw + x0) * ch + c] * (1 - tx) + src[(y1 * sw + x1) * ch + c] * tx;
				out[(y * w + x) * ch + c] = a * (1 - ty) + b * ty;
			}
		}
	}
	return out;
}

function gaussian_pyramid(img, w, h, ch, levels) {
	var pyr = [{ data: img, w: w, h: h }];
	for (var l = 1; l < levels; l++) {
		var p = pyr[l - 1];
		pyr.push(down(p.data, p.w, p.h, ch));
	}
	return pyr;
}

function laplacian_pyramid(img, w, h, levels) {
	var g = gaussian_pyramid(img, w, h, 3, levels);
	var out = [];
	for (var l = 0; l < levels - 1; l++) {
		var u = up(g[l + 1].data, g[l + 1].w, g[l + 1].h, g[l].w, g[l].h, 3);
		var d = new Float32Array(g[l].data.length);
		for (var i = 0; i < d.length; i++) d[i] = g[l].data[i] - u[i];
		out.push({ data: d, w: g[l].w, h: g[l].h });
	}
	out.push(g[levels - 1]);
	return out;
}

/**
 * images: RGBA Uint8ClampedArrays of the same size -> fused RGBA
 */
function fuse(images, w, h) {
	var n = images.length, N = w * h;
	var weights = images.map((rgba) => {
		var wt = new Float32Array(N), gray = new Float32Array(N);
		for (var i = 0; i < N; i++) gray[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255;
		for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
			var k = y * w + x;
			var lap = Math.abs(4 * gray[k] - gray[y * w + Math.max(0, x - 1)] - gray[y * w + Math.min(w - 1, x + 1)] - gray[Math.max(0, y - 1) * w + x] - gray[Math.min(h - 1, y + 1) * w + x]);
			var r = rgba[k * 4] / 255, g = rgba[k * 4 + 1] / 255, b = rgba[k * 4 + 2] / 255, m = (r + g + b) / 3;
			var sat = Math.sqrt(((r - m) * (r - m) + (g - m) * (g - m) + (b - m) * (b - m)) / 3);
			var e = (v) => Math.exp(-((v - 0.5) * (v - 0.5)) / 0.08);
			wt[k] = (lap + 0.002) * (sat + 0.002) * e(r) * e(g) * e(b) + 1e-12;
		}
		return wt;
	});
	for (var i2 = 0; i2 < N; i2++) {
		var s = 0;
		for (var k2 = 0; k2 < n; k2++) s += weights[k2][i2];
		for (var k3 = 0; k3 < n; k3++) weights[k3][i2] /= s;
	}
	var levels = Math.max(1, Math.min(7, Math.floor(Math.log2(Math.min(w, h))) - 2));
	var fused = null;
	for (var k4 = 0; k4 < n; k4++) {
		var rgb = new Float32Array(N * 3);
		for (var i3 = 0; i3 < N; i3++) { rgb[i3 * 3] = images[k4][i3 * 4]; rgb[i3 * 3 + 1] = images[k4][i3 * 4 + 1]; rgb[i3 * 3 + 2] = images[k4][i3 * 4 + 2]; }
		var lp = laplacian_pyramid(rgb, w, h, levels), gp = gaussian_pyramid(weights[k4], w, h, 1, levels);
		if (!fused) fused = lp.map(l => ({ data: new Float32Array(l.data.length), w: l.w, h: l.h }));
		for (var l = 0; l < levels; l++) {
			var fd = fused[l].data, ld = lp[l].data, gd = gp[l].data;
			for (var p = 0; p < gd.length; p++) {
				fd[p * 3] += ld[p * 3] * gd[p];
				fd[p * 3 + 1] += ld[p * 3 + 1] * gd[p];
				fd[p * 3 + 2] += ld[p * 3 + 2] * gd[p];
			}
		}
	}
	//collapse
	var cur = fused[levels - 1];
	for (var l2 = levels - 2; l2 >= 0; l2--) {
		var u = up(cur.data, cur.w, cur.h, fused[l2].w, fused[l2].h, 3);
		for (var q = 0; q < u.length; q++) u[q] += fused[l2].data[q];
		cur = { data: u, w: fused[l2].w, h: fused[l2].h };
	}
	var out = new Uint8ClampedArray(N * 4);
	for (var i4 = 0; i4 < N; i4++) {
		out[i4 * 4] = cur.data[i4 * 3];
		out[i4 * 4 + 1] = cur.data[i4 * 3 + 1];
		out[i4 * 4 + 2] = cur.data[i4 * 3 + 2];
		out[i4 * 4 + 3] = 255;
	}
	return out;
}

export { fuse };
