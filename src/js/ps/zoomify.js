/*
 * pshot - CS6 File > Export > Zoomify: the flattened image as a Zoomify tile
 * pyramid (ImageProperties.xml, TileGroupN/z-x-y.jpg, 256 px tiles) plus an
 * HTML page with a small pan / zoom viewer, downloaded as one zip.
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';
import { make_zip } from './zip.js';

const TILE = 256;
const TEMPLATES = { 'Zoomify Viewer (Black Background)': '#000000', 'Zoomify Viewer (Gray Background)': '#808080', 'Zoomify Viewer (White Background)': '#ffffff' };

function half(c) {
	var o = document.createElement('canvas');
	o.width = Math.max(1, Math.ceil(c.width / 2));
	o.height = Math.max(1, Math.ceil(c.height / 2));
	var ctx = o.getContext('2d');
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(c, 0, 0, o.width, o.height);
	return o;
}

function blob_bytes(canvas, quality) {
	return new Promise((resolve) => canvas.toBlob((b) => b.arrayBuffer().then(buf => resolve(new Uint8Array(buf))), 'image/jpeg', quality));
}

function viewer_html(name, dir, w, h, tiers, bg, vw, vh) {
	return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${name}</title>
<style>html,body{margin:0;height:100%;background:${bg};}#v{display:block;margin:0 auto;max-width:100%;cursor:grab;touch-action:none;}#v:active{cursor:grabbing;}</style></head>
<body><canvas id="v" width="${vw}" height="${vh}"></canvas>
<script>
const W=${w},H=${h},T=${TILE},TIERS=${JSON.stringify(tiers)},DIR=${JSON.stringify(dir)};
const cv=document.getElementById('v'),ctx=cv.getContext('2d'),cache={};
let s=Math.min(cv.width/W,cv.height/H),ox=(cv.width-W*s)/2,oy=(cv.height-H*s)/2;
const start=[0];for(let i=0;i<TIERS.length;i++)start.push(start[i]+Math.ceil(TIERS[i][0]/T)*Math.ceil(TIERS[i][1]/T));
function tile(z,x,y){const k=z+'-'+x+'-'+y;if(cache[k])return cache[k];const cols=Math.ceil(TIERS[z][0]/T),g=Math.floor((start[z]+y*cols+x)/256);const im=new Image();im.onload=draw;im.src=DIR+'/TileGroup'+g+'/'+k+'.jpg';return cache[k]=im;}
function draw(){ctx.fillStyle=${JSON.stringify(bg)};ctx.fillRect(0,0,cv.width,cv.height);let z=TIERS.length-1;while(z>0&&TIERS[z-1][0]>=W*s)z--;const f=TIERS[z][0]/W;
for(let y=0;y<Math.ceil(TIERS[z][1]/T);y++)for(let x=0;x<Math.ceil(TIERS[z][0]/T);x++){const px=ox+x*T/f*s,py=oy+y*T/f*s,tw=Math.min(T,TIERS[z][0]-x*T)/f*s,th=Math.min(T,TIERS[z][1]-y*T)/f*s;if(px>cv.width||py>cv.height||px+tw<0||py+th<0)continue;const im=tile(z,x,y);if(im.complete&&im.naturalWidth)ctx.drawImage(im,px,py,tw,th);}}
cv.addEventListener('wheel',e=>{e.preventDefault();const r=cv.getBoundingClientRect(),mx=(e.clientX-r.left)*cv.width/r.width,my=(e.clientY-r.top)*cv.height/r.height,k=e.deltaY<0?1.25:0.8,ns=Math.max(Math.min(cv.width/W,cv.height/H)/2,Math.min(4,s*k));ox=mx-(mx-ox)*ns/s;oy=my-(my-oy)*ns/s;s=ns;draw();},{passive:false});
let d=null;cv.addEventListener('pointerdown',e=>{d=[e.clientX,e.clientY];cv.setPointerCapture(e.pointerId);});cv.addEventListener('pointermove',e=>{if(!d)return;ox+=e.clientX-d[0];oy+=e.clientY-d[1];d=[e.clientX,e.clientY];draw();});cv.addEventListener('pointerup',()=>{d=null;});
draw();
</script></body></html>`;
}

class Ps_zoomify_class {

	dialog() {
		var doc = app.GUI.Ps_workspace.Documents.current();
		var base = ((doc && doc.name) || 'Untitled').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_');
		var POP = new Dialog_class();
		POP.show({
			title: 'Zoomify Export',
			params: [
				{ name: 'template', title: 'Template:', values: Object.keys(TEMPLATES), value: Object.keys(TEMPLATES)[0], type: 'select' },
				{ name: 'base', title: 'Base Name:', value: base },
				{ title: 'Image Tile Options' },
				{ name: 'quality', title: 'Quality (0-12):', value: 8, range: [0, 12], step: 1 },
				{ title: 'Browser Options' },
				{ name: 'width', title: 'Width (px):', value: 400 },
				{ name: 'height', title: 'Height (px):', value: 400 },
			],
			on_finish: (p) => this.export(p),
		});
	}

	async export(p) {
		var ws = app.GUI.Ps_workspace;
		ws.status_message('Building Zoomify tiles...');
		var flat = document.createElement('canvas');
		flat.width = config.WIDTH;
		flat.height = config.HEIGHT;
		var fctx = flat.getContext('2d');
		var bg = TEMPLATES[p.template] || '#000000';
		fctx.fillStyle = '#ffffff';
		fctx.fillRect(0, 0, flat.width, flat.height);
		app.Layers.convert_layers_to_canvas(fctx, null, false);
		//tiers: smallest (one tile) first
		var levels = [flat];
		while (levels[0].width > TILE || levels[0].height > TILE) levels.unshift(half(levels[0]));
		var quality = Math.max(0.1, Math.min(1, (parseFloat(p.quality) + 1) / 13));
		var name = (p.base || 'image').replace(/[^\w.-]+/g, '_'), dir = name + '_img';
		var files = [], index = 0;
		for (var z = 0; z < levels.length; z++) {
			var lv = levels[z], cols = Math.ceil(lv.width / TILE), rows = Math.ceil(lv.height / TILE);
			for (var y = 0; y < rows; y++) {
				for (var x = 0; x < cols; x++) {
					var t = document.createElement('canvas');
					t.width = Math.min(TILE, lv.width - x * TILE);
					t.height = Math.min(TILE, lv.height - y * TILE);
					t.getContext('2d').drawImage(lv, -x * TILE, -y * TILE);
					files.push({ name: dir + '/TileGroup' + Math.floor(index / 256) + '/' + z + '-' + x + '-' + y + '.jpg', data: await blob_bytes(t, quality) });
					index++;
				}
			}
		}
		var enc = new TextEncoder();
		files.unshift({ name: dir + '/ImageProperties.xml', data: enc.encode('<IMAGE_PROPERTIES WIDTH="' + flat.width + '" HEIGHT="' + flat.height + '" NUMTILES="' + index + '" NUMIMAGES="1" VERSION="1.8" TILESIZE="' + TILE + '" />') });
		var tiers = levels.map(l => [l.width, l.height]);
		files.unshift({ name: name + '.html', data: enc.encode(viewer_html(name, dir, flat.width, flat.height, tiers, bg, Math.max(100, parseInt(p.width) || 400), Math.max(100, parseInt(p.height) || 400))) });
		var a = document.createElement('a');
		a.href = URL.createObjectURL(make_zip(files));
		a.download = name + '_zoomify.zip';
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 10000);
		ws.status_message('Zoomify: ' + index + ' tiles exported.');
		return { tiles: index, tiers: tiers };
	}
}

export default Ps_zoomify_class;
