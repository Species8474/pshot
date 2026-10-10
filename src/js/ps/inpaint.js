/*
 * pshot - fill masked pixels from their surroundings:
 * - inpaint: diffusion (smooth), used for seams;
 * - content_aware: patch-based synthesis (multi-scale PatchMatch with
 *   voting), used by Edit > Fill > Content-Aware, the Spot Healing Brush,
 *   Patch (Content-Aware) and Content-Aware Move;
 * - proximity_match / create_texture: the Spot Healing Brush's other Types.
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


function bbox(hole, w, h) {
	var minx = w, miny = h, maxx = -1, maxy = -1;
	for (var i = 0; i < hole.length; i++) {
		if (!hole[i]) continue;
		var x = i % w, y = (i / w) | 0;
		if (x < minx) minx = x;
		if (x > maxx) maxx = x;
		if (y < miny) miny = y;
		if (y > maxy) maxy = y;
	}
	return maxx < 0 ? null : { x0: minx, y0: miny, x1: maxx, y1: maxy };
}

function rng(seed) {
	return function () {
		seed |= 0;
		seed = seed + 0x6D2B79F5 | 0;
		var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}

/**
 * the region around the hole: pixels (float RGBA) and its hole mask
 */
function region(canvas, hole, margin_scale) {
	var w = canvas.width, h = canvas.height;
	var b = bbox(hole, w, h);
	if (!b) return null;
	var m = Math.max(12, Math.round(Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1) * (margin_scale || 1)));
	var x0 = Math.max(0, b.x0 - m), y0 = Math.max(0, b.y0 - m);
	var x1 = Math.min(w - 1, b.x1 + m), y1 = Math.min(h - 1, b.y1 + m);
	var rw = x1 - x0 + 1, rh = y1 - y0 + 1;
	var ctx = canvas.getContext('2d', { willReadFrequently: true });
	var img = ctx.getImageData(x0, y0, rw, rh);
	var px = new Float32Array(rw * rh * 4), mk = new Uint8Array(rw * rh);
	for (var y = 0; y < rh; y++) {
		for (var x = 0; x < rw; x++) {
			var k = y * rw + x;
			mk[k] = hole[(y0 + y) * w + x0 + x] ? 1 : 0;
			for (var c = 0; c < 4; c++) px[k * 4 + c] = img.data[k * 4 + c];
		}
	}
	return { ctx: ctx, img: img, x0: x0, y0: y0, w: rw, h: rh, px: px, mk: mk };
}

function write_back(R) {
	var d = R.img.data;
	for (var k = 0; k < R.mk.length; k++) {
		if (!R.mk[k]) continue;
		for (var c = 0; c < 4; c++) d[k * 4 + c] = R.px[k * 4 + c];
	}
	R.ctx.putImageData(R.img, R.x0, R.y0);
}

/**
 * hole pixels filled from the edge inwards with the mean of known neighbours
 */
function onion_fill(px, mk, w, h) {
	var known = new Uint8Array(mk.length), todo = 0;
	for (var i = 0; i < mk.length; i++) { known[i] = mk[i] ? 0 : 1; if (mk[i]) todo++; }
	var guard = 0;
	while (todo > 0 && guard++ < w + h) {
		var next = [];
		for (var k = 0; k < mk.length; k++) {
			if (known[k]) continue;
			var x = k % w, y = (k / w) | 0, acc = [0, 0, 0, 0], n = 0;
			for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
				var nx = x + dx, ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
				var q = ny * w + nx;
				if (!known[q]) continue;
				for (var c = 0; c < 4; c++) acc[c] += px[q * 4 + c];
				n++;
			}
			if (n) next.push([k, acc.map(v => v / n)]);
		}
		if (!next.length) break;
		for (var [kk, v] of next) {
			for (var c2 = 0; c2 < 4; c2++) px[kk * 4 + c2] = v[c2];
			known[kk] = 1;
			todo--;
		}
	}
}

