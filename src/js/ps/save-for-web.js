/*
 * pshot - CS6 File > Save for Web (Alt+Shift+Ctrl+S): Original / Optimized /
 * 2-Up preview with the encoded file size, presets, JPEG quality, PNG-24
 * transparency, GIF / PNG-8 (color reduction, colors, dither, transparency;
 * ps/indexed.js) and image size. WBMP is greyed.
 */

import app from './../app.js';
import config from './../config.js';
import { quantize, encode_gif, encode_png8 } from './indexed.js';
import { make_zip } from './zip.js';

const PRESETS = {
	'GIF 128 Dithered': { format: 'GIF', colors: 128, dither: 88 },
	'GIF 128 No Dither': { format: 'GIF', colors: 128, dither: 0 },
	'GIF 32 Dithered': { format: 'GIF', colors: 32, dither: 88 },
	'GIF 32 No Dither': { format: 'GIF', colors: 32, dither: 0 },
	'GIF 64 Dithered': { format: 'GIF', colors: 64, dither: 88 },
	'GIF 64 No Dither': { format: 'GIF', colors: 64, dither: 0 },
	'JPEG High': { format: 'JPEG', quality: 60 },
	'JPEG Low': { format: 'JPEG', quality: 10 },
	'JPEG Medium': { format: 'JPEG', quality: 30 },
	'JPEG Very High': { format: 'JPEG', quality: 80 },
	'JPEG Maximum': { format: 'JPEG', quality: 100 },
	'PNG-24': { format: 'PNG-24', quality: 100 },
	'PNG-8 128 Dithered': { format: 'PNG-8', colors: 128, dither: 88 },
};
const QUALITY_NAMES = [[0, 'Low'], [30, 'Medium'], [60, 'High'], [80, 'Very High'], [100, 'Maximum']];

