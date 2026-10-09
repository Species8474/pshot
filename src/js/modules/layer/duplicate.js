import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import Helper_class from './../../libs/helpers.js';

var instance = null;

class Layer_duplicate_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();

		this.set_events();
	}

	set_events() {
		document.addEventListener('keydown', (event) => {
			var code = event.keyCode;
			if (this.Helper.is_input(event.target))
				return;

			if (code == 68) {
				//D - duplicate
				this.duplicate();
				event.preventDefault();
			}
		}, false);
	}

	duplicate() {
		var params = JSON.parse(JSON.stringify(config.layer));
		delete params.id;
		delete params.order;

		//pshot: CS6 names duplicates "X copy", "X copy 2", ... and keeps them in place
		var base = params.name.replace(/ copy( \d+)?$/, '');
		var existing = config.layers.map(l => l.name);
		var name = base + ' copy';
		for (var n = 2; existing.indexOf(name) >= 0; n++) {
			name = base + ' copy ' + n;
		}
		params.name = name;
		var source = config.layer;
		//pshot: smart object sources are canvases (not JSON); copies are not linked (CS6)
		if (source.ps_smart) params.ps_smart = Object.assign({}, source.ps_smart);
		delete params.ps_link;
		delete params.ps_mask;
		delete params.ps_mask_x;
		delete params.ps_mask_y;
		delete params.ps_mask_disabled;
		delete params.ps_mask_editing;

		for (var i in params) {
			//remove private attributes
			if (i[0] == '_')
				delete params[i];
		}

		if (params.type == 'image') {
			//image
			params.link = config.layer.link.cloneNode(true);
		}

		var actions = [new app.Actions.Insert_layer_action(params, false)];
		return app.State.do_action(
			new app.Actions.Bundle_action('duplicate_layer', 'Duplicate Layer', actions)
		).then(() => {
			//the layer mask comes along (canvas can't go through JSON)
			if (source.ps_mask && config.layer && config.layer !== source) {
				var mask = document.createElement('canvas');
				mask.width = source.ps_mask.width;
				mask.height = source.ps_mask.height;
				mask.getContext('2d').drawImage(source.ps_mask, 0, 0);
				config.layer.ps_mask = mask;
				config.layer.ps_mask_x = source.ps_mask_x;
				config.layer.ps_mask_y = source.ps_mask_y;
				config.layer.ps_mask_disabled = source.ps_mask_disabled;
				app.GUI.GUI_layers.render_layers();
			}
		});
	}

}

export default Layer_duplicate_class;