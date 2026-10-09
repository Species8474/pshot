/*
 * pshot - Photoshop CS6 workspace: toolbox, panel dock, icon strip, history,
 * document tab, status bar, screen modes. Built on top of miniPaint's GUI.
 */

import app from './../app.js';
import config from './../config.js';
import Helper_class from './../libs/helpers.js';
import Dialog_class from './../libs/popup.js';
import GUI_colors_class from './../core/gui/gui-colors.js';
import { groups } from './tools-def.js';
import { ADJUSTMENTS, run_target } from './adjustments-def.js';
import { show_popup_menu, close_popup_menu } from './popup-menu.js';
import menuDefinition from './../config-menu.js';
import Ps_keymap_class from './keymap.js';
import Ps_options_bar_class from './options-bar.js';
import Ps_documents_class from './documents.js';
import Ps_selection_class from './selection.js';
import Ps_mask_class from './mask.js';
import Ps_transform_class from './transform.js';
import Ps_groups_class from './groups.js';
import Ps_styles_class from './styles.js';
import { install_pixel_layer_guard } from './pixel-layer.js';
import { install_move_selection } from './move-selection.js';

const PANEL_TITLES = {
	color: 'Color', swatches: 'Swatches', adjustments: 'Adjustments', styles: 'Styles',
	layers: 'Layers', channels: 'Channels', paths: 'Paths',
	history: 'History', properties: 'Properties', navigator: 'Navigator', info: 'Info',
};

