# pshot — HANDOFF

## What this is
pshot is a Photopea-style image editor. It's a fork of [miniPaint](https://github.com/viliusle/miniPaint) (MIT, vanilla JS, webpack).
`Species8474/pshot` began as a fork of `photopea/photopea`. That repo has no source because Photopea is closed-source, so on 2026-10-09 the project was rebased onto miniPaint instead.

## Hard rules
- **pshot must be an identical clone of Photoshop CS6**: UI placement, features and functionality. CS6 itself is the spec, not Photopea, and no Photopea comparison is needed. Josh is a Photoshop expert, so any drift in layout, naming, tool order, shortcuts or behaviour is a defect.
- **Desktop only. Mobile is not a goal**, which overrides the global responsive-by-default rule.
- Keep miniPaint's `MIT-LICENSE.txt` and attribution.

## Repo
- `origin` = `Species8474/pshot`, working branch **`main`**. The old README-only `master` is left untouched.
- `upstream` = `viliusle/miniPaint`. Pull upstream changes with `git fetch upstream && git merge upstream/master`.

## Build & hosting (js1)
- `./publish.sh` runs `npm run build` (output in `dist/bundle.js`), then rsyncs `index.html`, `dist/` and `images/` into `public/`, which is gitignored.
- `sudo tailscale serve --bg --https=8830 ~/projects/pshot/public` serves https://js1.swallow-census.ts.net:8830/. It's tailnet-only, has no daemon, and changes go live immediately.
- Only `public/` is served, so `src/` and `.git` are not exposed.
- There's a Portal tile, and js1 inventory entries in `~/js1-system.md` §2/§5/§6/§11.
- Rollback: `sudo tailscale serve --https=8830 off`.

## State / next
- 2026-10-09: a stock miniPaint 4.14.3 build is live and the smoke test passed (no console errors).
- Next: reskin miniPaint to be identical to Photoshop CS6: menus, toolbox, options bar, panel dock and shortcuts. The page title still reads "miniPaint".
