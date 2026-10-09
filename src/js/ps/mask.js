/*
 * pshot - CS6 layer masks.
 *
 * layer.ps_mask is a document-sized canvas whose alpha is the mask (opaque =
 * reveal, transparent = hide). It was made when the layer sat at
 * (ps_mask_x, ps_mask_y) and moves with the layer. Changes go through
 * Update_layer_action, so they are undoable.
 */

import app from './../app.js';
import config from './../config.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

function doc_canvas() {
	var c = document.createElement('canvas');
	c.width = config.WIDTH;
	c.height = config.HEIGHT;
	return c;
}

function clone(canvas) {
	var c = document.createElement('canvas');
	c.width = canvas.width;
	c.height = canvas.height;
	c.getContext('2d').drawImage(canvas, 0, 0);
	return c;
}

function luminance(hex) {
	var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
	return (r * 0.299 + g * 0.587 + b * 0.114) / 255;
}

class Ps_mask_class {

	selection() {
		return app.GUI.Ps_workspace.Selection;
	}

	set_mask(layer, mask, description, extra) {
		var settings = {
			ps_mask: mask,
			ps_mask_x: layer.x || 0,
			ps_mask_y: layer.y || 0,
			ps_mask_disabled: false,
			ps_mask_editing: !!mask,
		};
		Object.assign(settings, extra || {});
		return app.State.do_action(new app.Actions.Bundle_action('layer_mask', description, [
			new app.Actions.Update_layer_action(layer.id, settings),
		])).then(() => app.GUI.GUI_layers.render_layers());
	}

	can_add(layer) {
		if (!layer || layer.type == null) {
			alertify.error('Could not add a layer mask because the layer is empty.');
			return false;
		}
		if (layer.ps_mask) {
			alertify.error('The layer already has a layer mask.');
			return false;
		}
		return true;
	}

	/**
	 * Add Layer Mask button: reveal all, or reveal the selection; Alt hides
	 */
	add(hide) {
		var sel = this.selection();
		if (sel.has()) {
			return hide ? this.hide_selection() : this.reveal_selection();
		}
		return hide ? this.hide_all() : this.reveal_all();
	}

