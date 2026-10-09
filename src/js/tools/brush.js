import app from './../app.js';
import config from './../config.js';
import { commit_stroke } from './../ps/stroke.js';
import { ensure_pixel_layer } from './../ps/pixel-layer.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';

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

		current_group.push([mouse_x - config.layer.x, mouse_y - config.layer.y, new_size]);
		this.Base_layers.render();
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

		current_group.push([mouse_x - config.layer.x, mouse_y - config.layer.y, new_size]);
		config.layer.status = 'draft';
		this.Base_layers.render();
	}

	mouseup_action(e, index) {
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
			|| params.angle_jitter > 0 || params.roundness_jitter > 0 || params.count > 1 || params.color_dynamics || params.noise || params.wet_edges;
	}

	/**
	 * a soft elliptical stamp (hardness, roundness, angle) at screen resolution
	 */
	stamp(size, params, color, k) {
		var hardness = params.hardness == null ? 100 : params.hardness;
		var roundness = (params.roundness == null ? 100 : params.roundness) / 100;
		var key = [Math.round(size * k), hardness, roundness, params.angle || 0, color, params.noise ? 1 : 0, params.wet_edges ? 1 : 0].join('|');
		this.stamp_cache = this.stamp_cache || {};
		if (this.stamp_cache[key]) return this.stamp_cache[key];
		var d = Math.max(2, Math.ceil(size * k) + 2);
		var c = document.createElement('canvas');
		c.width = c.height = d;
		var g = c.getContext('2d');
		g.translate(d / 2, d / 2);
		g.rotate(-(params.angle || 0) * Math.PI / 180);
		g.scale(1, roundness);
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

	render_dabs(ctx, group, params, color) {
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
			if (dynamic) {
				//Shape Dynamics: angle / roundness jitter (quantized so stamps are reused)
				var ang = (params.angle || 0) + Math.round((rnd(dab, 5) * 2 - 1) * (params.angle_jitter || 0) / 100 * 180 / 5) * 5;
				var rmin = params.min_roundness == null ? 25 : params.min_roundness;
				var rd = (params.roundness == null ? 100 : params.roundness) * (1 - (params.roundness_jitter || 0) / 100 * rnd(dab, 6) * (1 - rmin / 100));
				p = Object.assign({}, params, { angle: ang, roundness: Math.round(rd / 5) * 5 });
			}
			var col = colored ? dab_color(hex, bg, params, (n) => rnd(dab, n)) : hex;
			var st = this.stamp(sz, p, col, k);
			ctx.globalAlpha = alpha;
			ctx.drawImage(st, x - st.width / k / 2, y - st.height / k / 2, st.width / k, st.height / k);
			dab++;
		};
		var place = (x, y, base, dir) => {
			//Scattering count: several dabs per spacing step
			var n = Math.max(1, Math.round((params.count || 1) * (1 - (params.count_jitter || 0) / 100 * rnd(dab, 7))));
			for (var c = 0; c < n; c++) one(x, y, base, dir || [1, 0]);
		};
		place(group[0][0], group[0][1], group[0][2] || params.size);
		var carry = 0;
		for (var i = 1; i < group.length; i++) {
			var a = group[i - 1], b = group[i];
			if (!a || !b) continue;
			var base = b[2] || params.size;
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
