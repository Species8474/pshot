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
import Patterns from './../ps/patterns.js';

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

		var at = config.TOOL.attributes;
		if (mode == 'patch') {
			//Source: the selection is filled from where it was dragged to; Destination:
			//the selection's pixels go to where it was dragged to. Either way the
			//texture comes from one place and the tone from the edge of the other
			var dest = at.patch_dir == 'Destination';
			var from = (k) => (dest ? k : k + ldy * w + ldx), to = (k) => (dest ? k + ldy * w + ldx : k);
			var inside = (k, x, y) => { var tx = x + ldx, ty = y + ldy; return tx >= 0 && ty >= 0 && tx < w && ty < h; };
			var ms = [0, 0, 0], md = [0, 0, 0], n = 0;
			for (var y = 1; y < h - 1; y++) {
				for (var x = 1; x < w - 1; x++) {
					var i = y * w + x;
					if (m[i * 4 + 3] < 128) continue;
					var edge = m[(i - 1) * 4 + 3] < 128 || m[(i + 1) * 4 + 3] < 128 || m[(i - w) * 4 + 3] < 128 || m[(i + w) * 4 + 3] < 128;
					if (!edge || !inside(i, x, y)) continue;
					for (var c = 0; c < 3; c++) { md[c] += S[to(i) * 4 + c]; ms[c] += S[from(i) * 4 + c]; }
					n++;
				}
			}
			if (n) for (var c2 = 0; c2 < 3; c2++) { ms[c2] /= n; md[c2] /= n; }
			//Transparent: the texture is laid over what is there instead of replacing it
			var mix = at.patch_transparent ? 0.5 : 1;
			var band = at.patch_type == 'Content-Aware' ? new Uint8Array(w * h) : null;
			for (var y2 = 0; y2 < h; y2++) {
				for (var x2 = 0; x2 < w; x2++) {
					var k = y2 * w + x2;
					var alpha = m[k * 4 + 3] / 255;
					if (!alpha || !inside(k, x2, y2)) continue;
					var tk = to(k), fk = from(k);
					for (var c3 = 0; c3 < 3; c3++) {
						var healed = S[fk * 4 + c3] - ms[c3] + md[c3];
						O[tk * 4 + c3] = S[tk * 4 + c3] + (healed - S[tk * 4 + c3]) * alpha * mix;
					}
					//Content-Aware: the seam along the edge is rebuilt from both sides
					if (band && alpha < 1) band[tk] = 1;
					if (band && x2 > 0 && y2 > 0 && x2 < w - 1 && y2 < h - 1 && (m[(k - 1) * 4 + 3] < 128 || m[(k + 1) * 4 + 3] < 128 || m[(k - w) * 4 + 3] < 128 || m[(k + w) * 4 + 3] < 128)) {
						for (var by = -2; by <= 2; by++) for (var bx = -2; bx <= 2; bx++) {
							var bk = tk + by * w + bx;
							if (bk >= 0 && bk < w * h) band[bk] = 1;
						}
					}
				}
			}
			bctx.putImageData(out, 0, 0);
			if (band) inpaint(base, band);
			app.State.do_action(new app.Actions.Bundle_action('patch', 'Patch', [
				new app.Actions.Update_layer_image_action(base, layer.id),
			]));
			return;
		}

		//Content-Aware Move: lift the piece, fill the hole (Move; Extend keeps it), drop
		//the piece with its edge blended by the Adaptation
		var hole = new Uint8Array(w * h);
		for (var k2 = 0; k2 < w * h; k2++) {
			if (m[k2 * 4 + 3] > 127) hole[k2] = 1;
		}
		var piece = document.createElement('canvas');
		piece.width = w;
		piece.height = h;
		var pctx = piece.getContext('2d');
		if (at.sample_all) {
			//Sample All Layers: the piece comes from the merged image
			pctx.save();
			pctx.scale(sx, sy);
			pctx.translate(-layer.x, -layer.y);
			app.Layers.convert_layers_to_canvas(pctx, null, false);
			pctx.restore();
		}
		else {
			pctx.drawImage(base, 0, 0);
		}
		var feather = { 'Very Strict': 0, 'Strict': 1, 'Medium': 3, 'Loose': 6, 'Very Loose': 10 }[at.adaptation || 'Medium'];
		var pmask = mask;
		if (feather) {
			pmask = document.createElement('canvas');
			pmask.width = w;
			pmask.height = h;
			var pm = pmask.getContext('2d');
			pm.filter = 'blur(' + feather + 'px)';
			pm.drawImage(mask, 0, 0);
		}
		pctx.globalCompositeOperation = 'destination-in';
		pctx.drawImage(pmask, 0, 0);
		if (at.move_mode != 'Extend') inpaint(base, hole);
		bctx.drawImage(piece, ldx, ldy);
		var moved = document.createElement('canvas');
		moved.width = sel.mask.width;
		moved.height = sel.mask.height;
		moved.getContext('2d').drawImage(sel.mask, dx, dy);
		var label = at.move_mode == 'Extend' ? 'Content-Aware Extend' : 'Content-Aware Move';
		app.State.do_action(new app.Actions.Bundle_action('content_aware_move', label, [
			new app.Actions.Update_layer_image_action(base, layer.id),
		])).then(() => sel.commit(moved, label));
	}

	on_activate() {
		document.getElementById('main_wrapper').style.cursor = 'crosshair';
	}

	/**
	 * Use Pattern: the selection is healed from the pattern (texture) and its edge (tone)
	 */
	use_pattern() {
		var layer = config.layer, sel = this.selection();
		if (!layer || layer.type != 'image' || !sel.has()) return;
		var w = layer.width_original, h = layer.height_original;
		var base = document.createElement('canvas');
		base.width = w;
		base.height = h;
		var bctx = base.getContext('2d', { willReadFrequently: true });
		bctx.drawImage(layer.link, 0, 0);
		var m = sel.mask_for_layer(layer).getContext('2d').getImageData(0, 0, w, h).data;
		var P = Patterns.tiled(config.TOOL.attributes.pattern || Patterns.names()[0], w, h, 100, layer.x, layer.y).getContext('2d').getImageData(0, 0, w, h).data;
		var img = bctx.getImageData(0, 0, w, h), O = img.data;
		var ms = [0, 0, 0], md = [0, 0, 0], n = 0;
		for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
			var i = y * w + x;
			if (m[i * 4 + 3] < 128) continue;
			if (!(m[(i - 1) * 4 + 3] < 128 || m[(i + 1) * 4 + 3] < 128 || m[(i - w) * 4 + 3] < 128 || m[(i + w) * 4 + 3] < 128)) continue;
			for (var c = 0; c < 3; c++) { md[c] += O[i * 4 + c]; ms[c] += P[i * 4 + c]; }
			n++;
		}
		if (n) for (var c2 = 0; c2 < 3; c2++) { ms[c2] /= n; md[c2] /= n; }
		for (var k = 0; k < w * h; k++) {
			var a = m[k * 4 + 3] / 255;
			if (!a) continue;
			for (var c3 = 0; c3 < 3; c3++) O[k * 4 + c3] = O[k * 4 + c3] + (P[k * 4 + c3] - ms[c3] + md[c3] - O[k * 4 + c3]) * a;
		}
		bctx.putImageData(img, 0, 0);
		app.State.do_action(new app.Actions.Bundle_action('patch', 'Patch', [new app.Actions.Update_layer_image_action(base, layer.id)]));
	}
}

export default Ps_patch_class;
