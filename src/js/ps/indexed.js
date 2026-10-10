/*
 * pshot - indexed color output for Save for Web (GIF, PNG-8): palette
 * reduction (Selective / Adaptive / Perceptual by median cut, Restrictive =
 * web-safe colors, or a given palette), forced colors, diffusion / pattern /
 * noise dither, 1-bit transparency, and the GIF (LZW) and PNG-8 encoders.
 */

import pako from 'pako';

/**
 * RGBA -> { palette: [[r,g,b]...], index: Uint8Array, transparent: -1 or palette index }
 */
function quantize(rgba, w, h, opts) {
	var colors = Math.max(2, Math.min(256, opts.colors || 256));
	var transparency = opts.transparency !== false;
	var n = w * h;
	var opaque = (i) => !transparency || rgba[i * 4 + 3] >= 128;
	var has_transparent = false;
	for (var t = 0; t < n; t++) if (!opaque(t)) { has_transparent = true; break; }
	var slots = has_transparent ? colors - 1 : colors;
	var palette;
	var forced = (opts.forced || []).slice(0, slots);
	if (opts.palette) {
		palette = opts.palette.slice(0, Math.max(2, slots));
	}
	else if (opts.reduction == 'Restrictive (Web)') {
		palette = [];
		for (var r = 0; r < 6; r++) for (var g = 0; g < 6; g++) for (var b = 0; b < 6; b++) palette.push([r * 51, g * 51, b * 51]);
		palette = palette.slice(0, Math.max(2, slots));
	}
	else {
		palette = median_cut(rgba, n, opaque, slots - forced.length, opts.reduction == 'Perceptual');
	}
	//Forced colors are always in the table
	if (forced.length) {
		var key = (c) => c.join(',');
		var have = new Set(palette.map(key));
		var add = forced.filter(c => !have.has(key(c)));
		palette = palette.slice(0, Math.max(0, slots - add.length)).concat(add);
	}
	var transparent = -1;
	if (has_transparent) {
		transparent = palette.length;
		palette.push([0, 0, 0]);
	}
	//map with Floyd-Steinberg error diffusion (Dither amount 0..100), or a Pattern (ordered) / Noise dither
	var amount = (opts.dither || 0) / 100;
	var type = opts.dither_type || 'Diffusion';
	var index = new Uint8Array(n);
	var err = amount > 0 && type == 'Diffusion' ? new Float32Array(n * 3) : null;
	var exact = opts.preserve ? new Set(palette.map(c => (c[0] << 16) | (c[1] << 8) | c[2])) : null;
	var spread_px = 255 / Math.max(2, Math.cbrt(palette.length));
	var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
	var cache = new Map();
	var nearest = (r, g, b) => {
		var key = (r << 16) | (g << 8) | b;
		var hit = cache.get(key);
		if (hit !== undefined) return hit;
		var best = 0, bd = 1e9;
		for (var p = 0; p < palette.length; p++) {
			if (p == transparent) continue;
			var c = palette[p], dr = r - c[0], dg = g - c[1], db = b - c[2];
			var d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
			if (d < bd) { bd = d; best = p; }
		}
		if (cache.size < 200000) cache.set(key, best);
		return best;
	};
	for (var y = 0; y < h; y++) {
		for (var x = 0; x < w; x++) {
			var i = y * w + x, o = i * 4;
			if (!opaque(i)) { index[i] = transparent; continue; }
			var rr = rgba[o], gg = rgba[o + 1], bb = rgba[o + 2];
			//Preserve Exact Colors: a pixel already in the table is not dithered
			var keep = exact && exact.has((rr << 16) | (gg << 8) | bb);
			if (!keep && amount > 0 && type != 'Diffusion') {
				var off = type == 'Pattern' ? (BAYER[(y % 4) * 4 + (x % 4)] / 16 - 0.47) : (Math.random() - 0.5);
				off *= spread_px * amount;
				rr = Math.max(0, Math.min(255, Math.round(rr + off)));
				gg = Math.max(0, Math.min(255, Math.round(gg + off)));
				bb = Math.max(0, Math.min(255, Math.round(bb + off)));
			}
			if (err && !keep) {
				rr = Math.max(0, Math.min(255, Math.round(rr + err[i * 3])));
				gg = Math.max(0, Math.min(255, Math.round(gg + err[i * 3 + 1])));
				bb = Math.max(0, Math.min(255, Math.round(bb + err[i * 3 + 2])));
			}
			var k = nearest(rr, gg, bb);
			index[i] = k;
			if (err && !keep) {
				var c2 = palette[k], er = (rr - c2[0]) * amount, eg = (gg - c2[1]) * amount, eb = (bb - c2[2]) * amount;
				var spread = (dx, dy, f) => {
					var xx = x + dx, yy = y + dy;
					if (xx < 0 || xx >= w || yy >= h) return;
					var j = (yy * w + xx) * 3;
					err[j] += er * f; err[j + 1] += eg * f; err[j + 2] += eb * f;
				};
				spread(1, 0, 7 / 16); spread(-1, 1, 3 / 16); spread(0, 1, 5 / 16); spread(1, 1, 1 / 16);
			}
		}
	}
	return { palette: palette, index: index, transparent: transparent };
}

