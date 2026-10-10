/*
 * pshot - Photoshop CS6 Image Size and Canvas Size dialogs.
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import { scale_styles } from './styles.js';

const UNIT_PER_INCH = { inches: 1, cm: 2.54, mm: 25.4, points: 72, picas: 6 };

function fmt_size(w, h) {
	var bytes = w * h * 3;
	return bytes >= 1048576 ? (bytes / 1048576).toFixed(2).replace(/\.?0+$/, '') + 'M' : Math.round(bytes / 1024) + 'K';
}

function round3(v) {
	return Math.round(v * 1000) / 1000;
}

function resample(source, w, h, method) {
	w = Math.max(1, Math.round(w));
	h = Math.max(1, Math.round(h));
	var cur = source;
	if (method != 'Nearest Neighbor (preserve hard edges)') {
		//halve in steps when shrinking a lot, for quality
		while (cur.width / 2 >= w && cur.height / 2 >= h) {
			var half = document.createElement('canvas');
			half.width = Math.max(1, Math.round(cur.width / 2));
			half.height = Math.max(1, Math.round(cur.height / 2));
			var hctx = half.getContext('2d');
			hctx.imageSmoothingQuality = 'high';
			hctx.drawImage(cur, 0, 0, half.width, half.height);
			cur = half;
		}
	}
	var out = document.createElement('canvas');
	out.width = w;
	out.height = h;
	var ctx = out.getContext('2d');
	if (method == 'Nearest Neighbor (preserve hard edges)') {
		ctx.imageSmoothingEnabled = false;
	}
	else {
		ctx.imageSmoothingQuality = method == 'Bilinear' ? 'low' : 'high';
	}
	ctx.drawImage(cur, 0, 0, w, h);
	return out;
}

class Ps_size_dialogs_class {

	ppi() {
		var doc = app.GUI.Ps_workspace.Documents.current();
		return doc.ppi || 72;
	}

	// ---------- Image Size ----------

	image_size() {
		var W = config.WIDTH, H = config.HEIGHT;
		var state = { w: W, h: H, ppi: this.ppi(), constrain: true, resample: true, scale_styles: true, method: 'Bicubic Automatic', punit: 'pixels', dunit: 'inches' };
		var units = (list, sel) => list.map(u => '<option' + (u == sel ? ' selected' : '') + '>' + u + '</option>').join('');
		var methods = ['Bicubic Automatic', 'Nearest Neighbor (preserve hard edges)', 'Bilinear', 'Bicubic (smooth gradients)', 'Bicubic Smoother (enlargement)', 'Bicubic Sharper (reduction)'];
		var html = '<div class="ps_sz">'
			+ '<div class="ps_sz_head">Pixel Dimensions: <b id="is_px_size"></b></div>'
			+ '<div class="ps_sz_row"><label>Width:</label><input type="number" id="is_pw" step="any"><select id="is_punit">' + units(['pixels', 'percent'], 'pixels') + '</select><span class="ps_sz_link">&#8968;</span></div>'
			+ '<div class="ps_sz_row"><label>Height:</label><input type="number" id="is_ph" step="any"><select id="is_punit2">' + units(['pixels', 'percent'], 'pixels') + '</select><span class="ps_sz_link">&#8970;</span></div>'
			+ '<div class="ps_sz_head">Document Size:</div>'
			+ '<div class="ps_sz_row"><label>Width:</label><input type="number" id="is_dw" step="any"><select id="is_dunit">' + units(['percent', 'inches', 'cm', 'mm', 'points', 'picas'], 'inches') + '</select></div>'
			+ '<div class="ps_sz_row"><label>Height:</label><input type="number" id="is_dh" step="any"><select id="is_dunit2">' + units(['percent', 'inches', 'cm', 'mm', 'points', 'picas'], 'inches') + '</select></div>'
			+ '<div class="ps_sz_row"><label>Resolution:</label><input type="number" id="is_res" step="any"><select id="is_runit"><option>pixels/inch</option><option>pixels/cm</option></select></div>'
			+ '<label class="ps_sz_check"><input type="checkbox" id="is_styles" checked> Scale Styles</label>'
			+ '<label class="ps_sz_check"><input type="checkbox" id="is_constrain" checked> Constrain Proportions</label>'
			+ '<label class="ps_sz_check"><input type="checkbox" id="is_resample" checked> Resample Image:</label>'
			+ '<select id="is_method" class="ps_sz_method">' + units(methods, 'Bicubic Automatic') + '</select>'
			+ '</div>';
		var POP = new Dialog_class();
		POP.show({
			title: 'Image Size',
			params: [{ function() { return html; } }],
			on_finish: () => {
				if (state.resample) {
					this.apply_image_size(Math.round(state.w), Math.round(state.h), state.method, state.ppi, state.constrain && state.scale_styles);
				}
				else {
					//resolution only
					app.GUI.Ps_workspace.Documents.current().ppi = state.ppi;
				}
			},
		});
		var root = document.querySelector('#popups .popup .ps_sz');
		var $ = (id) => root.querySelector('#' + id);
		var to_doc = (px, unit) => unit == 'percent' ? px / (unit == 'percent' ? 1 : 1) : px / state.ppi * UNIT_PER_INCH[unit];
		var render = (skip) => {
			var pu = $('is_punit').value, du = $('is_dunit').value;
			if (skip != 'pw') $('is_pw').value = pu == 'percent' ? round3(state.w / W * 100) : Math.round(state.w);
			if (skip != 'ph') $('is_ph').value = pu == 'percent' ? round3(state.h / H * 100) : Math.round(state.h);
			if (skip != 'dw') $('is_dw').value = du == 'percent' ? round3(state.w / W * 100) : round3(state.w / state.ppi * UNIT_PER_INCH[du]);
			if (skip != 'dh') $('is_dh').value = du == 'percent' ? round3(state.h / H * 100) : round3(state.h / state.ppi * UNIT_PER_INCH[du]);
			if (skip != 'res') $('is_res').value = round3($('is_runit').value == 'pixels/cm' ? state.ppi / 2.54 : state.ppi);
			$('is_px_size').textContent = fmt_size(Math.round(state.w), Math.round(state.h)) + (state.w != W || state.h != H ? ' (was ' + fmt_size(W, H) + ')' : '');
			$('is_punit2').value = pu;
			$('is_dunit2').value = du;
			//Scale Styles needs Constrain Proportions (CS6)
			$('is_styles').disabled = !state.constrain || !state.resample;
		};
		var set_w = (w, skip) => {
			if (!(w > 0)) return;
			if (state.constrain) state.h = w * H / W;
			state.w = w;
			render(skip);
		};
		var set_h = (h, skip) => {
			if (!(h > 0)) return;
			if (state.constrain) state.w = h * W / H;
			state.h = h;
			render(skip);
		};
		$('is_pw').addEventListener('input', () => { var v = parseFloat($('is_pw').value); set_w($('is_punit').value == 'percent' ? W * v / 100 : v, 'pw'); });
		$('is_ph').addEventListener('input', () => { var v = parseFloat($('is_ph').value); set_h($('is_punit').value == 'percent' ? H * v / 100 : v, 'ph'); });
		$('is_dw').addEventListener('input', () => { var v = parseFloat($('is_dw').value); var du = $('is_dunit').value; set_w(du == 'percent' ? W * v / 100 : v / UNIT_PER_INCH[du] * state.ppi, 'dw'); });
		$('is_dh').addEventListener('input', () => { var v = parseFloat($('is_dh').value); var du = $('is_dunit').value; set_h(du == 'percent' ? H * v / 100 : v / UNIT_PER_INCH[du] * state.ppi, 'dh'); });
		$('is_res').addEventListener('input', () => {
			var v = parseFloat($('is_res').value);
			if (!(v > 0)) return;
			if ($('is_runit').value == 'pixels/cm') v *= 2.54;
			if (state.resample) {
				//pixel count follows the resolution, document size stays
				var inches_w = state.w / state.ppi, inches_h = state.h / state.ppi;
				state.ppi = v;
				state.w = inches_w * v;
				state.h = inches_h * v;
			}
			else {
				state.ppi = v;
			}
			render('res');
		});
		//the Width and Height unit menus are linked
		$('is_punit').addEventListener('change', () => render());
		$('is_dunit').addEventListener('change', () => render());
		$('is_punit2').addEventListener('change', () => { $('is_punit').value = $('is_punit2').value; render(); });
		$('is_dunit2').addEventListener('change', () => { $('is_dunit').value = $('is_dunit2').value; render(); });
		$('is_runit').addEventListener('change', () => render());
		$('is_styles').addEventListener('change', (e) => { state.scale_styles = e.target.checked; });
		$('is_constrain').addEventListener('change', (e) => { state.constrain = e.target.checked; render(); });
		$('is_resample').addEventListener('change', (e) => {
			state.resample = e.target.checked;
			$('is_method').disabled = !state.resample;
			$('is_pw').disabled = $('is_ph').disabled = !state.resample;
			if (!state.resample) {
				state.w = W;
				state.h = H;
				state.constrain = true;
				$('is_constrain').checked = true;
			}
			$('is_constrain').disabled = !state.resample;
			render();
		});
		$('is_method').addEventListener('change', (e) => { state.method = e.target.value; });
		render();
	}

	/**
	 * resample the whole document to w x h
	 */
	async apply_image_size(w, h, method, ppi, with_styles) {
		var W = config.WIDTH, H = config.HEIGHT;
		if (w == W && h == H) {
			app.GUI.Ps_workspace.Documents.current().ppi = ppi;
			return;
		}
		var sx = w / W, sy = h / H;
		var actions = [new app.Actions.Prepare_canvas_action('undo')];
		for (var layer of config.layers) {
			var settings = {};
			if (layer.x != null) settings.x = Math.round(layer.x * sx);
			if (layer.y != null) settings.y = Math.round(layer.y * sy);
			if (layer.width != null) settings.width = Math.max(1, layer.width * sx);
			if (layer.height != null) settings.height = Math.max(1, layer.height * sy);
			if (with_styles && layer.ps_styles) settings.ps_styles = scale_styles(layer.ps_styles, sx);
			if (layer.ps_mask) {
				settings.ps_mask = resample(layer.ps_mask, layer.ps_mask.width * sx, layer.ps_mask.height * sy, method);
				settings.ps_mask_x = Math.round(layer.ps_mask_x * sx);
				settings.ps_mask_y = Math.round(layer.ps_mask_y * sy);
			}
			if (layer.type == 'text' && layer.data) {
				var data = JSON.parse(JSON.stringify(layer.data));
				for (var line of data) {
					for (var span of line) {
						if (span.meta && span.meta.size) span.meta.size = Math.max(1, Math.round(span.meta.size * sx));
					}
				}
				settings.data = data;
			}
			if (layer.type == 'image' && layer.link) {
				var src = document.createElement('canvas');
				src.width = layer.width_original;
				src.height = layer.height_original;
				src.getContext('2d').drawImage(layer.link, 0, 0);
				var out = resample(src, layer.width * sx, layer.height * sy, method);
				settings.width = out.width;
				settings.height = out.height;
				settings.width_original = out.width;
				settings.height_original = out.height;
				actions.push(new app.Actions.Update_layer_action(layer.id, settings));
				actions.push(new app.Actions.Update_layer_image_action(out, layer.id));
				continue;
			}
			if (layer.type == 'ps_adjust') {
				settings.width = w;
				settings.height = h;
			}
			actions.push(new app.Actions.Update_layer_action(layer.id, settings));
		}
		var guides = config.guides.map(g => ({ x: g.x === null ? null : Math.round(g.x * sx), y: g.y === null ? null : Math.round(g.y * sy) }));
		actions.push(new app.Actions.Update_config_action({ WIDTH: w, HEIGHT: h, guides: guides }));
		actions.push(new app.Actions.Prepare_canvas_action('do'));
		app.GUI.Ps_workspace.Selection.set_mask_direct(null);
		await app.State.do_action(new app.Actions.Bundle_action('image_size', 'Image Size', actions));
		app.GUI.Ps_workspace.Documents.current().ppi = ppi;
		app.GUI.GUI_preview.zoom_auto(true);
		config.need_render = true;
	}

	// ---------- Canvas Size ----------

	canvas_size() {
		var W = config.WIDTH, H = config.HEIGHT;
		var ppi = this.ppi();
		var state = { w: W, h: H, unit: 'pixels', relative: false, ax: 0.5, ay: 0.5, ext: 'Background' };
		var units = ['pixels', 'percent', 'inches', 'cm', 'mm', 'points', 'picas'];
		var to_unit = (px, total) => state.unit == 'pixels' ? px : (state.unit == 'percent' ? round3(px / total * 100) : round3(px / ppi * UNIT_PER_INCH[state.unit]));
		var from_unit = (v, total) => state.unit == 'pixels' ? v : (state.unit == 'percent' ? total * v / 100 : v / UNIT_PER_INCH[state.unit] * ppi);
		var anchors = '';
		for (var y = 0; y < 3; y++) for (var x = 0; x < 3; x++) anchors += '<button type="button" class="ps_cs_anchor" data-ax="' + (x / 2) + '" data-ay="' + (y / 2) + '"></button>';
		var html = '<div class="ps_sz">'
			+ '<div class="ps_sz_head">Current Size: ' + fmt_size(W, H) + '</div>'
			+ '<div class="ps_sz_row ps_sz_info"><label>Width:</label><span>' + W + ' pixels</span></div>'
			+ '<div class="ps_sz_row ps_sz_info"><label>Height:</label><span>' + H + ' pixels</span></div>'
			+ '<div class="ps_sz_head">New Size: <b id="cs_size"></b></div>'
			+ '<div class="ps_sz_row"><label>Width:</label><input type="number" id="cs_w" step="any"><select id="cs_unit">' + units.map(u => '<option>' + u + '</option>').join('') + '</select></div>'
			+ '<div class="ps_sz_row"><label>Height:</label><input type="number" id="cs_h" step="any"></div>'
			+ '<label class="ps_sz_check"><input type="checkbox" id="cs_rel"> Relative</label>'
			+ '<div class="ps_sz_row"><label>Anchor:</label><div class="ps_cs_grid">' + anchors + '</div></div>'
			+ '<div class="ps_sz_row"><label>Canvas extension color:</label><select id="cs_ext"><option>Foreground</option><option selected>Background</option><option>White</option><option>Black</option><option>Gray</option></select></div>'
			+ '</div>';
		var POP = new Dialog_class();
		POP.show({
			title: 'Canvas Size',
			params: [{ function() { return html; } }],
			on_finish: () => {
				var colors = { Foreground: config.COLOR, Background: config.BG_COLOR, White: '#ffffff', Black: '#000000', Gray: '#808080' };
				this.apply_canvas_size(Math.max(1, Math.round(state.w)), Math.max(1, Math.round(state.h)), state.ax, state.ay, colors[state.ext]);
			},
		});
		var root = document.querySelector('#popups .popup .ps_sz');
		var $ = (id) => root.querySelector('#' + id);
		var render = (skip) => {
			if (skip != 'w') $('cs_w').value = state.relative ? to_unit(state.w - W, W) : to_unit(state.w, W);
			if (skip != 'h') $('cs_h').value = state.relative ? to_unit(state.h - H, H) : to_unit(state.h, H);
			$('cs_size').textContent = fmt_size(Math.round(state.w), Math.round(state.h));
			root.querySelectorAll('.ps_cs_anchor').forEach((b) => b.classList.toggle('active', b.dataset.ax == state.ax && b.dataset.ay == state.ay));
		};
		$('cs_w').addEventListener('input', () => { var v = parseFloat($('cs_w').value); if (isNaN(v)) return; state.w = state.relative ? W + from_unit(v, W) : from_unit(v, W); render('w'); });
		$('cs_h').addEventListener('input', () => { var v = parseFloat($('cs_h').value); if (isNaN(v)) return; state.h = state.relative ? H + from_unit(v, H) : from_unit(v, H); render('h'); });
		$('cs_unit').addEventListener('change', () => { state.unit = $('cs_unit').value; render(); });
		$('cs_rel').addEventListener('change', (e) => { state.relative = e.target.checked; render(); });
		$('cs_ext').addEventListener('change', (e) => { state.ext = e.target.value; });
		root.querySelectorAll('.ps_cs_anchor').forEach((b) => b.addEventListener('click', () => {
			state.ax = parseFloat(b.dataset.ax);
			state.ay = parseFloat(b.dataset.ay);
			render();
		}));
		render();
	}

	async apply_canvas_size(w, h, ax, ay, color) {
		var W = config.WIDTH, H = config.HEIGHT;
		if (w == W && h == H) return;
		var dx = Math.round((w - W) * ax), dy = Math.round((h - H) * ay);
		var sorted = app.Layers.get_sorted_layers();
		var bottom = sorted[sorted.length - 1];
		var actions = [new app.Actions.Prepare_canvas_action('undo')];
		for (var layer of config.layers) {
			var settings = {};
			if (layer.x != null) settings.x = layer.x + dx;
			if (layer.y != null) settings.y = layer.y + dy;
			if (layer.type == 'ps_adjust') {
				settings.x = 0;
				settings.y = 0;
				settings.width = w;
				settings.height = h;
			}
			var is_background = layer === bottom && layer.name == 'Background' && layer.type == 'image' && layer.link;
			if (is_background) {
				//the Background layer grows; new area gets the canvas extension color
				var bg = document.createElement('canvas');
				bg.width = w;
				bg.height = h;
				var bctx = bg.getContext('2d');
				bctx.fillStyle = color;
				bctx.fillRect(0, 0, w, h);
				bctx.drawImage(layer.link, layer.x + dx, layer.y + dy, layer.width, layer.height);
				actions.push(new app.Actions.Update_layer_action(layer.id, { x: 0, y: 0, width: w, height: h, width_original: w, height_original: h }));
				actions.push(new app.Actions.Update_layer_image_action(bg, layer.id));
				continue;
			}
			actions.push(new app.Actions.Update_layer_action(layer.id, settings));
		}
		var guides = config.guides.map(g => ({ x: g.x === null ? null : g.x + dx, y: g.y === null ? null : g.y + dy }));
		actions.push(new app.Actions.Update_config_action({ WIDTH: w, HEIGHT: h, guides: guides }));
		actions.push(new app.Actions.Prepare_canvas_action('do'));
		app.GUI.Ps_workspace.Selection.set_mask_direct(null);
		await app.State.do_action(new app.Actions.Bundle_action('canvas_size', 'Canvas Size', actions));
		app.GUI.GUI_preview.zoom_auto(true);
		config.need_render = true;
	}
}

export default Ps_size_dialogs_class;
