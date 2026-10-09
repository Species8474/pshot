/*
 * pshot - Zoom Tool (Z): click zooms in at the point, Alt+click zooms out.
 */

import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import GUI_preview_class from './../core/gui/gui-preview.js';

class Zoom_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.ctx = ctx;
		this.name = 'zoom';
		this.GUI_preview = new GUI_preview_class();
	}

	load() {
		document.addEventListener('mousedown', (event) => {
			if (config.TOOL.name != this.name || config.space_hand === true)
				return;
			if (event.target.id != 'canvas_minipaint' && event.target.id != 'main_wrapper')
				return;
			var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
			this.GUI_preview.zoom_data.x = event.clientX - rect.left;
			this.GUI_preview.zoom_data.y = event.clientY - rect.top;
			this.GUI_preview.zoom(event.altKey ? -1 : 1);
			event.preventDefault();
		});
		document.addEventListener('keydown', (event) => {
			if (config.TOOL.name == this.name && event.key == 'Alt')
				this.set_cursor(true);
		});
		document.addEventListener('keyup', (event) => {
			if (config.TOOL.name == this.name && event.key == 'Alt')
				this.set_cursor(false);
		});
	}

	set_cursor(out) {
		document.getElementById('main_wrapper').style.cursor = out ? 'zoom-out' : 'zoom-in';
	}

	on_activate() {
		this.set_cursor(false);
	}
}

export default Zoom_class;
