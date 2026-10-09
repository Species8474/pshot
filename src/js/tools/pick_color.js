import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import Helper_class from './../libs/helpers.js';
import Base_gui_class from './../core/base-gui.js';

class Pick_color_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.Base_gui = new Base_gui_class();
		this.ctx = ctx;
		this.name = 'pick_color';
	}

	dragStart(event) {
		var _this = this;
		if (config.TOOL.name != _this.name)
			return;
		_this.mousedown(event);
	}

	dragMove(event) {
		var _this = this;
		if (config.TOOL.name != _this.name)
			return;
		_this.mousemove(event);
	}

	load() {
		var _this = this;

		//mouse events
		document.addEventListener('mousedown', function (event) {
			_this.dragStart(event);
		});
		document.addEventListener('mousemove', function (event) {
			_this.dragMove(event);
		});

		//pshot: the sampling ring is shown while the mouse is down
		document.addEventListener('mouseup', function () {
			_this.ps_mouse_down = false;
			_this.source = null;
			if (_this.ring) {
				_this.ring = null;
				_this.source = null;
				app.GUI.Ps_workspace.Selection.draw_overlay();
			}
		});
		setTimeout(() => {
			var Selection = app.GUI.Ps_workspace && app.GUI.Ps_workspace.Selection;
			if (!Selection) return;
			Selection.overlays = Selection.overlays || [];
			Selection.overlays.push({
				active: () => !!_this.ring,
				draw: (ctx, scale) => _this.draw_ring(ctx, scale),
			});
		}, 0);

		// collect touch events
		document.addEventListener('touchstart', function (event) {
			_this.dragStart(event);
		});
		document.addEventListener('touchmove', function (event) {
			_this.dragMove(event);
		});
	}

	draw_ring(ctx, scale) {
		var r = this.ring, R = 62 / scale, t = 18 / scale;
		ctx.save();
		ctx.lineWidth = t;
		ctx.strokeStyle = r.color;
		ctx.beginPath();
		ctx.arc(r.x, r.y, R, Math.PI, Math.PI * 2);
		ctx.stroke();
		ctx.strokeStyle = r.old;
		ctx.beginPath();
		ctx.arc(r.x, r.y, R, 0, Math.PI);
		ctx.stroke();
		ctx.lineWidth = 1 / scale;
		ctx.strokeStyle = '#7f7f7f';
		ctx.beginPath();
		ctx.arc(r.x, r.y, R + t / 2, 0, Math.PI * 2);
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(r.x, r.y, R - t / 2, 0, Math.PI * 2);
		ctx.stroke();
		ctx.restore();
	}

	mousedown(e) {
		this.ps_mouse_down = true;
		this.source = null;
		this.ps_alt = !!e.altKey;
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false) {
			return;
		}

		this.pick_color(mouse);
	}

	mousemove(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.is_drag == false || mouse.click_valid == false) {
			return;
		}

		this.pick_color(mouse);
	}

	/**
	 * pshot: Sample: Current Layer, Current & Below, All Layers (and the No
	 * Adjustments variants), as a document-sized canvas (kept for the drag)
	 */
	sample_canvas(params) {
		var sample = params.sample || (params.global ? 'All Layers' : 'Current Layer');
		if (sample == 'Current Layer') {
			return this.Base_layers.convert_layer_to_canvas(config.layer.id, null, false);
		}
		var canvas = document.createElement('canvas');
		canvas.width = config.WIDTH;
		canvas.height = config.HEIGHT;
		var ctx = canvas.getContext("2d");
		var no_adj = sample.indexOf('No Adjustments') >= 0;
		if (sample.indexOf('All Layers') == 0 && !no_adj) {
			this.Base_layers.convert_layers_to_canvas(ctx, null, false);
			return canvas;
		}
		var upto = sample.indexOf('Current & Below') == 0 ? config.layers.indexOf(config.layer) : config.layers.length - 1;
		for (var i = 0; i <= upto; i++) {
			var l = config.layers[i];
			if (!l || l.visible === false || (no_adj && l.type == 'ps_adjust')) continue;
			ctx.globalAlpha = l.opacity / 100;
			ctx.globalCompositeOperation = l.composition || 'source-over';
			this.Base_layers.render_object(ctx, l);
		}
		ctx.globalAlpha = 1;
		ctx.globalCompositeOperation = 'source-over';
		return canvas;
	}

	pick_color(mouse) {
		var params = this.getParams();

		//get canvas from layer
		if (!this.source) {
			this.source = this.sample_canvas(params);
		}
		var ctx = this.source.getContext("2d", { willReadFrequently: true });
		//find color: Sample Size averages an n by n square
		var n = parseInt(params.sample_size) || 1;
		var half = Math.floor(n / 2), sx = Math.max(0, Math.floor(mouse.x) - half), sy = Math.max(0, Math.floor(mouse.y) - half);
		var ex = Math.min(this.source.width, Math.floor(mouse.x) + half + 1), ey = Math.min(this.source.height, Math.floor(mouse.y) + half + 1);
		var c = [0, 0, 0, 0];
		if (ex > sx && ey > sy) {
			var d = ctx.getImageData(sx, sy, ex - sx, ey - sy).data, cnt = d.length / 4;
			for (var k = 0; k < d.length; k += 4) { c[0] += d[k]; c[1] += d[k + 1]; c[2] += d[k + 2]; c[3] += d[k + 3]; }
			c = c.map(v => Math.round(v / cnt));
		}
		var hex = this.Helper.rgbToHex(c[0], c[1], c[2]);
		//Show Sampling Ring: the new color above the current one
		if (params.show_ring !== false && this.ps_mouse_down) {
			if (!this.ring) this.ring = { old: this.ps_alt ? config.BG_COLOR : config.COLOR };
			this.ring.x = mouse.x;
			this.ring.y = mouse.y;
			this.ring.color = hex;
			app.GUI.Ps_workspace.Selection.draw_overlay();
		}

		const newColorDefinition = { hex };
		if (c[3] > 0) {
			//set alpha
			newColorDefinition.a = c[3];
		}
		//pshot: CS6 Alt+click picks the background color
		if (this.ps_alt) {
			config.BG_COLOR = hex;
			return;
		}
		this.Base_gui.GUI_colors.set_color(newColorDefinition);
	}

	copy_color_to_clipboard() {
		navigator.clipboard.writeText(config.COLOR);
	}

}

export default Pick_color_class;
