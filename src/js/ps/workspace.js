/*
 * pshot - Photoshop CS6 workspace: toolbox, panel dock, icon strip, history,
 * document tab, status bar, screen modes. Built on top of miniPaint's GUI.
 */

import app from './../app.js';
import config from './../config.js';
import Helper_class from './../libs/helpers.js';
import Dialog_class from './../libs/popup.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import GUI_colors_class from './../core/gui/gui-colors.js';
import { groups } from './tools-def.js';
import { ADJUSTMENTS, run_target } from './adjustments-def.js';
import { show_popup_menu, close_popup_menu, prompt_name } from './popup-menu.js';
import menuDefinition from './../config-menu.js';
import Ps_keymap_class from './keymap.js';
import Ps_options_bar_class from './options-bar.js';
import Ps_documents_class from './documents.js';
import Ps_selection_class from './selection.js';
import Ps_mask_class from './mask.js';
import Ps_transform_class from './transform.js';
import Ps_groups_class from './groups.js';
import Ps_styles_class from './styles.js';
import Ps_adjustment_layers_class from './adjustment-layers.js';
import Ps_warp_text_class from './warp-text.js';
import Ps_text_aa_class from './text-aa.js';
import Ps_clone_source_class from './clone-source.js';
import Ps_measure_log_class from './measure-log.js';
import Ps_brush_presets_class from './brush-presets.js';
import Ps_tool_presets_class from './tool-presets.js';
import Ps_proof_class from './proof.js';
import Ps_auto_align_class from './auto-align.js';
import Ps_automate_class from './automate.js';
import Ps_import_export_class from './import-export.js';
import Ps_fill_layers_class from './fill-layers.js';
import Ps_slices_class from './slices.js';
import Ps_type_styles_class from './type-styles.js';
import Ps_preset_manager_class from './preset-manager.js';
import Ps_calculations_class from './calculations.js';
import Ps_preferences_class from './preferences.js';
import Ps_shortcuts_class from './shortcuts.js';
import Ps_blur_gallery_class from './blur-gallery.js';
import Ps_notes_class from './notes.js';
import Ps_puppet_warp_class from './puppet-warp.js';
import Ps_filter_gallery_class from './filter-gallery.js';
import Ps_lighting_effects_class from './lighting-effects.js';
import Ps_vector_mask_class from './vector-mask.js';
import Ps_shape_layers_class from './shape-layers.js';
import Ps_smart_filters_class from './smart-filters.js';
import Ps_batch_class from './batch.js';
import Ps_extras_class from './extras.js';
import Ps_guides_class from './guides.js';
import Ps_multi_select_class from './multi-select.js';
import Ps_paths_class from './paths.js';
import Ps_alpha_channels_class from './alpha-channels.js';
import Ps_brush_panel_class from './brush-panel.js';
import Ps_layer_comps_class from './layer-comps.js';
import Ps_actions_panel_class from './actions-panel.js';
import { install_pixel_layer_guard } from './pixel-layer.js';
import { install_move_selection } from './move-selection.js';
import { render_character, render_paragraph } from './type-panels.js';
import { install_panel_context_menus, delete_state } from './panel-context.js';
import Ps_float_windows_class from './float-windows.js';
import { cmyk_safe, channel_value } from './proof.js';
import Ps_color_management_class from './color-management.js';
import Ps_variables_class from './variables.js';
import Ps_script_events_class from './script-events.js';
import { install_shape_modes } from './shape-modes.js';
import Ps_channel_view_class from './channel-view.js';

const PANEL_TITLES = {
	color: 'Color', swatches: 'Swatches', adjustments: 'Adjustments', styles: 'Styles',
	layers: 'Layers', channels: 'Channels', paths: 'Paths',
	history: 'History', properties: 'Properties', navigator: 'Navigator', info: 'Info',
	character: 'Character', paragraph: 'Paragraph', brush: 'Brush', comps: 'Layer Comps', histogram: 'Histogram', actions: 'Actions', notes: 'Notes', clone_source: 'Clone Source', brush_presets: 'Brush Presets', tool_presets: 'Tool Presets', char_styles: 'Character Styles', para_styles: 'Paragraph Styles',
};

const STRIP_ICONS = {
	char_styles: '<svg viewBox="0 0 18 18" width="18" height="18"><path d="M2 14L5.5 4h1L10 14M3.3 10.5h5.4" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M11 6h5M11 9h5M11 12h5" stroke="currentColor" stroke-width="1.2"/></svg>',
	para_styles: '<svg viewBox="0 0 18 18" width="18" height="18"><path d="M8 3h6M10 3v12M8 3v12M8 3a3 3 0 0 0 0 6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2 12h4M2 15h4" stroke="currentColor" stroke-width="1.2"/></svg>',
	tool_presets: '<svg viewBox="0 0 18 18" width="18" height="18"><path d="M3 3h7l5 5-7 7-5-5z" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="6.5" cy="6.5" r="1.4" fill="currentColor"/></svg>',
	brush_presets: '<svg viewBox="0 0 18 18" width="18" height="18"><path d="M14 2.5c.5.5-4 6.3-5.6 7.6L7 8.7C8.2 7 13.5 2 14 2.5zM6.4 9.6c-1.4 0-2.5.9-2.7 2.3-.2 1.3-.7 1.9-1.7 2.3 2.2 1.1 5.4.5 5.9-1.8.2-.9-.3-2-1.5-2.8z" fill="currentColor"/><path d="M11 12.5h5M11 15h5" stroke="currentColor" stroke-width="1.2"/></svg>',
	clone_source: '<svg viewBox="0 0 18 18" width="18" height="18"><path d="M5 2.5h4v3c0 1.2-1.2 1.6-1.2 2.8h3.7v2.5H2.5V8.3h3.7C6.2 7.1 5 6.7 5 5.5z" fill="currentColor"/><path d="M10.5 12h5v3.5h-5z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
	notes: '<svg viewBox="0 0 18 18" width="18" height="18"><path d="M3 2.5h9l3 3v10H3z M12 2.5v3h3M5.5 8h7M5.5 10.5h7M5.5 13h4.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
	actions: '<svg viewBox="0 0 18 18" width="18" height="18"><path d="M5 3l9 6-9 6z" fill="currentColor"/></svg>',
	histogram: '<svg viewBox="0 0 18 18" width="18" height="18"><path d="M2 15.5h14M3 15V11M5 15V7M7 15V4M9 15V6M11 15V9M13 15V8M15 15v-3" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
	comps: '<svg viewBox="0 0 18 18" width="18" height="18"><rect x="2.5" y="5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5 5V3h10.5v9.5h-2" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
	brush: '<svg viewBox="0 0 18 18" width="18" height="18"><path d="M15 2.5c.5.5-4.5 7-6.2 8.5l-1.6-1.6C8.6 7.6 14.5 2 15 2.5zM6.7 10.3c-1.6 0-2.8 1-3 2.6-.2 1.5-.8 2.1-1.9 2.6 2.5 1.2 6.1.5 6.6-2 .2-1-.3-2.2-1.7-3.2z" fill="currentColor"/></svg>',
	character: '<svg viewBox="0 0 18 18" width="18" height="18"><path d="M3 15L7.5 3h1L13 15M5 11h6" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
	paragraph: '<svg viewBox="0 0 18 18" width="18" height="18"><path d="M9 3h5M11 3v12M9 3v12M9 3a3 3 0 0 0 0 6" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
	history: '<svg viewBox="0 0 18 18" width="18" height="18"><rect x="2.5" y="3" width="10" height="12" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5 6h5M5 9h5M5 12h5" stroke="currentColor" stroke-width="1.2"/><path d="M14.5 4v10" stroke="currentColor" stroke-width="1.2"/></svg>',
	properties: '<svg viewBox="0 0 18 18" width="18" height="18"><path d="M3 4.5h12M3 9h12M3 13.5h12" stroke="currentColor" stroke-width="1.2"/><circle cx="6" cy="4.5" r="1.6" fill="currentColor"/><circle cx="12" cy="9" r="1.6" fill="currentColor"/><circle cx="8" cy="13.5" r="1.6" fill="currentColor"/></svg>',
	navigator: '<svg viewBox="0 0 18 18" width="18" height="18"><rect x="2" y="3.5" width="14" height="11" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="6" y="6.5" width="6" height="5" fill="none" stroke="#c03030" stroke-width="1.4"/></svg>',
	info: '<svg viewBox="0 0 18 18" width="18" height="18"><circle cx="9" cy="9" r="6.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M9 8v5" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="5.6" r="1" fill="currentColor"/></svg>',
};

// CS6 "Default" swatch set (approximation of the first rows of Photoshop's default swatches)
const SWATCHES = [
	'#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff',
	'#ffffff', '#ebebeb', '#d6d6d6', '#c2c2c2', '#adadad', '#999999', '#858585', '#707070', '#5c5c5c', '#474747', '#333333', '#1f1f1f', '#000000',
	'#ed1c24', '#f26522', '#f7941d', '#fff200', '#8dc63f', '#39b54a', '#00a651', '#00a99d', '#00aeef', '#0072bc', '#0054a6', '#2e3192', '#662d91', '#92278f', '#ec008c', '#ed145b',
	'#f26c4f', '#f68e56', '#fbaf5d', '#fff568', '#acd373', '#7cc576', '#3bb878', '#1abbb4', '#00bff3', '#438ccb', '#5574b9', '#605ca8', '#8560a8', '#a864a8', '#f06eaa', '#f26d7d',
	'#f7977a', '#f9ad81', '#fdc68a', '#fff79a', '#c4df9b', '#a3d39c', '#82ca9d', '#7bcdc8', '#6ecff6', '#7da7d9', '#8393ca', '#8781bd', '#a187be', '#bd8cbf', '#f49ac1', '#f5989d',
	'#9e0b0f', '#a0410d', '#a36209', '#aba000', '#598527', '#1a7b30', '#007236', '#00746b', '#0076a3', '#004b80', '#003471', '#1b1464', '#440e62', '#630460', '#9e005d', '#9e0039',
	'#790000', '#7b2e00', '#7d4900', '#827b00', '#406618', '#005e20', '#005826', '#005952', '#005b7f', '#003663', '#002157', '#0d004c', '#32004b', '#4b0049', '#7b0046', '#7a0026',
	'#c7b299', '#998675', '#736357', '#534741', '#37302d', '#c69c6d', '#a67c52', '#8c6239', '#754c24', '#603913',
];

class Ps_workspace_class {

	constructor() {
		this.Helper = new Helper_class();
		this.groups = groups.map(g => ({ separator: !!g.separator, members: g.members, current: 0 }));
		this.extras = true;
		this.grid_before_extras = false;
		this.screen_mode = 'standard';
		this.Selection = new Ps_selection_class();
		this.Mask = new Ps_mask_class();
		this.Transform = new Ps_transform_class();
		this.Groups = new Ps_groups_class();
		this.Multi = new Ps_multi_select_class();
		this.Paths = new Ps_paths_class();
		this.Alpha = new Ps_alpha_channels_class();
		this.Brush_panel = new Ps_brush_panel_class();
		this.Comps = new Ps_layer_comps_class();
		this.Float = new Ps_float_windows_class();
		this.Variables = new Ps_variables_class();
		this.Script_events = new Ps_script_events_class();
		this.Actions = new Ps_actions_panel_class();
		this.Styles = new Ps_styles_class();
		this.Adjustment_layers = new Ps_adjustment_layers_class();
		this.Warp_text = new Ps_warp_text_class();
		this.Text_aa = new Ps_text_aa_class();
		this.Clone_source = new Ps_clone_source_class();
		this.Measure_log = new Ps_measure_log_class();
		this.Brush_presets = new Ps_brush_presets_class();
		this.Tool_presets = new Ps_tool_presets_class();
		this.Proof = new Ps_proof_class();
		this.Channel_view = new Ps_channel_view_class();
		this.Color = new Ps_color_management_class();
		this.Auto_align = new Ps_auto_align_class();
		this.Automate = new Ps_automate_class();
		this.Import_export = new Ps_import_export_class();
		this.Fill_layers = new Ps_fill_layers_class();
		this.Slices = new Ps_slices_class();
		this.Type_styles = new Ps_type_styles_class();
		this.Preset_manager = new Ps_preset_manager_class();
		this.Calculations = new Ps_calculations_class();
		this.Preferences = new Ps_preferences_class();
		this.Shortcuts = new Ps_shortcuts_class(this);
		this.Blur_gallery = new Ps_blur_gallery_class();
		this.Notes = new Ps_notes_class();
		this.Puppet = new Ps_puppet_warp_class();
		this.Filter_gallery = new Ps_filter_gallery_class();
		this.Lighting = new Ps_lighting_effects_class();
		this.Vector_mask = new Ps_vector_mask_class();
		this.Shapes = new Ps_shape_layers_class();
		this.Smart_filters = new Ps_smart_filters_class();
		this.Batch = new Ps_batch_class();
		this.Extras = new Ps_extras_class();
		this.Guides = new Ps_guides_class();
		this.Documents = new Ps_documents_class();
		this.Documents.init();
		this.two_column = false;
		this.strip_panels = ['history', 'properties'];
		this.open_popout = null;
		this.hidden_by_tab = false;
		this.status_message_timer = null;
		this.last_history_signature = null;
		this.Keymap = new Ps_keymap_class(this);
		this.Options_bar = new Ps_options_bar_class(this);
	}

