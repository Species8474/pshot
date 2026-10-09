import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import Helper_class from './../libs/helpers.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import Patterns from './../ps/patterns.js';
import { BLEND_OPS } from './../ps/stroke.js';

class Fill_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.ctx = ctx;
		this.name = 'fill';
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

		this.fill(mouse);
	}

	/**
	 * pshot: CS6 Paint Bucket - the area similar to the clicked pixel (Tolerance,
	 * Contiguous, All Layers; Anti-alias softens its edge) filled with the
	 * foreground color or a pattern, in the Mode and Opacity, inside the selection
	 */
	async fill(mouse) {
		var params = this.getParams();
		if (this.working == true) {
			return;
		}
		var layer = config.layer;
		if (layer.type != 'image' || !layer.link) {
			alertify.error('This layer must contain an image. Please convert it to raster to apply this tool.');
			return;
		}
		if (layer.is_vector == true) {
			alertify.error('Layer is vector, convert it to raster to apply this tool.');
			return;
		}
		var W = config.WIDTH, H = config.HEIGHT;
		if (mouse.x < 0 || mouse.y < 0 || mouse.x >= W || mouse.y >= H) {
			return;
		}
		this.working = true;
		try {
			var Selection = app.GUI.Ps_workspace.Selection;
			var src = Selection.sample_source(!!params.all_layers);
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
			//what is poured: the foreground color or the pattern (aligned to the document)
			var paint = document.createElement('canvas');
			paint.width = W;
			paint.height = H;
			var pctx = paint.getContext('2d');
			if (params.source == 'Pattern') {
				pctx.drawImage(Patterns.tiled(params.pattern || Patterns.names()[0], W, H, 100), 0, 0);
			}
			else {
				pctx.fillStyle = config.COLOR;
				pctx.fillRect(0, 0, W, H);
			}
			pctx.globalCompositeOperation = 'destination-in';
			pctx.drawImage(mask, 0, 0);
			//into the layer's own pixels
			var canvas = document.createElement('canvas');
			canvas.width = layer.width_original;
			canvas.height = layer.height_original;
			var ctx = canvas.getContext('2d');
			ctx.drawImage(layer.link, 0, 0);
			ctx.save();
			ctx.scale(layer.width_original / layer.width, layer.height_original / layer.height);
			ctx.translate(-layer.x, -layer.y);
			ctx.globalAlpha = (params.opacity == null ? 100 : params.opacity) / 100;
			ctx.globalCompositeOperation = BLEND_OPS[params.blend] || 'source-over';
			ctx.drawImage(paint, 0, 0);
			ctx.restore();
			await app.State.do_action(
				new app.Actions.Bundle_action('fill_tool', 'Paint Bucket', [
					new app.Actions.Update_layer_image_action(Selection.restrict(canvas, layer))
				])
			);
		}
		finally {
			//prevent crash bug on touch screen - hard to explain and debug
			await new Promise(r => setTimeout(r, 10));
			this.working = false;
		}
	}

}
export default Fill_class;
