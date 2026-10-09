/*
 * pshot - CS6 File > Automate > Batch (play an action on many files) and
 * File > Scripts > Image Processor (convert / resize many files). Each file is
 * opened as a document, processed, saved (downloaded) and closed.
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';
import { open_document, save_psd } from './document.js';
import filesaver from './../../../node_modules/file-saver/dist/FileSaver.min.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

function pick(multiple) {
	return new Promise((resolve) => {
		var input = document.createElement('input');
		input.type = 'file';
		input.multiple = multiple;
		input.accept = 'image/*,.psd';
		input.addEventListener('change', () => resolve(Array.from(input.files || [])));
		input.click();
	});
}

function wait(ms) {
	return new Promise(r => setTimeout(r, ms));
}

class Ps_batch_class {

	/**
	 * the merged document as a downloaded JPEG / PNG / PSD
	 */
	async save(name, format, quality) {
		if (format == 'PSD') {
			save_psd(name);
			return;
		}
		var c = document.createElement('canvas');
		c.width = config.WIDTH;
		c.height = config.HEIGHT;
		var ctx = c.getContext('2d');
		if (format == 'JPEG') {
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, c.width, c.height);
		}
		app.Layers.convert_layers_to_canvas(ctx, null, false);
		var blob = await new Promise(r => c.toBlob(r, format == 'JPEG' ? 'image/jpeg' : 'image/png', format == 'JPEG' ? quality : undefined));
		filesaver.saveAs(blob, name + (format == 'JPEG' ? '.jpg' : '.png'));
	}

	async close_current() {
		var confirm = window.confirm;
		window.confirm = () => true;
		try { await app.GUI.Ps_workspace.Documents.close(); } finally { window.confirm = confirm; }
	}

	/**
	 * run fn for each file as an open document; status in the status bar
	 */
	async each(files, fn) {
		var ws = app.GUI.Ps_workspace;
		for (var i = 0; i < files.length; i++) {
			ws.status_message('Processing ' + files[i].name + ' (' + (i + 1) + ' of ' + files.length + ')...');
			await open_document([files[i]]);
			await wait(300);
			await fn(files[i]);
		}
		ws.status_message('Done: ' + files.length + ' file' + (files.length == 1 ? '' : 's') + '.');
	}

	batch() {
		var A = app.GUI.Ps_workspace.Actions;
		var sets = A.sets;
		if (!sets.length || !sets.some(s => s.actions.length)) {
			alertify.error('There are no actions to play. Record one in the Actions panel first.');
			return;
		}
		var files = [];
		var POP = new Dialog_class();
		var esc = app.GUI.Ps_workspace.Helper.escapeHtml;
		var html = '<div class="ps_adj ps_batch">'
			+ '<div class="ps_adj_label">Play</div>'
			+ '<div class="ps_adj_row"><span>Set:</span><select id="bt_set">' + sets.map((s, i) => '<option value="' + i + '">' + esc(s.name) + '</option>').join('') + '</select></div>'
			+ '<div class="ps_adj_row"><span>Action:</span><select id="bt_action"></select></div>'
			+ '<div class="ps_adj_label">Source</div>'
			+ '<div class="ps_adj_row"><select disabled><option>Files</option></select><button type="button" class="button" id="bt_choose">Choose...</button><span id="bt_count">No files</span></div>'
			+ '<label class="ps_adj_check disabled"><input type="checkbox" disabled> Override Action "Open" Commands</label>'
			+ '<div class="ps_adj_label">Destination</div>'
			+ '<div class="ps_adj_row"><select id="bt_dest"><option>None</option><option selected>Folder</option></select></div>'
			+ '<div class="ps_adj_row"><span>File Type:</span><select id="bt_format"><option>JPEG</option><option>PNG</option><option>PSD</option></select></div>'
			+ '<div class="ps_adj_row"><span>Quality:</span><input type="number" id="bt_quality" min="0" max="12" value="10" style="width:52px"></div>'
			+ '<div class="ps_adj_label">Errors</div><div class="ps_adj_row"><select disabled><option>Stop For Errors</option></select></div></div>';
		POP.show({
			title: 'Batch',
			className: 'ps_adjust_dialog',
			params: [{ function() { return html; } }],
			on_finish: () => {
				var si = parseInt(document.getElementById('bt_set').value), ai = parseInt(document.getElementById('bt_action').value);
				var dest = document.getElementById('bt_dest').value, format = document.getElementById('bt_format').value;
				var q = Math.max(0, Math.min(12, parseInt(document.getElementById('bt_quality').value) || 10)) / 12;
				if (!files.length) { alertify.error('Choose the source files.'); return; }
				this.each(files, async (file) => {
					A.selected = { set: si, action: ai };
					await A.play();
					if (dest == 'Folder') {
						await this.save(file.name.replace(/\.[^.]+$/, ''), format, q);
						await wait(200);
						await this.close_current();
					}
				});
			},
		});
		var set = document.getElementById('bt_set'), action = document.getElementById('bt_action');
		var fill = () => { action.innerHTML = sets[parseInt(set.value)].actions.map((a, i) => '<option value="' + i + '">' + esc(a.name) + '</option>').join(''); };
		set.addEventListener('change', fill);
		fill();
		document.getElementById('bt_choose').addEventListener('click', async () => {
			files = await pick(true);
			document.getElementById('bt_count').textContent = files.length ? files.length + ' file' + (files.length == 1 ? '' : 's') : 'No files';
		});
	}

	/**
	 * File > Scripts > Export Layers to Files: every layer (or the visible ones)
	 * as its own file, optionally trimmed to its pixels
	 */
	export_layers() {
		var html = '<div class="ps_adj ps_batch">'
			+ '<div class="ps_adj_row"><span>Destination:</span><span>Downloads</span></div>'
			+ '<div class="ps_adj_row"><span>File Name Prefix:</span><input type="text" id="el_prefix" value="' + app.GUI.Ps_workspace.Helper.escapeHtml(app.GUI.Ps_workspace.document_name().replace(/\.[^.]+$/, '')) + '"></div>'
			+ '<label class="ps_adj_check"><input type="checkbox" id="el_visible"> Visible Layers Only</label>'
			+ '<div class="ps_adj_row"><span>File Type:</span><select id="el_type"><option>PNG-24</option><option>JPEG</option></select></div>'
			+ '<div class="ps_adj_row"><span>Quality:</span><input type="number" id="el_q" min="0" max="12" value="8" style="width:48px"></div>'
			+ '<label class="ps_adj_check"><input type="checkbox" id="el_trim" checked> Trim Layers</label></div>';
		var POP = new Dialog_class();
		POP.show({
			title: 'Export Layers To Files',
			className: 'ps_adjust_dialog',
			params: [{ function() { return html; } }],
			on_finish: async () => {
				var $ = (id) => document.getElementById(id);
				var prefix = $('el_prefix').value || 'Layer', visible = $('el_visible').checked, type = $('el_type').value, trim = $('el_trim').checked;
				var q = Math.max(0, Math.min(12, parseInt($('el_q').value) || 8)) / 12;
				var layers = app.GUI.Ps_workspace.Groups.ordered().filter(l => l.type != null && l.type != 'ps_group' && l.type != 'ps_adjust' && (!visible || l.visible !== false));
				var T = app.GUI.Ps_workspace.Transform;
				var n = 0;
				for (var l of layers) {
					var saved = l.visible;
					l.visible = true;
					var c = app.Layers.convert_layer_to_canvas(l.id, false, false);
					l.visible = saved;
					if (trim) {
						var b = T.alpha_bounds(c);
						if (!b) continue;
						var t = document.createElement('canvas');
						t.width = b.width;
						t.height = b.height;
						t.getContext('2d').drawImage(c, -b.x, -b.y);
						c = t;
					}
					if (type == 'JPEG') {
						var j = document.createElement('canvas');
						j.width = c.width;
						j.height = c.height;
						var jctx = j.getContext('2d');
						jctx.fillStyle = '#fff';
						jctx.fillRect(0, 0, j.width, j.height);
						jctx.drawImage(c, 0, 0);
						c = j;
					}
					var blob = await new Promise(r => c.toBlob(r, type == 'JPEG' ? 'image/jpeg' : 'image/png', type == 'JPEG' ? q : undefined));
					n++;
					filesaver.saveAs(blob, prefix + '_' + String(n).padStart(4, '0') + '_' + (l.name || 'Layer').replace(/[^\w\- ]+/g, '') + (type == 'JPEG' ? '.jpg' : '.png'));
					await wait(150);
				}
				app.GUI.Ps_workspace.status_message('Export Layers To Files: ' + n + ' files.');
			},
		});
	}

	/**
	 * File > Scripts > Layer Comps to Files
	 */
	comps_to_files() {
		var comps = config.ps_comps || [];
		if (!comps.length) {
			alertify.error('There are no layer comps in the document.');
			return;
		}
		var html = '<div class="ps_adj ps_batch">'
			+ '<div class="ps_adj_row"><span>Destination:</span><span>Downloads</span></div>'
			+ '<div class="ps_adj_row"><span>File Name Prefix:</span><input type="text" id="lc_prefix" value="' + app.GUI.Ps_workspace.Helper.escapeHtml(app.GUI.Ps_workspace.document_name().replace(/\.[^.]+$/, '')) + '"></div>'
			+ '<div class="ps_adj_row"><span>File Type:</span><select id="lc_type"><option>PNG-24</option><option>JPEG</option><option>PSD</option></select></div></div>';
		var POP = new Dialog_class();
		POP.show({
			title: 'Layer Comps To Files',
			className: 'ps_adjust_dialog',
			params: [{ function() { return html; } }],
			on_finish: async () => {
				var prefix = document.getElementById('lc_prefix').value || 'Comp', type = document.getElementById('lc_type').value;
				var Comps = app.GUI.Ps_workspace.Comps;
				var before = config.ps_comp_active == null ? -1 : config.ps_comp_active;
				var start = app.State.action_history_index;
				for (var i = 0; i < comps.length; i++) {
					await Comps.apply(i);
					await wait(200);
					await this.save(prefix + '_' + String(i + 1).padStart(4, '0') + '_' + comps[i].name.replace(/[^\w\- ]+/g, ''), type == 'PNG-24' ? 'PNG' : type, 0.9);
					await wait(200);
				}
				//back to the state before the export
				await app.GUI.Ps_workspace.goto_history(start);
				app.State.action_history.length = start;
				app.GUI.Ps_workspace.render_history();
				app.GUI.Ps_workspace.status_message('Layer Comps To Files: ' + comps.length + ' files.');
			},
		});
	}

	/**
	 * File > Scripts > Image Processor
	 */
	image_processor() {
		var files = [];
		var POP = new Dialog_class();
		var A = app.GUI.Ps_workspace.Actions;
		var esc = app.GUI.Ps_workspace.Helper.escapeHtml;
		var actions = [];
		A.sets.forEach((s, si) => s.actions.forEach((a, ai) => actions.push({ si: si, ai: ai, name: s.name + ': ' + a.name })));
		var html = '<div class="ps_adj ps_batch">'
			+ '<div class="ps_adj_label">1 Select the images to process</div>'
			+ '<div class="ps_adj_row"><button type="button" class="button" id="ip_choose">Select Files...</button><span id="ip_count">No files</span></div>'
			+ '<div class="ps_adj_label">2 Select location to save processed images</div>'
			+ '<div class="ps_adj_row"><span>Downloads (the browser download folder)</span></div>'
			+ '<div class="ps_adj_label">3 File Type</div>'
			+ '<div class="ps_adj_row"><label class="ps_adj_check"><input type="checkbox" id="ip_jpg" checked> Save as JPEG</label><span>Quality:</span><input type="number" id="ip_q" min="0" max="12" value="5" style="width:48px"></div>'
			+ '<div class="ps_adj_row"><label class="ps_adj_check"><input type="checkbox" id="ip_psd"> Save as PSD</label><label class="ps_adj_check"><input type="checkbox" id="ip_png"> Save as PNG</label></div>'
			+ '<div class="ps_adj_row"><label class="ps_adj_check"><input type="checkbox" id="ip_resize"> Resize to Fit</label><span>W:</span><input type="number" id="ip_w" value="1024" style="width:60px"><span>H:</span><input type="number" id="ip_h" value="1024" style="width:60px"><span>px</span></div>'
			+ '<div class="ps_adj_label">4 Preferences</div>'
			+ '<div class="ps_adj_row"><label class="ps_adj_check"><input type="checkbox" id="ip_run"' + (actions.length ? '' : ' disabled') + '> Run Action:</label><select id="ip_action">' + actions.map((a, i) => '<option value="' + i + '">' + esc(a.name) + '</option>').join('') + '</select></div></div>';
		POP.show({
			title: 'Image Processor',
			className: 'ps_adjust_dialog',
			params: [{ function() { return html; } }],
			on_finish: () => {
				var $ = (id) => document.getElementById(id);
				var opts = { jpg: $('ip_jpg').checked, psd: $('ip_psd').checked, png: $('ip_png').checked, q: Math.max(0, Math.min(12, parseInt($('ip_q').value) || 5)) / 12,
					resize: $('ip_resize').checked, w: parseInt($('ip_w').value) || 1024, h: parseInt($('ip_h').value) || 1024, run: $('ip_run').checked ? actions[parseInt($('ip_action').value)] : null };
				if (!files.length) { alertify.error('Select the images to process.'); return; }
				this.each(files, async (file) => {
					if (opts.resize && (config.WIDTH > opts.w || config.HEIGHT > opts.h)) {
						var k = Math.min(opts.w / config.WIDTH, opts.h / config.HEIGHT);
						await app.GUI.modules['ps/commands'].Size.apply_image_size(Math.round(config.WIDTH * k), Math.round(config.HEIGHT * k), 'Bicubic Automatic');
						await wait(200);
					}
					if (opts.run) {
						A.selected = { set: opts.run.si, action: opts.run.ai };
						await A.play();
					}
					var base = file.name.replace(/\.[^.]+$/, '');
					if (opts.jpg) await this.save(base, 'JPEG', opts.q);
					if (opts.png) await this.save(base, 'PNG');
					if (opts.psd) await this.save(base, 'PSD');
					await wait(200);
					await this.close_current();
				});
			},
		});
		document.getElementById('ip_choose').addEventListener('click', async () => {
			files = await pick(true);
			document.getElementById('ip_count').textContent = files.length ? files.length + ' file' + (files.length == 1 ? '' : 's') : 'No files';
		});
	}
}

export default Ps_batch_class;
