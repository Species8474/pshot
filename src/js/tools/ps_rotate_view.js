/*
 * pshot - CS6 Rotate View Tool (R): drag to rotate the document window around
 * its center (Shift snaps to 15 degrees); a compass shows north while
 * dragging. Esc or Reset View returns to 0. The pixels are not changed.
 */

import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';

class Ps_rotate_view_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.ctx = ctx;
		this.name = 'ps_rotate_view';
		this.drag = null;
	}

	center() {
		var r = document.getElementById('canvas_wrapper').getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
	}

	load() {
		var ws = () => app.GUI.Ps_workspace;
		document.addEventListener('mousedown', (e) => {
			if (config.TOOL.name != this.name || e.button != 0) return;
			if (e.target.id != 'canvas_minipaint' && e.target.id != 'main_wrapper' && e.target.id != 'ps_selection_overlay') return;
			e.preventDefault();
			var c = this.center();
			this.drag = { c: c, start: Math.atan2(e.clientY - c.y, e.clientX - c.x), rotation: ws().view_rotation || 0 };
			this.compass(true);
		});
		document.addEventListener('mousemove', (e) => {
			if (config.TOOL.name != this.name || !this.drag) return;
			var d = this.drag;
			var a = d.rotation + (Math.atan2(e.clientY - d.c.y, e.clientX - d.c.x) - d.start) * 180 / Math.PI;
			if (e.shiftKey) a = Math.round(a / 15) * 15;
			ws().set_view_rotation(a);
			this.compass(true);
		});
		document.addEventListener('mouseup', () => {
			if (!this.drag) return;
			this.drag = null;
			this.compass(false);
		});
		document.addEventListener('keydown', (e) => {
			if (config.TOOL.name != this.name || e.key != 'Escape' || e.target.tagName == 'INPUT') return;
			ws().set_view_rotation(0);
			this.drag = null;
			this.compass(false);
		});
	}

	/**
	 * the CS6 compass: red needle pointing to the document's north
	 */
	compass(show) {
		var el = document.getElementById('ps_rotate_compass');
		if (!show) {
			if (el) el.remove();
			return;
		}
		if (!el) {
			el = document.createElement('div');
			el.id = 'ps_rotate_compass';
			el.innerHTML = '<svg viewBox="0 0 100 100" width="100" height="100"><circle cx="50" cy="50" r="46" fill="rgba(0,0,0,0.35)" stroke="#fff" stroke-width="2"/>'
				+ '<g class="needle"><path d="M50 8 L57 50 L43 50 Z" fill="#e02020"/><path d="M50 92 L57 50 L43 50 Z" fill="#fff"/></g></svg>';
			document.body.appendChild(el);
		}
		var c = this.drag ? this.drag.c : this.center();
		el.style.left = (c.x - 50) + 'px';
		el.style.top = (c.y - 50) + 'px';
		el.querySelector('.needle').setAttribute('transform', 'rotate(' + (app.GUI.Ps_workspace.view_rotation || 0) + ' 50 50)');
	}
}

export default Ps_rotate_view_class;
