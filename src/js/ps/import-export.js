/*
 * pshot - CS6 File > Import > Video Frames to Layers and Notes, File > Export >
 * Paths to Illustrator.
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';
import { file_to_layers, is_psd } from './document.js';
import filesaver from './../../../node_modules/file-saver/dist/FileSaver.min.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

function pick(accept, multiple) {
	return new Promise((resolve) => {
		var input = document.createElement('input');
		input.type = 'file';
		input.multiple = !!multiple;
		input.accept = accept;
		input.addEventListener('change', () => resolve(Array.from(input.files || [])));
		input.click();
	});
}

class Ps_import_export_class {

	/**
	 * File > Import > Notes: the annotations of a PSD file join the document's notes
	 */
	async import_notes() {
		var files = await pick('.psd');
		if (!files.length) return;
		if (!is_psd(files[0])) {
			alertify.error('Could not import notes because the file is not a Photoshop document.');
			return;
		}
		var doc = await file_to_layers(files[0]);
		var notes = app.GUI.Ps_workspace.Notes.from_psd(doc.annotations);
		if (!notes.length) {
			app.GUI.Ps_workspace.status_message('The file has no notes.');
			return;
		}
		await app.GUI.Ps_workspace.Notes.commit((config.ps_notes || []).concat(notes), 'Import Notes');
		app.GUI.Ps_workspace.status_message(notes.length + ' note' + (notes.length == 1 ? '' : 's') + ' imported.');
	}

	/**
	 * File > Export > Paths to Illustrator
	 */
	paths_to_illustrator() {
		var paths = (config.ps_paths || []).filter(p => p.subpaths && p.subpaths.length);
		var choices = ['Document Bounds', 'All Paths'].concat(paths.map(p => p.name));
		var POP = new Dialog_class();
		POP.show({
			title: 'Export Paths to File',
			params: [{ name: 'write', title: 'Paths:', values: choices, value: paths.length ? 'All Paths' : 'Document Bounds', type: 'select' }],
			on_finish: (p) => {
				var list = p.write == 'Document Bounds' ? [] : (p.write == 'All Paths' ? paths : paths.filter(x => x.name == p.write));
				var name = app.GUI.Ps_workspace.document_name().replace(/\.[^.]+$/, '');
				filesaver.saveAs(new Blob([this.ai_file(list)], { type: 'application/postscript' }), name + '.ai');
			},
		});
	}

	/**
	 * Adobe Illustrator 3 (PostScript) file with the paths unpainted, y up
	 */
	ai_file(paths) {
		var W = config.WIDTH, H = config.HEIGHT;
		var f = (v) => (Math.round(v * 1000) / 1000).toString();
		var pt = (x, y) => f(x) + ' ' + f(H - y);
		var out = [
			'%!PS-Adobe-2.0 EPSF-1.2',
			'%%Creator: pshot',
			'%%BoundingBox: 0 0 ' + W + ' ' + H,
			'%%HiResBoundingBox: 0 0 ' + W + ' ' + H,
			'%AI3_Cropmarks: 0 0 ' + W + ' ' + H,
			'%%DocumentProcessColors: Black',
			'%AI5_FileFormat 2',
			'%AI3_TemplateBox: ' + W / 2 + ' ' + H / 2 + ' ' + W / 2 + ' ' + H / 2,
			'%%EndComments',
			'%%EndProlog',
			'%%BeginSetup',
			'%%EndSetup',
			'0 A',
			'0 R',
			'0 G',
			'0 i 0 J 0 j 1 w 4 M []0 d',
		];
		for (var path of paths) {
			out.push('%%Note: ' + path.name.replace(/[\r\n]+/g, ' '));
			for (var sp of path.subpaths) {
				var pts = sp.pts;
				if (!pts.length) continue;
				out.push(pt(pts[0].x, pts[0].y) + ' m');
				var n = sp.closed ? pts.length : pts.length - 1;
				for (var i = 0; i < n; i++) {
					var a = pts[i], b = pts[(i + 1) % pts.length];
					var straight = a.ox == a.x && a.oy == a.y && b.ix == b.x && b.iy == b.y;
					out.push(straight ? pt(b.x, b.y) + ' L' : pt(a.ox, a.oy) + ' ' + pt(b.ix, b.iy) + ' ' + pt(b.x, b.y) + ' C');
				}
				out.push(sp.closed ? 'N' : 'n');
			}
		}
		out.push('%%PageTrailer', 'gsave annotatepage grestore showpage', '%%Trailer', 'Adobe_IllustratorA_AI3 /terminate get exec', '%%EOF');
		return out.join('\r') + '\r';
	}

	/**
	 * File > Import > Video Frames to Layers
	 */
	async video_frames() {
		var files = await pick('video/*');
		if (!files.length) return;
		var url = URL.createObjectURL(files[0]);
		var video = document.createElement('video');
		video.muted = true;
		video.preload = 'auto';
		video.src = url;
		try {
			await new Promise((resolve, reject) => {
				video.addEventListener('loadeddata', resolve, { once: true });
				video.addEventListener('error', () => reject(new Error('decode')), { once: true });
			});
		} catch (e) {
			URL.revokeObjectURL(url);
			alertify.error('Could not import the video because the file format is not supported by this browser.');
			return;
		}
		var duration = video.duration || 0;
		var POP = new Dialog_class();
		POP.show({
			title: 'Import Video To Layers',
			params: [
				{ name: 'range', title: 'Range To Import:', values: ['From Beginning to End', 'Selected Range Only'], value: 'From Beginning to End' },
				{ name: 'start', title: 'Start (seconds):', value: 0 },
				{ name: 'end', title: 'End (seconds):', value: Math.round(duration * 100) / 100 },
				{ name: 'every', title: 'Limit To Every (frames):', value: 2 },
				{ title: '', html: '<span class="ps_dialog_note">' + files[0].name + ', ' + video.videoWidth + ' x ' + video.videoHeight + ', ' + duration.toFixed(2) + ' s (frames at 30 fps, at most 500 layers)</span>' },
			],
			on_finish: (p) => this.import_frames(video, url, files[0].name, p),
			on_cancel: () => URL.revokeObjectURL(url),
		});
	}

	async import_frames(video, url, file_name, p) {
		var ws = app.GUI.Ps_workspace;
		var duration = video.duration || 0;
		var start = p.range == 'Selected Range Only' ? Math.max(0, parseFloat(p.start) || 0) : 0;
		var end = p.range == 'Selected Range Only' ? Math.min(duration, parseFloat(p.end) || duration) : duration;
		var step = Math.max(1, parseInt(p.every) || 1) / 30;
		var times = [];
		for (var t = start; t <= end + 1e-6 && times.length < 500; t += step) times.push(Math.min(t, Math.max(0, duration - 0.001)));
		var W = video.videoWidth, H = video.videoHeight;
		var frames = [];
		for (var i = 0; i < times.length; i++) {
			ws.status_message('Importing frame ' + (i + 1) + ' of ' + times.length + '...');
			await new Promise((resolve) => {
				video.addEventListener('seeked', resolve, { once: true });
				video.currentTime = times[i];
			});
			var c = document.createElement('canvas');
			c.width = W;
			c.height = H;
			c.getContext('2d').drawImage(video, 0, 0, W, H);
			frames.push(c);
		}
		URL.revokeObjectURL(url);
		if (!frames.length) return;
		ws.Documents.add(file_name.replace(/\.[^.]+$/, ''));
		var actions = [new app.Actions.Prepare_canvas_action('undo'), new app.Actions.Update_config_action({ WIDTH: W, HEIGHT: H }), new app.Actions.Reset_layers_action()];
		frames.forEach((c, k) => {
			actions.push(new app.Actions.Insert_layer_action({
				name: 'Layer ' + (k + 1), type: 'image', x: 0, y: 0, width: W, height: H, width_original: W, height_original: H,
				data: c.toDataURL('image/png'), order: k + 1,
			}, false));
		});
		actions.push(new app.Actions.Prepare_canvas_action('do'));
		await app.State.do_action(new app.Actions.Bundle_action('open', 'Import Video Frames', actions));
		app.GUI.modules['ps/commands'].purge_histories();
		app.GUI.GUI_preview.zoom_open();
		app.GUI.GUI_layers.render_layers();
		ws.status_message(frames.length + ' frames imported as layers.');
	}
}

export default Ps_import_export_class;
