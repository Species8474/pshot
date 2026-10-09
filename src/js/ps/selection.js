/*
 * pshot - CS6 pixel selections.
 *
 * A selection is a document-sized mask canvas (white = selected, alpha =
 * strength). Shapes are combined with new / add / subtract / intersect.
 * Marching ants are drawn on an overlay canvas above the document, so they
 * can animate without re-rendering the document.
 */

import app from './../app.js';
import config from './../config.js';
import zoomView from './../libs/zoomView.js';
import { Base_action } from './../actions/base.js';

function new_canvas(w, h) {
	var canvas = document.createElement('canvas');
	canvas.width = Math.max(1, w);
	canvas.height = Math.max(1, h);
	return canvas;
}

function clone_canvas(canvas) {
	if (!canvas) {
		return null;
	}
	var copy = new_canvas(canvas.width, canvas.height);
	copy.getContext('2d').drawImage(canvas, 0, 0);
	return copy;
}

/**
 * undoable selection change (CS6 records selections in History)
 */
class Ps_selection_action extends Base_action {
	constructor(selection, new_mask, description) {
		super('ps_selection', description);
		this.selection = selection;
		this.new_mask = new_mask;
		this.old_mask = null;
		this.old_last = null;
	}
	async do() {
		super.do();
		this.old_mask = this.selection.mask;
		this.old_last = this.selection.last_mask;
		if (this.old_mask && !this.new_mask) {
			this.selection.last_mask = this.old_mask;
		}
		this.selection.set_mask_direct(this.new_mask);
	}
	async undo() {
		super.undo();
		this.selection.last_mask = this.old_last;
		this.selection.set_mask_direct(this.old_mask);
	}
}

class Ps_selection_class {

	constructor() {
		this.mask = null;
		this.last_mask = null;
		this.bounds = null;
		this.edges = null;
		this.phase = 0;
		this.preview = null; //{type, points|rect} while dragging
		this.overlay = null;
		this.offset = null;
		this.decorate = null;
		setInterval(() => {
			if (this.mask || this.preview) {
				this.phase = (this.phase + 1) % 8;
				this.draw_overlay();
			}
		}, 120);
	}

	// ---------- state ----------

	has() {
		return this.mask !== null;
	}

	state() {
		return { mask: this.mask, last_mask: this.last_mask };
	}

	restore(state) {
		this.last_mask = state ? state.last_mask : null;
		this.set_mask_direct(state ? state.mask : null);
	}

	set_mask_direct(mask) {
		this.mask = mask;
		this.update_bounds();
		this.edges = null;
		this.draw_overlay();
	}

	/**
	 * replace the selection through History
	 */
	commit(mask, description) {
		if (mask && this.is_empty(mask)) {
			mask = null;
		}
		if (!mask && !this.mask) {
			return;
		}
		return app.State.do_action(new Ps_selection_action(this, mask, description));
	}

	is_empty(mask) {
		var data = mask.getContext('2d').getImageData(0, 0, mask.width, mask.height).data;
		for (var i = 3; i < data.length; i += 4) {
			if (data[i] > 0) {
				return false;
			}
		}
		return true;
	}

	update_bounds() {
		this.bounds = null;
		if (!this.mask) {
			return;
		}
		var w = this.mask.width;
		var h = this.mask.height;
		var data = this.mask.getContext('2d').getImageData(0, 0, w, h).data;
		var minx = w, miny = h, maxx = -1, maxy = -1;
		for (var y = 0; y < h; y++) {
			for (var x = 0; x < w; x++) {
				if (data[(y * w + x) * 4 + 3] > 0) {
					if (x < minx) minx = x;
					if (x > maxx) maxx = x;
					if (y < miny) miny = y;
					if (y > maxy) maxy = y;
				}
			}
		}
		if (maxx >= 0) {
			this.bounds = { x: minx, y: miny, width: maxx - minx + 1, height: maxy - miny + 1 };
		}
	}

