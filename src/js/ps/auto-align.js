/*
 * pshot - CS6 Edit > Auto-Align Layers (Auto / Reposition: the layers are
 * moved onto the reference layer by a coarse-to-fine search of the best
 * offset) and Edit > Auto-Blend Layers (Panorama: seams through the middle of
 * the overlaps; Stack Images: each pixel from the sharpest layer). Auto-Blend
 * gives every layer a layer mask, as CS6 does.
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

/**
 * the layer's pixels in document space -> { gray: Float32Array, alpha: Uint8Array } at scale k
 */
function sample_layer(layer, k) {
	var w = Math.max(1, Math.round(config.WIDTH * k)), h = Math.max(1, Math.round(config.HEIGHT * k));
	var c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	var ctx = c.getContext('2d', { willReadFrequently: true });
	ctx.scale(k, k);
	var plain = Object.assign(Object.create(Object.getPrototypeOf(layer)), layer, { ps_mask: null, ps_styles: null, opacity: 100, visible: true });
	app.Layers.render_object(ctx, plain);
	var d = ctx.getImageData(0, 0, w, h).data;
	var gray = new Float32Array(w * h), alpha = new Uint8Array(w * h);
	for (var i = 0; i < w * h; i++) {
		gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
		alpha[i] = d[i * 4 + 3];
	}
	return { w: w, h: h, gray: gray, alpha: alpha };
}

/**
 * an image's own pixels ({ link, width, height }) at scale k -> { w, h, gray, alpha }
 */
function sample_local(item, k) {
	var w = Math.max(1, Math.round(item.width * k)), h = Math.max(1, Math.round(item.height * k));
	var c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	var ctx = c.getContext('2d', { willReadFrequently: true });
	ctx.drawImage(item.link, 0, 0, w, h);
	var d = ctx.getImageData(0, 0, w, h).data;
	var gray = new Float32Array(w * h), alpha = new Uint8Array(w * h);
	for (var i = 0; i < w * h; i++) {
		gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
		alpha[i] = d[i * 4 + 3];
	}
	return { w: w, h: h, gray: gray, alpha: alpha };
}

/**
 * mean absolute difference with `mov` placed at (dx, dy) in `ref` coordinates, over the overlap
 */
function cost(ref, mov, dx, dy, step) {
	var x0 = Math.max(0, dx), y0 = Math.max(0, dy), x1 = Math.min(ref.w, dx + mov.w), y1 = Math.min(ref.h, dy + mov.h);
	if (x1 <= x0 || y1 <= y0) return Infinity;
	var sum = 0, n = 0;
	for (var y = y0; y < y1; y += step) {
		for (var x = x0; x < x1; x += step) {
			var i = y * ref.w + x, j = (y - dy) * mov.w + (x - dx);
			if (ref.alpha[i] < 128 || mov.alpha[j] < 128) continue;
			sum += Math.abs(ref.gray[i] - mov.gray[j]);
			n++;
		}
	}
	//too little overlap is not a match
	var smaller = Math.min(ref.w * ref.h, mov.w * mov.h) / (step * step);
	if (n < smaller * 0.08) return Infinity;
	return sum / n;
}

/**
 * where `mov` sits relative to `ref` (pixels): a search around `guess`
 * (within `range` of the larger size) at about 64 px, refined up to full size
 */
function best_offset(ref_item, mov_item, guess, range) {
	var big = Math.max(ref_item.width, ref_item.height, mov_item.width, mov_item.height);
	var levels = [];
	for (var k = Math.min(1, 64 / big); k < 1; k *= 2) levels.push(k);
	levels.push(1);
	var dx = guess.x, dy = guess.y;
	levels.forEach((k, li) => {
		var ref = sample_local(ref_item, k), mov = sample_local(mov_item, k);
		var cx = Math.round(dx * k), cy = Math.round(dy * k);
		var r = li == 0 ? Math.round(big * k * range) : 2;
		var step = ref.w * ref.h > 200000 ? 2 : 1;
		var best = Infinity, bx = cx, by = cy;
		for (var oy = cy - r; oy <= cy + r; oy++) {
			for (var ox = cx - r; ox <= cx + r; ox++) {
				var c = cost(ref, mov, ox, oy, step);
				if (c < best) { best = c; bx = ox; by = oy; }
			}
		}
		dx = bx / k;
		dy = by / k;
	});
	return { x: Math.round(dx), y: Math.round(dy) };
}

