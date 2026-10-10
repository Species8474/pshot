/*
 * pshot - Zoom Tool (Z): click zooms in at the point, Alt+click zooms out.
 * With Scrubby Zoom a drag zooms continuously (right = in, left = out);
 * without it a drag marks the area to zoom into.
 */

import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import GUI_preview_class from './../core/gui/gui-preview.js';

class Zoom_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.ctx = ctx;
		this.name = 'zoom';
		this.drag = null;
		this.GUI_preview = new GUI_preview_class();
	}

	load() {
		document.addEventListener('mousedown', (event) => {
			if (config.TOOL.name != this.name || config.space_hand === true || event.button != 0)
				return;
			if (event.target.id != 'canvas_minipaint' && event.target.id != 'main_wrapper')
				return;
			var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
			this.drag = { x: event.clientX, y: event.clientY, rect: rect, zoom: config.ZOOM, out: event.altKey, moved: false };
			this.GUI_preview.zoom_data.x = event.clientX - rect.left;
			this.GUI_preview.zoom_data.y = event.clientY - rect.top;
			event.preventDefault();
		});
		document.addEventListener('mousemove', (event) => {
			var d = this.drag;
			if (!d) return;
			var dx = event.clientX - d.x, dy = event.clientY - d.y;
			if (!d.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
			d.moved = true;
			if (this.getParams().scrubby) {
				var z = Math.max(0.01, Math.min(32, d.zoom * Math.pow(2, dx / 100)));
				this.GUI_preview.zoom(z * 100);
			}
			else {
				this.marquee(d, event);
			}
		});
		document.addEventListener('mouseup', (event) => {
			var d = this.drag;
			if (!d) return;
			this.drag = null;
			var box = document.getElementById('ps_zoom_marquee');
			if (box) box.remove();
			if (!d.moved) {
				this.GUI_preview.zoom(d.out ? -1 : 1).then(() => this.after_zoom());
			}
			else if (!this.getParams().scrubby) {
				this.zoom_to_area(d, event);
			}
			else {
				this.after_zoom();
			}
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

	marquee(d, event) {
		var box = document.getElementById('ps_zoom_marquee');
		if (!box) {
			box = document.createElement('div');
			box.id = 'ps_zoom_marquee';
			document.body.appendChild(box);
		}
		Object.assign(box.style, {
			left: Math.min(d.x, event.clientX) + 'px', top: Math.min(d.y, event.clientY) + 'px',
			width: Math.abs(event.clientX - d.x) + 'px', height: Math.abs(event.clientY - d.y) + 'px',
		});
	}

	/**
	 * the marked area fills the window, centered
	 */
	async zoom_to_area(d, event) {
		var w = Math.abs(event.clientX - d.x), h = Math.abs(event.clientY - d.y);
		if (w < 4 || h < 4) return;
		var view = document.getElementById('main_wrapper');
		var target = this.world((d.x + event.clientX) / 2, (d.y + event.clientY) / 2);
		var z = Math.max(0.01, Math.min(32, config.ZOOM * Math.min(view.clientWidth / w, view.clientHeight / h)));
		this.GUI_preview.zoom_data.x = (d.x + event.clientX) / 2 - d.rect.left;
		this.GUI_preview.zoom_data.y = (d.y + event.clientY) / 2 - d.rect.top;
		await this.GUI_preview.zoom(z * 100);
		await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
		//then the area's center moves to the middle of the window
		var vr = view.getBoundingClientRect();
		var mid = this.world(vr.left + vr.width / 2, vr.top + vr.height / 2);
		this.GUI_preview.pan((mid.x - target.x) * config.ZOOM, (mid.y - target.y) * config.ZOOM);
		this.after_zoom();
	}

	/**
	 * image coordinates under a screen point
	 */
	world(x, y) {
		var c = document.getElementById('canvas_minipaint').getBoundingClientRect();
		return this.Base_layers.get_world_coords(x - c.left, y - c.top);
	}

	/**
	 * the options bar's window options
	 */
	after_zoom() {
		var params = this.getParams(), F = app.GUI.Ps_workspace.Float;
		if (params.resize_windows) F.fit_current();
		if (params.zoom_all) F.match('zoom', true);
	}

	set_cursor(out) {
		document.getElementById('main_wrapper').style.cursor = out ? 'zoom-out' : 'zoom-in';
	}

	on_activate() {
		this.set_cursor(false);
	}
}

export default Zoom_class;
