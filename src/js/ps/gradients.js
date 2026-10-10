/*
 * pshot - CS6 gradients: { name, stops: [{ pos, color: '#rrggbb' | 'fg' | 'bg' }],
 * alphas: [{ pos, a }] } with the CS6 default preset set, user presets, a
 * 256-entry lookup for rendering, the Gradient Editor and the preset picker.
 */

import app from './../app.js';
import config from './../config.js';
import { show_popup_menu } from './popup-menu.js';

const S = (pos, color) => ({ pos: pos, color: color });
const A = (pos, a) => ({ pos: pos, a: a });
const OPAQUE = [A(0, 1), A(1, 1)];

const PRESETS = [
	{ name: 'Foreground to Background', stops: [S(0, 'fg'), S(1, 'bg')], alphas: OPAQUE },
	{ name: 'Foreground to Transparent', stops: [S(0, 'fg'), S(1, 'fg')], alphas: [A(0, 1), A(1, 0)] },
	{ name: 'Black, White', stops: [S(0, '#000000'), S(1, '#ffffff')], alphas: OPAQUE },
	{ name: 'Red, Green', stops: [S(0, '#ff0000'), S(1, '#00a000')], alphas: OPAQUE },
	{ name: 'Violet, Orange', stops: [S(0, '#290a59'), S(1, '#ff7c00')], alphas: OPAQUE },
	{ name: 'Blue, Red, Yellow', stops: [S(0, '#0a00b2'), S(0.5, '#ff0000'), S(1, '#fffc00')], alphas: OPAQUE },
	{ name: 'Blue, Yellow, Blue', stops: [S(0, '#0a00b2'), S(0.5, '#fffc00'), S(1, '#0a00b2')], alphas: OPAQUE },
	{ name: 'Orange, Yellow, Orange', stops: [S(0, '#ff6d00'), S(0.5, '#ffff00'), S(1, '#ff6d00')], alphas: OPAQUE },
	{ name: 'Violet, Green, Orange', stops: [S(0, '#6f15a2'), S(0.5, '#00a651'), S(1, '#f7941d')], alphas: OPAQUE },
	{ name: 'Yellow, Violet, Orange, Blue', stops: [S(0, '#f9ed32'), S(0.33, '#92278f'), S(0.66, '#f7941d'), S(1, '#0054a6')], alphas: OPAQUE },
	{ name: 'Copper', stops: [S(0, '#97461a'), S(0.3, '#fbd8c5'), S(0.83, '#6c2e16'), S(1, '#efdbcd')], alphas: OPAQUE },
	{ name: 'Chrome', stops: [S(0, '#29abe2'), S(0.5, '#ffffff'), S(0.52, '#232323'), S(0.6, '#5a5a5a'), S(1, '#ffffff')], alphas: OPAQUE },
	{ name: 'Spectrum', stops: [S(0, '#ff0000'), S(0.17, '#ff00ff'), S(0.33, '#0000ff'), S(0.5, '#00ffff'), S(0.67, '#00ff00'), S(0.83, '#ffff00'), S(1, '#ff0000')], alphas: OPAQUE },
	{ name: 'Transparent Rainbow', stops: [S(0, '#ff0000'), S(0.2, '#ffff00'), S(0.4, '#00ff00'), S(0.6, '#00ffff'), S(0.8, '#0000ff'), S(1, '#ff00ff')], alphas: [A(0, 0), A(0.1, 1), A(0.9, 1), A(1, 0)] },
	{ name: 'Transparent Stripes', stops: [S(0, 'fg'), S(1, 'fg')], alphas: [A(0, 1), A(0.1, 1), A(0.1, 0), A(0.2, 0), A(0.2, 1), A(0.3, 1), A(0.3, 0), A(0.4, 0), A(0.4, 1), A(0.5, 1), A(0.5, 0), A(0.6, 0), A(0.6, 1), A(0.7, 1), A(0.7, 0), A(0.8, 0), A(0.8, 1), A(0.9, 1), A(0.9, 0), A(1, 0)] },
];