function doc_canvas() {
	var c = document.createElement('canvas');
	c.width = config.WIDTH;
	c.height = config.HEIGHT;
	return c;
}

/**
 * chamfer distance (pixels) from each opaque pixel to the layer's edge
 */
function edge_distance(alpha, w, h) {
	var INF = 1e9, d = new Float32Array(w * h);
	for (var i = 0; i < w * h; i++) d[i] = alpha[i] >= 128 ? INF : 0;
	for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
		var k = y * w + x;
		if (!d[k]) continue;
		var v = d[k];
		if (x == 0 || y == 0) v = Math.min(v, 1);
		if (x > 0) v = Math.min(v, d[k - 1] + 1);
		if (y > 0) v = Math.min(v, d[k - w] + 1);
		if (x > 0 && y > 0) v = Math.min(v, d[k - w - 1] + 1.414);
		if (x < w - 1 && y > 0) v = Math.min(v, d[k - w + 1] + 1.414);
		d[k] = v;
	}
	for (var y2 = h - 1; y2 >= 0; y2--) for (var x2 = w - 1; x2 >= 0; x2--) {
		var k2 = y2 * w + x2;
		if (!d[k2]) continue;
		var v2 = d[k2];
		if (x2 == w - 1 || y2 == h - 1) v2 = Math.min(v2, 1);
		if (x2 < w - 1) v2 = Math.min(v2, d[k2 + 1] + 1);
		if (y2 < h - 1) v2 = Math.min(v2, d[k2 + w] + 1);
		if (x2 < w - 1 && y2 < h - 1) v2 = Math.min(v2, d[k2 + w + 1] + 1.414);
		if (x2 > 0 && y2 < h - 1) v2 = Math.min(v2, d[k2 + w - 1] + 1.414);
		d[k2] = v2;
	}
	return d;
}

/**
 * |Laplacian| of the gray image, box-averaged (radius r): local sharpness
 */
function sharpness(gray, alpha, w, h, r) {
	var lap = new Float32Array(w * h);
	for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
		var k = y * w + x;
		lap[k] = alpha[k] < 128 ? 0 : Math.abs(4 * gray[k] - gray[k - 1] - gray[k + 1] - gray[k - w] - gray[k + w]);
	}
	//separable box blur
	var tmp = new Float32Array(w * h), out = new Float32Array(w * h);
	for (var y2 = 0; y2 < h; y2++) {
		var acc = 0;
		for (var x2 = -r; x2 < w; x2++) {
			if (x2 + r < w) acc += lap[y2 * w + x2 + r];
			if (x2 - r - 1 >= 0) acc -= lap[y2 * w + x2 - r - 1];
			if (x2 >= 0) tmp[y2 * w + x2] = acc;
		}
	}
	for (var x3 = 0; x3 < w; x3++) {
		var acc2 = 0;
		for (var y3 = -r; y3 < h; y3++) {
			if (y3 + r < h) acc2 += tmp[(y3 + r) * w + x3];
			if (y3 - r - 1 >= 0) acc2 -= tmp[(y3 - r - 1) * w + x3];
			if (y3 >= 0) out[y3 * w + x3] = acc2;
		}
	}
	return out;
}

class Ps_auto_align_class {

	targets() {
		var list = app.GUI.Ps_workspace.Multi.selected().filter(l => l.type == 'image' && l.visible !== false);
		if (list.length < 2) {
			alertify.error('Auto-Align and Auto-Blend need two or more selected pixel layers.');
			return null;
		}
		//bottom first (config.layers[0] is the bottom layer)
		return list.sort((a, b) => config.layers.indexOf(a) - config.layers.indexOf(b));
	}