const STRIP_ICONS = {
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
		this.Styles = new Ps_styles_class();
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
		this.Keymap.install();
		install_pixel_layer_guard();
		install_move_selection();
		this.render_document_tab();
		this.render_history();
		this.render_channels();

		setInterval(() => this.tick(), 250);
		window.addEventListener('resize', () => this.relayout());
		this.relayout();
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
		this.render_document_tab();
		this.render_statusbar();
		this.render_fg_bg();
		var signature = app.State.action_history_index + ':' + app.State.action_history.length;
		if (signature !== this.last_history_signature) {
			this.last_history_signature = signature;
			this.Groups.normalize();
			this.render_history();
			app.GUI.GUI_layers.render_layers();
			this.render_channels();
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
		this.active_member = member;
		var tool_config = config.TOOLS.find(t => t.name == member.tool);
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
		app.GUI.GUI_tools.activate_tool(member.tool).then(() => {
			//re-render options when only the preset changed
			app.GUI.GUI_tools.show_action_attributes();
		});
		this.highlight_active();
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
		if (tool_config.name == 'gradient') {
			attrs.color_1 = config.COLOR;
			attrs.color_2 = config.BG_COLOR;
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

	render_fg_bg() {
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
			var items = [
				{ name: 'Essentials (Default)', checked: true, action: () => this.reset_workspace() },
				{ name: '3D' }, { name: 'Motion' }, { name: 'Painting' }, { name: 'Photography' }, { name: 'Typography' },
				{ divider: true },
				{ name: 'Reset Essentials', action: () => this.reset_workspace() },
				{ name: 'New Workspace...' }, { name: 'Delete Workspace...' },
			];
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
				{ name: 'New Group...', action: () => run_target('ps/commands.new_group') },
				{ name: 'New Group from Layers...', action: () => run_target('ps/commands.group_layers') },
				{ divider: true },
				{ name: 'Lock Layers...' },
				{ divider: true },
				{ name: 'Convert to Smart Object' },
				{ divider: true },
				{ name: 'Edit Contents' },
				{ name: 'Blending Options...', action: () => run_target('layer/composition.composition') },
				{ divider: true },
				{ name: 'Create Clipping Mask', shortcut: 'Alt+Ctrl+G', action: () => run_target('ps/commands.toggle_clipping_mask') },
				{ divider: true },
				{ name: 'Link Layers' }, { name: 'Select Linked Layers' },
				{ divider: true },
				{ name: 'Merge Down', shortcut: 'Ctrl+E', action: () => run_target('layer/merge.merge') },
				{ name: 'Merge Visible', shortcut: 'Shift+Ctrl+E', action: () => run_target('ps/commands.merge_visible') },
				{ name: 'Flatten Image', action: () => run_target('layer/flatten.flatten') },
				{ divider: true },
				{ name: 'Animation Options' }, { name: 'Panel Options...' },
				{ divider: true },
				{ name: 'Close', action: () => this.toggle_panel('layers') },
				{ name: 'Close Tab Group', action: () => this.toggle_panel('layers') },
			];
		}
		else if (panel == 'history') {
			items = [
				{ name: 'Step Forward', shortcut: 'Shift+Ctrl+Z', action: () => run_target('edit/redo.redo') },
				{ name: 'Step Backward', shortcut: 'Alt+Ctrl+Z', action: () => run_target('edit/undo.undo') },
				{ divider: true },
				{ name: 'New Snapshot...' }, { name: 'Delete' },
				{ name: 'Clear History', action: () => run_target('ps/commands.purge_histories') },
				{ divider: true },
				{ name: 'New Document' }, { name: 'History Options...' },
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
		switch (key) {
			case 'screen_mode_standard': return this.screen_mode == 'standard';
			case 'screen_mode_menu': return this.screen_mode == 'menu';
			case 'screen_mode_full': return this.screen_mode == 'full';
			case 'extras': return this.extras;
			case 'grid': return app.GUI.grid == true;
			case 'guides': return config.guides_enabled == true;
			case 'rulers': return config.ruler_active == true;
			case 'snap': return config.SNAP == true;
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
		this.relayout();
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
		return this.Helper.escapeHtml(name) + ' @ ' + zoom + ' (' + this.Helper.escapeHtml(layer) + ', RGB/8)';
	}

	render_document_tab() {
		var docs = this.Documents.docs;
		var active = this.Documents.active;
		var labels = docs.map((doc, i) => {
			if (i == active) {
				return this.tab_label(doc.name, this.format_zoom(), config.layer ? config.layer.name : '');
			}
			var st = doc.state;
			var layer = st && st.layer ? st.layer.name : '';
			var z = st ? Math.round(st.ZOOM * 100) + '%' : '100%';
			return this.tab_label(doc.name, z, layer);
		});
		var signature = active + '|' + labels.join('|');
		if (this.last_tab_label === signature) {
			return;
		}
		this.last_tab_label = signature;
		var tabs = document.getElementById('ps_doctabs');
		var html = '';
		labels.forEach((label, i) => {
			html += '<div class="ps_doctab' + (i == active ? ' active' : '') + '" data-index="' + i + '" title="' + label + '">'
				+ '<span class="ps_doctab_label">' + label + '</span>'
				+ '<button type="button" class="ps_doctab_close" data-index="' + i + '" title="Close">&times;</button></div>';
		});
		tabs.innerHTML = html;
		tabs.querySelectorAll('.ps_doctab').forEach((tab) => {
			tab.addEventListener('mousedown', (event) => {
				if (event.target.closest('.ps_doctab_close')) {
					return;
				}
				this.Documents.switch_to(parseInt(tab.dataset.index));
			});
		});
		tabs.querySelectorAll('.ps_doctab_close').forEach((button) => {
			button.addEventListener('click', () => this.Documents.close(parseInt(button.dataset.index)));
		});
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
	// History panel
	// =================================================================

	hook_state() {
		//nothing to patch: tick() watches the history index/length
	}

	render_history() {
		var el = document.getElementById('ps_history');
		if (!el) {
			return;
		}
		var state = app.State;
		var html = '<div class="ps_history_snapshot' + (state.action_history_index == 0 ? ' active' : '') + '" data-index="0">'
			+ '<span class="ps_history_brush"></span><span class="ps_history_thumb"></span><span>' + this.document_name() + '</span></div>';
		html += '<div class="ps_history_list">';
		state.action_history.forEach((action, i) => {
			var classes = 'ps_history_item';
			if (i + 1 == state.action_history_index) classes += ' active';
			if (i + 1 > state.action_history_index) classes += ' undone';
			html += '<div class="' + classes + '" data-index="' + (i + 1) + '"><span class="ps_history_icon"></span>'
				+ this.Helper.escapeHtml(action.action_description) + '</div>';
		});
		html += '</div>';
		html += '<div class="ps_panel_footer"><button type="button" class="disabled" title="Create new document from current state"></button>'
			+ '<button type="button" class="disabled" title="Create new snapshot"></button>'
			+ '<button type="button" class="ps_history_delete" title="Delete current state"></button></div>';
		el.innerHTML = html;
		el.querySelectorAll('[data-index]').forEach((row) => {
			row.addEventListener('click', () => this.goto_history(parseInt(row.dataset.index)));
		});
		var list = el.querySelector('.ps_history_list');
		var active = el.querySelector('.ps_history_item.active');
		if (active) {
			list.scrollTop = active.offsetTop - list.clientHeight + active.offsetHeight * 2;
		}
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

	render_channels() {
		var el = document.getElementById('ps_channels');
		if (!el) {
			return;
		}
		if (!el.dataset.ready) {
			var rows = [['RGB', 'Ctrl+2', null], ['Red', 'Ctrl+3', 0], ['Green', 'Ctrl+4', 1], ['Blue', 'Ctrl+5', 2]];
			var html = '';
			for (var row of rows) {
				html += '<div class="ps_channel_row' + (row[0] == 'RGB' ? '' : '') + ' active">'
					+ '<span class="ps_eye on"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8z" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="2.2" fill="currentColor"/></svg></span>'
					+ '<canvas class="ps_thumb" width="32" height="32" data-channel="' + (row[2] === null ? 'rgb' : row[2]) + '"></canvas>'
					+ '<span class="ps_layer_name">' + row[0] + '</span><span class="ps_channel_key">' + row[1] + '</span></div>';
			}
			html += '<div class="ps_panel_footer"><button type="button" class="disabled" title="Load channel as selection"></button>'
				+ '<button type="button" class="disabled" title="Save selection as channel"></button>'
				+ '<button type="button" class="disabled" title="Create new channel"></button>'
				+ '<button type="button" class="disabled" title="Delete current channel"></button></div>';
			el.innerHTML = html;
			el.dataset.ready = '1';
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
			var c = parseInt(canvas.dataset.channel);
			var out = ctx.createImageData(source.width, source.height);
			for (var i = 0; i < data.data.length; i += 4) {
				var a = data.data[i + 3] / 255;
				var v = Math.round(data.data[i + c] * a + 255 * (1 - a));
				out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
				out.data[i + 3] = 255;
			}
			ctx.putImageData(out, ox, oy);
		});
	}

	render_paths_panel() {
		document.getElementById('ps_paths').innerHTML = '<div class="ps_empty_panel"></div>'
			+ '<div class="ps_panel_footer"><button type="button" class="disabled" title="Fill path with foreground color"></button>'
			+ '<button type="button" class="disabled" title="Stroke path with brush"></button>'
			+ '<button type="button" class="disabled" title="Load path as a selection"></button>'
			+ '<button type="button" class="disabled" title="Make work path from selection"></button>'
			+ '<button type="button" class="disabled" title="Add a mask"></button>'
			+ '<button type="button" class="disabled" title="Create new path"></button>'
			+ '<button type="button" class="disabled" title="Delete current path"></button></div>';
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
		ramp.addEventListener('mousedown', (e) => { down = true; pick(e); });
		document.addEventListener('mousemove', (e) => { if (down) pick(e); });
		document.addEventListener('mouseup', () => { down = false; });
	}

	draw_spectrum(canvas) {
		var ctx = canvas.getContext('2d');
		var w = canvas.width;
		var h = canvas.height;
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
	}

	render_swatches() {
		var el = document.getElementById('ps_swatches');
		var html = '<div class="ps_swatch_grid">';
		for (var hex of SWATCHES) {
			html += '<button type="button" class="ps_swatch" style="background:' + hex + '" data-hex="' + hex + '" title="' + hex + '"></button>';
		}
		html += '</div>';
		el.innerHTML = html;
		el.addEventListener('click', (event) => {
			var swatch = event.target.closest('.ps_swatch');
			if (!swatch) return;
			if (event.ctrlKey || event.metaKey) {
				config.BG_COLOR = swatch.dataset.hex;
				this.render_fg_bg();
			}
			else {
				this.set_fg(swatch.dataset.hex);
			}
		});
	}

	render_adjustments_panel() {
		var el = document.getElementById('ps_adjustments');
		var html = '<div class="ps_adjust_title">Add an adjustment</div><div class="ps_adjust_grid">';
		ADJUSTMENTS.forEach((adj, i) => {
			if (i == 4 || i == 11) {
				html += '<div class="ps_adjust_break"></div>';
			}
			html += '<button type="button" class="ps_adjust' + (adj[1] ? '' : ' disabled') + '" data-index="' + i + '" title="' + adj[0] + '">'
				+ '<svg viewBox="0 0 18 18" width="18" height="18">' + adj[2] + '</svg></button>';
		});
		html += '</div>';
		el.innerHTML = html;
		el.addEventListener('click', (event) => {
			var button = event.target.closest('.ps_adjust');
			if (!button || button.classList.contains('disabled')) return;
			run_target(ADJUSTMENTS[button.dataset.index][1]);
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
