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

	add(layer, key, title, settings) {
		var smart = Object.assign({}, layer.ps_smart);
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

	label() {
		var l = config.layer;
		return l && l.ps_smart && l.ps_smart.filters_disabled ? 'Enable Smart Filters' : 'Disable Smart Filters';
	}
}

export default Ps_smart_filters_class;
