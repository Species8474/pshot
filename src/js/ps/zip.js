/*
 * pshot - a minimal ZIP writer (stored, no compression) for multi-file exports
 * such as Save for Web with slices.
 */

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

/**
 * files: [{ name, data: Uint8Array }] -> Blob (application/zip)
 */
function make_zip(files) {
	var enc = new TextEncoder(), parts = [], central = [], offset = 0;
	for (var f of files) {
		var name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
		var head = new DataView(new ArrayBuffer(30));
		head.setUint32(0, 0x04034b50, true);
		head.setUint16(4, 20, true);
		head.setUint16(6, 0x0800, true);
		head.setUint16(8, 0, true);
		head.setUint32(14, crc, true);
		head.setUint32(18, size, true);
		head.setUint32(22, size, true);
		head.setUint16(26, name.length, true);
		parts.push(new Uint8Array(head.buffer), name, f.data);
		var cd = new DataView(new ArrayBuffer(46));
		cd.setUint32(0, 0x02014b50, true);
		cd.setUint16(4, 20, true);
		cd.setUint16(6, 20, true);
		cd.setUint16(8, 0x0800, true);
		cd.setUint32(16, crc, true);
		cd.setUint32(20, size, true);
		cd.setUint32(24, size, true);
		cd.setUint16(28, name.length, true);
		cd.setUint32(42, offset, true);
		central.push(new Uint8Array(cd.buffer), name);
		offset += 30 + name.length + size;
	}
	var cd_size = central.reduce((n, p) => n + p.length, 0);
	var end = new DataView(new ArrayBuffer(22));
	end.setUint32(0, 0x06054b50, true);
	end.setUint16(8, files.length, true);
	end.setUint16(10, files.length, true);
	end.setUint32(12, cd_size, true);
	end.setUint32(16, offset, true);
	return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
}

export { make_zip };
