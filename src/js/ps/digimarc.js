/*
 * pshot - CS6 Filter > Digimarc > Embed Watermark / Read Watermark.
 *
 * A spread-spectrum watermark: a 48-bit payload (creator ID, copyright year,
 * the three image attributes and a checksum) is added to the luminance as a
 * faint pseudo-random pattern, repeated in 32x32 tiles. Reading correlates the
 * image's fine detail with the same pattern. Durability sets the strength.
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';
import { ensure_pixel_layer, alert_box } from './pixel-layer.js';

const TILE = 32, BITS = 48;

function rng(seed) {
	var s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		var t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

//every tile pixel: which payload bit it carries and its +/-1 chip
var layout = null;
function tile_layout() {
	if (layout) return layout;
	var r = rng(0x5eed1234), n = TILE * TILE;
	var bit = new Uint8Array(n), chip = new Int8Array(n);
	var order = Array.from({ length: n }, (_, i) => i);
	for (var i = n - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
	order.forEach((p, k) => { bit[p] = k % BITS; chip[p] = r() < 0.5 ? -1 : 1; });
	layout = { bit: bit, chip: chip };
	return layout;
}

function checksum(id, year, flags) {
	var h = (id * 2654435761 + year * 40503 + flags * 977) >>> 0;
	return (h ^ (h >>> 9) ^ (h >>> 18)) & 0x1ff;
}

function pack(id, year, flags) {
	var bits = [];
	var put = (v, n) => { for (var i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
	put(id, 24); put(year, 12); put(flags, 3); put(checksum(id, year, flags), 9);
	return bits;
}

function unpack(bits) {
	var pos = 0;
	var get = (n) => { var v = 0; for (var i = 0; i < n; i++) v = (v << 1) | bits[pos++]; return v >>> 0; };
	var id = get(24), year = get(12), flags = get(3), sum = get(9);
	return sum == checksum(id, year, flags) ? { id: id, year: year, flags: flags } : null;
}

/**
 * adds the payload to RGBA data (in place)
 */
function embed(data, w, h, bits, strength) {
	var L = tile_layout();
	for (var y = 0; y < h; y++) {
		for (var x = 0; x < w; x++) {
			var t = (y % TILE) * TILE + (x % TILE), o = (y * w + x) * 4;
			if (data[o + 3] == 0) continue;
			var d = strength * L.chip[t] * (bits[L.bit[t]] ? 1 : -1);
			data[o] = data[o] + d; data[o + 1] = data[o + 1] + d; data[o + 2] = data[o + 2] + d;
		}
	}
}

/**
 * correlates the image's fine detail with the pattern; null when nothing is found
 */
function read(data, w, h) {
	var L = tile_layout();
	var lum = new Float32Array(w * h);
	for (var i = 0; i < w * h; i++) lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
	var sums = new Float64Array(BITS), mags = new Float64Array(BITS);
	for (var y = 1; y < h - 1; y++) {
		for (var x = 1; x < w - 1; x++) {
			var k = y * w + x;
			//high-pass: the pixel minus its neighbours' mean
			var hp = lum[k] - (lum[k - 1] + lum[k + 1] + lum[k - w] + lum[k + w]) / 4;
			var t = (y % TILE) * TILE + (x % TILE);
			sums[L.bit[t]] += hp * L.chip[t];
			mags[L.bit[t]] += Math.abs(hp);
		}
	}
	var bits = Array.from(sums, v => (v > 0 ? 1 : 0));
	var found = unpack(bits);
	if (!found) return null;
	//confidence: how clearly the correlations stand out
	var z = 0;
	for (var b = 0; b < BITS; b++) z += Math.abs(sums[b]) / Math.max(1e-6, mags[b]);
	found.strength = z / BITS;
	return found;
}

const ATTRS = ['Restricted Use', 'Do Not Copy', 'Adult Content'];

class Ps_digimarc_class {

