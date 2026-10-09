/*
 * pshot - smaller CS6 commands: Define Custom Shape, Purge Undo / Clipboard,
 * Fit Image, Flatten All Layer Effects / Masks, Load Files into Stack, Open as
 * Smart Object, Lock Layers, Hide All Effects, Scale Effects, Global Light,
 * View > Show > All / None.
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';
import { define as define_shape } from './custom-shapes.js';
import { open_document, file_to_layers } from './document.js';
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

class Ps_extras_class {

	define_custom_shape() {
		var path = app.GUI.Ps_workspace.Paths.active();
		if (!path || !path.subpaths.length) {
			alertify.error('Could not complete the Define Custom Shape command because there is no active path.');
			return;
		}
		var POP = new Dialog_class();
		POP.show({
			title: 'Shape Name',
			params: [{ name: 'name', title: 'Name:', value: 'Shape ' + (Date.now() % 1000) }],
			on_finish: (params) => {
				define_shape(params.name || 'Shape', JSON.parse(JSON.stringify(path.subpaths)));
				app.GUI.Ps_workspace.status_message('Custom shape "' + params.name + '" defined (Custom Shape Tool).');
			},
		});
	}

	/**
	 * Edit > Purge > Undo: the states after the current one can no longer be redone
	 */
	purge_undo() {
		app.State.action_history.length = app.State.action_history_index;
		app.GUI.Ps_workspace.render_history();
	}

	purge_clipboard() {
		var C = app.GUI.modules['ps/commands'];
		C.clipboard = null;
		C.clipboard_internal_only = false;
		app.GUI.Ps_workspace.status_message('Clipboard purged.');
	}

	/**
	 * File > Automate > Fit Image
	 */
	fit_image() {
		var POP = new Dialog_class();
		POP.show({
			title: 'Fit Image',
			params: [
				{ title: 'Constrain Within' },
				{ name: 'w', title: 'Width:', value: config.WIDTH },
				{ name: 'h', title: 'Height:', value: config.HEIGHT },
				{ name: 'no_enlarge', title: "Don't Enlarge", value: true },
			],
			on_finish: (params) => {
				var w = Math.max(1, parseInt(params.w) || config.WIDTH), h = Math.max(1, parseInt(params.h) || config.HEIGHT);
				var k = Math.min(w / config.WIDTH, h / config.HEIGHT);
				if (params.no_enlarge && k >= 1) return;
				app.GUI.modules['ps/commands'].Size.apply_image_size(Math.max(1, Math.round(config.WIDTH * k)), Math.max(1, Math.round(config.HEIGHT * k)), 'Bicubic Automatic');
			},
		});
	}

	/**
	 * File > Scripts > Flatten All Layer Effects: styles become pixels
	 */
	async flatten_all_effects() {
		var Styles = app.GUI.Ps_workspace.Styles;
		var actions = [];
		for (var l of config.layers) {
			if (!Styles.has(l) || l.type == 'ps_group' || l.type == 'ps_adjust') continue;
			var c = app.Layers.convert_layer_to_canvas(l.id, false, false);
			actions.push(new app.Actions.Update_layer_action(l.id, {
				type: 'image', x: 0, y: 0, width: c.width, height: c.height, width_original: c.width, height_original: c.height, rotate: 0,
				ps_styles: {}, ps_fill: null, ps_mask: null, ps_vmask: null, ps_shape: null, render_function: null, is_vector: false, params: {}, data: null,
			}));
			actions.push(new app.Actions.Update_layer_image_action(c, l.id));
		}
		if (!actions.length) return;
		await app.State.do_action(new app.Actions.Bundle_action('flatten_effects', 'Flatten All Layer Effects', actions));
		app.GUI.GUI_layers.render_layers();
	}

	/**
	 * File > Scripts > Flatten All Masks: layer and vector masks are applied to the pixels
	 */
	async flatten_all_masks() {
		var Styles = app.GUI.Ps_workspace.Styles;
		var actions = [];
		for (var l of config.layers) {
			if (!(l.ps_mask || l.ps_vmask) || l.type == 'ps_group' || l.type == 'ps_adjust') continue;
			//render without effects, with the masks
			var styles = l.ps_styles, fill = l.ps_fill;
			l.ps_styles = null;
			l.ps_fill = null;
			var c = app.Layers.convert_layer_to_canvas(l.id, false, false);
			l.ps_styles = styles;
			l.ps_fill = fill;
			actions.push(new app.Actions.Update_layer_action(l.id, {
				type: 'image', x: 0, y: 0, width: c.width, height: c.height, width_original: c.width, height_original: c.height, rotate: 0,
				ps_mask: null, ps_vmask: null, ps_shape: null, render_function: null, is_vector: false, params: {}, data: null,
			}));
			actions.push(new app.Actions.Update_layer_image_action(c, l.id));
		}
		if (!actions.length) return;
		await app.State.do_action(new app.Actions.Bundle_action('flatten_masks', 'Flatten All Masks', actions));
		app.GUI.GUI_layers.render_layers();
	}

	/**
	 * File > Scripts > Load Files into Stack: one document, a layer per file
	 */
	async load_files_into_stack() {
		var files = await pick(true);
		if (!files.length) return;
		var docs = [];
		for (var f of files) {
			var d = await file_to_layers(f);
			docs.push({ name: f.name.replace(/\.[^.]+$/, ''), doc: d });
		}
		var W = Math.max.apply(null, docs.map(d => d.doc.width)), H = Math.max.apply(null, docs.map(d => d.doc.height));
		app.GUI.Ps_workspace.Documents.add('Untitled-Stack');
		var actions = [new app.Actions.Prepare_canvas_action('undo'), new app.Actions.Update_config_action({ WIDTH: W, HEIGHT: H }), new app.Actions.Reset_layers_action()];
		var order = 1;
		for (var item of docs) {
			//one layer per file: the file's merged image (its first layer for single-layer files)
			var layers = item.doc.layers.filter(l => l.type == 'image');
			var settings = layers.length == 1 ? Object.assign({}, layers[0]) : null;
			if (!settings) {
				var c = document.createElement('canvas');
				c.width = item.doc.width;
				c.height = item.doc.height;
				var ctx = c.getContext('2d');
				for (var l of layers) {
					var img = new Image();
					img.src = l.data;
					await img.decode();
					ctx.globalAlpha = (l.opacity == null ? 100 : l.opacity) / 100;
					if (l.visible !== false) ctx.drawImage(img, l.x || 0, l.y || 0, l.width, l.height);
				}
				settings = { type: 'image', x: 0, y: 0, width: c.width, height: c.height, width_original: c.width, height_original: c.height, data: c.toDataURL('image/png') };
			}
			for (var k of Object.keys(settings)) if (k.startsWith('_')) delete settings[k];
			settings.name = item.name;
			settings.order = order++;
			actions.push(new app.Actions.Insert_layer_action(settings, false));
		}
		actions.push(new app.Actions.Prepare_canvas_action('do'));
		await app.State.do_action(new app.Actions.Bundle_action('open', 'Load Layers', actions));
		app.GUI.modules['ps/commands'].purge_histories();
		app.GUI.GUI_preview.zoom_auto(true);
		app.GUI.GUI_layers.render_layers();
	}

	/**
	 * File > Open as Smart Object
	 */
	async open_as_smart_object() {
		var files = await pick(false);
		if (!files.length) return;
		await open_document([files[0]]);
		var C = app.GUI.modules['ps/commands'];
		if (config.layers.filter(l => l.type != null).length > 1) await C.flatten_image();
		await C.convert_to_smart_object();
		await app.State.do_action(new app.Actions.Bundle_action('rename', 'Rename', [new app.Actions.Update_layer_action(config.layer.id, { name: files[0].name.replace(/\.[^.]+$/, '') })]));
		C.purge_histories();
		app.GUI.GUI_layers.render_layers();
	}

	/**
	 * Layer > Lock Layers... (the selected layers)
	 */
	lock_layers() {
		var Multi = app.GUI.Ps_workspace.Multi;
		var layers = (Multi ? Multi.selected() : [config.layer]).filter(Boolean);
		if (!layers.length) return;
		var cur = layers[0].ps_lock || {};
		var POP = new Dialog_class();
		POP.show({
			title: 'Lock All Layers in Group',
			params: [
				{ title: 'Lock:' },
				{ name: 'transparent', title: 'Transparency', value: !!cur.transparent },
				{ name: 'image', title: 'Image', value: !!cur.image },
				{ name: 'position', title: 'Position', value: !!cur.position },
				{ name: 'all', title: 'All', value: !!cur.all },
			],
			on_finish: (p) => {
				var lock = { transparent: !!p.transparent, image: !!p.image, position: !!p.position, all: !!p.all };
				app.State.do_action(new app.Actions.Bundle_action('lock', 'Lock Layers', layers.map(l => new app.Actions.Update_layer_action(l.id, { ps_lock: Object.assign({}, lock) }))))
					.then(() => app.GUI.GUI_layers.render_layers());
			},
		});
	}

	/**
	 * Layer > Layer Style > Hide All Effects / Show All Effects (document-wide)
	 */
	toggle_all_effects() {
		var hide = !config.ps_fx_hidden;
		app.State.do_action(new app.Actions.Bundle_action('effects', hide ? 'Hide All Effects' : 'Show All Effects', [new app.Actions.Update_config_action({ ps_fx_hidden: hide })]))
			.then(() => { config.need_render = true; app.GUI.GUI_layers.render_layers(); });
	}

	effects_label() {
		return config.ps_fx_hidden ? 'Show All Effects' : 'Hide All Effects';
	}

	/**
	 * Layer > Layer Style > Scale Effects...
	 */
	scale_effects() {
		var l = config.layer;
		if (!l || !app.GUI.Ps_workspace.Styles.has(l)) return;
		var POP = new Dialog_class();
		POP.show({
			title: 'Scale Layer Effects',
			params: [{ name: 'scale', title: 'Scale:', value: 100, range: [1, 1000] }],
			on_finish: (p) => {
				var k = Math.max(1, parseFloat(p.scale) || 100) / 100;
				var styles = JSON.parse(JSON.stringify(l.ps_styles));
				for (var key in styles) {
					var e = styles[key];
					for (var f of ['size', 'distance', 'soften']) if (typeof e[f] == 'number') e[f] = Math.round(e[f] * k * 10) / 10;
					if (typeof e.scale == 'number') e.scale = Math.round(e.scale * k);
					if (typeof e.texture_scale == 'number') e.texture_scale = Math.round(e.texture_scale * k);
				}
				app.State.do_action(new app.Actions.Bundle_action('layer_style', 'Scale Effects', [new app.Actions.Update_layer_action(l.id, { ps_styles: styles })]));
			},
		});
	}

	/**
	 * Layer > Layer Style > Global Light: the light angle / altitude of every
	 * shadow and bevel in the document
	 */
	global_light() {
		var g = config.ps_global_light || { angle: 120, altitude: 30 };
		var POP = new Dialog_class();
		POP.show({
			title: 'Global Light',
			params: [{ name: 'angle', title: 'Angle:', value: g.angle, range: [-180, 180] }, { name: 'altitude', title: 'Altitude:', value: g.altitude, range: [0, 90] }],
			on_finish: (p) => {
				var angle = parseFloat(p.angle) || 0, altitude = Math.max(0, Math.min(90, parseFloat(p.altitude) || 0));
				var actions = [new app.Actions.Update_config_action({ ps_global_light: { angle: angle, altitude: altitude } })];
				for (var l of config.layers) {
					if (!l.ps_styles) continue;
					var styles = JSON.parse(JSON.stringify(l.ps_styles)), changed = false;
					for (var key of ['drop_shadow', 'inner_shadow', 'bevel']) {
						if (styles[key]) { styles[key].angle = angle; changed = true; }
					}
					if (styles.bevel) styles.bevel.altitude = altitude;
					if (changed) actions.push(new app.Actions.Update_layer_action(l.id, { ps_styles: styles }));
				}
				app.State.do_action(new app.Actions.Bundle_action('global_light', 'Global Light', actions));
			},
		});
	}

	/**
	 * View > Show > All / None (the extras)
	 */
	show_extras(on) {
		var ws = app.GUI.Ps_workspace;
		if (ws.extras != on) app.GUI.modules['ps/commands'].toggle_extras();
	}

	/**
	 * Image > Analysis > Ruler Tool / Count Tool
	 */
	/**
	 * View > Print Size: the document at its printed size (Screen Resolution 72 ppi)
	 */
	print_size() {
		var ppi = app.GUI.Ps_workspace.Documents.current().ppi || 72;
		app.GUI.GUI_preview.zoom(72 / ppi * 100);
	}

	/**
	 * Type > Update All Text Layers: re-lays out every text layer
	 */
	update_text_layers() {
		config.layers.forEach(l => { if (l.type == 'text') { delete l._ps_warp_cache; delete l._ps_aa_cache; } });
		config.need_render = true;
		app.GUI.Ps_workspace.status_message('Text layers updated.');
	}

	/**
	 * fonts the browser does not have (rendered with a fallback instead)
	 */
	font_missing(family) {
		var ctx = this._font_ctx || (this._font_ctx = document.createElement('canvas').getContext('2d'));
		var text = 'mmmmmmmmmmlli10WQ@';
		return ['monospace', 'serif', 'sans-serif'].every((base) => {
			ctx.font = '72px ' + base;
			var w0 = ctx.measureText(text).width;
			ctx.font = '72px "' + family + '", ' + base;
			return ctx.measureText(text).width == w0;
		});
	}

	/**
	 * Type > Replace All Missing Fonts: missing fonts become the default font (Arial)
	 */
	async replace_missing_fonts() {
		var actions = [], missing = new Set();
		for (var l of config.layers) {
			if (l.type != 'text' || !Array.isArray(l.data)) continue;
			var changed = false;
			var data = l.data.map(line => line.map(span => {
				var fam = span.meta && span.meta.family;
				if (fam && !['monospace', 'serif', 'sans-serif'].includes(fam) && this.font_missing(fam)) {
					missing.add(fam);
					changed = true;
					return Object.assign({}, span, { meta: Object.assign({}, span.meta, { family: 'Arial' }) });
				}
				return span;
			}));
			if (changed) actions.push(new app.Actions.Update_layer_action(l.id, { data: data }));
		}
		if (!actions.length) {
			app.GUI.Ps_workspace.status_message('There are no missing fonts.');
			return;
		}
		await app.State.do_action(new app.Actions.Bundle_action('replace_fonts', 'Replace All Missing Fonts', actions));
		app.GUI.Ps_workspace.status_message('Replaced ' + Array.from(missing).join(', ') + ' with Arial.');
	}

	/**
	 * Edit > Find and Replace Text: Change All in the text layers (within each style run)
	 */
	find_replace_text() {
		var POP = new Dialog_class();
		var s = this.find_state || { find: '', change: '', all: true, case: false, whole: false };
		POP.show({
			title: 'Find and Replace Text',
			params: [
				{ name: 'find', title: 'Find What:', value: s.find },
				{ name: 'change', title: 'Change To:', value: s.change },
				{ name: 'all', title: 'Search All Layers', value: s.all },
				{ name: 'case', title: 'Case Sensitive', value: s.case },
				{ name: 'whole', title: 'Whole Word Only', value: s.whole },
			],
			on_finish: (p) => {
				this.find_state = p;
				this.replace_all_text(p);
			},
		});
	}

	async replace_all_text(p) {
		if (!p.find) return;
		var esc = String(p.find).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		var re = new RegExp(p.whole ? '\\b' + esc + '\\b' : esc, p.case ? 'g' : 'gi');
		var layers = p.all ? config.layers : [config.layer];
		var actions = [], count = 0;
		for (var l of layers) {
			if (!l || l.type != 'text' || !Array.isArray(l.data)) continue;
			var changed = false;
			var data = l.data.map(line => line.map(span => {
				var hits = (span.text.match(re) || []).length;
				if (!hits) return span;
				count += hits;
				changed = true;
				return Object.assign({}, span, { text: span.text.replace(re, () => p.change) });
			}));
			if (changed) actions.push(new app.Actions.Update_layer_action(l.id, { data: data }));
		}
		if (actions.length) {
			await app.State.do_action(new app.Actions.Bundle_action('find_replace', 'Replace All Text', actions));
		}
		alertify.success('Search completed. ' + count + ' replacement' + (count == 1 ? '' : 's') + ' made.');
	}

	/**
	 * Help > System Info
	 */
	system_info() {
		var gl = document.createElement('canvas').getContext('webgl');
		var dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
		var lines = [
			'pshot version: ' + (typeof VERSION != 'undefined' ? VERSION : 'dev'),
			'Operating System: ' + (navigator.userAgentData && navigator.userAgentData.platform || navigator.platform),
			'Browser: ' + navigator.userAgent,
			'Number of logical processors: ' + (navigator.hardwareConcurrency || 'unknown'),
			'Device memory: ' + (navigator.deviceMemory ? navigator.deviceMemory + ' GB' : 'unknown'),
			'Language: ' + navigator.language,
			'Display: ' + screen.width + 'x' + screen.height + ', ' + screen.colorDepth + '-bit, device pixel ratio ' + window.devicePixelRatio,
			'Graphics processor: ' + (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : (gl ? gl.getParameter(gl.RENDERER) : 'WebGL unavailable')),
			'Open documents: ' + app.GUI.Ps_workspace.Documents.docs.length,
			'Current document: ' + config.WIDTH + ' x ' + config.HEIGHT + ' px, ' + config.layers.length + ' layers',
			'History states: ' + app.State.action_history.length,
		];
		var POP = new Dialog_class();
		POP.show({
			title: 'System Info',
			params: [{ html: '<textarea readonly style="width:560px;height:240px;font-family:monospace;font-size:11px">' + lines.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</textarea>' }],
		});
	}

	select_tool(id) {
		var ws = app.GUI.Ps_workspace;
		ws.groups.forEach((g, gi) => g.members.forEach((m, mi) => { if (m.id == id) ws.select_member(gi, mi); }));
	}
}

export default Ps_extras_class;
