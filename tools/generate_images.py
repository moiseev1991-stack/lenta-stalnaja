# Generate product JPG images from 3 base PNGs using random crop/rotate/contrast/brightness.
# Requirements: pip install Pillow

import argparse
import csv
import os
import random
import zipfile

try:
    from PIL import Image, ImageEnhance
except ImportError:
    raise SystemExit("Pillow not installed. Run: pip install Pillow")

TARGET_W, TARGET_H = 600, 400
JPEG_QUALITY = 85


def make_variant(base_imgs: list, seed: int) -> Image.Image:
    rng = random.Random(seed)
    img = rng.choice(base_imgs).copy().convert("RGB")
    w, h = img.size

    # Random crop — remove up to 8% from each edge
    crop_x = int(w * 0.08)
    crop_y = int(h * 0.08)
    left   = rng.randint(0, crop_x)
    top    = rng.randint(0, crop_y)
    right  = w - rng.randint(0, crop_x)
    bottom = h - rng.randint(0, crop_y)
    if right > left + 10 and bottom > top + 10:
        img = img.crop((left, top, right, bottom))

    img = img.resize((TARGET_W, TARGET_H), Image.LANCZOS)

    # Random contrast 0.80 – 1.35
    img = ImageEnhance.Contrast(img).enhance(rng.uniform(0.80, 1.35))

    # Random brightness 0.82 – 1.22
    img = ImageEnhance.Brightness(img).enhance(rng.uniform(0.82, 1.22))

    # Slight colour shift
    img = ImageEnhance.Color(img).enhance(rng.uniform(0.85, 1.20))

    return img


def collect_filenames(csv_path: str) -> list:
    """Return deduplicated image_filename values from the CSV (column 'image_filename')."""
    filenames = []
    seen = set()
    col = "image_filename"
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            fn = (row.get(col) or "").strip()
            if fn and fn not in seen:
                seen.add(fn)
                filenames.append(fn)
    return filenames


def ensure_jpg(fn: str) -> str:
    """If fn has no extension, append .jpg. Otherwise keep as-is."""
    _, ext = os.path.splitext(fn)
    return fn if ext else fn + ".jpg"


def main():
    parser = argparse.ArgumentParser(description="Generate product images from base PNGs")
    parser.add_argument("--csv",       required=True, help="Path to products_for_mysql.csv")
    parser.add_argument("--base-img",  required=True, nargs="+", help="Base PNG files (1-3)")
    parser.add_argument("--out-dir",   required=True, help="Output directory for JPGs")
    parser.add_argument("--zip-out",   required=True, help="ZIP archive path (relative to project root)")
    parser.add_argument("--limit",     type=int, default=7000, help="Max number of images to generate")
    args = parser.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)

    print("Loading base images …")
    base_imgs = []
    for p in args.base_img:
        if not os.path.isfile(p):
            raise SystemExit(f"Base image not found: {p}")
        base_imgs.append(Image.open(p))
    if not base_imgs:
        raise SystemExit("No base images loaded.")

    filenames = collect_filenames(args.csv)
    if not filenames:
        raise SystemExit("No image_filename values found in CSV column 'image_filename'.")

    filenames = filenames[: args.limit]
    total = len(filenames)
    print(f"Generating {total} images -> {args.out_dir}")

    generated = []
    for i, fn in enumerate(filenames):
        out_fn = ensure_jpg(fn)
        out_path = os.path.join(args.out_dir, out_fn)
        if os.path.exists(out_path):
            generated.append(out_path)
            continue
        img = make_variant(base_imgs, seed=i)
        img.save(out_path, "JPEG", quality=JPEG_QUALITY, optimize=True)
        generated.append(out_path)
        if (i + 1) % 500 == 0 or (i + 1) == total:
            print(f"  {i + 1}/{total}")

    print(f"Creating ZIP at {args.zip_out} …")
    with zipfile.ZipFile(args.zip_out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for fp in generated:
            zf.write(fp, os.path.basename(fp))

    print(f"Done. {len(generated)} images saved, ZIP: {args.zip_out}")


if __name__ == "__main__":
    main()
