/*
 * pshot - CS6 Perspective Crop Tool (C): drag a box, move its corners onto the
 * edges of something seen in perspective, Enter crops the document to that
 * quad and straightens it into a rectangle (every layer, and masks).
 */

import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import zoomView from './../libs/zoomView.js';

/**
 * unit square -> quad (TL, TR, BR, BL)
 */
function homography(q) {
	var x0 = q[0].x, y0 = q[0].y, x1 = q[1].x, y1 = q[1].y, x2 = q[2].x, y2 = q[2].y, x3 = q[3].x, y3 = q[3].y;
	var dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
	var sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
	var g = 0, h = 0;
	if (sx != 0 || sy != 0) {
		var den = dx1 * dy2 - dx2 * dy1;
		g = (sx * dy2 - dx2 * sy) / den;
		h = (dx1 * sy - sx * dy1) / den;
	}
	var a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0;
	var d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
	return (u, v) => {
		var w = g * u + h * v + 1;
		return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w };
	};
}

class Ps_pcrop_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.ctx = ctx;
		this.name = 'ps_pcrop';
		this.quad = null;
		this.drag = null;
	}

	world(e) {
		var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
		return app.Layers.get_world_coords(e.clientX - rect.left, e.clientY - rect.top);
	}

	load() {
		var Selection = app.GUI.Ps_workspace.Selection;
		Selection.overlays = Selection.overlays || [];
		Selection.overlays.push({ active: () => !!this.quad && config.TOOL.name == this.name, draw: (ctx, scale) => this.draw(ctx, scale) });
		document.addEventListener('mousedown', (e) => {
			if (config.TOOL.name != this.name || config.space_hand || e.button != 0) return;
			if (e.target.id != 'canvas_minipaint' && e.target.id != 'main_wrapper') return;
			e.preventDefault();
			var p = this.world(e);
			var t = 8 / zoomView.getScale();
			var hit = this.quad ? this.quad.findIndex(c => Math.abs(c.x - p.x) <= t && Math.abs(c.y - p.y) <= t) : -1;
			if (hit >= 0) this.drag = { corner: hit };
			else if (this.quad && this.inside(p)) this.drag = { move: p, start: this.quad.map(c => ({ x: c.x, y: c.y })) };
			else this.drag = { create: p };
		});
		document.addEventListener('mousemove', (e) => {
			if (config.TOOL.name != this.name || !this.drag) return;
			var p = this.world(e), d = this.drag;
			if (d.create) {
				var x0 = Math.min(d.create.x, p.x), y0 = Math.min(d.create.y, p.y), x1 = Math.max(d.create.x, p.x), y1 = Math.max(d.create.y, p.y);
				this.quad = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
			}
			else if (d.corner != null) {
				this.quad[d.corner] = { x: p.x, y: p.y };
			}
			else if (d.move) {
				this.quad = d.start.map(c => ({ x: c.x + p.x - d.move.x, y: c.y + p.y - d.move.y }));
			}
			app.GUI.Ps_workspace.Selection.draw_overlay();
		});
		document.addEventListener('mouseup', () => {
			if (config.TOOL.name != this.name || !this.drag) return;
			this.drag = null;
			if (this.quad && Math.abs(this.quad[2].x - this.quad[0].x) < 2 && Math.abs(this.quad[2].y - this.quad[0].y) < 2) this.quad = null;
			app.GUI.Ps_workspace.Selection.draw_overlay();
		});
		window.addEventListener('keydown', (e) => {
			if (config.TOOL.name != this.name || !this.quad) return;
			if (e.key == 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); this.commit(); }
			else if (e.key == 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.quad = null; app.GUI.Ps_workspace.Selection.draw_overlay(); }
		}, true);
		document.addEventListener('dblclick', (e) => {
			if (config.TOOL.name == this.name && this.quad) this.commit();
		});
	}

	inside(p) {
		var q = this.quad, inside = false;
		for (var i = 0, j = 3; i < 4; j = i++) {
			if (((q[i].y > p.y) != (q[j].y > p.y)) && (p.x < (q[j].x - q[i].x) * (p.y - q[i].y) / (q[j].y - q[i].y) + q[i].x)) inside = !inside;
		}
		return inside;
	}

	draw(ctx, scale) {
		var q = this.quad;
		ctx.save();
		//shade outside the crop
		ctx.fillStyle = 'rgba(0,0,0,0.45)';
		ctx.beginPath();
		ctx.rect(-1e5, -1e5, 2e5, 2e5);
		ctx.moveTo(q[0].x, q[0].y);
		for (var i = 3; i >= 0; i--) ctx.lineTo(q[i].x, q[i].y);
		ctx.closePath();
		ctx.fill('evenodd');
		ctx.lineWidth = 1 / scale;
		ctx.strokeStyle = '#fff';
		ctx.beginPath();
		q.forEach((c, k) => k == 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y));
		ctx.closePath();
		ctx.stroke();
		//perspective grid
		var H = homography(q);
		if (config.TOOL.attributes.pc_grid === false) H = null;
		ctx.strokeStyle = 'rgba(255,255,255,0.5)';
		ctx.beginPath();
		for (var t = 1; H && t < 3; t++) {
			var a = H(t / 3, 0), b = H(t / 3, 1), c2 = H(0, t / 3), d = H(1, t / 3);
			ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
			ctx.moveTo(c2.x, c2.y); ctx.lineTo(d.x, d.y);
		}
		ctx.stroke();
		var s = 7 / scale;
		for (var c3 of q) {
			ctx.fillStyle = '#fff';
			ctx.strokeStyle = '#000';
			ctx.fillRect(c3.x - s / 2, c3.y - s / 2, s, s);
			ctx.strokeRect(c3.x - s / 2, c3.y - s / 2, s, s);
		}
		ctx.restore();
	}

	/**
	 * sample `src` (document-sized canvas) through the quad into a w x h canvas
	 */
	rectify(src, w, h, H) {
		var W = src.width, Hh = src.height;
		var sd = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, Hh).data;
		var out = new ImageData(w, h), o = out.data;
		for (var y = 0; y < h; y++) {
			for (var x = 0; x < w; x++) {
				var p = H((x + 0.5) / w, (y + 0.5) / h);
				var fx = p.x - 0.5, fy = p.y - 0.5;
				var ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
				if (ix < -1 || iy < -1 || ix >= W || iy >= Hh) continue;
				var k = (y * w + x) * 4;
				for (var c = 0; c < 4; c++) {
					var g = (xx, yy) => (xx < 0 || yy < 0 || xx >= W || yy >= Hh) ? 0 : sd[(yy * W + xx) * 4 + c];
					o[k + c] = (g(ix, iy) * (1 - tx) + g(ix + 1, iy) * tx) * (1 - ty) + (g(ix, iy + 1) * (1 - tx) + g(ix + 1, iy + 1) * tx) * ty;
				}
			}
		}
		var c2 = document.createElement('canvas');
		c2.width = w;
		c2.height = h;
		c2.getContext('2d').putImageData(out, 0, 0);
		return c2;
	}

	commit() {
		var q = this.quad;
		this.quad = null;
		var len = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
		var w = Math.max(1, Math.round((len(q[0], q[1]) + len(q[3], q[2])) / 2));
		var h = Math.max(1, Math.round((len(q[0], q[3]) + len(q[1], q[2])) / 2));
		//options bar W x H (x Resolution): the result's size
		var at = config.TOOL.attributes, ow = parseFloat(at.pc_w), oh = parseFloat(at.pc_h), res = parseFloat(at.pc_res);
		if (ow > 0 && oh > 0) {
			w = Math.round(ow);
			h = Math.round(oh);
		}
		var H = homography(q);
		var actions = [new app.Actions.Prepare_canvas_action('undo')];
		for (var layer of config.layers) {
			if (layer.type == null || layer.type == 'ps_group' || layer.type == 'ps_adjust') continue;
			var full = document.createElement('canvas');
			full.width = config.WIDTH;
			full.height = config.HEIGHT;
			if (layer.type == 'image' && layer.link) {
				full.getContext('2d').drawImage(layer.link, layer.x, layer.y, layer.width, layer.height);
			}
			else {
				//type and shape layers are rasterized by the crop
				full.getContext('2d').drawImage(app.Layers.convert_layer_to_canvas(layer.id, false, false), 0, 0);
			}
			var result = this.rectify(full, w, h, H);
			var settings = { type: 'image', x: 0, y: 0, width: w, height: h, width_original: w, height_original: h, rotate: 0 };
			if (layer.type != 'image') Object.assign(settings, { render_function: null, is_vector: false, params: {}, data: null });
			if (layer.ps_mask) {
				var mfull = document.createElement('canvas');
				mfull.width = config.WIDTH;
				mfull.height = config.HEIGHT;
				mfull.getContext('2d').drawImage(layer.ps_mask, layer.x - layer.ps_mask_x, layer.y - layer.ps_mask_y);
				Object.assign(settings, { ps_mask: this.rectify(mfull, w, h, H), ps_mask_x: 0, ps_mask_y: 0 });
			}
			actions.push(new app.Actions.Update_layer_action(layer.id, settings));
			actions.push(new app.Actions.Update_layer_image_action(result, layer.id));
		}
		actions.push(new app.Actions.Update_config_action({ WIDTH: w, HEIGHT: h }));
		actions.push(new app.Actions.Prepare_canvas_action('do'));
		if (res > 0) app.GUI.Ps_workspace.Documents.current().ppi = at.pc_res_unit == 'pixels/cm' ? res * 2.54 : res;
		app.State.do_action(new app.Actions.Bundle_action('perspective_crop', 'Perspective Crop', actions)).then(() => {
			app.GUI.GUI_preview.zoom_auto(true);
			app.GUI.Ps_workspace.Selection.draw_overlay();
		});
	}

	/**
	 * options bar: Front Image takes the document's size and resolution
	 */
	front_image() {
		var a = config.TOOL.attributes, doc = app.GUI.Ps_workspace.Documents.current();
		var ppi = doc && doc.ppi ? doc.ppi : 72;
		a.pc_w = config.WIDTH;
		a.pc_h = config.HEIGHT;
		a.pc_res = a.pc_res_unit == 'pixels/cm' ? Math.round(ppi / 2.54 * 1000) / 1000 : ppi;
		app.GUI.Ps_workspace.Options_bar.render();
	}

	clear_size() {
		var a = config.TOOL.attributes;
		a.pc_w = '';
		a.pc_h = '';
		a.pc_res = '';
		app.GUI.Ps_workspace.Options_bar.render();
	}

	swap_size() {
		var a = config.TOOL.attributes, w = a.pc_w;
		a.pc_w = a.pc_h;
		a.pc_h = w;
		app.GUI.Ps_workspace.Options_bar.render();
	}

	on_activate() {
		document.getElementById('main_wrapper').style.cursor = 'crosshair';
	}
}

export default Ps_pcrop_class;
