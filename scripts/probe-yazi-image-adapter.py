#!/usr/bin/env python3
"""Observe which image adapter Yazi selects inside the Glass VT capability envelope.

This is a diagnostic probe, not part of `bun run check` — it needs a `yazi` binary
and drives a real PTY. It exists because the Engine Room's image path cannot be
verified from source: Yazi decides its adapter at runtime from environment markers
and terminal query responses, and the wrong answer is silent (no image, no error).

Why a PTY and not `script`: `script` leaves the window size degenerate, so Yazi
renders empty frames and never previews anything. This opens a PTY with an explicit
`TIOCSWINSZ` including pixel geometry — the same thing `PtySize { pixel_width,
pixel_height }` gives the real Engine Room — puts the line discipline in raw mode so
query replies reach Yazi instead of being echoed back, and answers the probes
xterm.js answers.

    python3 scripts/probe-yazi-image-adapter.py --json
    python3 scripts/probe-yazi-image-adapter.py --leak-host-identity --json

The second form reproduces the pre-fix behaviour: with a host marker such as
GHOSTTY_RESOURCES_DIR still set, Yazi identifies the *host* emulator, skips
negotiating with this renderer, and selects an adapter for a terminal that is not
drawing the pixels.
"""
import argparse
import fcntl
import json
import os
import pty
import re
import select
import shutil
import signal
import struct
import sys
import termios
import time

# Markers Yazi's brand detection reads; must mirror HOST_TERMINAL_IDENTITY_VARS.
HOST_IDENTITY = (
    "TERM_PROGRAM", "TERM_PROGRAM_VERSION", "GHOSTTY_RESOURCES_DIR", "GHOSTTY_BIN_DIR",
    "GHOSTTY_SHELL_FEATURES", "KITTY_WINDOW_ID", "KITTY_PID", "KITTY_INSTALLATION_DIR",
    "KONSOLE_VERSION", "ITERM_SESSION_ID", "WEZTERM_EXECUTABLE", "WEZTERM_PANE",
    "WEZTERM_UNIX_SOCKET", "WARP_HONOR_PS", "VTE_VERSION", "WT_SESSION",
    "ALACRITTY_WINDOW_ID", "ALACRITTY_SOCKET", "LC_TERMINAL", "LC_TERMINAL_VERSION",
)

parser = argparse.ArgumentParser()
parser.add_argument("--yazi", default=shutil.which("yazi"))
parser.add_argument("--directory", default=None)
parser.add_argument("--cols", type=int, default=100)
parser.add_argument("--rows", type=int, default=30)
parser.add_argument("--cell-width", type=int, default=10)
parser.add_argument("--cell-height", type=int, default=20)
parser.add_argument("--seconds", type=float, default=12.0)
parser.add_argument("--leak-host-identity", action="store_true")
parser.add_argument("--debug-report", action="store_true")
parser.add_argument("--json", action="store_true")
args = parser.parse_args()

if not args.yazi or not os.path.exists(args.yazi):
    print(json.dumps({"ok": False, "reason": "yazi binary not found"}))
    sys.exit(2)

XPIX, YPIX = args.cols * args.cell_width, args.rows * args.cell_height

# Exactly what xterm.js replies with `windowOptions.getCellSizePixels` /
# `getWinSizePixels` enabled and @xterm/addon-image loaded with sixelSupport.
REPLIES = (
    (b"\x1b[>q", b"\x1bP>|xterm(6.1.0)\x1b\\"),
    (b"\x1b[16t", b"\x1b[6;%d;%dt" % (args.cell_height, args.cell_width)),
    (b"\x1b[14t", b"\x1b[4;%d;%dt" % (YPIX, XPIX)),
    (b"\x1b]11;?", b"\x1b]11;rgb:0a0a/0a0a/0a0a\x1b\\"),
    (b"\x1b[?u", b"\x1b[?0u"),
    (b"\x1b[0c", b"\x1b[?62;4;9;22c"),
)