function downsample(px, mk, w, h) {
	var nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1);
	var npx = new Float32Array(nw * nh * 4), nmk = new Uint8Array(nw * nh);
	for (var y = 0; y < nh; y++) {
		for (var x = 0; x < nw; x++) {
			var k = y * nw + x, acc = [0, 0, 0, 0], n = 0, any = 0;
			for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) {
				var sx = Math.min(w - 1, x * 2 + dx), sy = Math.min(h - 1, y * 2 + dy), q = sy * w + sx;
				if (mk[q]) { any = 1; continue; }
				for (var c = 0; c < 4; c++) acc[c] += px[q * 4 + c];
				n++;
			}
			nmk[k] = any;
			for (var c2 = 0; c2 < 4; c2++) npx[k * 4 + c2] = n ? acc[c2] / n : 0;
		}
	}
	return { px: npx, mk: nmk, w: nw, h: nh };
}

/**
 * Edit > Fill > Content-Aware and friends: patch-based synthesis
 * @param {HTMLCanvasElement} canvas pixels (modified in place)
 * @param {Uint8Array} hole w*h, 1 = pixel to fill
 */
function content_aware(canvas, hole) {
	var R = region(canvas, hole, 1.2);
	if (!R) return;
	var random = rng(R.w * 7919 + R.h * 104729);
	var P = 3;
	//pyramid until the hole is a few patches wide
	var levels = [{ px: R.px, mk: R.mk, w: R.w, h: R.h }];
	while (levels.length < 6) {
		var L = levels[levels.length - 1];
		var hb = bbox(L.mk, L.w, L.h);
		if (!hb || Math.max(hb.x1 - hb.x0, hb.y1 - hb.y0) < P * 4 || Math.min(L.w, L.h) < 24) break;
		levels.push(downsample(L.px, L.mk, L.w, L.h));
	}
	var nnf = null, prev = null;
	for (var li = levels.length - 1; li >= 0; li--) {
		var V = levels[li], w = V.w, h = V.h, px = V.px, mk = V.mk;
		var r = Math.min(P, Math.max(1, Math.floor(Math.min(w, h) / 6)));
		//sources: patches entirely outside the hole
		var valid = new Uint8Array(w * h), list = [];
		var integral = new Int32Array((w + 1) * (h + 1));
		for (var y = 0; y < h; y++) {
			var row = 0;
			for (var x = 0; x < w; x++) {
				row += mk[y * w + x];
				integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
			}
		}
		for (var y2 = r; y2 < h - r; y2++) {
			for (var x2 = r; x2 < w - r; x2++) {
				var a = (y2 - r) * (w + 1) + (x2 - r), b2 = (y2 + r + 1) * (w + 1) + (x2 - r);
				var s = integral[b2 + 2 * r + 1] - integral[b2] - integral[a + 2 * r + 1] + integral[a];
				if (!s) { valid[y2 * w + x2] = 1; list.push(y2 * w + x2); }
			}
		}
		if (!list.length) {
			onion_fill(px, mk, w, h);
			if (li == 0) break;
			continue;
		}
		//targets: patches touching the hole
		var targets = [], is_target = new Uint8Array(w * h);
		for (var k = 0; k < mk.length; k++) {
			if (!mk[k]) continue;
			var kx = k % w, ky = (k / w) | 0;
			for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
				var tx = kx + dx, ty = ky + dy;
				if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
				var t = ty * w + tx;
				if (!is_target[t]) { is_target[t] = 1; targets.push(t); }
			}
		}
		var dist = (t, s, best) => {
			var tx = t % w, ty = (t / w) | 0, sx = s % w, sy = (s / w) | 0, sum = 0;
			for (var dy = -r; dy <= r; dy++) {
				var yy = ty + dy;
				if (yy < 0 || yy >= h) continue;
				for (var dx = -r; dx <= r; dx++) {
					var xx = tx + dx;
					if (xx < 0 || xx >= w) continue;
					var i = (yy * w + xx) * 4, j = ((sy + dy) * w + sx + dx) * 4;
					var d0 = px[i] - px[j], d1 = px[i + 1] - px[j + 1], d2 = px[i + 2] - px[j + 2], d3 = px[i + 3] - px[j + 3];
					sum += d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3;
				}
				if (sum >= best) return sum;
			}
			return sum;
		};
		var map = new Int32Array(w * h).fill(-1), cost = new Float64Array(w * h);
		var pick = () => list[(random() * list.length) | 0];
		if (!prev) onion_fill(px, mk, w, h);
		else {
			//the finer hole starts as the coarser result, scaled up
			for (var k5 = 0; k5 < mk.length; k5++) {
				if (!mk[k5]) continue;
				var q5 = Math.min(prev.h - 1, ((k5 / w) | 0) >> 1) * prev.w + Math.min(prev.w - 1, (k5 % w) >> 1);
				for (var c5 = 0; c5 < 4; c5++) px[k5 * 4 + c5] = prev.px[q5 * 4 + c5];
			}
		}
		for (var t0 of targets) {
			var s0 = -1;
			if (prev) {
				//finer level: the coarse match, scaled up
				var cx = Math.min(prev.w - 1, (t0 % w) >> 1), cy = Math.min(prev.h - 1, ((t0 / w) | 0) >> 1);
				var cs = prev.map[cy * prev.w + cx];
				if (cs >= 0) {
					var fx = (cs % prev.w) * 2 + ((t0 % w) - cx * 2), fy = ((cs / prev.w) | 0) * 2 + (((t0 / w) | 0) - cy * 2);
					if (fx >= 0 && fy >= 0 && fx < w && fy < h && valid[fy * w + fx]) s0 = fy * w + fx;
				}
			}
			map[t0] = s0 >= 0 ? s0 : pick();
		}
		var vote = () => {
			var acc = new Float64Array(w * h * 4), ws = new Float64Array(w * h);
			var mean = 0;
			for (var t1 of targets) mean += cost[t1];
			mean = mean / Math.max(1, targets.length) + 1;
			for (var t2 of targets) {
				var s2 = map[t2], wt = Math.exp(-cost[t2] / (2 * mean));
				var tx2 = t2 % w, ty2 = (t2 / w) | 0, sx2 = s2 % w, sy2 = (s2 / w) | 0;
				for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
					var xx = tx2 + dx, yy = ty2 + dy;
					if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
					var q = yy * w + xx;
					if (!mk[q]) continue;
					var j = ((sy2 + dy) * w + sx2 + dx) * 4;
					for (var c = 0; c < 4; c++) acc[q * 4 + c] += px[j + c] * wt;
					ws[q] += wt;
				}
			}
			for (var q2 = 0; q2 < mk.length; q2++) {
				if (!mk[q2] || !ws[q2]) continue;
				for (var c2 = 0; c2 < 4; c2++) px[q2 * 4 + c2] = acc[q2 * 4 + c2] / ws[q2];
			}
		};
		if (prev) {
			//the finer image starts from the upscaled matches
			for (var t3 of targets) cost[t3] = dist(t3, map[t3], Infinity);
			vote();
		}
		var em = li == levels.length - 1 ? 6 : 3;
		for (var it = 0; it < em; it++) {
			for (var t4 of targets) cost[t4] = dist(t4, map[t4], Infinity);
			for (var pass = 0; pass < 2; pass++) {
				var fwd = pass % 2 == 0, step = fwd ? 1 : -1;
				for (var n = 0; n < targets.length; n++) {
					var t = targets[fwd ? n : targets.length - 1 - n];
					var tx3 = t % w, ty3 = (t / w) | 0;
					var best = cost[t], bs = map[t];
					//propagation from the left / upper (right / lower) neighbour
					for (var [nx, ny] of [[tx3 - step, ty3], [tx3, ty3 - step]]) {
						if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
						var nb = map[ny * w + nx];
						if (nb < 0) continue;
						var cand = nb + step * (nx != tx3 ? 1 : w);
						var cx2 = cand % w;
						if (cand < 0 || cand >= w * h || !valid[cand] || Math.abs(cx2 - (nb % w)) > 1) continue;
						var dd = dist(t, cand, best);
						if (dd < best) { best = dd; bs = cand; }
					}
					//random search around the current match
					var rad = Math.max(w, h);
					var bx = bs % w, by = (bs / w) | 0;
					while (rad >= 1) {
						var rx = Math.round(bx + (random() * 2 - 1) * rad), ry = Math.round(by + (random() * 2 - 1) * rad);
						if (rx >= 0 && ry >= 0 && rx < w && ry < h && valid[ry * w + rx]) {
							var d2 = dist(t, ry * w + rx, best);
							if (d2 < best) { best = d2; bs = ry * w + rx; }
						}
						rad >>= 1;
					}
					map[t] = bs;
					cost[t] = best;
				}
			}
			vote();
		}
		prev = { map: map, w: w, h: h, px: px };
	}
	write_back(R);
}

