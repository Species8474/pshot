/*
 * pshot - CS6 color management: Edit > Color Settings, Assign Profile,
 * Convert to Profile. RGB profiles are defined by their primaries, white
 * point and tone curve; conversions go through XYZ (Bradford adaptation
 * between D50 and D65). A document with a profile other than sRGB is shown
 * converted to sRGB (the monitor); Convert to Profile changes the pixels so
 * the colors look the same in the new space.
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';

const D65 = [0.95047, 1, 1.08883], D50 = [0.96422, 1, 0.82521];
const PROFILES = {
	'sRGB IEC61966-2.1': { r: [0.64, 0.33], g: [0.30, 0.60], b: [0.15, 0.06], white: D65, trc: 'srgb' },
	'Adobe RGB (1998)': { r: [0.64, 0.33], g: [0.21, 0.71], b: [0.15, 0.06], white: D65, trc: 563 / 256 },
	'Apple RGB': { r: [0.625, 0.34], g: [0.28, 0.595], b: [0.155, 0.07], white: D65, trc: 1.8 },
	'ColorMatch RGB': { r: [0.63, 0.34], g: [0.295, 0.605], b: [0.15, 0.075], white: D50, trc: 1.8 },
	'ProPhoto RGB': { r: [0.7347, 0.2653], g: [0.1596, 0.8404], b: [0.0366, 0.0001], white: D50, trc: 1.8 },
};
const SRGB = 'sRGB IEC61966-2.1';
const CMYK_SPACES = ['U.S. Web Coated (SWOP) v2', 'U.S. Sheetfed Coated v2', 'U.S. Web Uncoated v2', 'Coated FOGRA39 (ISO 12647-2:2004)', 'Japan Color 2001 Coated'];
const GRAY_SPACES = ['Dot Gain 20%', 'Dot Gain 15%', 'Gray Gamma 2.2', 'Gray Gamma 1.8'];
const POLICIES = ['Off', 'Preserve Embedded Profiles', 'Convert to Working RGB'];
const PRESETS = ['North America General Purpose 2', 'North America Prepress 2', 'North America Web/Internet', 'Monitor Color', 'Custom'];

function mat_mul(a, b) {
	var o = [];
	for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
	return o;
}

function mat_inv(m) {
	var [a, b, c, d, e, f, g, h, i] = m;
	var A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
	return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

function mat_vec(m, v) {
	return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}

/**
 * linear RGB -> XYZ for the profile's primaries and white
 */
function rgb_to_xyz(p) {
	var col = (xy) => [xy[0] / xy[1], 1, (1 - xy[0] - xy[1]) / xy[1]];
	var R = col(p.r), G = col(p.g), B = col(p.b);
	var M = [R[0], G[0], B[0], R[1], G[1], B[1], R[2], G[2], B[2]];
	var S = mat_vec(mat_inv(M), p.white);
	return [M[0] * S[0], M[1] * S[1], M[2] * S[2], M[3] * S[0], M[4] * S[1], M[5] * S[2], M[6] * S[0], M[7] * S[1], M[8] * S[2]];
}

//Bradford chromatic adaptation between white points
const BRADFORD = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296];
function adapt(from, to) {
	if (from === to) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
	var a = mat_vec(BRADFORD, from), b = mat_vec(BRADFORD, to);
	var D = [b[0] / a[0], 0, 0, 0, b[1] / a[1], 0, 0, 0, b[2] / a[2]];
	return mat_mul(mat_inv(BRADFORD), mat_mul(D, BRADFORD));
}

function decode(v, trc) {
	if (trc == 'srgb') return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
	return Math.pow(v, trc);
}

function encode(v, trc) {
	v = Math.max(0, Math.min(1, v));
	if (trc == 'srgb') return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
	return Math.pow(v, 1 / trc);
}

/**
 * (r, g, b) in `from` -> (r, g, b) in `to`, 0..255; null when nothing changes
 */
function converter(from, to) {
	var a = PROFILES[from], b = PROFILES[to];
	if (!a || !b || from == to) return null;
	var M = mat_mul(mat_inv(rgb_to_xyz(b)), mat_mul(adapt(a.white, b.white), rgb_to_xyz(a)));
	var lut = [new Float32Array(256)];
	for (var i = 0; i < 256; i++) lut[0][i] = decode(i / 255, a.trc);
	return (r, g, bb) => {
		var o = mat_vec(M, [lut[0][r], lut[0][g], lut[0][bb]]);
		return [Math.round(encode(o[0], b.trc) * 255), Math.round(encode(o[1], b.trc) * 255), Math.round(encode(o[2], b.trc) * 255)];
	};
}

function load_settings() {
	var s = null;
	try { s = JSON.parse(localStorage.getItem('pshot_color_settings_v1') || 'null'); } catch (e) { s = null; }
	return Object.assign({ preset: PRESETS[0], rgb: SRGB, cmyk: CMYK_SPACES[0], gray: GRAY_SPACES[0], policy_rgb: POLICIES[1], policy_cmyk: POLICIES[1], policy_gray: POLICIES[1], ask_open: true, ask_paste: true, ask_missing: true }, s || {});
}

class Ps_color_management_class {

	settings() {
		return this.cached || (this.cached = load_settings());
	}

	/**
	 * the document's profile name (RGB documents default to sRGB)
	 */
	profile() {
		if (config.ps_mode == 'CMYK') return config.ps_cmyk_profile || this.settings().cmyk;
		if (config.ps_mode == 'Grayscale') return this.settings().gray;
		return config.ps_profile === undefined || config.ps_profile === null ? SRGB : config.ps_profile;
	}

