/*
 * pshot - CS6 vector masks: a path that clips the layer with smooth edges.
 * layer.ps_vmask = { subpaths, invert, disabled, lx, ly } (document
 * coordinates when created at layer position lx/ly; the mask follows the
 * layer when it moves). No subpaths = Reveal All (or Hide All when inverted).
 */

import app from './../app.js';
import config from './../config.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

/**
 * Path2D of the mask in document coordinates (null = reveal all)
 */
function vmask_path(layer) {
	var vm = layer.ps_vmask;
	var dx = layer.x - (vm.lx || 0), dy = layer.y - (vm.ly || 0);
	var p = new Path2D();
	if (vm.invert) p.rect(-1e5, -1e5, 2e5, 2e5);
	for (var sp of vm.subpaths || []) {
		var pts = sp.pts;
		if (!pts.length) continue;
		p.moveTo(pts[0].x + dx, pts[0].y + dy);
		var n = sp.closed ? pts.length : pts.length - 1;
		for (var i = 0; i < n; i++) {
			var a = pts[i], b = pts[(i + 1) % pts.length];
			p.bezierCurveTo(a.ox + dx, a.oy + dy, b.ix + dx, b.iy + dy, b.x + dx, b.y + dy);
		}
		p.closePath();
	}
	return p;
}

/**
 * render hook: keep only what the vector mask reveals (ctx in document space)
 */
function apply_vmask(ctx, layer) {
	var vm = layer.ps_vmask;
	if (!vm || vm.disabled) return;
	var empty = !(vm.subpaths || []).some(sp => sp.pts && sp.pts.length);
	if (empty && !vm.invert) return;
	ctx.save();
	ctx.globalCompositeOperation = 'destination-in';
	ctx.fillStyle = '#000';
	if (empty) {
		ctx.fillStyle = 'rgba(0,0,0,0)';
		ctx.fillRect(-1e5, -1e5, 2e5, 2e5);
	}
	else ctx.fill(vmask_path(layer), vm.invert ? 'evenodd' : 'nonzero');
	ctx.restore();
}

class Ps_vector_mask_class {

	apply(ctx, layer) {
		apply_vmask(ctx, layer);
	}

	layer() {
		var l = config.layer;
		if (!l || l.type == null || l.type == 'ps_group' || l.type == 'ps_adjust') {
			alertify.error('Could not add a vector mask because the active layer cannot have one.');
			return null;
		}
		return l;
	}

	async set(layer, vmask, description) {
		await app.State.do_action(new app.Actions.Bundle_action('vector_mask', description, [
			new app.Actions.Update_layer_action(layer.id, { ps_vmask: vmask }),
		]));
		app.GUI.GUI_layers.render_layers();
		config.need_render = true;
	}

	reveal_all() {
		var l = this.layer();
		if (l) this.set(l, { subpaths: [], invert: false, disabled: false, lx: l.x, ly: l.y }, 'Add Vector Mask');
	}

	hide_all() {
		var l = this.layer();
		if (l) this.set(l, { subpaths: [], invert: true, disabled: false, lx: l.x, ly: l.y }, 'Add Vector Mask');
	}

	/**
	 * Layer > Vector Mask > Current Path
	 */
	current_path() {
		var l = this.layer();
		if (!l) return;
		var paths = config.ps_paths || [];
		var path = paths[config.ps_path_active];
		if (!path || !path.subpaths.length) {
			alertify.error('Could not complete the Current Path command because there is no active path.');
			return;
		}
		this.set(l, { subpaths: JSON.parse(JSON.stringify(path.subpaths)), invert: false, disabled: false, lx: l.x, ly: l.y }, 'Add Vector Mask');
	}

	remove() {
		var l = config.layer;
		if (l && l.ps_vmask) this.set(l, null, 'Delete Vector Mask');
	}

	toggle() {
		var l = config.layer;
		if (!l || !l.ps_vmask) return;
		this.set(l, Object.assign({}, l.ps_vmask, { disabled: !l.ps_vmask.disabled }), l.ps_vmask.disabled ? 'Enable Vector Mask' : 'Disable Vector Mask');
	}

	/**
	 * Layer > Rasterize > Vector Mask: the vector mask becomes (or intersects) the pixel mask
	 */
	rasterize() {
		var l = config.layer;
		if (!l || !l.ps_vmask) return;
		var m = document.createElement('canvas');
		m.width = config.WIDTH;
		m.height = config.HEIGHT;
		var ctx = m.getContext('2d');
		ctx.fillStyle = '#fff';
		//pixel masks are drawn at (layer.x - ps_mask_x, layer.y - ps_mask_y)
		if (l.ps_mask) ctx.drawImage(l.ps_mask, l.x - l.ps_mask_x, l.y - l.ps_mask_y);
		else ctx.fillRect(0, 0, m.width, m.height);
		apply_vmask(ctx, l);
		app.State.do_action(new app.Actions.Bundle_action('vector_mask', 'Rasterize Vector Mask', [
			new app.Actions.Update_layer_action(l.id, { ps_vmask: null, ps_mask: m, ps_mask_x: l.x, ps_mask_y: l.y, ps_mask_disabled: false }),
		])).then(() => { app.GUI.GUI_layers.render_layers(); config.need_render = true; });
	}

	/**
	 * Layers panel thumbnail: white where revealed, grey where hidden
	 */
	thumb(canvas, layer) {
		var ctx = canvas.getContext('2d');
		var w = canvas.width, h = canvas.height, s = Math.min(w / config.WIDTH, h / config.HEIGHT);
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = '#9a9a9a';
		ctx.fillRect(0, 0, w, h);
		var off = document.createElement('canvas');
		off.width = w;
		off.height = h;
		var o = off.getContext('2d');
		o.setTransform(s, 0, 0, s, (w - config.WIDTH * s) / 2, (h - config.HEIGHT * s) / 2);
		o.fillStyle = '#fff';
		o.fillRect(0, 0, config.WIDTH, config.HEIGHT);
		apply_vmask(o, layer);
		ctx.drawImage(off, 0, 0);
		if (layer.ps_vmask.disabled) {
			ctx.strokeStyle = '#d00';
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(2, 2); ctx.lineTo(w - 2, h - 2);
			ctx.moveTo(w - 2, 2); ctx.lineTo(2, h - 2);
			ctx.stroke();
		}
	}

	// ---------- PSD ----------

	to_psd(layer) {
		var vm = layer.ps_vmask;
		if (!vm) return undefined;
		var dx = layer.x - (vm.lx || 0), dy = layer.y - (vm.ly || 0);
		return {
			invert: !!vm.invert, notLink: false, disable: !!vm.disabled, fillStartsWithAllPixels: !!vm.invert,
			paths: (vm.subpaths || []).map(sp => ({
				open: !sp.closed, fillRule: 'non-zero', operation: 'combine',
				knots: sp.pts.map(p => ({ linked: false, points: [p.ix + dx, p.iy + dy, p.x + dx, p.y + dy, p.ox + dx, p.oy + dy] })),
			})),
		};
	}

	from_psd(vm, layer) {
		if (!vm) return null;
		return {
			invert: !!vm.invert, disabled: !!vm.disable, lx: layer.x || 0, ly: layer.y || 0,
			subpaths: (vm.paths || []).map(bp => ({
				closed: !bp.open,
				pts: (bp.knots || []).map(k => ({ ix: k.points[0], iy: k.points[1], x: k.points[2], y: k.points[3], ox: k.points[4], oy: k.points[5] })),
			})).filter(sp => sp.pts.length),
		};
	}
}

export { apply_vmask };
export default Ps_vector_mask_class;
