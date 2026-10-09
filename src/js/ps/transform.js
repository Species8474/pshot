/*
 * pshot - CS6 Free Transform (Ctrl+T).
 *
 * Pixel layers (or the selected pixels) are transformed as a raster piece;
 * vector/text layers get new x/y/width/height/rotate. Handles: drag inside =
 * move, handle = scale (Shift keeps proportions, Alt scales from the center),
 * outside the box = rotate (Shift snaps to 15 degrees). Enter / double-click
 * commits, Esc cancels.
 */

import app from './../app.js';
import config from './../config.js';
import zoomView from './../libs/zoomView.js';
import { ensure_pixel_layer } from './pixel-layer.js';
import { Base_action } from './../actions/base.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

const HANDLES = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];

class Set_mask_action extends Base_action {
	constructor(selection, mask) {
		super('ps_selection', 'Transform Selection');
		this.selection = selection;
		this.mask = mask;
		this.old = null;
	}
	async do() {
		super.do();
		this.old = this.selection.mask;
		this.selection.set_mask_direct(this.mask);
	}
	async undo() {
		super.undo();
		this.selection.set_mask_direct(this.old);
	}
}

function doc_canvas() {
	var c = document.createElement('canvas');
	c.width = config.WIDTH;
	c.height = config.HEIGHT;
	return c;
}

class Ps_transform_class {

	constructor() {
		this.job = null;
		this.drag = null;
		this.install();
	}

	active() {
		return this.job !== null;
	}

	selection() {
		return app.GUI.Ps_workspace.Selection;
	}

	// ---------- start ----------

	start() {
		if (this.job) {
			return;
		}
		var layer = config.layer;
		if (!layer || layer.type == null) {
			ensure_pixel_layer();
			layer = config.layer;
		}
		if (!layer || layer.type == null) {
			alertify.error('Could not complete the Free Transform command because the layer is empty.');
			return;
		}
		var sel = this.selection();
		if (layer.type == 'image') {
			this.start_pixels(layer, sel.has() ? sel : null);
		}
		else {
			this.start_vector(layer);
		}
		if (!this.job) {
			return;
		}
		app.GUI.Ps_workspace.status_message('Free Transform: drag handles to scale, outside to rotate. Enter commits, Esc cancels.');
		sel.decorate = (ctx, scale) => this.draw_box(ctx, scale);
		sel.draw_overlay();
	}

	start_pixels(layer, sel) {
		//everything in document space
		var full = doc_canvas();
		var fctx = full.getContext('2d');
		fctx.drawImage(layer.link, layer.x, layer.y, layer.width, layer.height);
		var bounds;
		var piece_src = doc_canvas();
		var pctx = piece_src.getContext('2d');
		pctx.drawImage(full, 0, 0);
		var hole = doc_canvas();
		var hctx = hole.getContext('2d');
		if (sel) {
			pctx.globalCompositeOperation = 'destination-in';
			pctx.drawImage(sel.mask, 0, 0);
			hctx.drawImage(full, 0, 0);
			hctx.globalCompositeOperation = 'destination-out';
			hctx.drawImage(sel.mask, 0, 0);
			bounds = sel.bounds;
		}
		else {
			bounds = this.alpha_bounds(full) || { x: 0, y: 0, width: config.WIDTH, height: config.HEIGHT };
		}
		if (!bounds) {
			return;
		}
		var piece = document.createElement('canvas');
		piece.width = bounds.width;
		piece.height = bounds.height;
		piece.getContext('2d').drawImage(piece_src, -bounds.x, -bounds.y);

		this.job = {
			kind: 'pixels',
			layer: layer,
			piece: piece,
			hole: hole,
			mask_piece: sel ? this.crop(sel.mask, bounds) : null,
			geometry: { x: layer.x, y: layer.y, width: layer.width, height: layer.height, width_original: layer.width_original, height_original: layer.height_original },
			box: { cx: bounds.x + bounds.width / 2, cy: bounds.y + bounds.height / 2, w: bounds.width, h: bounds.height, angle: 0 },
			w0: bounds.width,
			h0: bounds.height,
		};
		//preview: the layer temporarily covers the document and shows link_canvas
		Object.assign(layer, { x: 0, y: 0, width: config.WIDTH, height: config.HEIGHT, width_original: config.WIDTH, height_original: config.HEIGHT });
		this.preview();
	}