	pixels(layer) {
		var c = document.createElement('canvas');
		c.width = layer.width_original;
		c.height = layer.height_original;
		var ctx = c.getContext('2d', { willReadFrequently: true });
		ctx.drawImage(layer.link, 0, 0);
		return { canvas: c, ctx: ctx, img: ctx.getImageData(0, 0, c.width, c.height) };
	}

	embed_dialog() {
		ensure_pixel_layer();
		var layer = config.layer;
		if (!layer || layer.type != 'image' || !layer.link) {
			alert_box('Could not complete the Embed Watermark command because the active layer is not a pixel layer.');
			return;
		}
		var existing = read(this.pixels(layer).img.data, layer.width_original, layer.height_original);
		if (existing) {
			alert_box('This image already has a Digimarc watermark (Creator ID ' + existing.id + ').');
			return;
		}
		var POP = new Dialog_class();
		POP.show({
			title: 'Embed Watermark',
			params: [
				{ name: 'id', title: 'Digimarc ID:', value: this.last_id || 'PictureMarc Demo' },
				{ name: 'year', title: 'Copyright Year:', value: new Date().getFullYear() },
				{ name: 'restricted', title: 'Restricted Use', value: false },
				{ name: 'nocopy', title: 'Do Not Copy', value: false },
				{ name: 'adult', title: 'Adult Content', value: false },
				{ name: 'target', title: 'Target Output:', values: ['Monitor', 'Web', 'Print'], value: 'Web', type: 'select' },
				{ name: 'durability', title: 'Watermark Durability:', value: 2, range: [1, 4], step: 1 },
				{ name: 'verify', title: 'Verify', value: true },
			],
			on_finish: (p) => {
				var id = parseInt(String(p.id).replace(/\D/g, '')) || 0;
				this.last_id = p.id;
				var year = Math.max(0, Math.min(4095, parseInt(p.year) || 0));
				var flags = (p.restricted ? 1 : 0) | (p.nocopy ? 2 : 0) | (p.adult ? 4 : 0);
				var target = { Monitor: 0.8, Web: 1, Print: 1.4 }[p.target] || 1;
				var strength = (1 + (parseFloat(p.durability) || 2)) * target;
				this.embed(layer, id & 0xffffff, year, flags, strength, !!p.verify);
			},
		});
	}

	async embed(layer, id, year, flags, strength, verify) {
		var px = this.pixels(layer);
		embed(px.img.data, px.canvas.width, px.canvas.height, pack(id, year, flags), strength);
		px.ctx.putImageData(px.img, 0, 0);
		await app.State.do_action(new app.Actions.Bundle_action('embed_watermark', 'Embed Watermark', [
			new app.Actions.Update_layer_image_action(px.canvas, layer.id),
		]));
		if (verify) this.read_dialog(true);
	}

	read_dialog(verify) {
		var layer = config.layer;
		if (!layer || layer.type != 'image' || !layer.link) {
			alert_box('Could not find a watermark: the active layer is not a pixel layer.');
			return;
		}
		var found = read(this.pixels(layer).img.data, layer.width_original, layer.height_original);
		if (!found) {
			alert_box('No watermark was found.');
			return;
		}
		var attrs = ATTRS.filter((a, i) => found.flags & (1 << i));
		var meter = Math.max(1, Math.min(4, Math.round(found.strength * 8)));
		var POP = new Dialog_class();
		POP.show({
			title: verify ? 'Embed Watermark: Verify' : 'Watermark Information',
			params: [
				{ title: 'Creator ID:', value: String(found.id) },
				{ title: 'Copyright Year:', value: String(found.year || '-') },
				{ title: 'Image Attributes:', value: attrs.join(', ') || 'None' },
				{ title: 'Signal Strength:', value: ['Low', 'Medium', 'Strong', 'Very Strong'][meter - 1] },
			],
		});
	}
}

export default Ps_digimarc_class;
export { embed, read, pack, unpack };