var USER = [];
try { USER = JSON.parse(localStorage.getItem('pshot_gradients_v1') || '[]'); } catch (e) { USER = []; }

function save_user() {
	try { localStorage.setItem('pshot_gradients_v1', JSON.stringify(USER)); } catch (e) { /* storage blocked */ }
}

function clone(g) {
	return JSON.parse(JSON.stringify(g));
}

function hex_rgb(hex) {
	return [parseInt(hex.substr(1, 2), 16), parseInt(hex.substr(3, 2), 16), parseInt(hex.substr(5, 2), 16)];
}

function color_of(c) {
	if (c == 'fg') return config.COLOR;
	if (c == 'bg') return config.BG_COLOR;
	return c;
}

/**
 * the gradient with its Foreground / Background stops fixed to the current colors
 */
function resolve(g) {
	var r = clone(g);
	r.stops.forEach(s => { s.color = color_of(s.color); });
	return r;
}

/**
 * a two-color gradient (older two-color states)
 */
function two_color(c1, c2) {
	return { name: 'Custom', stops: [S(0, c1 || '#000000'), S(1, c2 || '#ffffff')], alphas: OPAQUE.slice() };
}

function presets() {
	return PRESETS.concat(USER);
}

/**
 * 256 RGBA entries along the gradient
 */
function lut(g, reverse) {
	var out = new Uint8ClampedArray(256 * 4);
	var stops = g.stops.slice().sort((a, b) => a.pos - b.pos).map(s => ({ pos: s.pos, rgb: hex_rgb(color_of(s.color)) }));
	var alphas = (g.alphas && g.alphas.length ? g.alphas : OPAQUE).slice().sort((a, b) => a.pos - b.pos);
	var at = (list, t, get) => {
		if (t <= list[0].pos) return get(list[0], 0);
		for (var i = 1; i < list.length; i++) {
			if (t <= list[i].pos) {
				var a = list[i - 1], b = list[i], k = b.pos > a.pos ? (t - a.pos) / (b.pos - a.pos) : 1;
				return get(a, 0) + (get(b, 0) - get(a, 0)) * k;
			}
		}
		return get(list[list.length - 1], 0);
	};
	for (var i = 0; i < 256; i++) {
		var t = reverse ? 1 - i / 255 : i / 255;
		for (var c = 0; c < 3; c++) out[i * 4 + c] = at(stops, t, (s) => s.rgb[c]);
		out[i * 4 + 3] = at(alphas, t, (s) => s.a) * 255;
	}
	return out;
}

/**
 * the gradient drawn into a w x h canvas: type linear / radial / angle /
 * reflected / diamond from (x1, y1) to (x2, y2) in that canvas' pixels
 */
function render(w, h, g, type, x1, y1, x2, y2, opts) {
	opts = opts || {};
	var canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	var L = lut(g, !!opts.reverse);
	var dx = x2 - x1, dy = y2 - y1;
	var len2 = dx * dx + dy * dy || 1, len = Math.sqrt(len2);
	var ux = dx / len, uy = dy / len;
	var a0 = Math.atan2(dy, dx);
	var transparency = opts.transparency !== false, dither = !!opts.dither;
	var ctx = canvas.getContext('2d');
	var img = ctx.createImageData(w, h), d = img.data;
	for (var y = 0; y < h; y++) {
		var py = y + 0.5 - y1;
		for (var x = 0; x < w; x++) {
			var px = x + 0.5 - x1, t;
			if (type == 'radial') t = Math.sqrt(px * px + py * py) / len;
			else if (type == 'angle') {
				t = (a0 - Math.atan2(py, px)) / (Math.PI * 2);
				t -= Math.floor(t);
			}
			else if (type == 'diamond') t = (Math.abs(px * ux + py * uy) + Math.abs(-px * uy + py * ux)) / len;
			else {
				t = (px * dx + py * dy) / len2;
				if (type == 'reflected') t = Math.abs(t);
			}
			t = t < 0 ? 0 : (t > 1 ? 1 : t);
			var idx = t * 255;
			if (dither) idx += Math.random() - 0.5;
			idx = idx < 0 ? 0 : (idx > 255 ? 255 : Math.round(idx));
			var o = (y * w + x) * 4, li = idx * 4;
			d[o] = L[li];
			d[o + 1] = L[li + 1];
			d[o + 2] = L[li + 2];
			d[o + 3] = transparency ? L[li + 3] : 255;
		}
	}
	ctx.putImageData(img, 0, 0);
	return canvas;
}

