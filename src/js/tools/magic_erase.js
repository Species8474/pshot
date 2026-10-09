import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

class Magic_erase_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.ctx = ctx;
		this.name = 'magic_erase';
		this.working = false;
	}

	dragStart(event) {
		var _this = this;
		if (config.TOOL.name != _this.name)
			return;
		_this.mousedown(event);
	}

	load() {
		var _this = this;

		//mouse events
		document.addEventListener('mousedown', function (event) {
			_this.dragStart(event);
		});

		// collect touch events
		document.addEventListener('touchstart', function (event) {
			_this.dragStart(event);
		});
	}

	mousedown(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false) {
			return;
		}
		if (config.layer.rotate || 0 > 0) {
			alertify.error('Erase on rotate object is disabled. Please rasterize first.');
			return;
		}

		this.magic_erase(mouse);
	}

	/**
	 * pshot: CS6 Magic Eraser - the area similar to the clicked pixel (Tolerance,
	 * Contiguous, Sample All Layers; Anti-alias softens its edge) becomes
	 * transparent by the Opacity; on the Background it becomes Layer 0 first
	 */
	async magic_erase(mouse) {
		var params = this.getParams();
		if (this.working == true) {
			return;
		}
		var layer = config.layer;
		if (layer.type != 'image' || !layer.link) {
			alertify.error('This layer must contain an image. Please convert it to raster to apply this tool.');
			return;
		}
		var W = config.WIDTH, H = config.HEIGHT;
		if (mouse.x < 0 || mouse.y < 0 || mouse.x >= W || mouse.y >= H) {
			return;
		}
		this.working = true;
		try {
			var Selection = app.GUI.Ps_workspace.Selection;
			var src = Selection.sample_source(!!params.sample_all);
			var tolerance = params.tolerance == null ? 32 : params.tolerance;
			var area = Selection.flood(src, mouse.x, mouse.y, tolerance, params.contiguous !== false, null, null);
			if (!area) return;
			var mask = Selection.array_to_mask(area);
			if (params.anti_aliasing !== false) {
				var soft = document.createElement('canvas');
				soft.width = W;
				soft.height = H;
				var sctx = soft.getContext('2d');
				sctx.filter = 'blur(0.6px)';
				sctx.drawImage(mask, 0, 0);
				sctx.filter = 'none';
				sctx.drawImage(mask, 0, 0);
				mask = soft;
			}
			var canvas = document.createElement('canvas');
			canvas.width = layer.width_original;
			canvas.height = layer.height_original;
			var ctx = canvas.getContext('2d');
			ctx.drawImage(layer.link, 0, 0);
			ctx.save();
			ctx.scale(layer.width_original / layer.width, layer.height_original / layer.height);
			ctx.translate(-layer.x, -layer.y);
			ctx.globalAlpha = (params.opacity == null ? 100 : params.opacity) / 100;
			ctx.globalCompositeOperation = 'destination-out';
			ctx.drawImage(mask, 0, 0);
			ctx.restore();
			var actions = [new app.Actions.Update_layer_image_action(Selection.restrict(canvas, layer))];
			var ordered = app.GUI.Ps_workspace.Groups.ordered();
			if (layer.name == 'Background' && ordered[ordered.length - 1] === layer) {
				actions.push(new app.Actions.Update_layer_action(layer.id, { name: 'Layer 0' }));
			}
			await app.State.do_action(new app.Actions.Bundle_action('magic_erase_tool', 'Magic Eraser', actions));
		}
		finally {
			//prevent crash bug on touch screen - hard to explain and debug
			await new Promise(r => setTimeout(r, 10));
			this.working = false;
		}
	}

}
export default Magic_erase_class;