/**
 * the fixed Indexed Color palettes (Uniform, System Mac OS / Windows) and the Forced sets
 */
function fixed_palette(name, colors) {
	var cube = (steps) => { var out = []; for (var r = 0; r < steps.length; r++) for (var g = 0; g < steps.length; g++) for (var b = 0; b < steps.length; b++) out.push([steps[r], steps[g], steps[b]]); return out; };
	var web = cube([0, 51, 102, 153, 204, 255]);
	if (name == 'Web') return web;
	if (name == 'Uniform') {
		var k = Math.max(2, Math.floor(Math.cbrt(colors || 256)));
		return cube(Array.from({ length: k }, (_, i) => Math.round(i * 255 / (k - 1))));
	}
	if (name == 'System (Mac OS)') {
		//the 6x6x6 cube, then ramps of red, green, blue and gray (no cube values)
		var out = web.slice().reverse(), ramp = [238, 221, 187, 170, 136, 119, 85, 68, 34, 17];
		for (var c = 0; c < 3; c++) for (var v of ramp) { var e = [0, 0, 0]; e[c] = v; out.push(e); }
		for (var v2 of ramp) out.push([v2, v2, v2]);
		return out.slice(0, 256);
	}
	if (name == 'System (Windows)') {
		//the 20 static colors around the web cube
		var stat = [[0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0], [0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192], [192, 220, 192], [166, 202, 240],
			[255, 251, 240], [160, 160, 164], [128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0], [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255]];
		return stat.concat(web).slice(0, 256);
	}
	if (name == 'Black and White') return [[0, 0, 0], [255, 255, 255]];
	if (name == 'Primaries') return [[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255], [0, 255, 255], [255, 0, 255], [255, 255, 0]];
	return null;
}

function median_cut(rgba, n, opaque, slots, perceptual) {
	//sample the pixels
	var step = Math.max(1, Math.floor(n / 120000));
	var px = [];
	for (var i = 0; i < n; i += step) if (opaque(i)) px.push([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]]);
	if (!px.length) return [[0, 0, 0], [255, 255, 255]];
	var boxes = [px];
	var weight = perceptual ? [0.3, 0.59, 0.11] : [1, 1, 1];
	while (boxes.length < slots) {
		//split the box with the widest weighted range
		var bi = -1, bc = 0, br = -1;
		for (var b = 0; b < boxes.length; b++) {
			if (boxes[b].length < 2) continue;
			for (var c = 0; c < 3; c++) {
				var mn = 255, mx = 0;
				for (var p of boxes[b]) { if (p[c] < mn) mn = p[c]; if (p[c] > mx) mx = p[c]; }
				var range = (mx - mn) * weight[c] * Math.sqrt(boxes[b].length);
				if (range > br) { br = range; bi = b; bc = c; }
			}
		}
		if (bi < 0 || br <= 0) break;
		var box = boxes[bi].sort((a, z) => a[bc] - z[bc]);
		var mid = box.length >> 1;
		boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
	}
	return boxes.map((bx) => {
		var s = [0, 0, 0];
		for (var p of bx) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; }
		return s.map(v => Math.round(v / bx.length));
	});
}

// ---------- GIF ----------

