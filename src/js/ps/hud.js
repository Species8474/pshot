/*
 * pshot - CS6 on-canvas HUDs for the painting tools:
 * Alt+Shift+right-drag: the HUD Color Picker (Preferences > General > HUD
 * Color Picker: hue strip or hue wheel, small / medium / large) - drag in the
 * square for saturation / brightness, onto the strip or ring for the hue;
 * the foreground color is set on release.
 * Alt+right-drag: brush size (left / right) and hardness (up / down), shown
 * as a red tip preview.
 */

import app from './../app.js';
import config from './../config.js';

const SIZES = { Small: 110, Medium: 160, Large: 220 };

function hsv_rgb(h, s, v) {
	var f = (n) => { var k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
	return [f(5), f(3), f(1)].map(x => Math.round(x * 255));
}

function rgb_hsv(r, g, b) {
	r /= 255; g /= 255; b /= 255;
	var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
	if (d) h = mx == r ? ((g - b) / d) % 6 : (mx == g ? (b - r) / d + 2 : (r - g) / d + 4);
	return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
}

function hex(rgb) {
	return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
}

class Ps_hud_class {

	install() {
		var ws = () => app.GUI.Ps_workspace;
		document.addEventListener('mousedown', (e) => {
			if (e.button != 2 || !e.altKey) return;
			if (!e.target.closest || !e.target.closest('#main_wrapper')) return;
			if (!ws().Options_bar.brush_key()) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			if (e.shiftKey) this.color(e);
			else this.brush(e);
		}, true);
		//the right button's menu stays closed while a HUD is used
		document.addEventListener('contextmenu', (e) => {
			if (this.active || (e.altKey && e.target.closest && e.target.closest('#main_wrapper'))) {
				e.preventDefault();
				e.stopImmediatePropagation();
			}
		}, true);
	}

	// ---------- HUD Color Picker ----------

	color(e) {
		var prefs = app.GUI.Ps_workspace.Preferences ? app.GUI.Ps_workspace.Preferences.values : {};
		var kind = prefs.hud_picker || 'Hue Strip (Small)';
		var wheel = /Wheel/.test(kind), S = SIZES[(/\((\w+)\)/.exec(kind) || [])[1]] || 110;
		var fg = config.COLOR, rgb = [1, 3, 5].map(i => parseInt(fg.substr(i, 2), 16));
		var hsv = rgb_hsv(rgb[0], rgb[1], rgb[2]);
		var strip = Math.round(S * 0.16), gap = 6, ring = Math.round(S * 0.16);
		var W = wheel ? S + ring * 2 + 8 : S + gap + strip, H = wheel ? W : S;
		var c = document.createElement('canvas');
		c.width = W;
		c.height = H;
		c.className = 'ps_hud ps_hud_color';
		document.body.appendChild(c);
		var sq = wheel ? { x: (W - S * 0.7) / 2, y: (H - S * 0.7) / 2, s: S * 0.7 } : { x: 0, y: 0, s: S };
		//the pointer starts on the current color
		var left = e.clientX - (sq.x + hsv[1] * sq.s), top = e.clientY - (sq.y + (1 - hsv[2]) * sq.s);
		c.style.left = left + 'px';
		c.style.top = top + 'px';
		var g = c.getContext('2d');
		var draw = () => {
			g.clearRect(0, 0, W, H);
			//saturation (x) / brightness (y) for the hue
			var base = hsv_rgb(hsv[0], 1, 1);
			var gx = g.createLinearGradient(sq.x, 0, sq.x + sq.s, 0);
			gx.addColorStop(0, '#fff');
			gx.addColorStop(1, hex(base));
			g.fillStyle = gx;
			g.fillRect(sq.x, sq.y, sq.s, sq.s);
			var gy = g.createLinearGradient(0, sq.y, 0, sq.y + sq.s);
			gy.addColorStop(0, 'rgba(0,0,0,0)');
			gy.addColorStop(1, '#000');
			g.fillStyle = gy;
			g.fillRect(sq.x, sq.y, sq.s, sq.s);
			g.strokeStyle = '#000';
			g.strokeRect(sq.x + 0.5, sq.y + 0.5, sq.s - 1, sq.s - 1);
			if (wheel) {
				var cx = W / 2, cy = H / 2, ro = W / 2 - 1, ri = ro - ring;
				for (var a = 0; a < 360; a += 2) {
					g.beginPath();
					g.strokeStyle = hex(hsv_rgb(a, 1, 1));
					g.lineWidth = ring;
					g.arc(cx, cy, (ro + ri) / 2, (a - 91) * Math.PI / 180, (a - 88) * Math.PI / 180);
					g.stroke();
				}
				var ha = (hsv[0] - 90) * Math.PI / 180;
				g.lineWidth = 2;
				g.strokeStyle = '#fff';
				g.beginPath();
				g.arc(cx + Math.cos(ha) * (ro + ri) / 2, cy + Math.sin(ha) * (ro + ri) / 2, ring / 2, 0, Math.PI * 2);
				g.stroke();
			}
			else {
				var sx = S + gap;
				for (var y = 0; y < S; y++) {
					g.fillStyle = hex(hsv_rgb(360 * (1 - y / S), 1, 1));
					g.fillRect(sx, y, strip, 1);
				}
				var hy = (1 - hsv[0] / 360) * S;
				g.strokeStyle = '#fff';
				g.lineWidth = 2;
				g.strokeRect(sx - 1, hy - 2, strip + 2, 4);
			}
			//the color ring marker
			var mx = sq.x + hsv[1] * sq.s, my = sq.y + (1 - hsv[2]) * sq.s;
			g.lineWidth = 1.5;
			g.strokeStyle = hsv[2] > 0.5 ? '#000' : '#fff';
			g.beginPath();
			g.arc(mx, my, 5, 0, Math.PI * 2);
			g.stroke();
		};
		//where the pointer went: the square or the hue control
		var zone = null;
		var pick = (ev) => {
			var x = ev.clientX - left, y = ev.clientY - top;
			if (!zone) {
				var on_hue = wheel ? Math.hypot(x - W / 2, y - H / 2) > W / 2 - ring - 4 : x > S;
				zone = on_hue ? 'hue' : 'sv';
			}
			if (zone == 'hue') {
				hsv[0] = wheel ? ((Math.atan2(y - H / 2, x - W / 2) * 180 / Math.PI + 90) + 360) % 360 : Math.max(0, Math.min(359.9, 360 * (1 - y / S)));
			}
			else {
				hsv[1] = Math.max(0, Math.min(1, (x - sq.x) / sq.s));
				hsv[2] = Math.max(0, Math.min(1, 1 - (y - sq.y) / sq.s));
			}
			draw();
		};
		var leave = (ev) => {
			//leaving the square onto the hue control switches to it
			var x = ev.clientX - left;
			if (zone == 'sv' && !wheel && x > S + gap / 2) zone = 'hue';
			else if (zone == 'hue' && !wheel && x < S) zone = 'sv';
		};
		var up = () => {
			document.removeEventListener('mousemove', on_move, true);
			document.removeEventListener('mouseup', up, true);
			c.remove();
			this.active = false;
			app.GUI.Ps_workspace.set_fg(hex(hsv_rgb(hsv[0], hsv[1], hsv[2])));
		};
		var on_move = (ev) => { leave(ev); pick(ev); };
		this.active = true;
		document.addEventListener('mousemove', on_move, true);
		document.addEventListener('mouseup', up, true);
		draw();
	}

	// ---------- brush size / hardness ----------

	brush(e) {
		var attrs = config.TOOL.attributes;
		var get = (k) => (attrs[k] !== null && typeof attrs[k] == 'object' ? attrs[k].value : attrs[k]);
		var set = (k, v) => { if (attrs[k] !== null && typeof attrs[k] == 'object') attrs[k].value = v; else attrs[k] = v; };
		var size0 = get('size') || 20, hard0 = get('hardness');
		var has_hardness = hard0 != null;
		var c = document.createElement('canvas');
		c.className = 'ps_hud';
		document.body.appendChild(c);
		var draw = () => {
			var d = Math.max(4, get('size') * config.ZOOM), h = has_hardness ? get('hardness') / 100 : 1;
			var W = Math.ceil(d) + 4;
			c.width = c.height = W;
			c.style.left = (e.clientX - W / 2) + 'px';
			c.style.top = (e.clientY - W / 2) + 'px';
			var g = c.getContext('2d'), r = d / 2;
			var grad = g.createRadialGradient(W / 2, W / 2, r * h * 0.999, W / 2, W / 2, r);
			grad.addColorStop(0, 'rgba(255,0,0,0.55)');
			grad.addColorStop(1, 'rgba(255,0,0,0)');
			g.fillStyle = grad;
			g.beginPath();
			g.arc(W / 2, W / 2, r, 0, Math.PI * 2);
			g.fill();
			g.strokeStyle = 'rgba(0,0,0,0.6)';
			g.stroke();
		};
		var move = (ev) => {
			var dx = ev.clientX - e.clientX, dy = ev.clientY - e.clientY;
			set('size', Math.max(1, Math.min(5000, Math.round(size0 + dx * 2 / Math.max(0.1, config.ZOOM)))));
			if (has_hardness) set('hardness', Math.max(0, Math.min(100, Math.round(hard0 - dy / 2))));
			draw();
			app.GUI.Ps_workspace.status_message('Size: ' + get('size') + ' px' + (has_hardness ? '   Hardness: ' + get('hardness') + '%' : ''));
		};
		var up = () => {
			document.removeEventListener('mousemove', move, true);
			document.removeEventListener('mouseup', up, true);
			c.remove();
			this.active = false;
			app.GUI.Ps_workspace.Options_bar.render();
		};
		this.active = true;
		document.addEventListener('mousemove', move, true);
		document.addEventListener('mouseup', up, true);
		draw();
	}
}

export default Ps_hud_class;
