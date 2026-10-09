/*
 * pshot - a minimal PDF writer: one JPEG image per page (page size = image
 * size at 72 dpi), optionally opening full screen (PDF Presentation).
 */

/**
 * pages: [{ jpeg: Uint8Array, w, h }] -> PDF bytes
 */
function make_pdf(pages, opts) {
	opts = opts || {};
	var enc = new TextEncoder();
	var parts = [], offsets = [], length = 0;
	var push = (data) => {
		var bytes = typeof data == 'string' ? enc.encode(data) : data;
		parts.push(bytes);
		length += bytes.length;
	};
	var obj = (n, body) => {
		offsets[n] = length;
		push(n + ' 0 obj\n');
		body();
		push('\nendobj\n');
	};
	push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
	//1 catalog, 2 pages, then per page: page, content, image
	var count = pages.length;
	var kids = pages.map((p, i) => (3 + i * 3) + ' 0 R').join(' ');
	obj(1, () => push('<< /Type /Catalog /Pages 2 0 R' + (opts.full_screen ? ' /PageMode /FullScreen' : '') + ' >>'));
	obj(2, () => push('<< /Type /Pages /Kids [' + kids + '] /Count ' + count + ' >>'));
	pages.forEach((p, i) => {
		var page = 3 + i * 3, content = page + 1, image = page + 2;
		var stream = 'q ' + p.w + ' 0 0 ' + p.h + ' 0 0 cm /Im0 Do Q';
		obj(page, () => push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + p.w + ' ' + p.h + '] /Resources << /XObject << /Im0 ' + image + ' 0 R >> >> /Contents ' + content + ' 0 R'
			+ (opts.duration ? ' /Dur ' + opts.duration + (opts.transition ? ' /Trans << /S /' + opts.transition + ' >>' : '') : '') + ' >>'));
		obj(content, () => { push('<< /Length ' + stream.length + ' >>\nstream\n'); push(stream); push('\nendstream'); });
		obj(image, () => {
			push('<< /Type /XObject /Subtype /Image /Width ' + p.w + ' /Height ' + p.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.jpeg.length + ' >>\nstream\n');
			push(p.jpeg);
			push('\nendstream');
		});
	});
	var xref = length;
	var total = 3 + count * 3;
	var table = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
	for (var n = 1; n < total; n++) table += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
	push(table + 'trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
	var out = new Uint8Array(length), o = 0;
	for (var part of parts) { out.set(part, o); o += part.length; }
	return out;
}

/**
 * a canvas as a PDF page (JPEG on white)
 */
async function canvas_page(canvas, quality) {
	var c = document.createElement('canvas');
	c.width = canvas.width;
	c.height = canvas.height;
	var ctx = c.getContext('2d');
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, c.width, c.height);
	ctx.drawImage(canvas, 0, 0);
	var blob = await new Promise(r => c.toBlob(r, 'image/jpeg', quality || 0.92));
	return { jpeg: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height };
}

export { make_pdf, canvas_page };