	// ---------- building masks ----------

	shape_mask(draw) {
		var mask = new_canvas(config.WIDTH, config.HEIGHT);
		var ctx = mask.getContext('2d');
		ctx.fillStyle = '#fff';
		draw(ctx);
		return mask;
	}

	/**
	 * combine a new shape mask with the current selection
	 * op: 'new' | 'add' | 'subtract' | 'intersect'
	 */
	combine(shape, op) {
		if (op == 'new' || !this.mask) {
			//subtracting/intersecting with nothing selected leaves nothing selected
			return (op == 'subtract' || op == 'intersect') && op != 'new' ? null : shape;
		}
		var result = clone_canvas(this.mask);
		var ctx = result.getContext('2d');
		ctx.globalCompositeOperation = op == 'add' ? 'source-over' : (op == 'subtract' ? 'destination-out' : 'destination-in');
		ctx.drawImage(shape, 0, 0);
		return result;
	}

	select_rect(x, y, w, h, op, ellipse, feather, description) {
		var shape = this.shape_mask((ctx) => {
			if (ellipse) {
				ctx.beginPath();
				ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
				ctx.fill();
			}
			else {
				ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
			}
		});
		return this.commit(this.feather_mask(this.combine(shape, op), feather), description);
	}

	select_polygon(points, op, feather, description) {
		if (points.length < 3) {
			return;
		}
		var shape = this.shape_mask((ctx) => {
			ctx.beginPath();
			ctx.moveTo(points[0].x, points[0].y);
			for (var p of points) {
				ctx.lineTo(p.x, p.y);
			}
			ctx.closePath();
			ctx.fill();
		});
		return this.commit(this.feather_mask(this.combine(shape, op), feather), description);
	}

	/**
	 * Magic Wand: flood/global color match on the active layer (or all layers)
	 */
	sample_source(sample_all) {
		var source;
		if (sample_all) {
			source = new_canvas(config.WIDTH, config.HEIGHT);
			app.Layers.convert_layers_to_canvas(source.getContext('2d'), null, false);
		}
		else {
			source = app.Layers.convert_layer_to_canvas(config.layer.id, false, false);
		}
		return source.getContext('2d').getImageData(0, 0, config.WIDTH, config.HEIGHT).data;
	}

	/**
	 * pixels similar to (px,py) as a 0/255 mask array; limit = {x0,y0,x1,y1} optional
	 */
	flood(src, px, py, tolerance, contiguous, limit, out) {
		var w = config.WIDTH, h = config.HEIGHT;
		px = Math.floor(px);
		py = Math.floor(py);
		if (px < 0 || py < 0 || px >= w || py >= h) {
			return out;
		}
		var x0 = limit ? Math.max(0, limit.x0) : 0, y0 = limit ? Math.max(0, limit.y0) : 0;
		var x1 = limit ? Math.min(w - 1, limit.x1) : w - 1, y1 = limit ? Math.min(h - 1, limit.y1) : h - 1;
		var i0 = (py * w + px) * 4;
		var r0 = src[i0], g0 = src[i0 + 1], b0 = src[i0 + 2], a0 = src[i0 + 3];
		var match = (i) => Math.abs(src[i] - r0) <= tolerance && Math.abs(src[i + 1] - g0) <= tolerance
			&& Math.abs(src[i + 2] - b0) <= tolerance && Math.abs(src[i + 3] - a0) <= tolerance;
		out = out || new Uint8Array(w * h);
		if (contiguous) {
			var seen = new Uint8Array(w * h);
			var stack = [px, py];
			while (stack.length) {
				var y = stack.pop();
				var x = stack.pop();
				var idx = y * w + x;
				if (seen[idx]) continue;
				seen[idx] = 1;
				if (!match(idx * 4)) continue;
				out[idx] = 255;
				if (x > x0) stack.push(x - 1, y);
				if (x < x1) stack.push(x + 1, y);
				if (y > y0) stack.push(x, y - 1);
				if (y < y1) stack.push(x, y + 1);
			}
		}
		else {
			for (var yy = y0; yy <= y1; yy++) {
				for (var xx = x0; xx <= x1; xx++) {
					var j = yy * w + xx;
					if (match(j * 4)) out[j] = 255;
				}
			}
		}
		return out;
	}

