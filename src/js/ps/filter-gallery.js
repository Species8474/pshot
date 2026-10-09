/*
 * pshot - CS6 Filter > Filter Gallery: preview on the left, the six filter
 * folders with live thumbnails in the middle, the selected filter's settings
 * and the stack of effect layers on the right (applied bottom to top).
 * OK renders the stack at full size as one History step.
 */

import app from './../app.js';
import config from './../config.js';
import { ensure_pixel_layer, alert_box } from './pixel-layer.js';
import { EFFECTS, CATEGORIES, defaults, run_stack } from './filter-gallery-effects.js';

const S = 'fill="none" stroke="currentColor" stroke-width="1.2"';

class Ps_filter_gallery_class {

	open() {
		ensure_pixel_layer();
		var layer = config.layer;
		if (!layer || layer.type != 'image' || !layer.link) {
			alert_box('Could not complete the Filter Gallery command because the active layer is not a pixel layer.');
			return;
		}
		var W = layer.width_original, H = layer.height_original;
		var max_w = Math.min(560, window.innerWidth - 640), max_h = Math.min(520, window.innerHeight - 160);
		var k = Math.min(1, Math.max(120, max_w) / W, max_h / H);
		var pw = Math.max(1, Math.round(W * k)), ph = Math.max(1, Math.round(H * k));
		var small = document.createElement('canvas');
		small.width = pw;
		small.height = ph;
		var sctx = small.getContext('2d', { willReadFrequently: true });
		sctx.imageSmoothingQuality = 'high';
		sctx.drawImage(layer.link, 0, 0, pw, ph);
		//thumbnail source: the middle of the image
		var tw = 74, th = 50, ts = Math.max(tw / W, th / H) * 2;
		var thumb = document.createElement('canvas');
		thumb.width = tw;
		thumb.height = th;
		var tctx = thumb.getContext('2d', { willReadFrequently: true });
		tctx.fillStyle = '#fff';
		tctx.fillRect(0, 0, tw, th);
		tctx.drawImage(layer.link, (tw - W * ts) / 2, (th - H * ts) / 2, W * ts, H * ts);
		var last = this.last_stack;
		this.state = {
			layer: layer, W: W, H: H, k: k, pw: pw, ph: ph,
			src: sctx.getImageData(0, 0, pw, ph).data,
			thumb_src: tctx.getImageData(0, 0, tw, th).data, tw: tw, th: th,
			stack: last ? JSON.parse(JSON.stringify(last)) : [{ key: 'cutout', params: defaults('cutout'), visible: true }],
			selected: 0,
			open_cats: { [EFFECTS[(last && last[0] && last[0].key) || 'cutout'].cat]: true },
		};
		this.state.selected = this.state.stack.length - 1;
		this.build();
		this.render_all();
	}