	/**
	 * Edit > Auto-Align Layers...
	 */
	align_dialog() {
		var list = this.targets();
		if (!list) return;
		var POP = new Dialog_class();
		POP.show({
			title: 'Auto-Align Layers',
			params: [
				{ name: 'projection', title: 'Projection:', values: ['Auto', 'Reposition'], value: this.projection || 'Auto' },
				{ title: '', html: '<span class="ps_dialog_note">Perspective, Collage, Cylindrical and Spherical are not available in pshot.</span>' },
				{ name: 'vignette', title: 'Vignette Removal', value: false },
				{ name: 'distortion', title: 'Geometric Distortion', value: false },
			],
			on_finish: (p) => {
				this.projection = p.projection;
				this.align(list);
			},
		});
	}

	async align(list) {
		app.GUI.Ps_workspace.status_message('Aligning layers...');
		await new Promise(r => setTimeout(r, 20));
		var ref = list[0];
		var actions = [];
		for (var l of list.slice(1)) {
			var o = best_offset(ref, l, { x: (l.x || 0) - (ref.x || 0), y: (l.y || 0) - (ref.y || 0) }, 0.45);
			var nx = (ref.x || 0) + o.x, ny = (ref.y || 0) + o.y;
			if (nx != l.x || ny != l.y) actions.push(new app.Actions.Update_layer_action(l.id, { x: nx, y: ny }));
		}
		if (actions.length) await app.State.do_action(new app.Actions.Bundle_action('auto_align', 'Auto-Align Layers', actions));
		app.GUI.Ps_workspace.status_message('Auto-Align Layers: ' + actions.length + ' layer' + (actions.length == 1 ? '' : 's') + ' moved.');
	}

	/**
	 * Edit > Auto-Blend Layers...
	 */
	blend_dialog() {
		var list = this.targets();
		if (!list) return;
		var POP = new Dialog_class();
		POP.show({
			title: 'Auto-Blend Layers',
			params: [
				{ name: 'method', title: 'Blend Method:', values: ['Panorama', 'Stack Images'], value: this.method || 'Panorama' },
				{ name: 'seamless', title: 'Seamless Tones and Colors', value: true },
			],
			on_finish: (p) => {
				this.method = p.method;
				this.blend(list, p.method, p.seamless);
			},
		});
	}

