/*
 * pshot - CS6 retouching brushes on pixel layers:
 *   mode 'smudge'       Smudge Tool: drags color along the stroke (Strength)
 *   mode 'spot_healing' Spot Healing Brush: fills the brushed spot from its
 *                       surroundings (Type: Content-Aware, Proximity Match, Create Texture)
 */

import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import { content_aware, proximity_match, create_texture } from './../ps/inpaint.js';
import { alert_box } from './../ps/pixel-layer.js';
import Patterns from './../ps/patterns.js';
import { blend_rgb } from './../ps/blend.js';

//Art History Brush styles: stroke length (fraction of Area), direction randomness, curl (radians per stroke)
function hex_to_rgb(hex) {
	return [parseInt(hex.substr(1, 2), 16), parseInt(hex.substr(3, 2), 16), parseInt(hex.substr(5, 2), 16)];
}

const ART_STYLES = {
	'Tight Short': { length: 0.15, loose: 0.3, curl: 0 },
	'Tight Medium': { length: 0.3, loose: 0.3, curl: 0 },
	'Tight Long': { length: 0.6, loose: 0.3, curl: 0 },
	'Loose Medium': { length: 0.3, loose: 1.6, curl: 0.3 },
	'Loose Long': { length: 0.6, loose: 1.6, curl: 0.3 },
	'Dab': { length: 0, loose: 0, curl: 0, dab: true },
	'Tight Curl': { length: 0.25, loose: 0.3, curl: 4 },
	'Tight Curl Long': { length: 0.5, loose: 0.3, curl: 4 },
	'Loose Curl': { length: 0.25, loose: 1.6, curl: 5 },
	'Loose Curl Long': { length: 0.5, loose: 1.6, curl: 5 },
};