	build() {
		var s = this.state;
		var el = document.createElement('div');
		el.className = 'popup ps_fgallery';
		el.style.display = 'block';
		el.innerHTML = '<h2>Filter Gallery</h2><div class="ps_fg_body">'
			+ '<div class="ps_fg_preview"><canvas width="' + s.pw + '" height="' + s.ph + '"></canvas><div class="ps_fg_zoom">' + Math.round(s.k * 100) + '%</div></div>'
			+ '<div class="ps_fg_tree"></div>'
			+ '<div class="ps_fg_side"><div class="ps_fg_buttons"><button type="button" class="button" data-b="ok">OK</button><button type="button" class="button" data-b="cancel">Cancel</button></div>'
			+ '<select class="ps_fg_select"></select><div class="ps_fg_params"></div>'
			+ '<div class="ps_fg_layers"><div class="ps_fg_layer_list"></div><div class="ps_panel_footer">'
			+ '<button type="button" data-b="new" title="New effect layer"><svg viewBox="0 0 18 18" width="16" height="16"><rect x="4" y="3" width="10" height="12" ' + S + '/><path d="M11 3v3h3" ' + S + '/></svg></button>'
			+ '<button type="button" data-b="delete" title="Delete effect layer"><svg viewBox="0 0 18 18" width="16" height="16"><path d="M5 5h8l-.8 10H5.8zM4 5h10M7.5 3h3" ' + S + '/></svg></button></div></div></div></div>';
		document.getElementById('popups').appendChild(el);
		this.el = el;
		var sel = el.querySelector('.ps_fg_select');
		sel.innerHTML = Object.values(EFFECTS).slice().sort((a, b) => a.name.localeCompare(b.name)).map(e => '<option value="' + e.key + '">' + e.name + '</option>').join('');
		sel.addEventListener('change', () => this.choose(sel.value));
		el.querySelector('[data-b="ok"]').addEventListener('click', () => this.apply());
		el.querySelector('[data-b="cancel"]').addEventListener('click', () => this.close());
		el.querySelector('[data-b="new"]').addEventListener('click', () => {
			var cur = s.stack[s.selected];
			s.stack.splice(s.selected + 1, 0, { key: cur.key, params: Object.assign({}, cur.params), visible: true });
			s.selected++;
			this.render_all();
		});
		el.querySelector('[data-b="delete"]').addEventListener('click', () => {
			if (s.stack.length <= 1) return;
			s.stack.splice(s.selected, 1);
			s.selected = Math.max(0, s.selected - 1);
			this.render_all();
		});
		this.keys = (e) => {
			if (!this.el) return;
			if (e.key == 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.close(); }
			else if (e.key == 'Enter' && e.target.tagName != 'SELECT') { e.preventDefault(); e.stopImmediatePropagation(); this.apply(); }
			else e.stopPropagation();
		};
		window.addEventListener('keydown', this.keys, true);
		this.render_tree();
	}

	render_tree() {
		var s = this.state, tree = this.el.querySelector('.ps_fg_tree');
		var html = '';
		for (var cat of CATEGORIES) {
			var open = !!s.open_cats[cat];
			html += '<div class="ps_fg_cat" data-cat="' + cat + '">' + (open ? '&#9662;' : '&#9656;') + ' <svg viewBox="0 0 16 16" width="14" height="14"><path d="M1.5 4h5l1 1.5h7v8h-13z" fill="currentColor" opacity=".8"/></svg> ' + cat + '</div>';
			if (!open) continue;
			html += '<div class="ps_fg_thumbs">';
			for (var e of Object.values(EFFECTS).filter(x => x.cat == cat)) {
				html += '<div class="ps_fg_thumb" data-key="' + e.key + '"><canvas width="' + s.tw + '" height="' + s.th + '"></canvas><span>' + e.name + '</span></div>';
			}
			html += '</div>';
		}
		tree.innerHTML = html;
		tree.querySelectorAll('[data-cat]').forEach(c => c.addEventListener('click', () => { s.open_cats[c.dataset.cat] = !s.open_cats[c.dataset.cat]; this.render_tree(); }));
		tree.querySelectorAll('[data-key]').forEach(t => t.addEventListener('click', () => this.choose(t.dataset.key)));
		this.mark_thumb();
		//thumbnails render a few at a time so the dialog opens at once
		var pending = Array.from(tree.querySelectorAll('[data-key]'));
		var step = () => {
			if (!this.el) return;
			var t = pending.shift();
			if (!t) return;
			var out = run_stack(s.thumb_src, s.tw, s.th, [{ key: t.dataset.key, params: defaults(t.dataset.key) }], 0.25);
			t.querySelector('canvas').getContext('2d').putImageData(new ImageData(out, s.tw, s.th), 0, 0);
			setTimeout(step, 0);
		};
		step();
	}

	mark_thumb() {
		var s = this.state, key = s.stack[s.selected].key;
		this.el.querySelectorAll('.ps_fg_thumb').forEach(t => t.classList.toggle('active', t.dataset.key == key));
	}

