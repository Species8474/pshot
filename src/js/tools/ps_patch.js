/*
 * pshot - CS6 Patch Tool and Content-Aware Move Tool.
 *
 * Both draw a freehand selection (like the Lasso) when there is none or when
 * dragging outside it. Dragging inside the selection:
 *   patch: the selected area is replaced by the pixels where it is dropped,
 *          shifted to the original area's tone (healing)
 *   cam:   the selected pixels move there; the hole they leave is filled
 *          from its surroundings
 */

import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import { inpaint } from './../ps/inpaint.js';

class Ps_patch_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.ctx = ctx;
		this.name = 'ps_patch';
		this.job = null;
		this.lasso = null;
	}

	selection() {
		return app.GUI.Ps_workspace.Selection;
	}

	world(e) {
		var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
		return app.Layers.get_world_coords(e.clientX - rect.left, e.clientY - rect.top);
	}

	inside_selection(p) {
		var sel = this.selection();
		if (!sel.has()) return false;
		var x = Math.floor(p.x), y = Math.floor(p.y);
		if (x < 0 || y < 0 || x >= sel.mask.width || y >= sel.mask.height) return false;
		return sel.mask.getContext('2d').getImageData(x, y, 1, 1).data[3] > 127;
	}

	load() {
		document.addEventListener('mousedown', (e) => {
			if (config.TOOL.name != this.name || e.button != 0) return;
			if (e.target.id != 'canvas_minipaint' && e.target.id != 'main_wrapper') return;
			var p = this.world(e);
			if (this.inside_selection(p) && config.layer.type == 'image' && config.layer.link) {
				this.job = { start: p, dx: 0, dy: 0 };
			}
			else {
				this.lasso = [p];
			}
			e.preventDefault();
		});
		document.addEventListener('mousemove', (e) => {
			if (config.TOOL.name != this.name) return;
			var p = this.world(e);
			if (this.lasso) {
				this.lasso.push(p);
				this.selection().set_preview({ type: 'lasso', points: this.lasso });
			}
			else if (this.job) {
				this.job.dx = Math.round(p.x - this.job.start.x);
				this.job.dy = Math.round(p.y - this.job.start.y);
				this.selection().offset = { x: this.job.dx, y: this.job.dy };
				this.selection().draw_overlay();
			}
		});
		document.addEventListener('mouseup', (e) => {
			if (config.TOOL.name != this.name) return;
			if (this.lasso) {
				var pts = this.lasso;
				this.lasso = null;
				this.selection().set_preview(null);
				if (pts.length > 2) {
					var op = e.shiftKey ? 'add' : (e.altKey ? 'subtract' : 'new');
					this.selection().select_polygon(pts, op, 0, this.config_mode() == 'cam' ? 'Content-Aware Move' : 'Patch Selection');
				}
				return;
			}
			if (this.job) {
				var job = this.job;
				this.job = null;
				this.selection().offset = null;
				this.selection().draw_overlay();
				if (job.dx || job.dy) {
					this.apply(job.dx, job.dy);
				}
			}
		});
	}

	config_mode() {
		return config.TOOL.attributes.mode || 'patch';
	}

	apply(dx, dy) {
		var layer = config.layer;
		var sel = this.selection();
		var w = layer.width_original, h = layer.height_original;
		var sx = w / layer.width, sy = h / layer.height;
		var ldx = Math.round(dx * sx), ldy = Math.round(dy * sy);
		var base = document.createElement('canvas');
		base.width = w;
		base.height = h;
		var bctx = base.getContext('2d', { willReadFrequently: true });
		bctx.drawImage(layer.link, 0, 0);
		var mask = sel.mask_for_layer(layer);
		var m = mask.getContext('2d').getImageData(0, 0, w, h).data;
		var src = bctx.getImageData(0, 0, w, h);
		var out = bctx.getImageData(0, 0, w, h);
		var S = src.data, O = out.data;
		var mode = this.config_mode();

		if (mode == 'patch') {
			//tone of the original area's edge vs the source area's edge
			var ms = [0, 0, 0], md = [0, 0, 0], n = 0;
			for (var y = 1; y < h - 1; y++) {
				for (var x = 1; x < w - 1; x++) {
					var i = y * w + x;
					var a = m[i * 4 + 3];
					if (a < 128) continue;
					var edge = m[(i - 1) * 4 + 3] < 128 || m[(i + 1) * 4 + 3] < 128 || m[(i - w) * 4 + 3] < 128 || m[(i + w) * 4 + 3] < 128;
					if (!edge) continue;
					var tx = x + ldx, ty = y + ldy;
					if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
					var j = (ty * w + tx) * 4;
					for (var c = 0; c < 3; c++) { md[c] += S[i * 4 + c]; ms[c] += S[j + c]; }
					n++;
				}
			}
			if (n) for (var c2 = 0; c2 < 3; c2++) { ms[c2] /= n; md[c2] /= n; }
			for (var y2 = 0; y2 < h; y2++) {
				for (var x2 = 0; x2 < w; x2++) {
					var k = y2 * w + x2;
					var alpha = m[k * 4 + 3] / 255;
					if (!alpha) continue;
					var tx2 = x2 + ldx, ty2 = y2 + ldy;
					if (tx2 < 0 || ty2 < 0 || tx2 >= w || ty2 >= h) continue;
					var j2 = (ty2 * w + tx2) * 4;
					for (var c3 = 0; c3 < 3; c3++) {
						var healed = S[j2 + c3] - ms[c3] + md[c3];
						O[k * 4 + c3] = S[k * 4 + c3] + (healed - S[k * 4 + c3]) * alpha;
					}
				}
			}
			bctx.putImageData(out, 0, 0);
			app.State.do_action(new app.Actions.Bundle_action('patch', 'Patch', [
				new app.Actions.Update_layer_image_action(base, layer.id),
			]));
			return;
		}

		//Content-Aware Move: lift the piece, fill the hole, drop the piece
		var hole = new Uint8Array(w * h);
		for (var k2 = 0; k2 < w * h; k2++) {
			if (m[k2 * 4 + 3] > 127) hole[k2] = 1;
		}
		var piece = document.createElement('canvas');
		piece.width = w;
		piece.height = h;
		var pctx = piece.getContext('2d');
		pctx.drawImage(base, 0, 0);
		pctx.globalCompositeOperation = 'destination-in';
		pctx.drawImage(mask, 0, 0);
		inpaint(base, hole);
		bctx.drawImage(piece, ldx, ldy);
		var moved = document.createElement('canvas');
		moved.width = sel.mask.width;
		moved.height = sel.mask.height;
		moved.getContext('2d').drawImage(sel.mask, dx, dy);
		app.State.do_action(new app.Actions.Bundle_action('content_aware_move', 'Content-Aware Move', [
			new app.Actions.Update_layer_image_action(base, layer.id),
		])).then(() => sel.commit(moved, 'Content-Aware Move'));
	}

	on_activate() {
		document.getElementById('main_wrapper').style.cursor = 'crosshair';
	}
}

export default Ps_patch_class;