/**
 * a gradient centered on a box (Gradient Fill layers, Gradient Overlay): style
 * Linear / Radial / Angle / Reflected / Diamond, angle in degrees (counter-
 * clockwise), scale in percent of the box
 */
function render_centered(w, h, g, style, angle, scale, box, opts) {
	var a = (angle == null ? 90 : angle) * Math.PI / 180, s = (scale || 100) / 100;
	var cx = box.x + box.w / 2, cy = box.y + box.h / 2, dx = Math.cos(a), dy = -Math.sin(a);
	var len = Math.max(1, (Math.abs(dx) * box.w + Math.abs(dy) * box.h) / 2 * s);
	var type = (style || 'Linear').toLowerCase();
	var x1 = cx - dx * len, y1 = cy - dy * len, x2 = cx + dx * len, y2 = cy + dy * len;
	if (type != 'linear') { x1 = cx; y1 = cy; }
	return render(w, h, g, type, x1, y1, x2, y2, opts);
}

/**
 * CSS preview (over a checkerboard where there is transparency)
 */
function css(g) {
	var L = lut(g, false), parts = [];
	for (var i = 0; i <= 16; i++) {
		var k = Math.round(i / 16 * 255) * 4;
		parts.push('rgba(' + L[k] + ',' + L[k + 1] + ',' + L[k + 2] + ',' + (L[k + 3] / 255).toFixed(3) + ') ' + (i / 16 * 100).toFixed(1) + '%');
	}
	return 'linear-gradient(90deg,' + parts.join(',') + '), repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0 0 / 8px 8px';
}

/**
 * the preset picker under a gradient swatch
 */
function picker(anchor, on_select, on_edit) {
	var existing = document.querySelector('.ps_grad_picker');
	if (existing) { existing.remove(); return; }
	var pop = document.createElement('div');
	pop.className = 'ps_grad_picker';
	var grid = document.createElement('div');
	grid.className = 'ps_grad_grid';
	presets().forEach((g, i) => {
		var cell = document.createElement('div');
		cell.className = 'ps_grad_cell';
		cell.title = g.name;
		cell.style.background = css(g);
		cell.addEventListener('click', () => { close(); on_select(clone(g)); });
		if (i >= PRESETS.length) {
			cell.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				show_popup_menu(cell, [{ name: 'Delete Gradient', action: () => { USER.splice(i - PRESETS.length, 1); save_user(); close(); } }]);
			});
		}
		grid.appendChild(cell);
	});
	pop.appendChild(grid);
	if (on_edit) {
		var edit = document.createElement('button');
		edit.type = 'button';
		edit.textContent = 'Gradient Editor...';
		edit.addEventListener('click', () => { close(); on_edit(); });
		pop.appendChild(edit);
	}
	document.body.appendChild(pop);
	var r = anchor.getBoundingClientRect();
	pop.style.left = r.left + 'px';
	pop.style.top = (r.bottom + 2) + 'px';
	var close = () => {
		pop.remove();
		document.removeEventListener('mousedown', outside, true);
	};
	var outside = (e) => {
		if (!pop.contains(e.target) && !anchor.contains(e.target) && !e.target.closest('.ps_popup_menu')) close();
	};
	setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
}

/**
 * Gradient Editor (CS6): presets, name, the bar with opacity stops above and
 * color stops below, the selected stop's color / opacity and location
 */
