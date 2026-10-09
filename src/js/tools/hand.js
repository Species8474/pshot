/*
 * pshot - Hand Tool (H): drag to scroll the document view.
 */

import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import GUI_preview_class from './../core/gui/gui-preview.js';

class Hand_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.ctx = ctx;
		this.name = 'hand';
		this.last = null;
		this.GUI_preview = new GUI_preview_class();
	}

	load() {
		document.addEventListener('mousedown', (event) => {
			if (!this.is_active() || !this.is_canvas_event(event))
				return;
			this.last = {x: event.clientX, y: event.clientY};
			document.getElementById('main_wrapper').style.cursor = 'grabbing';
			event.preventDefault();
		});
		document.addEventListener('mousemove', (event) => {
			if (this.last == null)
				return;
			this.GUI_preview.pan(event.clientX - this.last.x, event.clientY - this.last.y);
			this.last = {x: event.clientX, y: event.clientY};
		});
		document.addEventListener('mouseup', () => {
			if (this.last == null)
				return;
			this.last = null;
			document.getElementById('main_wrapper').style.cursor = this.is_active() ? 'grab' : '';
		});
	}

	/**
	 * the Hand tool is active, either selected or held with the spacebar
	 */
	is_active() {
		return config.TOOL.name == this.name || config.space_hand === true;
	}

	is_canvas_event(event) {
		return event.target.id == 'canvas_minipaint' || event.target.id == 'main_wrapper';
	}

	on_activate() {
		document.getElementById('main_wrapper').style.cursor = 'grab';
	}
}

export default Hand_class;