function size_text(bytes) {
	return bytes < 1024 ? bytes + ' bytes' : (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + 'K';
}

class Ps_save_for_web_class {

	open() {
		var W = config.WIDTH, H = config.HEIGHT;
		var flat = document.createElement('canvas');
		flat.width = W;
		flat.height = H;
		app.Layers.convert_layers_to_canvas(flat.getContext('2d'), null, false);
		this.state = { flat: flat, format: 'JPEG', quality: 60, progressive: false, transparency: true, matte: '#ffffff', width: W, height: H, view: '2-Up', preset: 'JPEG High',
			reduction: 'Selective', colors: 128, dither_type: 'Diffusion', dither: 88 };
		this.build();
		this.update();
	}

	build() {
		var s = this.state;
		var el = document.createElement('div');
		el.className = 'popup ps_sfw';
		el.style.display = 'block';
		el.innerHTML = '<h2>Save for Web (100%)</h2>'
			+ '<div class="ps_sfw_body">'
			+ '<div class="ps_sfw_left"><div class="ps_sfw_tabs">' + ['Original', 'Optimized', '2-Up', '4-Up'].map(t => '<button type="button" data-view="' + t + '" class="' + (t == s.view ? 'active' : '') + (t == '4-Up' ? ' disabled' : '') + '">' + t + '</button>').join('') + '</div>'
			+ '<div class="ps_sfw_views"></div></div>'
			+ '<div class="ps_sfw_right">'
			+ '<div class="ps_sfw_row"><span>Preset:</span><select id="sfw_preset">' + Object.keys(PRESETS).map(p => '<option' + (p == s.preset ? ' selected' : '') + '>' + p + '</option>').join('') + '<option>[Unnamed]</option></select></div>'
			+ '<div class="ps_sfw_row"><select id="sfw_format"><option>GIF</option><option>JPEG</option><option>PNG-8</option><option>PNG-24</option><option>WBMP</option></select></div>'
			+ '<div class="ps_sfw_jpeg"><div class="ps_sfw_row"><select id="sfw_qname">' + QUALITY_NAMES.map(q => '<option>' + q[1] + '</option>').join('') + '</select>'
			+ '<span>Quality:</span><input type="number" id="sfw_quality" min="0" max="100"></div>'
			+ '<div class="ps_sfw_row"><label class="ps_adj_check"><input type="checkbox" id="sfw_progressive"> Progressive</label><span>Matte:</span><button type="button" class="ps_sfw_matte" id="sfw_matte"></button></div></div>'
			+ '<div class="ps_sfw_indexed"><div class="ps_sfw_row"><select id="sfw_reduction">' + ['Perceptual', 'Selective', 'Adaptive', 'Restrictive (Web)'].map(r => '<option>' + r + '</option>').join('') + '</select>'
			+ '<span>Colors:</span><select id="sfw_colors">' + [2, 4, 8, 16, 32, 64, 128, 256].map(c => '<option>' + c + '</option>').join('') + '</select></div>'
			+ '<div class="ps_sfw_row"><select id="sfw_dither_type"><option>No Dither</option><option>Diffusion</option><option>Pattern</option><option>Noise</option></select>'
			+ '<span>Dither:</span><input type="number" id="sfw_dither" min="0" max="100"><span>%</span></div></div>'
			+ '<div class="ps_sfw_png"><label class="ps_adj_check"><input type="checkbox" id="sfw_transparency"> Transparency</label></div>'
			+ '<div class="ps_sfw_group">Image Size</div>'
			+ '<div class="ps_sfw_row"><span>W:</span><input type="number" id="sfw_w" min="1"><span>px</span></div>'
			+ '<div class="ps_sfw_row"><span>H:</span><input type="number" id="sfw_h" min="1"><span>px</span></div>'
			+ '<div class="ps_sfw_row"><span>Percent:</span><input type="number" id="sfw_pct" min="1" max="1000"><span>%</span></div>'
			+ '</div></div>'
			+ '<div class="ps_sfw_buttons"><button type="button" class="button" id="sfw_save">Save...</button><button type="button" class="button" id="sfw_cancel">Cancel</button><button type="button" class="button" id="sfw_done">Done</button></div>';
		document.getElementById('popups').appendChild(el);
		this.el = el;
		var $ = (id) => el.querySelector('#' + id);
		var fmt = $('sfw_format');
		Array.from(fmt.options).forEach(o => { if (o.value == 'WBMP') o.disabled = true; });
		fmt.value = s.format;
		$('sfw_quality').value = s.quality;
		$('sfw_w').value = s.width;
		$('sfw_h').value = s.height;
		$('sfw_pct').value = 100;
		$('sfw_transparency').checked = s.transparency;
		$('sfw_matte').style.background = s.matte;
		var changed = () => { s.preset = '[Unnamed]'; $('sfw_preset').value = '[Unnamed]'; this.update(); };
		$('sfw_preset').addEventListener('change', (e) => {
			var p = PRESETS[e.target.value];
			if (!p) return;
			s.preset = e.target.value;
			s.format = p.format;
			if (p.quality != null) s.quality = p.quality;
			if (p.colors != null) { s.colors = p.colors; s.dither = p.dither; s.dither_type = p.dither ? 'Diffusion' : 'No Dither'; }
			fmt.value = s.format;
			$('sfw_quality').value = s.quality;
			sync_indexed();
			this.update();
		});
		fmt.addEventListener('change', () => { s.format = fmt.value; changed(); });
		$('sfw_quality').addEventListener('change', (e) => { s.quality = Math.max(0, Math.min(100, parseInt(e.target.value) || 0)); changed(); });
		$('sfw_qname').addEventListener('change', (e) => { s.quality = QUALITY_NAMES.find(q => q[1] == e.target.value)[0]; $('sfw_quality').value = s.quality; changed(); });
		$('sfw_progressive').addEventListener('change', (e) => { s.progressive = e.target.checked; changed(); });
		$('sfw_transparency').addEventListener('change', (e) => { s.transparency = e.target.checked; changed(); });
		var sync_indexed = () => {
			$('sfw_reduction').value = s.reduction;
			$('sfw_colors').value = String(s.colors);
			$('sfw_dither_type').value = s.dither_type;
			$('sfw_dither').value = s.dither;
			$('sfw_dither').disabled = s.dither_type == 'No Dither';
		};
		sync_indexed();
		$('sfw_reduction').addEventListener('change', (e) => { s.reduction = e.target.value; changed(); });
		$('sfw_colors').addEventListener('change', (e) => { s.colors = parseInt(e.target.value); changed(); });
		$('sfw_dither_type').addEventListener('change', (e) => { s.dither_type = e.target.value; sync_indexed(); changed(); });
		$('sfw_dither').addEventListener('change', (e) => { s.dither = Math.max(0, Math.min(100, parseInt(e.target.value) || 0)); changed(); });
		$('sfw_matte').addEventListener('click', () => app.GUI.Ps_workspace.color_dialog('Matte', s.matte, (hex) => { s.matte = hex; $('sfw_matte').style.background = hex; changed(); }));
		var W = config.WIDTH, H = config.HEIGHT;
		var size = (w, h) => { s.width = Math.max(1, Math.round(w)); s.height = Math.max(1, Math.round(h)); $('sfw_w').value = s.width; $('sfw_h').value = s.height; $('sfw_pct').value = Math.round(s.width / W * 100); this.update(); };
		$('sfw_w').addEventListener('change', (e) => size(parseFloat(e.target.value) || W, (parseFloat(e.target.value) || W) * H / W));
		$('sfw_h').addEventListener('change', (e) => size((parseFloat(e.target.value) || H) * W / H, parseFloat(e.target.value) || H));
		$('sfw_pct').addEventListener('change', (e) => { var p = (parseFloat(e.target.value) || 100) / 100; size(W * p, H * p); });
		el.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
			if (b.classList.contains('disabled')) return;
			s.view = b.dataset.view;
			el.querySelectorAll('[data-view]').forEach(x => x.classList.toggle('active', x === b));
			this.update();
		}));
		$('sfw_save').addEventListener('click', () => this.save());
		$('sfw_cancel').addEventListener('click', () => this.close());
		$('sfw_done').addEventListener('click', () => this.close());
		this.keys = (e) => {
			if (e.key == 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.close(); }
		};
		window.addEventListener('keydown', this.keys, true);
	}

	/**
	 * the image as it will be saved
	 */
	output() {
		var s = this.state;
		var c = document.createElement('canvas');
		c.width = s.width;
		c.height = s.height;
		var ctx = c.getContext('2d');
		if (s.format == 'JPEG' || !s.transparency) {
			ctx.fillStyle = s.matte;
			ctx.fillRect(0, 0, c.width, c.height);
		}
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(s.flat, 0, 0, c.width, c.height);
		return c;
	}

	encode(canvas) {
		var s = this.state;
		var c = canvas || this.output();
		if (s.format == 'GIF' || s.format == 'PNG-8') {
			var d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
			var q = quantize(d, c.width, c.height, { colors: s.colors, reduction: s.reduction, dither: s.dither_type == 'No Dither' ? 0 : s.dither, dither_type: s.dither_type, transparency: s.transparency });
			var bytes = s.format == 'GIF' ? encode_gif(q, c.width, c.height) : encode_png8(q, c.width, c.height);
			return Promise.resolve({ blob: new Blob([bytes], { type: s.format == 'GIF' ? 'image/gif' : 'image/png' }), canvas: c });
		}
		var type = s.format == 'JPEG' ? 'image/jpeg' : 'image/png';
		return new Promise((resolve) => c.toBlob((blob) => resolve({ blob: blob, canvas: c }), type, s.format == 'JPEG' ? Math.max(0.01, s.quality / 100) : undefined));
	}

	async update() {
		var s = this.state;
		var el = this.el;
		el.querySelector('.ps_sfw_jpeg').style.display = s.format == 'JPEG' ? '' : 'none';
		el.querySelector('.ps_sfw_png').style.display = s.format != 'JPEG' ? '' : 'none';
		el.querySelector('.ps_sfw_indexed').style.display = s.format == 'GIF' || s.format == 'PNG-8' ? '' : 'none';
		var token = this.token = {};
		var enc = await this.encode();
		if (token !== this.token || !this.el) return;
		var url = URL.createObjectURL(enc.blob);
		if (this.url) URL.revokeObjectURL(this.url);
		this.url = url;
		this.blob = enc.blob;
		var views = el.querySelector('.ps_sfw_views');
		var original_size = s.flat.width * s.flat.height * 3;
		var pane = (title, src, info) => '<div class="ps_sfw_pane"><div class="ps_sfw_img"><img src="' + src + '"></div><div class="ps_sfw_info"><b>' + title + '</b><span>' + info + '</span></div></div>';
		var orig = s.flat.toDataURL('image/png');
		var opt_info = s.format + (s.format == 'JPEG' ? ' ' + s.quality + ' quality' : '') + (s.format == 'GIF' || s.format == 'PNG-8' ? ' ' + s.colors + ' colors, ' + (s.dither_type == 'No Dither' ? 'no dither' : s.dither + '% dither') : '') + ' — ' + size_text(enc.blob.size);
		var html = '';
		if (s.view == 'Original') html = pane('Original: "' + app.GUI.Ps_workspace.document_name() + '"', orig, size_text(original_size));
		else if (s.view == 'Optimized') html = pane(s.format, url, opt_info);
		else html = pane('Original: "' + app.GUI.Ps_workspace.document_name() + '"', orig, size_text(original_size)) + pane(s.format, url, opt_info);
		views.innerHTML = html;
		views.className = 'ps_sfw_views view_' + s.view.replace('-', '');
	}

	async save() {
		var s = this.state;
		var base = app.GUI.Ps_workspace.document_name().replace(/\.[^.]+$/, '');
		var ext = s.format == 'JPEG' ? '.jpg' : (s.format == 'GIF' ? '.gif' : '.png');
		var a = document.createElement('a');
		var Slices = app.GUI.Ps_workspace.Slices;
		if (Slices && Slices.has()) {
			//CS6 HTML and Images: every slice optimized into images/, and a page that puts them together
			var full = this.output(), k = full.width / config.WIDTH;
			var files = [], cells = '';
			for (var sl of Slices.export_list()) {
				var r = sl.rect, sx = Math.round(r.x * k), sy = Math.round(r.y * k), sw = Math.max(1, Math.round(r.w * k)), sh = Math.max(1, Math.round(r.h * k));
				var piece = document.createElement('canvas');
				piece.width = sw;
				piece.height = sh;
				piece.getContext('2d').drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
				var enc_s = await this.encode(piece);
				files.push({ name: 'images/' + sl.name + ext, data: new Uint8Array(await enc_s.blob.arrayBuffer()) });
				var esc = (v) => String(v || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
				var img = '<img src="images/' + esc(sl.name) + ext + '" width="' + sw + '" height="' + sh + '" alt="' + esc(sl.alt) + '" style="position:absolute;left:' + sx + 'px;top:' + sy + 'px">';
				cells += '\t\t' + (sl.url ? '<a href="' + esc(sl.url) + '"' + (sl.target ? ' target="' + esc(sl.target) + '"' : '') + '>' + img + '</a>' : img) + '\n';
			}
			var html = '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>' + base + '</title>\n</head>\n<body style="margin:0">\n\t<div style="position:relative;width:' + full.width + 'px;height:' + full.height + 'px">\n' + cells + '\t</div>\n</body>\n</html>\n';
			files.unshift({ name: base + '.html', data: new TextEncoder().encode(html) });
			a.download = base + '.zip';
			a.href = URL.createObjectURL(make_zip(files));
			a.click();
			setTimeout(() => URL.revokeObjectURL(a.href), 5000);
			this.close();
			return;
		}
		var enc = await this.encode();
		a.download = base + ext;
		a.href = URL.createObjectURL(enc.blob);
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 5000);
		this.close();
	}

	close() {
		window.removeEventListener('keydown', this.keys, true);
		if (this.url) URL.revokeObjectURL(this.url);
		this.url = null;
		if (this.el) this.el.remove();
		this.el = null;
	}
}

export default Ps_save_for_web_class;