function editor(initial, on_ok, on_preview) {
	var g = clone(initial);
	var sel = { kind: 'color', index: 0 };
	var root = document.createElement('div');
	root.className = 'ps_grad_editor_wrap';
	root.innerHTML = '<div class="ps_grad_editor">'
		+ '<div class="ps_ge_title">Gradient Editor</div>'
		+ '<div class="ps_ge_top"><div class="ps_ge_presets"></div><div class="ps_ge_buttons"><button type="button" data-a="ok">OK</button><button type="button" data-a="cancel">Cancel</button><button type="button" data-a="new">New</button></div></div>'
		+ '<div class="ps_ge_row"><label>Name:</label><input type="text" class="ps_ge_name"></div>'
		+ '<div class="ps_ge_row"><label>Gradient Type:</label><select disabled><option>Solid</option></select><label>Smoothness:</label><input type="number" value="100" disabled> %</div>'
		+ '<div class="ps_ge_barwrap"><div class="ps_ge_alpha_track"></div><div class="ps_ge_bar"></div><div class="ps_ge_color_track"></div></div>'
		+ '<fieldset class="ps_ge_stops"><legend>Stops</legend>'
		+ '<div class="ps_ge_row"><label>Opacity:</label><input type="number" class="ps_ge_opacity" min="0" max="100"> %<label>Location:</label><input type="number" class="ps_ge_aloc" min="0" max="100"> %<button type="button" data-a="adel">Delete</button></div>'
		+ '<div class="ps_ge_row"><label>Color:</label><span class="ps_ge_swatch"></span><label>Location:</label><input type="number" class="ps_ge_cloc" min="0" max="100"> %<button type="button" data-a="cdel">Delete</button></div>'
		+ '</fieldset></div>';
	document.body.appendChild(root);
	var $ = (s) => root.querySelector(s);
	var bar = $('.ps_ge_bar'), atrack = $('.ps_ge_alpha_track'), ctrack = $('.ps_ge_color_track');
	var changed = () => { if (on_preview) on_preview(clone(g)); render(); };
	var render = () => {
		$('.ps_ge_name').value = g.name || 'Custom';
		bar.style.background = css(g);
		atrack.innerHTML = g.alphas.map((a, i) => '<span class="ps_ge_stop alpha' + (sel.kind == 'alpha' && sel.index == i ? ' active' : '') + '" data-i="' + i + '" style="left:' + (a.pos * 100) + '%;--c:' + 'rgb(' + Math.round(255 * (1 - a.a)) + ',' + Math.round(255 * (1 - a.a)) + ',' + Math.round(255 * (1 - a.a)) + ')"></span>').join('');
		ctrack.innerHTML = g.stops.map((s, i) => '<span class="ps_ge_stop color' + (sel.kind == 'color' && sel.index == i ? ' active' : '') + '" data-i="' + i + '" style="left:' + (s.pos * 100) + '%;--c:' + color_of(s.color) + '"></span>').join('');
		var cs = g.stops[sel.kind == 'color' ? sel.index : 0], as = g.alphas[sel.kind == 'alpha' ? sel.index : 0];
		$('.ps_ge_swatch').style.background = sel.kind == 'color' && cs ? color_of(cs.color) : 'transparent';
		$('.ps_ge_cloc').value = sel.kind == 'color' && cs ? Math.round(cs.pos * 100) : '';
		$('.ps_ge_opacity').value = sel.kind == 'alpha' && as ? Math.round(as.a * 100) : '';
		$('.ps_ge_aloc').value = sel.kind == 'alpha' && as ? Math.round(as.pos * 100) : '';
		root.querySelectorAll('.ps_ge_stop').forEach(st => st.addEventListener('mousedown', (e) => start_drag(e, st.classList.contains('alpha') ? 'alpha' : 'color', parseInt(st.dataset.i))));
	};
	var pos_of = (e) => { var r = bar.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
	var start_drag = (e, kind, index) => {
		e.preventDefault();
		e.stopPropagation();
		sel = { kind: kind, index: index };
		render();
		var list = kind == 'alpha' ? g.alphas : g.stops;
		var move = (ev) => { list[index].pos = Math.round(pos_of(ev) * 100) / 100; changed(); };
		var upf = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', upf); };
		document.addEventListener('mousemove', move);
		document.addEventListener('mouseup', upf);
	};
	//a click on a track adds a stop there
	ctrack.addEventListener('mousedown', (e) => {
		if (e.target !== ctrack) return;
		var p = pos_of(e), L = lut(g, false), k = Math.round(p * 255) * 4;
		var hex = '#' + [L[k], L[k + 1], L[k + 2]].map(v => v.toString(16).padStart(2, '0')).join('');
		g.stops.push(S(p, hex));
		sel = { kind: 'color', index: g.stops.length - 1 };
		changed();
	});
	atrack.addEventListener('mousedown', (e) => {
		if (e.target !== atrack) return;
		var p = pos_of(e), L = lut(g, false);
		g.alphas.push(A(p, L[Math.round(p * 255) * 4 + 3] / 255));
		sel = { kind: 'alpha', index: g.alphas.length - 1 };
		changed();
	});
	$('.ps_ge_swatch').addEventListener('click', () => {
		if (sel.kind != 'color') return;
		var s = g.stops[sel.index];
		app.GUI.Ps_workspace.color_dialog('Select stop color:', color_of(s.color), (hex) => { s.color = hex; changed(); });
	});
	$('.ps_ge_cloc').addEventListener('change', (e) => { if (sel.kind == 'color') { g.stops[sel.index].pos = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) / 100; changed(); } });
	$('.ps_ge_aloc').addEventListener('change', (e) => { if (sel.kind == 'alpha') { g.alphas[sel.index].pos = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) / 100; changed(); } });
	$('.ps_ge_opacity').addEventListener('change', (e) => { if (sel.kind == 'alpha') { g.alphas[sel.index].a = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) / 100; changed(); } });
	$('.ps_ge_name').addEventListener('change', (e) => { g.name = e.target.value; });
	var presets_host = $('.ps_ge_presets');
	presets().forEach((p) => {
		var cell = document.createElement('div');
		cell.className = 'ps_grad_cell';
		cell.title = p.name;
		cell.style.background = css(p);
		cell.addEventListener('click', () => { g = clone(p); sel = { kind: 'color', index: 0 }; changed(); });
		presets_host.appendChild(cell);
	});
	var close = () => root.remove();
	root.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
		var a = b.dataset.a;
		if (a == 'ok') { close(); on_ok(clone(g)); }
		if (a == 'cancel') { close(); if (on_preview) on_preview(clone(initial)); }
		if (a == 'new') {
			var p = clone(g);
			p.name = $('.ps_ge_name').value || 'Custom';
			USER.push(p);
			save_user();
			var cell = document.createElement('div');
			cell.className = 'ps_grad_cell';
			cell.title = p.name;
			cell.style.background = css(p);
			cell.addEventListener('click', () => { g = clone(p); changed(); });
			presets_host.appendChild(cell);
		}
		if (a == 'cdel' && sel.kind == 'color' && g.stops.length > 2) { g.stops.splice(sel.index, 1); sel.index = 0; changed(); }
		if (a == 'adel' && sel.kind == 'alpha' && g.alphas.length > 2) { g.alphas.splice(sel.index, 1); sel.index = 0; changed(); }
	}));
	render();
	return root;
}

/**
 * Preset Manager: the user gradients
 */
const user_gradients = {
	list: () => USER,
	remove: (i) => { USER.splice(i, 1); save_user(); },
	rename: (i, name) => { if (USER[i]) { USER[i].name = name; save_user(); } },
	add: (g) => { USER.push(g); save_user(); },
};

export { PRESETS, presets, lut, css, picker, editor, clone, resolve, two_color, render, render_centered, user_gradients };
