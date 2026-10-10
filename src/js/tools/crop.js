import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import GUI_tools_class from './../core/gui/gui-tools.js';
import Base_gui_class from './../core/base-gui.js';
import Base_selection_class from './../core/base-selection.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

class Crop_class extends Base_tools_class {

	constructor(ctx) {
		super();
		var _this = this;
		this.Base_layers = new Base_layers_class();
		this.Base_gui = new Base_gui_class();
		this.GUI_tools = new GUI_tools_class();
		this.ctx = ctx;
		this.name = 'crop';
		this.selection = {
			x: null,
			y: null,
			width: null,
			height: null,
		};
		var sel_config = {
			enable_background: false,
			enable_borders: true,
			enable_controls: true,
			crop_lines: true,
			enable_rotation: false,
			enable_move: false,
			data_function: function () {
				return _this.selection;
			},
		};
		this.mousedown_selection = null;
		this.Base_selection = new Base_selection_class(ctx, sel_config, this.name);
	}

	load() {
		this.default_events();
		//pshot: CS6 darkens what will be cropped away (the crop shield)
		setTimeout(() => {
			var Selection = app.GUI.Ps_workspace && app.GUI.Ps_workspace.Selection;
			if (!Selection) return;
			Selection.overlays = Selection.overlays || [];
			Selection.overlays.push({
				active: () => config.TOOL.name == this.name && this.selection.width,
				draw: (ctx) => {
					var s = this.selection, a = config.TOOL.attributes;
					var x = Math.min(s.x, s.x + s.width), y = Math.min(s.y, s.y + s.height);
					//gear options: the shield's color and opacity; Show Cropped Area off hides what goes
					var canvas_color = getComputedStyle(document.getElementById('ps_docarea')).backgroundColor || 'rgb(40,40,40)';
					var color = a.shield_color == 'Custom' ? a.shield_custom : canvas_color;
					var alpha = (a.shield_opacity == null ? 75 : a.shield_opacity) / 100;
					if (a.shield_auto !== false && config.mouse && config.mouse.is_drag) alpha *= 0.6;
					if (a.show_cropped === false) {
						color = canvas_color;
						alpha = 1;
					}
					else if (a.shield === false) {
						return;
					}
					ctx.save();
					ctx.globalAlpha = alpha;
					ctx.fillStyle = color;
					ctx.beginPath();
					ctx.rect(0, 0, config.WIDTH, config.HEIGHT);
					ctx.rect(x, y, Math.abs(s.width), Math.abs(s.height));
					ctx.fill('evenodd');
					ctx.restore();
				},
			});
		}, 0);
	}

	default_dragStart(event) {
		this.is_mousedown_canvas = false;
		if (config.TOOL.name != this.name)
			return;
		if (!event.target.closest('#main_wrapper'))
			return;

		this.is_mousedown_canvas = true;
		this.mousedown(event);
	}

	mousedown(e) {
		var mouse = this.get_mouse_info(e);
		if (this.Base_selection.is_drag == false || mouse.click_valid == false)
			return;

		this.mousedown_selection = JSON.parse(JSON.stringify(this.selection));

		if (this.Base_selection.mouse_lock !== null) {
			return;
		}

		//create new selection
		this.Base_selection.set_selection(mouse.x, mouse.y, 0, 0);
	}

	mousemove(e) {
		var mouse = this.get_mouse_info(e);
		if (this.Base_selection.is_drag == false || mouse.is_drag == false) {
			return;
		}
		if (e.type == 'mousedown' && mouse.click_valid == false) {
			return;
		}
		if (this.Base_selection.mouse_lock !== null) {
			return;
		}

		var width = mouse.x - mouse.click_x;
		var height = mouse.y - mouse.click_y;
		//pshot: the options bar ratio (W x H), or Ctrl for the document's ratio
		var params = this.getParams();
		var rw = parseFloat(params.ratio_w), rh = parseFloat(params.ratio_h);
		var fixed = rw > 0 && rh > 0;
		
		if(fixed || e.ctrlKey == true || e.metaKey){
			var ratio = fixed ? rw / rh : config.WIDTH / config.HEIGHT;
			var width_new = Math.round(height * ratio);
			var height_new = Math.round(width / ratio);

			if(Math.abs(width * 100 / width_new) > Math.abs(height * 100 / height_new)){
				if (width * 100 / width_new > 0)
					height = height_new;
				else
					height = -height_new;
			}
			else{
				if (height * 100 / height_new > 0)
					width = width_new;
				else
					width = -width_new;
			}
		}

		this.Base_selection.set_selection(null, null, width, height);
	}