	// =================================================================
	// init
	// =================================================================

	init() {
		this.init_dock();
		this.init_iconstrip();
		this.init_color_panel();
		this.render_swatches();
		this.render_adjustments_panel();
		this.render_styles_panel();
		this.render_paths_panel();
		this.init_toolbox_extras();
		this.init_options_bar();
		this.init_statusbar();
		this.hook_state();
		this.init_info_panel();
		this.Shortcuts.install();
		this.Keymap.install();
		this.Guides.install();
		this.Multi.install_move();
		this.Groups.install_group_move();
		install_pixel_layer_guard();
		install_move_selection();
		install_shape_modes();
		this.install_alt_drag_duplicate();
		this.install_alt_eyedropper();
		this.install_ctrl_move();
		this.render_document_tab();
		this.render_history();
		this.render_channels();
		this.Preferences.install();
		this.Notes.install();
		this.Mask.install();
		this.Clone_source.install();
		this.Tool_presets.install();
		this.Slices.install();
		install_panel_context_menus();
		setTimeout(() => this.Script_events.install(), 0);
		this.snapshot_tool_defaults();

		setInterval(() => this.tick(), 250);
		window.addEventListener('resize', () => this.relayout());
		this.relayout();
		//View > Show > Pixel Grid: lines between pixels from 500% zoom (CS6)
		this.Selection.overlays = this.Selection.overlays || [];
		this.Selection.overlays.push({
			active: () => this.pixel_grid !== false && config.ZOOM >= 5,
			draw: (ctx, scale) => {
				var t = ctx.getTransform(), cw = ctx.canvas.width, ch = ctx.canvas.height;
				var x0 = Math.max(0, Math.floor(-t.e / t.a)), x1 = Math.min(config.WIDTH, Math.ceil((cw - t.e) / t.a));
				var y0 = Math.max(0, Math.floor(-t.f / t.d)), y1 = Math.min(config.HEIGHT, Math.ceil((ch - t.f) / t.d));
				ctx.save();
				ctx.lineWidth = 1 / scale;
				ctx.strokeStyle = 'rgba(128,128,128,0.45)';
				ctx.beginPath();
				for (var x = x0; x <= x1; x++) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
				for (var y = y0; y <= y1; y++) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
				ctx.stroke();
				ctx.restore();
			},
		});
		//View > Show > Layer Edges: the selected layer's pixel bounds in blue
		this.Selection.overlays.push({
			active: () => this.layer_edges === true && config.layer && config.layer.type != 'ps_adjust',
			draw: (ctx, scale) => {
				var l = config.layer, c = l._ps_edges;
				if (!c || c.link !== l.link || c.key != [l.x, l.y, l.width, l.height, l.rotate, JSON.stringify(l.data)].join()) {
					c = l._ps_edges = { link: l.link, key: [l.x, l.y, l.width, l.height, l.rotate, JSON.stringify(l.data)].join(), box: this.Multi.bounds(l) };
				}
				ctx.save();
				ctx.lineWidth = 1 / scale;
				ctx.strokeStyle = '#3c8cff';
				ctx.strokeRect(c.box.x, c.box.y, c.box.width, c.box.height);
				ctx.restore();
			},
		});
		//the startup document opens at the largest CS6 zoom step that fits
		setTimeout(() => {
			if (app.State.action_history.length == 0) app.GUI.GUI_preview.zoom_auto(true);
		}, 300);
	}

	/**
	 * layout changed without a window resize: miniPaint caches the canvas
	 * offset and size, so recompute them
	 */
	relayout() {
		requestAnimationFrame(() => {
			app.GUI.prepare_canvas();
			config.need_render = true;
		});
	}

	tick() {
		this.enforce_mode();
		this.render_document_tab();
		this.render_statusbar();
		this.render_fg_bg();
		this.Float.update_views();
		var signature = app.State.action_history_index + ':' + app.State.action_history.length;
		if (signature !== this.last_history_signature) {
			this.last_history_signature = signature;
			this.Groups.normalize();
			this.render_history();
			app.GUI.GUI_layers.render_layers();
			this.render_channels();
			if (this.open_popout == 'comps') this.Comps.render();
			if (this.open_popout == 'notes') this.Notes.render();
			if (this.open_popout == 'histogram') this.render_histogram_panel();
			if (this.paths_signature !== config.ps_paths) {
				this.paths_signature = config.ps_paths;
				this.Paths.render_panel();
				this.Selection.draw_overlay();
			}
		}
	}

	// =================================================================
	// toolbox
	// =================================================================

	render_toolbox() {
		var container = document.getElementById('tools_container');
		container.innerHTML = '';
		this.groups.forEach((group, gi) => {
			if (group.separator) {
				var sep = document.createElement('div');
				sep.className = 'ps_tool_separator';
				container.appendChild(sep);
			}
			var button = document.createElement('button');
			button.type = 'button';
			button.className = 'ps_tool';
			button.dataset.group = gi;
			if (group.members.length > 1) {
				button.classList.add('has_flyout');
			}
			container.appendChild(button);
			this.render_group_button(gi);

			var hold_timer = null;
			button.addEventListener('mousedown', (event) => {
				if (event.button == 2) {
					return;
				}
				if (group.members.length > 1) {
					hold_timer = setTimeout(() => {
						hold_timer = null;
						this.show_flyout(gi);
					}, 350);
				}
			});
			button.addEventListener('mouseup', (event) => {
				if (event.button == 2) {
					return;
				}
				if (hold_timer !== null || group.members.length == 1) {
					clearTimeout(hold_timer);
					hold_timer = null;
					this.select_member(gi, group.current);
				}
			});
			button.addEventListener('mouseleave', () => {
				if (hold_timer !== null) {
					clearTimeout(hold_timer);
					hold_timer = null;
				}
			});
			button.addEventListener('contextmenu', (event) => {
				event.preventDefault();
				if (group.members.length > 1) {
					this.show_flyout(gi);
				}
			});
		});
	}

	render_group_button(gi) {
		var group = this.groups[gi];
		var member = group.members[group.current];
		var button = document.querySelector('#tools_container .ps_tool[data-group="' + gi + '"]');
		if (!button) {
			return;
		}
		button.innerHTML = '<svg viewBox="0 0 18 18" width="18" height="18">' + member.icon + '</svg>';
		button.title = member.name + (member.key ? ' (' + member.key + ')' : '');
		button.classList.toggle('disabled', !member.tool);
	}

	show_flyout(gi) {
		var group = this.groups[gi];
		var button = document.querySelector('#tools_container .ps_tool[data-group="' + gi + '"]');
		var items = group.members.map((m, mi) => ({
			name: m.name,
			shortcut: m.key,
			icon: m.icon,
			checked: mi == group.current,
			action: m.tool ? () => this.select_member(gi, mi) : null,
		}));
		show_popup_menu(button, items, {placement: 'right', className: 'ps_flyout', mark: '&#9632;'});
	}

	/**
	 * Rotate View: the document window's rotation in degrees (view only)
	 */
	set_view_rotation(deg) {
		deg = ((deg % 360) + 540) % 360 - 180;
		if (Math.abs(deg) < 0.05) deg = 0;
		this.view_rotation = deg;
		var wrapper = document.getElementById('canvas_wrapper');
		wrapper.style.transform = deg ? 'rotate(' + deg + 'deg)' : '';
		app.GUI.check_canvas_offset();
		config.need_render = true;
		this.Selection.draw_overlay();
		if (this.Options_bar) this.Options_bar.update_readouts();
		var field = document.getElementById('ps_rotation_angle');
		if (field && document.activeElement !== field) field.value = Math.round(deg * 10) / 10 + '\u00b0';
	}

	/**
	 * activates a CS6 tool (group index, member index)
	 */
	select_member(gi, mi) {
		if (this.Transform && this.Transform.active()) {
			this.Transform.commit();
		}
		var group = this.groups[gi];
		var member = group.members[mi];
		group.current = mi;
		this.render_group_button(gi);
		if (!member.tool) {
			this.status_message(member.name + ' is not available in pshot yet.');
			this.highlight_active();
			return;
		}
		//CS6: every tool keeps its own options, also tools that share one engine
		//(retouch, dodge/burn, selection...): remember the old member's, restore this one's
		var prev = this.active_member;
		var tool_config = config.TOOLS.find(t => t.name == member.tool);
		if (prev && prev !== member) {
			var prev_config = config.TOOLS.find(t => t.name == prev.tool);
			if (prev_config && this.shared_tool(prev.tool)) {
				try { prev._opts = JSON.parse(JSON.stringify(prev_config.attributes)); } catch (e) { prev._opts = null; }
			}
		}
		if (tool_config && prev !== member && this.shared_tool(member.tool)) {
			this.tool_defaults = this.tool_defaults || {};
			var base = member._opts || this.tool_defaults[member.tool];
			if (base) this.restore_attributes(tool_config.attributes, base);
		}
		this.active_member = member;
		if (member.preset && tool_config) {
			for (var key in member.preset) {
				var attr = tool_config.attributes[key];
				if (attr !== null && typeof attr == 'object' && 'value' in attr) {
					attr.value = member.preset[key];
				}
				else {
					tool_config.attributes[key] = member.preset[key];
				}
			}
		}
		this.sync_shape_colors(tool_config);
		//a painting cursor preference must not stay on the next tool
		document.getElementById('main_wrapper').style.cursor = '';
		app.GUI.GUI_tools.activate_tool(member.tool).then(() => {
			//re-render options when only the preset changed
			app.GUI.GUI_tools.show_action_attributes();
		});
		this.highlight_active();
	}

	/**
	 * saved (JSON) tool options back into a tool: { value, values() } attributes
	 * keep their (function) values list, only the value is restored
	 */
	restore_attributes(attrs, saved) {
		saved = JSON.parse(JSON.stringify(saved));
		for (var k in saved) {
			var cur = attrs[k], v = saved[k];
			if (cur !== null && typeof cur == 'object' && 'value' in cur && v !== null && typeof v == 'object' && 'value' in v) cur.value = v.value;
			else attrs[k] = v;
		}
	}

	/**
	 * a tool engine used by more than one toolbox member
	 */
	shared_tool(tool) {
		var n = 0;
		for (var g of this.groups) for (var m of g.members) if (m.tool == tool) n++;
		return n > 1;
	}

	/**
	 * the options every tool starts with (taken before anything is changed)
	 */
	snapshot_tool_defaults() {
		this.tool_defaults = {};
		for (var t of config.TOOLS) {
			try { this.tool_defaults[t.name] = JSON.parse(JSON.stringify(t.attributes)); } catch (e) { /* not cloneable */ }
		}
	}

	/**
	 * CS6 shapes and text use the foreground color
	 */
	sync_shape_colors(tool_config) {
		if (!tool_config) {
			return;
		}
		var attrs = tool_config.attributes;
		if ('fill_color' in attrs) {
			attrs.fill_color = config.COLOR;
		}
		if (tool_config.name == 'text' && typeof attrs.fill == 'string') {
			attrs.fill = config.COLOR;
		}
	}

	/**
	 * keyboard: letter selects the group's current tool, Shift+letter cycles the group
	 */
	select_by_key(letter, cycle) {
		var group_indexes = [];
		this.groups.forEach((g, gi) => {
			if (g.members.some(m => m.key == letter)) {
				group_indexes.push(gi);
			}
		});
		if (group_indexes.length == 0) {
			return false;
		}
		//H and R share a group but have their own letters
		var gi = group_indexes[0];
		var group = this.groups[gi];
		var candidates = group.members.map((m, i) => i).filter(i => group.members[i].key == letter && group.members[i].tool);
		if (candidates.length == 0) {
			var first = group.members.findIndex(m => m.key == letter);
			this.status_message(group.members[first].name + ' is not available in pshot yet.');
			return true;
		}
		var mi;
		if (group.members[group.current].key != letter || !group.members[group.current].tool) {
			mi = candidates[0];
		}
		else if (cycle) {
			var pos = candidates.indexOf(group.current);
			mi = candidates[(pos + 1) % candidates.length];
		}
		else {
			mi = group.current;
		}
		this.select_member(gi, mi);
		return true;
	}

	/**
	 * called from Activate_tool_action whenever the miniPaint tool changes
	 */
	on_tool_activated(key) {
		var current = this.active_member;
		if (!current || current.tool != key) {
			//tool changed from elsewhere (e.g. Select > All): find the matching CS6 tool
			for (var gi = 0; gi < this.groups.length; gi++) {
				var mi = this.groups[gi].members.findIndex(m => m.tool == key);
				if (mi >= 0) {
					this.groups[gi].current = mi;
					this.active_member = this.groups[gi].members[mi];
					this.render_group_button(gi);
					break;
				}
			}
		}
		this.highlight_active();
		this.render_tool_preset();
		this.Options_bar.render();
	}

	highlight_active() {
		var active = this.active_member;
		document.querySelectorAll('#tools_container .ps_tool').forEach((button) => {
			var group = this.groups[button.dataset.group];
			button.classList.toggle('active', !!active && group.members[group.current] === active);
		});
	}

