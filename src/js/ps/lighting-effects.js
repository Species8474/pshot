/*
 * pshot - CS6 Filter > Render > Lighting Effects: a workspace with the preview,
 * on-canvas light gizmos (drag the center to move; drag the ring handle to set
 * the radius / spot direction), the Properties (light type, color, intensity,
 * hotspot, colorize, exposure, gloss, metallic, ambience, texture, height) and
 * the Lights list. Lambert + Phong shading with an optional texture bump map.
 */

import app from './../app.js';
import config from './../config.js';
import { ensure_pixel_layer, alert_box } from './pixel-layer.js';

function hexrgb(c) {
	return [parseInt(c.substr(1, 2), 16) / 255, parseInt(c.substr(3, 2), 16) / 255, parseInt(c.substr(5, 2), 16) / 255];
}

function new_light(type, w, h) {
	var m = Math.min(w, h);
	return { type: type, on: true, x: w / 2, y: h / 2, color: '#ffffff', intensity: type == 'spot' ? 50 : 35, hotspot: 50,
		radius: m * 0.45, angle: -Math.PI / 4, length: m * 0.45 };
}

/**
 * shade RGBA src -> dst; lights in image coordinates scaled by k
 */
function shade(src, dst, w, h, s, k) {
	var lights = s.lights.filter(l => l.on);
	var amb = s.ambience / 100, exp = Math.pow(2, s.exposure / 50), gloss = (s.gloss + 100) / 200, metal = (s.metallic + 100) / 200;
	var colorize = hexrgb(s.colorize);
	//height map for the texture
	var height = null;
	if (s.texture != 'None') {
		height = new Float32Array(w * h);
		var ch = { Red: 0, Green: 1, Blue: 2, Transparency: 3 }[s.texture];
		for (var i = 0; i < w * h; i++) height[i] = (ch == null ? (src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114) : src[i * 4 + ch]) / 255;
	}
	var hscale = s.height / 100 * 4;
	var L = lights.map(l => ({ l: l, col: hexrgb(l.color), I: l.intensity / 50, x: l.x * k, y: l.y * k, r: l.radius * k, len: l.length * k, dir: [Math.cos(l.angle), Math.sin(l.angle)] }));
	var spec_pow = 2 + gloss * 60;
	for (var y = 0; y < h; y++) {
		for (var x = 0; x < w; x++) {
			var o = (y * w + x) * 4;
			var nx = 0, ny = 0, nz = 1;
			if (height) {
				var hx = height[y * w + Math.min(w - 1, x + 1)] - height[y * w + Math.max(0, x - 1)];
				var hy = height[Math.min(h - 1, y + 1) * w + x] - height[Math.max(0, y - 1) * w + x];
				nx = -hx * hscale; ny = -hy * hscale;
				var nl = Math.hypot(nx, ny, 1);
				nx /= nl; ny /= nl; nz = 1 / nl;
			}
			var r = amb * colorize[0], g = amb * colorize[1], b = amb * colorize[2], sr = 0, sg = 0, sb = 0;
			for (var li of L) {
				var lx, ly, lz, att;
				if (li.l.type == 'infinite') {
					lx = li.dir[0] * 0.7; ly = li.dir[1] * 0.7; lz = 0.7;
					att = 1;
				}
				else {
					var dx = li.x - x, dy = li.y - y, zh = Math.max(20, (li.l.type == 'spot' ? li.len : li.r) * 0.6);
					var d = Math.hypot(dx, dy, zh);
					lx = dx / d; ly = dy / d; lz = zh / d;
					if (li.l.type == 'point') {
						var dist = Math.hypot(dx, dy) / Math.max(1, li.r);
						att = Math.max(0, 1 - dist * dist);
					}
					else {
						//spot: ellipse along the direction, hotspot = full-strength core
						var ax = -dx, ay = -dy;
						var u = (ax * li.dir[0] + ay * li.dir[1]) / Math.max(1, li.len), v = (-ax * li.dir[1] + ay * li.dir[0]) / Math.max(1, li.len * 0.6);
						var e = Math.hypot(u, v), core = li.l.hotspot / 100;
						att = e >= 1 ? 0 : (e <= core ? 1 : 1 - (e - core) / (1 - core));
						att = att * att * (3 - 2 * att);
					}
				}
				var ndl = Math.max(0, nx * lx + ny * ly + nz * lz) * att * li.I;
				r += ndl * li.col[0]; g += ndl * li.col[1]; b += ndl * li.col[2];
				//Phong highlight (view straight on)
				var hz = lz + 1, hl = Math.hypot(lx, ly, hz), spec = Math.pow(Math.max(0, (nx * lx + ny * ly + nz * hz) / hl), spec_pow) * att * li.I * gloss;
				sr += spec * li.col[0]; sg += spec * li.col[1]; sb += spec * li.col[2];
			}
			var cr = src[o] / 255, cg = src[o + 1] / 255, cb = src[o + 2] / 255;
			//metallic highlights take the surface color
			var mr = sr * (1 - metal + metal * cr), mg = sg * (1 - metal + metal * cg), mb = sb * (1 - metal + metal * cb);
			dst[o] = Math.min(255, (cr * r * exp + mr) * 255);
			dst[o + 1] = Math.min(255, (cg * g * exp + mg) * 255);
			dst[o + 2] = Math.min(255, (cb * b * exp + mb) * 255);
			dst[o + 3] = src[o + 3];
		}
	}
}

