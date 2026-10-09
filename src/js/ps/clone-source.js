/*
 * pshot - CS6 Clone Source panel and the Clone Stamp's source geometry: five
 * source slots (Alt+click sets the active one), Offset X/Y (destination minus
 * source, fixed by the first stroke when Aligned), W/H scale, rotation, and the
 * overlay preview of the source under the brush.
 */

import app from './../app.js';
import config from './../config.js';

const SLOT_ICON = '<svg viewBox="0 0 18 18" width="18" height="18"><path d="M6.5 2.5h5v3.5c0 1.5-1.5 2-1.5 3.5h4.5v3h-11v-3H8C8 8 6.5 7.5 6.5 6z" fill="currentColor"/><path d="M3 14.5h12v1.5H3z" fill="currentColor"/></svg>';

class Ps_clone_source_class {

	constructor() {
		this.slots = [0, 1, 2, 3, 4].map(() => ({ x: null, y: null, offset: null, w: 100, h: 100, angle: 0 }));
		this.active = 0;
		this.overlay = { show: true, opacity: 100, clipped: true, auto_hide: false, invert: false };
		this.cursor = null;
		this.painting = false;
		this.sample_cache = null;
	}

	slot() {
		return this.slots[this.active];
	}

	has_source() {
		return this.slot().x != null;
	}

	/**
	 * Alt+click: the active slot's source point (document coordinates)
	 */
	set_source(x, y) {
		var s = this.slot();
		s.x = x;
		s.y = y;
		s.offset = null;
		this.render();
	}

	/**
	 * start of a stroke at d: Aligned keeps the offset of the first stroke,
	 * otherwise every stroke starts again from the source point
	 */
	begin_stroke(d, aligned) {
		var s = this.slot();
		if (!s.offset || !aligned) s.offset = { x: d.x - s.x, y: d.y - s.y };
		this.render();
	}

	/**
	 * destination point (document) -> source point (document)
	 */
	map(d, offset) {
		var s = this.slot(), o = offset || s.offset || { x: 0, y: 0 };
		var vx = d.x - (s.x + o.x), vy = d.y - (s.y + o.y);
		var a = -s.angle * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
		var rx = vx * cos - vy * sin, ry = vx * sin + vy * cos;
		return { x: s.x + rx / (s.w / 100 || 1), y: s.y + ry / (s.h / 100 || 1) };
	}

	transformed() {
		var s = this.slot();
		return s.w != 100 || s.h != 100 || s.angle != 0;
	}

	/**
	 * the image the Clone Stamp samples (document size): Current Layer,
	 * Current & Below or All Layers
	 */
	sample_canvas(sample) {
		var c = document.createElement('canvas');
		c.width = config.WIDTH;
		c.height = config.HEIGHT;
		var ctx = c.getContext('2d', { willReadFrequently: true });
		if (sample == 'All Layers') {
			app.Layers.convert_layers_to_canvas(ctx, null, false);
			return c;
		}
		var upto = config.layers.indexOf(config.layer);
		var list = sample == 'Current & Below' ? config.layers.slice(0, upto + 1) : [config.layer];
		for (var l of list) {
			if (!l || l.visible === false) continue;
			ctx.globalAlpha = sample == 'Current Layer' ? 1 : l.opacity / 100;
			ctx.globalCompositeOperation = sample == 'Current Layer' ? 'source-over' : (l.composition || 'source-over');
			app.Layers.render_object(ctx, l);
		}
		ctx.globalAlpha = 1;
		ctx.globalCompositeOperation = 'source-over';
		return c;
	}

	// ---------- overlay ----------

	install() {
		var Selection = app.GUI.Ps_workspace.Selection;
		Selection.overlays = Selection.overlays || [];
		Selection.overlays.push({
			active: () => this.overlay_active(),
			draw: (ctx) => this.draw_overlay(ctx),
		});
		document.addEventListener('mousemove', (e) => {
			if (!this.tool_active()) return;
			var canvas = document.getElementById('canvas_minipaint');
			if (!canvas || !e.target.closest || !e.target.closest('#main_wrapper, #canvas_wrapper')) {
				if (this.cursor) { this.cursor = null; Selection.draw_overlay(); }
				return;
			}
			var tool = app.GUI.GUI_tools.tools_modules.retouch.object;
			var m = tool.get_mouse_info(e);
			this.cursor = { x: m.x, y: m.y };
			Selection.draw_overlay();
		});
	}

	tool_active() {
		return config.TOOL && config.TOOL.name == 'retouch' && config.TOOL.attributes.mode == 'clone';
	}

	overlay_active() {
		return this.overlay.show && this.tool_active() && this.has_source() && this.cursor && !(this.overlay.auto_hide && this.painting);
	}

