# README media capture

Reproducible pipeline for the screenshots and GIFs in `docs/images/` (Linux, X11 or Xwayland).

1. Start a release build as an X11 client, e.g. `GDK_BACKEND=x11 GDK_SCALE=2 ./TextEx.AppImage`,
   open the demo project (`TextEx Guided Paper` template), and warm the Tectonic cache once.
2. `python -m venv .venv && .venv/bin/pip install python-xlib`, then drive the window:
   `.venv/bin/python scripts/readme-media/drive.py resize 3200 1750 -- click X Y -- key ctrl+s`.
3. `scripts/readme-media/capture.sh shot NAME` writes `docs/images/NAME.png`;
   `capture.sh rec NAME SECONDS` records an mp4 (kept out of git under `out/readme-media/`)
   and builds `docs/images/NAME.gif`; `capture.sh gif NAME "0-5:1,5-16:5"` rebuilds the GIF
   with faster segments (seconds:speed).
4. `fake_zotero.py` serves a tiny fake Zotero local API on port 23119 so the References panel
   shows a populated library without Zotero installed. Capture use only.
5. `social_preview.py docs/images/hero-light.png` composes `docs/images/social-preview.png`
   (upload it under GitHub → Settings → General → Social preview).