	array_to_mask(arr) {
		var w = config.WIDTH, h = config.HEIGHT;
		var shape = new_canvas(w, h);
		var sctx = shape.getContext('2d');
		var img = sctx.createImageData(w, h);
		for (var i = 0; i < arr.length; i++) {
			if (arr[i]) {
				img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
				img.data[i * 4 + 3] = arr[i];
			}
		}
		sctx.putImageData(img, 0, 0);
		return shape;
	}

	/**
	 * Magic Wand: flood/global color match on the active layer (or all layers)
	 */
	select_color(px, py, tolerance, contiguous, sample_all, op, description) {
		var src = this.sample_source(sample_all);
		var arr = this.flood(src, px, py, tolerance, contiguous, null, null);
		return this.commit(this.combine(this.array_to_mask(arr), op), description);
	}

	feather_mask(mask, radius) {
		radius = parseFloat(radius) || 0;
		if (!mask || radius <= 0) {
			return mask;
		}
		var out = new_canvas(mask.width, mask.height);
		var ctx = out.getContext('2d');
		ctx.filter = 'blur(' + (radius / 2) + 'px)';
		ctx.drawImage(mask, 0, 0);
		return out;
	}

	// ---------- Select menu ----------

	select_all() {
		return this.commit(this.shape_mask((ctx) => ctx.fillRect(0, 0, config.WIDTH, config.HEIGHT)), 'Select All');
	}

	deselect() {
		return this.commit(null, 'Deselect');
	}

	reselect() {
		if (!this.last_mask || this.mask) {
			return;
		}
		return this.commit(clone_canvas(this.last_mask), 'Reselect');
	}

	inverse() {
		if (!this.mask) {
			return;
		}
		var out = this.shape_mask((ctx) => ctx.fillRect(0, 0, config.WIDTH, config.HEIGHT));
		var ctx = out.getContext('2d');
		ctx.globalCompositeOperation = 'destination-out';
		ctx.drawImage(this.mask, 0, 0);
		return this.commit(out, 'Inverse');
	}

	modify(kind, amount) {
		if (!this.mask) {
			return;
		}
		amount = Math.max(0, parseFloat(amount) || 0);
		if (kind == 'feather') {
			return this.commit(this.feather_mask(this.mask, amount), 'Feather');
		}
		//expand / contract / border via morphology on the alpha channel
		var w = this.mask.width, h = this.mask.height;
		var data = this.mask.getContext('2d').getImageData(0, 0, w, h).data;
		var inside = new Uint8Array(w * h);
		for (var i = 0; i < w * h; i++) inside[i] = data[i * 4 + 3] > 127 ? 1 : 0;
		var outside = new Uint8Array(w * h);
		for (var o = 0; o < w * h; o++) outside[o] = 1 - inside[o];
		//distance to the selection (expand) or to the outside (contract, border)
		var dist = this.distance(kind == 'expand' ? inside : outside, w, h);
		var out = new_canvas(w, h);
		var octx = out.getContext('2d');
		var img = octx.createImageData(w, h);
		var r = Math.round(amount);
		for (var j = 0; j < w * h; j++) {
			var sel;
			if (kind == 'expand') sel = dist[j] <= r;
			else if (kind == 'contract') sel = inside[j] && dist[j] > r;
			else sel = inside[j] && dist[j] <= r; //border: band inside the edge
			if (sel) {
				img.data[j * 4] = img.data[j * 4 + 1] = img.data[j * 4 + 2] = img.data[j * 4 + 3] = 255;
			}
		}
		octx.putImageData(img, 0, 0);
		var labels = { expand: 'Expand', contract: 'Contract', border: 'Border' };
		return this.commit(out, labels[kind]);
	}

