/*
 * pshot - CS6 painting model: brush/pencil strokes land on the active pixel layer.
 *
 * miniPaint draws every stroke into its own vector "brush"/"pencil" layer. When
 * the stroke started on a pixel layer, rasterize the stroke into that layer,
 * drop the temporary layer and fold everything into one history state.
 */

import app from './../app.js';
import config from './../config.js';

// options bar Mode -> canvas composite operation
const BLEND_OPS = {
	'Normal': 'source-over', 'Behind': 'destination-over', 'Clear': 'destination-out',
	'Darken': 'darken', 'Multiply': 'multiply', 'Color Burn': 'color-burn', 'Lighten': 'lighten', 'Screen': 'screen',
	'Color Dodge': 'color-dodge', 'Linear Dodge (Add)': 'lighter', 'Overlay': 'overlay', 'Soft Light': 'soft-light',
	'Hard Light': 'hard-light', 'Difference': 'difference', 'Exclusion': 'exclusion', 'Hue': 'hue',
	'Saturation': 'saturation', 'Color': 'color', 'Luminosity': 'luminosity',
};

async function commit_stroke(tool, pending, label) {
	await pending;
	var target_id = tool.paint_target;
	tool.paint_target = null;
	if (target_id == null) {
		return;
	}
	var temp = config.layer;
	var Selection = app.GUI.Ps_workspace.Selection;
	if (Selection.quick_mask && temp && temp.type == tool.name) {
		//Quick Mask mode: the stroke edits the selection, not the pixels
		var qstroke = app.Layers.convert_layer_to_canvas(temp.id, false, false);
		var qopacity = (temp.opacity == null ? 100 : temp.opacity) / 100;
		await app.State.do_action(new app.Actions.Bundle_action(tool.name + '_tool', label, [
			new app.Actions.Delete_layer_action(temp.id, true),
		]), { merge_with_history: ['new_' + tool.name + '_layer'] });
		if (target_id !== 'self' && target_id != null && app.Layers.get_layer(target_id)) {
			await app.State.do_action(new app.Actions.Select_layer_action(target_id, true));
		}
		//the temp-layer bookkeeping above is not a step of its own
		app.State.action_history.pop();
		app.State.action_history_index = app.State.action_history.length;
		await Selection.paint_quick_mask(qstroke, tool.name == 'gradient' ? null : config.COLOR, qopacity, label);
		return;
	}
	if (target_id === 'self') {
		//stroke on an empty layer: miniPaint turned that layer into the stroke; make it a pixel layer
		if (!temp || temp.type != tool.name) {
			return;
		}
		var full = app.Layers.convert_layer_to_canvas(temp.id, false, false);
		app.GUI.Ps_workspace.Selection.clip_document_canvas(full);
		await app.State.do_action(
			new app.Actions.Bundle_action(tool.name + '_tool', label, [
				new app.Actions.Delete_layer_action(temp.id, true),
				new app.Actions.Insert_layer_action({
					name: temp.name, type: 'image', order: temp.order, ps_parent: temp.ps_parent || null,
					x: 0, y: 0, width: full.width, height: full.height,
					width_original: full.width, height_original: full.height,
					opacity: temp.opacity == null ? 100 : temp.opacity,
					data: full.toDataURL('image/png'),
				}, false),
			]),
			{ merge_with_history: ['new_' + tool.name + '_layer'] }
		);
		rename_last(label);
		return;
	}
	var target = app.Layers.get_layer(target_id);
	var mask_target = !!(target && target.ps_mask && target.ps_mask_editing);
	if (!target || (!mask_target && (target.type != 'image' || !target.link)) || !temp || temp.type != tool.name) {
		return;
	}

	var stroke = app.Layers.convert_layer_to_canvas(temp.id, false, false);
	//CS6: painting is limited to the active selection
	app.GUI.Ps_workspace.Selection.clip_document_canvas(stroke);

	//painting on a layer mask: the stroke edits the mask, not the pixels
	var Mask = app.GUI.Ps_workspace.Mask;
	if (Mask.is_editing(target)) {
		var opacity = (temp.opacity == null ? 100 : temp.opacity) / 100;
		var mask = Mask.painted_mask(target, stroke, tool.name == 'gradient' ? null : config.COLOR, opacity);
		await app.State.do_action(
			new app.Actions.Bundle_action(tool.name + '_tool', label, [
				new app.Actions.Delete_layer_action(temp.id, true),
				new app.Actions.Select_layer_action(target.id, true),
				new app.Actions.Update_layer_action(target.id, { ps_mask: mask }),
			]),
			{ merge_with_history: ['new_' + tool.name + '_layer'] }
		);
		rename_last(label);
		return;
	}
	var canvas = document.createElement('canvas');
	canvas.width = target.width_original;
	canvas.height = target.height_original;
	var ctx = canvas.getContext('2d');
	ctx.drawImage(target.link, 0, 0);
	var sx = target.width_original / target.width;
	var sy = target.height_original / target.height;
	ctx.setTransform(sx, 0, 0, sy, -target.x * sx, -target.y * sy);
	ctx.globalAlpha = (temp.opacity == null ? 100 : temp.opacity) / 100;
	ctx.globalCompositeOperation = BLEND_OPS[temp.params && temp.params.blend] || 'source-over';
	if (target.ps_lock && target.ps_lock.transparent) {
		//Lock transparent pixels: paint only where the layer already has pixels
		ctx.globalCompositeOperation = 'source-atop';
	}
	ctx.drawImage(stroke, 0, 0);

	await app.State.do_action(
		new app.Actions.Bundle_action(tool.name + '_tool', label, [
			new app.Actions.Update_layer_image_action(canvas, target.id),
			new app.Actions.Delete_layer_action(temp.id, true),
			new app.Actions.Select_layer_action(target.id, true),
		]),
		{ merge_with_history: ['new_' + tool.name + '_layer'] }
	);
	rename_last(label);
}

function rename_last(label) {
	var history = app.State.action_history;
	if (history.length) {
		history[history.length - 1].action_description = label;
	}
}

export { commit_stroke, BLEND_OPS };
