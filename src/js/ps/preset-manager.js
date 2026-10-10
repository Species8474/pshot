/*
 * pshot - CS6 Edit > Presets > Preset Manager (Brushes, Gradients, Patterns,
 * Custom Shapes, Tools: rename and delete your presets; the built-in ones are
 * shown) and Export/Import Presets (all user presets as one JSON file).
 */

import app from './../app.js';
import Patterns from './patterns.js';
import { presets as gradient_presets, css as gradient_css, user_gradients } from './gradients.js';
import { names as shape_names, fitted, user_names as user_shape_names, remove as remove_shape, rename as rename_shape, user_data as shape_data, import_shapes } from './custom-shapes.js';
import { user_tips, import_tips } from './brush-tips.js';
import filesaver from './../../../node_modules/file-saver/dist/FileSaver.min.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import Dialog_class from './../libs/popup.js';

const TYPES = ['Brushes', 'Gradients', 'Patterns', 'Custom Shapes', 'Tools'];

class Ps_preset_manager_class {

	/**
	 * [{ name, thumb(canvas) | css, user: bool, rename(name), remove() }] for a preset type
	 */
	items(type) {
		var ws = app.GUI.Ps_workspace;
		if (type == 'Brushes') {
			var BP = ws.Brush_presets, user = BP.user_list();
			return BP.list().map(p => ({ name: p.name + ' ' + p.size, thumb: () => BP.thumb(p, 40), user: user.includes(p), rename: (n) => BP.rename(p, n), remove: () => BP.remove(p) }));
		}
		if (type == 'Gradients') {
			var ug = user_gradients.list();
			return gradient_presets().map(g => {
				var ui = ug.indexOf(g);
				return { name: g.name, css: gradient_css(g), user: ui >= 0, rename: (n) => user_gradients.rename(ui, n), remove: () => user_gradients.remove(ui) };
			});
		}
		if (type == 'Patterns') {
			return Patterns.names().map(n => ({ name: n, thumb: () => { var c = Patterns.tiled(n, 40, 40, 100); return c; }, user: true, rename: (to) => Patterns.rename(n, to), remove: () => Patterns.remove(n) }));
		}
		if (type == 'Custom Shapes') {
			var us = user_shape_names();
			return shape_names().map(n => ({
				name: n, user: us.includes(n), rename: (to) => rename_shape(n, to), remove: () => remove_shape(n),
				thumb: () => {
					var c = document.createElement('canvas');
					c.width = c.height = 40;
					var g = c.getContext('2d');
					g.fillStyle = '#000';
					var p = new Path2D();
					for (var sp of fitted(n, 4, 4, 32, 32)) {
						p.moveTo(sp.pts[0].x, sp.pts[0].y);
						var cnt = sp.closed ? sp.pts.length : sp.pts.length - 1;
						for (var i = 0; i < cnt; i++) { var a = sp.pts[i], b = sp.pts[(i + 1) % sp.pts.length]; p.bezierCurveTo(a.ox, a.oy, b.ix, b.iy, b.x, b.y); }
						p.closePath();
					}
					g.fill(p, 'evenodd');
					return c;
				},
			}));
		}
		var TP = ws.Tool_presets;
		return TP.user_list().map(p => ({ name: p.name, icon: TP.icon(p.member), user: true, rename: (n) => TP.rename(p, n), remove: () => TP.remove(p) }));
	}

	open() {
		this.type = this.type || 'Brushes';
		this.selected = -1;
		var root = document.createElement('div');
		root.className = 'ps_grad_editor_wrap ps_pm_wrap';
		root.innerHTML = '<div class="ps_grad_editor ps_pm">'
			+ '<div class="ps_ge_title">Preset Manager</div>'
			+ '<div class="ps_ge_row"><label>Preset Type:</label><select class="ps_pm_type">' + TYPES.map(t => '<option' + (t == this.type ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div>'
			+ '<div class="ps_ge_top"><div class="ps_pm_list"></div><div class="ps_ge_buttons">'
			+ '<button type="button" data-a="done">Done</button><button type="button" data-a="rename">Rename...</button><button type="button" data-a="delete">Delete</button>'
			+ '</div></div><div class="ps_pm_hint"></div></div>';
		document.body.appendChild(root);
		this.root = root;
		root.querySelector('.ps_pm_type').addEventListener('change', (e) => { this.type = e.target.value; this.selected = -1; this.render(); });
		root.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => this.action(b.dataset.a)));
		this.render();
	}

	render() {
		var list = this.items(this.type), host = this.root.querySelector('.ps_pm_list');
		host.innerHTML = '';
		list.forEach((it, i) => {
			var cell = document.createElement('div');
			cell.className = 'ps_pm_cell' + (i == this.selected ? ' active' : '') + (it.user ? '' : ' builtin');
			cell.title = it.name + (it.user ? '' : ' (built in)');
			if (it.thumb) cell.appendChild(it.thumb());
			else if (it.css) { var sw = document.createElement('span'); sw.className = 'ps_pm_swatch'; sw.style.background = it.css; cell.appendChild(sw); }
			else if (it.icon) cell.innerHTML = '<svg viewBox="0 0 18 18" width="24" height="24">' + it.icon + '</svg>';
			var label = document.createElement('span');
			label.className = 'ps_pm_name';
			label.textContent = it.name;
			cell.appendChild(label);
			cell.addEventListener('click', () => { this.selected = i; this.render(); });
			host.appendChild(cell);
		});
		var sel = list[this.selected];
		this.root.querySelector('.ps_pm_hint').textContent = list.length ? (sel && !sel.user ? 'Built-in presets cannot be renamed or deleted.' : '') : 'No presets of this type.';
		this.root.querySelectorAll('[data-a="rename"], [data-a="delete"]').forEach(b => { b.disabled = !sel || !sel.user; });
	}

	action(a) {
		if (a == 'done') {
			this.root.remove();
			app.GUI.Ps_workspace.Options_bar.render();
			return;
		}
		var it = this.items(this.type)[this.selected];
		if (!it || !it.user) return;
		if (a == 'delete') {
			it.remove();
			this.selected = -1;
			this.render();
		}
		if (a == 'rename') {
			var POP = new Dialog_class();
			POP.show({
				title: 'Rename',
				params: [{ name: 'name', title: 'Name:', value: it.name }],
				on_finish: (p) => {
					if (!p.name) return;
					it.rename(p.name);
					this.render();
				},
			});
		}
	}

	// ---------- Export / Import Presets ----------

	export_presets() {
		var ws = app.GUI.Ps_workspace;
		var data = {
			pshot_presets: 1,
			brushes: ws.Brush_presets.user_list(),
			brush_tips: user_tips(),
			gradients: user_gradients.list(),
			custom_shapes: shape_data(),
			tools: ws.Tool_presets.user_list(),
		};
		filesaver.saveAs(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'pshot Presets.json');
	}

	import_presets() {
		var input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json,application/json';
		input.addEventListener('change', async () => {
			var f = input.files && input.files[0];
			if (!f) return;
			try {
				var data = JSON.parse(await f.text());
				if (!data || !data.pshot_presets) throw new Error('not a presets file');
				var ws = app.GUI.Ps_workspace;
				import_tips(data.brush_tips);
				ws.Brush_presets.import_presets(data.brushes);
				for (var g of data.gradients || []) user_gradients.add(g);
				import_shapes(data.custom_shapes);
				ws.Tool_presets.import_presets(data.tools);
				ws.status_message('Presets imported.');
			}
			catch (e) {
				alertify.error('Could not import the presets: ' + e.message);
			}
		});
		input.click();
	}
}

export default Ps_preset_manager_class;
