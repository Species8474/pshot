/*
 * pshot - CS6 Type > Anti-Alias: a text layer's anti-aliasing method
 * (layer.ps_aa: none / sharp / crisp / strong / smooth). Sharp is the plain
 * render; the others reshape the edge alpha in document pixels.
 */

import app from './../app.js';
import config from './../config.js';

class Ps_text_aa_class {

	current() {
		var layer = config.layer;
		return (layer && layer.type == 'text' && layer.ps_aa) || 'sharp';
	}

	/**
	 * Type > Anti-Alias > <method>, or the Type tool options bar
	 */
	set(mode) {
		var layer = config.layer;
		if (!layer || layer.type != 'text' || this.current() == mode) return;
		app.State.do_action(
			new app.Actions.Bundle_action('anti_alias', 'Anti-Alias ' + mode.charAt(0).toUpperCase() + mode.substr(1), [
				new app.Actions.Update_layer_action(layer.id, { ps_aa: mode == 'sharp' ? null : mode }),
			])
		);
	}

	/**
	 * render the text layer through draw(ctx) into document pixels, reshape the
	 * alpha, then draw it (cached per layer state)
	 */
	render(ctx, layer, is_preview, draw) {
		var key = JSON.stringify([layer.params, layer.data, layer.x, layer.y, layer.width, layer.height, layer.rotate, layer.color, layer.ps_warp, layer.ps_aa, config.WIDTH, config.HEIGHT]);
		if (!layer._ps_aa_cache || layer._ps_aa_cache.key != key) {
			var temp = document.createElement('canvas');
			temp.width = config.WIDTH;
			temp.height = config.HEIGHT;
			var tctx = temp.getContext('2d');
			draw(tctx);
			var img = tctx.getImageData(0, 0, temp.width, temp.height), d = img.data;
			var curve = this.curve(layer.ps_aa);
			for (var i = 3; i < d.length; i += 4) {
				if (d[i]) d[i] = curve[d[i]];
			}
			tctx.putImageData(img, 0, 0);
			if (layer.ps_aa == 'smooth') {
				//Smooth softens the edges a little more than Sharp
				var soft = document.createElement('canvas');
				soft.width = temp.width;
				soft.height = temp.height;
				var sctx = soft.getContext('2d');
				sctx.drawImage(temp, 0, 0);
				sctx.globalAlpha = 0.2;
				[[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].forEach(o => sctx.drawImage(temp, o[0], o[1]));
				temp = soft;
			}
			layer._ps_aa_cache = { key: key, canvas: temp };
		}
		ctx.save();
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(layer._ps_aa_cache.canvas, 0, 0);
		ctx.restore();
	}

	curve(mode) {
		var c = new Uint8ClampedArray(256);
		for (var a = 0; a < 256; a++) {
			if (mode == 'none') c[a] = a >= 128 ? 255 : 0;
			else if (mode == 'crisp') c[a] = (a - 128) * 1.3 + 128;
			else if (mode == 'strong') c[a] = 255 * Math.pow(a / 255, 0.6);
			else c[a] = a;
		}
		return c;
	}
}

export default Ps_text_aa_class;