/**
 * Spot Healing Type: Proximity Match - the hole takes the nearby area whose
 * edge matches best, its tone matched to the hole's edge
 */
function proximity_match(canvas, hole) {
	var R = region(canvas, hole, 1.5);
	if (!R) return;
	var w = R.w, h = R.h, px = R.px, mk = R.mk;
	var hb = bbox(mk, w, h);
	//the ring just outside the hole
	var ring = [];
	for (var k = 0; k < mk.length; k++) {
		if (mk[k]) continue;
		var x = k % w, y = (k / w) | 0, near = false;
		for (var dy = -3; dy <= 3 && !near; dy++) for (var dx = -3; dx <= 3; dx++) {
			var nx = x + dx, ny = y + dy;
			if (nx >= 0 && ny >= 0 && nx < w && ny < h && mk[ny * w + nx]) { near = true; break; }
		}
		if (near) ring.push(k);
	}
	var holes = [];
	for (var k2 = 0; k2 < mk.length; k2++) if (mk[k2]) holes.push(k2);
	var span = Math.max(hb.x1 - hb.x0 + 1, hb.y1 - hb.y0 + 1);
	var best = Infinity, bo = null, stepv = Math.max(1, Math.round(span / 12));
	var fits = (ox, oy) => hb.x0 + ox - 3 >= 0 && hb.y0 + oy - 3 >= 0 && hb.x1 + ox + 3 < w && hb.y1 + oy + 3 < h;
	for (var oy = -span * 2; oy <= span * 2; oy += stepv) {
		for (var ox = -span * 2; ox <= span * 2; ox += stepv) {
			if (Math.abs(ox) <= span && Math.abs(oy) <= span) continue;
			if (!fits(ox, oy)) continue;
			var ok = true;
			for (var hk of holes) { var sx = hk % w + ox, sy = ((hk / w) | 0) + oy; if (mk[sy * w + sx]) { ok = false; break; } }
			if (!ok) continue;
			var sum = 0;
			for (var rk of ring) {
				var sx2 = rk % w + ox, sy2 = ((rk / w) | 0) + oy, j = (sy2 * w + sx2) * 4, i = rk * 4;
				for (var c = 0; c < 3; c++) { var d = px[i + c] - px[j + c]; sum += d * d; }
				if (sum >= best) break;
			}
			if (sum < best) { best = sum; bo = [ox, oy]; }
		}
	}
	if (!bo) {
		content_aware(canvas, hole);
		return;
	}
	//tone: the source ring's mean moved to the destination ring's
	var ms = [0, 0, 0], md = [0, 0, 0];
	for (var rk2 of ring) {
		var j2 = (((rk2 / w) | 0) + bo[1]) * w + rk2 % w + bo[0];
		for (var c2 = 0; c2 < 3; c2++) { ms[c2] += px[j2 * 4 + c2]; md[c2] += px[rk2 * 4 + c2]; }
	}
	for (var c3 = 0; c3 < 3; c3++) { ms[c3] /= Math.max(1, ring.length); md[c3] /= Math.max(1, ring.length); }
	for (var hk2 of holes) {
		var j3 = (((hk2 / w) | 0) + bo[1]) * w + hk2 % w + bo[0];
		for (var c4 = 0; c4 < 3; c4++) px[hk2 * 4 + c4] = px[j3 * 4 + c4] - ms[c4] + md[c4];
		px[hk2 * 4 + 3] = px[j3 * 4 + 3];
	}
	write_back(R);
}