	render_tool_preset() {
		var member = this.active_member;
		var el = document.getElementById('ps_tool_preset');
		if (member && el) {
			el.innerHTML = '<svg viewBox="0 0 18 18" width="18" height="18">' + member.icon + '</svg><span class="ps_caret">&#9662;</span>';
			el.title = 'Tool Preset picker - ' + member.name;
		}
		if (this.Tool_presets && this.Tool_presets.current_only) this.Tool_presets.render();
	}

	init_toolbox_extras() {
		document.getElementById('ps_toolbox_grip').addEventListener('click', () => {
			this.two_column = !this.two_column;
			document.getElementById('ps_toolbox').classList.toggle('two_column', this.two_column);
			this.relayout();
		});
		document.getElementById('ps_default_colors').addEventListener('click', () => this.default_colors());
		document.getElementById('ps_switch_colors').addEventListener('click', () => this.switch_colors());
		document.getElementById('ps_fg_color').addEventListener('click', () => this.open_color_picker('fg'));
		document.getElementById('ps_bg_color').addEventListener('click', () => this.open_color_picker('bg'));
		document.getElementById('ps_screenmode').addEventListener('click', () => this.cycle_screen_mode());
		document.getElementById('ps_quickmask').addEventListener('click', () => this.Selection.toggle_quick_mask());
		document.getElementById('ps_screenmode').addEventListener('contextmenu', (event) => {
			event.preventDefault();
			var modes = [['standard', 'Standard Screen Mode'], ['menu', 'Full Screen Mode With Menu Bar'], ['full', 'Full Screen Mode']];
			show_popup_menu(event.currentTarget, modes.map(m => ({
				name: m[1], shortcut: 'F', checked: this.screen_mode == m[0], action: () => this.set_screen_mode(m[0]),
			})), {placement: 'right', mark: '&#9632;'});
		});
		document.getElementById('ps_quickmask').innerHTML = '<svg viewBox="0 0 18 18" width="18" height="18"><rect x="2.5" y="3.5" width="13" height="11" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="9" cy="9" r="3.5" fill="currentColor"/></svg>';
		document.getElementById('ps_screenmode').innerHTML = '<svg viewBox="0 0 18 18" width="18" height="18"><rect x="2.5" y="3.5" width="13" height="11" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="5" y="6" width="8" height="6" fill="currentColor"/></svg>';
		document.getElementById('ps_default_colors').innerHTML = '<svg viewBox="0 0 12 12" width="11" height="11"><rect x="4.5" y="4.5" width="6" height="6" fill="#fff" stroke="#000" stroke-width="1"/><rect x="1.5" y="1.5" width="6" height="6" fill="#000" stroke="#fff" stroke-width="1"/></svg>';
		document.getElementById('ps_switch_colors').innerHTML = '<svg viewBox="0 0 12 12" width="11" height="11"><path d="M2 3.5h6.5V10M2 3.5l2-2M2 3.5l2 2M8.5 10l-2-2M8.5 10l2-2" fill="none" stroke="currentColor" stroke-width="1"/></svg>';
		this.render_fg_bg();
	}

	set_fg(hex) {
		app.GUI.GUI_colors.set_color({hex: hex});
		this.render_fg_bg();
	}

	default_colors() {
		config.BG_COLOR = '#ffffff';
		this.set_fg('#000000');
	}

	switch_colors() {
		var fg = config.COLOR;
		this.set_fg(config.BG_COLOR);
		config.BG_COLOR = fg;
		this.render_fg_bg();
	}

	/**
	 * Grayscale mode: the foreground/background colors stay gray; the Channels panel shows Gray
	 */
	enforce_mode() {
		if (config.ps_mode == 'Grayscale') {
			var gray = (hex) => {
				var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
				var v = Math.round(r * 0.299 + g * 0.587 + b * 0.114).toString(16).padStart(2, '0');
				return '#' + v + v + v;
			};
			if (config.COLOR && gray(config.COLOR) != config.COLOR.toLowerCase().substr(0, 7)) this.set_fg(gray(config.COLOR));
			if (config.BG_COLOR && gray(config.BG_COLOR) != config.BG_COLOR.toLowerCase().substr(0, 7)) config.BG_COLOR = gray(config.BG_COLOR);
		}
		if (config.ps_mode == 'CMYK') {
			//CS6: the color picker gives in-gamut colors in a CMYK document
			var safe = (hex) => {
				var c = cmyk_safe(parseInt(hex.substr(1, 2), 16), parseInt(hex.substr(3, 2), 16), parseInt(hex.substr(5, 2), 16));
				return '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
			};
			if (config.COLOR && config.COLOR[0] == '#' && safe(config.COLOR) != config.COLOR.toLowerCase().substr(0, 7)) this.set_fg(safe(config.COLOR));
			if (config.BG_COLOR && config.BG_COLOR[0] == '#' && safe(config.BG_COLOR) != config.BG_COLOR.toLowerCase().substr(0, 7)) config.BG_COLOR = safe(config.BG_COLOR);
		}
		if (this.channels_mode !== config.ps_mode) {
			this.channels_mode = config.ps_mode;
			this.render_channels(true);
		}
	}

	render_fg_bg() {
		var ramp = document.querySelector('canvas.ps_spectrum');
		if (ramp && this.ramp && this.ramp.mode == 'current' && this.ramp_colors != config.COLOR + config.BG_COLOR) this.draw_spectrum(ramp);
		var fg = document.getElementById('ps_fg_color');
		var bg = document.getElementById('ps_bg_color');
		if (fg.style.backgroundColor != config.COLOR) {
			fg.style.backgroundColor = config.COLOR;
		}
		bg.style.backgroundColor = config.BG_COLOR;
		var cfg = document.getElementById('ps_color_fg');
		if (cfg) {
			cfg.style.backgroundColor = config.COLOR;
			document.getElementById('ps_color_bg').style.backgroundColor = config.BG_COLOR;
		}
	}

	/**
	 * CS6 Color Picker dialog for the foreground or background color
	 */
	open_color_picker(which) {
		var title = which == 'fg' ? 'Foreground Color' : 'Background Color';
		this.color_dialog(title, which == 'fg' ? config.COLOR : config.BG_COLOR, (hex) => {
			if (which == 'fg') {
				this.set_fg(hex);
			}
			else {
				config.BG_COLOR = hex;
				this.render_fg_bg();
			}
		});
	}

	/**
	 * CS6 Color Picker dialog
	 */
	color_dialog(title, initial, callback) {
		var POP = new Dialog_class();
		var picker = new GUI_colors_class();
		POP.show({
			title: 'Color Picker (' + title + ')',
			params: [{ function() { return '<div id="dialog_color_picker"></div>'; } }],
			on_finish() {
				callback(picker.COLOR);
			},
		});
		picker.render_main_colors('dialog');
		picker.set_color({hex: initial, a: 255});
	}

	// =================================================================
	// options bar
	// =================================================================

	init_options_bar() {
		var button = document.getElementById('ps_workspace_button');
		button.addEventListener('click', () => {
			var ws = this.workspace_name || 'Essentials';
			var items = [
				{ name: 'Essentials (Default)', checked: ws == 'Essentials', action: () => this.apply_workspace('Essentials') },
				{ name: '3D' }, { name: 'Motion' },
				{ name: 'Painting', checked: ws == 'Painting', action: () => this.apply_workspace('Painting') },
				{ name: 'Photography', checked: ws == 'Photography', action: () => this.apply_workspace('Photography') },
				{ name: 'Typography', checked: ws == 'Typography', action: () => this.apply_workspace('Typography') },
			];
			var user = Object.keys(this.user_workspaces());
			if (user.length) {
				items.push({ divider: true });
				user.forEach(n => items.push({ name: this.Helper.escapeHtml(n), checked: ws == n, action: () => this.apply_workspace(n) }));
			}
			items.push(
				{ divider: true },
				{ name: 'Reset ' + this.Helper.escapeHtml(ws), action: () => this.apply_workspace(ws) },
				{ name: 'New Workspace...', action: () => this.new_workspace() }, { name: 'Delete Workspace...', action: () => this.delete_workspace() },
			);
			show_popup_menu(button, items, {placement: 'below'});
		});
	}

	// =================================================================
	// panel dock + icon strip
	// =================================================================

	init_dock() {
		document.querySelectorAll('#ps_dock .ps_panelgroup').forEach((group) => {
			var first = group.querySelector('.ps_tab');
			this.activate_tab(group, first.dataset.panel);
			group.querySelectorAll('.ps_tab').forEach((tab) => {
				//CS6: right-click a panel tab
				tab.addEventListener('contextmenu', (e) => {
					e.preventDefault();
					show_popup_menu(tab, [
						{ name: 'Close', action: () => { this.activate_tab(group, tab.dataset.panel); this.toggle_panel(tab.dataset.panel); } },
						{ name: 'Close Tab Group', action: () => { group.classList.add('closed'); this.relayout(); } },
					], { point: { x: e.clientX, y: e.clientY } });
				});
				tab.addEventListener('click', () => {
					if (tab.classList.contains('active') && !group.classList.contains('ps_grow')) {
						//CS6: clicking the active tab collapses/expands the group
						group.classList.toggle('collapsed');
					}
					else {
						group.classList.remove('collapsed');
						this.activate_tab(group, tab.dataset.panel);
					}
				});
			});
			group.querySelector('.ps_panel_menu').addEventListener('click', (event) => {
				var panel = group.querySelector('.ps_tab.active').dataset.panel;
				show_popup_menu(event.currentTarget, this.panel_menu_items(panel), {placement: 'below'});
			});
		});
	}

	panel_menu_items(panel) {
		var items = [];
		if (panel == 'layers') {
			items = [
				{ name: 'New Layer...', shortcut: 'Shift+Ctrl+N', action: () => run_target('layer/new.new') },
				{ name: 'Duplicate Layer...', action: () => run_target('layer/duplicate.duplicate') },
				{ name: 'Delete Layer', action: () => run_target('ps/commands.delete_layer') },
				{ name: 'Delete Hidden Layers', action: () => run_target('ps/commands.delete_hidden_layers') },
				{ divider: true },
				{ name: 'Layer Properties...', action: () => run_target('ps/commands.layer_properties') },
				{ name: 'New Group...', action: () => run_target('ps/commands.new_group') },
				{ name: 'New Group from Layers...', action: () => run_target('ps/commands.group_layers') },
				{ divider: true },
				{ name: 'Lock Layers...', action: () => run_target('ps/commands.lock_layers') },
				{ divider: true },
				{ name: 'Convert to Smart Object', action: () => run_target('ps/commands.convert_to_smart_object') },
				{ divider: true },
				{ name: 'Edit Contents', action: config.layer && config.layer.ps_smart ? () => run_target('ps/commands.edit_smart_contents') : null },
				{ name: 'Blending Options...', action: () => run_target('layer/composition.composition') },
				{ divider: true },
				{ name: 'Create Clipping Mask', shortcut: 'Alt+Ctrl+G', action: () => run_target('ps/commands.toggle_clipping_mask') },
				{ divider: true },
				{ name: 'Link Layers', action: this.Multi.multiple() ? () => run_target('ps/commands.toggle_link_layers') : null },
				{ name: 'Select Linked Layers', action: () => run_target('ps/commands.select_linked_layers') },
				{ divider: true },
				{ name: 'Merge Down', shortcut: 'Ctrl+E', action: () => run_target('ps/commands.merge_down') },
				{ name: 'Merge Visible', shortcut: 'Shift+Ctrl+E', action: () => run_target('ps/commands.merge_visible') },
				{ name: 'Flatten Image', action: () => run_target('ps/commands.flatten_image') },
				{ divider: true },
				{ name: 'Animation Options' }, { name: 'Panel Options...', action: () => this.layers_panel_options() },
				{ divider: true },
				{ name: 'Close', action: () => this.toggle_panel('layers') },
				{ name: 'Close Tab Group', action: () => this.toggle_panel('layers') },
			];
		}
		else if (panel == 'paths') {
			return this.Paths.panel_menu_items();
		}
		else if (panel == 'actions') {
			items = this.Actions.panel_menu_items();
		}
		else if (panel == 'history') {
			items = [
				{ name: 'Step Forward', shortcut: 'Shift+Ctrl+Z', action: () => run_target('edit/redo.redo') },
				{ name: 'Step Backward', shortcut: 'Alt+Ctrl+Z', action: () => run_target('edit/undo.undo') },
				{ divider: true },
				{ name: 'New Snapshot...', action: () => this.new_snapshot(true) }, { name: 'Delete', action: app.State.action_history_index > 0 ? () => delete_state(app.State.action_history_index) : null },
				{ name: 'Clear History', action: () => run_target('ps/commands.purge_histories') },
				{ divider: true },
				{ name: 'New Document', action: () => run_target('ps/commands.duplicate_document') }, { name: 'History Options...', action: () => this.history_options_dialog() },
			];
		}
		else {
			items = [{ name: 'Panel Options...' }];
		}
		items.push({ divider: true });
		items.push({ name: 'Close', action: () => this.toggle_panel(panel) });
		return items;
	}