directory = args.directory
if directory is None:
    # Yazi sorts directories first and previews whatever it hovers, so pointing at a
    # mixed folder previews a directory and no image is ever requested. Stage a
    # single image so the probe measures the image path and nothing else.
    import tempfile

    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    directory = tempfile.mkdtemp(prefix="glass-image-probe-")
    shutil.copy(os.path.join(repo, "src-tauri", "icons", "128x128@2x.png"),
                os.path.join(directory, "sample.png"))
directory = os.path.abspath(directory)

pid, fd = pty.fork()
if pid == 0:
    env = dict(os.environ)
    env["TERM"] = "xterm-256color"
    env["YAZI_IMAGE_PROTOCOL"] = "Kgp"
    if not args.leak_host_identity:
        for marker in HOST_IDENTITY:
            env.pop(marker, None)
    else:
        env.setdefault("GHOSTTY_RESOURCES_DIR", "/usr/share/ghostty")
    argv = [args.yazi, "--debug"] if args.debug_report else [args.yazi, directory]
    os.execve(args.yazi, argv, env)

fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", args.rows, args.cols, XPIX, YPIX))
attrs = termios.tcgetattr(fd)
attrs[3] &= ~(termios.ECHO | termios.ICANON | termios.ISIG | termios.IEXTEN)
attrs[0] &= ~(termios.IXON | termios.ICRNL | termios.INLCR | termios.IGNCR)
termios.tcsetattr(fd, termios.TCSANOW, attrs)

captured = bytearray()
deadline = time.time() + args.seconds
# Yazi stops listening for probe responses almost immediately, so replies are queued
# up front rather than sent after the query is observed.
prefill = [0.0, 0.15, 0.4, 0.8]
index, started, quit_sent = 0, time.time(), False

while time.time() < deadline:
    while index < len(prefill) and time.time() - started >= prefill[index]:
        index += 1
        for _, reply in REPLIES:
            os.write(fd, reply)
    ready, _, _ = select.select([fd], [], [], 0.02)
    if ready:
        try:
            chunk = os.read(fd, 65536)
        except OSError:
            break
        if not chunk:
            break
        captured.extend(chunk)
    if not quit_sent and time.time() > deadline - 1.5:
        quit_sent = True
        os.write(fd, b"q")

try:
    os.kill(pid, signal.SIGTERM)
except ProcessLookupError:
    pass
os.waitpid(pid, os.WNOHANG)

blob = bytes(captured)
plain = re.sub(rb"\x1b\[[0-9;?]*[a-zA-Z]", b"", blob)
result = {
    "ok": True,
    "host_identity": "leaked" if args.leak_host_identity else "stripped",
    "geometry": {"cols": args.cols, "rows": args.rows, "pixel_width": XPIX, "pixel_height": YPIX},
    "captured_bytes": len(blob),
    "sixel_payloads": len(re.findall(rb"\x1bP[0-9;]*q", blob)),
    "kitty_apc_sequences": len(re.findall(rb"\x1b_G.*?\x1b\\", blob, re.S)),
    "kitty_capability_probe": bool(re.search(rb"\x1b_G[^;\x1b]*a=q", blob)),
    "placeholder_cells": blob.count("\U0010eeee".encode()),
    "terminal_response_timeouts": blob.count(b"Terminal response timeout"),
    "chafa_fallback": b"chafa" in plain.lower(),
}
if args.debug_report:
    for field in ("Brand.from_env", "Emulator.detect", "Adapter.matches"):
        found = re.search(field.replace(".", r"\.").encode() + rb"\s*:\s*([^\r\n]+)", plain)
        if found:
            result[field] = found.group(1).decode("ascii", "replace").strip()
result["image_rendered"] = result["sixel_payloads"] > 0 or result["placeholder_cells"] > 0

print(json.dumps(result, indent=2) if args.json else result)
sys.exit(0 if result["image_rendered"] or args.debug_report else 1)
