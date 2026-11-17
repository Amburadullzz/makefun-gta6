#!/usr/bin/env python3
"""Capture the four screenshots from the running dev server and write them to screenshots/.

Each shot is rendered by headless Chromium at 1280x720 from the game's own ?shot= scene, then
re-encoded as a JPEG small enough for the entry's 256 KiB cap. Run `node serve.ts` first.
"""
import json
import pathlib
import subprocess
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent
SHOTS = json.loads((ROOT / "shots.json").read_text())
OUT = ROOT / "screenshots"
OUT.mkdir(exist_ok=True)

for shot in SHOTS:
    name = shot["name"]
    tmp = pathlib.Path("/tmp") / f"sable-{name}.png"
    url = f"http://localhost:8080/index.html{shot['query']}"
    subprocess.run(
        [
            "chromium",
            "--headless",
            "--disable-gpu",
            "--no-sandbox",
            "--enable-unsafe-swiftshader",
            "--hide-scrollbars",
            "--window-size=1280,720",
            "--virtual-time-budget=2500",
            f"--screenshot={tmp}",
            url,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    image = Image.open(tmp).convert("RGB")
    target = OUT / name
    if target.suffix.lower() in (".jpg", ".jpeg"):
        image.save(target, "JPEG", quality=88, optimize=True, progressive=True)
    else:
        image.save(target, "PNG", optimize=True)
    size = target.stat().st_size
    print(f"{target.name}: {image.width}x{image.height} {size} bytes")
    if size > 262144:
        print(f"  too big for the entry cap: {size}", file=sys.stderr)
