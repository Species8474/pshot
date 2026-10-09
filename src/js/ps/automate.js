/*
 * pshot - CS6 File > Automate: Photomerge (Auto / Reposition), Crop and
 * Straighten Photos, Contact Sheet II, Conditional Mode Change; File >
 * Scripts > Statistics.
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';
import { file_to_layers, is_psd } from './document.js';
import { best_offset } from './auto-align.js';
import { make_pdf, canvas_page } from './pdf.js';
import filesaver from './../../../node_modules/file-saver/dist/FileSaver.min.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

function pick(multiple) {
	return new Promise((resolve) => {
		var input = document.createElement('input');
		input.type = 'file';
		input.multiple = multiple;
		input.accept = 'image/*,.psd';
		input.addEventListener('change', () => resolve(Array.from(input.files || [])));
		input.click();
	});
}

function new_canvas(w, h) {
	var c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	return c;
}

/**
 * a file's merged image as a canvas
 */
async function file_canvas(file) {
	if (!is_psd(file)) {
		var url = URL.createObjectURL(file);
		try {
			var img = new Image();
			img.src = url;
			await img.decode();
			var c = new_canvas(img.naturalWidth, img.naturalHeight);
			c.getContext('2d').drawImage(img, 0, 0);
			return c;
		} finally {
			URL.revokeObjectURL(url);
		}
	}
	var doc = await file_to_layers(file);
	var out = new_canvas(doc.width, doc.height), ctx = out.getContext('2d');
	for (var l of doc.layers.filter(x => x.type == 'image' && x.data && x.visible !== false)) {
		var li = new Image();
		li.src = l.data;
		await li.decode();
		ctx.globalAlpha = (l.opacity == null ? 100 : l.opacity) / 100;
		ctx.drawImage(li, l.x || 0, l.y || 0, l.width, l.height);
	}
	return out;
}

function base_name(file) {
	return file.name.replace(/\.[^.]+$/, '');
}

/**
 * a new document from canvases: [{ name, canvas, x, y }] bottom first
 */
async function new_document(name, W, H, items, description) {
	app.GUI.Ps_workspace.Documents.add(name);
	var actions = [new app.Actions.Prepare_canvas_action('undo'), new app.Actions.Update_config_action({ WIDTH: W, HEIGHT: H }), new app.Actions.Reset_layers_action()];
	var order = 1;
	for (var it of items) {
		actions.push(new app.Actions.Insert_layer_action({
			name: it.name, type: 'image', x: it.x || 0, y: it.y || 0, width: it.canvas.width, height: it.canvas.height,
			width_original: it.canvas.width, height_original: it.canvas.height, data: it.canvas.toDataURL('image/png'), order: order++,
		}, false));
	}
	actions.push(new app.Actions.Prepare_canvas_action('do'));
	await app.State.do_action(new app.Actions.Bundle_action('open', description || 'Open', actions));
	app.GUI.modules['ps/commands'].purge_histories();
	app.GUI.GUI_preview.zoom_open();
	app.GUI.GUI_layers.render_layers();
}

function wait(ms) {
	return new Promise(r => setTimeout(r, ms));
}

class Ps_automate_class {

	// ---------- Photomerge ----------

	photomerge() {
		var files = [];
		var POP = new Dialog_class();
		POP.show({
			title: 'Photomerge',
			params: [
				{ name: 'layout', title: 'Layout:', values: ['Auto', 'Reposition'], value: 'Auto' },
				{ title: '', html: '<span class="ps_dialog_note">Perspective, Cylindrical, Spherical and Collage are not available in pshot.</span>' },
				{ title: 'Source Files:', html: '<button type="button" id="pm_browse">Browse...</button> <span id="pm_count">No files</span>' },
				{ name: 'blend', title: 'Blend Images Together', value: true },
				{ name: 'vignette', title: 'Vignette Removal', value: false },
				{ name: 'distortion', title: 'Geometric Distortion Correction', value: false },
			],
			on_load: (params, pop) => {
				pop.el.querySelector('#pm_browse').addEventListener('click', async () => {
					files = await pick(true);
					pop.el.querySelector('#pm_count').textContent = files.length + ' file' + (files.length == 1 ? '' : 's');
				});
			},
			on_finish: (p) => {
				if (files.length < 2) {
					alertify.error('Photomerge needs two or more source files.');
					return;
				}
				this.merge(files, p.blend);
			},
		});
	}