	async blend(list, method, seamless) {
		app.GUI.Ps_workspace.status_message('Blending layers...');
		await new Promise(r => setTimeout(r, 20));
		var W = config.WIDTH, H = config.HEIGHT;
		var samples = list.map(l => sample_layer(l, 1));
		//per pixel score of each layer; the highest wins
		var scores = samples.map(s => (method == 'Stack Images' ? sharpness(s.gray, s.alpha, W, H, 4) : edge_distance(s.alpha, W, H)));
		var owner = new Int16Array(W * H).fill(-1);
		for (var i = 0; i < W * H; i++) {
			var best = -1, bv = -1;
			for (var n = 0; n < samples.length; n++) {
				if (samples[n].alpha[i] < 128) continue;
				//later (upper) layers win ties, as in the stack
				if (scores[n][i] >= bv) { bv = scores[n][i]; best = n; }
			}
			owner[i] = best;
		}
		var actions = [];
		var feather = method == 'Stack Images' ? 1.5 : 3;
		list.forEach((l, n) => {
			var m = doc_canvas(), mctx = m.getContext('2d');
			var img = mctx.createImageData(W, H), d = img.data;
			for (var i2 = 0; i2 < W * H; i2++) {
				//a layer also reveals what upper layers own (they cover it), so only
				//its seam with the layers below is feathered and the alphas add up;
				//the bottom layer keeps whatever no layer covers
				//(where the layer has no pixels the mask does not matter: on, so the
				//feather stays off the layer's outer edges)
				var on = owner[i2] >= n || samples[n].alpha[i2] < 128 || (n == 0 && owner[i2] < 0);
				d[i2 * 4] = d[i2 * 4 + 1] = d[i2 * 4 + 2] = 255;
				d[i2 * 4 + 3] = on ? 255 : 0;
			}
			mctx.putImageData(img, 0, 0);
			var soft = doc_canvas(), sctx = soft.getContext('2d');
			sctx.filter = 'blur(' + feather + 'px)';
			sctx.drawImage(m, 0, 0);
			sctx.filter = 'none';
			//the blur fades toward the document border: keep a hard band there
			var band = Math.ceil(feather * 3);
			sctx.clearRect(0, 0, W, band); sctx.drawImage(m, 0, 0, W, band, 0, 0, W, band);
			sctx.clearRect(0, H - band, W, band); sctx.drawImage(m, 0, H - band, W, band, 0, H - band, W, band);
			sctx.clearRect(0, 0, band, H); sctx.drawImage(m, 0, 0, band, H, 0, 0, band, H);
			sctx.clearRect(W - band, 0, band, H); sctx.drawImage(m, W - band, 0, band, H, W - band, 0, band, H);
			var settings = { ps_mask: soft, ps_mask_x: l.x || 0, ps_mask_y: l.y || 0, ps_mask_disabled: false, ps_mask_editing: false };
			actions.push(new app.Actions.Update_layer_action(l.id, settings));
		});
		if (seamless && method == 'Panorama') {
			//Seamless Tones and Colors: match each layer's mean color to the bottom layer in the overlaps
			var gains = this.gains(list, samples);
			for (var g of gains) actions.push(g);
		}
		await app.State.do_action(new app.Actions.Bundle_action('auto_blend', 'Auto-Blend Layers', actions));
		app.GUI.GUI_layers.render_layers();
		app.GUI.Ps_workspace.status_message('Auto-Blend Layers done.');
	}

	/**
	 * per layer RGB gain so its overlap with the bottom layer matches it
	 */
	gains(list, samples) {
		var W = config.WIDTH, H = config.HEIGHT;
		var full = list.map(l => {
			var c = doc_canvas(), ctx = c.getContext('2d', { willReadFrequently: true });
			var plain = Object.assign(Object.create(Object.getPrototypeOf(l)), l, { ps_mask: null, ps_styles: null, opacity: 100, visible: true });
			app.Layers.render_object(ctx, plain);
			return ctx.getImageData(0, 0, W, H).data;
		});
		var actions = [];
		for (var n = 1; n < list.length; n++) {
			var s0 = [0, 0, 0], s1 = [0, 0, 0], cnt = 0;
			for (var i = 0; i < W * H; i++) {
				if (samples[0].alpha[i] < 128 || samples[n].alpha[i] < 128) continue;
				for (var c = 0; c < 3; c++) { s0[c] += full[0][i * 4 + c]; s1[c] += full[n][i * 4 + c]; }
				cnt++;
			}
			if (cnt < 100) continue;
			var g = s0.map((v, c) => (s1[c] ? v / s1[c] : 1));
			if (g.every(v => Math.abs(v - 1) < 0.01)) continue;
			var l = list[n];
			var src = document.createElement('canvas');
			src.width = l.width_original || l.width;
			src.height = l.height_original || l.height;
			var sctx = src.getContext('2d', { willReadFrequently: true });
			sctx.drawImage(l.link, 0, 0);
			var img = sctx.getImageData(0, 0, src.width, src.height), d = img.data;
			for (var k = 0; k < d.length; k += 4) for (var c2 = 0; c2 < 3; c2++) d[k + c2] = Math.min(255, d[k + c2] * g[c2]);
			sctx.putImageData(img, 0, 0);
			actions.push(new app.Actions.Update_layer_image_action(src, l.id));
		}
		return actions;
	}
}

export { best_offset };
export default Ps_auto_align_class;
