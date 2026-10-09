/*
 * pshot - seam carving for Edit > Content-Aware Scale: the image is resized by
 * removing (or duplicating) its lowest-energy seams, so important content
 * keeps its proportions.
 */

/**
 * @param {ImageData-like} img { w, h, data (Uint8ClampedArray RGBA) }
 * @returns energy per pixel (gradient magnitude of luminance and alpha)
 */
function energy(img) {
	var w = img.w, h = img.h, d = img.data, e = new Float32Array(w * h);
	var lum = new Float32Array(w * h);
	for (var i = 0; i < w * h; i++) lum[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) * (d[i * 4 + 3] / 255) + d[i * 4 + 3] * 0.5;
	for (var y = 0; y < h; y++) {
		for (var x = 0; x < w; x++) {
			var l = lum[y * w + Math.max(0, x - 1)], r = lum[y * w + Math.min(w - 1, x + 1)];
			var u = lum[Math.max(0, y - 1) * w + x], b = lum[Math.min(h - 1, y + 1) * w + x];
			e[y * w + x] = Math.abs(r - l) + Math.abs(b - u);
		}
	}
	return e;
}

/**
 * the vertical seam (one x per row) with the least total energy
 */
function find_seam(img, e) {
	var w = img.w, h = img.h;
	var cost = new Float32Array(w * h);
	cost.set(e.subarray(0, w));
	for (var y = 1; y < h; y++) {
		for (var x = 0; x < w; x++) {
			var k = (y - 1) * w + x;
			var m = cost[k];
			if (x > 0 && cost[k - 1] < m) m = cost[k - 1];
			if (x < w - 1 && cost[k + 1] < m) m = cost[k + 1];
			cost[y * w + x] = e[y * w + x] + m;
		}
	}
	var seam = new Int32Array(h);
	var best = 0;
	for (var x2 = 1; x2 < w; x2++) if (cost[(h - 1) * w + x2] < cost[(h - 1) * w + best]) best = x2;
	seam[h - 1] = best;
	for (var y2 = h - 2; y2 >= 0; y2--) {
		var px = seam[y2 + 1], bx = px;
		for (var dx = -1; dx <= 1; dx++) {
			var nx = px + dx;
			if (nx >= 0 && nx < w && cost[y2 * w + nx] < cost[y2 * w + bx]) bx = nx;
		}
		seam[y2] = bx;
	}
	return seam;
}

function remove_seam(img, seam, index) {
	var w = img.w, h = img.h, out = new Uint8ClampedArray((w - 1) * h * 4), idx = index ? new Int32Array((w - 1) * h) : null;
	for (var y = 0; y < h; y++) {
		var s = seam[y], o = y * (w - 1);
		for (var x = 0, nx = 0; x < w; x++) {
			if (x == s) continue;
			var si = (y * w + x) * 4, di = (o + nx) * 4;
			out[di] = img.data[si]; out[di + 1] = img.data[si + 1]; out[di + 2] = img.data[si + 2]; out[di + 3] = img.data[si + 3];
			if (idx) idx[o + nx] = index[y * w + x];
			nx++;
		}
	}
	return { w: w - 1, h: h, data: out, index: idx };
}

/**
 * change the width of img to tw by removing or duplicating seams
 */
function carve_width(img, tw) {
	if (tw == img.w) return img;
	if (tw < img.w) {
		while (img.w > tw) img = remove_seam(img, find_seam(img, energy(img)));
		return img;
	}
	//enlarging: find the k cheapest seams on a shrinking copy, then duplicate them in the original
	var k = tw - img.w;
	if (k > img.w * 0.8) {
		//very large enlargements go in steps
		var half = carve_width(img, Math.round(img.w * 1.8));
		return carve_width(half, tw);
	}
	var index = new Int32Array(img.w * img.h);
	for (var y = 0; y < img.h; y++) for (var x = 0; x < img.w; x++) index[y * img.w + x] = x;
	var work = { w: img.w, h: img.h, data: img.data, index: index };
	var dup = new Uint16Array(img.w * img.h);
	for (var n = 0; n < k; n++) {
		var seam = find_seam(work, energy(work));
		for (var y2 = 0; y2 < work.h; y2++) dup[y2 * img.w + work.index[y2 * work.w + seam[y2]]]++;
		work = remove_seam(work, seam, work.index);
	}
	var out = new Uint8ClampedArray(tw * img.h * 4);
	for (var y3 = 0; y3 < img.h; y3++) {
		var nx = 0;
		for (var x3 = 0; x3 < img.w; x3++) {
			var si = (y3 * img.w + x3) * 4, xr = Math.min(img.w - 1, x3 + 1), sr = (y3 * img.w + xr) * 4;
			for (var r = 0; r <= dup[y3 * img.w + x3] && nx < tw; r++) {
				var di = (y3 * tw + nx) * 4;
				for (var c = 0; c < 4; c++) out[di + c] = r == 0 ? img.data[si + c] : (img.data[si + c] + img.data[sr + c]) / 2;
				nx++;
			}
		}
	}
	return { w: tw, h: img.h, data: out };
}

function transpose(img) {
	var w = img.w, h = img.h, out = new Uint8ClampedArray(w * h * 4);
	for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
		var s = (y * w + x) * 4, d = (x * h + y) * 4;
		out[d] = img.data[s]; out[d + 1] = img.data[s + 1]; out[d + 2] = img.data[s + 2]; out[d + 3] = img.data[s + 3];
	}
	return { w: h, h: w, data: out };
}

/**
 * Content-Aware Scale: canvas -> canvas of tw x th
 */
function seam_carve(canvas, tw, th) {
	var ctx = canvas.getContext('2d', { willReadFrequently: true });
	var id = ctx.getImageData(0, 0, canvas.width, canvas.height);
	var img = { w: id.width, h: id.height, data: id.data };
	tw = Math.max(1, Math.round(tw));
	th = Math.max(1, Math.round(th));
	img = carve_width(img, tw);
	if (th != img.h) {
		img = transpose(carve_width(transpose(img), th));
	}
	var out = document.createElement('canvas');
	out.width = img.w;
	out.height = img.h;
	out.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.w, img.h), 0, 0);
	return out;
}

export { seam_carve };