	/**
	 * chessboard distance from every pixel to the nearest seed pixel
	 */
	distance(seeds, w, h) {
		var INF = 1e9;
		var d = new Float32Array(w * h);
		for (var i = 0; i < w * h; i++) d[i] = seeds[i] ? 0 : INF;
		for (var y = 0; y < h; y++) {
			for (var x = 0; x < w; x++) {
				var a = y * w + x;
				if (x > 0) d[a] = Math.min(d[a], d[a - 1] + 1);
				if (y > 0) d[a] = Math.min(d[a], d[a - w] + 1);
				if (x > 0 && y > 0) d[a] = Math.min(d[a], d[a - w - 1] + 1);
				if (x < w - 1 && y > 0) d[a] = Math.min(d[a], d[a - w + 1] + 1);
			}
		}
		for (var y2 = h - 1; y2 >= 0; y2--) {
			for (var x2 = w - 1; x2 >= 0; x2--) {
				var b = y2 * w + x2;
				if (x2 < w - 1) d[b] = Math.min(d[b], d[b + 1] + 1);
				if (y2 < h - 1) d[b] = Math.min(d[b], d[b + w] + 1);
				if (x2 < w - 1 && y2 < h - 1) d[b] = Math.min(d[b], d[b + w + 1] + 1);
				if (x2 > 0 && y2 < h - 1) d[b] = Math.min(d[b], d[b + w - 1] + 1);
			}
		}
		return d;
	}

	// ---------- applying the selection to pixels ----------

	/**
	 * multiplies a document-sized canvas by the selection (in place)
	 */
	clip_document_canvas(canvas) {
		if (!this.mask) {
			return canvas;
		}
		var ctx = canvas.getContext('2d');
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.globalCompositeOperation = 'destination-in';
		ctx.drawImage(this.mask, 0, 0);
		ctx.restore();
		return canvas;
	}

	/**
	 * the selection mask mapped into a layer's own pixel space
	 */
	mask_for_layer(layer) {
		var out = new_canvas(layer.width_original, layer.height_original);
		var ctx = out.getContext('2d');
		var sx = layer.width_original / layer.width;
		var sy = layer.height_original / layer.height;
		ctx.setTransform(sx, 0, 0, sy, -layer.x * sx, -layer.y * sy);
		ctx.drawImage(this.mask, 0, 0);
		return out;
	}

	/**
	 * a pixel tool produced `canvas` (layer pixel space) for `layer`: keep the
	 * original pixels outside the selection (CS6 tools only change selected pixels)
	 */
	restrict(canvas, layer) {
		if (!this.mask || !layer || !layer.link) {
			return canvas;
		}
		var mask = this.mask_for_layer(layer);
		var inside = new_canvas(canvas.width, canvas.height);
		var ictx = inside.getContext('2d');
		ictx.drawImage(canvas, 0, 0);
		ictx.globalCompositeOperation = 'destination-in';
		ictx.drawImage(mask, 0, 0);
		var out = new_canvas(canvas.width, canvas.height);
		var octx = out.getContext('2d');
		octx.drawImage(layer.link, 0, 0);
		octx.globalCompositeOperation = 'destination-out';
		octx.drawImage(mask, 0, 0);
		octx.globalCompositeOperation = 'source-over';
		octx.drawImage(inside, 0, 0);
		return out;
	}

	// ---------- marching ants ----------

