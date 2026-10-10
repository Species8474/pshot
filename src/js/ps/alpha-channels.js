/*
 * pshot - CS6 alpha channels: Select > Save Selection / Load Selection and the
 * alpha rows of the Channels panel.
 *
 * config.ps_alpha = [{ name, mask }] (mask: document-sized canvas, alpha = selected)
 * config.ps_alpha_active = index of the highlighted alpha channel, -1 for none.
 * Changes replace the array through Update_config_action (undoable).
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';

function clone_canvas(c) {
	var out = document.createElement('canvas');
	out.width = c.width;
	out.height = c.height;
	out.getContext('2d').drawImage(c, 0, 0);
	return out;
}

class Ps_alpha_channels_class {

	list() {
		return config.ps_alpha || [];
	}

	async commit(list, active, description) {
		await app.State.do_action(new app.Actions.Bundle_action('alpha_channel', description, [
			new app.Actions.Update_config_action({ ps_alpha: list, ps_alpha_active: active }),
		]));
		app.GUI.Ps_workspace.render_channels(true);
	}

	next_name() {
		var n = 0;
		for (var c of this.list()) {
			var m = /^Alpha (\d+)$/.exec(c.name);
			if (m) n = Math.max(n, parseInt(m[1]));
		}
		return 'Alpha ' + (n + 1);
	}

	/**
	 * Select > Save Selection
	 */
	save_selection(quick) {
		var sel = app.GUI.Ps_workspace.Selection;
		if (!sel.has()) return;
		var add = (name) => {
			var list = this.list().slice();
			list.push({ name: name, mask: clone_canvas(sel.mask) });
			return this.commit(list, config.ps_alpha_active == null ? -1 : config.ps_alpha_active, 'Save Selection');
		};
		if (quick) return add(this.next_name());
		var POP = new Dialog_class();
		POP.show({
			title: 'Save Selection',
			params: [
				{ title: 'Destination' },
				{ name: 'name', title: 'Name:', value: this.next_name() },
			],
			on_finish: (params) => add(params.name || this.next_name()),
		});
	}

	/**
	 * Select > Load Selection (also Ctrl+click on a channel)
	 */
	load_selection() {
		var list = this.list();
		var names = list.map(c => c.name);
		var POP = new Dialog_class();
		var sel = app.GUI.Ps_workspace.Selection;
		var ops = ['New Selection', 'Add to Selection', 'Subtract from Selection', 'Intersect with Selection'];
		POP.show({
			title: 'Load Selection',
			params: [
				{ title: 'Source' },
				{ name: 'channel', title: 'Channel:', values: ['Layer Transparency'].concat(names), value: names[config.ps_alpha_active] || names[0] || 'Layer Transparency', type: 'select' },
				{ name: 'invert', title: 'Invert', value: false },
				{ title: 'Operation' },
				{ name: 'op', title: '', values: sel.has() ? ops : ops.slice(0, 1), value: 'New Selection' },
			],
			on_finish: (params) => {
				var map = { 'New Selection': 'new', 'Add to Selection': 'add', 'Subtract from Selection': 'subtract', 'Intersect with Selection': 'intersect' };
				var index = names.indexOf(params.channel);
				this.load(index, map[params.op] || 'new', !!params.invert);
			},
		});
	}

	/**
	 * index -1 = the active layer's transparency
	 */
	load(index, op, invert) {
		var sel = app.GUI.Ps_workspace.Selection;
		var mask;
		if (index < 0) {
			mask = document.createElement('canvas');
			mask.width = config.WIDTH;
			mask.height = config.HEIGHT;
			app.Layers.render_object(mask.getContext('2d'), config.layer);
		}
		else {
			mask = clone_canvas(this.list()[index].mask);
		}
		if (invert) {
			var inv = document.createElement('canvas');
			inv.width = mask.width;
			inv.height = mask.height;
			var ictx = inv.getContext('2d');
			ictx.fillStyle = '#fff';
			ictx.fillRect(0, 0, inv.width, inv.height);
			ictx.globalCompositeOperation = 'destination-out';
			ictx.drawImage(mask, 0, 0);
			mask = inv;
		}
		//only the alpha matters: make the shape white
		var shape = document.createElement('canvas');
		shape.width = mask.width;
		shape.height = mask.height;
		var sctx = shape.getContext('2d');
		sctx.drawImage(mask, 0, 0);
		sctx.globalCompositeOperation = 'source-in';
		sctx.fillStyle = '#fff';
		sctx.fillRect(0, 0, shape.width, shape.height);
		return sel.commit(sel.combine(shape, op || 'new'), 'Load Selection');
	}

	new_channel() {
		var list = this.list().slice();
		var mask = document.createElement('canvas');
		mask.width = config.WIDTH;
		mask.height = config.HEIGHT;
		list.push({ name: this.next_name(), mask: mask });
		return this.commit(list, list.length - 1, 'New Channel');
	}

	delete_channel() {
		var index = config.ps_alpha_active;
		if (index == null || index < 0 || !this.list()[index]) return;
		var list = this.list().slice();
		list.splice(index, 1);
		return this.commit(list, -1, 'Delete Channel');
	}

	/**
	 * Duplicate Channel... (an alpha channel, or a color channel as a new alpha channel)
	 * source: alpha index, or 'r' / 'g' / 'b' / 'rgb'
	 */
	duplicate_channel(source) {
		var alpha = typeof source == 'number';
		var src_name = alpha ? this.list()[source].name : { r: 'Red', g: 'Green', b: 'Blue', rgb: 'Gray' }[source];
		var POP = new Dialog_class();
		POP.show({
			title: 'Duplicate Channel',
			params: [
				{ title: 'Duplicate: ' + src_name },
				{ name: 'name', title: 'As:', value: src_name + ' copy' },
				{ name: 'invert', title: 'Invert', value: false },
			],
			on_finish: (p) => {
				var mask = alpha ? clone_canvas(this.list()[source].mask) : this.color_channel_mask(source);
				if (p.invert) {
					var ctx = mask.getContext('2d');
					var img = ctx.getImageData(0, 0, mask.width, mask.height), d = img.data;
					for (var i = 3; i < d.length; i += 4) d[i] = 255 - d[i];
					ctx.putImageData(img, 0, 0);
				}
				var list = this.list().slice();
				list.push({ name: p.name || src_name + ' copy', mask: mask });
				this.commit(list, list.length - 1, 'Duplicate Channel');
			},
		});
	}

	/**
	 * a color channel of the composite as a mask (channel value = selection strength)
	 */
	color_channel_mask(channel) {
		var w = config.WIDTH, h = config.HEIGHT;
		var c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		var ctx = c.getContext('2d', { willReadFrequently: true });
		app.Layers.convert_layers_to_canvas(ctx, null, false);
		var img = ctx.getImageData(0, 0, w, h), d = img.data;
		for (var i = 0; i < d.length; i += 4) {
			var v = channel == 'r' ? d[i] : (channel == 'g' ? d[i + 1] : (channel == 'b' ? d[i + 2] : 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]));
			v = v * d[i + 3] / 255;
			d[i] = d[i + 1] = d[i + 2] = 255;
			d[i + 3] = v;
		}
		ctx.putImageData(img, 0, 0);
		return c;
	}

	/**
	 * Channel Options... (an alpha channel's name)
	 */
	channel_options(index) {
		var ch = this.list()[index];
		if (!ch) return;
		var POP = new Dialog_class();
		POP.show({
			title: 'Channel Options',
			params: [{ name: 'name', title: 'Name:', value: ch.name }],
			on_finish: (p) => {
				var list = this.list().slice();
				list[index] = Object.assign({}, ch, { name: p.name || ch.name });
				this.commit(list, config.ps_alpha_active, 'Channel Options');
			},
		});
	}

	/**
	 * channel thumbnail: white = selected, black = not (CS6)
	 */
	thumb(canvas, mask) {
		var ctx = canvas.getContext('2d');
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		var s = Math.min(canvas.width / mask.width, canvas.height / mask.height);
		var w = mask.width * s, h = mask.height * s;
		var tmp = document.createElement('canvas');
		tmp.width = mask.width;
		tmp.height = mask.height;
		var t = tmp.getContext('2d');
		t.drawImage(mask, 0, 0);
		t.globalCompositeOperation = 'source-in';
		t.fillStyle = '#fff';
		t.fillRect(0, 0, tmp.width, tmp.height);
		ctx.drawImage(tmp, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
	}
}

export default Ps_alpha_channels_class;
