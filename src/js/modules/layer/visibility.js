import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';

class Layer_visibility_class {

	constructor() {
		this.Base_layers = new Base_layers_class();
	}

	toggle() {
		//pshot: a History step only with Make Layer Visibility Changes Undoable (CS6)
		app.GUI.Ps_workspace.toggle_visibility(config.layer.id);
	}

}

export default Layer_visibility_class;