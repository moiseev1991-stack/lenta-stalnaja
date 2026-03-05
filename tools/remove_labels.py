"""
Script to remove English text labels from metal strip (lenta) TU product images.

Two types of TU images:
1. Upright coil (thin/narrow strips) - small label in center ring area
2. Flat coil (wide strips) - white/gray rectangular "STEEL STRAPPING" label

Strategy:
- Find dark character-like components (text pixels) while excluding long metal edge lines
- Cluster found characters to find the label bounding box
- Use OpenCV Telea inpainting to reconstruct the metal texture
"""

import cv2
import numpy as np
from pathlib import Path
import sys


PRODUCTS_DIR = Path("e:/cod/lebta2/public/uploads/products")


def find_label_bbox(img_bgr):
    """
    Detect the label region in a TU product image.
    
    Returns (x, y, w, h) bounding box or None if not found.
    """
    h, w = img_bgr.shape[:2]
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    # Find dark pixels relative to their local background (= text pixels)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    local_bg = cv2.GaussianBlur(blurred.astype(float), (51, 51), 0)
    dark_rel = local_bg - blurred.astype(float)
    dark_bin = (dark_rel > 15).astype(np.uint8) * 255

    # Find connected components of dark pixels
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(
        dark_bin, connectivity=8
    )

    char_regions = []
    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        cw = stats[i, cv2.CC_STAT_WIDTH]
        ch = stats[i, cv2.CC_STAT_HEIGHT]
        cx = stats[i, cv2.CC_STAT_LEFT] + cw // 2
        cy = stats[i, cv2.CC_STAT_TOP] + ch // 2

        # Filter to character-sized components:
        # - Not too small or too large
        # - Not extremely wide relative to height (metal edge lines are very wide)
        # - Max char size ~60px
        if area < 20 or area > 2000:
            continue
        aspect = cw / ch if ch > 0 else 99
        if aspect > 8:  # long horizontal lines = metal edges, not text
            continue
        if cw > 60 or ch > 60:
            continue

        # Only in the central area of the image where labels appear
        if cx < w * 0.05 or cx > w * 0.82 or cy < h * 0.25 or cy > h * 0.95:
            continue

        char_regions.append((cx, cy, cw, ch, area))

    if len(char_regions) < 5:
        return None

    # Find the densest vertical cluster of characters
    # Use a sliding vertical window to find the band with most characters
    y_coords = [r[1] for r in char_regions]
    window = 120  # max label height in pixels

    best_y1 = None
    best_count = 0
    for y_start in range(int(h * 0.25), int(h * 0.85)):
        count = sum(1 for yc in y_coords if y_start <= yc <= y_start + window)
        if count > best_count:
            best_count = count
            best_y1 = y_start

    if best_count < 5 or best_y1 is None:
        return None

    # Get all characters in the found band
    chars_in_band = [r for r in char_regions if best_y1 <= r[1] <= best_y1 + window]
    if len(chars_in_band) < 5:
        return None

    x_coords = [r[0] for r in chars_in_band]
    x_min, x_max = min(x_coords), max(x_coords)

    # Build label bounding box with padding
    pad_x, pad_y = 22, 18
    lx = max(0, x_min - pad_x)
    ly = max(0, best_y1 - pad_y)
    lw = min(w - lx, x_max - x_min + 2 * pad_x)
    lh = min(h - ly, window + 2 * pad_y)

    return (lx, ly, lw, lh)


def remove_label(img_bgr, bbox):
    """
    Use OpenCV Telea inpainting to remove the label region.
    """
    h, w = img_bgr.shape[:2]
    lx, ly, lw, lh = bbox

    mask = np.zeros((h, w), dtype=np.uint8)
    mask[ly:ly + lh, lx:lx + lw] = 255

    # Dilate slightly to ensure full coverage
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask = cv2.dilate(mask, kernel, iterations=1)

    result = cv2.inpaint(img_bgr, mask, inpaintRadius=18, flags=cv2.INPAINT_TELEA)
    return result


def process_image(img_path, output_path=None, debug=False):
    """
    Process a single image. Returns True if label was found and removed.
    """
    img_bgr = cv2.imread(str(img_path))
    if img_bgr is None:
        return False, "read_error"

    bbox = find_label_bbox(img_bgr)
    if bbox is None:
        return False, "not_detected"

    if debug:
        lx, ly, lw, lh = bbox
        debug_img = img_bgr.copy()
        cv2.rectangle(debug_img, (lx, ly), (lx + lw, ly + lh), (0, 0, 255), 2)
        debug_path = img_path.parent.parent.parent / "tools" / f"debug_{img_path.name}"
        cv2.imwrite(str(debug_path), debug_img)

    cleaned = remove_label(img_bgr, bbox)
    save_path = output_path or img_path
    cv2.imwrite(str(save_path), cleaned, [cv2.IMWRITE_JPEG_QUALITY, 92])
    return True, "ok"