	async merge(files, blend) {
		var ws = app.GUI.Ps_workspace;
		ws.status_message('Photomerge: loading files...');
		var items = [];
		for (var f of files) {
			var c = await file_canvas(f);
			items.push({ name: base_name(f), canvas: c, link: c, width: c.width, height: c.height });
		}
		//chain: each image placed against the one before it, starting side by side
		items[0].x = 0;
		items[0].y = 0;
		for (var i = 1; i < items.length; i++) {
			ws.status_message('Photomerge: aligning ' + items[i].name + '...');
			await wait(10);
			var prev = items[i - 1];
			var o = best_offset(prev, items[i], { x: 0, y: 0 }, 1);
			items[i].x = prev.x + o.x;
			items[i].y = prev.y + o.y;
		}
		var x0 = Math.min.apply(null, items.map(it => it.x)), y0 = Math.min.apply(null, items.map(it => it.y));
		var x1 = Math.max.apply(null, items.map(it => it.x + it.width)), y1 = Math.max.apply(null, items.map(it => it.y + it.height));
		items.forEach(it => { it.x -= x0; it.y -= y0; });
		await new_document('Untitled_Panorama', x1 - x0, y1 - y0, items, 'Photomerge');
		if (blend) {
			ws.status_message('Photomerge: blending...');
			await wait(10);
			var layers = config.layers.filter(l => l.type == 'image');
			await ws.Auto_align.blend(layers, 'Panorama', true);
		}
		ws.status_message('Photomerge done.');
	}

	// ---------- Crop and Straighten Photos ----------

	/**
	 * scanned photos on a plain background: each one becomes a new straightened document
	 */
	async crop_straighten() {
		var ws = app.GUI.Ps_workspace;
		var W = config.WIDTH, H = config.HEIGHT;
		var flat = new_canvas(W, H);
		var fctx = flat.getContext('2d', { willReadFrequently: true });
		fctx.fillStyle = '#fff';
		fctx.fillRect(0, 0, W, H);
		app.Layers.convert_layers_to_canvas(fctx, null, false);
		var d = fctx.getImageData(0, 0, W, H).data;
		//background color: the median of the border pixels
		var border = [];
		for (var x = 0; x < W; x += 2) { border.push((0 * W + x) * 4, ((H - 1) * W + x) * 4); }
		for (var y = 0; y < H; y += 2) { border.push((y * W) * 4, (y * W + W - 1) * 4); }
		var med = [0, 1, 2].map(c => { var v = border.map(o => d[o + c]).sort((a, b) => a - b); return v[v.length >> 1]; });
		var fg = new Uint8Array(W * H);
		for (var i = 0; i < W * H; i++) {
			var diff = Math.abs(d[i * 4] - med[0]) + Math.abs(d[i * 4 + 1] - med[1]) + Math.abs(d[i * 4 + 2] - med[2]);
			fg[i] = diff > 40 ? 1 : 0;
		}
		//connected components (4-neighbour flood fill)
		var label = new Int32Array(W * H), comps = [], stack = [];
		for (var s = 0; s < W * H; s++) {
			if (!fg[s] || label[s]) continue;
			var id = comps.length + 1, pts = [];
			label[s] = id;
			stack.push(s);
			while (stack.length) {
				var k = stack.pop();
				pts.push(k);
				var kx = k % W, ky = (k / W) | 0;
				if (kx > 0 && fg[k - 1] && !label[k - 1]) { label[k - 1] = id; stack.push(k - 1); }
				if (kx < W - 1 && fg[k + 1] && !label[k + 1]) { label[k + 1] = id; stack.push(k + 1); }
				if (ky > 0 && fg[k - W] && !label[k - W]) { label[k - W] = id; stack.push(k - W); }
				if (ky < H - 1 && fg[k + W] && !label[k + W]) { label[k + W] = id; stack.push(k + W); }
			}
			comps.push(pts);
		}
		var photos = comps.filter(p => p.length > W * H * 0.01);
		if (!photos.length) {
			alertify.error('Crop and Straighten Photos found no photos on a plain background.');
			return;
		}
		var name = ws.Documents.current().name || 'Untitled';
		var n = 0;
		for (var pts of photos) {
			var rect = this.min_rect(pts, W);
			var out = new_canvas(Math.max(1, Math.round(rect.w)), Math.max(1, Math.round(rect.h)));
			var octx = out.getContext('2d');
			octx.translate(out.width / 2, out.height / 2);
			octx.rotate(-rect.angle);
			octx.translate(-rect.cx, -rect.cy);
			octx.drawImage(flat, 0, 0);
			n++;
			await new_document(name + ' copy' + (n > 1 ? ' ' + n : ''), out.width, out.height, [{ name: 'Background', canvas: out }], 'Crop and Straighten Photos');
		}
		ws.status_message('Crop and Straighten Photos: ' + n + ' photo' + (n == 1 ? '' : 's') + '.');
	}