	activate_tab(group, panel) {
		group.querySelectorAll('.ps_tab').forEach(t => t.classList.toggle('active', t.dataset.panel == panel));
		group.querySelectorAll(':scope > .ps_panel').forEach(p => p.classList.toggle('active', p.dataset.panel == panel));
		this.relayout();
	}

	find_dock_group(panel) {
		var tab = document.querySelector('#ps_dock .ps_tab[data-panel="' + panel + '"]');
		return tab ? tab.closest('.ps_panelgroup') : null;
	}

	init_iconstrip() {
		this.render_iconstrip();
		document.addEventListener('mousedown', (event) => {
			if (this.open_popout && !event.target.closest('.ps_popout, #ps_iconstrip, .menu_dropdown, #popups')) {
				this.close_popout();
			}
		});
	}

	render_iconstrip() {
		var strip = document.getElementById('ps_iconstrip');
		strip.innerHTML = '';
		strip.classList.toggle('empty', this.strip_panels.length == 0);
		for (var panel of this.strip_panels) {
			var button = document.createElement('button');
			button.type = 'button';
			button.className = 'ps_strip_button';
			button.dataset.panel = panel;
			button.title = PANEL_TITLES[panel];
			button.innerHTML = STRIP_ICONS[panel];
			button.addEventListener('click', (event) => {
				var name = event.currentTarget.dataset.panel;
				if (this.open_popout == name) {
					this.close_popout();
				}
				else {
					this.open_popout_panel(name);
				}
			});
			strip.appendChild(button);
		}
		this.relayout();
	}

	open_popout_panel(panel) {
		this.close_popout();
		var host = document.querySelector('.ps_panel[data-panel="' + panel + '"]');
		var button = document.querySelector('#ps_iconstrip .ps_strip_button[data-panel="' + panel + '"]');
		if (!host || !button) {
			return;
		}
		var pop = document.createElement('div');
		pop.className = 'ps_popout';
		pop.innerHTML = '<div class="ps_tabs"><button type="button" class="ps_tab active">' + PANEL_TITLES[panel] + '</button>'
			+ '<span class="ps_panel_menu" title="Panel menu">&#8801;</span></div>';
		pop.appendChild(host);
		host.classList.add('active');
		document.getElementById('ps_app').appendChild(pop);
		var rect = button.getBoundingClientRect();
		var top = Math.min(rect.top, window.innerHeight - pop.offsetHeight - 30);
		pop.style.top = Math.max(60, top) + 'px';
		pop.style.right = (window.innerWidth - rect.left + 2) + 'px';
		pop.querySelector('.ps_panel_menu').addEventListener('click', (event) => {
			show_popup_menu(event.currentTarget, this.panel_menu_items(panel), {placement: 'below'});
		});
		button.classList.add('active');
		this.open_popout = panel;
		if (panel == 'history') {
			this.render_history();
		}
		if (panel == 'character') {
			render_character(document.getElementById('ps_character'));
		}
		if (panel == 'actions') {
			this.Actions.render();
		}
		if (panel == 'histogram') {
			this.render_histogram_panel();
		}
		if (panel == 'comps') {
			this.Comps.render();
		}
		if (panel == 'notes') {
			this.Notes.render();
		}
		if (panel == 'brush') {
			this.Brush_panel.render(document.getElementById('ps_brush_panel'));
		}
		if (panel == 'paragraph') {
			render_paragraph(document.getElementById('ps_paragraph'));
		}
		if (panel == 'clone_source') {
			this.Clone_source.render();
		}
		if (panel == 'brush_presets') {
			this.Brush_presets.render();
		}
		if (panel == 'tool_presets') {
			this.Tool_presets.render();
		}
		if (panel == 'char_styles') {
			this.Type_styles.render('char');
		}
		if (panel == 'para_styles') {
			this.Type_styles.render('para');
		}
	}

	close_popout() {
		var pop = document.querySelector('.ps_popout');
		if (pop) {
			var host = pop.querySelector('.ps_panel');
			if (host) {
				host.classList.remove('active');
				document.getElementById('ps_floating_hosts').appendChild(host);
			}
			pop.remove();
		}
		document.querySelectorAll('#ps_iconstrip .ps_strip_button').forEach(b => b.classList.remove('active'));
		this.open_popout = null;
	}

	/**
	 * Window menu: show/hide a panel
	 */
	toggle_panel(panel) {
		var group = this.find_dock_group(panel);
		if (group) {
			var tab = group.querySelector('.ps_tab[data-panel="' + panel + '"]');
			var visible = !group.classList.contains('closed') && tab.classList.contains('active');
			if (visible) {
				group.classList.add('closed');
			}
			else {
				group.classList.remove('closed', 'collapsed');
				this.activate_tab(group, panel);
			}
			this.relayout();
			return;
		}
		//icon-strip panels (Photopea-style: Window > X adds it to the strip and opens it)
		if (this.strip_panels.includes(panel) && this.open_popout == panel) {
			this.close_popout();
			return;
		}
		if (!this.strip_panels.includes(panel)) {
			this.strip_panels.push(panel);
			this.render_iconstrip();
		}
		this.open_popout_panel(panel);
	}

	toggle_area(area) {
		var el = document.getElementById(area == 'options' ? 'ps_options' : 'ps_toolbox');
		el.classList.toggle('closed');
		this.relayout();
	}

