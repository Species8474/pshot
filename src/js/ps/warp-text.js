/*
 * pshot - CS6 Type > Warp Text: the text layer keeps its text and gets a warp
 * style (layer.ps_warp = { style, bend, h, v, vertical }) applied when rendered.
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import { warp_grid, draw_patch_exact, WARP_STYLES } from './transform.js';

class Ps_warp_text_class {

	active(layer) {
		var w = layer.ps_warp;
		return layer.type == 'text' && w && w.style && w.style != 'None' && WARP_STYLES[w.style];
	}

	/**
	 * render the warped text layer (document coordinates); cached per layer state
	 */
	render(ctx, layer) {
		var key = JSON.stringify([layer.params, layer.data, layer.x, layer.y, layer.width, layer.height, layer.rotate, layer.color, layer.ps_warp, config.WIDTH, config.HEIGHT]);
		if (!layer._ps_warp_cache || layer._ps_warp_cache.key != key) {
			layer._ps_warp_cache = { key: key, canvas: this.build(layer) };
		}
		if (layer._ps_warp_cache.canvas) ctx.drawImage(layer._ps_warp_cache.canvas, 0, 0);
	}

	build(layer) {
		var temp = document.createElement('canvas');
		temp.width = config.WIDTH;
		temp.height = config.HEIGHT;
		layer._ps_warping = true;
		try {
			app.Layers.render_object(temp.getContext('2d'), layer);
		} finally {
			layer._ps_warping = false;
		}
		var b = this.bounds(temp);
		if (!b) return null;
		var piece = document.createElement('canvas');
		piece.width = b.w;
		piece.height = b.h;
		piece.getContext('2d').drawImage(temp, -b.x, -b.y);
		var q = [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];
		var w = layer.ps_warp;
		var out = document.createElement('canvas');
		out.width = config.WIDTH;
		out.height = config.HEIGHT;
		var octx = out.getContext('2d');
		octx.imageSmoothingQuality = 'high';
		draw_patch_exact(octx, piece, warp_grid(q, w.style, w.bend, w.h, w.v, w.vertical));
		return out;
	}

	bounds(canvas) {
		var w = canvas.width, h = canvas.height, d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
		var minx = w, miny = h, maxx = -1, maxy = -1;
		for (var y = 0; y < h; y++) {
			for (var x = 0; x < w; x++) {
				if (d[(y * w + x) * 4 + 3]) {
					if (x < minx) minx = x;
					if (x > maxx) maxx = x;
					if (y < miny) miny = y;
					if (y > maxy) maxy = y;
				}
			}
		}
		return maxx < 0 ? null : { x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1 };
	}

	open() {
		var layer = config.layer;
		if (!layer || layer.type != 'text') {
			alertify.error('Could not complete the Warp Text command because the active layer is not a type layer.');
			return;
		}
		var original = layer.ps_warp ? Object.assign({}, layer.ps_warp) : null;
		var w = Object.assign({ style: 'None', bend: 50, h: 0, v: 0, vertical: false }, original || {});
		var styles = ['None'].concat(Object.keys(WARP_STYLES).filter(s => s != 'None'));
		var slider = (key, label) => '<div class="ps_adj_slider"><span>' + label + '</span><input type="number" id="wt_' + key + '_n" min="-100" max="100"><span class="ps_adj_unit">%</span><input type="range" id="wt_' + key + '" min="-100" max="100"></div>';
		var html = '<div class="ps_adj">'
			+ '<div class="ps_adj_row"><span>Style:</span><select id="wt_style">' + styles.map(s => '<option' + (s == w.style ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div>'
			+ '<div class="ps_adj_row"><label class="ps_adj_check"><input type="radio" name="wt_orient" value="h"' + (w.vertical ? '' : ' checked') + '> Horizontal</label>'
			+ '<label class="ps_adj_check"><input type="radio" name="wt_orient" value="v"' + (w.vertical ? ' checked' : '') + '> Vertical</label></div>'
			+ slider('bend', 'Bend:') + slider('h', 'Horizontal Distortion:') + slider('v', 'Vertical Distortion:') + '</div>';
		var preview = () => {
			layer.ps_warp = w.style == 'None' ? null : Object.assign({}, w);
			config.need_render = true;
		};
		var POP = new Dialog_class();
		POP.show({
			title: 'Warp Text',
			className: 'ps_adjust_dialog',
			params: [{ function() { return html; } }],
			on_finish: () => {
				layer.ps_warp = original;
				app.State.do_action(new app.Actions.Bundle_action('warp_text', 'Warp Text', [
					new app.Actions.Update_layer_action(layer.id, { ps_warp: w.style == 'None' ? null : Object.assign({}, w) }),
				]));
			},
			on_cancel: () => {
				layer.ps_warp = original;
				config.need_render = true;
			},
		});
		var root = document.querySelector('#popups .popup .ps_adj');
		var sync = () => {
			var off = w.style == 'None';
			['bend', 'h', 'v'].forEach((k) => {
				var r = root.querySelector('#wt_' + k), n = root.querySelector('#wt_' + k + '_n');
				r.value = n.value = w[k];
				r.disabled = n.disabled = off;
			});
			root.querySelectorAll('input[name="wt_orient"]').forEach(r => r.disabled = off);
		};
		['bend', 'h', 'v'].forEach((k) => {
			var r = root.querySelector('#wt_' + k), n = root.querySelector('#wt_' + k + '_n');
			var set = (v) => { if (isNaN(v)) return; w[k] = Math.max(-100, Math.min(100, v)); r.value = n.value = w[k]; preview(); };
			r.addEventListener('input', () => set(parseFloat(r.value)));
			n.addEventListener('change', () => set(parseFloat(n.value)));
		});
		root.querySelector('#wt_style').addEventListener('change', (e) => { w.style = e.target.value; sync(); preview(); });
		root.querySelectorAll('input[name="wt_orient"]').forEach(r => r.addEventListener('change', () => { w.vertical = r.value == 'v'; preview(); }));
		sync();
	}
}

export default Ps_warp_text_class;
