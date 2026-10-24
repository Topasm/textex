#!/usr/bin/env python3
"""Drive a running TextEx window on an X11 (or Xwayland) display for README captures.

Requires python-xlib (`pip install python-xlib`). The app must run with
`GDK_BACKEND=x11` so it is an X client. Coordinates are physical pixels relative
to the window's top-left corner.

Usage: drive.py [--display :1] CMD ARGS... [-- CMD ARGS...]
  win                       print window id and geometry
  resize W H [X Y]          resize (and move) the window
  move X Y                  hover the pointer
  click X Y [button] [n]    click (button 1/2/3, n times)
  drag X1 Y1 X2 Y2          press at (X1,Y1), move, release at (X2,Y2)
  ctrlclick X Y             Ctrl+click (PDF -> source jump)
  scroll X Y up|down [n]    wheel-scroll n notches at (X,Y)
  key COMBO                 e.g. ctrl+s, ctrl+shift+p, Return, Escape, F1
  type TEXT                 type printable ASCII text
  sleep SECONDS
"""
from __future__ import annotations

import sys
import time

from Xlib import X, XK, display as xdisplay
from Xlib.ext import xtest

MODIFIERS = {
    'ctrl': 'Control_L', 'control': 'Control_L', 'shift': 'Shift_L',
    'alt': 'Alt_L', 'super': 'Super_L', 'meta': 'Super_L',
}
NAMED_KEYS = {
    'enter': 'Return', 'return': 'Return', 'esc': 'Escape', 'escape': 'Escape',
    'tab': 'Tab', 'space': 'space', 'backspace': 'BackSpace', 'delete': 'Delete',
    'up': 'Up', 'down': 'Down', 'left': 'Left', 'right': 'Right',
    'home': 'Home', 'end': 'End', 'pageup': 'Prior', 'pagedown': 'Next',
}


