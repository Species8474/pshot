/*
 * pshot - CS6 thumbnail pickers in the options bar: the Pattern picker and
 * the Custom Shape picker (a grid of swatches; right-click renames or
 * deletes; the gear switches between small and large thumbnails).
 */

import Patterns from './patterns.js';
import { names as shape_names, fitted, user_names as user_shapes, remove as remove_shape, rename as rename_shape } from './custom-shapes.js';
import { show_popup_menu, prompt_name } from './popup-menu.js';

var large = false;

function pattern_thumb(name, size) {
	return Patterns.tiled(name, size, size, 100);
}

function shape_thumb(name, size) {
	var c = document.createElement('canvas');
	c.width = c.height = size;
	var g = c.getContext('2d');
	var p = new Path2D(), m = Math.max(2, size / 8);
	for (var sp of fitted(name, m, m, size - m * 2, size - m * 2)) {
		p.moveTo(sp.pts[0].x, sp.pts[0].y);
		var cnt = sp.closed ? sp.pts.length : sp.pts.length - 1;
		for (var i = 0; i < cnt; i++) {
			var a = sp.pts[i], b = sp.pts[(i + 1) % sp.pts.length];
			p.bezierCurveTo(a.ox, a.oy, b.ix, b.iy, b.x, b.y);
		}
		p.closePath();
	}
	g.fillStyle = '#000';
	g.fill(p, 'evenodd');
	return c;
}

const KINDS = {
	pattern: {
		title: 'Pattern', names: () => Patterns.names(), thumb: pattern_thumb, user: () => true,
		rename: (n, to) => Patterns.rename(n, to), remove: (n) => Patterns.remove(n),
	},
	shape: {
		title: 'Shape', names: () => shape_names(), thumb: shape_thumb, user: (n) => user_shapes().includes(n),
		rename: (n, to) => rename_shape(n, to), remove: (n) => remove_shape(n),
	},
};

/**
 * the options bar button: the current item's thumbnail and a caret
 */
function picker_button(kind, value, enabled, on_pick) {
	var K = KINDS[kind];
	var b = document.createElement('button');
	b.type = 'button';
	b.className = 'ps_opt_thumbpick';
	b.title = K.title + ' picker';
	b.disabled = !enabled;
	var t = K.thumb(value || K.names()[0], 22);
	t.className = 'ps_thumbpick_swatch';
	b.appendChild(t);
	b.insertAdjacentHTML('beforeend', '<span class="ps_caret">&#9662;</span>');
	b.addEventListener('click', () => open_picker(kind, b, value, on_pick));
	return b;
}

function open_picker(kind, anchor, value, on_pick) {
	var existing = document.querySelector('.ps_thumbpicker');
	if (existing) { existing.remove(); return; }
	var K = KINDS[kind];
	var pop = document.createElement('div');
	pop.className = 'ps_thumbpicker';
	var close = () => {
		pop.remove();
		document.removeEventListener('mousedown', outside, true);
	};
	var draw = () => {
		pop.innerHTML = '<div class="ps_tpre_head"><span></span><button type="button" class="ps_tpre_menu" title="' + K.title + ' picker options">&#9881;</button></div><div class="ps_thumbpick_grid' + (large ? ' large' : '') + '"></div>';
		var grid = pop.querySelector('.ps_thumbpick_grid'), size = large ? 56 : 32;
		K.names().forEach((n) => {
			var cell = document.createElement('div');
			cell.className = 'ps_thumbpick_cell' + (n == value ? ' active' : '');
			cell.title = n;
			cell.appendChild(K.thumb(n, size));
			cell.addEventListener('click', () => { close(); on_pick(n); });
			cell.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				var user = K.user(n);
				show_popup_menu(cell, [
					{ name: 'Rename ' + K.title + '...', action: user ? () => prompt_name(K.title + ' Name', n, (to) => { K.rename(n, to); if (n == value) { value = to; on_pick(to); } draw(); }) : null },
					{ name: 'Delete ' + K.title, action: user && K.names().length > 1 ? () => { K.remove(n); if (n == value) { value = K.names()[0]; on_pick(value); } draw(); } : null },
				], { point: { x: e.clientX, y: e.clientY } });
			});
			grid.appendChild(cell);
		});
		pop.querySelector('.ps_tpre_menu').addEventListener('click', (e) => {
			show_popup_menu(e.currentTarget, [
				{ name: 'Small Thumbnail', checked: !large, action: () => { large = false; draw(); } },
				{ name: 'Large Thumbnail', checked: large, action: () => { large = true; draw(); } },
			]);
		});
	};
	draw();
	document.body.appendChild(pop);
	var r = anchor.getBoundingClientRect();
	pop.style.left = Math.max(0, Math.min(window.innerWidth - pop.offsetWidth - 4, r.left)) + 'px';
	pop.style.top = (r.bottom + 2) + 'px';
	var outside = (e) => {
		if (!pop.contains(e.target) && !anchor.contains(e.target) && !e.target.closest('.ps_popup_menu, #popups')) close();
	};
	setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
}

export { picker_button, pattern_thumb, shape_thumb };
