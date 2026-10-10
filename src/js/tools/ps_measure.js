/*
 * pshot - CS6 measuring tools in the Eyedropper group:
 *   mode 'ruler'    Ruler Tool: drag a measuring line (options bar shows X, Y,
 *                   W, H, A, L1); Straighten Layer rotates the layer level
 *   mode 'sampler'  Color Sampler Tool: up to 4 samplers read out in the Info
 *                   panel; drag to move, Alt+click to delete
 *   mode 'count'    Count Tool: numbered markers
 * Markers are view aids (not History states), as in CS6.
 */

import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import zoomView from './../libs/zoomView.js';

class Ps_measure_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.ctx = ctx;
		this.name = 'ps_measure';
		this.ruler = null;
		this.samplers = [];
		this.counts = [];
		this.drag = null;
	}

	mode() {
		return config.TOOL.attributes.mode || 'ruler';
	}

	world(e) {
		var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
		return app.Layers.get_world_coords(e.clientX - rect.left, e.clientY - rect.top);
	}

	selection() {
		return app.GUI.Ps_workspace.Selection;
	}

	load() {
		var Selection = this.selection();
		Selection.overlays = Selection.overlays || [];
		Selection.overlays.push({
			active: () => this.ruler || this.samplers.length || this.counts.length,
			draw: (ctx, scale) => this.draw(ctx, scale),
		});
		document.addEventListener('mousedown', (e) => {
			if (config.TOOL.name != this.name || config.space_hand || e.button != 0) return;
			if (e.target.id != 'canvas_minipaint' && e.target.id != 'main_wrapper') return;
			e.preventDefault();
			this.mousedown(e);
		});
		document.addEventListener('mousemove', (e) => {
			if (config.TOOL.name != this.name || !this.drag) return;
			this.mousemove(e);
		});
		document.addEventListener('mouseup', () => {
			if (config.TOOL.name != this.name || !this.drag) return;
			if (this.drag.note) app.GUI.Ps_workspace.Notes.mouseup();
			this.drag = null;
			this.refresh();
		});
	}

	near(a, p) {
		var t = 6 / zoomView.getScale();
		return Math.abs(a.x - p.x) <= t && Math.abs(a.y - p.y) <= t;
	}

	mousedown(e) {
		var p = this.world(e);
		var mode = this.mode();
		if (mode == 'note') {
			app.GUI.Ps_workspace.Notes.mousedown(p);
			this.drag = { note: true };
			return;
		}
		if (mode == 'ruler') {
			if (this.ruler && this.near({ x: this.ruler.x1, y: this.ruler.y1 }, p)) this.drag = { end: 1 };
			else if (this.ruler && this.near({ x: this.ruler.x2, y: this.ruler.y2 }, p)) this.drag = { end: 2 };
			else {
				this.ruler = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
				this.drag = { end: 2 };
			}
		}
		else if (mode == 'sampler') {
			var hit = this.samplers.findIndex(s => this.near(s, p));
			if (hit >= 0 && e.altKey) {
				this.samplers.splice(hit, 1);
			}
			else if (hit >= 0) {
				this.drag = { sampler: hit };
			}
			else if (this.samplers.length < 4) {
				this.samplers.push({ x: Math.floor(p.x) + 0.5, y: Math.floor(p.y) + 0.5 });
				this.drag = { sampler: this.samplers.length - 1 };
			}
			else {
				app.GUI.Ps_workspace.status_message('Only 4 color samplers can be placed. Alt+click a sampler to delete it.');
			}
		}
		else if (mode == 'count') {
			var chit = this.counts.findIndex(c => this.near(c, p));
			if (chit >= 0 && e.altKey) this.counts.splice(chit, 1);
			else if (chit >= 0) this.drag = { count: chit };
			else this.counts.push({ x: p.x, y: p.y });
		}
		this.refresh();
	}

	mousemove(e) {
		var p = this.world(e);
		var d = this.drag;
		if (d.note) {
			app.GUI.Ps_workspace.Notes.mousemove(p);
			return;
		}
		if (d.end && this.ruler) {
			if (e.shiftKey) {
				//constrain to 45 degree steps
				var ox = d.end == 2 ? this.ruler.x1 : this.ruler.x2, oy = d.end == 2 ? this.ruler.y1 : this.ruler.y2;
				var a = Math.round(Math.atan2(p.y - oy, p.x - ox) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(p.x - ox, p.y - oy);
				p = { x: ox + Math.cos(a) * l, y: oy + Math.sin(a) * l };
			}
			this.ruler['x' + d.end] = p.x;
			this.ruler['y' + d.end] = p.y;
		}
		else if (d.sampler != null) {
			this.samplers[d.sampler] = { x: Math.floor(p.x) + 0.5, y: Math.floor(p.y) + 0.5 };
		}
		else if (d.count != null) {
			this.counts[d.count] = { x: p.x, y: p.y };
		}
		this.refresh(true);
	}

	refresh(light) {
		this.selection().draw_overlay();
		app.GUI.Ps_workspace.render_samplers && app.GUI.Ps_workspace.render_samplers(this.sampler_values());
		if (!light || this.mode() == 'ruler') app.GUI.Ps_workspace.Options_bar.update_readouts && app.GUI.Ps_workspace.Options_bar.update_readouts();
	}

	/**
	 * the composite color under each sampler
	 */
	sampler_values() {
		if (!this.samplers.length) return [];
		var c = document.createElement('canvas');
		c.width = config.WIDTH;
		c.height = config.HEIGHT;
		var ctx = c.getContext('2d', { willReadFrequently: true });
		app.Layers.convert_layers_to_canvas(ctx, null, false);
		var size = parseInt(config.TOOL.attributes.sample_size) || 1;
		return this.samplers.map((s) => {
			var r = Math.floor(size / 2), x0 = Math.max(0, Math.floor(s.x) - r), y0 = Math.max(0, Math.floor(s.y) - r);
			var d = ctx.getImageData(x0, y0, Math.max(1, size), Math.max(1, size)).data, sum = [0, 0, 0], n = 0;
			for (var i = 0; i < d.length; i += 4) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; n++; }
			return sum.map(v => Math.round(v / n));
		});
	}

	measure() {
		var r = this.ruler;
		if (!r) return null;
		var w = r.x2 - r.x1, h = r.y2 - r.y1;
		var angle = -Math.atan2(h, w) * 180 / Math.PI;
		return { x: Math.round(r.x1), y: Math.round(r.y1), w: Math.round(w), h: Math.round(h), a: angle, l: Math.hypot(w, h) };
	}

	draw(ctx, scale) {
		ctx.save();
		ctx.lineWidth = 1 / scale;
		if (this.ruler) {
			var r = this.ruler;
			ctx.strokeStyle = '#000';
			ctx.beginPath();
			ctx.moveTo(r.x1, r.y1);
			ctx.lineTo(r.x2, r.y2);
			ctx.stroke();
			ctx.strokeStyle = '#fff';
			ctx.setLineDash([3 / scale, 3 / scale]);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.strokeStyle = '#000';
			for (var [x, y] of [[r.x1, r.y1], [r.x2, r.y2]]) {
				ctx.beginPath();
				ctx.moveTo(x - 4 / scale, y); ctx.lineTo(x + 4 / scale, y);
				ctx.moveTo(x, y - 4 / scale); ctx.lineTo(x, y + 4 / scale);
				ctx.stroke();
			}
		}
		ctx.font = (10 / scale) + 'px Arial';
		this.samplers.forEach((s, i) => {
			var rr = 5 / scale;
			ctx.strokeStyle = '#000';
			ctx.beginPath();
			ctx.arc(s.x, s.y, rr, 0, Math.PI * 2);
			ctx.moveTo(s.x - rr * 1.8, s.y); ctx.lineTo(s.x + rr * 1.8, s.y);
			ctx.moveTo(s.x, s.y - rr * 1.8); ctx.lineTo(s.x, s.y + rr * 1.8);
			ctx.stroke();
			ctx.fillStyle = '#000';
			ctx.fillText(String(i + 1), s.x + rr * 1.4, s.y + rr * 2.6);
		});
		//View > Show > Count
		if (app.GUI.Ps_workspace.show_count !== false) this.counts.forEach((c, i) => {
			ctx.fillStyle = '#ff5050';
			ctx.beginPath();
			ctx.arc(c.x, c.y, 3 / scale, 0, Math.PI * 2);
			ctx.fill();
			ctx.font = 'bold ' + (12 / scale) + 'px Arial';
			ctx.fillText(String(i + 1), c.x + 5 / scale, c.y - 5 / scale);
		});
		ctx.restore();
	}

	clear() {
		var mode = this.mode();
		if (mode == 'ruler') this.ruler = null;
		else if (mode == 'sampler') this.samplers = [];
		else this.counts = [];
		this.refresh();
	}

	/**
	 * Ruler: Straighten Layer rotates the active layer so the measured line is level
	 */
	straighten() {
		var m = this.measure();
		if (!m || m.l < 1) return;
		var a = m.a;
		//the nearest of horizontal / vertical
		var target = Math.round(a / 90) * 90;
		var rotate = (target - a) * Math.PI / 180;
		var T = app.GUI.Ps_workspace.Transform;
		T.start();
		if (!T.job) return;
		T.job.box.angle = -rotate;
		T.commit();
		this.ruler = null;
		this.refresh();
	}

	on_activate() {
		document.getElementById('main_wrapper').style.cursor = 'crosshair';
		this.refresh();
	}
}

export default Ps_measure_class;
