//main config file

var config = {};

config.TRANSPARENCY = false;
config.TRANSPARENCY_TYPE = 'squares'; //squares, green, grey
config.LANG = 'en';
config.WIDTH = null;
config.HEIGHT = null;
config.visible_width = null;
config.visible_height = null;
config.COLOR = '#000000';
config.BG_COLOR = '#ffffff';
config.ALPHA = 255;
config.ZOOM = 1;
config.SNAP = true;
config.ps_snap_to = { guides: true, grid: true, layers: true, slices: true, bounds: true };
config.ps_slices = [];
config.ps_char_styles = [];
config.ps_para_styles = [];
config.ps_slice_selected = null;
config.pixabay_key = '3ca2cd8af3fde33af218bea02-9021417';
config.safe_search_can_be_disabled = true;
config.google_webfonts_key = 'AIzaSyBES3AipG'+'YVYNLtS,Vk-hJ11bbhJ9sTpRbA'.replace(',', '');
config.layers = [];
config.layer = null;
config.need_render = false;
config.need_render_changed_params = false; // Set specifically when param change in layer details triggered render
config.mouse = {};
config.mouse_lock = null;
config.swatches = {
	default: [] // Only default used right now, object format for swatch swapping in future.
};
config.user_fonts = {};
config.guides_enabled = true;
config.guides = [];
config.ruler_active = false;
config.enable_autoresize_by_default = true;

//requires styles in reset.css
config.themes = [
	'cs6',
	'dark',
	'light',
	'green',
];

//no-translate BEGIN
config.FONTS = [
	"Arial",
	"Courier",
	"Impact",
	"Helvetica",
	"Monospace",
	"Tahoma",
	"Times New Roman",
	"Verdana",
	"Amatic SC",
	"Arimo",
	"Codystar",
	"Creepster",
	"Indie Flower",
	"Lato",
	"Lora",
	"Merriweather",
	"Monoton",
	"Montserrat",
	"Mukta",
	"Muli",
	"Nosifer",
	"Nunito",
	"Oswald",
	"Orbitron",
	"Pacifico",
	"PT Sans",
	"PT Serif",
	"Playfair Display",
	"Poppins",
	"Raleway",
	"Roboto",
	"Rubik",
	"Special Elite",
	"Tangerine",
	"Titillium Web",
	"Ubuntu"
];
//no-translate END