	/**
	 * display conversion for the active document (null = none needed)
	 */
	display_converter() {
		var p = config.ps_profile;
		if (!p || p == SRGB || p == 'none' || config.ps_mode == 'CMYK' || config.ps_mode == 'Grayscale') return null;
		if (this.display_key !== p) {
			this.display_key = p;
			this.display_fn = converter(p, SRGB);
		}
		return this.display_fn;
	}

	color_settings() {
		var s = this.settings();
		var POP = new Dialog_class();
		POP.show({
			title: 'Color Settings',
			params: [
				{ name: 'preset', title: 'Settings:', values: PRESETS, value: s.preset, type: 'select' },
				{ title: 'Working Spaces' },
				{ name: 'rgb', title: 'RGB:', values: Object.keys(PROFILES), value: s.rgb, type: 'select' },
				{ name: 'cmyk', title: 'CMYK:', values: CMYK_SPACES, value: s.cmyk, type: 'select' },
				{ name: 'gray', title: 'Gray:', values: GRAY_SPACES, value: s.gray, type: 'select' },
				{ title: 'Color Management Policies' },
				{ name: 'policy_rgb', title: 'RGB:', values: POLICIES, value: s.policy_rgb, type: 'select' },
				{ name: 'policy_cmyk', title: 'CMYK:', values: POLICIES.map(p => p.replace('RGB', 'CMYK')), value: s.policy_cmyk.replace('RGB', 'CMYK'), type: 'select' },
				{ name: 'policy_gray', title: 'Gray:', values: POLICIES.map(p => p.replace('RGB', 'Gray')), value: s.policy_gray.replace('RGB', 'Gray'), type: 'select' },
				{ name: 'ask_open', title: 'Profile Mismatches: Ask When Opening', value: s.ask_open },
				{ name: 'ask_paste', title: 'Profile Mismatches: Ask When Pasting', value: s.ask_paste },
				{ name: 'ask_missing', title: 'Missing Profiles: Ask When Opening', value: s.ask_missing },
			],
			on_finish: (p) => {
				var next = Object.assign({}, s, p, { policy_cmyk: p.policy_cmyk.replace('CMYK', 'RGB'), policy_gray: p.policy_gray.replace('Gray', 'RGB') });
				this.cached = next;
				try { localStorage.setItem('pshot_color_settings_v1', JSON.stringify(next)); } catch (e) { /* storage blocked */ }
				config.need_render = true;
			},
		});
	}

	assign_profile() {
		var cmyk = config.ps_mode == 'CMYK';
		var names = cmyk ? CMYK_SPACES : Object.keys(PROFILES);
		var working = cmyk ? this.settings().cmyk : this.settings().rgb;
		var cur = this.profile();
		var POP = new Dialog_class();
		POP.show({
			title: 'Assign Profile',
			params: [
				{ title: 'Assign Profile:' },
				{ name: 'how', title: '', values: ['Don\'t Color Manage This Document', 'Working ' + (cmyk ? 'CMYK' : 'RGB') + ': ' + working, 'Profile:'], value: config.ps_profile == 'none' ? 'Don\'t Color Manage This Document' : (cur == working ? 'Working ' + (cmyk ? 'CMYK' : 'RGB') + ': ' + working : 'Profile:') },
				{ name: 'profile', title: 'Profile:', values: names, value: names.includes(cur) ? cur : names[0], type: 'select' },
			],
			on_finish: (p) => {
				var value = p.how.indexOf('Don') == 0 ? 'none' : (p.how.indexOf('Working') == 0 ? working : p.profile);
				var key = cmyk ? 'ps_cmyk_profile' : 'ps_profile';
				app.State.do_action(new app.Actions.Bundle_action('assign_profile', 'Assign Profile', [
					new app.Actions.Update_config_action({ [key]: value }),
				])).then(() => { config.need_render = true; });
			},
		});
	}

	convert_profile() {
		var cmyk = config.ps_mode == 'CMYK';
		var names = cmyk ? CMYK_SPACES : Object.keys(PROFILES);
		var src = this.profile();
		var POP = new Dialog_class();
		POP.show({
			title: 'Convert to Profile',
			params: [
				{ title: 'Source Space', value: 'Profile: ' + (src == 'none' ? 'Untagged RGB' : src) },
				{ name: 'dest', title: 'Destination Space Profile:', values: names, value: names.find(n => n != src) || names[0], type: 'select' },
				{ name: 'engine', title: 'Engine:', values: ['Adobe (ACE)'], value: 'Adobe (ACE)', type: 'select' },
				{ name: 'intent', title: 'Intent:', values: ['Perceptual', 'Saturation', 'Relative Colorimetric', 'Absolute Colorimetric'], value: 'Relative Colorimetric', type: 'select' },
				{ name: 'bpc', title: 'Use Black Point Compensation', value: true },
				{ name: 'dither', title: 'Use Dither', value: true },
				{ name: 'flatten', title: 'Flatten Image to Preserve Appearance', value: false },
			],
			on_finish: async (p) => {
				var commands = app.GUI.modules['ps/commands'];
				if (p.flatten && config.layers.length > 1) await commands.flatten_image();
				var actions = [];
				if (!cmyk) {
					var fn = converter(src == 'none' ? SRGB : src, p.dest);
					if (fn) actions = commands.map_layer_colors(fn);
				}
				actions.push(new app.Actions.Update_config_action({ [cmyk ? 'ps_cmyk_profile' : 'ps_profile']: p.dest }));
				await app.State.do_action(new app.Actions.Bundle_action('convert_profile', 'Convert to Profile', actions));
				config.need_render = true;
			},
		});
	}
}

export default Ps_color_management_class;
export { converter, PROFILES, SRGB };