	/**
	 * the smallest rotated rectangle around the pixels (angle search, -45..45 degrees)
	 */
	min_rect(pts, W) {
		var step = Math.max(1, Math.floor(pts.length / 20000));
		var xs = [], ys = [];
		for (var i = 0; i < pts.length; i += step) { xs.push(pts[i] % W + 0.5); ys.push(((pts[i] / W) | 0) + 0.5); }
		var best = null;
		var fit = (a) => {
			var cos = Math.cos(a), sin = Math.sin(a);
			var u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
			for (var j = 0; j < xs.length; j++) {
				var u = xs[j] * cos + ys[j] * sin, v = -xs[j] * sin + ys[j] * cos;
				if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
			}
			var area = (u1 - u0) * (v1 - v0);
			if (!best || area < best.area) {
				var cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
				best = { area: area, angle: a, w: u1 - u0, h: v1 - v0, cx: cu * cos - cv * sin, cy: cu * sin + cv * cos };
			}
		};
		for (var deg = -45; deg <= 45; deg += 1) fit(deg * Math.PI / 180);
		var coarse = best.angle;
		for (var fine = -1; fine <= 1; fine += 0.1) fit(coarse + fine * Math.PI / 180);
		return best;
	}

	// ---------- Contact Sheet II ----------

	contact_sheet() {
		var files = [];
		var POP = new Dialog_class();
		POP.show({
			title: 'Contact Sheet II',
			params: [
				{ title: 'Source Images:', html: '<button type="button" id="cs2_browse">Browse...</button> <span id="cs2_count">No files</span>' },
				{ name: 'width', title: 'Width (px):', value: 2400 },
				{ name: 'height', title: 'Height (px):', value: 3000 },
				{ name: 'columns', title: 'Columns:', value: 5 },
				{ name: 'rows', title: 'Rows:', value: 6 },
				{ name: 'captions', title: 'Use Filename As Caption', value: true },
				{ name: 'font_size', title: 'Font Size (px):', value: 24 },
				{ name: 'flatten', title: 'Flatten All Layers', value: true },
			],
			on_load: (params, pop) => {
				pop.el.querySelector('#cs2_browse').addEventListener('click', async () => {
					files = await pick(true);
					pop.el.querySelector('#cs2_count').textContent = files.length + ' file' + (files.length == 1 ? '' : 's');
				});
			},
			on_finish: (p) => {
				if (!files.length) {
					alertify.error('Contact Sheet II needs source images.');
					return;
				}
				this.make_sheets(files, p);
			},
		});
	}

