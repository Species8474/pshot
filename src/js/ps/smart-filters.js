/*
 * pshot - CS6 Smart Filters: filters applied to a smart object are kept in
 * layer.ps_smart.filters = [{ key, title, settings, visible }] and run on the
 * smart object's source before its transform, so they can be edited, hidden
 * or removed later. Listed under the layer in the Layers panel.
 */

import app from './../app.js';
import config from './../config.js';

class Ps_smart_filters_class {

	filters_module() {
		return app.GUI.modules['ps/filters'];
	}

	/**
	 * the builder of a filter (registered without opening its dialog)
	 */
	builder(key) {
		var F = this.filters_module();
		F.builders = F.builders || {};
		if (!F.builders[key] && typeof F[key] == 'function') {
			F.silent = true;
			try { F[key](); } finally { F.silent = false; }
		}
		return F.builders[key];
	}

	/**
	 * smart.source with the visible filters (all, or the first `upto`) applied
	 */
	filtered(smart, upto) {
		var list = (smart.filters || []).slice(0, upto == null ? undefined : upto);
		if (smart.filters_disabled || !list.some(f => f.visible !== false)) return smart.source;
		var src = smart.source;
		var c = document.createElement('canvas');
		c.width = src.width;
		c.height = src.height;
		var ctx = c.getContext('2d', { willReadFrequently: true });
		ctx.drawImage(src, 0, 0);
		for (var f of list) {
			if (f.visible === false) continue;
			var b = this.builder(f.key);
			if (!b) continue;
			var state = {};
			b.fields.forEach(fl => { state[fl.key] = fl.value; });
			Object.assign(state, f.settings);
			var data = ctx.getImageData(0, 0, c.width, c.height);
			var out = new ImageData(new Uint8ClampedArray(data.data), c.width, c.height);
			b.build(state)(data.data, out.data, c.width, c.height);
			ctx.putImageData(out, 0, 0);
		}
		return c;
	}

	/**
	 * a new smart object state -> history step with the re-rendered pixels
	 */
	async set(layer, smart, description) {
		var T = app.GUI.Ps_workspace.Transform;
		var saved = layer.ps_smart;
		layer.ps_smart = smart;
		var pixels = T.render_smart(layer, smart.source);
		layer.ps_smart = saved;
		await app.State.do_action(new app.Actions.Bundle_action('smart_filter', description, [
			new app.Actions.Update_layer_action(layer.id, {
				x: 0, y: 0, width: config.WIDTH, height: config.HEIGHT, width_original: config.WIDTH, height_original: config.HEIGHT,
				ps_smart: Object.assign({}, smart, { lx: layer.x, ly: layer.y }),
			}),
			new app.Actions.Update_layer_image_action(pixels, layer.id),
		]));
		app.GUI.GUI_layers.render_layers();
	}