config.TOOLS = [
	{
		name: 'ps_pcrop',
		title: 'Perspective Crop',
		on_activate: 'on_activate',
		attributes: {
			pc_w: '',
			pc_h: '',
			pc_res: '',
			pc_res_unit: 'pixels/inch',
			pc_grid: true,
		},
	},
	{
		name: 'ps_rotate_view',
		title: 'Rotate View',
		attributes: {
			rotate_all: false,
		},
	},
	{
		name: 'ps_slice',
		title: 'Slice',
		on_activate: 'on_activate',
		attributes: {
			mode: 'slice',
			slice_style: 'Normal',
			slice_w: 64,
			slice_h: 64,
		},
	},
	{
		name: 'ps_measure',
		title: 'Measure',
		on_activate: 'on_activate',
		attributes: {
			mode: 'ruler',
			use_scale: false,
			sample_size: 'Point Sample',
			note_author: '',
			note_color: '#ffde4a',
		},
	},
	{
		name: 'ps_pen',
		title: 'Pen',
		on_activate: 'on_activate',
		on_leave: 'on_leave',
		attributes: {
			mode: 'pen',
			pen_mode: 'Path',
			auto_add: true,
			align_edges: false,
			curve_fit: 2,
			//Freeform Pen > Magnetic: Width, Contrast, Frequency (as the Magnetic Lasso)
			magnetic: false,
			width: 10,
			contrast: 10,
			frequency: 57,
		},
	},
	{
		name: 'ps_path_select',
		title: 'Path Selection',
		on_activate: 'on_activate',
		attributes: {
			mode: 'path',
		},
	},
	{
		name: 'ps_patch',
		title: 'Patch',
		on_activate: 'on_activate',
		attributes: {
			mode: 'patch',
			patch_type: 'Normal',
			patch_dir: 'Source',
			patch_transparent: false,
			pattern: 'Checkerboard',
			move_mode: 'Move',
			adaptation: 'Medium',
			sample_all: false,
		},
	},
	{
		name: 'retouch',
		title: 'Retouch',
		attributes: {
			size: 30,
			mode: 'smudge',
			strength: 50,
			opacity: 100,
			pattern: 'Checkerboard',
			protect_fg: false,
			replace_mode: 'Color',
			sampling: 'Continuous',
			limits: 'Contiguous',
			tolerance: 30,
			art_style: 'Tight Short',
			area: 50,
			wet: 50,
			load: 50,
			mix: 50,
			flow: 100,
			load_each: true,
			clean_each: true,
			mixer_preset: 'Custom',
			aligned: true,
			sample: 'Current Layer',
			hardness: 100,
			eraser_mode: 'Brush',
			to_history: false,
			blend: 'Normal',
			pattern_aligned: true,
			heal_mode: 'Normal',
			heal_source: 'Sampled',
			heal_aligned: true,
			heal_sample: 'Current Layer',
			focus_mode: 'Normal',
			sample_all: false,
			protect_detail: true,
			finger_painting: false,
		},
	},
	{
		name: 'dodge_burn',
		title: 'Dodge / Burn',
		attributes: {
			size: 50,
			mode: 'dodge',
			range: 'Midtones',
			exposure: 50,
			protect_tones: true,
			sponge_mode: 'Desaturate',
			flow: 50,
			vibrance: true,
		},
	},
	{
		name: 'ps_select',
		title: 'Selection Tools',
		on_activate: 'on_activate',
		on_leave: 'on_leave',
		attributes: {
			mode: 'rect',
			op: 'new',
			feather: 0,
			anti_alias: true,
			tolerance: 32,
			contiguous: true,
			sample_all: false,
			brush: 20,
			width: 10,
			contrast: 10,
			frequency: 57,
			sample_size: 'Point Sample',
			auto_enhance: false,
			style: 'Normal',
			ratio_w: 1,
			ratio_h: 1,
			size_w: 64,
			size_h: 64,
		},
	},
	{
		name: 'hand',
		title: 'Hand Tool',
		on_activate: 'on_activate',
		attributes: {
			scroll_all: false,
		},
	},
	{
		name: 'zoom',
		title: 'Zoom Tool',
		on_activate: 'on_activate',
		attributes: {
			resize_windows: false,
			zoom_all: false,
			scrubby: true,
		},
	},
	{
		name: 'select',
		title: 'Select object tool',
		attributes: {
			auto_select: true,
			auto_select_target: 'Layer',
			show_transform: false,
		},
	},
	{
		name: 'selection',
		attributes: {},
		on_leave: 'on_leave',
	},
	{
		name: 'brush',
		attributes: {
			size: 4,
			hardness: 100,
			spacing: 25,
			angle: 0,
			roundness: 100,
			flow: 100,
			size_jitter: 0,
			angle_jitter: 0,
			roundness_jitter: 0,
			min_roundness: 25,
			scatter: 0,
			both_axes: false,
			count: 1,
			count_jitter: 0,
			color_dynamics: false,
			fgbg_jitter: 0,
			hue_jitter: 0,
			sat_jitter: 0,
			bright_jitter: 0,
			purity: 0,
			opacity_jitter: 0,
			noise: false,
			wet_edges: false,
			pressure: false,
			opacity: 100,
			blend: 'Normal',
			tip: '',
			//Brush panel: Texture, Dual Brush, Brush Pose, Build-up (airbrush), Smoothing, Protect Texture
			texture: false,
			texture_pattern: '',
			texture_scale: 100,
			texture_depth: 100,
			texture_invert: false,
			texture_mode: 'Multiply',
			dual: false,
			dual_tip: '',
			dual_size: 25,
			dual_spacing: 25,
			dual_scatter: 0,
			dual_count: 1,
			pose: false,
			pose_angle: 0,
			pose_roundness: 100,
			pose_pressure: 100,
			airbrush: false,
			smoothing: true,
			protect_texture: false,
		},
	},
	{
		name: 'pencil',
		attributes: {
			size: 1,
			pressure: false,
			opacity: 100,
			blend: 'Normal',
			auto_erase: false,
		},
	},
	{
		name: 'pick_color',
		attributes: {
			global: false,
			sample: 'Current Layer',
			sample_size: 'Point Sample',
			show_ring: true,
		},
	},
	{
		name: 'erase',
		on_update: 'on_params_update',
		attributes: {
			size: 30,
			circle: true,
			strict: true,
		},
	},
	{
		name: 'magic_erase',
		title: 'Magic Eraser Tool',
		attributes: {
			tolerance: 32,
			anti_aliasing: true,
			contiguous: true,
			sample_all: false,
			opacity: 100,
		},
	},
	{
		name: 'fill',
		attributes: {
			source: 'Foreground',
			pattern: 'Checkerboard',
			blend: 'Normal',
			opacity: 100,
			tolerance: 32,
			anti_aliasing: true,
			contiguous: true,
			all_layers: false,
		},
	},
	{
		name: 'shape',
		on_activate: 'on_activate',
		title: 'Shapes (H)',
		attributes: {
			size: 3,
			stroke: '#00aa00',
		},
	},
	{
		name: 'line',
		visible: false,
		attributes: {
			size: 4,
			shape_mode: 'Shape',
		},
	},
	{
		name: 'arrow',
		visible: false,
		attributes: {
			size: 4,
		},
	},
	{
		name: 'rectangle',
		visible: false,
		attributes: {
			stroke_dash: 'solid',
			stroke_align: 'center',
			stroke_cap: 'butt',
			stroke_join: 'miter',
			align_edges: true,
			shape_w: 0,
			shape_h: 0,
			border_size: 3,
			border: false,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
			radius: {
				value: 0,
				min: 0,
			},
			square: false,
			shape_mode: 'Shape',
			custom: '',
		},
	},
	{
		name: 'ellipse',
		visible: false,
		attributes: {
			stroke_dash: 'solid',
			stroke_align: 'center',
			stroke_cap: 'butt',
			stroke_join: 'miter',
			align_edges: true,
			shape_w: 0,
			shape_h: 0,
			border_size: 3,
			border: false,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
			circle: false,
			shape_mode: 'Shape',
		},
	},
	{
		name: 'media',
		title: 'Search Images',
		on_activate: 'on_activate',
		attributes: {
			size: 30,
		},
	},
	{
		name: 'triangle',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'right_triangle',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'romb',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'parallelogram',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'trapezoid',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'plus',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'pentagon',
		visible: false,
		attributes: {
			stroke_dash: 'solid',
			stroke_align: 'center',
			stroke_cap: 'butt',
			stroke_join: 'miter',
			align_edges: true,
			shape_w: 0,
			shape_h: 0,
			border_size: 3,
			border: false,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
			shape_mode: 'Shape',
			sides: 5,
		},
	},
	{
		name: 'hexagon',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'star',
		visible: false,
		attributes: {
			border_size: 4,
			corners: 5,
			inner_radius: 40,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'heart',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'cylinder',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'human',
		visible: false,
		attributes: {
			border_size: 4,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'tear',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'cog',
		visible: false,
		attributes: {
			fill_color: '#555555',
		},
	},
	{
		name: 'bezier_curve',
		visible: false,
		attributes: {
			size: 4,
		},
	},
	{
		name: 'moon',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'callout',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'text',
		on_update: 'on_params_update',
		attributes: {
			font: {
				value: 'Arial',
				values() {
					const user_font_names = Object.keys(config.user_fonts);
					return ['', '[Add Font...]', ...Array.from(new Set([...config.FONTS, ...user_font_names].sort()))];
				}
			},
			size: 40,
			bold: {
				value: false,
				icon: `bold.svg`
			},
			italic: {
				value: false,
				icon: `italic.svg`
			},
			underline: {
				value: false,
				icon: `underline.svg`
			},
			strikethrough: {
				value: false,
				icon: `strikethrough.svg`
			},
			//pshot: Character panel All Caps / Small Caps and Superscript / Subscript
			caps: '',
			position: '',
			fill: '#008800',
			stroke: '#000000',
			stroke_size: {
				value: 0,
				min: 0,
				step: 0.1
			},
			kerning: {
				value: 0,
				min: -999,
				max: 999,
				step: 1
			},
			leading: {
				value: 0,
				min: -999,
				max: 999,
				step: 1
			},
			//pshot: Vertical Type / Type Mask tools
			vertical: false,
			mask: false,
		},
	},
	{
		name: 'gradient',
		attributes: {
			gradient: { name: 'Foreground to Background', stops: [{ pos: 0, color: 'fg' }, { pos: 1, color: 'bg' }], alphas: [{ pos: 0, a: 1 }, { pos: 1, a: 1 }] },
			type: 'linear',
			reverse: false,
			dither: true,
			transparency: true,
			opacity: 100,
			blend: 'Normal',
		},
	},
	{
		name: 'clone',
		attributes: {
			size: 30,
			anti_aliasing: true,
			source_layer: {
				value: 'Current',
				values: ['Current', 'Previous'],
			},
		},
	},
	{
		name: 'crop',
		on_update: 'on_params_update',
		on_leave: 'on_leave',
		attributes: {
			crop: true,
			ratio_preset: 'Unconstrained',
			ratio_w: '',
			ratio_h: '',
			view: 'Rule of Thirds',
			delete_pixels: true,
			show_cropped: true,
			shield: true,
			shield_color: 'Match Canvas',
			shield_custom: '#000000',
			shield_opacity: 75,
			shield_auto: true,
		},
	},
	{
		name: 'blur',
		attributes: {
			size: 30,
			strength: 1,
		},
	},
	{
		name: 'sharpen',
		attributes: {
			size: 30,
		},
	},
	{
		name: 'desaturate',
		attributes: {
			size: 50,
			anti_aliasing: true,
		},
	},
	{
		name: 'bulge_pinch',
		title: 'Bulge/Pinch Tool',
		attributes: {
			radius: 80,
			power: 50,
			bulge: true,
		},
	},
	{
		name: 'animation',
		on_activate: 'on_activate',
		on_update: 'on_params_update',
		on_leave: 'on_leave',
		attributes: {
			play: false,
			delay: 400,
		},
	},
	{
		name: 'polygon',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
];

//link to active tool
config.TOOL = config.TOOLS.find(t => t.name == 'brush');
	
export default config;