	start_vector(layer) {
		if (layer.width == null || layer.height == null) {
			alertify.error('This layer can not be transformed.');
			return;
		}
		var w = Math.abs(layer.width), h = Math.abs(layer.height);
		this.job = {
			kind: 'vector',
			layer: layer,
			original: { x: layer.x, y: layer.y, width: layer.width, height: layer.height, rotate: layer.rotate || 0 },
			box: { cx: layer.x + w / 2, cy: layer.y + h / 2, w: w, h: h, angle: (layer.rotate || 0) * Math.PI / 180 },
			w0: w,
			h0: h,
		};
	}

	crop(canvas, b) {
		var c = document.createElement('canvas');
		c.width = b.width;
		c.height = b.height;
		c.getContext('2d').drawImage(canvas, -b.x, -b.y);
		return c;
	}

	alpha_bounds(canvas) {
		var w = canvas.width, h = canvas.height;
		var d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
		var minx = w, miny = h, maxx = -1, maxy = -1;
		for (var y = 0; y < h; y++) {
			for (var x = 0; x < w; x++) {
				if (d[(y * w + x) * 4 + 3] > 0) {
					if (x < minx) minx = x;
					if (x > maxx) maxx = x;
					if (y < miny) miny = y;
					if (y > maxy) maxy = y;
				}
			}
		}
		return maxx < 0 ? null : { x: minx, y: miny, width: maxx - minx + 1, height: maxy - miny + 1 };
	}

	// ---------- rendering ----------

	draw_piece(ctx, piece) {
		var b = this.job.box;
		ctx.save();
		ctx.translate(b.cx, b.cy);
		ctx.rotate(b.angle);
		ctx.scale(b.w / this.job.w0, b.h / this.job.h0);
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(piece, -this.job.w0 / 2, -this.job.h0 / 2);
		ctx.restore();
	}

	result_canvas() {
		var out = doc_canvas();
		var ctx = out.getContext('2d');
		ctx.drawImage(this.job.hole, 0, 0);
		this.draw_piece(ctx, this.job.piece);
		return out;
	}

	preview() {
		var job = this.job;
		if (job.kind == 'pixels') {
			job.layer.link_canvas = this.result_canvas();
		}
		else {
			var b = job.box;
			job.layer.x = b.cx - b.w / 2;
			job.layer.y = b.cy - b.h / 2;
			job.layer.width = b.w;
			job.layer.height = b.h;
			job.layer.rotate = b.angle * 180 / Math.PI;
		}
		config.need_render = true;
		this.selection().draw_overlay();
	}

	corners() {
		var b = this.job.box;
		var cos = Math.cos(b.angle), sin = Math.sin(b.angle);
		return HANDLES.map(([hx, hy]) => {
			var lx = hx * b.w / 2, ly = hy * b.h / 2;
			return { x: b.cx + lx * cos - ly * sin, y: b.cy + lx * sin + ly * cos };
		});
	}

