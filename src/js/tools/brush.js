import app from './../app.js';
import config from './../config.js';
import { commit_stroke } from './../ps/stroke.js';
import Patterns from './../ps/patterns.js';
import { ensure_pixel_layer } from './../ps/pixel-layer.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import { tip_canvas } from './../ps/brush-tips.js';

/**
 * Color Dynamics: the dab color from the foreground/background mix and the
 * hue / saturation / brightness jitter and purity (r(n) = per-dab random 0..1)
 */
function dab_color(fg, bg, p, r) {
	var h2 = (c) => [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)];
	var a = h2(fg), b = h2(bg), t = (p.fgbg_jitter || 0) / 100 * r(11);
	var rgb = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(v => v / 255);
	var mx = Math.max.apply(null, rgb), mn = Math.min.apply(null, rgb), d = mx - mn, h = 0;
	if (d) h = mx == rgb[0] ? ((rgb[1] - rgb[2]) / d) % 6 : (mx == rgb[1] ? (rgb[2] - rgb[0]) / d + 2 : (rgb[0] - rgb[1]) / d + 4);
	h = h * 60;
	var s = mx ? d / mx : 0, v = mx;
	h += (r(12) * 2 - 1) * (p.hue_jitter || 0) / 100 * 180;
	s = Math.max(0, Math.min(1, s * (1 + (p.purity || 0) / 100) + (r(13) * 2 - 1) * (p.sat_jitter || 0) / 100));
	v = Math.max(0, Math.min(1, v + (r(14) * 2 - 1) * (p.bright_jitter || 0) / 100));
	h = ((h % 360) + 360) % 360;
	var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
	var o = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
	//quantized so the stamp cache stays useful
	return '#' + o.map(q => Math.max(0, Math.min(255, Math.round((q + m) * 255 / 8) * 8)).toString(16).padStart(2, '0')).join('');
}