	/**
	 * the selection in the smart object's source pixels (null: no selection)
	 */
	mask_from_selection(layer) {
		var sel = app.GUI.Ps_workspace.Selection, smart = layer.ps_smart;
		if (!sel.has() || !sel.mask) return null;
		var src = smart.source, c = document.createElement('canvas');
		c.width = src.width;
		c.height = src.height;
		var ctx = c.getContext('2d');
		var dx = layer.x - smart.lx, dy = layer.y - smart.ly, b = smart.box;
		if (smart.quad || smart.warp) {
			//distorted: the bounds of the corners stand in for the box
			var pts = smart.quad || smart.warp, xs = pts.map(p => p.x + dx), ys = pts.map(p => p.y + dy);
			b = { cx: (Math.min(...xs) + Math.max(...xs)) / 2 - dx, cy: (Math.min(...ys) + Math.max(...ys)) / 2 - dy, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), angle: 0 };
		}
		ctx.translate(src.width / 2, src.height / 2);
		ctx.scale(src.width / b.w, src.height / b.h);
		ctx.rotate(-b.angle);
		ctx.translate(-(b.cx + dx), -(b.cy + dy));
		ctx.drawImage(sel.mask, 0, 0);
		return c;
	}

	white_mask(smart) {
		var c = document.createElement('canvas');
		c.width = smart.source.width;
		c.height = smart.source.height;
		var ctx = c.getContext('2d');
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, c.width, c.height);
		return c;
	}

	/**
	 * the filtered source limited by the filter mask (white: filtered, black: original)
	 */
	masked(smart, filtered) {
		if (!smart.filter_mask || smart.filter_mask_disabled || filtered === smart.source) return filtered;
		var c = document.createElement('canvas');
		c.width = smart.source.width;
		c.height = smart.source.height;
		var ctx = c.getContext('2d');
		var top = document.createElement('canvas');
		top.width = c.width;
		top.height = c.height;
		var tctx = top.getContext('2d');
		tctx.drawImage(filtered, 0, 0);
		tctx.globalCompositeOperation = 'destination-in';
		tctx.drawImage(smart.filter_mask, 0, 0);
		ctx.drawImage(smart.source, 0, 0);
		//where the mask hides the filters the original pixels show
		ctx.globalCompositeOperation = 'destination-out';
		ctx.drawImage(smart.filter_mask, 0, 0);
		ctx.globalCompositeOperation = 'source-over';
		var under = document.createElement('canvas');
		under.width = c.width;
		under.height = c.height;
		var uctx = under.getContext('2d');
		uctx.drawImage(c, 0, 0);
		uctx.drawImage(top, 0, 0);
		return under;
	}

	has_mask(layer) {
		layer = layer || config.layer;
		return !!(layer && layer.ps_smart && layer.ps_smart.filter_mask);
	}

	/**
	 * Layer > Smart Filter > Add / Delete Filter Mask
	 */
	toggle_mask_exists(layer) {
		layer = layer || config.layer;
		if (!layer || !layer.ps_smart || !(layer.ps_smart.filters || []).length) return;
		var smart = Object.assign({}, layer.ps_smart);
		if (smart.filter_mask) {
			smart.filter_mask = null;
			return this.set(layer, smart, 'Delete Filter Mask');
		}
		smart.filter_mask = this.mask_from_selection(layer) || this.white_mask(smart);
		smart.filter_mask_disabled = false;
		return this.set(layer, smart, 'Add Filter Mask');
	}

	/**
	 * Layer > Smart Filter > Disable / Enable Filter Mask (Shift+click its thumbnail)
	 */
	toggle_mask(layer) {
		layer = layer || config.layer;
		if (!this.has_mask(layer)) return;
		var smart = Object.assign({}, layer.ps_smart, { filter_mask_disabled: !layer.ps_smart.filter_mask_disabled });
		return this.set(layer, smart, smart.filter_mask_disabled ? 'Disable Filter Mask' : 'Enable Filter Mask');
	}

	mask_thumb(canvas, layer) {
		var m = layer.ps_smart.filter_mask, ctx = canvas.getContext('2d');
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(m, 0, 0, canvas.width, canvas.height);
		if (layer.ps_smart.filter_mask_disabled) {
			ctx.strokeStyle = '#e00';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(0, 0); ctx.lineTo(canvas.width, canvas.height);
			ctx.moveTo(canvas.width, 0); ctx.lineTo(0, canvas.height);
			ctx.stroke();
		}
	}

	add(layer, key, title, settings) {
		var smart = Object.assign({}, layer.ps_smart);
		//CS6: the first smart filter brings a filter mask (from the selection, or white)
		if (!(smart.filters || []).length && !smart.filter_mask) {
			smart.filter_mask = this.mask_from_selection(layer) || this.white_mask(smart);
			smart.filter_mask_disabled = false;
		}
		smart.filters = (smart.filters || []).concat([{ key: key, title: title, settings: JSON.parse(JSON.stringify(settings)), visible: true }]);
		return this.set(layer, smart, title);
	}

	replace(layer, index, settings) {
		var smart = Object.assign({}, layer.ps_smart);
		smart.filters = smart.filters.map((f, i) => i == index ? Object.assign({}, f, { settings: JSON.parse(JSON.stringify(settings)) }) : f);
		return this.set(layer, smart, 'Edit ' + smart.filters[index].title);
	}

	toggle(layer, index) {
		var smart = Object.assign({}, layer.ps_smart);
		var f = smart.filters[index];
		smart.filters = smart.filters.map((x, i) => i == index ? Object.assign({}, x, { visible: x.visible === false }) : x);
		return this.set(layer, smart, (f.visible === false ? 'Show ' : 'Hide ') + f.title);
	}

	remove(layer, index) {
		var smart = Object.assign({}, layer.ps_smart);
		var f = smart.filters[index];
		smart.filters = smart.filters.filter((x, i) => i != index);
		return this.set(layer, smart, 'Delete ' + f.title);
	}

	toggle_all(layer) {
		layer = layer || config.layer;
		if (!layer || !layer.ps_smart || !(layer.ps_smart.filters || []).length) return;
		var smart = Object.assign({}, layer.ps_smart, { filters_disabled: !layer.ps_smart.filters_disabled });
		return this.set(layer, smart, smart.filters_disabled ? 'Disable Smart Filters' : 'Enable Smart Filters');
	}

	clear(layer) {
		layer = layer || config.layer;
		if (!layer || !layer.ps_smart || !(layer.ps_smart.filters || []).length) return;
		return this.set(layer, Object.assign({}, layer.ps_smart, { filters: [], filters_disabled: false }), 'Clear Smart Filters');
	}

	/**
	 * double-click a smart filter: its dialog opens on the result of the filters below it
	 */
	edit(layer, index) {
		var f = layer.ps_smart.filters[index];
		var F = this.filters_module();
		var T = app.GUI.Ps_workspace.Transform;
		var base = T.render_smart(Object.assign(Object.create(Object.getPrototypeOf(layer)), layer, { ps_smart: Object.assign({}, layer.ps_smart, { filters: layer.ps_smart.filters.slice(0, index) }) }), layer.ps_smart.source);
		F.saved = F.saved || {};
		F.saved[f.key] = Object.assign({}, f.settings);
		var adjust = app.GUI.modules['ps/commands'].Adjust;
		adjust.smart_edit = { layer: layer, index: index, base: base };
		F[f.key]();
	}

	mask_label() {
		return this.has_mask() ? 'Delete Filter Mask' : 'Add Filter Mask';
	}

	mask_toggle_label() {
		var l = config.layer;
		return l && l.ps_smart && l.ps_smart.filter_mask_disabled ? 'Enable Filter Mask' : 'Disable Filter Mask';
	}

	label() {
		var l = config.layer;
		return l && l.ps_smart && l.ps_smart.filters_disabled ? 'Enable Smart Filters' : 'Disable Smart Filters';
	}
}

export default Ps_smart_filters_class;