	reveal_all() {
		var layer = config.layer;
		if (!this.can_add(layer)) return;
		var mask = doc_canvas();
		var ctx = mask.getContext('2d');
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, mask.width, mask.height);
		return this.set_mask(layer, mask, 'Add Layer Mask');
	}

	hide_all() {
		var layer = config.layer;
		if (!this.can_add(layer)) return;
		return this.set_mask(layer, doc_canvas(), 'Add Layer Mask');
	}

	reveal_selection() {
		var layer = config.layer;
		var sel = this.selection();
		if (!sel.has()) return this.reveal_all();
		if (!this.can_add(layer)) return;
		return this.set_mask(layer, clone(sel.mask), 'Add Layer Mask').then(() => sel.deselect());
	}

	hide_selection() {
		var layer = config.layer;
		var sel = this.selection();
		if (!sel.has()) return this.hide_all();
		if (!this.can_add(layer)) return;
		var mask = doc_canvas();
		var ctx = mask.getContext('2d');
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, mask.width, mask.height);
		ctx.globalCompositeOperation = 'destination-out';
		ctx.drawImage(sel.mask, 0, 0);
		return this.set_mask(layer, mask, 'Add Layer Mask').then(() => sel.deselect());
	}

	remove() {
		var layer = config.layer;
		if (!layer || !layer.ps_mask) return;
		return this.set_mask(layer, null, 'Delete Layer Mask', { ps_mask_editing: false });
	}

	/**
	 * Apply: bake the mask into the pixels (pixel layers only)
	 */
	apply() {
		var layer = config.layer;
		if (!layer || !layer.ps_mask) return;
		if (layer.type != 'image') {
			alertify.error('Rasterize the layer before applying its mask.');
			return;
		}
		var canvas = document.createElement('canvas');
		canvas.width = layer.width_original;
		canvas.height = layer.height_original;
		var ctx = canvas.getContext('2d');
		ctx.drawImage(layer.link, 0, 0);
		var sx = layer.width_original / layer.width, sy = layer.height_original / layer.height;
		ctx.globalCompositeOperation = 'destination-in';
		ctx.setTransform(sx, 0, 0, sy, -layer.x * sx, -layer.y * sy);
		ctx.drawImage(layer.ps_mask, layer.x - layer.ps_mask_x, layer.y - layer.ps_mask_y);
		return app.State.do_action(new app.Actions.Bundle_action('apply_mask', 'Apply Layer Mask', [
			new app.Actions.Update_layer_image_action(canvas, layer.id),
			new app.Actions.Update_layer_action(layer.id, { ps_mask: null, ps_mask_editing: false }),
		])).then(() => app.GUI.GUI_layers.render_layers());
	}

	toggle_disabled() {
		var layer = config.layer;
		if (!layer || !layer.ps_mask) return;
		return app.State.do_action(new app.Actions.Bundle_action('layer_mask', layer.ps_mask_disabled ? 'Enable Layer Mask' : 'Disable Layer Mask', [
			new app.Actions.Update_layer_action(layer.id, { ps_mask_disabled: !layer.ps_mask_disabled }),
		])).then(() => app.GUI.GUI_layers.render_layers());
	}

	/**
	 * which part of the layer the tools edit (CS6: click the layer or the mask thumbnail)
	 */
	set_editing(layer, on) {
		layer.ps_mask_editing = !!(on && layer.ps_mask);
		app.GUI.GUI_layers.render_layers();
		app.GUI.Ps_workspace.last_tab_label = null;
	}

	is_editing(layer) {
		return !!(layer && layer.ps_mask && layer.ps_mask_editing);
	}

	/**
	 * paint a document-sized stroke (alpha = coverage) into the mask with the
	 * grayscale value of `color` (CS6: black hides, white reveals)
	 */
	/**
	 * @returns {HTMLCanvasElement} the new mask (apply it with Update_layer_action)
	 */
	painted_mask(layer, stroke, color, opacity) {
		if (color === null) {
			return this.paint_luminance(layer, stroke, opacity);
		}
		var mask = clone(layer.ps_mask);
		var ctx = mask.getContext('2d');
		var v = luminance(color);
		var ox = layer.ps_mask_x - layer.x, oy = layer.ps_mask_y - layer.y;
		var a = opacity == null ? 1 : opacity;
		ctx.globalAlpha = a;
		ctx.globalCompositeOperation = 'destination-out';
		ctx.drawImage(stroke, ox, oy);
		if (v > 0) {
			var white = document.createElement('canvas');
			white.width = stroke.width;
			white.height = stroke.height;
			var wctx = white.getContext('2d');
			wctx.drawImage(stroke, 0, 0);
			wctx.globalCompositeOperation = 'source-in';
			wctx.fillStyle = '#fff';
			wctx.fillRect(0, 0, white.width, white.height);
			ctx.globalAlpha = a * v;
			ctx.globalCompositeOperation = 'source-over';
			ctx.drawImage(white, ox, oy);
		}
		return mask;
	}

	/**
	 * multi-color strokes (gradients): each pixel's luminance becomes the mask value
	 */
	paint_luminance(layer, stroke, opacity) {
		var lum = document.createElement('canvas');
		lum.width = stroke.width;
		lum.height = stroke.height;
		var lctx = lum.getContext('2d');
		lctx.drawImage(stroke, 0, 0);
		var img = lctx.getImageData(0, 0, lum.width, lum.height);
		var d = img.data;
		for (var i = 0; i < d.length; i += 4) {
			var l = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
			d[i + 3] = Math.round(d[i + 3] * l);
			d[i] = d[i + 1] = d[i + 2] = 255;
		}
		lctx.putImageData(img, 0, 0);
		var mask = clone(layer.ps_mask);
		var ctx = mask.getContext('2d');
		var ox = layer.ps_mask_x - layer.x, oy = layer.ps_mask_y - layer.y;
		ctx.globalAlpha = opacity == null ? 1 : opacity;
		ctx.globalCompositeOperation = 'destination-out';
		ctx.drawImage(stroke, ox, oy);
		ctx.globalCompositeOperation = 'source-over';
		ctx.drawImage(lum, ox, oy);
		return mask;
	}

	/**
	 * paint a document-sized stroke into the mask as its own History state
	 */
	paint(layer, stroke, color, opacity, description) {
		var mask = this.painted_mask(layer, stroke, color, opacity);
		return app.State.do_action(new app.Actions.Bundle_action('mask_paint', description, [
			new app.Actions.Update_layer_action(layer.id, { ps_mask: mask }),
		]));
	}

	thumbnail(canvas, layer) {
		var ctx = canvas.getContext('2d');
		var size = canvas.width;
		var scale = Math.min(size / config.WIDTH, size / config.HEIGHT);
		var w = Math.round(config.WIDTH * scale), h = Math.round(config.HEIGHT * scale);
		var ox = Math.floor((size - w) / 2), oy = Math.floor((size - h) / 2);
		ctx.clearRect(0, 0, size, size);
		ctx.fillStyle = '#000';
		ctx.fillRect(ox, oy, w, h);
		ctx.save();
		ctx.translate(ox, oy);
		ctx.scale(scale, scale);
		ctx.drawImage(layer.ps_mask, layer.x - layer.ps_mask_x, layer.y - layer.ps_mask_y);
		ctx.restore();
	}
}

export default Ps_mask_class;