	async make_sheets(files, p) {
		var W = Math.max(100, parseInt(p.width) || 2400), H = Math.max(100, parseInt(p.height) || 3000);
		var cols = Math.max(1, parseInt(p.columns) || 5), rows = Math.max(1, parseInt(p.rows) || 6);
		var fs = Math.max(6, parseInt(p.font_size) || 24);
		var per = cols * rows;
		var cell_w = W / cols, cell_h = H / rows, pad = Math.round(Math.min(cell_w, cell_h) * 0.06);
		var cap_h = p.captions ? Math.round(fs * 1.5) : 0;
		for (var page = 0; page * per < files.length; page++) {
			var items = [];
			var sheet = p.flatten ? new_canvas(W, H) : null;
			if (sheet) {
				var sctx = sheet.getContext('2d');
				sctx.fillStyle = '#fff';
				sctx.fillRect(0, 0, W, H);
			}
			var batch = files.slice(page * per, page * per + per);
			for (var i = 0; i < batch.length; i++) {
				var img = await file_canvas(batch[i]);
				var cx = (i % cols) * cell_w, cy = Math.floor(i / cols) * cell_h;
				var bw = cell_w - pad * 2, bh = cell_h - pad * 2 - cap_h;
				var k = Math.min(bw / img.width, bh / img.height);
				var tw = Math.max(1, Math.round(img.width * k)), th = Math.max(1, Math.round(img.height * k));
				var tx = Math.round(cx + (cell_w - tw) / 2), ty = Math.round(cy + pad + (bh - th) / 2);
				var thumb = new_canvas(tw, th);
				var tctx = thumb.getContext('2d');
				tctx.imageSmoothingQuality = 'high';
				tctx.drawImage(img, 0, 0, tw, th);
				var caption = null;
				if (p.captions) {
					caption = new_canvas(Math.round(cell_w), cap_h);
					var cctx = caption.getContext('2d');
					cctx.font = fs + 'px Arial';
					cctx.fillStyle = '#000';
					cctx.textAlign = 'center';
					cctx.textBaseline = 'middle';
					cctx.fillText(batch[i].name, caption.width / 2, cap_h / 2, cell_w - pad);
				}
				if (sheet) {
					sctx.drawImage(thumb, tx, ty);
					if (caption) sctx.drawImage(caption, Math.round(cx), Math.round(cy + cell_h - pad - cap_h));
				}
				else {
					items.push({ name: base_name(batch[i]), canvas: thumb, x: tx, y: ty });
					if (caption) items.push({ name: batch[i].name, canvas: caption, x: Math.round(cx), y: Math.round(cy + cell_h - pad - cap_h) });
				}
			}
			if (sheet) items = [{ name: 'Background', canvas: sheet }];
			else {
				var bg = new_canvas(W, H);
				var bctx = bg.getContext('2d');
				bctx.fillStyle = '#fff';
				bctx.fillRect(0, 0, W, H);
				items.unshift({ name: 'Background', canvas: bg });
			}
			await new_document('ContactSheet-' + String(page + 1).padStart(3, '0'), W, H, items, 'Contact Sheet II');
		}
	}

	// ---------- PDF ----------

	/**
	 * the active document merged (on the given background)
	 */
	merged(background) {
		var c = new_canvas(config.WIDTH, config.HEIGHT), ctx = c.getContext('2d');
		ctx.fillStyle = background || '#ffffff';
		ctx.fillRect(0, 0, c.width, c.height);
		app.Layers.convert_layers_to_canvas(ctx, null, false);
		return c;
	}

	save_pdf(pages, name, opts) {
		var bytes = make_pdf(pages, opts);
		filesaver.saveAs(new Blob([bytes], { type: 'application/pdf' }), name + '.pdf');
	}

	/**
	 * File > Automate > PDF Presentation
	 */
	pdf_presentation() {
		var files = [];
		var POP = new Dialog_class();
		POP.show({
			title: 'PDF Presentation',
			params: [
				{ title: 'Source Files:', html: '<button type="button" id="pdf_browse">Browse...</button> <span id="pdf_count">No files</span>' },
				{ name: 'open_files', title: 'Add Open Files', value: true },
				{ name: 'output', title: 'Output Options:', values: ['Multi-Page Document', 'Presentation'], value: 'Multi-Page Document' },
				{ name: 'background', title: 'Background:', values: ['White', 'Black'], value: 'White' },
				{ name: 'filename', title: 'Include Filename', value: false },
				{ name: 'advance', title: 'Advance Every (seconds):', value: 5 },
				{ name: 'transition', title: 'Transition:', type: 'select', values: ['None', 'Wipe', 'Dissolve', 'Box', 'Blinds', 'Split', 'Glitter'], value: 'None' },
			],
			on_load: (params, pop) => {
				pop.el.querySelector('#pdf_browse').addEventListener('click', async () => {
					files = await pick(true);
					pop.el.querySelector('#pdf_count').textContent = files.length + ' file' + (files.length == 1 ? '' : 's');
				});
			},
			on_finish: (p) => this.make_presentation(files, p),
		});
	}

