/*
 * pshot - CS6 data-driven graphics: Image > Variables > Define (visibility,
 * text replacement and pixel replacement variables on layers), Data Sets
 * (named sets of values), Image > Apply Data Set, File > Import > Variable
 * Data Sets (CSV / tab text, first row = variable names) and File > Export >
 * Data Sets as Files (one image per data set, in a zip).
 *
 * layer.ps_vars = { visibility: name, text: name, pixel: name, method }
 * config.ps_datasets = [{ name, values: { variable: value } }]
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';
import { make_zip } from './zip.js';

const METHODS = ['Fit', 'Fill', 'As Is', 'Conform'];

function esc(v) {
	return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function load_image(src) {
	return new Promise((resolve) => {
		var img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => resolve(null);
		img.src = src;
	});
}

class Ps_variables_class {

	layers() {
		return config.layers.filter(l => l.type != 'ps_group');
	}

	/**
	 * every defined variable: [{ name, kind, layer }]
	 */
	variables() {
		var out = [];
		for (var l of this.layers()) {
			var v = l.ps_vars || {};
			if (v.visibility) out.push({ name: v.visibility, kind: 'visibility', layer: l });
			if (v.text && l.type == 'text') out.push({ name: v.text, kind: 'text', layer: l });
			if (v.pixel && l.type == 'image') out.push({ name: v.pixel, kind: 'pixel', layer: l });
		}
		return out;
	}

	datasets() {
		return config.ps_datasets || [];
	}

	// ---------- Variables > Define ----------

	define() {
		var layers = this.layers();
		if (!layers.length) return;
		var layer = config.layer && config.layer.type != 'ps_group' ? config.layer : layers[0];
		var v = Object.assign({}, layer.ps_vars || {});
		var auto = (kind) => kind + (this.variables().length + 1);
		var POP = new Dialog_class();
		var params = [
			{ name: 'layer', title: 'Layer:', values: layers.map(l => l.name), value: layer.name, type: 'select' },
			{ name: 'vis', title: 'Visibility', value: !!v.visibility },
			{ name: 'vis_name', title: 'Name:', value: v.visibility || auto('visibility') },
		];
		if (layer.type == 'text') {
			params.push({ name: 'text', title: 'Text Replacement', value: !!v.text }, { name: 'text_name', title: 'Name:', value: v.text || auto('text') });
		}
		if (layer.type == 'image') {
			params.push({ name: 'pixel', title: 'Pixel Replacement', value: !!v.pixel }, { name: 'pixel_name', title: 'Name:', value: v.pixel || auto('image') },
				{ name: 'method', title: 'Method:', values: METHODS, value: v.method || 'Fit', type: 'select' });
		}
		POP.show({
			title: 'Variables',
			params: params,
			on_finish: (p) => {
				var target = layers.find(l => l.name == p.layer) || layer;
				if (target !== layer) {
					//another layer was chosen: define it next
					if (target !== config.layer) app.State.do_action(new app.Actions.Select_layer_action(target.id)).then(() => this.define());
					return;
				}
				var vars = {
					visibility: p.vis ? (p.vis_name || auto('visibility')) : null,
					text: p.text ? (p.text_name || auto('text')) : null,
					pixel: p.pixel ? (p.pixel_name || auto('image')) : null,
					method: p.method || 'Fit',
				};
				app.State.do_action(new app.Actions.Bundle_action('variables', 'Define Variables', [
					new app.Actions.Update_layer_action(layer.id, { ps_vars: vars }),
				]));
			},
		});
	}

	// ---------- Variables > Data Sets ----------

	/**
	 * the values a data set starts with: the document as it is now
	 */
	current_values() {
		var values = {};
		for (var v of this.variables()) {
			if (v.kind == 'visibility') values[v.name] = v.layer.visible === false ? 'Invisible' : 'Visible';
			else if (v.kind == 'text') values[v.name] = (v.layer.data || []).map(line => line.map(s => s.text).join('')).join('\n');
			else values[v.name] = '';
		}
		return values;
	}

	data_sets() {
		var vars = this.variables();
		if (!vars.length) {
			app.GUI.Ps_workspace.status_message('Define variables first (Image > Variables > Define).');
			return;
		}
		var sets = JSON.parse(JSON.stringify(this.datasets()));
		var cur = 0;
		if (!sets.length) sets.push({ name: 'Data Set 1', values: this.current_values() });
		var root = document.createElement('div');
		root.className = 'ps_grad_editor_wrap ps_pm_wrap';
		var render = () => {
			var set = sets[cur];
			root.innerHTML = '<div class="ps_grad_editor ps_vars">'
				+ '<div class="ps_ge_title">Data Sets</div>'
				+ '<div class="ps_ge_row"><label>Data Set:</label><select class="ps_vars_set">' + sets.map((s, i) => '<option value="' + i + '"' + (i == cur ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select>'
				+ '<button type="button" data-a="new" title="Save this data set as a new one">New</button><button type="button" data-a="delete" title="Delete this data set">Delete</button>'
				+ '<label>Name:</label><input type="text" class="ps_vars_name" value="' + esc(set.name) + '"></div>'
				+ '<div class="ps_vars_table"><div class="ps_vars_head"><span>Name</span><span>Value</span><span>Type</span></div>'
				+ vars.map(v => '<div class="ps_vars_row"><span>' + esc(v.name) + '</span>' + this.value_input(v, set.values[v.name]) + '<span>' + { visibility: 'Visibility', text: 'Text', pixel: 'Pixel' }[v.kind] + '</span></div>').join('')
				+ '</div><div class="ps_ge_buttons ps_vars_buttons"><button type="button" data-a="ok">OK</button><button type="button" data-a="cancel">Cancel</button><button type="button" data-a="apply">Apply</button></div></div>';
			root.querySelector('.ps_vars_set').addEventListener('change', (e) => { cur = parseInt(e.target.value); render(); });
			root.querySelector('.ps_vars_name').addEventListener('change', (e) => { set.name = e.target.value || set.name; render(); });
			root.querySelectorAll('[data-var]').forEach((input) => {
				input.addEventListener('keydown', (e) => e.stopPropagation());
				input.addEventListener('change', async () => {
					var name = input.dataset.var;
					if (input.type == 'file') {
						var f = input.files && input.files[0];
						if (f) set.values[name] = await new Promise((res) => { var r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
					}
					else set.values[name] = input.value;
				});
			});
			root.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
				var a = b.dataset.a;
				if (a == 'new') { sets.push({ name: 'Data Set ' + (sets.length + 1), values: JSON.parse(JSON.stringify(set.values)) }); cur = sets.length - 1; render(); }
				else if (a == 'delete') { sets.splice(cur, 1); if (!sets.length) sets.push({ name: 'Data Set 1', values: this.current_values() }); cur = Math.min(cur, sets.length - 1); render(); }
				else if (a == 'cancel') root.remove();
				else {
					root.remove();
					this.save_sets(sets).then(() => { if (a == 'apply') this.apply(cur); });
				}
			}));
		};
		document.body.appendChild(root);
		render();
	}

	value_input(v, value) {
		if (v.kind == 'visibility') {
			return '<select data-var="' + esc(v.name) + '">' + ['Visible', 'Invisible'].map(o => '<option' + ((value || 'Visible') == o ? ' selected' : '') + '>' + o + '</option>').join('') + '</select>';
		}
		if (v.kind == 'pixel') {
			return '<span class="ps_vars_file">' + (value ? 'Image chosen' : 'No image') + ' <input type="file" accept="image/*" data-var="' + esc(v.name) + '"></span>';
		}
		return '<input type="text" data-var="' + esc(v.name) + '" value="' + esc(value) + '">';
	}

	save_sets(sets) {
		return app.State.do_action(new app.Actions.Bundle_action('data_sets', 'Data Sets', [
			new app.Actions.Update_config_action({ ps_datasets: sets }),
		]));
	}

	// ---------- Apply Data Set ----------

	apply_dialog() {
		var sets = this.datasets();
		if (!sets.length) {
			app.GUI.Ps_workspace.status_message('There are no data sets (Image > Variables > Data Sets).');
			return;
		}
		var POP = new Dialog_class();
		POP.show({
			title: 'Apply Data Set',
			params: [{ name: 'set', title: 'Data Set:', values: sets.map(s => s.name), value: sets[0].name, type: 'select' }],
			on_finish: (p) => this.apply(sets.findIndex(s => s.name == p.set)),
		});
	}

	async actions_for(set) {
		var actions = [];
		for (var v of this.variables()) {
			var value = set.values[v.name];
			if (value == null || value === '') continue;
			var l = v.layer;
			if (v.kind == 'visibility') actions.push(new app.Actions.Update_layer_action(l.id, { visible: value != 'Invisible' }));
			else if (v.kind == 'text') {
				var meta = (((l.data || [])[0] || [])[0] || {}).meta || {};
				var data = String(value).split('\n').map(line => [{ text: line, meta: JSON.parse(JSON.stringify(meta)) }]);
				actions.push(new app.Actions.Update_layer_action(l.id, { data: data }));
			}
			else if (v.kind == 'pixel') {
				var img = await load_image(value);
				if (img) actions.push(new app.Actions.Update_layer_image_action(this.place(l, img), l.id));
			}
		}
		return actions;
	}

	/**
	 * pixel replacement: the image in the layer's box (Fit / Fill / As Is / Conform)
	 */
	place(layer, img) {
		var W = layer.width_original, H = layer.height_original;
		var c = document.createElement('canvas');
		c.width = W;
		c.height = H;
		var ctx = c.getContext('2d');
		var method = (layer.ps_vars || {}).method || 'Fit';
		var w = img.width, h = img.height;
		if (method == 'Conform') { w = W; h = H; }
		else if (method == 'Fit' || method == 'Fill') {
			var k = method == 'Fit' ? Math.min(W / img.width, H / img.height) : Math.max(W / img.width, H / img.height);
			w = img.width * k;
			h = img.height * k;
		}
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
		return c;
	}

	async apply(index) {
		var set = this.datasets()[index];
		if (!set) return;
		var actions = await this.actions_for(set);
		if (!actions.length) return;
		await app.State.do_action(new app.Actions.Bundle_action('apply_data_set', 'Apply Data Set', actions));
		config.need_render = true;
	}

	// ---------- File > Import > Variable Data Sets ----------

	import_sets() {
		if (!this.variables().length) {
			app.GUI.Ps_workspace.status_message('Define variables first (Image > Variables > Define).');
			return;
		}
		var input = document.createElement('input');
		input.type = 'file';
		input.accept = '.csv,.txt,text/csv,text/plain';
		input.addEventListener('change', async () => {
			var f = input.files && input.files[0];
			if (!f) return;
			var text = await f.text();
			var sets = this.parse(text);
			if (!sets.length) {
				app.GUI.Ps_workspace.status_message('No data sets were found in the file.');
				return;
			}
			await this.save_sets(this.datasets().concat(sets));
			app.GUI.Ps_workspace.status_message(sets.length + ' data set' + (sets.length == 1 ? '' : 's') + ' imported.');
		});
		input.click();
	}

	/**
	 * CSV or tab-separated text; the first row names the variables
	 */
	parse(text) {
		var rows = [], sep = text.indexOf('\t') >= 0 ? '\t' : ',';
		var row = [], field = '', quoted = false;
		for (var i = 0; i < text.length; i++) {
			var ch = text[i];
			if (quoted) {
				if (ch == '"' && text[i + 1] == '"') { field += '"'; i++; }
				else if (ch == '"') quoted = false;
				else field += ch;
			}
			else if (ch == '"') quoted = true;
			else if (ch == sep) { row.push(field); field = ''; }
			else if (ch == '\n' || ch == '\r') {
				if (ch == '\r' && text[i + 1] == '\n') i++;
				row.push(field); field = '';
				if (row.some(x => x !== '')) rows.push(row);
				row = [];
			}
			else field += ch;
		}
		row.push(field);
		if (row.some(x => x !== '')) rows.push(row);
		if (rows.length < 2) return [];
		var names = rows[0].map(s => s.trim());
		var n = this.datasets().length;
		return rows.slice(1).map((r, i) => {
			var values = {};
			names.forEach((name, k) => { values[name] = r[k] == null ? '' : r[k]; });
			return { name: 'Data Set ' + (n + i + 1), values: values };
		});
	}

	// ---------- File > Export > Data Sets as Files ----------

	export_dialog() {
		var sets = this.datasets();
		if (!sets.length) {
			app.GUI.Ps_workspace.status_message('There are no data sets (Image > Variables > Data Sets).');
			return;
		}
		var doc = app.GUI.Ps_workspace.Documents.current();
		var base = ((doc && doc.name) || 'Untitled').replace(/\.[^.]+$/, '');
		var POP = new Dialog_class();
		POP.show({
			title: 'Export Data Sets as Files',
			params: [
				{ name: 'base', title: 'File Name:', value: base },
				{ name: 'naming', title: 'Then:', values: ['Data Set Name', 'Data Set Number'], value: 'Data Set Name', type: 'select' },
				{ name: 'format', title: 'Format:', values: ['PNG', 'JPEG'], value: 'PNG', type: 'select' },
			],
			on_finish: (p) => this.export_files(p),
		});
	}

	async export_files(p) {
		var sets = this.datasets(), files = [], ws = app.GUI.Ps_workspace;
		var jpeg = p.format == 'JPEG';
		for (var i = 0; i < sets.length; i++) {
			var actions = await this.actions_for(sets[i]);
			if (actions.length) await app.State.do_action(new app.Actions.Bundle_action('apply_data_set', 'Apply Data Set', actions));
			var c = document.createElement('canvas');
			c.width = config.WIDTH;
			c.height = config.HEIGHT;
			var ctx = c.getContext('2d');
			if (jpeg) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
			app.Layers.convert_layers_to_canvas(ctx, null, false);
			var blob = await new Promise(res => c.toBlob(res, jpeg ? 'image/jpeg' : 'image/png', 0.92));
			var suffix = p.naming == 'Data Set Number' ? String(i + 1).padStart(2, '0') : sets[i].name.replace(/[^\w.-]+/g, '_');
			files.push({ name: (p.base || 'image') + '_' + suffix + (jpeg ? '.jpg' : '.png'), data: new Uint8Array(await blob.arrayBuffer()) });
			//back to the document as it was
			if (actions.length) await app.State.undo_action();
		}
		var a = document.createElement('a');
		a.href = URL.createObjectURL(make_zip(files));
		a.download = (p.base || 'image') + '_data_sets.zip';
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 10000);
		ws.status_message(files.length + ' files exported.');
		return files.length;
	}
}

export default Ps_variables_class;