	mouseup(e) {
		var mouse = this.get_mouse_info(e);

		if (!this.Base_selection.is_drag) {
			return;
		}
		if (e.type == 'mousedown' && mouse.click_valid == false) {
			return;
		}

		var width = mouse.x - this.selection.x;
		var height = mouse.y - this.selection.y;

		if (width == 0 || height == 0) {
			//cancel selection
			this.Base_selection.reset_selection();
			config.need_render = true;
			return;
		}

		if (this.selection.width != null) {
			//make sure coords not negative
			var details = this.selection;
			var x = details.x;
			var y = details.y;
			if (details.width < 0) {
				x = x + details.width;
			}
			if (details.height < 0) {
				y = y + details.height;
			}
			this.selection = {
				x: x,
				y: y,
				width: Math.abs(details.width),
				height: Math.abs(details.height),
			};
		}

		//control boundaries
		if (this.selection.x < 0) {
			this.selection.width += this.selection.x;
			this.selection.x = 0;
		}
		if (this.selection.y < 0) {
			this.selection.height += this.selection.y;
			this.selection.y = 0;
		}
		if (this.selection.x + this.selection.width > config.WIDTH) {
			this.selection.width = config.WIDTH - this.selection.x;
		}
		if (this.selection.y + this.selection.height > config.HEIGHT) {
			this.selection.height = config.HEIGHT - this.selection.y;
		}
		//pshot: clamping must not break the options bar ratio
		var rw = parseFloat(this.getParams().ratio_w), rh = parseFloat(this.getParams().ratio_h);
		if (rw > 0 && rh > 0 && this.selection.height > 0) {
			var ratio = rw / rh;
			if (this.selection.width / this.selection.height > ratio) this.selection.width = Math.round(this.selection.height * ratio);
			else this.selection.height = Math.round(this.selection.width / ratio);
		}

		app.State.do_action(
			new app.Actions.Set_selection_action(this.selection.x, this.selection.y, this.selection.width, this.selection.height, this.mousedown_selection)
		);
	}

	render(ctx, layer) {
		//nothing
	}

	/**
	 * do actual crop
	 */
	async on_params_update(change) {
		var params = this.getParams();
		//pshot: options bar changes are not a commit
		if (change && change.key) {
			this.option_changed(change.key, change.value);
			return;
		}
		var selection = this.selection;
		params.crop = true;
		this.GUI_tools.show_action_attributes();

		if (selection.width == null || selection.width == 0 || selection.height == 0) {
			alertify.error('Empty selection');
			return;
		}
		
		//check for rotation
		var rotated_name = false;
		for (var i in config.layers) {
			var link = config.layers[i];
			if (link.type == null)
				continue;
			
			if(link.rotate > 0){
				rotated_name = link.name;
				break;
			}
		}
		if (rotated_name !== false) {
			alertify.error('Crop on rotated layer is not supported. Convert it to raster to continue.' + '('+ rotated_name + ')');
			return;
		}

		//controll boundaries
		selection.x = Math.max(selection.x, 0);
		selection.y = Math.max(selection.y, 0);
		selection.width = Math.min(selection.width, config.WIDTH);
		selection.height = Math.min(selection.height, config.HEIGHT);

		let actions = [];

		for (var i in config.layers) {
			var link = config.layers[i];
			if (link.type == null)
				continue;

			let x = link.x;
			let y = link.y;
			let width = link.width;
			let height = link.height;
			let width_original = link.width_original;
			let height_original = link.height_original;

			//move
			x -= parseInt(selection.x);
			y -= parseInt(selection.y);

			//pshot: Delete Cropped Pixels off keeps the pixels outside the canvas (Image > Reveal All)
			if (link.type == 'image' && params.delete_pixels !== false) {
				//also remove unvisible data
				let left = 0;
				if (x < 0)
					left = -x;
				let top = 0;
				if (y < 0)
					top = -y;
				let right = 0;
				if (x + width > selection.width)
					right = x + width - selection.width;
				let bottom = 0;
				if (y + height > selection.height)
					bottom = y + height - selection.height;
				let crop_width = width - left - right;
				let crop_height = height - top - bottom;

				//if image was streched
				let width_ratio = (width / width_original);
				let height_ratio = (height / height_original);

				//create smaller canvas
				let canvas = document.createElement('canvas');
				let ctx = canvas.getContext("2d");
				canvas.width = crop_width / width_ratio;
				canvas.height = crop_height / height_ratio;

				//cut required part
				ctx.translate(-left / width_ratio, -top / height_ratio);
				canvas.getContext("2d").drawImage(link.link, 0, 0);
				ctx.translate(0, 0);
				actions.push(
					new app.Actions.Update_layer_image_action(canvas, link.id)
				);

				//update attributes
				width = Math.ceil(canvas.width * width_ratio);
				height = Math.ceil(canvas.height * height_ratio);
				x += left;
				y += top;
				width_original = canvas.width;
				height_original = canvas.height;
			}

			actions.push(
				new app.Actions.Update_layer_action(link.id, {
					x,
					y,
					width,
					height,
					width_original,
					height_original
				})
			);
		}

		actions.push(
			new app.Actions.Prepare_canvas_action('undo'),
			new app.Actions.Update_config_action({
				WIDTH: parseInt(selection.width),
				HEIGHT: parseInt(selection.height)
			}),
			new app.Actions.Prepare_canvas_action('do'),
			new app.Actions.Reset_selection_action(this.selection)
		);
		await app.State.do_action(
			new app.Actions.Bundle_action('crop_tool', 'Crop Tool', actions)
		);
	}