	async make_presentation(files, p) {
		var bg = p.background == 'Black' ? '#000000' : '#ffffff';
		var sources = [];
		if (p.open_files) {
			var Docs = app.GUI.Ps_workspace.Documents;
			var active = Docs.active;
			for (var i = 0; i < Docs.docs.length; i++) {
				Docs.switch_to(i);
				await wait(50);
				sources.push({ name: Docs.current().name || 'Untitled', canvas: this.merged(bg) });
			}
			Docs.switch_to(active);
		}
		for (var f of files) sources.push({ name: f.name, canvas: await file_canvas(f) });
		if (!sources.length) {
			alertify.error('PDF Presentation needs source files or open documents.');
			return;
		}
		var pages = [];
		for (var s of sources) {
			var c = new_canvas(s.canvas.width, s.canvas.height), ctx = c.getContext('2d');
			ctx.fillStyle = bg;
			ctx.fillRect(0, 0, c.width, c.height);
			ctx.drawImage(s.canvas, 0, 0);
			if (p.filename) {
				var fs = Math.max(10, Math.round(c.height / 30));
				ctx.font = fs + 'px Arial';
				ctx.fillStyle = bg == '#000000' ? '#ffffff' : '#000000';
				ctx.textBaseline = 'bottom';
				ctx.fillText(s.name, fs / 2, c.height - fs / 2);
			}
			pages.push(await canvas_page(c));
		}
		var presentation = p.output == 'Presentation';
		var TRANS = { Wipe: 'Wipe', Dissolve: 'Dissolve', Box: 'Box', Blinds: 'Blinds', Split: 'Split', Glitter: 'Glitter' };
		this.save_pdf(pages, 'Presentation', {
			full_screen: presentation,
			duration: presentation ? Math.max(1, parseFloat(p.advance) || 5) : 0,
			transition: presentation ? TRANS[p.transition] : null,
		});
		app.GUI.Ps_workspace.status_message('PDF Presentation: ' + pages.length + ' page' + (pages.length == 1 ? '' : 's') + '.');
	}

	/**
	 * File > Scripts > Layer Comps to PDF
	 */
	async comps_to_pdf() {
		var comps = config.ps_comps || [];
		if (!comps.length) {
			alertify.error('There are no layer comps in the document.');
			return;
		}
		var Comps = app.GUI.Ps_workspace.Comps;
		var start = app.State.action_history_index;
		var pages = [];
		for (var i = 0; i < comps.length; i++) {
			await Comps.apply(i);
			await wait(150);
			pages.push(await canvas_page(this.merged('#ffffff')));
		}
		//back to the state before the export
		await app.GUI.Ps_workspace.goto_history(start);
		app.State.action_history.length = start;
		app.GUI.Ps_workspace.render_history();
		this.save_pdf(pages, app.GUI.Ps_workspace.document_name().replace(/\.[^.]+$/, '') + ' Comps', {});
		app.GUI.Ps_workspace.status_message('Layer Comps to PDF: ' + pages.length + ' pages.');
	}

	// ---------- Conditional Mode Change ----------