	/**
	 * CS6: holding Ctrl with most tools drags with the Move tool, then returns
	 */
	install_ctrl_move() {
		var TOOLS = ['brush', 'pencil', 'erase', 'ps_select', 'clone', 'retouch', 'dodge_burn', 'gradient', 'fill', 'blur', 'sharpen', 'desaturate', 'magic_erase', 'ps_measure'];
		var restore = null;
		var find = (id) => {
			for (var gi = 0; gi < this.groups.length; gi++) {
				var mi = this.groups[gi].members.findIndex(m => m.id == id);
				if (mi >= 0) return [gi, mi];
			}
			return null;
		};
		document.addEventListener('mousedown', (e) => {
			if (!(e.ctrlKey || e.metaKey) || e.button != 0 || e.ps_synthetic || !TOOLS.includes(config.TOOL.name)) return;
			if (e.target.id != 'canvas_minipaint' && e.target.id != 'main_wrapper') return;
			var prev = this.active_member;
			var gpos = find(prev.id), mpos = find('move');
			if (!gpos || !mpos) return;
			e.stopImmediatePropagation();
			e.preventDefault();
			restore = gpos;
			this.select_member(mpos[0], mpos[1]);
			var target = e.target, x = e.clientX, y = e.clientY;
			setTimeout(() => {
				var again = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1 });
				again.ps_synthetic = true;
				target.dispatchEvent(again);
			}, 30);
		}, true);
		window.addEventListener('mouseup', () => {
			if (!restore) return;
			var back = restore;
			restore = null;
			//after the Move tool has finished its own mouseup
			setTimeout(() => this.select_member(back[0], back[1]), 60);
		});
	}

	/**
	 * painting tools: Alt+click / Alt+drag samples the foreground color (temporary Eyedropper)
	 */
	install_alt_eyedropper() {
		var TOOLS = ['brush', 'pencil', 'fill', 'gradient', 'rectangle', 'ellipse', 'pentagon', 'line'];
		var sampling = false, composite = null;
		var sample = (e) => {
			var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
			var p = app.Layers.get_world_coords(e.clientX - rect.left, e.clientY - rect.top);
			var x = Math.floor(p.x), y = Math.floor(p.y);
			if (x < 0 || y < 0 || x >= config.WIDTH || y >= config.HEIGHT) return;
			var d = composite.getContext('2d').getImageData(x, y, 1, 1).data;
			this.set_fg(this.Helper.rgbToHex(d[0], d[1], d[2]));
		};
		document.addEventListener('mousedown', (e) => {
			if (!e.altKey || e.button != 0 || !TOOLS.includes(config.TOOL.name)) return;
			if (e.target.id != 'canvas_minipaint' && e.target.id != 'main_wrapper') return;
			if (config.TOOL.name == 'retouch') return;
			e.stopImmediatePropagation();
			e.preventDefault();
			composite = document.createElement('canvas');
			composite.width = config.WIDTH;
			composite.height = config.HEIGHT;
			app.Layers.convert_layers_to_canvas(composite.getContext('2d', { willReadFrequently: true }), null, false);
			sampling = true;
			sample(e);
		}, true);
		document.addEventListener('mousemove', (e) => {
			if (!sampling) return;
			e.stopImmediatePropagation();
			sample(e);
		}, true);
		document.addEventListener('mouseup', (e) => {
			if (!sampling) return;
			e.stopImmediatePropagation();
			sampling = false;
			composite = null;
		}, true);
	}

	/**
	 * Move tool: Alt+drag (no selection) duplicates the layer and drags the copy (CS6)
	 */
	install_alt_drag_duplicate() {
		var busy = false;
		document.addEventListener('mousedown', (e) => {
			if (config.TOOL.name != 'select' || !e.altKey || e.button != 0 || busy || e.ps_synthetic) return;
			if (e.target.id != 'canvas_minipaint' && e.target.id != 'main_wrapper') return;
			if (this.Selection.has() || !config.layer || config.layer.type == null || this.Multi.multiple()) return;
			var locks = config.layer.ps_lock || {};
			if (locks.all || locks.position) return;
			e.stopImmediatePropagation();
			e.preventDefault();
			busy = true;
			var target = e.target, x = e.clientX, y = e.clientY;
			var group = this.Groups.is_group(config.layer);
			Promise.resolve(group ? null : app.GUI.modules['layer/duplicate'].duplicate()).then(() => {
				busy = false;
				var again = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1 });
				again.ps_synthetic = true;
				target.dispatchEvent(again);
			});
		}, true);
	}

	/**
	 * Window > Workspace: CS6 panel arrangements
	 */
	apply_workspace(name) {
		var presets = {
			Essentials: { strip: ['history', 'properties'], tabs: { color: 'color', adjustments: 'adjustments', layers: 'layers' }, closed: [] },
			Painting: { strip: ['brush', 'history', 'navigator'], tabs: { color: 'swatches', layers: 'layers' }, closed: ['adjustments'] },
			Photography: { strip: ['history', 'properties', 'info'], tabs: { color: 'color', adjustments: 'adjustments', layers: 'layers' }, closed: [] },
			Typography: { strip: ['character', 'paragraph', 'history'], tabs: { color: 'swatches', layers: 'layers' }, closed: ['adjustments'] },
		};
		var p = presets[name] || this.user_workspaces()[name] || presets.Essentials;
		this.reset_workspace();
		this.workspace_name = name;
		this.strip_panels = p.strip.slice();
		this.render_iconstrip();
		for (var panel in p.tabs) {
			var group = this.find_dock_group(panel);
			if (group) this.activate_tab(group, p.tabs[panel]);
		}
		for (var c of p.closed) {
			var g = this.find_dock_group(c);
			if (g) g.classList.add('closed');
		}
		var button = document.getElementById('ps_workspace_button');
		if (button) button.innerHTML = this.Helper.escapeHtml(name) + ' <span class="ps_caret">&#9662;</span>';
		this.relayout();
	}

	/**
	 * Window > Workspace > New Workspace: saved panel arrangements (browser storage)
	 */
	user_workspaces() {
		try { return JSON.parse(localStorage.getItem('pshot_workspaces_v1') || '{}'); } catch (e) { return {}; }
	}

	save_user_workspaces(list) {
		try { localStorage.setItem('pshot_workspaces_v1', JSON.stringify(list)); } catch (e) { /* storage blocked */ }
	}

	capture_workspace() {
		var tabs = {}, closed = [];
		document.querySelectorAll('#ps_dock .ps_panelgroup').forEach((group) => {
			var first = group.querySelector('.ps_tab').dataset.panel;
			var active = group.querySelector('.ps_tab.active');
			tabs[first] = active ? active.dataset.panel : first;
			if (group.classList.contains('closed')) closed.push(first);
		});
		return { strip: this.strip_panels.slice(), tabs: tabs, closed: closed };
	}

	new_workspace() {
		var POP = new Dialog_class();
		POP.show({
			title: 'New Workspace',
			params: [
				{ name: 'name', title: 'Name:', value: 'Workspace ' + (Object.keys(this.user_workspaces()).length + 1) },
				{ title: '', html: '<span class="ps_dialog_note">Panel locations are saved into this workspace. Keyboard Shortcuts and Menus are kept separately (Edit > Keyboard Shortcuts).</span>' },
			],
			on_finish: (p) => {
				var name = String(p.name || '').trim();
				if (!name || ['Essentials', 'Painting', 'Photography', 'Typography', '3D', 'Motion'].includes(name)) {
					alertify.error('Please choose a different name for the workspace.');
					return;
				}
				var list = this.user_workspaces();
				list[name] = this.capture_workspace();
				this.save_user_workspaces(list);
				this.apply_workspace(name);
			},
		});
	}

	delete_workspace() {
		var names = Object.keys(this.user_workspaces()).filter(n => n != this.workspace_name);
		if (!names.length) {
			alertify.error('There are no workspaces to delete (the current workspace cannot be deleted).');
			return;
		}
		var POP = new Dialog_class();
		POP.show({
			title: 'Delete Workspace',
			params: [{ name: 'name', title: 'Workspace:', values: names, value: names[0], type: 'select' }],
			on_finish: (p) => {
				var list = this.user_workspaces();
				delete list[p.name];
				this.save_user_workspaces(list);
			},
		});
	}

	reset_workspace() {
		this.close_popout();
		this.strip_panels = ['history', 'properties'];
		this.render_iconstrip();
		document.querySelectorAll('#ps_dock .ps_panelgroup').forEach((group) => {
			group.classList.remove('closed', 'collapsed');
			this.activate_tab(group, group.querySelector('.ps_tab').dataset.panel);
		});
		document.getElementById('ps_options').classList.remove('closed');
		document.getElementById('ps_toolbox').classList.remove('closed');
		this.set_screen_mode('standard');
	}

	is_checked(key) {
		if (key.indexOf('panel:') === 0) {
			var panel = key.substr(6);
			var group = this.find_dock_group(panel);
			if (group) {
				return !group.classList.contains('closed') && group.querySelector('.ps_tab[data-panel="' + panel + '"]').classList.contains('active');
			}
			return this.open_popout == panel;
		}
		if (key.indexOf('workspace:') === 0) {
			return this.workspace_name == key.substr(10);
		}
		if (key.indexOf('ot:') === 0) {
			return app.GUI.modules['ps/commands'].opentype_is(key.substr(3));
		}
		if (key.indexOf('fontprev:') === 0) {
			return app.GUI.modules['ps/commands'].font_preview_is(key.substr(9));
		}
		if (key.indexOf('stack:') === 0) {
			return app.GUI.modules['ps/commands'].stack_mode_label(key.substr(6));
		}
		if (key.indexOf('proof:') === 0) {
			return this.Proof.setup == key.substr(6);
		}
		if (key.indexOf('snap_to:') === 0) {
			return config.ps_snap_to[key.substr(8)] == true;
		}
		if (key.indexOf('aa:') === 0) {
			return config.layer && config.layer.type == 'text' && this.Text_aa.current() == key.substr(3);
		}
		switch (key) {
			case 'workspace_essentials': return (this.workspace_name || 'Essentials') == 'Essentials';
			case 'workspace_painting': return this.workspace_name == 'Painting';
			case 'workspace_photography': return this.workspace_name == 'Photography';
			case 'workspace_typography': return this.workspace_name == 'Typography';
			case 'mode_gray': return config.ps_mode == 'Grayscale';
			case 'mode_rgb': return !config.ps_mode || config.ps_mode == 'RGB';
			case 'mode_bitmap': return config.ps_mode == 'Bitmap';
			case 'mode_duotone': return config.ps_mode == 'Duotone';
			case 'mode_indexed': return config.ps_mode == 'Indexed';
			case 'mode_cmyk': return config.ps_mode == 'CMYK';
			case 'mode_lab': return config.ps_mode == 'Lab';
			case 'mode_multi': return config.ps_mode == 'Multichannel';
			case 'depth:8': return (config.ps_depth || 8) == 8;
			case 'depth:16': return config.ps_depth == 16;
			case 'depth:32': return config.ps_depth == 32;
			case 'screen_mode_standard': return this.screen_mode == 'standard';
			case 'screen_mode_menu': return this.screen_mode == 'menu';
			case 'screen_mode_full': return this.screen_mode == 'full';
			case 'extras': return this.extras;
			case 'grid': return app.GUI.grid == true;
			case 'pixel_grid': return this.pixel_grid !== false;
			case 'layer_edges': return this.layer_edges === true;
			case 'show_slices': return this.Slices.show;
			case 'smart_guides': return this.smart_guides !== false;
			case 'lock_slices': return this.Slices.locked;
			case 'proof_colors': return this.Proof.colors;
			case 'gamut_warning': return this.Proof.gamut;
			case 'measure_log': return this.Measure_log.open;
			case 'target_path': return this.target_path !== false;
			case 'show_notes': return this.show_notes !== false;
			case 'show_count': return this.show_count !== false;
			case 'show_mesh': return this.show_mesh !== false;
			case 'show_pins': return this.show_pins !== false;
			case 'guides': return config.guides_enabled == true;
			case 'rulers': return config.ruler_active == true;
			case 'snap': return config.SNAP == true;
			case 'guides_locked': return this.Guides.locked;
			case 'quick_mask': return this.Selection.quick_mask;
			case 'options_bar': return !document.getElementById('ps_options').classList.contains('closed');
			case 'toolbox': return !document.getElementById('ps_toolbox').classList.contains('closed');
		}
		return false;
	}

	// =================================================================
	// screen modes, Tab
	// =================================================================

	set_screen_mode(mode) {
		this.screen_mode = mode;
		var appEl = document.getElementById('ps_app');
		appEl.classList.remove('screen_menu', 'screen_full');
		if (mode == 'menu') appEl.classList.add('screen_menu');
		if (mode == 'full') appEl.classList.add('screen_full');
		this.browser_fullscreen(mode != 'standard');
		this.relayout();
	}

	/**
	 * the full screen modes also take the browser full screen; there the Keyboard
	 * Lock API lets Ctrl+N / Ctrl+T / Ctrl+W reach pshot instead of the browser
	 */
	browser_fullscreen(on) {
		try {
			if (on && !document.fullscreenElement && document.documentElement.requestFullscreen) {
				document.documentElement.requestFullscreen().then(() => {
					if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(['KeyN', 'KeyT', 'KeyW']).catch(() => {});
				}).catch(() => {});
			}
			else if (!on && document.fullscreenElement && document.exitFullscreen) {
				if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock();
				document.exitFullscreen().catch(() => {});
			}
		} catch (e) { /* not available */ }
		if (!this.fullscreen_hooked) {
			this.fullscreen_hooked = true;
			document.addEventListener('fullscreenchange', () => {
				//leaving browser full screen (Esc held) returns to Standard Screen Mode
				if (!document.fullscreenElement && this.screen_mode != 'standard') this.set_screen_mode('standard');
			});
		}
	}

	cycle_screen_mode(reverse) {
		var modes = ['standard', 'menu', 'full'];
		var i = modes.indexOf(this.screen_mode);
		this.set_screen_mode(modes[(i + (reverse ? 2 : 1)) % 3]);
	}

	/**
	 * Tab hides/shows all panels (toolbox, options bar, dock); Shift+Tab only the dock
	 */
	toggle_panels(dock_only) {
		var appEl = document.getElementById('ps_app');
		if (dock_only) {
			appEl.classList.toggle('hide_dock');
		}
		else {
			var hide = !appEl.classList.contains('hide_panels');
			appEl.classList.toggle('hide_panels', hide);
			appEl.classList.remove('hide_dock');
		}
		this.close_popout();
		this.relayout();
	}

	// =================================================================
	// document tab + status bar
	// =================================================================

	document_name() {
		return this.Documents.current().name;
	}

	get saved_as_psd() {
		return this.Documents.current().saved_as_psd;
	}

	/**
	 * @param {string} name document name
	 * @param {string} file_name original file name; a .psd saves straight back with Ctrl+S
	 */
	set_document_name(name, file_name) {
		this.Documents.rename_current(name, file_name);
	}

	tab_label(name, zoom, layer) {
		return this.Helper.escapeHtml(name) + ' @ ' + zoom + ' (' + this.Helper.escapeHtml(layer) + ', ' + ({ Grayscale: 'Gray', Indexed: 'Index', Bitmap: 'Bitmap', Duotone: 'Duotone', CMYK: 'CMYK', Lab: 'Lab', Multichannel: 'Multichannel' }[config.ps_mode] || 'RGB') + (config.ps_mode == 'Indexed' || config.ps_mode == 'Bitmap' ? '' : '/' + (config.ps_depth || 8)) + (this.Proof && this.Proof.label() ? '/' + this.Proof.label() : '') + ')';
	}

	render_document_tab() {
		var docs = this.Documents.docs;
		var active = this.Documents.active;
		var labels = docs.map((doc, i) => {
			if (i == active) {
				return this.tab_label(doc.name, this.format_zoom(), this.Selection.quick_mask ? 'Quick Mask' : (config.layer ? config.layer.name : ''));
			}
			var st = doc.state;
			var layer = st && st.layer ? st.layer.name : '';
			var z = st ? Math.round(st.ZOOM * 100) + '%' : '100%';
			return this.tab_label(doc.name, z, layer);
		});
		var signature = active + '|' + labels.join('|') + '|' + docs.map(d => (d.float ? 'f' : 't')).join('');
		if (this.last_tab_label === signature) {
			return;
		}
		this.last_tab_label = signature;
		var tabs = document.getElementById('ps_doctabs');
		var html = '';
		labels.forEach((label, i) => {
			//floating documents have a window instead of a tab
			if (docs[i].float) return;
			html += '<div class="ps_doctab' + (i == active ? ' active' : '') + '" data-index="' + i + '" title="' + label + '">'
				+ '<span class="ps_doctab_label">' + label + '</span>'
				+ '<button type="button" class="ps_doctab_close" data-index="' + i + '" title="Close">&times;</button></div>';
		});
		tabs.innerHTML = html;
		tabs.querySelectorAll('.ps_doctab').forEach((tab) => {
			tab.addEventListener('mousedown', (event) => {
				if (event.target.closest('.ps_doctab_close') || event.button != 0) {
					return;
				}
				this.Documents.switch_to(parseInt(tab.dataset.index));
				//drag the tab down out of the bar: Move to New Window
				this.Float.tab_drag(event, parseInt(tab.dataset.index));
			});
		});
		tabs.querySelectorAll('.ps_doctab_close').forEach((button) => {
			button.addEventListener('click', () => this.Documents.close(parseInt(button.dataset.index)));
		});
		this.Float.render(labels);
		document.title = this.document_name() + ' - pshot';
		this.update_window_menu();
	}

	/**
	 * Window menu ends with the list of open documents (CS6)
	 */
	update_window_menu() {
		var menu = menuDefinition.find(m => m.name == 'Window');
		var start = menu.children.findIndex(c => c.document_entry);
		if (start >= 0) {
			menu.children.splice(start);
		}
		this.Documents.docs.forEach((doc, i) => {
			menu.children.push({
				name: (i + 1) + ' ' + doc.name,
				target: 'ps/commands.switch_document',
				parameter: i,
				checked: i == this.Documents.active,
				document_entry: true,
			});
		});
	}

	format_zoom() {
		var z = config.ZOOM * 100;
		return (Math.abs(z - Math.round(z)) < 0.01 ? Math.round(z) : z.toFixed(2).replace(/0$/, '')) + '%';
	}

	init_statusbar() {
		var input = document.getElementById('ps_status_zoom');
		input.addEventListener('change', () => {
			var value = parseFloat(input.value);
			if (!isNaN(value) && value > 0) {
				app.GUI.GUI_preview.set_center_zoom();
				app.GUI.GUI_preview.zoom(value);
			}
			this.render_statusbar(true);
		});
		input.addEventListener('keydown', (event) => {
			event.stopPropagation();
			if (event.key == 'Enter') input.blur();
		});
		input.addEventListener('focus', () => input.select());
		//CS6: the arrow (or the info text) chooses what the status bar shows
		try { this.status_show = localStorage.getItem('pshot_status_show') || 'sizes'; } catch (e) { this.status_show = 'sizes'; }
		var open = (event) => {
			var item = (key, name, enabled) => ({ name: name, checked: this.status_show == key, action: enabled === false ? null : () => {
				this.status_show = key;
				try { localStorage.setItem('pshot_status_show', key); } catch (e) { /* storage blocked */ }
				this.render_statusbar(true);
			} });
			show_popup_menu(event.currentTarget, [
				{ name: 'Adobe Drive' },
				{ divider: true },
				item('sizes', 'Document Sizes'), item('profile', 'Document Profile'), item('dimensions', 'Document Dimensions'),
				item('scale', 'Measurement Scale'), item('scratch', 'Scratch Sizes'), item('efficiency', 'Efficiency'), item('timing', 'Timing'),
				item('tool', 'Current Tool'), item('exposure', '32-bit Exposure', config.ps_depth == 32), item('save', 'Save Progress'),
			], { placement: 'above' });
		};
		document.querySelector('#ps_statusbar .ps_status_arrow').addEventListener('click', open);
		document.getElementById('ps_status_info').addEventListener('click', open);
	}

	format_bytes(bytes) {
		if (bytes >= 1024 * 1024) {
			return (bytes / 1024 / 1024).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 2).replace(/\.?0+$/, '') + 'M';
		}
		return Math.round(bytes / 1024) + 'K';
	}

	render_statusbar(force) {
		var input = document.getElementById('ps_status_zoom');
		if (document.activeElement !== input || force) {
			var zoom = this.format_zoom();
			if (input.value !== zoom) {
				input.value = zoom;
			}
		}
		var flat = config.WIDTH * config.HEIGHT * 3;
		var layered = 0;
		for (var layer of config.layers) {
			if (layer.type == 'image' && layer.width_original) {
				layered += layer.width_original * layer.height_original * 4;
			}
		}
		var text = 'Doc: ' + this.format_bytes(flat) + '/' + this.format_bytes(Math.max(layered, flat));
		var doc = this.Documents.current() || {}, ppi = doc.ppi || 72;
		switch (this.status_show) {
			case 'profile': text = (config.ps_profile == 'none' ? 'Untagged RGB' : this.Color.profile()) + ' (' + (config.ps_depth || 8) + 'bpc)'; break;
			case 'dimensions': text = +(config.WIDTH / ppi).toFixed(3) + ' in x ' + +(config.HEIGHT / ppi).toFixed(3) + ' in (' + ppi + ' ppi)'; break;
			case 'scale': {
				var sc = this.Measure_log && this.Measure_log.scale ? this.Measure_log.scale : { pixels: 1, length: 1, units: 'pixels' };
				text = sc.pixels + ' pixel' + (sc.pixels == 1 ? '' : 's') + ' = ' + (+sc.length).toFixed(4) + ' ' + sc.units;
				break;
			}
			case 'scratch': text = 'Scratch: ' + this.format_bytes(Math.max(layered, flat) * (1 + Math.min(20, app.State.action_history.length) * 0.25)) + '/' + this.format_bytes(1536 * 1024 * 1024); break;
			case 'efficiency': text = 'Efficiency: 100%'; break;
			case 'timing': text = (this.last_timing || 0).toFixed(1) + ' sec'; break;
			case 'tool': text = this.active_member ? this.active_member.name : ''; break;
			case 'exposure': text = 'Exposure: ' + (this.Proof.hdr_exposure || 0).toFixed(2); break;
			case 'save': text = 'Save Progress: idle'; break;
		}
		var info = document.getElementById('ps_status_info');
		if (info.textContent !== text) {
			info.textContent = text;
		}
	}

	status_message(text) {
		var el = document.getElementById('ps_status_message');
		el.textContent = text;
		clearTimeout(this.status_message_timer);
		this.status_message_timer = setTimeout(() => { el.textContent = ''; }, 3500);
	}

	// =================================================================
	// Info panel (CS6: RGB / CMYK under the cursor, X/Y, W/H)
	// =================================================================

	init_info_panel() {
		var host = document.querySelector('.ps_panel[data-panel="info"]');
		var block = document.createElement('div');
		block.id = 'ps_info';
		block.innerHTML = '<div class="ps_info_grid">'
			+ '<div class="ps_info_cell"><span class="ps_info_icon">&#8857;</span><div><div>R: <b id="pi_r"></b></div><div>G: <b id="pi_g"></b></div><div>B: <b id="pi_b"></b></div></div></div>'
			+ '<div class="ps_info_cell"><span class="ps_info_icon">&#8857;</span><div><div>C: <b id="pi_c"></b></div><div>M: <b id="pi_m"></b></div><div>Y: <b id="pi_y"></b></div><div>K: <b id="pi_k"></b></div></div></div>'
			+ '<div class="ps_info_cell"><span class="ps_info_icon">+</span><div><div>X: <b id="pi_x"></b></div><div>Y: <b id="pi_yy"></b></div></div></div>'
			+ '<div class="ps_info_cell"><span class="ps_info_icon">&#9633;</span><div><div>W: <b id="pi_w"></b></div><div>H: <b id="pi_h"></b></div></div></div>'
			+ '</div><div class="ps_info_samplers" id="pi_samplers"></div><div class="ps_info_doc" id="pi_doc"></div><div class="ps_info_hint" id="pi_hint"></div>';
		host.insertBefore(block, host.firstChild);
		document.getElementById('toggle_info').style.display = 'none';
		var set = (id, v) => { var el = document.getElementById(id); if (el) el.textContent = v; };
		document.getElementById('main_wrapper').addEventListener('mousemove', (e) => {
			if (this.open_popout != 'info') return;
			var canvas = document.getElementById('canvas_minipaint');
			var rect = canvas.getBoundingClientRect();
			var sx = Math.floor(e.clientX - rect.left), sy = Math.floor(e.clientY - rect.top);
			var p = app.Layers.get_world_coords(sx, sy);
			set('pi_x', Math.round(p.x));
			set('pi_yy', Math.round(p.y));
			if (sx >= 0 && sy >= 0 && sx < canvas.width && sy < canvas.height) {
				var d = canvas.getContext('2d').getImageData(sx, sy, 1, 1).data;
				set('pi_r', d[0]); set('pi_g', d[1]); set('pi_b', d[2]);
				var k = 1 - Math.max(d[0], d[1], d[2]) / 255;
				var cmy = (v) => k >= 1 ? 0 : Math.round((1 - v / 255 - k) / (1 - k) * 100);
				set('pi_c', cmy(d[0]) + '%'); set('pi_m', cmy(d[1]) + '%'); set('pi_y', cmy(d[2]) + '%'); set('pi_k', Math.round(k * 100) + '%');
			}
			var b = this.Selection.bounds;
			set('pi_w', b ? b.width : '');
			set('pi_h', b ? b.height : '');
			set('pi_doc', 'Doc: ' + this.format_bytes(config.WIDTH * config.HEIGHT * 3));
			set('pi_hint', this.active_member ? 'Click and drag to use the ' + this.active_member.name.replace(/ Tool$/, '').toLowerCase() + ' tool.' : '');
		});
	}

	/**
	 * Histogram panel (CS6 expanded view): channel, graph, statistics
	 */
	render_histogram_panel() {
		var el = document.getElementById('ps_histogram');
		if (!el) return;
		var channel = this.histogram_channel || 'RGB';
		var source = this.histogram_source || 'Entire Image';
		var W = config.WIDTH, H = config.HEIGHT;
		var c = document.createElement('canvas');
		c.width = W;
		c.height = H;
		var ctx = c.getContext('2d', { willReadFrequently: true });
		if (source == 'Selected Layer' && config.layer) app.Layers.render_object(ctx, config.layer);
		else app.Layers.convert_layers_to_canvas(ctx, null, false);
		var d = ctx.getImageData(0, 0, W, H).data;
		var hist = new Float64Array(256), n = 0;
		var step = Math.max(1, Math.floor(W * H / 400000));
		for (var i = 0; i < W * H; i += step) {
			var k = i * 4;
			if (d[k + 3] == 0) continue;
			var v = channel == 'Red' ? d[k] : channel == 'Green' ? d[k + 1] : channel == 'Blue' ? d[k + 2]
				: (channel == 'Luminosity' ? Math.round(d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11) : Math.round((d[k] + d[k + 1] + d[k + 2]) / 3));
			hist[v]++;
			n++;
		}
		var mean = 0, sq = 0, median = 0, acc = 0;
		for (var v2 = 0; v2 < 256; v2++) { mean += v2 * hist[v2]; sq += v2 * v2 * hist[v2]; }
		mean = n ? mean / n : 0;
		var sd = n ? Math.sqrt(Math.max(0, sq / n - mean * mean)) : 0;
		for (median = 0; median < 256; median++) { acc += hist[median]; if (acc >= n / 2) break; }
		var channels = ['RGB', 'Red', 'Green', 'Blue', 'Luminosity'];
		el.innerHTML = '<div class="ps_hist">'
			+ '<div class="ps_typ_row"><span>Channel:</span><select id="hist_ch">' + channels.map(ch => '<option' + (ch == channel ? ' selected' : '') + '>' + ch + '</option>').join('') + '</select></div>'
			+ '<canvas id="hist_graph" width="256" height="100"></canvas>'
			+ '<div class="ps_typ_row"><span>Source:</span><select id="hist_src">' + ['Entire Image', 'Selected Layer'].map(s => '<option' + (s == source ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div>'
			+ '<div class="ps_hist_stats"><span>Mean:</span><b>' + mean.toFixed(2) + '</b><span>Std Dev:</span><b>' + sd.toFixed(2) + '</b>'
			+ '<span>Median:</span><b>' + median + '</b><span>Pixels:</span><b>' + Math.round(n * step) + '</b></div></div>';
		var g = el.querySelector('#hist_graph').getContext('2d');
		g.fillStyle = '#fff';
		g.fillRect(0, 0, 256, 100);
		var max = 0;
		for (var v3 = 0; v3 < 256; v3++) max = Math.max(max, hist[v3]);
		g.fillStyle = { Red: '#c00', Green: '#090', Blue: '#00c' }[channel] || '#000';
		for (var x = 0; x < 256; x++) {
			var hgt = max ? Math.round(hist[x] / max * 100) : 0;
			g.fillRect(x, 100 - hgt, 1, hgt);
		}
		el.querySelector('#hist_ch').addEventListener('change', (e) => { this.histogram_channel = e.target.value; this.render_histogram_panel(); });
		el.querySelector('#hist_src').addEventListener('change', (e) => { this.histogram_source = e.target.value; this.render_histogram_panel(); });
	}

	/**
	 * Info panel: Color Sampler readouts (#1 .. #4)
	 */
	render_samplers(values) {
		var el = document.getElementById('pi_samplers');
		if (!el) return;
		el.innerHTML = (values || []).map((v, i) => '<div class="ps_info_cell"><span class="ps_info_icon">#' + (i + 1) + '</span><div><div>R: <b>' + v[0] + '</b></div><div>G: <b>' + v[1] + '</b></div><div>B: <b>' + v[2] + '</b></div></div></div>').join('');
		el.style.display = values && values.length ? 'grid' : 'none';
	}

	// =================================================================
	// History panel
	// =================================================================

	hook_state() {
		//tick() watches the history index/length; the status bar Timing needs the last command's time
		var state = app.State, orig = state.do_action.bind(state);
		state.do_action = async (...args) => {
			var t = performance.now();
			try { return await orig(...args); }
			finally { this.last_timing = (performance.now() - t) / 1000; }
		};
	}

	render_history() {
		var el = document.getElementById('ps_history');
		if (!el) {
			return;
		}
		var state = app.State;
		//History Brush source: the opened state unless another state / snapshot is chosen
		var src = this.Documents.current().brush_source;
		if (src == null) src = 0;
		var is_src = (v) => (typeof v == 'number' && v === src) || (v && src && v.snapshot != null && src.snapshot === v.snapshot);
		var brush = (attr, v) => '<span class="ps_history_brush' + (is_src(v) ? ' source' : '') + '" ' + attr + ' title="Sets the source for the history brush"></span>';
		//History Options: Automatically Create First Snapshot (the document as opened)
		var html = !this.history_options().first_snapshot ? '' : '<div class="ps_history_snapshot' + (state.action_history_index == 0 ? ' active' : '') + '" data-index="0">'
			+ brush('data-brush-index="0"', 0) + '<span class="ps_history_thumb"></span><span>' + this.document_name() + '</span></div>';
		var snaps = this.Documents.current().snapshots || [];
		snaps.forEach((snap, i) => {
			html += '<div class="ps_history_snapshot ps_user_snapshot" data-snapshot="' + i + '">' + brush('data-brush-snapshot="' + i + '"', { snapshot: i }) + '<span class="ps_history_thumb"></span><span>' + this.Helper.escapeHtml(snap.name) + '</span></div>';
		});
		html += '<div class="ps_history_list">';
		state.action_history.forEach((action, i) => {
			var classes = 'ps_history_item';
			if (i + 1 == state.action_history_index) classes += ' active';
			if (i + 1 > state.action_history_index) classes += ' undone';
			html += '<div class="' + classes + '" data-index="' + (i + 1) + '">' + brush('data-brush-index="' + (i + 1) + '"', i + 1) + '<span class="ps_history_icon"></span>'
				+ this.Helper.escapeHtml(action.action_description) + '</div>';
		});
		html += '</div>';
		html += '<div class="ps_panel_footer"><button type="button" class="ps_history_newdoc" title="Create new document from current state"></button>'
			+ '<button type="button" class="ps_history_snap" title="Create new snapshot"></button>'
			+ '<button type="button" class="ps_history_delete" title="Delete current state"></button></div>';
		el.innerHTML = html;
		el.querySelectorAll('[data-brush-index], [data-brush-snapshot]').forEach((b) => b.addEventListener('click', (e) => {
			e.stopPropagation();
			this.Documents.set_brush_source(b.dataset.brushSnapshot != null ? { snapshot: parseInt(b.dataset.brushSnapshot) } : parseInt(b.dataset.brushIndex));
		}));
		el.querySelectorAll('[data-index]').forEach((row) => {
			row.addEventListener('click', () => this.goto_history(parseInt(row.dataset.index)));
		});
		el.querySelectorAll('[data-snapshot]').forEach((row) => {
			row.addEventListener('click', () => this.restore_snapshot(parseInt(row.dataset.snapshot)));
		});
		el.querySelector('.ps_history_snap').addEventListener('click', (e) => this.new_snapshot(e.altKey));
		el.querySelector('.ps_history_delete').addEventListener('click', () => delete_state(app.State.action_history_index));
		el.querySelector('.ps_history_newdoc').addEventListener('click', () => app.GUI.modules['ps/commands'].duplicate_document());
		var list = el.querySelector('.ps_history_list');
		var active = el.querySelector('.ps_history_item.active');
		if (active) {
			list.scrollTop = active.offsetTop - list.clientHeight + active.offsetHeight * 2;
		}
	}

	/**
	 * History panel: snapshots keep a full copy of the document's layers
	 */
	layer_copies() {
		var copies = [];
		for (var l of this.Groups.ordered().slice().reverse()) {
			var copy = {};
			for (var k in l) {
				if (['id', 'link', 'link_canvas', 'order'].includes(k) || k.startsWith('_')) continue;
				copy[k] = l[k];
			}
			if (l.type == 'image' && l.link) {
				var c = document.createElement('canvas');
				c.width = l.width_original;
				c.height = l.height_original;
				c.getContext('2d').drawImage(l.link, 0, 0);
				copy.data = c;
			}
			copy._old_id = l.id;
			copy._old_parent = l.ps_parent;
			copies.push(copy);
		}
		return { width: config.WIDTH, height: config.HEIGHT, layers: copies };
	}

	/**
	 * Layers panel > Panel Options: thumbnail size and contents
	 */
	layers_panel_options() {
		var GL = app.GUI.GUI_layers, o = GL.thumb_options();
		var names = { none: 'None', small: 'Small', medium: 'Medium', large: 'Large' };
		var POP = new Dialog_class();
		POP.show({
			title: 'Layers Panel Options',
			params: [
				{ name: 'size', title: 'Thumbnail Size:', values: Object.values(names), value: names[o.size] || 'Medium' },
				{ name: 'clip', title: 'Thumbnail Contents:', values: ['Layer Bounds', 'Entire Document'], value: o.clip == 'layer' ? 'Layer Bounds' : 'Entire Document' },
			],
			on_finish: (p) => {
				var size = Object.keys(names).find(k => names[k] == p.size) || 'medium';
				GL.set_thumb_options({ size: size, clip: p.clip == 'Layer Bounds' ? 'layer' : 'document' });
			},
		});
	}

	/**
	 * History panel > History Options (saved in the browser)
	 */
	history_options() {
		if (!this.hist_opts) {
			try { this.hist_opts = JSON.parse(localStorage.getItem('pshot_history_options_v1') || 'null'); } catch (e) { this.hist_opts = null; }
			this.hist_opts = Object.assign({ first_snapshot: true, snapshot_on_save: false, snapshot_dialog: false, visibility_undoable: false }, this.hist_opts || {});
		}
		return this.hist_opts;
	}

	history_options_dialog() {
		var o = this.history_options();
		var POP = new Dialog_class();
		POP.show({
			title: 'History Options',
			params: [
				{ name: 'first_snapshot', title: 'Automatically Create First Snapshot', value: o.first_snapshot },
				{ name: 'snapshot_on_save', title: 'Automatically Create New Snapshot When Saving', value: o.snapshot_on_save },
				{ name: 'nonlinear', title: 'Allow Non-Linear History', value: false },
				{ name: 'snapshot_dialog', title: 'Show New Snapshot Dialog by Default', value: o.snapshot_dialog },
				{ name: 'visibility_undoable', title: 'Make Layer Visibility Changes Undoable', value: o.visibility_undoable },
			],
			on_load: (params, pop) => {
				var nl = pop.el.querySelector('#pop_data_nonlinear');
				if (nl) nl.disabled = true;
			},
			on_finish: (p) => {
				Object.assign(o, { first_snapshot: !!p.first_snapshot, snapshot_on_save: !!p.snapshot_on_save, snapshot_dialog: !!p.snapshot_dialog, visibility_undoable: !!p.visibility_undoable });
				try { localStorage.setItem('pshot_history_options_v1', JSON.stringify(o)); } catch (e) { /* storage blocked */ }
				this.render_history();
			},
		});
	}

	/**
	 * the eye: a History step only with Make Layer Visibility Changes Undoable (CS6 default: not)
	 */
	toggle_visibility(id) {
		return app.State.do_action(new app.Actions.Toggle_layer_visibility_action(id));
	}

	/**
	 * New Snapshot: named in a dialog when the History Options ask for it (or with Alt)
	 */
	new_snapshot(ask) {
		if (!ask && !this.history_options().snapshot_dialog) return this.create_snapshot();
		var doc = this.Documents.current();
		prompt_name('New Snapshot', 'Snapshot ' + ((doc.snapshots || []).length + 1), (name) => {
			this.create_snapshot();
			var snaps = this.Documents.current().snapshots;
			snaps[snaps.length - 1].name = name;
			this.render_history();
		});
	}

	create_snapshot() {
		var doc = this.Documents.current();
		doc.snapshots = doc.snapshots || [];
		var snap = this.layer_copies();
		snap.name = 'Snapshot ' + (doc.snapshots.length + 1);
		doc.snapshots.push(snap);
		this.render_history();
	}

	async restore_snapshot(index) {
		var snap = (this.Documents.current().snapshots || [])[index];
		if (!snap) return;
		var actions = [
			new app.Actions.Prepare_canvas_action('undo'),
			new app.Actions.Update_config_action({ WIDTH: snap.width, HEIGHT: snap.height }),
			new app.Actions.Reset_layers_action(),
		];
		snap.layers.forEach((settings, i) => {
			var s = Object.assign({}, settings);
			delete s._old_id;
			delete s._old_parent;
			if (s.data instanceof HTMLCanvasElement) s.data = s.data.toDataURL('image/png');
			s.ps_parent = null;
			s.order = i + 1;
			actions.push(new app.Actions.Insert_layer_action(s, false));
		});
		actions.push(new app.Actions.Prepare_canvas_action('do'));
		await app.State.do_action(new app.Actions.Bundle_action('snapshot', snap.name, actions));
		var by_old = {};
		snap.layers.forEach((s, i) => { by_old[s._old_id] = config.layers.find(l => l.order == i + 1); });
		snap.layers.forEach((s, i) => {
			var layer = config.layers.find(l => l.order == i + 1);
			if (layer && s._old_parent && by_old[s._old_parent]) layer.ps_parent = by_old[s._old_parent].id;
		});
		this.Groups.after_change();
	}

	async goto_history(index) {
		var state = app.State;
		while (state.action_history_index > index && state.can_undo()) {
			await state.undo_action();
		}
		while (state.action_history_index < index && state.can_redo()) {
			await state.redo_action();
		}
		app.GUI.GUI_layers.render_layers();
		config.need_render = true;
		this.render_history();
	}

	// =================================================================
	// Layers / Channels / Paths
	// =================================================================

	on_layers_changed() {
		this.render_document_tab();
	}

	refresh_thumbnails() {
		document.querySelectorAll('#layers canvas.ps_thumb').forEach((canvas) => {
			var layer = app.Layers.get_layer(canvas.dataset.id);
			if (layer) {
				app.GUI.GUI_layers.draw_thumbnail(canvas, layer);
			}
		});
	}

	render_channels(force) {
		var el = document.getElementById('ps_channels');
		if (!el) {
			return;
		}
		if (force) {
			delete el.dataset.ready;
		}
		if (!el.dataset.ready) {
			var rows = {
				Grayscale: [['Gray', 'Ctrl+2', null]],
				CMYK: [['CMYK', 'Ctrl+2', null], ['Cyan', 'Ctrl+3', 'c'], ['Magenta', 'Ctrl+4', 'm'], ['Yellow', 'Ctrl+5', 'y'], ['Black', 'Ctrl+6', 'k']],
				Lab: [['Lab', 'Ctrl+2', null], ['Lightness', 'Ctrl+3', 'L'], ['a', 'Ctrl+4', 'a'], ['b', 'Ctrl+5', 'b']],
				Multichannel: [['Cyan', 'Ctrl+1', 'c'], ['Magenta', 'Ctrl+2', 'm'], ['Yellow', 'Ctrl+3', 'y']],
			}[config.ps_mode] || [['RGB', 'Ctrl+2', null], ['Red', 'Ctrl+3', 0], ['Green', 'Ctrl+4', 1], ['Blue', 'Ctrl+5', 2]];
			var html = '';
			//targeted channels are highlighted, the eyes show the visible ones
			var cv = this.Channel_view.state(), composite = cv.target.length == cv.all.length;
			for (var row of rows) {
				var ck = row[2] === null ? null : row[2];
				var on = ck === null ? cv.shown.length == cv.all.length : cv.shown.includes(ck);
				var hit = ck === null ? composite : (composite || cv.target.includes(ck));
				html += '<div class="ps_channel_row' + (hit ? ' active' : '') + (!composite && hit && ck !== null ? ' selected' : '') + '" data-ckey="' + (ck === null ? '' : ck) + '">'
					+ '<span class="ps_eye' + (on ? ' on' : '') + '" data-ch-eye="1">' + (on ? '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8z" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="2.2" fill="currentColor"/></svg>' : '') + '</span>'
					+ '<canvas class="ps_thumb" width="32" height="32" data-channel="' + (row[2] === null ? 'rgb' : row[2]) + '"></canvas>'
					+ '<span class="ps_layer_name">' + row[0] + '</span><span class="ps_channel_key">' + row[1] + '</span></div>';
			}
			//alpha channels (Save Selection)
			var alpha = config.ps_alpha || [];
			alpha.forEach((ch, i) => {
				html += '<div class="ps_channel_row ps_alpha_row' + (i == config.ps_alpha_active ? ' active selected' : '') + '" data-alpha="' + i + '">'
					+ '<span class="ps_eye"></span>'
					+ '<canvas class="ps_alpha_thumb" width="32" height="32" data-alpha="' + i + '" title="Ctrl+click to load as a selection"></canvas>'
					+ '<span class="ps_layer_name">' + this.Helper.escapeHtml(ch.name) + '</span><span class="ps_channel_key">Ctrl+' + (6 + i) + '</span></div>';
			});
			var S18 = (body) => '<svg viewBox="0 0 18 18" width="16" height="16">' + body + '</svg>';
			var has_alpha = config.ps_alpha_active != null && config.ps_alpha_active >= 0 && alpha[config.ps_alpha_active];
			html += '<div class="ps_panel_footer">'
				+ '<button type="button" data-ch="load"' + (has_alpha ? '' : ' class="disabled"') + ' title="Load channel as selection">' + S18('<circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 1.5"/>') + '</button>'
				+ '<button type="button" data-ch="save"' + (this.Selection.has() ? '' : ' class="disabled"') + ' title="Save selection as channel">' + S18('<rect x="2.5" y="3.5" width="13" height="11" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="9" cy="9" r="3" fill="currentColor"/>') + '</button>'
				+ '<button type="button" data-ch="new" title="Create new channel">' + S18('<rect x="4" y="3" width="10" height="12" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M11 3v3h3" fill="none" stroke="currentColor" stroke-width="1.2"/>') + '</button>'
				+ '<button type="button" data-ch="delete"' + (has_alpha ? '' : ' class="disabled"') + ' title="Delete current channel">' + S18('<path d="M5 5h8l-.8 10H5.8zM4 5h10M7.5 3h3" fill="none" stroke="currentColor" stroke-width="1.2"/>') + '</button></div>';
			el.innerHTML = html;
			el.dataset.ready = '1';
			this.channels_signature = config.ps_alpha;
			this.channels_has_selection = this.Selection.has();
			el.querySelectorAll('canvas.ps_alpha_thumb').forEach((c) => this.Alpha.thumb(c, alpha[c.dataset.alpha].mask));
			el.querySelectorAll('.ps_alpha_row').forEach((row) => row.addEventListener('click', (e) => {
				var i = parseInt(row.dataset.alpha);
				if ((e.ctrlKey || e.metaKey) && e.target.matches('canvas')) {
					this.Alpha.load(i, e.shiftKey ? 'add' : (e.altKey ? 'subtract' : 'new'));
					return;
				}
				config.ps_alpha_active = i == config.ps_alpha_active ? -1 : i;
				this.render_channels(true);
			}));
			el.querySelectorAll('.ps_channel_row[data-ckey]').forEach((row) => row.addEventListener('click', (e) => {
				var raw = row.dataset.ckey, key = raw === '' ? null : (/^\d$/.test(raw) ? parseInt(raw) : raw);
				if (e.target.closest('[data-ch-eye]')) this.Channel_view.toggle_eye(key);
				else this.Channel_view.select(key, e.shiftKey);
			}));
			el.querySelectorAll('[data-ch]').forEach((b) => b.addEventListener('click', () => {
				if (b.classList.contains('disabled')) return;
				var k = b.dataset.ch;
				if (k == 'load') this.Alpha.load(config.ps_alpha_active, 'new');
				else if (k == 'save') this.Alpha.save_selection(true);
				else if (k == 'new') this.Alpha.new_channel();
				else if (k == 'delete') this.Alpha.delete_channel();
			}));
		}
		else if (this.channels_signature !== config.ps_alpha || this.channels_has_selection !== this.Selection.has()) {
			return this.render_channels(true);
		}
		//channel thumbnails from the composited canvas
		var source = document.createElement('canvas');
		var size = 32;
		var scale = Math.min(size / config.WIDTH, size / config.HEIGHT);
		source.width = Math.max(1, Math.round(config.WIDTH * scale));
		source.height = Math.max(1, Math.round(config.HEIGHT * scale));
		var sctx = source.getContext('2d');
		try {
			sctx.scale(scale, scale);
			app.Layers.convert_layers_to_canvas(sctx, null, true);
		} catch (e) {
			return;
		}
		var data = sctx.getImageData(0, 0, source.width, source.height);
		el.querySelectorAll('canvas.ps_thumb').forEach((canvas) => {
			var ctx = canvas.getContext('2d');
			ctx.clearRect(0, 0, size, size);
			var ox = Math.floor((size - source.width) / 2);
			var oy = Math.floor((size - source.height) / 2);
			if (canvas.dataset.channel == 'rgb') {
				ctx.fillStyle = '#fff';
				ctx.fillRect(ox, oy, source.width, source.height);
				ctx.drawImage(source, ox, oy);
				return;
			}
			var c = canvas.dataset.channel;
			var out = ctx.createImageData(source.width, source.height);
			//Preferences > Interface > Show Channels in Color
			var tint = this.Preferences && this.Preferences.values.channels_in_color && /^[012]$/.test(c) ? parseInt(c) : -1;
			for (var i = 0; i < data.data.length; i += 4) {
				var a = data.data[i + 3] / 255;
				var v = Math.round(channel_value(data.data[i], data.data[i + 1], data.data[i + 2], c) * a + 255 * (1 - a));
				out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
				if (tint >= 0) for (var tc = 0; tc < 3; tc++) if (tc != tint) out.data[i + tc] = 0;
				out.data[i + 3] = 255;
			}
			ctx.putImageData(out, ox, oy);
		});
	}

	render_paths_panel() {
		this.Paths.init();
	}

	// =================================================================
	// Color / Swatches / Adjustments / Styles
	// =================================================================

	init_color_panel() {
		var panel = document.getElementById('toggle_colors');
		//miniPaint hides the RGB channel sliders by default; CS6's Color panel is those sliders
		var channels_toggle = panel.querySelector('#toggle_color_channels_section_button');
		if (channels_toggle && channels_toggle.getAttribute('aria-pressed') !== 'true') {
			channels_toggle.click();
		}
		//CS6 Color panel = FG/BG chips + RGB sliders + spectrum ramp; hide miniPaint's extras
		var hide = ['#color_section_picker', '#color_section_swatches'];
		hide.forEach(sel => { var el = panel.querySelector(sel); if (el) el.style.display = 'none'; });
		var top = panel.querySelector('.ui_flex_group');
		if (top) top.style.display = 'none';
		['rgb_a', 'hsl_h', 'hsl_s', 'hsl_l'].forEach((id) => {
			var input = panel.querySelector('#' + id);
			if (input) {
				var group = input.closest('.ui_input_group');
				if (group) group.style.display = 'none';
			}
		});
		var channels = panel.querySelector('#color_section_channels');
		if (channels) {
			channels.style.display = '';
			channels.classList.remove('hidden');
		}

		var chips = document.createElement('div');
		chips.className = 'ps_color_chips';
		chips.innerHTML = '<button type="button" id="ps_color_bg" title="Background color"></button><button type="button" id="ps_color_fg" title="Foreground color"></button>';
		panel.insertBefore(chips, panel.firstChild);
		chips.querySelector('#ps_color_fg').addEventListener('click', () => this.open_color_picker('fg'));
		chips.querySelector('#ps_color_bg').addEventListener('click', () => this.open_color_picker('bg'));

		var ramp = document.createElement('canvas');
		ramp.className = 'ps_spectrum';
		ramp.width = 230;
		ramp.height = 40;
		panel.appendChild(ramp);
		this.draw_spectrum(ramp);
		var pick = (event) => {
			var rect = ramp.getBoundingClientRect();
			var x = Math.max(0, Math.min(ramp.width - 1, (event.clientX - rect.left) * ramp.width / rect.width));
			var y = Math.max(0, Math.min(ramp.height - 1, (event.clientY - rect.top) * ramp.height / rect.height));
			var d = ramp.getContext('2d').getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
			this.set_fg(this.Helper.rgbToHex(d[0], d[1], d[2]));
		};
		var down = false;
		ramp.addEventListener('mousedown', (e) => { if (e.button == 0) { down = true; pick(e); } });
		//CS6: right-click the ramp for its type
		ramp.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			var o = this.ramp_options();
			var mode = (v, name) => ({ name: name, checked: o.mode == v, action: () => this.set_ramp({ mode: v }) });
			show_popup_menu(ramp, [
				mode('rgb', 'RGB Spectrum'), mode('cmyk', 'CMYK Spectrum'), mode('gray', 'Grayscale Ramp'), mode('current', 'Current Colors'),
				{ divider: true },
				{ name: 'Make Ramp Web Safe', checked: o.web_safe, action: () => this.set_ramp({ web_safe: !o.web_safe }) },
			], { point: { x: e.clientX, y: e.clientY } });
		});
		document.addEventListener('mousemove', (e) => { if (down) pick(e); });
		document.addEventListener('mouseup', () => { down = false; });
	}

	ramp_options() {
		if (!this.ramp) {
			try { this.ramp = JSON.parse(localStorage.getItem('pshot_color_ramp_v1') || 'null'); } catch (e) { this.ramp = null; }
			this.ramp = Object.assign({ mode: 'rgb', web_safe: false }, this.ramp || {});
		}
		return this.ramp;
	}

	set_ramp(changes) {
		Object.assign(this.ramp_options(), changes);
		try { localStorage.setItem('pshot_color_ramp_v1', JSON.stringify(this.ramp)); } catch (e) { /* storage blocked */ }
		var c = document.querySelector('canvas.ps_spectrum');
		if (c) this.draw_spectrum(c);
	}

	/**
	 * the Color panel ramp: RGB / CMYK spectrum, grayscale, or foreground to background
	 */
	draw_spectrum(canvas) {
		var ctx = canvas.getContext('2d', { willReadFrequently: true });
		var w = canvas.width;
		var h = canvas.height;
		var o = this.ramp_options();
		this.ramp_colors = config.COLOR + config.BG_COLOR;
		if (o.mode == 'gray' || o.mode == 'current') {
			var g = ctx.createLinearGradient(0, 0, w, 0);
			g.addColorStop(0, o.mode == 'gray' ? '#000000' : config.COLOR);
			g.addColorStop(1, o.mode == 'gray' ? '#ffffff' : config.BG_COLOR);
			ctx.fillStyle = g;
			ctx.fillRect(0, 0, w, h);
			this.ramp_finish(ctx, w, h, o);
			return;
		}
		var hue = ctx.createLinearGradient(0, 0, w, 0);
		['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000'].forEach((c, i) => hue.addColorStop(i / 6, c));
		ctx.fillStyle = hue;
		ctx.fillRect(0, 0, w, h);
		var shade = ctx.createLinearGradient(0, 0, 0, h);
		shade.addColorStop(0, 'rgba(255,255,255,1)');
		shade.addColorStop(0.5, 'rgba(255,255,255,0)');
		shade.addColorStop(0.5, 'rgba(0,0,0,0)');
		shade.addColorStop(1, 'rgba(0,0,0,1)');
		ctx.fillStyle = shade;
		ctx.fillRect(0, 0, w, h);
		this.ramp_finish(ctx, w, h, o);
	}

	ramp_finish(ctx, w, h, o) {
		if (o.mode != 'cmyk' && !o.web_safe) return;
		var img = ctx.getImageData(0, 0, w, h), d = img.data;
		for (var i = 0; i < d.length; i += 4) {
			if (o.mode == 'cmyk') {
				//inside a typical CMYK gamut: less saturated, slightly darker brights
				var l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
				for (var k = 0; k < 3; k++) d[i + k] = Math.min(235, l + (d[i + k] - l) * 0.78);
			}
			if (o.web_safe) for (var j = 0; j < 3; j++) d[i + j] = Math.round(d[i + j] / 51) * 51;
		}
		ctx.putImageData(img, 0, 0);
	}

	/**
	 * Swatches panel: the CS6 default set, editable (saved in the browser)
	 */
	swatch_list() {
		if (!this.swatches) {
			try { this.swatches = JSON.parse(localStorage.getItem('pshot_swatches_v1') || 'null'); } catch (e) { this.swatches = null; }
			if (!Array.isArray(this.swatches)) this.swatches = SWATCHES.map(hex => ({ hex: hex, name: hex }));
		}
		return this.swatches;
	}

	save_swatches() {
		try { localStorage.setItem('pshot_swatches_v1', JSON.stringify(this.swatches)); } catch (e) { /* storage blocked */ }
		this.render_swatches();
	}

	new_swatch() {
		var hex = config.COLOR;
		prompt_name('Color Swatch Name', 'Swatch ' + (this.swatch_list().length + 1), (name) => {
			this.swatch_list().push({ hex: hex, name: name });
			this.save_swatches();
		});
	}

	render_swatches() {
		var el = document.getElementById('ps_swatches');
		var html = '<div class="ps_swatch_grid">';
		this.swatch_list().forEach((sw, i) => {
			html += '<button type="button" class="ps_swatch" style="background:' + sw.hex + '" data-hex="' + sw.hex + '" data-i="' + i + '" title="' + this.Helper.escapeHtml(sw.name) + '"></button>';
		});
		html += '</div><div class="ps_panel_footer">'
			+ '<button type="button" data-sw="new" title="Create new swatch of foreground color"><svg viewBox="0 0 18 18" width="16" height="16"><rect x="4" y="3" width="10" height="12" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M11 3v3h3" fill="none" stroke="currentColor" stroke-width="1.2"/></svg></button>'
			+ '<button type="button" data-sw="delete" title="Delete swatch (Alt+click a swatch)"><svg viewBox="0 0 18 18" width="16" height="16"><path d="M5 5h8l-.8 10H5.8zM4 5h10M7.5 3h3" fill="none" stroke="currentColor" stroke-width="1.2"/></svg></button></div>';
		el.innerHTML = html;
		if (el.dataset.events) return;
		el.dataset.events = '1';
		var remove = (i) => { this.swatch_list().splice(i, 1); this.save_swatches(); };
		el.addEventListener('click', (event) => {
			var b = event.target.closest('[data-sw]');
			if (b) {
				if (b.dataset.sw == 'new') this.new_swatch();
				else this.status_message('Alt+click a swatch, or right-click it, to delete it.');
				return;
			}
			var swatch = event.target.closest('.ps_swatch');
			if (!swatch) {
				//CS6: clicking the empty area adds the foreground color
				if (event.target.closest('.ps_swatch_grid')) this.new_swatch();
				return;
			}
			if (event.altKey) {
				remove(parseInt(swatch.dataset.i));
			}
			else if (event.ctrlKey || event.metaKey) {
				config.BG_COLOR = swatch.dataset.hex;
				this.render_fg_bg();
			}
			else {
				this.set_fg(swatch.dataset.hex);
			}
		});
		el.addEventListener('contextmenu', (event) => {
			var swatch = event.target.closest('.ps_swatch');
			if (!swatch) return;
			event.preventDefault();
			var i = parseInt(swatch.dataset.i), sw = this.swatch_list()[i];
			show_popup_menu(swatch, [
				{ name: 'New Swatch...', action: () => this.new_swatch() },
				{ name: 'Rename Swatch...', action: () => prompt_name('Color Swatch Name', sw.name, (n) => { sw.name = n; this.save_swatches(); }) },
				{ name: 'Delete Swatch', action: () => remove(i) },
			], { point: { x: event.clientX, y: event.clientY } });
		});
	}

	render_adjustments_panel() {
		var el = document.getElementById('ps_adjustments');
		var html = '<div class="ps_adjust_title">Add an adjustment</div><div class="ps_adjust_grid">';
		ADJUSTMENTS.forEach((adj, i) => {
			if (i == 4 || i == 11) {
				html += '<div class="ps_adjust_break"></div>';
			}
			html += '<button type="button" class="ps_adjust' + (adj[3] ? '' : ' disabled') + '" data-index="' + i + '" title="' + adj[0] + '">'
				+ '<svg viewBox="0 0 18 18" width="18" height="18">' + adj[2] + '</svg></button>';
		});
		html += '</div>';
		el.innerHTML = html;
		el.addEventListener('click', (event) => {
			var button = event.target.closest('.ps_adjust');
			if (!button || button.classList.contains('disabled')) return;
			//CS6: the Adjustments panel adds an adjustment layer
			this.Adjustment_layers.create(ADJUSTMENTS[button.dataset.index][3]);
		});
	}

	render_styles_panel() {
		var el = document.getElementById('ps_styles');
		var styles = [
			'linear-gradient(#fff,#fff)', 'linear-gradient(135deg,#3a7bd5,#00d2ff)', 'linear-gradient(135deg,#f7971e,#ffd200)',
			'linear-gradient(135deg,#8e2de2,#4a00e0)', 'linear-gradient(#bbb,#555)', 'linear-gradient(135deg,#d31027,#ea384d)',
			'repeating-linear-gradient(45deg,#777 0 3px,#999 3px 6px)', 'linear-gradient(135deg,#11998e,#38ef7d)',
			'radial-gradient(#fff,#888)', 'linear-gradient(135deg,#c79081,#dfa579)', 'linear-gradient(#444,#111)',
			'linear-gradient(135deg,#ece9e6,#ffffff)', 'linear-gradient(135deg,#614385,#516395)', 'linear-gradient(135deg,#e96443,#904e95)',
			'linear-gradient(135deg,#00c6ff,#0072ff)', 'linear-gradient(135deg,#f12711,#f5af19)',
		];
		var html = '<div class="ps_style_grid disabled" title="Layer styles are not available in pshot yet">';
		for (var s of styles) {
			html += '<span class="ps_style" style="background:' + s + '"></span>';
		}
		html += '</div>';
		el.innerHTML = html;
	}
}

export default Ps_workspace_class;
