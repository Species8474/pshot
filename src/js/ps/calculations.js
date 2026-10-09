/*
 * pshot - CS6 Image > Calculations: blends two single channels (from the
 * merged image, a layer, its transparency, the selection or an alpha channel)
 * into a new alpha channel, a new document or a selection.
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';

const BLEND = {
	'Normal': (a, b) => a,
	'Darken': (a, b) => Math.min(a, b),
	'Multiply': (a, b) => a * b,
	'Color Burn': (a, b) => a <= 0 ? 0 : Math.max(0, 1 - (1 - b) / a),
	'Linear Burn': (a, b) => Math.max(0, a + b - 1),
	'Lighten': (a, b) => Math.max(a, b),
	'Screen': (a, b) => 1 - (1 - a) * (1 - b),
	'Color Dodge': (a, b) => a >= 1 ? 1 : Math.min(1, b / (1 - a)),
	'Linear Dodge (Add)': (a, b) => Math.min(1, a + b),
	'Overlay': (a, b) => b < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b),
	'Soft Light': (a, b) => a < 0.5 ? b - (1 - 2 * a) * b * (1 - b) : b + (2 * a - 1) * ((b < 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b)) - b),
	'Hard Light': (a, b) => a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b),
	'Vivid Light': (a, b) => a < 0.5 ? (a <= 0 ? 0 : Math.max(0, 1 - (1 - b) / (2 * a))) : (a >= 1 ? 1 : Math.min(1, b / (2 * (1 - a)))),
	'Linear Light': (a, b) => Math.max(0, Math.min(1, b + 2 * a - 1)),
	'Pin Light': (a, b) => a < 0.5 ? Math.min(b, 2 * a) : Math.max(b, 2 * a - 1),
	'Hard Mix': (a, b) => a + b >= 1 ? 1 : 0,
	'Difference': (a, b) => Math.abs(a - b),
	'Exclusion': (a, b) => a + b - 2 * a * b,
	'Subtract': (a, b) => Math.max(0, b - a),
	'Divide': (a, b) => a <= 0 ? 1 : Math.min(1, b / a),
};

class Ps_calculations_class {

	layers() {
		return app.GUI.Ps_workspace.Groups.ordered().filter(l => l.type == 'image' || l.type == 'text');
	}

	channels(layer_index) {
		var list = ['Red', 'Green', 'Blue', 'Gray'];
		if (layer_index > 0) list.push('Transparency');
		if (app.GUI.Ps_workspace.Selection.has()) list.push('Selection');
		return list.concat((config.ps_alpha || []).map(c => c.name));
	}

	/**
	 * source -> Float32Array of 0..1 values (document size)
	 */
	values(src) {
		var W = config.WIDTH, H = config.HEIGHT, n = W * H, out = new Float32Array(n);
		var alpha_list = config.ps_alpha || [];
		var alpha = alpha_list.find(c => c.name == src.channel);
		var data;
		if (src.channel == 'Selection' || alpha) {
			var m = src.channel == 'Selection' ? app.GUI.Ps_workspace.Selection.mask : alpha.mask;
			data = m.getContext('2d').getImageData(0, 0, W, H).data;
			for (var i = 0; i < n; i++) out[i] = data[i * 4 + 3] / 255;
		}
		else {
			var c = document.createElement('canvas');
			c.width = W;
			c.height = H;
			var ctx = c.getContext('2d', { willReadFrequently: true });
			if (src.layer == 0) {
				app.Layers.convert_layers_to_canvas(ctx, null, false);
			}
			else {
				var l = this.layers()[src.layer - 1];
				if (l) app.Layers.render_object(ctx, Object.assign(Object.create(Object.getPrototypeOf(l)), l, { visible: true, _ps_ignore_groups: true }));
			}
			data = ctx.getImageData(0, 0, W, H).data;
			var k = { Red: 0, Green: 1, Blue: 2 }[src.channel];
			for (var j = 0; j < n; j++) {
				var o = j * 4;
				if (src.channel == 'Transparency') out[j] = data[o + 3] / 255;
				else {
					//channels of a layer are composited over white like CS6
					var a = data[o + 3] / 255;
					var v = k != null ? data[o + k] : data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114;
					out[j] = (v * a + 255 * (1 - a)) / 255;
				}
			}
		}
		if (src.invert) for (var q = 0; q < n; q++) out[q] = 1 - out[q];
		return out;
	}

	compute(s) {
		var a = this.values(s.src1), b = this.values(s.src2), fn = BLEND[s.blend] || BLEND.Multiply, op = s.opacity / 100;
		var out = new Float32Array(a.length);
		for (var i = 0; i < a.length; i++) out[i] = b[i] + (fn(a[i], b[i]) - b[i]) * op;
		return out;
	}

	/**
	 * values -> canvas: gray pixels (document) or white with alpha (channel / selection)
	 */
	to_canvas(values, as_alpha) {
		var W = config.WIDTH, H = config.HEIGHT, c = document.createElement('canvas');
		c.width = W;
		c.height = H;
		var ctx = c.getContext('2d');
		var img = ctx.createImageData(W, H);
		for (var i = 0; i < values.length; i++) {
			var v = Math.round(values[i] * 255), o = i * 4;
			if (as_alpha) { img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = v; }
			else { img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255; }
		}
		ctx.putImageData(img, 0, 0);
		return c;
	}

	open() {
		var doc = app.GUI.Ps_workspace.document_name();
		var esc = app.GUI.Ps_workspace.Helper.escapeHtml;
		var layer_opts = ['Merged'].concat(this.layers().map(l => l.name));
		var source = (k, title) => '<div class="ps_adj_label">' + title + '</div>'
			+ '<div class="ps_adj_row"><span>Source:</span><select disabled><option>' + esc(doc) + '</option></select></div>'
			+ '<div class="ps_adj_row"><span>Layer:</span><select id="calc_' + k + '_layer">' + layer_opts.map((n, i) => '<option value="' + i + '">' + esc(n) + '</option>').join('') + '</select></div>'
			+ '<div class="ps_adj_row"><span>Channel:</span><select id="calc_' + k + '_channel"></select><label class="ps_adj_check"><input type="checkbox" id="calc_' + k + '_invert"> Invert</label></div>';
		var html = '<div class="ps_adj ps_calc"><div class="ps_calc_cols"><div>'
			+ source('1', 'Source 1') + source('2', 'Source 2')
			+ '<div class="ps_adj_row"><span>Blending:</span><select id="calc_blend">' + Object.keys(BLEND).map(m => '<option' + (m == 'Multiply' ? ' selected' : '') + '>' + m + '</option>').join('') + '</select></div>'
			+ '<div class="ps_adj_slider"><span>Opacity:</span><input type="number" id="calc_opacity_n" min="0" max="100" value="100"><span class="ps_adj_unit">%</span><input type="range" id="calc_opacity" min="0" max="100" value="100"></div>'
			+ '<label class="ps_adj_check"><input type="checkbox" disabled> Mask...</label>'
			+ '<div class="ps_adj_row"><span>Result:</span><select id="calc_result"><option>New Channel</option><option>New Document</option><option>Selection</option></select></div>'
			+ '</div><canvas id="calc_preview" class="ps_cr_preview" width="200" height="150"></canvas></div></div>';
		var s = { src1: { layer: 0, channel: 'Gray', invert: false }, src2: { layer: 0, channel: 'Gray', invert: false }, blend: 'Multiply', opacity: 100, result: 'New Channel' };
		var POP = new Dialog_class();
		POP.show({
			title: 'Calculations',
			className: 'ps_calc_dialog',
			params: [{ function() { return html; } }],
			on_finish: () => this.apply(s),
		});
		var root = document.querySelector('#popups .popup .ps_calc');
		var preview = root.querySelector('#calc_preview');
		var sc = Math.min(200 / config.WIDTH, 150 / config.HEIGHT);
		preview.width = Math.max(1, Math.round(config.WIDTH * sc));
		preview.height = Math.max(1, Math.round(config.HEIGHT * sc));
		var draw = () => {
			var c = this.to_canvas(this.compute(s), false);
			var pctx = preview.getContext('2d');
			pctx.imageSmoothingQuality = 'high';
			pctx.drawImage(c, 0, 0, preview.width, preview.height);
		};
		['1', '2'].forEach((k) => {
			var src = s['src' + k];
			var lsel = root.querySelector('#calc_' + k + '_layer'), csel = root.querySelector('#calc_' + k + '_channel');
			var fill = () => {
				var list = this.channels(src.layer);
				if (!list.includes(src.channel)) src.channel = 'Gray';
				csel.innerHTML = list.map(c => '<option' + (c == src.channel ? ' selected' : '') + '>' + esc(c) + '</option>').join('');
			};
			lsel.addEventListener('change', () => { src.layer = parseInt(lsel.value); fill(); draw(); });
			csel.addEventListener('change', () => { src.channel = csel.value; draw(); });
			root.querySelector('#calc_' + k + '_invert').addEventListener('change', (e) => { src.invert = e.target.checked; draw(); });
			fill();
		});
		root.querySelector('#calc_blend').addEventListener('change', (e) => { s.blend = e.target.value; draw(); });
		var r = root.querySelector('#calc_opacity'), n = root.querySelector('#calc_opacity_n');
		var set = (v) => { if (isNaN(v)) return; s.opacity = Math.max(0, Math.min(100, v)); r.value = n.value = s.opacity; draw(); };
		r.addEventListener('input', () => set(parseFloat(r.value)));
		n.addEventListener('change', () => set(parseFloat(n.value)));
		root.querySelector('#calc_result').addEventListener('change', (e) => { s.result = e.target.value; });
		draw();
	}

	async apply(s) {
		var values = this.compute(s);
		if (s.result == 'Selection') {
			var sel = app.GUI.Ps_workspace.Selection;
			return sel.commit(sel.combine(this.to_canvas(values, true), 'new'), 'Calculations');
		}
		if (s.result == 'New Channel') {
			var A = app.GUI.Ps_workspace.Alpha;
			var list = A.list().slice();
			list.push({ name: A.next_name(), mask: this.to_canvas(values, true) });
			return A.commit(list, list.length - 1, 'Calculations');
		}
		//New Document: a grayscale document of the same size
		var W = config.WIDTH, H = config.HEIGHT;
		var img = new Image();
		img.src = this.to_canvas(values, false).toDataURL();
		await img.decode();
		var docs = app.GUI.Ps_workspace.Documents;
		docs.add('Untitled-' + (docs.docs.length + 1));
		await app.State.do_action(new app.Actions.Bundle_action('calculations', 'Calculations', [
			new app.Actions.Prepare_canvas_action('undo'),
			new app.Actions.Update_config_action({ WIDTH: W, HEIGHT: H, ps_mode: 'Grayscale' }),
			new app.Actions.Reset_layers_action(),
			new app.Actions.Insert_layer_action({ type: 'image', name: 'Background', link: img, x: 0, y: 0, width: W, height: H, width_original: W, height_original: H }, false),
			new app.Actions.Prepare_canvas_action('do'),
		]));
	}
}

export default Ps_calculations_class;
