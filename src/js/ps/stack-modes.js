/*
 * pshot - CS6 Layer > Smart Objects > Stack Mode: a smart object made from
 * several layers keeps them (smart.stack); a stack mode computes every pixel
 * from the values of all layers at that spot (mean, median, ...).
 */

const MODES = ['None', 'Entropy', 'Kurtosis', 'Maximum', 'Mean', 'Median', 'Minimum', 'Range', 'Skewness', 'Standard Deviation', 'Summation', 'Variance'];

function reduce(mode, v, n) {
	if (mode == 'Maximum') return Math.max(...v);
	if (mode == 'Minimum') return Math.min(...v);
	if (mode == 'Range') return Math.max(...v) - Math.min(...v);
	if (mode == 'Summation') return v.reduce((a, b) => a + b, 0);
	if (mode == 'Median') {
		var s = v.slice().sort((a, b) => a - b), m = s.length >> 1;
		return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
	}
	var mean = v.reduce((a, b) => a + b, 0) / n;
	if (mode == 'Mean') return mean;
	var m2 = 0, m3 = 0, m4 = 0;
	for (var x of v) { var d = x - mean; m2 += d * d; m3 += d * d * d; m4 += d * d * d * d; }
	m2 /= n; m3 /= n; m4 /= n;
	if (mode == 'Variance') return m2;
	if (mode == 'Standard Deviation') return Math.sqrt(m2);
	if (mode == 'Skewness') return m2 ? 128 + 64 * m3 / Math.pow(m2, 1.5) : 128;
	if (mode == 'Kurtosis') return m2 ? 40 * m4 / (m2 * m2) : 0;
	if (mode == 'Entropy') {
		var counts = new Map();
		for (var y of v) counts.set(y, (counts.get(y) || 0) + 1);
		var h = 0;
		counts.forEach(c => { var p = c / n; h -= p * Math.log2(p); });
		return n > 1 ? h / Math.log2(n) * 255 : 0;
	}
	return v[v.length - 1];
}

/**
 * stack: canvases (bottom first, same size) -> the combined canvas
 */
function combine(stack, mode) {
	var w = stack[0].width, h = stack[0].height;
	var out = document.createElement('canvas');
	out.width = w;
	out.height = h;
	var octx = out.getContext('2d');
	if (!mode || mode == 'None') {
		for (var c of stack) octx.drawImage(c, 0, 0);
		return out;
	}
	var datas = stack.map(c => c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data);
	var img = octx.createImageData(w, h), d = img.data;
	var vals = [[], [], []];
	for (var i = 0; i < d.length; i += 4) {
		vals[0].length = vals[1].length = vals[2].length = 0;
		var alpha = 0;
		for (var k = 0; k < datas.length; k++) {
			var src = datas[k];
			if (src[i + 3] == 0) continue;
			vals[0].push(src[i]); vals[1].push(src[i + 1]); vals[2].push(src[i + 2]);
			alpha = Math.max(alpha, src[i + 3]);
		}
		var n = vals[0].length;
		if (!n) continue;
		for (var ch = 0; ch < 3; ch++) d[i + ch] = Math.max(0, Math.min(255, Math.round(reduce(mode, vals[ch], n))));
		d[i + 3] = alpha;
	}
	octx.putImageData(img, 0, 0);
	return out;
}

export { MODES as STACK_MODES, combine as combine_stack };