	on_leave() {
		this.straightening = null;
		return [
			new app.Actions.Reset_selection_action()
		];
	}

	/**
	 * options bar: a ratio preset fills W and H; Clear empties them
	 */
	option_changed(key, value) {
		var a = config.TOOL.attributes;
		if (key == 'ratio_preset') {
			var R = { 'Original Ratio': [config.WIDTH, config.HEIGHT], '1 x 1 (Square)': [1, 1], '4 x 5 (8 x 10)': [4, 5], '8.5 x 11': [8.5, 11], '4 x 3': [4, 3], '5 x 7': [5, 7], '2 x 3 (4 x 6)': [2, 3], '16 x 9': [16, 9] }[value];
			a.ratio_w = R ? R[0] : '';
			a.ratio_h = R ? R[1] : '';
			app.GUI.Ps_workspace.Options_bar.render();
		}
		config.need_render = true;
	}

	swap_ratio() {
		var a = config.TOOL.attributes, t = a.ratio_w;
		a.ratio_w = a.ratio_h;
		a.ratio_h = t;
		app.GUI.Ps_workspace.Options_bar.render();
	}

	clear_ratio() {
		var a = config.TOOL.attributes;
		a.ratio_w = '';
		a.ratio_h = '';
		a.ratio_preset = 'Unconstrained';
		app.GUI.Ps_workspace.Options_bar.render();
	}

	/**
	 * Straighten: drag a line along what should be level; the canvas is rotated
	 * and the crop box set to the largest rectangle inside the rotated image
	 */
	start_straighten() {
		this.straightening = { active: true };
		app.GUI.Ps_workspace.status_message('Straighten: drag a line along the horizon or a vertical edge.');
		var Selection = app.GUI.Ps_workspace.Selection;
		if (!this.straighten_overlay) {
			this.straighten_overlay = true;
			Selection.overlays = Selection.overlays || [];
			Selection.overlays.push({
				active: () => this.straightening && this.straightening.a && config.TOOL.name == 'crop',
				draw: (ctx, scale) => {
					var s = this.straightening;
					ctx.save();
					ctx.lineWidth = 1 / scale;
					ctx.strokeStyle = '#000';
					ctx.setLineDash([4 / scale, 4 / scale]);
					ctx.beginPath();
					ctx.moveTo(s.a.x, s.a.y);
					ctx.lineTo(s.b.x, s.b.y);
					ctx.stroke();
					ctx.strokeStyle = '#fff';
					ctx.lineDashOffset = 4 / scale;
					ctx.stroke();
					ctx.restore();
				},
			});
			var world = (e) => {
				var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
				return app.Layers.get_world_coords(e.clientX - rect.left, e.clientY - rect.top);
			};
			document.addEventListener('mousedown', (e) => {
				if (!this.straightening || config.TOOL.name != 'crop' || e.button != 0 || !e.target.closest('#main_wrapper')) return;
				e.stopImmediatePropagation();
				var p = world(e);
				this.straightening.a = p;
				this.straightening.b = p;
			}, true);
			document.addEventListener('mousemove', (e) => {
				if (!this.straightening || !this.straightening.a) return;
				this.straightening.b = world(e);
				Selection.draw_overlay();
			}, true);
			document.addEventListener('mouseup', (e) => {
				var s = this.straightening;
				if (!s || !s.a) return;
				e.stopImmediatePropagation();
				this.straightening = null;
				Selection.draw_overlay();
				var dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
				if (Math.hypot(dx, dy) < 2) return;
				var a = Math.atan2(dy, dx) * 180 / Math.PI;
				var level = Math.round(a / 90) * 90;
				this.straighten_by(level - a);
			}, true);
		}
	}

	async straighten_by(deg) {
		if (Math.abs(deg) < 0.01) return;
		var W = config.WIDTH, H = config.HEIGHT;
		await app.GUI.modules['ps/commands'].rotate_canvas_by(deg);
		//the largest axis-aligned rectangle inside the rotated W x H image
		var t = Math.abs(deg) * Math.PI / 180, sin = Math.sin(t), cos = Math.cos(t);
		var long = Math.max(W, H), short = Math.min(W, H), wr, hr;
		if (short <= 2 * sin * cos * long || Math.abs(sin - cos) < 1e-10) {
			var half = short / 2;
			wr = W >= H ? half / sin : half / cos;
			hr = W >= H ? half / cos : half / sin;
		}
		else {
			var cos2 = cos * cos - sin * sin;
			wr = (W * cos - H * sin) / cos2;
			hr = (H * cos - W * sin) / cos2;
		}
		var x = Math.ceil((config.WIDTH - wr) / 2), y = Math.ceil((config.HEIGHT - hr) / 2);
		this.selection = { x: x, y: y, width: Math.floor(wr), height: Math.floor(hr) };
		config.need_render = true;
	}

}

export default Crop_class;