class Driver:
    def __init__(self, display_name: str | None) -> None:
        self.d = xdisplay.Display(display_name)
        self.root = self.d.screen().root
        self.win = self.find_window()

    def find_window(self):
        best = None
        best_area = 0
        stack = [self.root]
        while stack:
            w = stack.pop()
            try:
                children = w.query_tree().children
            except Exception:
                continue
            for c in children:
                stack.append(c)
                try:
                    cls = c.get_wm_class()
                    attrs = c.get_attributes()
                    geom = c.get_geometry()
                except Exception:
                    continue
                if not cls or 'textex' not in cls[0].lower():
                    continue
                if attrs.map_state != X.IsViewable:
                    continue
                area = geom.width * geom.height
                if area > best_area:
                    best, best_area = c, area
        if best is None:
            raise SystemExit('TextEx window not found; is it running with GDK_BACKEND=x11?')
        return best

    def geometry(self):
        g = self.win.get_geometry()
        origin = self.root.translate_coords(self.win, 0, 0)
        # translate_coords from the window to root gives negative of what we want.
        abs_pos = self.win.translate_coords(self.root, 0, 0)
        return -abs_pos.x, -abs_pos.y, g.width, g.height

    def to_root(self, x: int, y: int) -> tuple[int, int]:
        ox, oy, _, _ = self.geometry()
        return ox + x, oy + y

    def flush(self) -> None:
        self.d.sync()

    # commands -------------------------------------------------------------
    def cmd_win(self) -> None:
        x, y, w, h = self.geometry()
        print(f'id=0x{self.win.id:x} x={x} y={y} w={w} h={h}')

    def cmd_resize(self, w: str, h: str, x: str = '0', y: str = '0') -> None:
        self.win.configure(x=int(x), y=int(y), width=int(w), height=int(h))
        self.flush()
        time.sleep(0.5)

    def cmd_move(self, x: str, y: str) -> None:
        rx, ry = self.to_root(int(x), int(y))
        xtest.fake_input(self.d, X.MotionNotify, x=rx, y=ry)
        self.flush()
        time.sleep(0.1)

    def cmd_click(self, x: str, y: str, button: str = '1', n: str = '1') -> None:
        self.cmd_move(x, y)
        for _ in range(int(n)):
            xtest.fake_input(self.d, X.ButtonPress, int(button))
            xtest.fake_input(self.d, X.ButtonRelease, int(button))
            self.flush()
            time.sleep(0.08)
        time.sleep(0.2)

    def cmd_ctrlclick(self, x: str, y: str) -> None:
        ctrl = self.d.keysym_to_keycode(XK.string_to_keysym('Control_L'))
        self.cmd_move(x, y)
        self._press(ctrl, True)
        self.flush()
        time.sleep(0.05)
        xtest.fake_input(self.d, X.ButtonPress, 1)
        xtest.fake_input(self.d, X.ButtonRelease, 1)
        self.flush()
        time.sleep(0.05)
        self._press(ctrl, False)
        self.flush()
        time.sleep(0.2)

    def cmd_drag(self, x1: str, y1: str, x2: str, y2: str) -> None:
        self.cmd_move(x1, y1)
        xtest.fake_input(self.d, X.ButtonPress, 1)
        self.flush()
        time.sleep(0.15)
        sx, sy, ex, ey = int(x1), int(y1), int(x2), int(y2)
        steps = 12
        for i in range(1, steps + 1):
            self.cmd_move(str(sx + (ex - sx) * i // steps), str(sy + (ey - sy) * i // steps))
            time.sleep(0.03)
        xtest.fake_input(self.d, X.ButtonRelease, 1)
        self.flush()
        time.sleep(0.2)

    def cmd_scroll(self, x: str, y: str, direction: str, n: str = '3') -> None:
        self.cmd_move(x, y)
        button = 4 if direction == 'up' else 5
        for _ in range(int(n)):
            xtest.fake_input(self.d, X.ButtonPress, button)
            xtest.fake_input(self.d, X.ButtonRelease, button)
            self.flush()
            time.sleep(0.12)

    def _keycode(self, keysym: int) -> tuple[int, bool]:
        code = self.d.keysym_to_keycode(keysym)
        if code == 0:
            raise SystemExit(f'no keycode for keysym {keysym:#x}')
        needs_shift = self.d.keycode_to_keysym(code, 0) != keysym
        return code, needs_shift

    def _press(self, code: int, down: bool) -> None:
        xtest.fake_input(self.d, X.KeyPress if down else X.KeyRelease, code)

    def cmd_key(self, combo: str) -> None:
        parts = combo.split('+')
        mods = [MODIFIERS[p.lower()] for p in parts[:-1]]
        name = parts[-1]
        name = NAMED_KEYS.get(name.lower(), name)
        keysym = XK.string_to_keysym(name) if len(name) > 1 else ord(name)
        if keysym == 0:
            raise SystemExit(f'unknown key {name}')
        code, needs_shift = self._keycode(keysym)
        mod_codes = [self.d.keysym_to_keycode(XK.string_to_keysym(m)) for m in mods]
        if needs_shift and 'Shift_L' not in mods:
            mod_codes.append(self.d.keysym_to_keycode(XK.string_to_keysym('Shift_L')))
        for m in mod_codes:
            self._press(m, True)
        self._press(code, True)
        self._press(code, False)
        for m in reversed(mod_codes):
            self._press(m, False)
        self.flush()
        time.sleep(0.15)

    def cmd_type(self, text: str, delay: str = '0.04') -> None:
        shift = self.d.keysym_to_keycode(XK.string_to_keysym('Shift_L'))
        for ch in text:
            if ch == '\n':
                self.cmd_key('Return')
                continue
            code, needs_shift = self._keycode(ord(ch))
            if needs_shift:
                self._press(shift, True)
            self._press(code, True)
            self._press(code, False)
            if needs_shift:
                self._press(shift, False)
            self.flush()
            time.sleep(float(delay))

    def cmd_sleep(self, seconds: str) -> None:
        time.sleep(float(seconds))


def main(argv: list[str]) -> None:
    display_name = None
    if argv and argv[0] == '--display':
        display_name = argv[1]
        argv = argv[2:]
    if not argv:
        print(__doc__)
        return
    driver = Driver(display_name)
    groups: list[list[str]] = [[]]
    for token in argv:
        if token == '--':
            groups.append([])
        else:
            groups[-1].append(token)
    for group in groups:
        if not group:
            continue
        name, *args = group
        fn = getattr(driver, f'cmd_{name}', None)
        if fn is None:
            raise SystemExit(f'unknown command {name}')
        fn(*args)


if __name__ == '__main__':
    main(sys.argv[1:])