	choose(key) {
		var s = this.state;
		s.stack[s.selected] = { key: key, params: defaults(key), visible: true };
		s.open_cats[EFFECTS[key].cat] = true;
		this.render_all();
	}

	render_all() {
		this.render_tree();
		this.render_params();
		this.render_layers();
		this.update();
	}

	render_params() {
		var s = this.state, layer = s.stack[s.selected], e = EFFECTS[layer.key];
		this.el.querySelector('.ps_fg_select').value = layer.key;
		var box = this.el.querySelector('.ps_fg_params');
		box.innerHTML = e.params.map(([k, label, min, max]) => '<div class="ps_adj_slider"><span>' + label + '</span><input type="number" data-p="' + k + '" min="' + min + '" max="' + max + '" value="' + layer.params[k] + '">'
			+ '<span class="ps_adj_unit"></span><input type="range" data-pr="' + k + '" min="' + min + '" max="' + max + '" value="' + layer.params[k] + '"></div>').join('');
		box.querySelectorAll('[data-p]').forEach((n) => {
			var key = n.dataset.p, r = box.querySelector('[data-pr="' + key + '"]');
			var set = (v) => { if (isNaN(v)) return; v = Math.max(parseFloat(n.min), Math.min(parseFloat(n.max), v)); layer.params[key] = v; n.value = r.value = v; this.update(); };
			n.addEventListener('change', () => set(parseFloat(n.value)));
			r.addEventListener('input', () => set(parseFloat(r.value)));
		});
	}

	render_layers() {
		var s = this.state, list = this.el.querySelector('.ps_fg_layer_list');
		//top of the list = last applied (CS6)
		var html = '';
		for (var i = s.stack.length - 1; i >= 0; i--) {
			var l = s.stack[i];
			html += '<div class="ps_fg_layer' + (i == s.selected ? ' active' : '') + '" data-i="' + i + '"><span class="ps_fg_eye" data-eye="' + i + '">' + (l.visible === false ? '' : '&#128065;') + '</span>' + EFFECTS[l.key].name + '</div>';
		}
		list.innerHTML = html;
		list.querySelectorAll('[data-i]').forEach(r => r.addEventListener('click', (e) => {
			var i = parseInt(r.dataset.i);
			if (e.target.closest('[data-eye]')) { s.stack[i].visible = s.stack[i].visible === false; this.render_layers(); this.update(); return; }
			s.selected = i;
			this.render_params();
			this.render_layers();
			this.mark_thumb();
		}));
	}

	update() {
		if (this.pending) return;
		this.pending = true;
		requestAnimationFrame(() => {
			this.pending = false;
			if (!this.el) return;
			var s = this.state;
			var out = run_stack(s.src, s.pw, s.ph, s.stack, s.k);
			this.el.querySelector('.ps_fg_preview canvas').getContext('2d').putImageData(new ImageData(out, s.pw, s.ph), 0, 0);
			this.mark_thumb();
		});
	}

	apply() {
		var s = this.state, layer = s.layer;
		var c = document.createElement('canvas');
		c.width = s.W;
		c.height = s.H;
		var ctx = c.getContext('2d', { willReadFrequently: true });
		ctx.drawImage(layer.link, 0, 0);
		var data = ctx.getImageData(0, 0, s.W, s.H);
		var out = run_stack(data.data, s.W, s.H, s.stack, 1);
		ctx.putImageData(new ImageData(out, s.W, s.H), 0, 0);
		this.last_stack = JSON.parse(JSON.stringify(s.stack));
		this.close();
		var result = app.GUI.Ps_workspace.Selection.restrict(c, layer);
		app.State.do_action(new app.Actions.Bundle_action('filter_gallery', EFFECTS[s.stack[s.stack.length - 1].key].name, [
			new app.Actions.Update_layer_image_action(result, layer.id),
		]));
	}

	close() {
		if (this.keys) window.removeEventListener('keydown', this.keys, true);
		this.keys = null;
		if (this.el) this.el.remove();
		this.el = null;
	}
}

export default Ps_filter_gallery_class;