class Retouch_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.ctx = ctx;
		this.name = 'retouch';
		this.canvas = null;
		this.started = false;
		this.last = null;
		this.spot = null;
	}

	load() {
		this.default_events();
		//a pen's pressure (the pressure icons); a mouse has none
		var pen = (e) => { this.pen = e.pointerType == 'pen' && e.pressure > 0 ? e.pressure : null; };
		document.addEventListener('pointerdown', pen, true);
		document.addEventListener('pointermove', pen, true);
	}

	default_dragMove(event) {
		if (config.TOOL.name != this.name)
			return;
		this.mousemove(event);
		var mouse = this.get_mouse_info(event);
		this.show_mouse_cursor(mouse.x, mouse.y, this.getParams().size, 'circle');
	}

	/**
	 * Eraser with Erase to History works as the History Brush
	 */
	effective_mode() {
		var params = this.getParams();
		return params.mode == 'erase' && (params.to_history || this.alt_erase) ? 'history' : params.mode;
	}

	to_layer(point) {
		var layer = config.layer;
		var sx = layer.width_original / layer.width, sy = layer.height_original / layer.height;
		return { x: (point.x - layer.x) * sx, y: (point.y - layer.y) * sy, s: sx };
	}

	/**
	 * the options bar pressure icons: a pen's pressure scales Size / Opacity
	 */
	getParams() {
		var p = super.getParams();
		if (this.pen != null && this.started) {
			if (p.pressure_size) p.size = Math.max(1, p.size * this.pen);
			if (p.pressure_op && p.opacity != null) p.opacity = p.opacity * this.pen;
		}
		return p;
	}

	/**
	 * Airbrush: while the pointer rests the stamp keeps building up
	 */
	start_buildup() {
		clearInterval(this.buildup);
		var dabs = { clone: 'clone_dab', erase: 'erase_dab', history: 'history_dab', pattern_stamp: 'history_dab', mixer: 'mixer_dab' };
		var fn = dabs[this.effective_mode()];
		if (!fn || !this.getParams().airbrush) return;
		var at = this.last;
		this.buildup = setInterval(() => {
			if (!this.started || !this.canvas) { clearInterval(this.buildup); return; }
			if (this.last !== at) { at = this.last; return; }
			this[fn](this.last);
			config.need_render = true;
		}, 80);
	}

	mousedown(e) {
		this.started = false;
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false || config.layer.type != 'image' || !config.layer.link) {
			return;
		}
		//CS6: Alt-dragging the Eraser erases to the history state
		this.alt_erase = this.getParams().mode == 'erase' && e.altKey;
		var mode = this.effective_mode();
		if (mode == 'pattern_stamp') {
			//Aligned: the pattern is aligned to the document, otherwise it starts at each stroke
			var pl = config.layer, aligned = this.getParams().pattern_aligned !== false;
			this.history_source = Patterns.tiled(this.getParams().pattern, pl.width_original, pl.height_original, 100,
				aligned ? pl.x : pl.x - Math.round(mouse.x), aligned ? pl.y : pl.y - Math.round(mouse.y));
		}
		if (mode == 'history' || mode == 'art_history') {
			this.history_source = app.GUI.Ps_workspace.Documents.snapshot_for_layer(config.layer);
			if (!this.history_source) {
				alert_box('Could not use the history brush because the history state does not contain a corresponding layer.');
				return;
			}
		}
		if (mode == 'mixer' && e.altKey) {
			//CS6: Alt+click loads the brush with the color under the pointer
			var lc = document.createElement('canvas');
			lc.width = config.WIDTH;
			lc.height = config.HEIGHT;
			app.Layers.convert_layers_to_canvas(lc.getContext('2d'), null, false);
			var ld = lc.getContext('2d').getImageData(Math.max(0, Math.min(config.WIDTH - 1, Math.round(mouse.x))), Math.max(0, Math.min(config.HEIGHT - 1, Math.round(mouse.y))), 1, 1).data;
			this.reservoir = [ld[0], ld[1], ld[2]];
			this.getParams().load_each = false;
			app.GUI.Ps_workspace.status_message('Mixer Brush loaded with rgb(' + this.reservoir.join(', ') + ')');
			app.GUI.Ps_workspace.Options_bar.render();
			return;
		}
		if (mode == 'clone') {
			var CS = app.GUI.Ps_workspace.Clone_source;
			if (e.altKey) {
				//CS6: Alt+click defines the clone source
				CS.set_source(mouse.x, mouse.y);
				app.GUI.Ps_workspace.status_message('Clone source set');
				return;
			}
			if (!CS.has_source()) {
				alert_box('Could not use the clone stamp because the area to clone has not been defined (Alt-click to define a source point).');
				return;
			}
		}
		if (mode == 'healing' && this.getParams().heal_source != 'Pattern') {
			if (e.altKey) {
				//CS6: Alt+click defines the source point
				this.source = this.to_layer(mouse);
				this.offset = null;
				app.GUI.Ps_workspace.status_message('Healing source set');
				return;
			}
			if (!this.source) {
				app.GUI.Ps_workspace.status_message('Alt-click to define a source point for the Healing Brush.');
				return;
			}
		}
		this.started = true;
		this.canvas = document.createElement('canvas');
		this.canvas.width = config.layer.width_original;
		this.canvas.height = config.layer.height_original;
		this.canvas.getContext('2d', { willReadFrequently: true }).drawImage(config.layer.link, 0, 0);
		this.last = this.to_layer(mouse);
		this.original = null;
		if (mode == 'healing') {
			var hp = this.getParams();
			this.original = document.createElement('canvas');
			this.original.width = this.canvas.width;
			this.original.height = this.canvas.height;
			this.original.getContext('2d').drawImage(this.canvas, 0, 0);
			this.heal_src = null;
			if (hp.heal_source == 'Pattern') {
				//Source: Pattern - texture from the pattern, aligned to the document
				var hl = config.layer;
				this.heal_src = Patterns.tiled(hp.pattern, hl.width_original, hl.height_original, 100, hl.x, hl.y);
				this.offset = { x: 0, y: 0 };
			}
			else {
				//Aligned keeps the offset of the first stroke after setting the source
				if (!this.offset || hp.heal_aligned === false) {
					this.offset = { x: this.source.x - this.last.x, y: this.source.y - this.last.y };
				}
				if (hp.heal_sample && hp.heal_sample != 'Current Layer') {
					//Current & Below / All Layers: the texture comes from the merged image
					var ml = config.layer, merged = document.createElement('canvas');
					merged.width = this.canvas.width;
					merged.height = this.canvas.height;
					var mctx = merged.getContext('2d');
					mctx.scale(ml.width_original / ml.width, ml.height_original / ml.height);
					mctx.translate(-ml.x, -ml.y);
					var upto = hp.heal_sample == 'All Layers' ? config.layers.length - 1 : config.layers.indexOf(ml);
					for (var li = 0; li <= upto; li++) {
						var L = config.layers[li];
						if (!L || L.visible === false) continue;
						mctx.globalAlpha = L.opacity / 100;
						app.Layers.render_object(mctx, L);
					}
					this.heal_src = merged;
				}
			}
			this.heal_dab(this.last);
		}
		if (mode == 'red_eye') {
			this.box_start = this.last;
		}
		if (mode == 'color_replace' || mode == 'bg_erase') {
			var cctx = this.canvas.getContext('2d', { willReadFrequently: true });
			this.original = cctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
			this.replace_target = this.sample_at(this.last);
			this.replace_dab(this.last);
		}
		if (mode == 'history' || mode == 'pattern_stamp') {
			this.original = this.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, this.canvas.width, this.canvas.height);
			this.source_data = this.history_source.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, this.canvas.width, this.canvas.height).data;
			this.history_mask = new Float32Array(this.canvas.width * this.canvas.height);
			this.history_dab(this.last);
		}
		if (mode == 'clone') {
			var cparams = this.getParams();
			var Clone = app.GUI.Ps_workspace.Clone_source;
			Clone.begin_stroke({ x: mouse.x, y: mouse.y }, cparams.aligned !== false);
			this.original = this.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, this.canvas.width, this.canvas.height);
			this.source_data = Clone.sample_canvas(cparams.sample || 'Current Layer').getContext('2d', { willReadFrequently: true }).getImageData(0, 0, config.WIDTH, config.HEIGHT).data;
			this.history_mask = new Float32Array(this.canvas.width * this.canvas.height);
			Clone.painting = true;
			this.clone_dab(this.last);
		}
		if (mode == 'blur' || mode == 'sharpen') {
			//Sample All Layers: the merged image is what gets blurred / sharpened
			this.merged = null;
			if (this.getParams().sample_all) {
				var mc = document.createElement('canvas');
				mc.width = config.WIDTH;
				mc.height = config.HEIGHT;
				app.Layers.convert_layers_to_canvas(mc.getContext('2d'), null, false);
				this.merged = mc.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, mc.width, mc.height);
			}
			this.focus_dab(this.last, mode == 'sharpen');
		}
		//Sample All Layers (smudge, mixer, spot healing): the other visible layers count as the paint below
		this.below = (mode == 'smudge' || mode == 'mixer' || mode == 'spot_healing') && this.getParams().sample_all ? this.below_canvas() : null;
		this.below_data = this.below ? this.below.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, this.below.width, this.below.height).data : null;
		if (mode == 'smudge' && this.getParams().finger_painting) {
			//Finger Painting: the stroke starts with the foreground color
			var fctx = this.canvas.getContext('2d');
			var fr = this.getParams().size / 2 * this.last.s;
			fctx.save();
			fctx.fillStyle = config.COLOR;
			fctx.globalAlpha = (this.getParams().strength == null ? 50 : this.getParams().strength) / 100;
			fctx.beginPath();
			fctx.arc(this.last.x, this.last.y, Math.max(0.5, fr), 0, Math.PI * 2);
			fctx.fill();
			fctx.restore();
		}
		if (mode == 'erase') {
			this.original = this.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, this.canvas.width, this.canvas.height);
			this.history_mask = new Float32Array(this.canvas.width * this.canvas.height);
			//CS6: on the Background layer the eraser paints the background color
			var ordered_layers = app.GUI.Ps_workspace.Groups.ordered();
			this.erase_bg = config.layer.name == 'Background' && ordered_layers[ordered_layers.length - 1] === config.layer ? hex_to_rgb(config.BG_COLOR) : null;
			this.erase_dab(this.last);
		}
		if (mode == 'mixer') {
			var mp = this.getParams();
			//Load the brush after each stroke (or when it is empty)
			if (mp.load_each !== false || !this.reservoir) this.reservoir = hex_to_rgb(config.COLOR);
			if (mp.clean_each !== false) this.picked = null;
			this.paint = 1;
			this.mixer_dab(this.last);
		}
		if (mode == 'art_history') {
			var actx = this.canvas.getContext('2d', { willReadFrequently: true });
			this.original = actx.getImageData(0, 0, this.canvas.width, this.canvas.height);
			this.source_data = this.history_source.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, this.canvas.width, this.canvas.height).data;
			this.art_dab(this.last);
		}
		if (this.effective_mode() == 'spot_healing') {
			//the stroke marks the area to heal
			this.spot = new Uint8Array(this.canvas.width * this.canvas.height);
			this.mark(this.last);
		}
		config.layer.link_canvas = this.canvas;
		config.need_render = true;
		this.start_buildup();
	}

	mousemove(e) {
		var mouse = this.get_mouse_info(e);
		if (!this.started || mouse.is_drag == false || mouse.click_valid == false) {
			return;
		}
		var p = this.to_layer(mouse);
		var size = this.getParams().size * p.s;
		var dx = p.x - this.last.x, dy = p.y - this.last.y;
		var dist = Math.hypot(dx, dy);
		var step = Math.max(1, size / 8);
		var mode = this.effective_mode();
		if (mode == 'spot_healing') {
			//mark every point along the stroke, including short moves
			for (var t = step; t < dist; t += step) {
				this.mark({ x: this.last.x + dx * t / dist, y: this.last.y + dy * t / dist });
			}
			this.mark(p);
			this.last = p;
		}
		else if (mode == 'red_eye') {
			this.box_end = p;
		}
		else if (mode == 'color_replace' || mode == 'bg_erase') {
			if (dist >= step) {
				var cp = this.last;
				for (var tc = step; tc <= dist; tc += step) {
					cp = { x: this.last.x + dx * tc / dist, y: this.last.y + dy * tc / dist };
					if (this.getParams().sampling == 'Continuous') this.replace_target = this.sample_at(cp);
					this.replace_dab(cp);
				}
				this.last = cp;
			}
		}
		else if (mode == 'blur' || mode == 'sharpen') {
			var fstep = Math.max(1, size / 4);
			if (dist >= fstep) {
				var fp = this.last;
				for (var tf = fstep; tf <= dist; tf += fstep) {
					fp = { x: this.last.x + dx * tf / dist, y: this.last.y + dy * tf / dist, s: p.s };
					this.focus_dab(fp, mode == 'sharpen');
				}
				this.last = fp;
			}
		}
		else if (mode == 'erase') {
			var estep = Math.max(1, (this.getParams().eraser_mode == 'Block' ? 16 / config.ZOOM * p.s : size) / 6);
			if (dist >= estep) {
				var ep = this.last;
				for (var te = estep; te <= dist; te += estep) {
					ep = { x: this.last.x + dx * te / dist, y: this.last.y + dy * te / dist };
					this.erase_dab(ep);
				}
				this.last = ep;
			}
		}
		else if (mode == 'history' || mode == 'pattern_stamp' || mode == 'clone') {
			if (dist >= step) {
				var hp = this.last;
				for (var tb = step; tb <= dist; tb += step) {
					hp = { x: this.last.x + dx * tb / dist, y: this.last.y + dy * tb / dist };
					if (mode == 'clone') this.clone_dab(hp);
					else this.history_dab(hp);
				}
				this.last = hp;
			}
		}
		else if (mode == 'mixer') {
			var mstep = Math.max(1, size / 6);
			if (dist >= mstep) {
				var mpnt = this.last;
				for (var tm = mstep; tm <= dist; tm += mstep) {
					mpnt = { x: this.last.x + dx * tm / dist, y: this.last.y + dy * tm / dist };
					this.mixer_dab(mpnt);
				}
				this.last = mpnt;
			}
		}
		else if (mode == 'art_history') {
			var astep = Math.max(2, size / 2);
			if (dist >= astep) {
				var ap = this.last;
				for (var ta = astep; ta <= dist; ta += astep) {
					ap = { x: this.last.x + dx * ta / dist, y: this.last.y + dy * ta / dist };
					this.art_dab(ap);
				}
				this.last = ap;
			}
		}
		else if (mode == 'healing') {
			if (dist >= step) {
				var hfrom = this.last;
				for (var th = step; th <= dist; th += step) {
					hfrom = { x: this.last.x + dx * th / dist, y: this.last.y + dy * th / dist };
					this.heal_dab(hfrom);
				}
				this.last = hfrom;
			}
		}
		else if (dist >= step) {
			var from = this.last;
			for (var t2 = step; t2 <= dist; t2 += step) {
				var q = { x: this.last.x + dx * t2 / dist, y: this.last.y + dy * t2 / dist };
				this.smudge(from, q);
				from = q;
			}
			this.last = from;
		}
		config.need_render = true;
	}

	mouseup(e) {
		if (!this.started) {
			return;
		}
		this.started = false;
		clearInterval(this.buildup);
		var mode = this.effective_mode();
		if (mode == 'clone') {
			app.GUI.Ps_workspace.Clone_source.painting = false;
		}
		if (mode == 'spot_healing') {
			this.heal();
		}
		if (mode == 'red_eye') {
			this.red_eye(this.box_start, this.box_end || this.box_start);
			this.box_end = null;
		}
		delete config.layer.link_canvas;
		var extra = [];
		if (mode == 'bg_erase') {
			//CS6: erasing the Background turns it into a normal layer
			var ordered = app.GUI.Ps_workspace.Groups.ordered();
			if (config.layer.name == 'Background' && ordered[ordered.length - 1] === config.layer) {
				extra.push(new app.Actions.Update_layer_action(config.layer.id, { name: 'Layer 0' }));
			}
		}
		var labels = { blur: 'Blur Tool', sharpen: 'Sharpen Tool', erase: 'Eraser', clone: 'Clone Stamp', bg_erase: 'Background Eraser', pattern_stamp: 'Pattern Stamp', color_replace: 'Color Replacement Tool', history: 'History Brush', art_history: 'Art History Brush', mixer: 'Mixer Brush', smudge: 'Smudge Tool', spot_healing: 'Spot Healing Brush', healing: 'Healing Brush', red_eye: 'Red Eye Tool' };
		app.State.do_action(new app.Actions.Bundle_action('retouch', labels[mode] || 'Retouch', [
			new app.Actions.Update_layer_image_action(app.GUI.Ps_workspace.Selection.restrict(this.canvas, config.layer)),
		].concat(extra)));
		this.canvas = null;
		this.spot = null;
		this.original = null;
		this.source_data = null;
		this.history_mask = null;
	}

	/**
	 * Color Replacement: the sampled color (Continuous / Once / Background Swatch)
	 */
	sample_at(p) {
		var params = this.getParams();
		if (params.sampling == 'Background Swatch') {
			var bg = config.BG_COLOR;
			return [parseInt(bg.substr(1, 2), 16), parseInt(bg.substr(3, 2), 16), parseInt(bg.substr(5, 2), 16)];
		}
		var w = this.canvas.width, x = Math.max(0, Math.min(w - 1, Math.round(p.x))), y = Math.max(0, Math.min(this.canvas.height - 1, Math.round(p.y)));
		var d = this.original.data, i = (y * w + x) * 4;
		return [d[i], d[i + 1], d[i + 2]];
	}

	/**
	 * Color Replacement dab: pixels within Tolerance of the sampled color take the
	 * foreground color's hue/saturation (Color), or only hue / saturation / luminosity
	 */
	replace_dab(p) {
		var params = this.getParams();
		var layer = config.layer;
		var r = Math.max(1, params.size / 2 * (layer.width_original / layer.width));
		var w = this.canvas.width, h = this.canvas.height;
		var x0 = Math.max(0, Math.floor(p.x - r)), y0 = Math.max(0, Math.floor(p.y - r));
		var x1 = Math.min(w, Math.ceil(p.x + r)), y1 = Math.min(h, Math.ceil(p.y + r));
		if (x1 <= x0 || y1 <= y0) return;
		var bw = x1 - x0, bh = y1 - y0;
		var ctx = this.canvas.getContext('2d', { willReadFrequently: true });
		var img = ctx.getImageData(x0, y0, bw, bh);
		var D = img.data, O = this.original.data;
		var t = this.replace_target, tol = (params.tolerance == null ? 30 : params.tolerance) / 100 * 255 * 1.2;
		var fg = config.COLOR;
		var fr = parseInt(fg.substr(1, 2), 16), fgc = parseInt(fg.substr(3, 2), 16), fb = parseInt(fg.substr(5, 2), 16);
		var fh = this.hsl(fr, fgc, fb);
		var mode = params.replace_mode || 'Color';
		var match = new Uint8Array(bw * bh);
		for (var y = y0; y < y1; y++) {
			for (var x = x0; x < x1; x++) {
				if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) > r) continue;
				var i = (y * w + x) * 4;
				if (Math.abs(O[i] - t[0]) + Math.abs(O[i + 1] - t[1]) + Math.abs(O[i + 2] - t[2]) <= tol * 1.5) match[(y - y0) * bw + (x - x0)] = 1;
			}
		}
		if (params.limits != 'Discontiguous') {
			//Contiguous: only matching pixels connected to the brush center
			var keep = new Uint8Array(bw * bh), stack = [];
			var cx = Math.max(0, Math.min(bw - 1, Math.round(p.x) - x0)), cy = Math.max(0, Math.min(bh - 1, Math.round(p.y) - y0));
			if (match[cy * bw + cx]) { stack.push(cy * bw + cx); keep[cy * bw + cx] = 1; }
			while (stack.length) {
				var k = stack.pop(), kx = k % bw, ky = (k / bw) | 0;
				for (var [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
					var nx = kx + ax, ny = ky + ay;
					if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
					var nk = ny * bw + nx;
					if (match[nk] && !keep[nk]) { keep[nk] = 1; stack.push(nk); }
				}
			}
			match = keep;
		}
		var erase = params.mode == 'bg_erase';
		for (var j = 0; j < match.length; j++) {
			if (!match[j]) continue;
			var px = x0 + (j % bw), py = y0 + ((j / bw) | 0), oi = (py * w + px) * 4, di = j * 4;
			if (erase) {
				if (params.protect_fg && Math.abs(O[oi] - fr) + Math.abs(O[oi + 1] - fgc) + Math.abs(O[oi + 2] - fb) <= tol) continue;
				//soft edge of the brush
				var dd = Math.hypot(px + 0.5 - p.x, py + 0.5 - p.y) / r;
				var keep = dd < 0.8 ? 0 : (dd - 0.8) / 0.2;
				D[di + 3] = Math.min(D[di + 3], O[oi + 3] * keep);
				continue;
			}
			var c = this.hsl(O[oi], O[oi + 1], O[oi + 2]);
			var hh = c[0], ss = c[1], ll = c[2];
			if (mode == 'Color') { hh = fh[0]; ss = fh[1]; }
			else if (mode == 'Hue') { hh = fh[0]; }
			else if (mode == 'Saturation') { ss = fh[1]; }
			else if (mode == 'Luminosity') { ll = fh[2]; }
			var rgb = this.rgb(hh, ss, ll);
			//Anti-alias: the brush rim and the edge of the matched area are blended
			var amt = 1;
			if (params.replace_aa !== false) {
				amt = Math.max(0, Math.min(1, r - Math.hypot(px + 0.5 - p.x, py + 0.5 - p.y) + 0.5));
				var jx = j % bw, jy = (j / bw) | 0;
				if ((jx > 0 && !match[j - 1]) || (jx < bw - 1 && !match[j + 1]) || (jy > 0 && !match[j - bw]) || (jy < bh - 1 && !match[j + bw])) amt *= 0.5;
			}
			for (var cc = 0; cc < 3; cc++) D[di + cc] = O[oi + cc] + (rgb[cc] - O[oi + cc]) * amt;
		}
		ctx.putImageData(img, x0, y0);
	}

	hsl(r, g, b) {
		r /= 255; g /= 255; b /= 255;
		var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, h = 0, s = 0;
		if (max != min) {
			var d = max - min;
			s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
			if (max == r) h = (g - b) / d + (g < b ? 6 : 0);
			else if (max == g) h = (b - r) / d + 2;
			else h = (r - g) / d + 4;
			h /= 6;
		}
		return [h, s, l];
	}

	rgb(h, s, l) {
		if (s == 0) return [l * 255, l * 255, l * 255];
		var f = (p, q, t) => {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1 / 6) return p + (q - p) * 6 * t;
			if (t < 1 / 2) return q;
			if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
			return p;
		};
		var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
		return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
	}

	/**
	 * History Brush dab: paint back the snapshot pixels. Coverage within one stroke
	 * never exceeds Opacity (CS6 behaviour), so overlapping dabs don't build up.
	 */
	history_dab(p) {
		var params = this.getParams();
		var layer = config.layer;
		var r = Math.max(1, params.size / 2 * (layer.width_original / layer.width));
		var opacity = (params.opacity == null ? 100 : params.opacity) / 100;
		var flow = (params.flow == null ? 100 : params.flow) / 100;
		var mode = params.blend;
		var w = this.canvas.width, h = this.canvas.height;
		var x0 = Math.max(0, Math.floor(p.x - r)), y0 = Math.max(0, Math.floor(p.y - r));
		var x1 = Math.min(w, Math.ceil(p.x + r)), y1 = Math.min(h, Math.ceil(p.y + r));
		if (x1 <= x0 || y1 <= y0) return;
		var ctx = this.canvas.getContext('2d', { willReadFrequently: true });
		var img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
		var O = this.original.data, S = this.source_data, M = this.history_mask;
		var daub = null;
		if (params.mode == 'pattern_stamp' && params.impressionist) {
			//Impressionist: each dab is a daub of the pattern's average color near the pointer
			var jx = p.x + (Math.random() - 0.5) * r, jy = p.y + (Math.random() - 0.5) * r, acc = [0, 0, 0, 0], n = 0;
			for (var ay = Math.max(0, Math.floor(jy - r / 2)); ay < Math.min(h, Math.ceil(jy + r / 2)); ay++) {
				for (var ax = Math.max(0, Math.floor(jx - r / 2)); ax < Math.min(w, Math.ceil(jx + r / 2)); ax++) {
					var ai = (ay * w + ax) * 4;
					for (var c = 0; c < 4; c++) acc[c] += S[ai + c];
					n++;
				}
			}
			if (n) daub = acc.map(v => v / n);
		}
		for (var y = y0; y < y1; y++) {
			for (var x = x0; x < x1; x++) {
				var d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) / r;
				if (d > 1) continue;
				var k = y * w + x;
				var f = opacity * (d < 0.8 ? 1 : (1 - d) / 0.2);
				if (f <= M[k]) continue;
				//Flow builds up to the Opacity within a stroke
				M[k] = M[k] + (f - M[k]) * flow;
				var i = k * 4, j = ((y - y0) * (x1 - x0) + (x - x0)) * 4;
				if (daub) this.mix(O, i, daub, 0, M[k], mode, img.data, j);
				else this.mix(O, i, S, i, M[k], mode, img.data, j);
			}
		}
		ctx.putImageData(img, x0, y0);
	}

	/**
	 * a stamp pixel: source S over original O at strength m in the Mode
	 */
	mix(O, i, S, si, m, mode, out, j) {
		if (!mode || mode == 'Normal') {
			for (var c = 0; c < 4; c++) out[j + c] = O[i + c] + (S[si + c] - O[i + c]) * m;
			return;
		}
		var sa = S[si + 3] / 255 * m;
		var b = [O[i] / 255, O[i + 1] / 255, O[i + 2] / 255], s = [S[si] / 255, S[si + 1] / 255, S[si + 2] / 255];
		var bl = O[i + 3] ? blend_rgb(mode, b, s) : s;
		for (var c2 = 0; c2 < 3; c2++) out[j + c2] = O[i + c2] + (Math.max(0, Math.min(1, bl[c2])) * 255 - O[i + c2]) * sa;
		out[j + 3] = O[i + 3] + (255 - O[i + 3]) * sa;
	}

	/**
	 * Mode of the focus / smudge tools: how the new color replaces the old one
	 */
	tone_mode(mode, o, n) {
		if (!mode || mode == 'Normal') return n;
		if (mode == 'Darken') return [Math.min(o[0], n[0]), Math.min(o[1], n[1]), Math.min(o[2], n[2])];
		if (mode == 'Lighten') return [Math.max(o[0], n[0]), Math.max(o[1], n[1]), Math.max(o[2], n[2])];
		var a = this.hsl(o[0], o[1], o[2]), b = this.hsl(n[0], n[1], n[2]);
		if (mode == 'Hue') return this.rgb(b[0], a[1], a[2]);
		if (mode == 'Saturation') return this.rgb(a[0], b[1], a[2]);
		if (mode == 'Color') return this.rgb(b[0], b[1], a[2]);
		if (mode == 'Luminosity') return this.rgb(a[0], a[1], b[2]);
		return n;
	}

	/**
	 * Blur / Sharpen dab: a 3 x 3 average (blur) or unsharp step (sharpen) of
	 * the current pixels (or the merged image), Strength per dab, soft edge;
	 * Protect Detail keeps sharpened values within the local range (no halos)
	 */
	focus_dab(p, sharpen) {
		var params = this.getParams();
		var layer = config.layer;
		var s = layer.width_original / layer.width;
		var r = Math.max(1, params.size / 2 * s);
		var strength = (params.strength == null ? 50 : params.strength) / 100;
		var w = this.canvas.width, h = this.canvas.height;
		var x0 = Math.max(0, Math.floor(p.x - r)), y0 = Math.max(0, Math.floor(p.y - r));
		var x1 = Math.min(w, Math.ceil(p.x + r)), y1 = Math.min(h, Math.ceil(p.y + r));
		if (x1 <= x0 || y1 <= y0) return;
		//read with a 1 pixel margin for the 3 x 3 neighbourhood
		var rx0 = Math.max(0, x0 - 1), ry0 = Math.max(0, y0 - 1), rx1 = Math.min(w, x1 + 1), ry1 = Math.min(h, y1 + 1), rw = rx1 - rx0;
		var ctx = this.canvas.getContext('2d', { willReadFrequently: true });
		var img = ctx.getImageData(rx0, ry0, rw, ry1 - ry0), D = img.data, out = new Uint8ClampedArray(D);
		var M = this.merged, MW = M ? M.width : 0, MH = M ? M.height : 0;
		var src = (x, y, c) => {
			if (!M) return D[((y - ry0) * rw + (x - rx0)) * 4 + c];
			var mx = Math.min(MW - 1, Math.max(0, Math.round(x / s + layer.x))), my = Math.min(MH - 1, Math.max(0, Math.round(y / s + layer.y)));
			return M.data[(my * MW + mx) * 4 + c];
		};
		var mode = params.focus_mode || 'Normal';
		var protect = params.protect_detail !== false;
		for (var y = y0; y < y1; y++) {
			for (var x = x0; x < x1; x++) {
				var d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) / r;
				if (d > 1) continue;
				var f = strength * (d < 0.6 ? 1 : (1 - d) / 0.4);
				var i = ((y - ry0) * rw + (x - rx0)) * 4;
				var o = [D[i], D[i + 1], D[i + 2]], n = [0, 0, 0];
				for (var c = 0; c < 3; c++) {
					var sum = 0, cnt = 0, mn = 255, mxv = 0;
					for (var yy = Math.max(ry0, y - 1); yy <= Math.min(ry1 - 1, y + 1); yy++) {
						for (var xx = Math.max(rx0, x - 1); xx <= Math.min(rx1 - 1, x + 1); xx++) {
							var v = src(xx, yy, c);
							sum += v;
							cnt++;
							if (v < mn) mn = v;
							if (v > mxv) mxv = v;
						}
					}
					var avg = sum / cnt, cur = src(x, y, c);
					var target = sharpen ? cur + (cur - avg) * 1.5 : avg;
					if (sharpen && protect) target = Math.max(mn, Math.min(mxv, target));
					n[c] = target;
				}
				var t = this.tone_mode(mode, o, n);
				for (var c2 = 0; c2 < 3; c2++) out[i + c2] = o[c2] + (t[c2] - o[c2]) * f;
			}
		}
		ctx.putImageData(new ImageData(out, rw, ry1 - ry0), rx0, ry0);
	}

	/**
	 * Eraser dab (Brush: soft by hardness, Pencil: hard, Block: 16 screen pixels
	 * square). Opacity caps what one stroke removes; Flow builds up to it.
	 */
	erase_dab(p) {
		var params = this.getParams();
		var layer = config.layer;
		var s = layer.width_original / layer.width;
		var block = params.eraser_mode == 'Block';
		var r = block ? 8 / config.ZOOM * s : Math.max(0.5, params.size / 2 * s);
		var hard = params.eraser_mode == 'Pencil' ? 1 : (params.hardness == null ? 100 : params.hardness) / 100;
		var opacity = block ? 1 : (params.opacity == null ? 100 : params.opacity) / 100;
		var flow = block ? 1 : (params.flow == null ? 100 : params.flow) / 100;
		var w = this.canvas.width, h = this.canvas.height;
		var x0 = Math.max(0, Math.floor(p.x - r)), y0 = Math.max(0, Math.floor(p.y - r));
		var x1 = Math.min(w, Math.ceil(p.x + r)), y1 = Math.min(h, Math.ceil(p.y + r));
		if (x1 <= x0 || y1 <= y0) return;
		var ctx = this.canvas.getContext('2d', { willReadFrequently: true });
		var img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
		var O = this.original.data, M = this.history_mask, bg = this.erase_bg;
		for (var y = y0; y < y1; y++) {
			for (var x = x0; x < x1; x++) {
				var cov;
				if (block) cov = 1;
				else {
					var d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) / r;
					if (d > 1) continue;
					cov = hard >= 1 ? 1 : (d <= hard ? 1 : (1 - d) / (1 - hard));
				}
				var k = y * w + x;
				var target = opacity * cov;
				if (target <= M[k]) continue;
				M[k] = M[k] + (target - M[k]) * flow;
				var i = k * 4, j = ((y - y0) * (x1 - x0) + (x - x0)) * 4, m = M[k];
				if (bg) {
					for (var c = 0; c < 3; c++) img.data[j + c] = O[i + c] + (bg[c] - O[i + c]) * m;
					img.data[j + 3] = O[i + 3];
				}
				else {
					img.data[j + 3] = O[i + 3] * (1 - m);
				}
			}
		}
		ctx.putImageData(img, x0, y0);
	}

	/**
	 * Clone Stamp dab: pixels from the sampled image at the Clone Source
	 * position (offset, scale and rotation), bilinear when transformed
	 */
	clone_dab(p) {
		var params = this.getParams();
		var layer = config.layer;
		var sx = layer.width_original / layer.width, sy = layer.height_original / layer.height;
		var r = Math.max(1, params.size / 2 * sx);
		var opacity = (params.opacity == null ? 100 : params.opacity) / 100;
		var w = this.canvas.width, h = this.canvas.height, W = config.WIDTH, H = config.HEIGHT;
		var x0 = Math.max(0, Math.floor(p.x - r)), y0 = Math.max(0, Math.floor(p.y - r));
		var x1 = Math.min(w, Math.ceil(p.x + r)), y1 = Math.min(h, Math.ceil(p.y + r));
		if (x1 <= x0 || y1 <= y0) return;
		var Clone = app.GUI.Ps_workspace.Clone_source;
		var smooth = Clone.transformed();
		var flow = (params.flow == null ? 100 : params.flow) / 100;
		var ctx = this.canvas.getContext('2d', { willReadFrequently: true });
		var img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
		var O = this.original.data, S = this.source_data, M = this.history_mask;
		var px = [0, 0, 0, 0];
		var fetch = (fx, fy) => {
			if (!smooth) {
				var ix = Math.round(fx - 0.5), iy = Math.round(fy - 0.5);
				if (ix < 0 || iy < 0 || ix >= W || iy >= H) return null;
				var o = (iy * W + ix) * 4;
				px[0] = S[o]; px[1] = S[o + 1]; px[2] = S[o + 2]; px[3] = S[o + 3];
				return px;
			}
			var gx = fx - 0.5, gy = fy - 0.5, ax = Math.floor(gx), ay = Math.floor(gy), tx = gx - ax, ty = gy - ay;
			if (ax < 0 || ay < 0 || ax + 1 >= W || ay + 1 >= H) return null;
			var o00 = (ay * W + ax) * 4, o10 = o00 + 4, o01 = o00 + W * 4, o11 = o01 + 4;
			for (var c = 0; c < 4; c++) {
				px[c] = (S[o00 + c] * (1 - tx) + S[o10 + c] * tx) * (1 - ty) + (S[o01 + c] * (1 - tx) + S[o11 + c] * tx) * ty;
			}
			return px;
		};
		for (var y = y0; y < y1; y++) {
			for (var x = x0; x < x1; x++) {
				var d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) / r;
				if (d > 1) continue;
				var k = y * w + x;
				var f = opacity * (d < 0.8 ? 1 : (1 - d) / 0.2);
				if (f <= M[k]) continue;
				var src = Clone.map({ x: layer.x + (x + 0.5) / sx, y: layer.y + (y + 0.5) / sy });
				var sp = fetch(src.x, src.y);
				if (!sp) continue;
				M[k] = M[k] + (f - M[k]) * flow;
				var i = k * 4, j = ((y - y0) * (x1 - x0) + (x - x0)) * 4;
				if (params.blend && params.blend != 'Normal') {
					this.mix(O, i, sp, 0, M[k], params.blend, img.data, j);
					continue;
				}
				//source-over of the sampled pixel at strength M
				var sa = sp[3] / 255 * M[k], da = O[i + 3] / 255, oa = sa + da * (1 - sa);
				if (oa <= 0) { img.data[j + 3] = 0; continue; }
				for (var c = 0; c < 3; c++) {
					img.data[j + c] = (sp[c] * sa + O[i + c] * da * (1 - sa)) / oa;
				}
				img.data[j + 3] = oa * 255;
			}
		}
		ctx.putImageData(img, x0, y0);
	}

	/**
	 * Art History Brush dab: a few stylized strokes around p within Area, each in
	 * the snapshot's color at its start, running along the edges (perpendicular
	 * to the luminance gradient). Tolerance limits strokes to areas that differ
	 * from the snapshot.
	 */
	art_dab(p) {
		var params = this.getParams();
		var layer = config.layer;
		var s = layer.width_original / layer.width;
		var r = Math.max(0.5, params.size / 2 * s);
		var area = Math.max(1, (params.area == null ? 50 : params.area) * s);
		var opacity = (params.opacity == null ? 100 : params.opacity) / 100;
		var tol = (params.tolerance || 0) / 100 * 255 * 3;
		var spec = ART_STYLES[params.art_style] || ART_STYLES['Tight Short'];
		var w = this.canvas.width, h = this.canvas.height, S = this.source_data, O = this.original.data;
		var lum = (x, y) => {
			x = Math.max(0, Math.min(w - 1, Math.round(x)));
			y = Math.max(0, Math.min(h - 1, Math.round(y)));
			var i = (y * w + x) * 4;
			return S[i] * 0.299 + S[i + 1] * 0.587 + S[i + 2] * 0.114;
		};
		var ctx = this.canvas.getContext('2d', { willReadFrequently: true });
		ctx.save();
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.lineWidth = r * 2;
		ctx.globalAlpha = opacity;
		//options bar Mode
		ctx.globalCompositeOperation = { Darken: 'darken', Lighten: 'lighten', Hue: 'hue', Saturation: 'saturation', Color: 'color', Luminosity: 'luminosity' }[params.art_mode] || 'source-over';
		var count = Math.max(2, Math.min(12, Math.round(area / Math.max(2, r))));
		for (var n = 0; n < count; n++) {
			var a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * area;
			var qx = p.x + Math.cos(a) * d, qy = p.y + Math.sin(a) * d;
			var ix = Math.round(qx), iy = Math.round(qy);
			if (ix < 0 || iy < 0 || ix >= w || iy >= h) continue;
			var i = (iy * w + ix) * 4;
			if (S[i + 3] == 0) continue;
			if (tol > 0 && Math.abs(S[i] - O[i]) + Math.abs(S[i + 1] - O[i + 1]) + Math.abs(S[i + 2] - O[i + 2]) < tol) continue;
			ctx.strokeStyle = 'rgba(' + S[i] + ',' + S[i + 1] + ',' + S[i + 2] + ',' + (S[i + 3] / 255) + ')';
			//along the edge, with some randomness for the loose styles
			var gx = lum(qx + 2, qy) - lum(qx - 2, qy), gy = lum(qx, qy + 2) - lum(qx, qy - 2);
			var dir = (gx || gy) ? Math.atan2(gy, gx) + Math.PI / 2 : Math.random() * Math.PI * 2;
			dir += (Math.random() - 0.5) * spec.loose;
			var len = Math.max(r * 2, area * spec.length) * (0.6 + Math.random() * 0.8);
			ctx.beginPath();
			ctx.moveTo(qx, qy);
			if (spec.dab) {
				ctx.lineTo(qx + 0.01, qy);
			}
			else {
				var cx = qx, cy = qy, steps = 6, turn = spec.curl * (Math.random() < 0.5 ? -1 : 1) / steps;
				for (var k = 1; k <= steps; k++) {
					dir += turn;
					cx += Math.cos(dir) * len / steps;
					cy += Math.sin(dir) * len / steps;
					ctx.lineTo(cx, cy);
				}
			}
			ctx.stroke();
		}
		ctx.restore();
	}

	/**
	 * Mixer Brush dab: the brush's paint (reservoir) mixes with the canvas color
	 * under it (Mix), picks some of it up (Wet) and runs out over the stroke (Load)
	 */
	mixer_dab(p) {
		var params = this.getParams();
		var layer = config.layer;
		var r = Math.max(1, params.size / 2 * (layer.width_original / layer.width));
		var w = this.canvas.width, h = this.canvas.height;
		var x0 = Math.max(0, Math.floor(p.x - r)), y0 = Math.max(0, Math.floor(p.y - r));
		var x1 = Math.min(w, Math.ceil(p.x + r)), y1 = Math.min(h, Math.ceil(p.y + r));
		if (x1 <= x0 || y1 <= y0) return;
		var ctx = this.canvas.getContext('2d', { willReadFrequently: true });
		var img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0), d = img.data;
		//canvas color under the brush (Sample All Layers: as seen, with the layers below)
		var seen = d;
		if (this.below_data) {
			seen = new Uint8ClampedArray(d);
			this.over_below(seen, x0, y0, x1 - x0, y1 - y0);
		}
		var cr = 0, cg = 0, cb = 0, ca = 0;
		for (var i = 0; i < seen.length; i += 4) { var a = seen[i + 3]; cr += seen[i] * a; cg += seen[i + 1] * a; cb += seen[i + 2] * a; ca += a; }
		var wet = (params.wet == null ? 50 : params.wet) / 100, mix = (params.mix == null ? 50 : params.mix) / 100;
		var load = Math.max(1, params.load == null ? 50 : params.load), flow = (params.flow == null ? 100 : params.flow) / 100;
		var res = this.reservoir || [0, 0, 0];
		var color = res.slice();
		if (ca > 0 && wet > 0) {
			var under = [cr / ca, cg / ca, cb / ca];
			color = res.map((v, k) => v + (under[k] - v) * mix * wet);
			//the brush picks up some of the canvas paint
			this.reservoir = res.map((v, k) => v + (under[k] - v) * wet * 0.08);
		}
		//paint runs out: Load is how many dabs' worth the brush holds
		var amount = this.paint * flow;
		this.paint = Math.max(0, this.paint - 1 / (load * 3));
		if (wet == 0 && this.paint <= 0) return;
		amount = Math.max(wet > 0 ? 0.15 * flow : 0, amount);
		for (var y = y0; y < y1; y++) {
			for (var x = x0; x < x1; x++) {
				var dd = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) / r;
				if (dd > 1) continue;
				var f = amount * (dd < 0.7 ? 1 : (1 - dd) / 0.3);
				var j = ((y - y0) * (x1 - x0) + (x - x0)) * 4;
				for (var c = 0; c < 3; c++) d[j + c] = d[j + c] + (color[c] - d[j + c]) * f;
				d[j + 3] = d[j + 3] + (255 - d[j + 3]) * f;
			}
		}
		ctx.putImageData(img, x0, y0);
		app.GUI.Ps_workspace.Options_bar.update_readouts && this.update_swatch();
	}

	update_swatch() {
		var sw = document.getElementById('ps_mixer_load');
		if (sw && this.reservoir) sw.style.background = 'rgb(' + this.reservoir.map(Math.round).join(',') + ')';
	}

	/**
	 * Smudge: blend the patch under `from` into `to`
	 */
	smudge(from, to) {
		var params = this.getParams();
		var layer = config.layer;
		var r = Math.max(1, params.size / 2 * (layer.width_original / layer.width));
		var strength = (params.strength == null ? 50 : params.strength) / 100;
		var ctx = this.canvas.getContext('2d', { willReadFrequently: true });
		var size = Math.ceil(r * 2);
		var sx = Math.round(from.x - r), sy = Math.round(from.y - r);
		var tx = Math.round(to.x - r), ty = Math.round(to.y - r);
		var src = ctx.getImageData(sx, sy, size, size);
		var dst = ctx.getImageData(tx, ty, size, size);
		if (this.below_data) {
			this.over_below(src.data, sx, sy, size);
			this.over_below(dst.data, tx, ty, size);
		}
		for (var y = 0; y < size; y++) {
			for (var x = 0; x < size; x++) {
				var d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
				if (d > 1) continue;
				var f = strength * (1 - d * d);
				var i = (y * size + x) * 4;
				var mixed = [0, 1, 2, 3].map(c => dst.data[i + c] + (src.data[i + c] - dst.data[i + c]) * f);
				if (params.focus_mode && params.focus_mode != 'Normal') {
					var tm = this.tone_mode(params.focus_mode, [dst.data[i], dst.data[i + 1], dst.data[i + 2]], mixed);
					mixed[0] = tm[0]; mixed[1] = tm[1]; mixed[2] = tm[2];
				}
				for (var c = 0; c < 4; c++) dst.data[i + c] = mixed[c];
			}
		}
		ctx.putImageData(dst, tx, ty);
	}

	/**
	 * Sample All Layers: the visible layers except this one, in this layer's pixel grid
	 */
	below_canvas() {
		var layer = config.layer, s = layer.width_original / layer.width;
		var doc = document.createElement('canvas');
		doc.width = config.WIDTH;
		doc.height = config.HEIGHT;
		var was = layer.visible;
		layer.visible = false;
		try { app.Layers.convert_layers_to_canvas(doc.getContext('2d'), null, false); }
		finally { layer.visible = was; }
		var c = document.createElement('canvas');
		c.width = this.canvas.width;
		c.height = this.canvas.height;
		c.getContext('2d').drawImage(doc, -layer.x * s, -layer.y * s, config.WIDTH * s, config.HEIGHT * s);
		return c;
	}

	/**
	 * a patch of this layer (size x size at x0, y0) composited over the layers below
	 */
	over_below(d, x0, y0, size, h) {
		var B = this.below_data, W = this.canvas.width, H = this.canvas.height;
		h = h || size;
		for (var y = 0; y < h; y++) {
			var yy = y0 + y;
			if (yy < 0 || yy >= H) continue;
			for (var x = 0; x < size; x++) {
				var xx = x0 + x;
				if (xx < 0 || xx >= W) continue;
				var i = (y * size + x) * 4, j = (yy * W + xx) * 4;
				var ca = d[i + 3] / 255, ba = B[j + 3] / 255, a = ca + ba * (1 - ca);
				if (a <= 0) continue;
				for (var c = 0; c < 3; c++) d[i + c] = (d[i + c] * ca + B[j + c] * ba * (1 - ca)) / a;
				d[i + 3] = a * 255;
			}
		}
	}

	/**
	 * Healing Brush dab: copy texture from the source, shifted to the destination's color
	 */
	heal_dab(p) {
		var layer = config.layer;
		var r = Math.max(1, this.getParams().size / 2 * (layer.width_original / layer.width));
		var size = Math.ceil(r * 2);
		var tx = Math.round(p.x - r), ty = Math.round(p.y - r);
		var sx = Math.round(p.x + this.offset.x - r), sy = Math.round(p.y + this.offset.y - r);
		var octx = this.original.getContext('2d', { willReadFrequently: true });
		var src = (this.heal_src || this.original).getContext('2d', { willReadFrequently: true }).getImageData(sx, sy, size, size).data;
		var under = octx.getImageData(tx, ty, size, size).data;
		var heal_mode = this.getParams().heal_mode || 'Normal';
		var ctx = this.canvas.getContext('2d', { willReadFrequently: true });
		var dst = ctx.getImageData(tx, ty, size, size);
		//mean color of the source and destination rings (texture from source, tone from destination)
		var ms = [0, 0, 0], md = [0, 0, 0], n = 0;
		for (var y = 0; y < size; y++) {
			for (var x = 0; x < size; x++) {
				var d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
				if (d < 0.8 || d > 1) continue;
				var i = (y * size + x) * 4;
				for (var c = 0; c < 3; c++) { ms[c] += src[i + c]; md[c] += under[i + c]; }
				n++;
			}
		}
		if (n) for (var c2 = 0; c2 < 3; c2++) { ms[c2] /= n; md[c2] /= n; }
		for (var y2 = 0; y2 < size; y2++) {
			for (var x2 = 0; x2 < size; x2++) {
				var d2 = Math.hypot(x2 + 0.5 - r, y2 + 0.5 - r) / r;
				if (d2 > 1) continue;
				var f = d2 < 0.6 ? 1 : 1 - (d2 - 0.6) / 0.4;
				var k = (y2 * size + x2) * 4;
				//Replace keeps the source as it is; the other modes heal (source texture,
				//destination tone), then blend with what is there
				var healed = [0, 1, 2].map(c3 => (heal_mode == 'Replace' ? src[k + c3] : src[k + c3] - ms[c3] + md[c3]));
				if (heal_mode != 'Normal' && heal_mode != 'Replace') {
					//blended with the pixels from before the stroke, so overlapping dabs do not compound
					healed = blend_rgb(heal_mode, [under[k] / 255, under[k + 1] / 255, under[k + 2] / 255], healed.map(v => Math.max(0, Math.min(255, v)) / 255)).map(v => v * 255);
				}
				for (var c3 = 0; c3 < 3; c3++) {
					dst.data[k + c3] = dst.data[k + c3] + (healed[c3] - dst.data[k + c3]) * f;
				}
			}
		}
		ctx.putImageData(dst, tx, ty);
	}

	/**
	 * Red Eye: remove red from pupils inside the clicked/dragged area
	 */
	red_eye(a, b) {
		var layer = config.layer;
		var r = Math.max(4, this.getParams().size / 2 * (layer.width_original / layer.width));
		var x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
		if (x1 - x0 < 4 && y1 - y0 < 4) {
			x0 -= r; y0 -= r; x1 += r; y1 += r;
		}
		x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
		x1 = Math.min(this.canvas.width, Math.ceil(x1)); y1 = Math.min(this.canvas.height, Math.ceil(y1));
		if (x1 <= x0 || y1 <= y0) return;
		var ctx = this.canvas.getContext('2d', { willReadFrequently: true });
		var img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
		var d = img.data;
		var darken = (this.getParams().strength == null ? 50 : this.getParams().strength) / 100;
		for (var i = 0; i < d.length; i += 4) {
			var rr = d[i], g = d[i + 1], bb = d[i + 2];
			if (rr > 60 && rr > g * 1.5 && rr > bb * 1.5) {
				var v = (g + bb) / 2 * (1 - darken * 0.6);
				d[i] = v;
				d[i + 1] = Math.min(g, v + 4);
				d[i + 2] = Math.min(bb, v + 4);
			}
		}
		ctx.putImageData(img, x0, y0);
	}

	mark(p) {
		var layer = config.layer;
		var r = Math.max(1, this.getParams().size / 2 * (layer.width_original / layer.width));
		var w = this.canvas.width, h = this.canvas.height;
		for (var y = Math.max(0, Math.floor(p.y - r)); y < Math.min(h, Math.ceil(p.y + r)); y++) {
			for (var x = Math.max(0, Math.floor(p.x - r)); x < Math.min(w, Math.ceil(p.x + r)); x++) {
				if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) <= r) {
					this.spot[y * w + x] = 1;
				}
			}
		}
		//show the marked area while dragging (CS6 shows a dark stroke)
		var ctx = this.canvas.getContext('2d');
		ctx.fillStyle = 'rgba(0,0,0,0.25)';
		ctx.beginPath();
		ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
		ctx.fill();
	}

	/**
	 * the marked pixels filled from their surroundings by the options bar Type
	 */
	heal() {
		var ctx = this.canvas.getContext('2d', { willReadFrequently: true });
		//start from the untouched layer pixels (the preview tint is discarded)
		ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		ctx.drawImage(config.layer.link, 0, 0);
		var mode = this.getParams().heal_mode || 'Normal';
		var before = mode != 'Normal' && mode != 'Replace' ? ctx.getImageData(0, 0, this.canvas.width, this.canvas.height) : null;
		//Type: Proximity Match, Create Texture or Content-Aware
		var fill = { 'Proximity Match': proximity_match, 'Create Texture': create_texture }[this.getParams().spot_type] || content_aware;
		if (this.below) {
			//Sample All Layers: heal what is seen (this layer over the others), keep only the spot
			var seen = document.createElement('canvas');
			seen.width = this.canvas.width;
			seen.height = this.canvas.height;
			var sctx = seen.getContext('2d', { willReadFrequently: true });
			sctx.drawImage(this.below, 0, 0);
			sctx.drawImage(config.layer.link, 0, 0);
			if (before) before = sctx.getImageData(0, 0, seen.width, seen.height);
			fill(seen, this.spot);
			var healed = sctx.getImageData(0, 0, seen.width, seen.height).data;
			var own = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
			for (var q = 0; q < this.spot.length; q++) {
				if (!this.spot[q]) continue;
				for (var cc = 0; cc < 4; cc++) own.data[q * 4 + cc] = healed[q * 4 + cc];
			}
			ctx.putImageData(own, 0, 0);
		}
		else fill(this.canvas, this.spot);
		if (before) {
			//Mode: the healed pixels blended with the original ones
			var img = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height), d = img.data, o = before.data;
			for (var k = 0; k < this.spot.length; k++) {
				if (!this.spot[k]) continue;
				var i = k * 4;
				var m = blend_rgb(mode, [o[i] / 255, o[i + 1] / 255, o[i + 2] / 255], [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255]);
				d[i] = m[0] * 255; d[i + 1] = m[1] * 255; d[i + 2] = m[2] * 255;
			}
			ctx.putImageData(img, 0, 0);
		}
	}
}

export default Retouch_class;