class Ps_lighting_effects_class {

	open() {
		ensure_pixel_layer();
		var layer = config.layer;
		if (!layer || layer.type != 'image' || !layer.link) {
			alert_box('Could not complete the Lighting Effects command because the active layer is not a pixel layer.');
			return;
		}
		var W = layer.width_original, H = layer.height_original;
		var max_w = Math.min(900, window.innerWidth - 320), max_h = Math.min(640, window.innerHeight - 160);
		var k = Math.min(1, max_w / W, max_h / H);
		var pw = Math.max(1, Math.round(W * k)), ph = Math.max(1, Math.round(H * k));
		var small = document.createElement('canvas');
		small.width = pw;
		small.height = ph;
		var sctx = small.getContext('2d', { willReadFrequently: true });
		sctx.imageSmoothingQuality = 'high';
		sctx.drawImage(layer.link, 0, 0, pw, ph);
		this.state = {
			layer: layer, W: W, H: H, k: k, pw: pw, ph: ph, src: sctx.getImageData(0, 0, pw, ph).data,
			lights: [new_light('spot', W, H)], selected: 0,
			colorize: '#ffffff', exposure: 0, gloss: 0, metallic: 0, ambience: 0, texture: 'None', height: 50,
		};
		this.build();
		this.render_panel();
		this.render();
	}