/**
 * Spot Healing Type: Create Texture - the hole's smooth fill with grain taken
 * from small pieces of the surrounding texture
 */
function create_texture(canvas, hole) {
	var R = region(canvas, hole, 1);
	if (!R) return;
	var w = R.w, h = R.h, px = R.px, mk = R.mk;
	var base = new Float32Array(px);
	onion_fill(base, mk, w, h);
	//relax the fill so it is smooth
	for (var it = 0; it < 40; it++) {
		for (var k = 0; k < mk.length; k++) {
			if (!mk[k]) continue;
			var x = k % w, y = (k / w) | 0;
			for (var c = 0; c < 4; c++) {
				var acc = 0, n = 0;
				if (x > 0) { acc += base[(k - 1) * 4 + c]; n++; }
				if (x < w - 1) { acc += base[(k + 1) * 4 + c]; n++; }
				if (y > 0) { acc += base[(k - w) * 4 + c]; n++; }
				if (y < h - 1) { acc += base[(k + w) * 4 + c]; n++; }
				base[k * 4 + c] = acc / n;
			}
		}
	}
	//detail: pixel minus its 5x5 mean, from known areas
	var known = [];
	for (var k2 = 0; k2 < mk.length; k2++) {
		var x2 = k2 % w, y2 = (k2 / w) | 0;
		if (x2 >= 2 && y2 >= 2 && x2 < w - 2 && y2 < h - 2 && !mk[k2]) known.push(k2);
	}
	if (!known.length) {
		for (var k3 = 0; k3 < mk.length; k3++) if (mk[k3]) for (var c3 = 0; c3 < 4; c3++) px[k3 * 4 + c3] = base[k3 * 4 + c3];
		write_back(R);
		return;
	}
	var random = rng(w * 31 + h);
	var mean5 = (q, c) => {
		var qx = q % w, qy = (q / w) | 0, s = 0;
		for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) s += px[((qy + dy) * w + qx + dx) * 4 + c];
		return s / 25;
	};
	var B = 6, offsets = {};
	for (var k4 = 0; k4 < mk.length; k4++) {
		if (!mk[k4]) continue;
		var x4 = k4 % w, y4 = (k4 / w) | 0, key = ((x4 / B) | 0) + ',' + ((y4 / B) | 0);
		if (!offsets[key]) offsets[key] = known[(random() * known.length) | 0];
		var src = offsets[key], sx = src % w + x4 % B - 2, sy = ((src / w) | 0) + y4 % B - 2;
		sx = Math.max(2, Math.min(w - 3, sx));
		sy = Math.max(2, Math.min(h - 3, sy));
		var q = sy * w + sx;
		for (var c4 = 0; c4 < 3; c4++) px[k4 * 4 + c4] = base[k4 * 4 + c4] + (mk[q] ? 0 : px[q * 4 + c4] - mean5(q, c4));
		px[k4 * 4 + 3] = base[k4 * 4 + 3];
	}
	write_back(R);
}

export { inpaint, content_aware, proximity_match, create_texture };
