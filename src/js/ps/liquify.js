/*
 * pshot - CS6 Filter > Liquify (Shift+Ctrl+X).
 *
 * A displacement field (where each output pixel samples the layer from) is
 * edited at preview resolution with the Forward Warp, Reconstruct, Pucker,
 * Bloat and Push Left tools, then upsampled and applied to the full-resolution
 * layer on OK as one History step.
 */

import app from './../app.js';
import config from './../config.js';
import { ensure_pixel_layer, alert_box } from './pixel-layer.js';

const TOOLS = [
	['warp', 'Forward Warp Tool (W)', 'W', '<path d="M3 15c2-6 6-10 12-12" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M11 3h4v4" fill="none" stroke="currentColor" stroke-width="1.4"/>'],
	['reconstruct', 'Reconstruct Tool (R)', 'R', '<path d="M4 9a5 5 0 1 0 2-4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3 2v4h4" fill="none" stroke="currentColor" stroke-width="1.4"/>'],
	['pucker', 'Pucker Tool (S)', 'S', '<circle cx="9" cy="9" r="6.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M9 4v3M9 11v3M4 9h3M11 9h3" stroke="currentColor" stroke-width="1.4"/>'],
	['bloat', 'Bloat Tool (B)', 'B', '<circle cx="9" cy="9" r="6.5" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="9" cy="9" r="3" fill="currentColor"/>'],
	['push', 'Push Left Tool (O)', 'O', '<path d="M3 9h11M7 5L3 9l4 4" fill="none" stroke="currentColor" stroke-width="1.4"/>'],
];

class Ps_liquify_class {

	open() {
		ensure_pixel_layer();
		var layer = config.layer;
		if (!layer || layer.type != 'image' || !layer.link) {
			alert_box('Could not complete the Liquify command because the active layer is not a pixel layer.');
			return;
		}
		var W = layer.width_original, H = layer.height_original;
		var max_w = Math.min(900, window.innerWidth - 360), max_h = Math.min(640, window.innerHeight - 140);
		var scale = Math.min(1, max_w / W, max_h / H);
		var pw = Math.max(1, Math.round(W * scale)), ph = Math.max(1, Math.round(H * scale));
		var src_canvas = document.createElement('canvas');
		src_canvas.width = pw;
		src_canvas.height = ph;
		var sctx = src_canvas.getContext('2d', { willReadFrequently: true });
		sctx.imageSmoothingQuality = 'high';
		sctx.drawImage(layer.link, 0, 0, pw, ph);
		this.state = {
			layer: layer, W: W, H: H, pw: pw, ph: ph, scale: scale,
			src: sctx.getImageData(0, 0, pw, ph).data,
			dx: new Float32Array(pw * ph), dy: new Float32Array(pw * ph),
			tool: 'warp', size: 100, density: 50, pressure: 100, backdrop: false,
		};
		this.build_ui();
		this.render();
	}