	build() {
		var s = this.state;
		var el = document.createElement('div');
		el.className = 'popup ps_lighting';
		el.style.display = 'block';
		el.innerHTML = '<h2>Lighting Effects</h2>'
			+ '<div class="ps_bg_bar"><span>Presets:</span><select disabled><option>Default</option></select>'
			+ '<span>Lights:</span><button type="button" class="button" data-add="spot">Spot</button><button type="button" class="button" data-add="point">Point</button><button type="button" class="button" data-add="infinite">Infinite</button>'
			+ '<button type="button" class="button ps_le_reset">Reset</button><button type="button" class="button ps_le_cancel">Cancel</button><button type="button" class="button ps_le_ok">OK</button></div>'
			+ '<div class="ps_bg_body"><div class="ps_bg_view"><canvas width="' + s.pw + '" height="' + s.ph + '"></canvas></div>'
			+ '<div class="ps_bg_side"><div class="ps_bg_panel"><div class="ps_bg_panel_title">Properties</div><div class="ps_le_props"></div></div>'
			+ '<div class="ps_bg_panel"><div class="ps_bg_panel_title">Lights</div><div class="ps_le_lights"></div></div></div></div>';
		document.getElementById('popups').appendChild(el);
		this.el = el;
		this.canvas = el.querySelector('canvas');
		this.ctx = this.canvas.getContext('2d');
		el.querySelector('.ps_le_ok').addEventListener('click', () => this.apply());
		el.querySelector('.ps_le_cancel').addEventListener('click', () => this.close());
		el.querySelector('.ps_le_reset').addEventListener('click', () => { s.lights = [new_light('spot', s.W, s.H)]; s.selected = 0; this.render_panel(); this.render(); });
		el.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
			s.lights.push(new_light(b.dataset.add, s.W, s.H));
			s.selected = s.lights.length - 1;
			this.render_panel();
			this.render();
		}));
		var pos = (e) => {
			var r = this.canvas.getBoundingClientRect();
			return { x: (e.clientX - r.left) * s.pw / r.width / s.k, y: (e.clientY - r.top) * s.ph / r.height / s.k };
		};
		this.canvas.addEventListener('mousedown', (e) => {
			e.preventDefault();
			var p = pos(e), tol = 8 / s.k;
			for (var i = s.lights.length - 1; i >= 0; i--) {
				var l = s.lights[i], hnd = this.handle(l);
				if (hnd && Math.hypot(p.x - hnd.x, p.y - hnd.y) <= tol) { this.drag = { light: l, part: 'handle' }; s.selected = i; break; }
				if (Math.hypot(p.x - l.x, p.y - l.y) <= tol * 1.5) { this.drag = { light: l, part: 'move', dx: l.x - p.x, dy: l.y - p.y }; s.selected = i; break; }
			}
			this.render_panel();
			this.render(true);
		});
		this.move = (e) => {
			if (!this.drag) return;
			var p = pos(e), l = this.drag.light;
			if (this.drag.part == 'move') { l.x = p.x + this.drag.dx; l.y = p.y + this.drag.dy; }
			else {
				var dx = p.x - l.x, dy = p.y - l.y;
				if (l.type == 'point') l.radius = Math.max(4, Math.hypot(dx, dy));
				else { l.angle = Math.atan2(dy, dx); l.length = Math.max(4, Math.hypot(dx, dy)); }
			}
			this.render(true);
		};
		this.up = () => { if (this.drag) { this.drag = null; this.render(); } };
		window.addEventListener('mousemove', this.move);
		window.addEventListener('mouseup', this.up);
		this.keys = (e) => {
			if (e.target.tagName == 'INPUT' && e.key != 'Escape' && e.key != 'Enter') return;
			if (e.key == 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.close(); return; }
			if (e.key == 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); this.apply(); return; }
			if ((e.key == 'Delete' || e.key == 'Backspace') && s.lights.length > 1) {
				s.lights.splice(s.selected, 1);
				s.selected = Math.max(0, s.selected - 1);
				this.render_panel();
				this.render();
			}
			e.preventDefault();
			e.stopImmediatePropagation();
		};
		window.addEventListener('keydown', this.keys, true);
	}

	handle(l) {
		if (l.type == 'point') return { x: l.x + l.radius, y: l.y };
		return { x: l.x + Math.cos(l.angle) * l.length, y: l.y + Math.sin(l.angle) * l.length };
	}

	render_panel() {
		var s = this.state, l = s.lights[s.selected];
		var slider = (key, label, min, max, obj) => '<div class="ps_adj_slider"><span>' + label + '</span><input type="number" data-k="' + key + '" data-o="' + obj + '" min="' + min + '" max="' + max + '">'
			+ '<span class="ps_adj_unit"></span><input type="range" data-kr="' + key + '" data-o="' + obj + '" min="' + min + '" max="' + max + '"></div>';
		var box = this.el.querySelector('.ps_le_props');
		box.innerHTML = '<div class="ps_adj_row"><select data-type><option value="spot">Spot</option><option value="point">Point</option><option value="infinite">Infinite</option></select></div>'
			+ '<div class="ps_adj_row"><span>Color:</span><button type="button" class="ps_sfw_matte" data-color="light"></button><label class="ps_adj_check"><input type="checkbox" data-on> On</label></div>'
			+ slider('intensity', 'Intensity:', -100, 100, 'light') + (l.type == 'spot' ? slider('hotspot', 'Hotspot:', 0, 100, 'light') : '')
			+ '<div class="ps_adj_row"><span>Colorize:</span><button type="button" class="ps_sfw_matte" data-color="colorize"></button></div>'
			+ slider('exposure', 'Exposure:', -100, 100, 'all') + slider('gloss', 'Gloss:', -100, 100, 'all') + slider('metallic', 'Metallic:', -100, 100, 'all') + slider('ambience', 'Ambience:', -100, 100, 'all')
			+ '<div class="ps_adj_row"><span>Texture:</span><select data-texture>' + ['None', 'Red', 'Green', 'Blue', 'Transparency', 'Luminosity'].map(t => '<option>' + t + '</option>').join('') + '</select></div>'
			+ slider('height', 'Height:', 0, 100, 'all');
		box.querySelector('[data-type]').value = l.type;
		box.querySelector('[data-type]').addEventListener('change', (e) => { l.type = e.target.value; this.render_panel(); this.render(); });
		box.querySelector('[data-on]').checked = l.on;
		box.querySelector('[data-on]').addEventListener('change', (e) => { l.on = e.target.checked; this.render_lights(); this.render(); });
		box.querySelector('[data-texture]').value = s.texture;
		box.querySelector('[data-texture]').addEventListener('change', (e) => { s.texture = e.target.value; this.render(); });
		box.querySelectorAll('[data-color]').forEach((b) => {
			var target = b.dataset.color == 'light' ? l : s, key = b.dataset.color == 'light' ? 'color' : 'colorize';
			b.style.background = target[key];
			b.addEventListener('click', () => app.GUI.Ps_workspace.color_dialog(b.dataset.color == 'light' ? 'Light Color' : 'Colorize', target[key], (hex) => { target[key] = hex; b.style.background = hex; this.render(); }));
		});
		box.querySelectorAll('[data-k]').forEach((n) => {
			var key = n.dataset.k, obj = n.dataset.o == 'light' ? l : s, r = box.querySelector('[data-kr="' + key + '"]');
			n.value = r.value = obj[key];
			var set = (v) => { if (isNaN(v)) return; obj[key] = Math.max(parseFloat(n.min), Math.min(parseFloat(n.max), v)); n.value = r.value = obj[key]; this.render(); };
			n.addEventListener('change', () => set(parseFloat(n.value)));
			r.addEventListener('input', () => set(parseFloat(r.value)));
		});
		this.render_lights();
	}

	render_lights() {
		var s = this.state, box = this.el.querySelector('.ps_le_lights');
		var names = { spot: 'Spot Light', point: 'Point Light', infinite: 'Infinite Light' };
		box.innerHTML = s.lights.map((l, i) => '<div class="ps_fg_layer' + (i == s.selected ? ' active' : '') + '" data-li="' + i + '"><span class="ps_fg_eye" data-eye="' + i + '">' + (l.on ? '&#128065;' : '') + '</span>' + names[l.type] + ' ' + (i + 1) + '</div>').join('');
		box.querySelectorAll('[data-li]').forEach(r => r.addEventListener('click', (e) => {
			var i = parseInt(r.dataset.li);
			if (e.target.closest('[data-eye]')) { s.lights[i].on = !s.lights[i].on; this.render_lights(); this.render(); return; }
			s.selected = i;
			this.render_panel();
			this.render(true);
		}));
	}

	render(fast) {
		var s = this.state;
		if (!fast || !this.last) {
			var out = new ImageData(s.pw, s.ph);
			shade(s.src, out.data, s.pw, s.ph, s, s.k);
			this.last = out;
		}
		this.ctx.putImageData(this.last, 0, 0);
		this.draw_gizmos();
	}

	draw_gizmos() {
		var s = this.state, ctx = this.ctx, k = s.k;
		ctx.save();
		s.lights.forEach((l, i) => {
			var sel = i == s.selected;
			var stroke = (fn, dash) => {
				ctx.setLineDash(dash || []);
				ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3; ctx.beginPath(); fn(); ctx.stroke();
				ctx.strokeStyle = sel ? '#fff' : '#bbb'; ctx.lineWidth = 1; ctx.beginPath(); fn(); ctx.stroke();
				ctx.setLineDash([]);
			};
			if (l.type == 'point') stroke(() => ctx.arc(l.x * k, l.y * k, l.radius * k, 0, Math.PI * 2));
			else if (l.type == 'spot') stroke(() => ctx.ellipse(l.x * k + Math.cos(l.angle) * l.length * k * 0, l.y * k, l.length * k, l.length * 0.6 * k, l.angle, 0, Math.PI * 2));
			if (l.type != 'point') stroke(() => { ctx.moveTo(l.x * k, l.y * k); ctx.lineTo((l.x + Math.cos(l.angle) * l.length) * k, (l.y + Math.sin(l.angle) * l.length) * k); }, l.type == 'infinite' ? [4, 3] : null);
			var hnd = this.handle(l);
			ctx.fillStyle = '#fff';
			ctx.strokeStyle = 'rgba(0,0,0,0.7)';
			ctx.fillRect(hnd.x * k - 3.5, hnd.y * k - 3.5, 7, 7);
			ctx.strokeRect(hnd.x * k - 3.5, hnd.y * k - 3.5, 7, 7);
			ctx.beginPath();
			ctx.arc(l.x * k, l.y * k, sel ? 7 : 5, 0, Math.PI * 2);
			ctx.fillStyle = l.on ? '#ffd400' : '#777';
			ctx.fill();
			ctx.stroke();
		});
		ctx.restore();
	}

	apply() {
		var s = this.state, layer = s.layer;
		var c = document.createElement('canvas');
		c.width = s.W;
		c.height = s.H;
		var ctx = c.getContext('2d', { willReadFrequently: true });
		ctx.drawImage(layer.link, 0, 0);
		var data = ctx.getImageData(0, 0, s.W, s.H);
		var out = new ImageData(s.W, s.H);
		shade(data.data, out.data, s.W, s.H, s, 1);
		ctx.putImageData(out, 0, 0);
		this.close();
		var result = app.GUI.Ps_workspace.Selection.restrict(c, layer);
		app.State.do_action(new app.Actions.Bundle_action('lighting_effects', 'Lighting Effects', [
			new app.Actions.Update_layer_image_action(result, layer.id),
		]));
	}

	close() {
		window.removeEventListener('mousemove', this.move);
		window.removeEventListener('mouseup', this.up);
		window.removeEventListener('keydown', this.keys, true);
		if (this.el) this.el.remove();
		this.el = null;
		this.last = null;
		this.drag = null;
	}
}

export default Ps_lighting_effects_class;