function encode_gif(q, w, h) {
	var bits = 1;
	while ((1 << bits) < q.palette.length) bits++;
	var size = 1 << bits;
	var out = [];
	var u8 = (v) => out.push(v & 255);
	var u16 = (v) => { out.push(v & 255, (v >> 8) & 255); };
	'GIF89a'.split('').forEach(c => u8(c.charCodeAt(0)));
	u16(w); u16(h);
	u8(0x80 | ((bits - 1) << 4) | (bits - 1));
	u8(0); u8(0);
	for (var i = 0; i < size; i++) { var c = q.palette[i] || [0, 0, 0]; u8(c[0]); u8(c[1]); u8(c[2]); }
	if (q.transparent >= 0) {
		u8(0x21); u8(0xf9); u8(4); u8(1); u16(0); u8(q.transparent); u8(0);
	}
	u8(0x2c); u16(0); u16(0); u16(w); u16(h); u8(0);
	var min = Math.max(2, bits);
	u8(min);
	var data = lzw(q.index, min);
	for (var p = 0; p < data.length; p += 255) {
		var len = Math.min(255, data.length - p);
		u8(len);
		for (var j = 0; j < len; j++) out.push(data[p + j]);
	}
	u8(0);
	u8(0x3b);
	return new Uint8Array(out);
}

function lzw(index, min) {
	var clear = 1 << min, eoi = clear + 1;
	var out = [], cur = 0, nbits = 0;
	var size = min + 1;
	var emit = (code) => {
		cur |= code << nbits;
		nbits += size;
		while (nbits >= 8) { out.push(cur & 255); cur >>= 8; nbits -= 8; }
	};
	var dict = new Map(), next = eoi + 1;
	emit(clear);
	var prefix = index[0];
	for (var i = 1; i < index.length; i++) {
		var k = index[i], key = prefix * 4096 + k;
		var hit = dict.get(key);
		if (hit !== undefined) { prefix = hit; continue; }
		emit(prefix);
		if (next < 4096) {
			dict.set(key, next++);
			if (next > (1 << size) && size < 12) size++;
		}
		else {
			emit(clear);
			dict.clear();
			next = eoi + 1;
			size = min + 1;
		}
		prefix = k;
	}
	emit(prefix);
	emit(eoi);
	if (nbits > 0) out.push(cur & 255);
	return out;
}

// ---------- PNG-8 ----------

var CRC = null;
function crc32(bytes) {
	if (!CRC) {
		CRC = new Uint32Array(256);
		for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
	}
	var crc = 0xffffffff;
	for (var i = 0; i < bytes.length; i++) crc = CRC[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function encode_png8(q, w, h) {
	var chunks = [];
	var chunk = (type, data) => {
		var td = new Uint8Array(4 + data.length);
		for (var i = 0; i < 4; i++) td[i] = type.charCodeAt(i);
		td.set(data, 4);
		var c = new Uint8Array(12 + data.length), dv = new DataView(c.buffer);
		dv.setUint32(0, data.length);
		c.set(td, 4);
		dv.setUint32(8 + data.length, crc32(td));
		chunks.push(c);
	};
	var ihdr = new Uint8Array(13), hv = new DataView(ihdr.buffer);
	hv.setUint32(0, w); hv.setUint32(4, h);
	ihdr[8] = 8; ihdr[9] = 3; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
	chunk('IHDR', ihdr);
	var plte = new Uint8Array(q.palette.length * 3);
	q.palette.forEach((c, i) => { plte[i * 3] = c[0]; plte[i * 3 + 1] = c[1]; plte[i * 3 + 2] = c[2]; });
	chunk('PLTE', plte);
	if (q.transparent >= 0) {
		var trns = new Uint8Array(q.transparent + 1).fill(255);
		trns[q.transparent] = 0;
		chunk('tRNS', trns);
	}
	var raw = new Uint8Array((w + 1) * h);
	for (var y = 0; y < h; y++) {
		raw[y * (w + 1)] = 0;
		raw.set(q.index.subarray(y * w, y * w + w), y * (w + 1) + 1);
	}
	chunk('IDAT', pako.deflate(raw, { level: 9 }));
	chunk('IEND', new Uint8Array(0));
	var sig = [137, 80, 78, 71, 13, 10, 26, 10];
	var total = 8 + chunks.reduce((n, c) => n + c.length, 0);
	var out = new Uint8Array(total);
	out.set(sig, 0);
	var o = 8;
	for (var c of chunks) { out.set(c, o); o += c.length; }
	return out;
}

export { quantize, fixed_palette, encode_gif, encode_png8 };