	build_ui() {
		var s = this.state;
		var host = document.getElementById('popups');
		var el = document.createElement('div');
		el.className = 'popup ps_liquify';
		el.style.display = 'block';
		el.innerHTML = '<h2>Liquify</h2>'
			+ '<div class="ps_lq_body">'
			+ '<div class="ps_lq_tools">' + TOOLS.map(([k, title, , icon]) => '<button type="button" data-tool="' + k + '" title="' + title + '"' + (k == s.tool ? ' class="pressed"' : '') + '><svg viewBox="0 0 18 18" width="18" height="18">' + icon + '</svg></button>').join('') + '</div>'
			+ '<div class="ps_lq_view"><canvas width="' + s.pw + '" height="' + s.ph + '"></canvas></div>'
			+ '<div class="ps_lq_side">'
			+ '<button type="button" class="button ps_lq_ok">OK</button><button type="button" class="button ps_lq_cancel">Cancel</button>'
			+ '<fieldset><legend>Tool Options</legend>'
			+ this.field('size', 'Brush Size:', 1, 1500) + this.field('density', 'Brush Density:', 0, 100) + this.field('pressure', 'Brush Pressure:', 1, 100)
			+ '</fieldset>'
			+ '<fieldset><legend>Reconstruct Options</legend><button type="button" class="button ps_lq_restore">Restore All</button></fieldset>'
			+ '<fieldset><legend>View Options</legend><label class="ps_adj_check"><input type="checkbox" class="ps_lq_backdrop"> Show Backdrop</label></fieldset>'
			+ '</div></div>';
		host.appendChild(el);
		this.el = el;
		this.canvas = el.querySelector('canvas');
		this.ctx = this.canvas.getContext('2d');
		el.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => this.set_tool(b.dataset.tool)));
		el.querySelectorAll('[data-field]').forEach((input) => {
			input.value = s[input.dataset.field];
			input.addEventListener('change', () => {
				var v = parseFloat(input.value);
				if (!isNaN(v)) s[input.dataset.field] = Math.max(parseFloat(input.min), Math.min(parseFloat(input.max), v));
				input.value = s[input.dataset.field];
			});
		});
		el.querySelector('.ps_lq_ok').addEventListener('click', () => this.apply());
		el.querySelector('.ps_lq_cancel').addEventListener('click', () => this.close());
		el.querySelector('.ps_lq_restore').addEventListener('click', () => { s.dx.fill(0); s.dy.fill(0); this.render(); });
		el.querySelector('.ps_lq_backdrop').addEventListener('change', (e) => { s.backdrop = e.target.checked; this.render(); });

		var drag = null;
		var pos = (e) => {
			var r = this.canvas.getBoundingClientRect();
			return { x: (e.clientX - r.left) * s.pw / r.width, y: (e.clientY - r.top) * s.ph / r.height };
		};
		this.canvas.addEventListener('mousedown', (e) => {
			if (e.button != 0) return;
			e.preventDefault();
			drag = pos(e);
			this.brush(drag, drag, e.altKey);
			this.timer = setInterval(() => { if (drag && s.tool != 'warp' && s.tool != 'push') { this.brush(drag, drag, false); this.render(); } }, 40);
			this.render();
		});
		this.move = (e) => {
			var p = pos(e);
			this.cursor = p;
			if (drag) {
				this.brush(drag, p, e.altKey);
				drag = p;
			}
			this.render();
		};
		this.up = () => { drag = null; clearInterval(this.timer); };
		window.addEventListener('mousemove', this.move);
		window.addEventListener('mouseup', this.up);
		this.keys = (e) => {
			if (e.key == 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.close(); return; }
			if (e.key == 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); this.apply(); return; }
			if (e.key == '[' || e.key == ']') {
				s.size = Math.max(1, Math.min(1500, s.size + (e.key == ']' ? 1 : -1) * (s.size < 50 ? 5 : 25)));
				el.querySelector('[data-field="size"]').value = s.size;
				this.render();
				e.preventDefault(); e.stopImmediatePropagation();
				return;
			}
			var t = TOOLS.find(x => x[2] == e.key.toUpperCase());
			if (t && !e.ctrlKey && !e.metaKey && e.target.tagName != 'INPUT') { this.set_tool(t[0]); e.preventDefault(); e.stopImmediatePropagation(); }
		};
		window.addEventListener('keydown', this.keys, true);
	}

	field(key, label, min, max) {
		return '<div class="ps_lq_field"><span>' + label + '</span><input type="number" data-field="' + key + '" min="' + min + '" max="' + max + '"></div>';
	}

	set_tool(tool) {
		this.state.tool = tool;
		this.el.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('pressed', b.dataset.tool == tool));
	}

	/**
	 * one brush application from a to b (preview pixels)
	 */
	brush(a, b, alt) {
		var s = this.state;
		var r = s.size / 2 * s.scale;
		if (r < 1) r = 1;
		var pressure = s.pressure / 100;
		var density = s.density / 100;
		var mx = b.x - a.x, my = b.y - a.y;
		var x0 = Math.max(0, Math.floor(b.x - r)), x1 = Math.min(s.pw - 1, Math.ceil(b.x + r));
		var y0 = Math.max(0, Math.floor(b.y - r)), y1 = Math.min(s.ph - 1, Math.ceil(b.y + r));
		var tool = s.tool;
		if (alt && tool == 'pucker') tool = 'bloat';
		else if (alt && tool == 'bloat') tool = 'pucker';
		for (var y = y0; y <= y1; y++) {
			for (var x = x0; x <= x1; x++) {
				var ddx = x - b.x, ddy = y - b.y, d = Math.hypot(ddx, ddy) / r;
				if (d >= 1) continue;
				//falloff: Density softens the edge
				var hard = 1 - density;
				var f = d <= hard ? 1 : Math.max(0, 1 - (d - hard) / Math.max(0.0001, 1 - hard));
				f = f * f * (3 - 2 * f) * pressure;
				var k = y * s.pw + x;
				if (tool == 'warp') {
					s.dx[k] -= mx * f;
					s.dy[k] -= my * f;
				}
				else if (tool == 'push') {
					//pushes pixels to the left of the drag direction (Alt: right)
					var sign = alt ? -1 : 1;
					s.dx[k] -= my * f * sign;
					s.dy[k] += mx * f * sign;
				}
				else if (tool == 'reconstruct') {
					s.dx[k] *= 1 - f * 0.15;
					s.dy[k] *= 1 - f * 0.15;
				}
				else if (tool == 'pucker') {
					s.dx[k] += ddx * f * 0.03;
					s.dy[k] += ddy * f * 0.03;
				}
				else if (tool == 'bloat') {
					s.dx[k] -= ddx * f * 0.03;
					s.dy[k] -= ddy * f * 0.03;
				}
			}
		}
	}

	render() {
		var s = this.state;
		var out = this.ctx.createImageData(s.pw, s.ph);
		this.warp(s.src, out.data, s.pw, s.ph, s.dx, s.dy, 1);
		var tmp = document.createElement('canvas');
		tmp.width = s.pw;
		tmp.height = s.ph;
		tmp.getContext('2d').putImageData(out, 0, 0);
		var ctx = this.ctx;
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, s.pw, s.ph);
		if (s.backdrop) {
			//the other visible layers, as in CS6 "Show Backdrop"
			var back = document.createElement('canvas');
			back.width = config.WIDTH;
			back.height = config.HEIGHT;
			var visible = s.layer.visible;
			s.layer.visible = false;
			app.Layers.convert_layers_to_canvas(back.getContext('2d'), null, false);
			s.layer.visible = visible;
			ctx.globalAlpha = 0.5;
			ctx.drawImage(back, -s.layer.x * s.scale * s.W / s.layer.width, -s.layer.y * s.scale * s.H / s.layer.height, config.WIDTH * s.scale * s.W / s.layer.width, config.HEIGHT * s.scale * s.H / s.layer.height);
			ctx.globalAlpha = 1;
		}
		ctx.drawImage(tmp, 0, 0);
		if (this.cursor) {
			ctx.strokeStyle = 'rgba(0,0,0,0.7)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.arc(this.cursor.x, this.cursor.y, s.size / 2 * s.scale, 0, Math.PI * 2);
			ctx.stroke();
		}
	}

	/**
	 * out(x) = src(x + d(x)) with bilinear sampling; d is given at (w/scale_d) resolution
	 */
	warp(src, out, w, h, dx, dy, k, dw, dh) {
		dw = dw || w;
		dh = dh || h;
		var fx = dw / w, fy = dh / h;
		for (var y = 0; y < h; y++) {
			for (var x = 0; x < w; x++) {
				var ox = 0, oy = 0;
				if (fx == 1 && fy == 1) {
					var kk = y * w + x;
					ox = dx[kk]; oy = dy[kk];
				}
				else {
					//bilinear upsample of the displacement field
					var gx = Math.min(dw - 1.001, Math.max(0, x * fx)), gy = Math.min(dh - 1.001, Math.max(0, y * fy));
					var ix = gx | 0, iy = gy | 0, tx = gx - ix, ty = gy - iy;
					var i00 = iy * dw + ix, i10 = i00 + 1, i01 = i00 + dw, i11 = i01 + 1;
					ox = ((dx[i00] * (1 - tx) + dx[i10] * tx) * (1 - ty) + (dx[i01] * (1 - tx) + dx[i11] * tx) * ty) * k;
					oy = ((dy[i00] * (1 - tx) + dy[i10] * tx) * (1 - ty) + (dy[i01] * (1 - tx) + dy[i11] * tx) * ty) * k;
				}
				var sx = Math.max(0, Math.min(w - 1.001, x + ox)), sy = Math.max(0, Math.min(h - 1.001, y + oy));
				var x0 = sx | 0, y0 = sy | 0, ax = sx - x0, ay = sy - y0;
				var a = (y0 * w + x0) * 4, b = a + 4, c = a + w * 4, d = c + 4, o = (y * w + x) * 4;
				for (var ch = 0; ch < 4; ch++) {
					out[o + ch] = (src[a + ch] * (1 - ax) + src[b + ch] * ax) * (1 - ay) + (src[c + ch] * (1 - ax) + src[d + ch] * ax) * ay;
				}
			}
		}
	}

	apply() {
		var s = this.state;
		var full = document.createElement('canvas');
		full.width = s.W;
		full.height = s.H;
		var fctx = full.getContext('2d', { willReadFrequently: true });
		fctx.drawImage(s.layer.link, 0, 0);
		var src = fctx.getImageData(0, 0, s.W, s.H);
		var out = fctx.createImageData(s.W, s.H);
		this.warp(src.data, out.data, s.W, s.H, s.dx, s.dy, 1 / s.scale, s.pw, s.ph);
		fctx.putImageData(out, 0, 0);
		var layer = s.layer;
		this.close();
		var result = app.GUI.Ps_workspace.Selection.restrict(full, layer);
		app.State.do_action(new app.Actions.Bundle_action('liquify', 'Liquify', [
			new app.Actions.Update_layer_image_action(result, layer.id),
		]));
	}

	close() {
		window.removeEventListener('mousemove', this.move);
		window.removeEventListener('mouseup', this.up);
		window.removeEventListener('keydown', this.keys, true);
		clearInterval(this.timer);
		if (this.el) this.el.remove();
		this.el = null;
		this.state = null;
	}
}

export default Ps_liquify_class;
