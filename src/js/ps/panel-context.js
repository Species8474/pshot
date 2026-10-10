/*
 * pshot - CS6 right-click menus on panels and the document window: Paths and
 * Channels rows, History states and snapshots, document tabs and the rulers.
 */

import app from './../app.js';
import config from './../config.js';
import { show_popup_menu } from './popup-menu.js';

function cmd(name, param) {
	return () => app.GUI.modules['ps/commands'][name](param);
}

function paths_items(row) {
	var P = app.GUI.Ps_workspace.Paths;
	var index = row.dataset.index == 'layer' ? 'layer' : parseInt(row.dataset.index);
	if (config.ps_path_active !== index) {
		config.ps_path_active = index;
		P.selected = null;
		P.changed();
	}
	//the panel menu's path commands (without New Path and the panel items)
	var items = P.panel_menu_items();
	var end = items.findIndex(it => it.name == 'Panel Options...');
	return items.slice(1, end > 0 ? end - 1 : items.length);
}

function channel_items(row) {
	var ws = app.GUI.Ps_workspace, A = ws.Alpha;
	if (row.dataset.alpha != null) {
		var i = parseInt(row.dataset.alpha);
		if (config.ps_alpha_active != i) {
			config.ps_alpha_active = i;
			ws.render_channels(true);
		}
		return [
			{ name: 'Duplicate Channel...', action: () => A.duplicate_channel(i) },
			{ name: 'Delete Channel', action: () => A.delete_channel() },
			{ divider: true },
			{ name: 'Channel Options...', action: () => A.channel_options(i) },
		];
	}
	var thumb = row.querySelector('canvas[data-channel]');
	var ch = { 0: 'r', 1: 'g', 2: 'b' }[thumb ? thumb.dataset.channel : ''] || 'rgb';
	//the composite can be duplicated only as Gray (grayscale documents)
	var gray = config.ps_mode == 'Grayscale';
	return [
		{ name: 'Duplicate Channel...', action: ch == 'rgb' && !gray ? null : () => A.duplicate_channel(ch) },
		{ name: 'Delete Channel' },
		{ divider: true },
		{ name: 'Channel Options...' },
	];
}

/**
 * History: Delete removes the state and every state after it
 */
async function delete_state(index) {
	var ws = app.GUI.Ps_workspace, state = app.State;
	if (index < 1) return;
	await ws.goto_history(index - 1);
	var removed = state.action_history.splice(index - 1);
	for (var action of removed) {
		try { action.free(); } catch (e) { /* nothing to free */ }
	}
	ws.render_history();
}

function history_items(row) {
	var ws = app.GUI.Ps_workspace, state = app.State;
	if (row.dataset.snapshot != null) {
		var si = parseInt(row.dataset.snapshot);
		return [
			{ name: 'New Document', action: () => ws.restore_snapshot(si).then(cmd('duplicate_document')) },
			{ name: 'New Snapshot...', action: () => ws.create_snapshot() },
			{ name: 'Delete', action: () => { ws.Documents.current().snapshots.splice(si, 1); ws.render_history(); } },
			{ name: 'Clear History', action: cmd('purge_histories') },
		];
	}
	var index = parseInt(row.dataset.index);
	return [
		{ name: 'Step Forward', action: state.can_redo() ? () => ws.goto_history(state.action_history_index + 1) : null },
		{ name: 'Step Backward', action: state.can_undo() ? () => ws.goto_history(state.action_history_index - 1) : null },
		{ divider: true },
		{ name: 'New Document', action: () => ws.goto_history(index).then(cmd('duplicate_document')) },
		{ name: 'New Snapshot...', action: () => ws.goto_history(index).then(() => ws.create_snapshot()) },
		{ name: 'Delete', action: index > 0 ? () => delete_state(index) : null },
		{ name: 'Clear History', action: cmd('purge_histories') },
	];
}

function doctab_items(tab) {
	var docs = app.GUI.Ps_workspace.Documents;
	var i = parseInt(tab.dataset.index);
	return [
		{ name: 'Move to New Window', action: () => { app.GUI.Ps_workspace.Documents.switch_to(i); app.GUI.Ps_workspace.Float.float_current(); } },
		{ divider: true },
		{ name: 'Close', action: () => docs.close(i) },
		{ name: 'Close All', action: cmd('close_all') },
		{ divider: true },
		{ name: 'New Document...', action: cmd('new_document') },
		{ name: 'Open Document...', action: cmd('open') },
		{ divider: true },
		{ name: 'Reveal in Explorer' },
	];
}

const UNITS = [['Pixels', 'pixels'], ['Inches', 'inches'], ['Centimeters', 'centimeters'], ['Millimeters', 'millimetres'], ['Points', null], ['Picas', null], ['Percent', null]];

function ruler_items() {
	var settings = app.GUI.modules['tools/settings'];
	var current = settings ? settings.get_setting('default_units') : 'pixels';
	return UNITS.map(([name, key]) => ({
		name: name,
		checked: key == current,
		action: key && settings ? () => {
			settings.save_setting('default_units', key);
			settings.save_setting('default_units_short', settings.default_units_config[key]);
			app.GUI.GUI_information.update_units();
			config.need_render = true;
		} : null,
	}));
}

function install() {
	document.addEventListener('contextmenu', (event) => {
		var t = event.target;
		var row, items = null;
		if ((row = t.closest('.ps_path_row'))) items = paths_items(row);
		else if ((row = t.closest('.ps_channel_row'))) items = channel_items(row);
		else if ((row = t.closest('.ps_history_item, .ps_history_snapshot'))) items = history_items(row);
		else if ((row = t.closest('.ps_doctab'))) items = doctab_items(row);
		else if ((row = t.closest('#ruler_top, #ruler_left'))) items = ruler_items();
		if (!row) return;
		event.preventDefault();
		if (items) show_popup_menu(row, items, { point: { x: event.clientX, y: event.clientY } });
	});
}

export { install as install_panel_context_menus, delete_state };
