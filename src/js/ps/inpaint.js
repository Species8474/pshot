/*
 * pshot - fill masked pixels from their surroundings (diffusion inpainting),
 * used by the Spot Healing Brush, Patch and Content-Aware Move tools.
 */

/**
 * @param {HTMLCanvasElement} canvas pixels (modified in place)
 * @param {Uint8Array} hole w*h, 1 = pixel to fill
 */
function inpaint(canvas, hole) {
	var w = canvas.width, h = canvas.height;
	var minx = w, miny = h, maxx = -1, maxy = -1;
	for (var i = 0; i < hole.length; i++) {
		if (hole[i]) {
			var x = i % w, y = (i / w) | 0;
			if (x < minx) minx = x; if (x > maxx) maxx = x;
			if (y < miny) miny = y; if (y > maxy) maxy = y;
		}
	}
	if (maxx < 0) return;
	var pad = 3;
	var x0 = Math.max(0, minx - pad), y0 = Math.max(0, miny - pad);
	var x1 = Math.min(w - 1, maxx + pad), y1 = Math.min(h - 1, maxy + pad);
	var bw = x1 - x0 + 1, bh = y1 - y0 + 1;
	var ctx = canvas.getContext('2d', { willReadFrequently: true });
	var img = ctx.getImageData(x0, y0, bw, bh);
	var d = img.data;
	var local = new Uint8Array(bw * bh);
	var px = new Float32Array(bw * bh * 4);
	for (var yy = 0; yy < bh; yy++) {
		for (var xx = 0; xx < bw; xx++) {
			var k = yy * bw + xx;
			local[k] = hole[(y0 + yy) * w + (x0 + xx)];
			for (var c = 0; c < 4; c++) px[k * 4 + c] = d[k * 4 + c];
		}
	}
	//coarse-to-fine: start from the border average, then relax
	var sum = [0, 0, 0, 0], n = 0;
	for (var k2 = 0; k2 < local.length; k2++) {
		if (!local[k2]) continue;
		var kx = k2 % bw, ky = (k2 / bw) | 0;
		for (var [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			var nx = kx + ax, ny = ky + ay;
			if (nx >= 0 && ny >= 0 && nx < bw && ny < bh && !local[ny * bw + nx]) {
				var m = (ny * bw + nx) * 4;
				sum[0] += px[m]; sum[1] += px[m + 1]; sum[2] += px[m + 2]; sum[3] += px[m + 3]; n++;
			}
		}
	}
	if (n) for (var k3 = 0; k3 < local.length; k3++) if (local[k3]) for (var c3 = 0; c3 < 4; c3++) px[k3 * 4 + c3] = sum[c3] / n;
	var iterations = Math.min(600, Math.max(80, Math.max(bw, bh) * 2));
	for (var it = 0; it < iterations; it++) {
		for (var y2 = 0; y2 < bh; y2++) {
			for (var x2 = 0; x2 < bw; x2++) {
				var k4 = y2 * bw + x2;
				if (!local[k4]) continue;
				for (var c4 = 0; c4 < 4; c4++) {
					var acc = 0, cnt = 0;
					if (x2 > 0) { acc += px[(k4 - 1) * 4 + c4]; cnt++; }
					if (x2 < bw - 1) { acc += px[(k4 + 1) * 4 + c4]; cnt++; }
					if (y2 > 0) { acc += px[(k4 - bw) * 4 + c4]; cnt++; }
					if (y2 < bh - 1) { acc += px[(k4 + bw) * 4 + c4]; cnt++; }
					px[k4 * 4 + c4] = acc / cnt;
				}
			}
		}
	}
	for (var k5 = 0; k5 < local.length; k5++) {
		if (!local[k5]) continue;
		var noise = (Math.random() - 0.5) * 4;
		for (var c5 = 0; c5 < 3; c5++) d[k5 * 4 + c5] = px[k5 * 4 + c5] + noise;
		d[k5 * 4 + 3] = px[k5 * 4 + 3];
	}
	ctx.putImageData(img, x0, y0);
}

export { inpaint };
