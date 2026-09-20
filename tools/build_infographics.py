# -*- coding: utf-8 -*-
"""
Генератор инфографики для статей раздела /stati/.

Читает секцию "## INFOGRAPHIC" из content/stati/*.md и рисует PNG 1200x675
в public/img/stati/<slug>.png. Картинки коммитятся в git — на проде ничего
не генерируется.

Запуск:  python tools/build_infographics.py
Требует: pip install Pillow

Формат секции в MD:

    ## INFOGRAPHIC
    - type: bars
    - title: Плотность сталей и сплавов, г/см³
    - note: Значения при 20 °C
    - data:
      - Х15Ю5 (фехраль) | 7.15
      - 20Х13 | 7.70

Типы: bars, scale, compare, steps, table
"""

import os
import re
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    raise SystemExit("Pillow not installed. Run: pip install Pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "content", "stati")
OUT_DIR = os.path.join(ROOT, "public", "img", "stati")

W, H = 1200, 675
PAD = 56

# Палитра — те же токены, что в public/css/styles.css
BG = "#ffffff"
INK = "#1a1d21"
MUTED = "#6b7280"
BORDER = "#e2e5e9"
PRIMARY = "#2563eb"
PRIMARY_DARK = "#1d4ed8"
TINT = "#eff6ff"
ACCENT2 = "#0ea5e9"
SURFACE = "#f4f6f8"

FONT_CANDIDATES = [
    "C:/Windows/Fonts/segoeui.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]
FONT_BOLD_CANDIDATES = [
    "C:/Windows/Fonts/segoeuib.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def _first_existing(paths):
    for p in paths:
        if os.path.exists(p):
            return p
    raise SystemExit("Не найден подходящий TTF-шрифт: " + ", ".join(paths))


REGULAR = _first_existing(FONT_CANDIDATES)
BOLD = _first_existing(FONT_BOLD_CANDIDATES)


def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else REGULAR, size)


# ─── Разбор секции INFOGRAPHIC ────────────────────────────────────────────────


def parse_infographic(md_text):
    """Возвращает dict со спецификацией или None, если секции нет."""
    m = re.search(r"^## INFOGRAPHIC\s*$(.*?)(?=^## [A-Z0-9_]+\s*$|\Z)",
                  md_text, re.M | re.S)
    if not m:
        return None

    spec = {"data": []}
    in_data = False
    for raw in m.group(1).split("\n"):
        line = raw.rstrip()
        if not line.strip():
            continue
        kv = re.match(r"^\s*-\s*(type|title|note|unit)\s*:\s*(.*)$", line)
        if kv:
            in_data = False
            spec[kv.group(1)] = kv.group(2).strip()
            continue
        if re.match(r"^\s*-\s*data\s*:\s*$", line):
            in_data = True
            continue
        if in_data:
            item = re.match(r"^\s*-\s*(.+)$", line)
            if item:
                spec["data"].append([c.strip() for c in item.group(1).split("|")])
    return spec


def article_slug(md_text, filename):
    m = re.search(r"^URL:\s*/stati/([a-z0-9-]+)/\s*$", md_text, re.M)
    if not m:
        raise ValueError("%s: нет строки URL: /stati/<slug>/" % filename)
    return m.group(1)


# ─── Примитивы рисования ─────────────────────────────────────────────────────


def text_width(draw, s, f):
    return draw.textbbox((0, 0), s, font=f)[2]


def fit_text(draw, s, f, max_w):
    """Обрезает строку с многоточием, если она не влезает."""
    if text_width(draw, s, f) <= max_w:
        return s
    ell = "…"
    while s and text_width(draw, s + ell, f) > max_w:
        s = s[:-1]
    return s + ell


def wrap_text(draw, s, f, max_w):
    words, lines, cur = s.split(), [], ""
    for w in words:
        probe = (cur + " " + w).strip()
        if text_width(draw, probe, f) <= max_w or not cur:
            cur = probe
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def layout_rows(top, count, max_step, min_step=34, bottom_margin=96):
    """Шаг между строками и верх блока: контент центрируется по рабочей области."""
    avail = H - bottom_margin - top
    step = max(min_step, min(max_step, int(avail / max(count, 1))))
    total = step * count
    if total < avail:
        top += (avail - total) // 2
    return top, step


def draw_frame(draw, spec):
    """Шапка с заголовком и подвал с брендом. Возвращает верх рабочей области."""
    draw.rectangle([0, 0, W, H], fill=BG)
    draw.rectangle([0, 0, 10, H], fill=PRIMARY)

    f_title = font(38, bold=True)
    title = spec.get("title", "")
    lines = wrap_text(draw, title, f_title, W - PAD * 2 - 20)[:2]
    y = PAD - 10
    for line in lines:
        draw.text((PAD, y), line, font=f_title, fill=INK)
        y += 46

    note = spec.get("note")
    if note:
        f_note = font(20)
        for line in wrap_text(draw, note, f_note, W - PAD * 2 - 20)[:2]:
            draw.text((PAD, y + 2), line, font=f_note, fill=MUTED)
            y += 28
        y += 4

    # подвал
    f_foot = font(19)
    draw.line([PAD, H - 62, W - PAD, H - 62], fill=BORDER, width=1)
    draw.text((PAD, H - 48), "lenta-stalnaja.ru", font=font(19, bold=True), fill=PRIMARY)
    draw.text((PAD + 190, H - 48), "справочник по стальной ленте", font=f_foot, fill=MUTED)

    return y + 22


# ─── Типы инфографики ────────────────────────────────────────────────────────


def render_bars(draw, spec, top):
    """data: подпись | число [| приписка]"""
    rows = [r for r in spec["data"] if len(r) >= 2]
    if not rows:
        return
    values = []
    for r in rows:
        try:
            values.append(float(r[1].replace(",", ".")))
        except ValueError:
            values.append(0.0)
    vmax = max(values) or 1.0
    vmin = min(values)

    # Если значения близки (плотности 7,15–9,25), шкала от нуля делает столбики
    # неразличимыми — смещаем базу и честно подписываем это внизу.
    base = 0.0
    if vmin > 0 and vmax / vmin < 2.0:
        base = vmin - (vmax - vmin) * 0.25
    span = (vmax - base) or 1.0

    label_w = 300
    bar_x = PAD + label_w + 16
    bar_max = W - PAD - bar_x - 150
    top, step = layout_rows(top, len(rows), 64)
    bar_h = min(38, int(step * 0.62))

    f_label = font(21)
    f_val = font(22, bold=True)
    f_extra = font(18)

    y = top
    for r, v in zip(rows, values):
        draw.text((PAD, y + (bar_h - 24) // 2),
                  fit_text(draw, r[0], f_label, label_w), font=f_label, fill=INK)
        w = int(bar_max * ((v - base) / span))
        draw.rounded_rectangle([bar_x, y, bar_x + bar_max, y + bar_h],
                               radius=6, fill=SURFACE)
        draw.rounded_rectangle([bar_x, y, bar_x + max(w, 8), y + bar_h],
                               radius=6, fill=PRIMARY if v >= 0 else MUTED)
        vx = bar_x + max(w, 8) + 14
        draw.text((vx, y + (bar_h - 26) // 2), r[1], font=f_val, fill=INK)
        if len(r) > 2:
            draw.text((vx + text_width(draw, r[1], f_val) + 10, y + (bar_h - 22) // 2),
                      r[2], font=f_extra, fill=MUTED)
        y += step

    if base > 0:
        draw.text((bar_x, H - 92), "Шкала начинается не с нуля — так лучше видна разница между марками",
                  font=font(17), fill=MUTED)


def render_scale(draw, spec, top):
    """data: подпись | от | до [| приписка] — диапазоны на общей шкале"""
    rows = [r for r in spec["data"] if len(r) >= 3]
    if not rows:
        return
    lo, hi = [], []
    for r in rows:
        try:
            lo.append(float(r[1].replace(",", ".")))
            hi.append(float(r[2].replace(",", ".")))
        except ValueError:
            lo.append(0.0)
            hi.append(0.0)
    vmin, vmax = min(lo), max(hi)
    span = (vmax - vmin) or 1.0

    label_w = 290
    track_x = PAD + label_w + 16
    caption_w = 250          # место под подпись справа, чтобы её не обрезало
    track_w = W - PAD - track_x - caption_w - 14
    top, step = layout_rows(top, len(rows), 74, min_step=42, bottom_margin=110)
    bar_h = 22

    f_label = font(21)
    f_val = font(18, bold=True)

    y = top
    for r, a, b in zip(rows, lo, hi):
        draw.text((PAD, y - 2), fit_text(draw, r[0], f_label, label_w),
                  font=f_label, fill=INK)
        draw.rounded_rectangle([track_x, y, track_x + track_w, y + bar_h],
                               radius=11, fill=SURFACE)
        x1 = track_x + int(track_w * ((a - vmin) / span))
        x2 = track_x + int(track_w * ((b - vmin) / span))
        draw.rounded_rectangle([x1, y, max(x2, x1 + 10), y + bar_h],
                               radius=11, fill=PRIMARY)
        caption = r[3] if len(r) > 3 else ("%s–%s" % (r[1], r[2]))
        draw.text((track_x + track_w + 14, y + 1),
                  fit_text(draw, caption, f_val, caption_w), font=f_val, fill=MUTED)
        y += step

    unit = spec.get("unit")
    if unit:
        f_unit = font(18)
        draw.text((track_x, min(y + 6, H - 88)),
                  fit_text(draw, unit, f_unit, W - track_x - PAD), font=f_unit, fill=MUTED)


def render_compare(draw, spec, top):
    """data: Заголовок колонки | пункт; пункт; пункт"""
    cols = [r for r in spec["data"] if len(r) >= 2][:3]
    if not cols:
        return
    gap = 24
    col_w = (W - PAD * 2 - gap * (len(cols) - 1)) // len(cols)
    box_h = H - 96 - top

    f_item = font(19)
    # Заголовок колонки подгоняем по ширине: лучше мельче, чем с многоточием.
    f_head = font(25, bold=True)
    for size in (25, 23, 21, 19, 17):
        probe = font(size, bold=True)
        if all(text_width(draw, c[0], probe) <= col_w - 36 for c in cols):
            f_head = probe
            break
        f_head = probe

    for i, c in enumerate(cols):
        x = PAD + i * (col_w + gap)
        draw.rounded_rectangle([x, top, x + col_w, top + box_h], radius=14,
                               fill=TINT if i == 0 else BG, outline=BORDER, width=2)
        draw.rounded_rectangle([x, top, x + col_w, top + 62], radius=14,
                               fill=PRIMARY if i == 0 else PRIMARY_DARK)
        draw.rectangle([x, top + 46, x + col_w, top + 62],
                       fill=PRIMARY if i == 0 else PRIMARY_DARK)
        draw.text((x + 18, top + 18), fit_text(draw, c[0], f_head, col_w - 36),
                  font=f_head, fill="#ffffff")

        y = top + 82
        for item in [s.strip() for s in c[1].split(";") if s.strip()]:
            draw.ellipse([x + 20, y + 8, x + 28, y + 16], fill=PRIMARY)
            for line in wrap_text(draw, item, f_item, col_w - 56)[:3]:
                draw.text((x + 38, y), line, font=f_item, fill=INK)
                y += 26
            y += 10


def render_steps(draw, spec, top):
    """data: Заголовок шага | пояснение"""
    rows = [r for r in spec["data"] if r and r[0]][:6]
    if not rows:
        return
    top, step = layout_rows(top, len(rows), 104, min_step=62)

    f_num = font(24, bold=True)
    f_head = font(24, bold=True)
    f_body = font(19)

    y = top
    for i, r in enumerate(rows, 1):
        cy = y + 22
        draw.ellipse([PAD, cy - 22, PAD + 44, cy + 22], fill=PRIMARY)
        num = str(i)
        draw.text((PAD + 22 - text_width(draw, num, f_num) // 2, cy - 16),
                  num, font=f_num, fill="#ffffff")
        if i < len(rows):
            draw.line([PAD + 22, cy + 26, PAD + 22, y + step - 4], fill=BORDER, width=3)

        draw.text((PAD + 68, y + 2), fit_text(draw, r[0], f_head, W - PAD * 2 - 90),
                  font=f_head, fill=INK)
        if len(r) > 1:
            ty = y + 34
            for line in wrap_text(draw, r[1], f_body, W - PAD * 2 - 90)[:2]:
                draw.text((PAD + 68, ty), line, font=f_body, fill=MUTED)
                ty += 25
        y += step


def render_table(draw, spec, top):
    """data: ключ | значение [| комментарий]"""
    rows = [r for r in spec["data"] if len(r) >= 2]
    if not rows:
        return
    top, step = layout_rows(top, len(rows), 62)

    f_key = font(21)
    f_val = font(21, bold=True)
    f_note = font(18)

    key_w = 430
    val_x = PAD + key_w + 24

    y = top
    for i, r in enumerate(rows):
        if i % 2 == 0:
            draw.rectangle([PAD - 12, y - 6, W - PAD + 12, y + step - 10], fill=SURFACE)
        draw.text((PAD, y), fit_text(draw, r[0], f_key, key_w), font=f_key, fill=MUTED)
        draw.text((val_x, y), fit_text(draw, r[1], f_val, 300), font=f_val, fill=INK)
        if len(r) > 2:
            draw.text((val_x + 320, y + 2),
                      fit_text(draw, r[2], f_note, W - val_x - 320 - PAD),
                      font=f_note, fill=MUTED)
        y += step


RENDERERS = {
    "bars": render_bars,
    "scale": render_scale,
    "compare": render_compare,
    "steps": render_steps,
    "table": render_table,
}


# ─── Сборка ──────────────────────────────────────────────────────────────────


def build_one(md_path):
    with open(md_path, "r", encoding="utf-8") as fh:
        text = fh.read()

    spec = parse_infographic(text)
    if not spec:
        return None

    slug = article_slug(text, os.path.basename(md_path))
    kind = spec.get("type", "table")
    renderer = RENDERERS.get(kind)
    if not renderer:
        raise ValueError("%s: неизвестный type: %s (доступны: %s)"
                         % (slug, kind, ", ".join(sorted(RENDERERS))))

    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    top = draw_frame(draw, spec)
    renderer(draw, spec, top)

    if not os.path.isdir(OUT_DIR):
        os.makedirs(OUT_DIR)
    out = os.path.join(OUT_DIR, slug + ".png")
    img.save(out, "PNG", optimize=True)
    return slug, kind, os.path.getsize(out)


def main():
    if not os.path.isdir(SRC_DIR):
        raise SystemExit("Нет директории " + SRC_DIR)

    files = sorted(
        os.path.join(SRC_DIR, f)
        for f in os.listdir(SRC_DIR)
        if f.endswith(".md") and not f.startswith("00_") and f.lower() != "readme.md"
    )

    made, skipped, errors = [], [], []
    for path in files:
        try:
            res = build_one(path)
            if res:
                made.append(res)
            else:
                skipped.append(os.path.basename(path))
        except Exception as exc:
            errors.append("%s: %s" % (os.path.basename(path), exc))

    for slug, kind, size in made:
        print("  %-52s %-8s %5.1f KB" % (slug + ".png", kind, size / 1024.0))
    print("[infographics] собрано: %d, без секции INFOGRAPHIC: %d" % (len(made), len(skipped)))
    for name in skipped:
        print("  нет инфографики: " + name)
    if errors:
        print("[infographics] ошибки:")
        for e in errors:
            print("  - " + e)
        sys.exit(1)


if __name__ == "__main__":
    main()
