/*
 * pshot - Help > About pshot: a CS6-style splash panel (click or Esc closes).
 * pshot is built on miniPaint (MIT); its credit stays here as the license asks.
 */

class Help_about_class {

	about() {
		if (document.querySelector('.ps_about')) return;
		var wrap = document.createElement('div');
		wrap.className = 'ps_about_wrap';
		wrap.innerHTML = '<div class="ps_about" role="dialog" aria-label="About pshot">'
			+ '<div class="ps_about_logo">Ps</div>'
			+ '<div class="ps_about_text">'
			+ '<div class="ps_about_name">pshot</div>'
			+ '<div class="ps_about_tag">An image editor in the browser, modeled on the Photoshop CS6 workspace.</div>'
			+ '<div class="ps_about_credits">'
			+ '<p>Based on <a href="https://github.com/viliusle/miniPaint" target="_blank" rel="noopener">miniPaint</a> by ViliusL, engine version ' + VERSION + ', MIT License.</p>'
			+ '<p>Source: <a href="https://github.com/Species8474/pshot" target="_blank" rel="noopener">github.com/Species8474/pshot</a></p>'
			+ '<p>pshot is not affiliated with or endorsed by Adobe. Photoshop is a trademark of Adobe Inc.</p>'
			+ '</div></div></div>';
		var close = (e) => {
			if (e && e.target && e.target.closest('a')) return;
			wrap.remove();
			document.removeEventListener('keydown', key, true);
		};
		var key = (e) => {
			if (e.key == 'Escape' || e.key == 'Enter') {
				e.preventDefault();
				e.stopPropagation();
				close();
			}
		};
		wrap.addEventListener('click', close);
		document.addEventListener('keydown', key, true);
		document.body.appendChild(wrap);
	}

}

export default Help_about_class;
