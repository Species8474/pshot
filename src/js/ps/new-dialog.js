/*
 * pshot - the Photoshop CS6 File > New dialog.
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';

// [name, width px, height px, resolution]
const PRESETS = [
	['Custom', null, null, null],
	['Default Photoshop Size', 504, 360, 72],
	['U.S. Paper - Letter', 2550, 3300, 300],
	['U.S. Paper - Legal', 2550, 4200, 300],
	['International Paper - A4', 2480, 3508, 300],
	['International Paper - A3', 3508, 4961, 300],
	['Photo - 4 x 6', 1200, 1800, 300],
	['Photo - 5 x 7', 1500, 2100, 300],
	['Photo - 8 x 10', 2400, 3000, 300],
	['Web - 800 x 600', 800, 600, 72],
	['Web - 1024 x 768', 1024, 768, 72],
	['Web - 1280 x 1024', 1280, 1024, 72],
	['Web - 1600 x 1200', 1600, 1200, 72],
	['Web - 1920 x 1080', 1920, 1080, 72],
	['Film & Video - HDV/HDTV 720p', 1280, 720, 72],
	['Film & Video - HDTV 1080p', 1920, 1080, 72],
	['Film & Video - UHD 4K', 3840, 2160, 72],
];

const UNITS = { pixels: 1, inches: null, cm: 2.54, mm: 25.4, points: 72, picas: 6 };

function to_px(value, unit, ppi) {
	if (unit == 'pixels') return value;
	if (unit == 'inches') return value * ppi;
	return value / UNITS[unit] * ppi;
}

function from_px(px, unit, ppi) {
	if (unit == 'pixels') return px;
	if (unit == 'inches') return px / ppi;
	return px / ppi * UNITS[unit];
}

function format_size(bytes) {
	if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2).replace(/\.?0+$/, '') + 'M';
	return Math.round(bytes / 1024) + 'K';
}

function show_new_dialog() {
	var POP = new Dialog_class();
	var options = (list, selected) => list.map(v => '<option' + (v == selected ? ' selected' : '') + '>' + v + '</option>').join('');
	var unit_options = options(Object.keys(UNITS), 'pixels');
	var html = '<div class="ps_new">'
		+ '<div class="ps_new_row"><label>Name:</label><input type="text" id="nd_name" value="Untitled-' + (app.GUI.Ps_workspace.Documents.untitled_counter + 1) + '"></div>'
		+ '<div class="ps_new_row"><label>Preset:</label><select id="nd_preset">' + options(PRESETS.map(p => p[0]), 'Default Photoshop Size') + '</select></div>'
		+ '<div class="ps_new_row"><label>Width:</label><input type="number" id="nd_width" min="1" step="any"><select id="nd_wunit">' + unit_options + '</select></div>'
		+ '<div class="ps_new_row"><label>Height:</label><input type="number" id="nd_height" min="1" step="any"><select id="nd_hunit">' + unit_options + '</select></div>'
		+ '<div class="ps_new_row"><label>Resolution:</label><input type="number" id="nd_res" min="1" value="72"><select disabled><option>Pixels/Inch</option></select></div>'
		+ '<div class="ps_new_row"><label>Color Mode:</label><select disabled><option>RGB Color</option></select><select disabled><option>8 bit</option></select></div>'
		+ '<div class="ps_new_row"><label>Background Contents:</label><select id="nd_bg"><option>White</option><option>Background Color</option><option>Transparent</option></select></div>'
		+ '<div class="ps_new_size"><span>Image Size:</span><b id="nd_size"></b></div>'
		+ '</div>';
	var state = { w: 504, h: 360, ppi: 72 };
	POP.show({
		title: 'New',
		params: [{ function() { return html; } }],
		on_finish() {
			var name = (document.getElementById('nd_name') ? document.getElementById('nd_name').value : '') || null;
			var bg = state.bg || 'White';
			create_document(name, Math.max(1, Math.round(state.w)), Math.max(1, Math.round(state.h)), bg);
		},
	});
	var root = document.querySelector('#popups .popup .ps_new');
	var $ = (id) => root.querySelector('#' + id);
	var render = () => {
		$('nd_width').value = +from_px(state.w, $('nd_wunit').value, state.ppi).toFixed(3);
		$('nd_height').value = +from_px(state.h, $('nd_hunit').value, state.ppi).toFixed(3);
		$('nd_res').value = state.ppi;
		$('nd_size').textContent = format_size(Math.round(state.w) * Math.round(state.h) * 3);
	};
	$('nd_preset').addEventListener('change', () => {
		var preset = PRESETS.find(p => p[0] == $('nd_preset').value);
		if (preset && preset[1]) {
			state.w = preset[1];
			state.h = preset[2];
			state.ppi = preset[3];
		}
		render();
	});
	var custom = () => { $('nd_preset').value = 'Custom'; };
	$('nd_width').addEventListener('input', () => { var v = parseFloat($('nd_width').value); if (v > 0) { state.w = to_px(v, $('nd_wunit').value, state.ppi); custom(); $('nd_size').textContent = format_size(Math.round(state.w) * Math.round(state.h) * 3); } });
	$('nd_height').addEventListener('input', () => { var v = parseFloat($('nd_height').value); if (v > 0) { state.h = to_px(v, $('nd_hunit').value, state.ppi); custom(); $('nd_size').textContent = format_size(Math.round(state.w) * Math.round(state.h) * 3); } });
	$('nd_wunit').addEventListener('change', render);
	$('nd_hunit').addEventListener('change', render);
	$('nd_res').addEventListener('input', () => { var v = parseFloat($('nd_res').value); if (v > 0) { state.ppi = v; } });
	$('nd_bg').addEventListener('change', () => { state.bg = $('nd_bg').value; });
	render();
	$('nd_name').focus();
	$('nd_name').select();
}

/**
 * opens a new document tab with the given size and background contents
 */
function create_document(name, width, height, background) {
	var transparent = background == 'Transparent';
	config.ps_new_background = background == 'Background Color' ? config.BG_COLOR : '#ffffff';
	var handler = app.GUI.modules['file/new'];
	return handler.new_handler({
		width: width,
		height: height,
		resolution_type: 'Custom',
		layout: 'Custom',
		transparency: transparent,
	}).then(() => {
		config.ps_new_background = null;
		if (name) {
			app.GUI.Ps_workspace.Documents.rename_current(name);
		}
	});
}

export { show_new_dialog, create_document };
