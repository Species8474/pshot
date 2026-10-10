import app from './../../app.js';
import GUI_preview_class from './../../core/gui/gui-preview.js';

class View_zoom_class {

	constructor() {
		this.GUI_preview = new GUI_preview_class();
	}

	in() {
		this.GUI_preview.zoom(1).then(() => this.resize_window());
	}

	out() {
		this.GUI_preview.zoom(-1).then(() => this.resize_window());
	}

	/**
	 * pshot: Preferences > Zoom Resizes Windows (floating document windows)
	 */
	resize_window() {
		var ws = app.GUI && app.GUI.Ps_workspace;
		if (ws && ws.Preferences && ws.Preferences.values.zoom_resizes) ws.Float.fit_current();
	}

	original() {
		this.GUI_preview.zoom(100);
	}

	auto() {
		this.GUI_preview.zoom_auto();
	}
}

export default View_zoom_class;
