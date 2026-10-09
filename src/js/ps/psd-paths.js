/*
 * pshot - saved paths in PSD files. ag-psd does not handle the path image
 * resources, so they are written into / read from the Image Resources section
 * here: id 2000..2997 = saved paths (named), 1025 = Work Path. Each path is a
 * list of 26-byte records with 8.24 fixed-point coordinates relative to the
 * document size (y before x).
 */

const FIXED = 1 << 24;

function encode_path(path, W, H) {
	var recs = [];
	var rec = () => { var r = new DataView(new ArrayBuffer(26)); recs.push(r); return r; };
	rec().setUint16(0, 6); //path fill rule record
	rec().setUint16(0, 8); //initial fill rule record (0)
	var fix = (r, off, v) => r.setInt32(off, Math.round(v * FIXED));
	for (var sp of path.subpaths) {
		var len = rec();
		len.setUint16(0, sp.closed ? 0 : 3);
		len.setUint16(2, sp.pts.length);
		for (var p of sp.pts) {
			var linked = Math.abs((p.x - p.ix) + (p.x - p.ox)) < 0.5 && Math.abs((p.y - p.iy) + (p.y - p.oy)) < 0.5;
			var k = rec();
			k.setUint16(0, sp.closed ? (linked ? 1 : 2) : (linked ? 4 : 5));
			fix(k, 2, p.iy / H); fix(k, 6, p.ix / W);
			fix(k, 10, p.y / H); fix(k, 14, p.x / W);
			fix(k, 18, p.oy / H); fix(k, 22, p.ox / W);
		}
	}
	var out = new Uint8Array(recs.length * 26);
	recs.forEach((r, i) => out.set(new Uint8Array(r.buffer), i * 26));
	return out;
}

function decode_path(bytes, W, H) {
	var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	var subpaths = [], cur = null;
	var fx = (off) => dv.getInt32(off) / FIXED;
	for (var o = 0; o + 26 <= bytes.byteLength; o += 26) {
		var sel = dv.getUint16(o);
		if (sel == 0 || sel == 3) {
			cur = { closed: sel == 0, pts: [] };
			subpaths.push(cur);
		}
		else if (sel >= 1 && sel <= 5 && sel != 3 && cur) {
			cur.pts.push({ iy: fx(o + 2) * H, ix: fx(o + 6) * W, y: fx(o + 10) * H, x: fx(o + 14) * W, oy: fx(o + 18) * H, ox: fx(o + 22) * W });
		}
	}
	return subpaths.filter(sp => sp.pts.length);
}

function block(id, name, data) {
	var nameBytes = new TextEncoder().encode(name || '').slice(0, 255);
	var nameLen = 1 + nameBytes.length;
	var namePad = nameLen % 2;
	var dataPad = data.length % 2;
	var out = new Uint8Array(4 + 2 + nameLen + namePad + 4 + data.length + dataPad);
	var dv = new DataView(out.buffer);
	out.set([0x38, 0x42, 0x49, 0x4d], 0); //8BIM
	dv.setUint16(4, id);
	out[6] = nameBytes.length;
	out.set(nameBytes, 7);
	var o = 6 + nameLen + namePad;
	dv.setUint32(o, data.length);
	out.set(data, o + 4);
	return out;
}

/**
 * PSD bytes + pshot paths -> PSD bytes with the path resources
 */
function inject_paths(buffer, paths, W, H) {
	if (!paths || !paths.length) return buffer;
	var src = new Uint8Array(buffer);
	var dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
	var cm = dv.getUint32(26);
	var resOff = 30 + cm;
	var resLen = dv.getUint32(resOff);
	var blocks = [];
	var saved = 0;
	for (var p of paths) {
		if (!p.subpaths || !p.subpaths.length) continue;
		var data = encode_path(p, W, H);
		if (p.work) blocks.push(block(1025, '', data));
		else if (saved < 998) blocks.push(block(2000 + saved++, p.name || 'Path ' + saved, data));
	}
	var add = blocks.reduce((n, b) => n + b.length, 0);
	if (!add) return buffer;
	var out = new Uint8Array(src.length + add);
	out.set(src.subarray(0, resOff), 0);
	new DataView(out.buffer).setUint32(resOff, resLen + add);
	out.set(src.subarray(resOff + 4, resOff + 4 + resLen), resOff + 4);
	var o = resOff + 4 + resLen;
	for (var b of blocks) { out.set(b, o); o += b.length; }
	out.set(src.subarray(resOff + 4 + resLen), o);
	return out.buffer;
}

/**
 * PSD bytes -> pshot paths ([] when none)
 */
function read_paths(buffer, W, H) {
	var src = new Uint8Array(buffer);
	var dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
	var paths = [];
	try {
		var cm = dv.getUint32(26);
		var o = 30 + cm;
		var end = o + 4 + dv.getUint32(o);
		o += 4;
		while (o + 12 <= end) {
			if (dv.getUint32(o) != 0x3842494d) break;
			var id = dv.getUint16(o + 4);
			var nl = src[o + 6];
			var name = new TextDecoder().decode(src.subarray(o + 7, o + 7 + nl));
			var p = o + 6 + 1 + nl + ((1 + nl) % 2);
			var size = dv.getUint32(p);
			var data = src.subarray(p + 4, p + 4 + size);
			if ((id >= 2000 && id <= 2997) || id == 1025) {
				var subpaths = decode_path(data, W, H);
				if (subpaths.length) paths.push({ name: id == 1025 ? 'Work Path' : name, work: id == 1025, subpaths: subpaths });
			}
			o = p + 4 + size + (size % 2);
		}
	} catch (e) { /* not a PSD or damaged resources */ }
	return paths;
}

export { inject_paths, read_paths };