	conditional_mode() {
		var MODES = ['Bitmap', 'Grayscale', 'Duotone', 'Indexed', 'RGB'];
		var POP = new Dialog_class();
		POP.show({
			title: 'Conditional Mode Change',
			params: MODES.map(m => ({ name: 'src_' + m, title: 'Source Mode: ' + m, value: true }))
				.concat([{ name: 'target', title: 'Target Mode:', values: ['RGB Color', 'Grayscale', 'Indexed Color'], value: 'RGB Color' }]),
			on_finish: (p) => {
				var current = config.ps_mode || 'RGB';
				if (!p['src_' + current]) return;
				var cmd = app.GUI.modules['ps/commands'];
				if (p.target == 'RGB Color' && current != 'RGB') cmd.mode_rgb();
				if (p.target == 'Grayscale' && current != 'Grayscale') cmd.mode_grayscale();
				if (p.target == 'Indexed Color' && current != 'Indexed') cmd.mode_indexed();
			},
		});
	}

	// ---------- Statistics ----------

	statistics() {
		var files = [];
		var MODES = ['Mean', 'Median', 'Maximum', 'Minimum', 'Range', 'Summation', 'Standard Deviation', 'Variance'];
		var POP = new Dialog_class();
		POP.show({
			title: 'Image Statistics',
			params: [
				{ name: 'mode', title: 'Choose Stack Mode:', values: MODES, value: 'Median', type: 'select' },
				{ title: 'Source Files:', html: '<button type="button" id="st_browse">Browse...</button> <span id="st_count">No files</span>' },
				{ name: 'align', title: 'Attempt to Automatically Align Source Images', value: false },
			],
			on_load: (params, pop) => {
				pop.el.querySelector('#st_browse').addEventListener('click', async () => {
					files = await pick(true);
					pop.el.querySelector('#st_count').textContent = files.length + ' file' + (files.length == 1 ? '' : 's');
				});
			},
			on_finish: (p) => {
				if (files.length < 2) {
					alertify.error('Statistics needs two or more source files.');
					return;
				}
				this.stack(files, p.mode, p.align);
			},
		});
	}

	async stack(files, mode, align) {
		var ws = app.GUI.Ps_workspace;
		ws.status_message('Statistics: loading files...');
		var items = [];
		for (var f of files) {
			var c = await file_canvas(f);
			items.push({ name: base_name(f), canvas: c, link: c, width: c.width, height: c.height, x: 0, y: 0 });
		}
		if (align) {
			for (var i = 1; i < items.length; i++) {
				var o = best_offset(items[0], items[i], { x: 0, y: 0 }, 0.3);
				items[i].x = o.x;
				items[i].y = o.y;
			}
		}
		var W = items[0].width, H = items[0].height;
		var data = items.map(it => {
			var c = new_canvas(W, H);
			var ctx = c.getContext('2d', { willReadFrequently: true });
			ctx.drawImage(it.canvas, it.x, it.y);
			return ctx.getImageData(0, 0, W, H).data;
		});
		var out = new_canvas(W, H), octx = out.getContext('2d');
		var img = octx.createImageData(W, H), d = img.data, n = data.length, v = new Float32Array(n);
		for (var p = 0; p < W * H * 4; p += 4) {
			for (var c2 = 0; c2 < 3; c2++) {
				var m = 0;
				for (var k = 0; k < n; k++) { v[k] = data[k][p + c2]; m += v[k]; }
				m /= n;
				var r;
				if (mode == 'Mean') r = m;
				else if (mode == 'Median') { var sv = Array.from(v).sort((a, b) => a - b); r = n % 2 ? sv[n >> 1] : (sv[n / 2 - 1] + sv[n / 2]) / 2; }
				else if (mode == 'Maximum') r = Math.max.apply(null, v);
				else if (mode == 'Minimum') r = Math.min.apply(null, v);
				else if (mode == 'Range') r = Math.max.apply(null, v) - Math.min.apply(null, v);
				else if (mode == 'Summation') r = m * n;
				else {
					var vs = 0;
					for (var k2 = 0; k2 < n; k2++) vs += (v[k2] - m) * (v[k2] - m);
					vs /= n;
					r = mode == 'Variance' ? vs : Math.sqrt(vs);
				}
				d[p + c2] = r;
			}
			d[p + 3] = 255;
		}
		octx.putImageData(img, 0, 0);
		await new_document('Untitled_Statistics', W, H, [{ name: mode, canvas: out }], 'Statistics');
		ws.status_message('Statistics (' + mode + ') done.');
	}
}

export default Ps_automate_class;
