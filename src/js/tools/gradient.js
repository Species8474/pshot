/*
 * pshot - CS6 Gradient Tool: Linear, Radial, Angle, Reflected and Diamond
 * gradients from the drag start to its end, with the gradient's color and
 * opacity stops, Reverse, Dither and Transparency. The gradient layer is a
 * draft object until the stroke is committed into the target pixel layer.
 */
import app from './../app.js';
import config from './../config.js';
import { commit_stroke } from './../ps/stroke.js';
import { ensure_pixel_layer } from './../ps/pixel-layer.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import Helper_class from './../libs/helpers.js';
import { lut } from './../ps/gradients.js';

class Gradient_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.ctx = ctx;
		this.name = 'gradient';
		this.layer = {};
	}

	load() {
		this.default_events();
	}

	/**
	 * Shift: the drag snaps to 45 degree steps (CS6)
	 */
	end_point(e, mouse) {
		var dx = mouse.x - this.layer.x, dy = mouse.y - this.layer.y;
		if (e && e.shiftKey) {
			var a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(dx, dy);
			dx = Math.round(Math.cos(a) * len);
			dy = Math.round(Math.sin(a) * len);
		}
		return { width: dx, height: dy };
	}

	mousedown(e) {
		var mouse = this.get_mouse_info(e);
		var params = this.getParams();
		if (mouse.click_valid == false)
			return;

		//pshot: CS6 draws the gradient into the active pixel layer
		if (app.GUI.Ps_workspace.Selection.quick_mask) {
			ensure_pixel_layer();
		}
		this.paint_target = app.GUI.Ps_workspace.Selection.quick_mask ? config.layer.id : ((config.layer.ps_mask && config.layer.ps_mask_editing) || config.layer.type == 'image' ? config.layer.id : (config.layer.type == null ? 'self' : null));

		//the foreground / background stops take the current colors
		var stroke_params = this.clone(params);
		if (stroke_params.gradient) {
			stroke_params.gradient.stops.forEach(s => {
				if (s.color == 'fg') s.color = config.COLOR;
				if (s.color == 'bg') s.color = config.BG_COLOR;
			});
		}
		this.layer = {
			type: this.name,
			name: 'Gradient #' + this.Base_layers.auto_increment,
			params: stroke_params,
			status: 'draft',
			render_function: [this.name, 'render'],
			x: mouse.x,
			y: mouse.y,
			width: 0,
			height: 0,
			rotate: null,
			is_vector: true,
			color: null,
			opacity: params.opacity == null ? 100 : params.opacity,
			data: {},
		};
		app.State.do_action(
			new app.Actions.Bundle_action('new_gradient_layer', 'New Gradient Layer', [
				new app.Actions.Insert_layer_action(this.layer)
			])
		);
	}

	mousemove(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.is_drag == false)
			return;
		if (mouse.click_valid == false) {
			return;
		}
		var end = this.end_point(e, mouse);
		config.layer.width = end.width;
		config.layer.height = end.height;
		this.Base_layers.render();
	}

	mouseup(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false) {
			config.layer.status = null;
			return;
		}
		var end = this.end_point(e, mouse);
		if (end.width == 0 && end.height == 0) {
			//same coordinates - cancel
			app.State.scrap_last_action();
			return;
		}
		commit_stroke(this, app.State.do_action(
			new app.Actions.Update_layer_action(config.layer.id, { width: end.width, height: end.height, status: null }),
			{ merge_with_history: 'new_gradient_layer' }
		), 'Gradient Tool');

		this.Base_layers.render();
	}

	/**
	 * gradient position (0..1) of each pixel for the type, start = (x, y), end = start + (width, height)
	 */
	render(ctx, layer) {
		if (!layer.width && !layer.height)
			return;
		var params = layer.params;
		var W = config.WIDTH, H = config.HEIGHT;
		//while dragging, a lower resolution preview keeps up with the pointer
		var k = layer.status == 'draft' ? Math.min(1, Math.sqrt(250000 / (W * H))) : 1;
		var key = JSON.stringify([params.gradient, params.type, params.reverse, params.dither, params.transparency, params.radial, layer.x, layer.y, layer.width, layer.height, W, H, k]);
		if (!layer._grad_cache || layer._grad_cache.key != key) {
			layer._grad_cache = { key: key, canvas: this.build(layer, k) };
		}
		ctx.save();
		ctx.imageSmoothingEnabled = true;
		ctx.drawImage(layer._grad_cache.canvas, 0, 0, W, H);
		ctx.restore();
	}

	build(layer, k) {
		var params = layer.params;
		var W = config.WIDTH, H = config.HEIGHT;
		var w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
		var canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		var g = params.gradient || { stops: [{ pos: 0, color: params.color_1 || config.COLOR }, { pos: 1, color: params.color_2 || config.BG_COLOR }], alphas: [{ pos: 0, a: 1 }, { pos: 1, a: 1 }] };
		var L = lut(g, !!params.reverse);
		var type = params.type || (params.radial ? 'radial' : 'linear');
		var sx = layer.x * k, sy = layer.y * k, dx = layer.width * k, dy = layer.height * k;
		var len2 = dx * dx + dy * dy, len = Math.sqrt(len2) || 1;
		var ux = dx / len, uy = dy / len;
		var a0 = Math.atan2(dy, dx);
		var transparency = params.transparency !== false, dither = params.dither !== false;
		var ctx = canvas.getContext('2d');
		var img = ctx.createImageData(w, h), d = img.data;
		for (var y = 0; y < h; y++) {
			var py = y + 0.5 - sy;
			for (var x = 0; x < w; x++) {
				var px = x + 0.5 - sx, t;
				if (type == 'radial') t = Math.sqrt(px * px + py * py) / len;
				else if (type == 'angle') {
					t = (a0 - Math.atan2(py, px)) / (Math.PI * 2);
					t -= Math.floor(t);
				}
				else if (type == 'diamond') t = (Math.abs(px * ux + py * uy) + Math.abs(-px * uy + py * ux)) / len;
				else {
					t = (px * dx + py * dy) / len2;
					if (type == 'reflected') t = Math.abs(t);
				}
				t = t < 0 ? 0 : (t > 1 ? 1 : t);
				var idx = t * 255;
				if (dither) idx += Math.random() - 0.5;
				idx = idx < 0 ? 0 : (idx > 255 ? 255 : Math.round(idx));
				var o = (y * w + x) * 4, li = idx * 4;
				d[o] = L[li];
				d[o + 1] = L[li + 1];
				d[o + 2] = L[li + 2];
				d[o + 3] = transparency ? L[li + 3] : 255;
			}
		}
		ctx.putImageData(img, 0, 0);
		return canvas;
	}

}
export default Gradient_class;