	compute_edges() {
		var w = this.mask.width, h = this.mask.height;
		var data = this.mask.getContext('2d').getImageData(0, 0, w, h).data;
		var edges = [];
		var on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 127;
		for (var y = 0; y < h; y++) {
			for (var x = 0; x < w; x++) {
				if (on(x, y) && (!on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1))) {
					edges.push(x, y);
				}
			}
		}
		this.edges = { points: edges, w: w, h: h, frames: [] };
	}

	edge_frame(phase) {
		var e = this.edges;
		if (e.frames[phase]) {
			return e.frames[phase];
		}
		var canvas = new_canvas(e.w, e.h);
		var ctx = canvas.getContext('2d');
		var img = ctx.createImageData(e.w, e.h);
		for (var i = 0; i < e.points.length; i += 2) {
			var x = e.points[i], y = e.points[i + 1];
			var k = (y * e.w + x) * 4;
			var dark = (((x + y + phase) >> 2) & 1) == 0;
			var v = dark ? 0 : 255;
			img.data[k] = img.data[k + 1] = img.data[k + 2] = v;
			img.data[k + 3] = 255;
		}
		ctx.putImageData(img, 0, 0);
		e.frames[phase] = canvas;
		return canvas;
	}

	get_overlay() {
		var main = document.getElementById('canvas_minipaint');
		if (!this.overlay) {
			this.overlay = document.createElement('canvas');
			this.overlay.id = 'ps_selection_overlay';
			document.getElementById('canvas_wrapper').appendChild(this.overlay);
		}
		if (this.overlay.width != main.width || this.overlay.height != main.height) {
			this.overlay.width = main.width;
			this.overlay.height = main.height;
		}
		return this.overlay;
	}

	draw_overlay() {
		var main = document.getElementById('canvas_minipaint');
		if (!main) {
			return;
		}
		var overlay = this.get_overlay();
		var ctx = overlay.getContext('2d');
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, overlay.width, overlay.height);
		if (!this.mask && !this.preview && !this.decorate && !this.quick_preview) {
			return;
		}
		var m = zoomView.matrix;
		ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
		if (this.offset) {
			//selection being dragged with the Move tool
			ctx.translate(this.offset.x, this.offset.y);
		}
		ctx.imageSmoothingEnabled = false;
		if (this.mask) {
			if (!this.edges || this.edges.w != this.mask.width) {
				this.compute_edges();
			}
			ctx.drawImage(this.edge_frame(this.phase), 0, 0);
		}
		if (this.preview) {
			this.draw_preview(ctx, m[0]);
		}
		if (this.quick_preview) {
			ctx.globalAlpha = 0.35;
			ctx.drawImage(this.quick_preview, 0, 0);
			ctx.globalAlpha = 1;
		}
		if (this.decorate) {
			//Free Transform box (drawn in document space, not offset)
			ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
			this.decorate(ctx, m[0]);
		}
	}

	draw_preview(ctx, scale) {
		var p = this.preview;
		ctx.lineWidth = 1 / scale;
		var path = () => {
			ctx.beginPath();
			if (p.type == 'rect') {
				ctx.rect(p.x, p.y, p.w, p.h);
			}
			else if (p.type == 'ellipse') {
				ctx.ellipse(p.x + p.w / 2, p.y + p.h / 2, Math.abs(p.w / 2), Math.abs(p.h / 2), 0, 0, Math.PI * 2);
			}
			else {
				var pts = p.points;
				if (pts.length) {
					ctx.moveTo(pts[0].x, pts[0].y);
					for (var q of pts) ctx.lineTo(q.x, q.y);
					if (p.cursor) ctx.lineTo(p.cursor.x, p.cursor.y);
				}
			}
		};
		path();
		ctx.setLineDash([]);
		ctx.strokeStyle = '#fff';
		ctx.stroke();
		path();
		ctx.setLineDash([4 / scale, 4 / scale]);
		ctx.lineDashOffset = -this.phase / scale;
		ctx.strokeStyle = '#000';
		ctx.stroke();
		ctx.setLineDash([]);
	}

	set_preview(preview) {
		this.preview = preview;
		this.draw_overlay();
	}
}

export default Ps_selection_class;