class Brush_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.name = 'brush';
		this.layer = {};
		this.params_hash = false;
		this.pressure_supported = false;
		this.pointer_pressure = 0; // has range [0 - 1]
		this.max_speed = 20;
		this.power = 2; //how speed affects size
		this.event_links = [];
		this.data_index = 0;
	}

	load() {
		var _this = this;
		var is_touch = false;

		//pointer events
		document.addEventListener('pointerdown', function (event) {
			_this.pointerdown(event);
		});
		document.addEventListener('pointermove', function (event) {
			_this.pointermove(event);
		});

		//mouse events
		document.addEventListener('mousedown', function (event) {
			if(is_touch)
				return;
			_this.dragStart(event);
		});
		document.addEventListener('mousemove', function (event) {
			if(is_touch)
				return;
			_this.dragMove(event);
		});
		document.addEventListener('mouseup', function (event) {
			if(is_touch)
				return;
			_this.dragEnd(event);
		});

		// collect touch events
		document.addEventListener('touchstart', function (event) {
			is_touch = true;
			_this.dragStart(event);
		});
		document.addEventListener('touchmove', function (event) {
			_this.dragMove(event);
		});
		document.addEventListener('touchend', function (event) {
			_this.dragEnd(event);
		});
	}

	pointerdown(e) {
		// Devices that don't actually support pen pressure can give 0.5 as a false reading.
		// It is highly unlikely a real pen will read exactly 0.5 at the start of a stroke.
		if (e.pressure && e.pressure !== 0 && e.pressure !== 0.5 && e.pressure <= 1) {
			this.pressure_supported = true;
			this.pointer_pressure = e.pressure;
		} else {
			this.pressure_supported = false;
		}
	}

	pointermove(e) {
		// Pressure of exactly 1 seems to be an input error, sometimes I see it when lifting the pen
		// off the screen when pressure reading should be near 0.
		if (this.pressure_supported && e.pressure < 1) {
			this.pointer_pressure = e.pressure;
		}
	}

	dragStart(event) {
		var _this = this;
		if (config.TOOL.name != _this.name)
			return;
		this.click_counter++;

		var mouse = this.get_mouse_info(event);
		if (mouse.is_drag == false)
			return;
		if (mouse.click_valid == false) {
			return;
		}

		var events = [];
		if (event.changedTouches) {
			events = event.changedTouches;
		}
		else{
			events.push(event);
		}
		for(var i = 0; i < events.length; i++){
			var identifier = null;
			if(typeof events[i].identifier != "undefined") {
				identifier = events[i].identifier;
			}

			this.event_links.push({
				identifier: identifier,
				index: this.data_index,
			});

			_this.mousedown_action(events[i], this.data_index, identifier);

			this.data_index++;
		}
	}

	dragMove(event) {
		var _this = this;
		if (config.TOOL.name != _this.name)
			return;

		if (typeof event.changedTouches == "undefined") {
			//mouse cursor
			var mouse = _this.get_mouse_info(event);
			var params = _this.getParams();
			_this.show_mouse_cursor(mouse.x, mouse.y, params.size, 'circle');
		}

		var mouse = this.get_mouse_info(event);
		if (mouse.is_drag == false)
			return;
		if (mouse.click_valid == false) {
			return;
		}

		var events = [];
		if (event.changedTouches) {
			events = event.changedTouches;
		}
		else{
			events.push(event);
		}
		for(var i = 0; i < events.length; i++){
			var identifier = null;
			if(typeof events[i].identifier != "undefined") {
				identifier = events[i].identifier;
			}

			for(var j = 0; i < this.event_links.length; j++){
				if(this.event_links[j].identifier == identifier){
					//found link
					_this.mousemove_action(events[i], this.event_links[j].index);
					break;
				}
			}
		}
	}

	dragEnd(event) {
		var _this = this;
		if (config.TOOL.name != _this.name)
			return;

		var mouse = this.get_mouse_info(event);
		if (mouse.click_valid == false) {
			return;
		}

		var events = [];
		if (event.changedTouches) {
			events = event.changedTouches;
		}
		else{
			events.push(event);
		}
		for(var i = 0; i < events.length; i++){
			var identifier = null;
			if(typeof events[i].identifier != "undefined") {
				//unlink
				identifier = events[i].identifier;
			}

			for(var j = 0; i < this.event_links.length; j++){
				if(this.event_links[j].identifier == identifier){
					this.event_links.splice(j, 1);
					break;
				}
			}

			_this.mouseup_action(events[i]);
		}
	}

	mousedown_action(e, index, event_identifier) {
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false)
			return;

		var params_hash = this.get_params_hash();

		if (config.layer.type != this.name || params_hash != this.params_hash) {
			//register new object - current layer is not ours or params changed
			//pshot: remember the pixel layer the stroke belongs to (CS6 paints into it)
			if (app.GUI.Ps_workspace.Selection.quick_mask) {
				//keep an empty layer from being turned into the temporary stroke layer
				ensure_pixel_layer();
			}
			this.paint_target = app.GUI.Ps_workspace.Selection.quick_mask ? config.layer.id : ((config.layer.ps_mask && config.layer.ps_mask_editing) || config.layer.type == 'image' ? config.layer.id : (config.layer.type == null ? 'self' : null));
			this.layer = {
				type: this.name,
				data: [[]],
				params: Object.assign(this.clone(this.getParams()), { bg_color: config.BG_COLOR }),
				status: 'draft',
				render_function: [this.name, 'render'],
				x: 0,
				y: 0,
				width: config.WIDTH,
				height: config.HEIGHT,
				hide_selection_if_active: true,
				rotate: null,
				is_vector: true,
				color: config.COLOR,
				opacity: this.getParams().opacity == null ? 100 : this.getParams().opacity,
			};
			app.State.do_action(
				new app.Actions.Bundle_action('new_brush_layer', 'New Brush Layer', [
					new app.Actions.Insert_layer_action(this.layer)
				])
			);
			this.params_hash = params_hash;

			//reset event links index
			this.data_index = 0;
			index = 0;
			this.event_links = [];
			this.event_links.push({
				identifier: event_identifier,
				index: this.data_index,
			});
		}
		else {
			const new_data = JSON.parse(JSON.stringify(config.layer.data));
			new_data.push([]);
			app.State.do_action(
				new app.Actions.Bundle_action('update_brush_layer', 'Update Brush Layer', [
					new app.Actions.Update_layer_action(config.layer.id, {
						data: new_data
					})
				])
			);
		}

		//in case of undo, recalculate index
		for(var i = index; i >= 0; i++){
			if(typeof config.layer.data[index] != "undefined"){
				break;
			}
			index--;
		}

		var current_group = config.layer.data[index];
		var params = this.getParams();

		//detect line size
		var size = params.size;
		var new_size = size;

		if (params.pressure == true) {
			if (this.pressure_supported) {
				new_size = size * this.pointer_pressure * 2;
			}
			else {
				new_size = size + size / this.max_speed * mouse.speed_average * this.power;
				new_size = Math.max(new_size, size / 4);
				new_size = Math.round(new_size);
			}
		}

		var mouse_coords = this.get_mouse_coordinates_from_event(e);
		var mouse_x = mouse_coords.x;
		var mouse_y = mouse_coords.y;

		//pshot: Always use Pressure for Opacity (pen pressure; a mouse paints at full opacity)
		var point = [mouse_x - config.layer.x, mouse_y - config.layer.y, new_size];
		if (params.pressure_op && this.pressure_supported) point[4] = this.pointer_pressure;
		current_group.push(point);
		this.Base_layers.render();
		//Build-up (airbrush): paint keeps flowing while the pointer rests
		clearInterval(this.buildup_timer);
		if (params.airbrush) {
			var group = current_group, stroke_layer = config.layer;
			this.buildup_timer = setInterval(() => {
				if (config.layer !== stroke_layer || !group.length) { clearInterval(this.buildup_timer); return; }
				var last = group[group.length - 1];
				group.push([last[0], last[1], last[2], 1, last[4]]);
				config.layer.status = 'draft';
				this.Base_layers.render();
			}, 80);
		}
	}

	mousemove_action(e, index) {
		var mouse = this.get_mouse_info(e);
		if (mouse.is_drag == false)
			return;
		if (mouse.click_valid == false) {
			return;
		}

		//in case of undo, recalculate index
		for(var i = index; i >= 0; i++){
			if(typeof config.layer.data[index] != "undefined"){
				break;
			}
			index--;
		}

		var params = this.getParams();
		var current_group = config.layer.data[index];

		//detect line size
		var size = params.size;
		var new_size = size;

		if (params.pressure == true) {
			if (this.pressure_supported) {
				new_size = size * this.pointer_pressure * 2;
			}
			else {
				new_size = size + size / this.max_speed * mouse.speed_average * this.power;
				new_size = Math.max(new_size, size / 4);
				new_size = Math.round(new_size);
			}
		}

		var mouse_coords = this.get_mouse_coordinates_from_event(e);
		var mouse_x = mouse_coords.x;
		var mouse_y = mouse_coords.y;

		//pshot: Always use Pressure for Opacity (pen pressure; a mouse paints at full opacity)
		var point = [mouse_x - config.layer.x, mouse_y - config.layer.y, new_size];
		if (params.pressure_op && this.pressure_supported) point[4] = this.pointer_pressure;
		current_group.push(point);
		config.layer.status = 'draft';
		this.Base_layers.render();
	}

	mouseup_action(e, index) {
		clearInterval(this.buildup_timer);
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false) {
			config.layer.status = null;
			return;
		}

		config.layer.status = null;

		commit_stroke(this, this.check_dimensions(), 'Brush Tool');
		this.Base_layers.render();
	}

	/**
	 * pshot: Brush panel settings that need a dab (stamp) engine instead of a stroked path
	 */
	use_dabs(params) {
		return (params.spacing != null && params.spacing != 25) || (params.roundness != null && params.roundness != 100) || params.angle
			|| params.size_jitter > 0 || params.scatter > 0 || params.opacity_jitter > 0 || (params.flow != null && params.flow < 100)
			|| params.angle_jitter > 0 || params.roundness_jitter > 0 || params.count > 1 || params.color_dynamics || params.noise || params.wet_edges
			|| !!params.tip || params.texture || params.dual || params.pose || params.airbrush || params.pressure_op || params.spacing_off;
	}

	/**
	 * a soft elliptical stamp (hardness, roundness, angle) at screen resolution
	 */
	stamp(size, params, color, k) {
		var hardness = params.hardness == null ? 100 : params.hardness;
		var roundness = (params.roundness == null ? 100 : params.roundness) / 100;
		var key = [Math.round(size * k), hardness, roundness, params.angle || 0, color, params.noise ? 1 : 0, params.wet_edges ? 1 : 0, params.tip || ''].join('|');
		this.stamp_cache = this.stamp_cache || {};
		if (this.stamp_cache[key]) return this.stamp_cache[key];
		var d = Math.max(2, Math.ceil(size * k) + 2);
		var c = document.createElement('canvas');
		c.width = c.height = d;
		var g = c.getContext('2d');
		g.translate(d / 2, d / 2);
		g.rotate(-(params.angle || 0) * Math.PI / 180);
		g.scale(1, roundness);
		//sampled tip (Brush Presets): the tip mask scaled to the size, in the paint color
		var tip = params.tip ? tip_canvas(params.tip) : null;
		if (tip) {
			var tk = size * k / Math.max(tip.width, tip.height);
			g.drawImage(tip, -tip.width * tk / 2, -tip.height * tk / 2, tip.width * tk, tip.height * tk);
			g.setTransform(1, 0, 0, 1, 0, 0);
			g.globalCompositeOperation = 'source-in';
			g.fillStyle = color;
			g.fillRect(0, 0, d, d);
			g.globalCompositeOperation = 'source-over';
			var tkeys = Object.keys(this.stamp_cache);
			if (tkeys.length > 256) delete this.stamp_cache[tkeys[0]];
			this.stamp_cache[key] = c;
			return c;
		}
		var r = size * k / 2;
		var grad = g.createRadialGradient(0, 0, 0, 0, 0, Math.max(0.5, r));
		grad.addColorStop(0, color);
		grad.addColorStop(Math.min(0.999, Math.max(0, hardness / 100)), color);
		grad.addColorStop(1, color + '00');
		g.fillStyle = grad;
		g.beginPath();
		g.arc(0, 0, Math.max(0.5, r), 0, Math.PI * 2);
		g.fill();
		if (params.noise || params.wet_edges) {
			//Noise: grain in the soft edge; Wet Edges: paint collects at the rim
			g.setTransform(1, 0, 0, 1, 0, 0);
			var img = g.getImageData(0, 0, d, d), px = img.data;
			for (var i = 3; i < px.length; i += 4) {
				var a = px[i] / 255;
				if (!a) continue;
				if (params.wet_edges) {
					var q = (i - 3) / 4, rn = Math.hypot(q % d - d / 2 + 0.5, Math.floor(q / d) - d / 2 + 0.5) / Math.max(0.5, r);
					var t = Math.max(0, Math.min(1, (rn - 0.55) / 0.4));
					a *= 0.4 + 0.6 * t * t * (3 - 2 * t);
				}
				if (params.noise && a < 0.999) a = Math.max(0, Math.min(1, a + (Math.random() - 0.5) * (1 - a) * 1.6));
				px[i] = a * 255;
			}
			g.putImageData(img, 0, 0);
		}
		var keys = Object.keys(this.stamp_cache);
		if (keys.length > 256) delete this.stamp_cache[keys[0]];
		this.stamp_cache[key] = c;
		return c;
	}

	/**
	 * a stroke: Smoothing, then the dabs; Dual Brush and Texture limit where the paint lands
	 */
	render_dabs(ctx, group, params, color) {
		if (!group.length) return;
		if (params.smoothing && group.length > 3) {
			//CS6 Smoothing: a moving average of the pointer positions (ends kept)
			var sm = group.map(p => p.slice());
			for (var pass = 0; pass < 2; pass++) {
				for (var i = 1; i < sm.length - 1; i++) {
					if (sm[i][3] === 1) continue;
					sm[i][0] = (group[i - 1][0] + group[i][0] * 2 + group[i + 1][0]) / 4;
					sm[i][1] = (group[i - 1][1] + group[i][1] * 2 + group[i + 1][1]) / 4;
				}
				group = sm.map(p => p.slice());
			}
		}
		if (!params.texture && !params.dual) return this.render_dabs_raw(ctx, group, params, color);
		var T = ctx.getTransform(), W = ctx.canvas.width, H = ctx.canvas.height;
		var off = document.createElement('canvas');
		off.width = W;
		off.height = H;
		var octx = off.getContext('2d');
		octx.setTransform(T);
		this.render_dabs_raw(octx, group, params, color);
		octx.setTransform(1, 0, 0, 1, 0, 0);
		if (params.dual) {
			//Dual Brush: a second tip along the same stroke; paint only where both are
			var dual = document.createElement('canvas');
			dual.width = W;
			dual.height = H;
			var dctx = dual.getContext('2d');
			dctx.setTransform(T);
			var dp = { size: params.dual_size || 25, spacing: params.dual_spacing || 25, scatter: params.dual_scatter || 0, both_axes: true, count: params.dual_count || 1, tip: params.dual_tip || '', hardness: 100, flow: 100 };
			this.render_dabs_raw(dctx, group.map(p => [p[0], p[1], dp.size, p[3]]), dp, '#000000');
			var dmode = params.dual_mode || 'Multiply';
			if (dmode == 'Multiply') {
				octx.globalCompositeOperation = 'destination-in';
				octx.drawImage(dual, 0, 0);
			}
			else {
				//Mode: how the second tip's coverage (b) combines with the stroke's (a)
				var cl = (v) => v < 0 ? 0 : (v > 1 ? 1 : v);
				var DUAL = {
					'Darken': (a, b) => Math.min(a, b),
					'Overlay': (a, b) => a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b),
					'Color Dodge': (a, b) => b >= 1 ? a : cl(a / (1 - b)),
					'Color Burn': (a, b) => b <= 0 ? 0 : cl(1 - (1 - a) / b),
					'Linear Burn': (a, b) => cl(a + b - 1),
					'Hard Mix': (a, b) => (a + b >= 1 ? 1 : 0) * (a > 0 ? 1 : 0),
				};
				var df = DUAL[dmode] || ((a, b) => a * b);
				var dd = dctx.getImageData(0, 0, W, H).data, oi = octx.getImageData(0, 0, W, H), odd = oi.data;
				for (var q = 3; q < odd.length; q += 4) {
					if (!odd[q]) continue;
					odd[q] = Math.round(cl(df(odd[q] / 255, dd[q] / 255)) * 255);
				}
				octx.putImageData(oi, 0, 0);
			}
		}
		if (params.texture) {
			//Texture: the pattern (anchored to the document) lessens the paint in its dark areas
			var tex = document.createElement('canvas');
			tex.width = W;
			tex.height = H;
			var tctx = tex.getContext('2d', { willReadFrequently: true });
			tctx.setTransform(T);
			var P = Patterns, name = params.texture_pattern || P.names()[0];
			tctx.fillStyle = P.pattern(tctx, name, params.texture_scale || 100);
			var inv = T.inverse(), c0 = inv.transformPoint({ x: 0, y: 0 }), c1 = inv.transformPoint({ x: W, y: H });
			tctx.fillRect(Math.min(c0.x, c1.x) - 2, Math.min(c0.y, c1.y) - 2, Math.abs(c1.x - c0.x) + 4, Math.abs(c1.y - c0.y) + 4);
			tctx.setTransform(1, 0, 0, 1, 0, 0);
			var d = tctx.getImageData(0, 0, W, H).data, depth = (params.texture_depth == null ? 100 : params.texture_depth) / 100;
			//Mode: how the texture (t, white = 1) changes the stroke's coverage (a)
			var mode = params.texture_mode || 'Multiply';
			var clamp = (v) => v < 0 ? 0 : (v > 1 ? 1 : v);
			var by_depth = (a, o) => a + (o - a) * depth;
			var MODES = {
				'Multiply': (a, t) => a * (1 - depth * (1 - t)),
				'Subtract': (a, t) => a * Math.max(0, 1 - depth * (1 - t) * 1.5),
				'Darken': (a, t) => Math.min(a, 1 - depth * (1 - t)),
				'Overlay': (a, t) => by_depth(a, a < 0.5 ? 2 * a * t : 1 - 2 * (1 - a) * (1 - t)),
				'Color Dodge': (a, t) => by_depth(a, t >= 1 ? 1 : clamp(a / (1 - t))) * (a > 0 ? 1 : 0),
				'Color Burn': (a, t) => by_depth(a, t <= 0 ? 0 : clamp(1 - (1 - a) / t)),
				'Linear Burn': (a, t) => by_depth(a, clamp(a + t - 1)),
				//the height modes: Depth sets how high the texture stands (td)
				'Hard Mix': (a, t) => (a + (1 - depth * (1 - t)) >= 1.75 ? 1 : 0) * Math.min(1, a * 2),
				'Linear Height': (a, t) => clamp(((1 - depth * (1 - t)) - (1 - 0.3 * a)) / 0.3) * Math.min(1, a * 2),
				'Height': (a, t) => (1 - depth * (1 - t) > 1 - 0.3 * a ? a : 0),
			};
			var fn = MODES[mode] || MODES['Multiply'];
			//the threshold modes use the pattern's own range of tones
			var lo = 0, span = 1;
			if (mode == 'Hard Mix' || mode == 'Height') {
				var mn = 1, mx = 0;
				for (var q = 0; q < d.length; q += 16) {
					var lq = (0.299 * d[q] + 0.587 * d[q + 1] + 0.114 * d[q + 2]) / 255;
					if (lq < mn) mn = lq;
					if (lq > mx) mx = lq;
				}
				if (mx - mn > 0.02) { lo = mn; span = mx - mn; }
			}
			octx.globalCompositeOperation = 'source-over';
			var oimg = octx.getImageData(0, 0, W, H), od = oimg.data;
			for (var k = 0; k < od.length; k += 4) {
				if (!od[k + 3]) continue;
				var lum = ((0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]) / 255 - lo) / span;
				if (params.texture_invert) lum = 1 - lum;
				od[k + 3] = Math.round(clamp(fn(od[k + 3] / 255, lum)) * 255);
			}
			octx.putImageData(oimg, 0, 0);
		}
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.drawImage(off, 0, 0);
		ctx.restore();
	}

	render_dabs_raw(ctx, group, params, color) {
		if (!group.length) return;
		var k = Math.abs(ctx.getTransform().a) || 1;
		var spacing = Math.max(1, (params.spacing == null ? 25 : params.spacing));
		var flow = (params.flow == null ? 100 : params.flow) / 100;
		var rnd = (i, s) => { var v = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return v - Math.floor(v); };
		var hex = color.length == 4 ? '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3] : color.substr(0, 7);
		var dab = 0;
		var dynamic = params.angle_jitter > 0 || params.roundness_jitter > 0;
		var colored = params.color_dynamics && (params.fgbg_jitter > 0 || params.hue_jitter > 0 || params.sat_jitter > 0 || params.bright_jitter > 0 || params.purity);
		var bg = (params.bg_color || '#ffffff').substr(0, 7);
		var one = (x, y, base, dir) => {
			var sz = base * (1 - (params.size_jitter || 0) / 100 * rnd(dab, 1));
			var sc = (params.scatter || 0) / 100 * base;
			if (sc) {
				if (params.both_axes) { x += (rnd(dab, 2) * 2 - 1) * sc; y += (rnd(dab, 3) * 2 - 1) * sc; }
				else { var off = (rnd(dab, 2) * 2 - 1) * sc; x += -dir[1] * off; y += dir[0] * off; }
			}
			var alpha = flow * (1 - (params.opacity_jitter || 0) / 100 * rnd(dab, 4));
			var p = params;
			if (params.pose) {
				//Brush Pose: a fixed rotation, roundness and pressure
				sz *= (params.pose_pressure == null ? 100 : params.pose_pressure) / 100;
				p = Object.assign({}, params, { angle: (params.angle || 0) + (params.pose_angle || 0), roundness: params.pose_roundness == null ? params.roundness : params.pose_roundness });
			}
			if (dynamic) {
				//Shape Dynamics: angle / roundness jitter (quantized so stamps are reused)
				var ang = (p.angle || 0) + Math.round((rnd(dab, 5) * 2 - 1) * (params.angle_jitter || 0) / 100 * 180 / 5) * 5;
				var rmin = params.min_roundness == null ? 25 : params.min_roundness;
				var rd = (params.roundness == null ? 100 : params.roundness) * (1 - (params.roundness_jitter || 0) / 100 * rnd(dab, 6) * (1 - rmin / 100));
				p = Object.assign({}, params, { angle: ang, roundness: Math.round(rd / 5) * 5 });
			}
			var col = colored ? dab_color(hex, bg, params, (n) => rnd(dab, n)) : hex;
			var st = this.stamp(sz, p, col, k);
			ctx.globalAlpha = alpha * dab_pressure(pressure);
			ctx.drawImage(st, x - st.width / k / 2, y - st.height / k / 2, st.width / k, st.height / k);
			dab++;
		};
		var place = (x, y, base, dir) => {
			//Scattering count: several dabs per spacing step
			var n = Math.max(1, Math.round((params.count || 1) * (1 - (params.count_jitter || 0) / 100 * rnd(dab, 7))));
			for (var c = 0; c < n; c++) one(x, y, base, dir || [1, 0]);
		};
		//pressure is the stroke's opacity: about 100 / spacing dabs overlap, each adds its share
		var dab_pressure = (pr) => pr >= 1 ? 1 : 1 - Math.pow(1 - pr, spacing / 100);
		var pressure = group[0][4] == null ? 1 : group[0][4];
		place(group[0][0], group[0][1], group[0][2] || params.size);
		var carry = 0;
		for (var i = 1; i < group.length; i++) {
			var a = group[i - 1], b = group[i];
			if (!a || !b) continue;
			pressure = b[4] == null ? 1 : b[4];
			if (b[3] === 1) {
				//Build-up: the pointer rests, the paint keeps coming
				place(b[0], b[1], b[2] || params.size);
				continue;
			}
			var base = b[2] || params.size;
			if (params.spacing_off) {
				place(b[0], b[1], base, [1, 0]);
				continue;
			}
			var step = Math.max(0.5, base * spacing / 100);
			var len = Math.hypot(b[0] - a[0], b[1] - a[1]);
			var t = step - carry;
			var dir = len ? [(b[0] - a[0]) / len, (b[1] - a[1]) / len] : [1, 0];
			while (t <= len) {
				place(a[0] + (b[0] - a[0]) * t / len, a[1] + (b[1] - a[1]) * t / len, base, dir);
				t += step;
			}
			carry = len - (t - step);
		}
		ctx.globalAlpha = 1;
	}

	render(ctx, layer) {
		if (layer.data.length == 0)
			return;

		var params = layer.params;
		var size = params.size;
		if (this.use_dabs(params)) {
			ctx.save();
			ctx.translate(layer.x, layer.y);
			for (var group of this.check_legacy_format(layer.data)) {
				this.render_dabs(ctx, group.filter(p => p), params, layer.color);
			}
			ctx.restore();
			return;
		}

		//set styles
		ctx.save();
		ctx.fillStyle = layer.color;
		ctx.strokeStyle = layer.color;
		//pshot: hardness < 100 gives a soft edge (narrower core + blur, in device pixels)
		var hardness = params.hardness == null ? 100 : params.hardness;
		var width_k = 0.6 + 0.4 * hardness / 100;
		if (hardness < 100) {
			ctx.filter = 'blur(' + (size * (1 - hardness / 100) / 8 * ctx.getTransform().a) + 'px)';
		}
		ctx.lineWidth = params.size * width_k;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';

		ctx.translate(layer.x, layer.y);

		var data = layer.data;

		//check for legacy format
		data = this.check_legacy_format(data);

		var n = data.length;
		for (var k = 0; k < n; k++) {
			var group_data = data[k]; //data from mouse down till mouse release
			var group_n = group_data.length;

			if (params.pressure == false) {
				//stabilized lines method does not support multiple line sizes
				this.render_stabilized(ctx, group_data);
			}
			else {
				if (group_data[0]) {
					ctx.beginPath();
					ctx.moveTo(group_data[0][0], group_data[0][1]);
					for (var i = 1; i < group_n; i++) {
						if (group_data[i] === null) {
							//break
							ctx.beginPath();
						}
						else {
							//line

							ctx.lineWidth = group_data[i][2] * width_k;

							if (group_data[i - 1] == null && group_data[i + 1] == null) {
								//exception - point
								ctx.arc(group_data[i][0], group_data[i][1], size * width_k / 2, 0, 2 * Math.PI, false);
								ctx.fill();
							}
							else if (group_data[i - 1] != null) {
								//lines
								ctx.lineWidth = group_data[i][2] * width_k;
								ctx.beginPath();
								ctx.moveTo(group_data[i - 1][0], group_data[i - 1][1]);
								ctx.lineTo(group_data[i][0], group_data[i][1]);
								ctx.stroke();
							}
						}
					}
					if (group_data[1] == null) {
						//point
						ctx.beginPath();
						ctx.arc(group_data[0][0], group_data[0][1], size * width_k / 2, 0, 2 * Math.PI, false);
						ctx.fill();
					}
				}
			}
		}

		ctx.translate(-layer.x, -layer.y);
		ctx.restore();
	}

	/**
	 * draw stabilized lines
	 * author: Manoj Verma
	 * source: https://stackoverflow.com/questions/7891740/drawing-smooth-lines-with-canvas/44810470#44810470
	 *
	 * @param ctx
	 * @param queue
	 */
	render_stabilized(ctx, queue) {
		var data = JSON.parse(JSON.stringify(queue));
		var n = data.length;

		if (data.length == 1) {
			//point
			var point = data[0];
			ctx.beginPath();
			ctx.arc(point[0], point[1], ctx.lineWidth / 2, 0, 2 * Math.PI, false);
			ctx.fill();
			return;
		}
		else if (data.length <= 5) {
			//not enough points yet

			for (var i = 1; i < n; i++) {
				ctx.beginPath();
				ctx.moveTo(data[i - 1][0], data[i - 1][1]);
				ctx.lineTo(data[i][0], data[i][1]);
				ctx.stroke();
			}
			return;
		}

		//fix for loose ending, so lets duplicate last point
		data.push([data[n - 1][0], data[n - 1][1]]);

		ctx.beginPath();
		ctx.moveTo(data[0][0], data[0][1]);

		//prepare
		var temp_data1 = [data[0]];
		var c, d;
		for (var i = 1; i < data.length - 1;  i = i+1) {
			c = (data[i][0] + data[i + 1][0]) / 2;
			d = (data[i][1] + data[i + 1][1]) / 2;
			temp_data1.push([c, d]);
		}

		var temp_data2 = [temp_data1[0]];
		for (var i = 1; i < temp_data1.length - 1;  i = i+1) {
			c = (temp_data1[i][0] + temp_data1[i + 1][0]) / 2;
			d = (temp_data1[i][1] + temp_data1[i + 1][1]) / 2;
			temp_data2.push([c, d]);
		}

		var temp_data = [temp_data2[0]];
		for (var i = 1; i < temp_data2.length - 1;  i = i+1) {
			c = (temp_data2[i][0] + temp_data2[i + 1][0]) / 2;
			d = (temp_data2[i][1] + temp_data2[i + 1][1]) / 2;
			temp_data.push([c, d]);
		}

		//draw
		for (var i = 1; i < temp_data.length - 2;  i = i+1) {
			c = (temp_data[i][0] + temp_data[i + 1][0]) / 2;
			d = (temp_data[i][1] + temp_data[i + 1][1]) / 2;
			ctx.quadraticCurveTo(temp_data[i][0], temp_data[i][1], c, d);
		}

		// For the last 2 points
		ctx.quadraticCurveTo(
			temp_data[i][0],
			temp_data[i][1],
			temp_data[i+1][0],
			temp_data[i+1][1]
		);
		ctx.stroke();
	}

	check_legacy_format(data) {
		//check for legacy format
		if(data.length > 0 && typeof data[0][0] == "number"){
			//convert
			var legacy = JSON.parse(JSON.stringify(data));
			data = [];
			data.push([]);
			var group_index = 0;
			for(var i in legacy){
				if(legacy[i] === null){
					data.push([]);
					group_index++;
				}
				else {
					data[group_index].push([legacy[i][0], legacy[i][1], legacy[i][2]]);
				}
			}
		}

		return data;
	}

	/**
	 * recalculate layer x, y, width and height values.
	 */
	check_dimensions() {
		var data = JSON.parse(JSON.stringify(config.layer.data)); // Deep copy for history
		this.check_legacy_format(data);

		if(config.layer.data.length == 0 || data[0].length == 0)
			return;

		//find bounds
		var min_x = data[0][0][0];
		var min_y = data[0][0][1];
		var max_x = data[0][0][0];
		var max_y = data[0][0][1];

		var n = data.length;
		for (var k = 0; k < n; k++) {
			var group_data = data[k];
			var group_n = group_data.length;

			for (var i = 1; i < group_n; i++) {
				min_x = Math.min(min_x, group_data[i][0]);
				min_y = Math.min(min_y, group_data[i][1]);
				max_x = Math.max(max_x, group_data[i][0]);
				max_y = Math.max(max_y, group_data[i][1]);
			}
		}

		//move current data
		for (var k = 0; k < n; k++) {
			var group_data = data[k];
			var group_n = group_data.length;

			for (var i = 0; i < group_n; i++) {
				group_data[i][0] = group_data[i][0] - min_x;
				group_data[i][1] = group_data[i][1] - min_y;
			}
		}

		//change layers bounds
		return app.State.do_action(
			new app.Actions.Update_layer_action(config.layer.id, {
				x: config.layer.x + min_x,
				y: config.layer.y + min_y,
				width: max_x - min_x,
				height: max_y - min_y,
				data
			}),
			{
				merge_with_history: ['new_brush_layer', 'update_brush_layer']
			}
		);
	}

}

export default Brush_class;