	draw_box(ctx, scale) {
		if (!this.job) {
			return;
		}
		var pts = this.corners();
		var corners = [pts[0], pts[2], pts[4], pts[6]];
		ctx.save();
		ctx.lineWidth = 1 / scale;
		ctx.strokeStyle = '#000';
		ctx.beginPath();
		corners.forEach((p, i) => i == 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
		ctx.closePath();
		ctx.stroke();
		var s = 7 / scale;
		for (var p of pts) {
			ctx.fillStyle = '#fff';
			ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
			ctx.strokeRect(p.x - s / 2, p.y - s / 2, s, s);
		}
		//reference point
		ctx.beginPath();
		ctx.arc(this.job.box.cx, this.job.box.cy, 3 / scale, 0, Math.PI * 2);
		ctx.stroke();
		ctx.restore();
	}

	// ---------- interaction ----------

	world(event) {
		var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
		return app.Layers.get_world_coords(event.clientX - rect.left, event.clientY - rect.top);
	}

	to_local(p) {
		var b = this.job.box;
		var dx = p.x - b.cx, dy = p.y - b.cy;
		var cos = Math.cos(-b.angle), sin = Math.sin(-b.angle);
		return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
	}

	hit(p) {
		var tol = 8 / zoomView.getScale();
		var pts = this.corners();
		for (var i = 0; i < pts.length; i++) {
			if (Math.abs(pts[i].x - p.x) <= tol && Math.abs(pts[i].y - p.y) <= tol) {
				return { mode: 'scale', handle: i };
			}
		}
		var l = this.to_local(p);
		var b = this.job.box;
		if (Math.abs(l.x) <= b.w / 2 && Math.abs(l.y) <= b.h / 2) {
			return { mode: 'move' };
		}
		return { mode: 'rotate' };
	}

	install() {
		var on_canvas = (e) => e.target.id == 'canvas_minipaint' || e.target.id == 'main_wrapper' || e.target.id == 'ps_selection_overlay';

		document.addEventListener('mousedown', (e) => {
			if (!this.job) return;
			if (!on_canvas(e)) {
				//clicking UI (menus, panels) keeps transforming, except the toolbox which commits (CS6 asks)
				if (e.target.closest && e.target.closest('#tools_container')) this.commit();
				return;
			}
			e.stopImmediatePropagation();
			e.preventDefault();
			var p = this.world(e);
			var h = this.hit(p);
			this.drag = Object.assign(h, { start: p, box: Object.assign({}, this.job.box) });
		}, true);

		document.addEventListener('mousemove', (e) => {
			if (!this.job) return;
			if (!this.drag) {
				if (on_canvas(e)) {
					var mode = this.hit(this.world(e)).mode;
					document.getElementById('main_wrapper').style.cursor = mode == 'move' ? 'move' : (mode == 'rotate' ? 'alias' : 'nwse-resize');
				}
				return;
			}
			e.stopImmediatePropagation();
			this.apply_drag(this.world(e), e);
			this.preview();
		}, true);

		document.addEventListener('mouseup', (e) => {
			if (!this.job || !this.drag) return;
			e.stopImmediatePropagation();
			this.drag = null;
		}, true);

		document.addEventListener('dblclick', (e) => {
			if (this.job && on_canvas(e)) {
				e.stopImmediatePropagation();
				this.commit();
			}
		}, true);

		window.addEventListener('keydown', (e) => {
			if (!this.job) return;
			if (e.key == 'Enter') {
				e.preventDefault();
				e.stopImmediatePropagation();
				this.commit();
			}
			else if (e.key == 'Escape') {
				e.preventDefault();
				e.stopImmediatePropagation();
				this.cancel();
			}
		}, true);
	}

	apply_drag(p, e) {
		var d = this.drag;
		var b = this.job.box;
		var start = d.box;
		if (d.mode == 'move') {
			b.cx = start.cx + (p.x - d.start.x);
			b.cy = start.cy + (p.y - d.start.y);
			return;
		}
		if (d.mode == 'rotate') {
			var a0 = Math.atan2(d.start.y - start.cy, d.start.x - start.cx);
			var a1 = Math.atan2(p.y - start.cy, p.x - start.cx);
			var angle = start.angle + (a1 - a0);
			if (e.shiftKey) {
				var step = Math.PI / 12;
				angle = Math.round(angle / step) * step;
			}
			b.angle = angle;
			return;
		}
		//scale: work in the box's local (unrotated) frame of the drag start
		var cos = Math.cos(-start.angle), sin = Math.sin(-start.angle);
		var dx = p.x - start.cx, dy = p.y - start.cy;
		var lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
		var hx = HANDLES[d.handle][0], hy = HANDLES[d.handle][1];
		var left = -start.w / 2, right = start.w / 2, top = -start.h / 2, bottom = start.h / 2;
		if (e.altKey) {
			//scale around the center
			if (hx != 0) { left = -Math.abs(lx); right = Math.abs(lx); }
			if (hy != 0) { top = -Math.abs(ly); bottom = Math.abs(ly); }
		}
		else {
			if (hx == -1) left = lx;
			if (hx == 1) right = lx;
			if (hy == -1) top = ly;
			if (hy == 1) bottom = ly;
		}
		var w = right - left, h = bottom - top;
		if (e.shiftKey && hx != 0 && hy != 0) {
			//keep proportions
			var ratio = start.w / start.h;
			if (Math.abs(w) / ratio > Math.abs(h)) {
				h = Math.sign(h || 1) * Math.abs(w) / ratio;
			}
			else {
				w = Math.sign(w || 1) * Math.abs(h) * ratio;
			}
			if (!e.altKey) {
				if (hx == -1) left = right - w; else right = left + w;
				if (hy == -1) top = bottom - h; else bottom = top + h;
			}
			else {
				left = -w / 2; right = w / 2; top = -h / 2; bottom = h / 2;
			}
		}
		if (Math.abs(w) < 1) w = w < 0 ? -1 : 1;
		if (Math.abs(h) < 1) h = h < 0 ? -1 : 1;
		var mx = (left + right) / 2, my = (top + bottom) / 2;
		var cosb = Math.cos(start.angle), sinb = Math.sin(start.angle);
		b.cx = start.cx + mx * cosb - my * sinb;
		b.cy = start.cy + mx * sinb + my * cosb;
		b.w = right - left;
		b.h = bottom - top;
		b.angle = start.angle;
	}

	// ---------- finish ----------

	cleanup() {
		var sel = this.selection();
		sel.decorate = null;
		sel.draw_overlay();
		document.getElementById('main_wrapper').style.cursor = '';
		this.job = null;
		this.drag = null;
		config.need_render = true;
	}

	cancel() {
		var job = this.job;
		if (!job) return;
		if (job.kind == 'pixels') {
			delete job.layer.link_canvas;
			Object.assign(job.layer, job.geometry);
		}
		else {
			Object.assign(job.layer, job.original);
		}
		this.cleanup();
	}

	commit() {
		var job = this.job;
		if (!job) return;
		var actions = [];
		if (job.kind == 'pixels') {
			var result = this.result_canvas();
			delete job.layer.link_canvas;
			Object.assign(job.layer, job.geometry);
			actions.push(new app.Actions.Update_layer_action(job.layer.id, {
				x: 0, y: 0, width: config.WIDTH, height: config.HEIGHT, width_original: config.WIDTH, height_original: config.HEIGHT,
			}));
			actions.push(new app.Actions.Update_layer_image_action(result, job.layer.id));
			if (job.mask_piece) {
				var mask = doc_canvas();
				this.draw_piece(mask.getContext('2d'), job.mask_piece);
				actions.push(new Set_mask_action(this.selection(), mask));
			}
		}
		else {
			var b = job.box;
			var settings = { x: b.cx - b.w / 2, y: b.cy - b.h / 2, width: b.w, height: b.h, rotate: b.angle * 180 / Math.PI };
			Object.assign(job.layer, job.original);
			actions.push(new app.Actions.Update_layer_action(job.layer.id, settings));
		}
		this.cleanup();
		app.State.do_action(new app.Actions.Bundle_action('free_transform', 'Free Transform', actions));
	}
}

export default Ps_transform_class;
