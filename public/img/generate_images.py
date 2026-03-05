#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate product placeholder images from 3 base images.

The script reads Excel column "Изображение" and generates JPEG files named EXACTLY
like values from that column.

Usage:
  python generate_images.py --xlsx "Lenta_FINAL_import (2).xlsx" \
    --base-img img1.png img2.png img3.png \
    --out-dir ./public/uploads/products \
    --zip-out images.zip \
    --limit 7000

Notes:
- No internet required.
- Creates lightweight JPEGs (640x426).
"""

from __future__ import annotations

import argparse
import re
import zipfile
import random
from pathlib import Path

import pandas as pd
from PIL import Image, ImageEnhance, ImageFilter


def normalize_filename(name: str) -> str:
    name = str(name).strip()
    if not name:
        return ""
    if not name.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
        name += ".jpg"
    if name.lower().endswith(('.png', '.webp')):
        name = re.sub(r'\.(png|webp)$', '.jpg', name, flags=re.I)
    if name.lower().endswith('.jpeg'):
        name = re.sub(r'\.jpeg$', '.jpg', name, flags=re.I)
    return name


def make_variant_fast(base: Image.Image, seed: int, out_size=(640, 426)) -> Image.Image:
    rng = random.Random(seed)
    w, h = base.size
    scale = rng.uniform(0.85, 1.0)
    cw, ch = int(w * scale), int(h * scale)
    x0 = rng.randint(0, max(0, w - cw))
    y0 = rng.randint(0, max(0, h - ch))
    img = base.crop((x0, y0, x0 + cw, y0 + ch))
    angle = rng.uniform(-1.5, 1.5)
    img = img.rotate(angle, resample=Image.BICUBIC, expand=True, fillcolor=(245, 245, 245))
    img = img.resize(out_size, Image.LANCZOS)
    img = ImageEnhance.Contrast(img).enhance(rng.uniform(0.95, 1.12))
    img = ImageEnhance.Brightness(img).enhance(rng.uniform(0.95, 1.08))
    img = ImageEnhance.Color(img).enhance(rng.uniform(0.95, 1.10))
    if rng.random() < 0.15:
        img = img.filter(ImageFilter.GaussianBlur(radius=rng.uniform(0.2, 0.6)))
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", required=True)
    ap.add_argument("--sheet", default="Sheet1")
    ap.add_argument("--base-img", nargs="+", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--zip-out", default="")
    ap.add_argument("--limit", type=int, default=7000)
    args = ap.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    df = pd.read_excel(args.xlsx, sheet_name=args.sheet)
    names = df["Изображение"].dropna().astype(str).str.strip()
    names = names[names != ""]
    unique = []
    seen = set()
    for n in names.tolist():
        fn = normalize_filename(n)
        if fn and fn not in seen:
            seen.add(fn)
            unique.append(fn)

    unique = unique[: args.limit]

    bases = [Image.open(p).convert("RGB") for p in args.base_img]
    if not bases:
        raise SystemExit("No base images loaded")

    zf = None
    if args.zip_out:
        zf = zipfile.ZipFile(args.zip_out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6)

    for idx, fn in enumerate(unique):
        base = bases[idx % len(bases)]
        img = make_variant_fast(base, idx * 1337 + 17)
        path = out_dir / fn
        img.save(path, format="JPEG", quality=80, optimize=True, progressive=True)
        if zf:
            zf.write(path, arcname=fn)
        if (idx + 1) % 500 == 0:
            print(f"Generated {idx+1}/{len(unique)}")

    if zf:
        zf.close()
        print(f"ZIP written: {args.zip_out}")

    print(f"Done. Images written to: {out_dir} (count={len(unique)})")


if __name__ == "__main__":
    main()