	draw_overlay(ctx) {
		var key = app.State.action_history_index + ':' + config.layers.length + ':' + config.WIDTH + 'x' + config.HEIGHT;
		if (!this.sample_cache || this.sample_cache.key != key) {
			this.sample_cache = { key: key, canvas: this.sample_canvas('All Layers') };
		}
		var s = this.slot();
		//before the first stroke the overlay follows the pointer from the source point
		var o = s.offset || { x: this.cursor.x - s.x, y: this.cursor.y - s.y };
		var size = config.TOOL.attributes.size || 30;
		ctx.save();
		if (this.overlay.clipped) {
			ctx.beginPath();
			ctx.arc(this.cursor.x, this.cursor.y, size / 2, 0, Math.PI * 2);
			ctx.clip();
		}
		ctx.globalAlpha = this.overlay.opacity / 100 * (this.overlay.clipped ? 1 : 0.5);
		if (this.overlay.invert) ctx.globalCompositeOperation = 'difference';
		//source -> destination: translate to the destination anchor, rotate, scale, back from the source
		ctx.translate(s.x + o.x, s.y + o.y);
		ctx.rotate(s.angle * Math.PI / 180);
		ctx.scale(s.w / 100, s.h / 100);
		ctx.translate(-s.x, -s.y);
		ctx.drawImage(this.sample_cache.canvas, 0, 0);
		ctx.restore();
	}

	// ---------- panel ----------

	render() {
		var el = document.getElementById('ps_clone_source');
		if (!el || !el.isConnected || !el.closest('.ps_panel.active, .ps_popout')) return;
		var s = this.slot();
		var num = (v) => (Math.round(v * 10) / 10);
		var html = '<div class="ps_cs_slots">';
		for (var i = 0; i < 5; i++) {
			html += '<button type="button" class="ps_cs_slot' + (i == this.active ? ' active' : '') + (this.slots[i].x != null ? ' set' : '') + '" data-slot="' + i + '" title="Clone Source">' + SLOT_ICON + '</button>';
		}
		html += '</div>';
		html += '<div class="ps_cs_row ps_cs_file">' + (this.has_source() ? 'Source: ' + app.GUI.Ps_workspace.Helper.escapeHtml(app.GUI.Ps_workspace.Documents.current().name || 'Untitled') + ' (' + Math.round(s.x) + ', ' + Math.round(s.y) + ')' : 'Alt-click to set the source') + '</div>';
		html += '<div class="ps_clsrc_grid">'
			+ '<label>Offset:</label>'
			+ '<span class="ps_cs_field">X: <input type="number" data-k="ox" value="' + (s.offset ? num(s.offset.x) : 0) + '"> px</span>'
			+ '<span class="ps_cs_field">W: <input type="number" data-k="w" value="' + num(s.w) + '"> %</span>'
			+ '<label></label>'
			+ '<span class="ps_cs_field">Y: <input type="number" data-k="oy" value="' + (s.offset ? num(s.offset.y) : 0) + '"> px</span>'
			+ '<span class="ps_cs_field">H: <input type="number" data-k="h" value="' + num(s.h) + '"> %</span>'
			+ '<label></label>'
			+ '<span class="ps_cs_field">&#8635; <input type="number" data-k="angle" value="' + num(s.angle) + '"> &deg;</span>'
			+ '<button type="button" class="ps_cs_reset" title="Reset transform">&#8634;</button>'
			+ '</div>';
		html += '<div class="ps_cs_row"><label class="disabled">Frame Offset: <input type="number" value="0" disabled></label> <label class="disabled"><input type="checkbox" disabled> Lock Frame</label></div>';
		html += '<div class="ps_cs_row"><label><input type="checkbox" data-o="show"' + (this.overlay.show ? ' checked' : '') + '> Show Overlay</label>'
			+ ' <span class="ps_cs_field">Opacity: <input type="number" min="0" max="100" data-o="opacity" value="' + this.overlay.opacity + '"> %</span></div>';
		html += '<div class="ps_cs_row"><label><input type="checkbox" data-o="clipped"' + (this.overlay.clipped ? ' checked' : '') + '> Clipped</label>'
			+ ' <label><input type="checkbox" data-o="auto_hide"' + (this.overlay.auto_hide ? ' checked' : '') + '> Auto Hide</label>'
			+ ' <label><input type="checkbox" data-o="invert"' + (this.overlay.invert ? ' checked' : '') + '> Invert</label></div>';
		el.innerHTML = html;
		el.querySelectorAll('.ps_cs_slot').forEach(b => b.addEventListener('click', () => {
			this.active = parseInt(b.dataset.slot);
			this.render();
		}));
		el.querySelectorAll('input[data-k]').forEach(inp => inp.addEventListener('change', () => {
			var v = parseFloat(inp.value) || 0, k = inp.dataset.k, sl = this.slot();
			if (k == 'ox' || k == 'oy') {
				sl.offset = sl.offset || { x: 0, y: 0 };
				sl.offset[k == 'ox' ? 'x' : 'y'] = v;
			}
			else if (k == 'angle') sl.angle = v;
			else sl[k] = v || 100;
			this.render();
			app.GUI.Ps_workspace.Selection.draw_overlay();
		}));
		el.querySelector('.ps_cs_reset').addEventListener('click', () => {
			Object.assign(this.slot(), { w: 100, h: 100, angle: 0 });
			this.render();
		});
		el.querySelectorAll('input[data-o]').forEach(inp => inp.addEventListener('change', () => {
			var k = inp.dataset.o;
			this.overlay[k] = inp.type == 'checkbox' ? inp.checked : Math.max(0, Math.min(100, parseFloat(inp.value) || 0));
			app.GUI.Ps_workspace.Selection.draw_overlay();
		}));
	}
}

export default Ps_clone_source_class;