def process_all_tu_images(dry_run=False, max_count=None, verbose=False):
    """
    Process all TU images in the products directory.
    """
    all_images = sorted(PRODUCTS_DIR.glob("*-tu.jpg"))
    print(f"Found {len(all_images)} TU images")

    if max_count:
        all_images = all_images[:max_count]

    detected = 0
    processed = 0
    not_detected = 0
    errors = 0

    for i, img_path in enumerate(all_images):
        if (i + 1) % 100 == 0 or verbose:
            print(f"  [{i+1}/{len(all_images)}] detected={detected} not_found={not_detected} errors={errors}")

        try:
            img_bgr = cv2.imread(str(img_path))
            if img_bgr is None:
                errors += 1
                continue

            bbox = find_label_bbox(img_bgr)

            if bbox is None:
                not_detected += 1
                if verbose:
                    print(f"    NOT detected: {img_path.name}")
                continue

            detected += 1
            if not dry_run:
                cleaned = remove_label(img_bgr, bbox)
                cv2.imwrite(str(img_path), cleaned, [cv2.IMWRITE_JPEG_QUALITY, 92])
                processed += 1

        except Exception as e:
            print(f"  ERROR {img_path.name}: {e}")
            errors += 1

    print(f"\n=== Results ===")
    print(f"  Total:          {len(all_images)}")
    print(f"  Detected:       {detected}")
    print(f"  Not detected:   {not_detected}")
    print(f"  Processed:      {processed}")
    print(f"  Errors:         {errors}")
    return detected, processed, not_detected


if __name__ == "__main__":
    if "--clean-base" in sys.argv:
        base_dir = Path("e:/cod/lebta2/tools/base_imgs")
        print("=== CLEANING BASE IMAGES ===")
        for img_path in sorted(base_dir.glob("*.jpg")):
            found, status = process_image(img_path, debug=False)
            print(f"  {img_path.name}: {status}")

    elif "--fix-missed" in sys.argv:
        import random
        import os
        try:
            from PIL import Image, ImageEnhance
        except ImportError:
            raise SystemExit("Pillow not installed. Run: pip install Pillow")

        TARGET_W, TARGET_H = 600, 400
        JPEG_QUALITY = 85

        def make_variant(base_imgs, seed):
            rng = random.Random(seed)
            img = rng.choice(base_imgs).copy().convert("RGB")
            w, h = img.size
            crop_x = int(w * 0.08)
            crop_y = int(h * 0.08)
            left   = rng.randint(0, crop_x)
            top    = rng.randint(0, crop_y)
            right  = w - rng.randint(0, crop_x)
            bottom = h - rng.randint(0, crop_y)
            if right > left + 10 and bottom > top + 10:
                img = img.crop((left, top, right, bottom))
            img = img.resize((TARGET_W, TARGET_H), Image.LANCZOS)
            img = ImageEnhance.Contrast(img).enhance(rng.uniform(0.80, 1.35))
            img = ImageEnhance.Brightness(img).enhance(rng.uniform(0.82, 1.22))
            img = ImageEnhance.Color(img).enhance(rng.uniform(0.85, 1.20))
            return img

        base_dir = Path("e:/cod/lebta2/tools/base_imgs")
        base_imgs = [Image.open(p) for p in sorted(base_dir.glob("*.jpg"))]
        if not base_imgs:
            raise SystemExit("No base images found in tools/base_imgs/")

        all_tu = sorted(PRODUCTS_DIR.glob("*-tu.jpg"))
        print(f"=== FIX MISSED: checking {len(all_tu)} TU images ===")
        replaced = 0
        for img_path in all_tu:
            img_bgr = cv2.imread(str(img_path))
            if img_bgr is None:
                continue
            bbox = find_label_bbox(img_bgr)
            if bbox is None:
                seed = abs(hash(img_path.name)) % (2**31)
                pil_img = make_variant(base_imgs, seed=seed)
                pil_img.save(str(img_path), "JPEG", quality=JPEG_QUALITY, optimize=True)
                replaced += 1
                print(f"  replaced: {img_path.name}")
        print(f"\nReplaced {replaced} TU images with generated variants")

    elif "--test" in sys.argv:
        test_dir = PRODUCTS_DIR.parent.parent / "tools"
        test_images = [
            "lenta-0-015x25-mm-20kh13-nagartovannaya-tu.jpg",
            "lenta-0-01x20-mm-khn78t-nagartovannaya-tu.jpg",
            "lenta-0-01x3-mm-khn78t-nagartovannaya-tu.jpg",
            "lenta-0-015x10-mm-20kh13-nagartovannaya-tu.jpg",
            "lenta-0-5x25-mm-20kh13-nagartovannaya-tu.jpg",
        ]
        print("=== TEST MODE ===")
        for name in test_images:
            img_path = PRODUCTS_DIR / name
            if img_path.exists():
                out_path = test_dir / f"test_clean_{name}"
                found, status = process_image(img_path, output_path=out_path, debug=True)
                print(f"  {name}: {status}")
            else:
                print(f"  {name}: FILE NOT FOUND")

    elif "--dry-run" in sys.argv:
        print("=== DRY RUN (no files modified) ===")
        process_all_tu_images(dry_run=True)

    elif "--run" in sys.argv:
        print("=== PROCESSING ALL TU IMAGES ===")
        process_all_tu_images(dry_run=False)

    else:
        print("Usage:")
        print("  python remove_labels.py --test      Test on sample images")
        print("  python remove_labels.py --dry-run   Count labels without changes")
        print("  python remove_labels.py --run        Process all TU images")
