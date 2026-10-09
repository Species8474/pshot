/*
 * pshot - CS6 guides: drag from the rulers to create, drag with the Move tool
 * to reposition, drag back onto a ruler (off the canvas) to delete.
 */

import app from './../app.js';
import config from './../config.js';

class Ps_guides_class {

	constructor() {
		this.drag = null;
		this.locked = false;
	}

	canvas_point(event) {
		var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
		return app.Layers.get_world_coords(event.clientX - rect.left, event.clientY - rect.top);
	}

	over_canvas(event) {
		var rect = document.getElementById('main_wrapper').getBoundingClientRect();
		return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
	}

	/**
	 * guide near the pointer (screen tolerance), for the Move tool
	 */
	hit(event) {
		if (!config.guides_enabled || this.locked) return null;
		var p = this.canvas_point(event);
		var tol = 4 / config.ZOOM;
		for (var g of config.guides) {
			if (g.y === null && g.x !== null && Math.abs(g.x - p.x) <= tol) return g;
			if (g.x === null && g.y !== null && Math.abs(g.y - p.y) <= tol) return g;
		}
		return null;
	}

	commit(new_guides, description) {
		var old = config.guides;
		config.guides = old;
		app.State.do_action(new app.Actions.Bundle_action('guides', description, [
			new app.Actions.Update_config_action({ guides: new_guides }),
		]));
	}

	start(event, guide, existing) {
		var before = config.guides.map(g => ({ x: g.x, y: g.y }));
		if (!existing) {
			config.guides.push(guide);
		}
		this.drag = { guide: guide, before: before, existing: existing };
		event.preventDefault();
		event.stopImmediatePropagation();
	}

	install() {
		var top = document.getElementById('ruler_top');
		var left = document.getElementById('ruler_left');
		top.addEventListener('mousedown', (e) => {
			if (e.button != 0) return;
			config.guides_enabled = true;
			this.start(e, { x: null, y: this.canvas_point(e).y }, false);
		});
		left.addEventListener('mousedown', (e) => {
			if (e.button != 0) return;
			config.guides_enabled = true;
			this.start(e, { x: this.canvas_point(e).x, y: null }, false);
		});
		//Move tool: grab an existing guide
		document.addEventListener('mousedown', (e) => {
			if (config.TOOL.name != 'select' || e.button != 0) return;
			if (e.target.id != 'canvas_minipaint' && e.target.id != 'main_wrapper' && e.target.id != 'ps_selection_overlay') return;
			var g = this.hit(e);
			if (g) this.start(e, g, true);
		}, true);
		document.addEventListener('mousemove', (e) => {
			if (this.drag) {
				var p = this.canvas_point(e);
				var g = this.drag.guide;
				if (g.y === null) g.x = Math.round(p.x);
				else g.y = Math.round(p.y);
				config.need_render = true;
				e.stopImmediatePropagation();
				return;
			}
			if (config.TOOL.name == 'select' && (e.target.id == 'canvas_minipaint' || e.target.id == 'main_wrapper')) {
				var hit = this.hit(e);
				var wrapper = document.getElementById('main_wrapper');
				if (hit) {
					wrapper.style.cursor = hit.y === null ? 'col-resize' : 'row-resize';
					this.hovering = true;
				}
				else if (this.hovering) {
					wrapper.style.cursor = '';
					this.hovering = false;
				}
			}
		}, true);
		document.addEventListener('mouseup', (e) => {
			if (!this.drag) return;
			var d = this.drag;
			this.drag = null;
			e.stopImmediatePropagation();
			var after = config.guides.filter(g => g !== d.guide || this.over_canvas(e)).map(g => ({ x: g.x, y: g.y }));
			var description = !this.over_canvas(e) ? 'Delete Guide' : (d.existing ? 'Move Guide' : 'New Guide');
			if (!d.existing && !this.over_canvas(e)) {
				//dragged out and back: nothing happened
				config.guides = d.before;
				config.need_render = true;
				return;
			}
			config.guides = d.before;
			this.commit(after, description);
			config.need_render = true;
		}, true);
	}

	clear() {
		if (config.guides.length == 0) return;
		this.commit([], 'Clear Guides');
	}

	toggle_lock() {
		this.locked = !this.locked;
	}
}

export default Ps_guides_class;
