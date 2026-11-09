"""Compose labelled review sheets from actual exterior-kit GLB renders."""
import argparse
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--renders", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--font", type=Path)
    args = p.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    candidates = [args.font, Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
                  Path("C:/Windows/Fonts/arial.ttf"), Path("/Library/Fonts/Arial.ttf")]
    font_path = next((str(p) for p in candidates if p and p.is_file()), None)
    if not font_path:
        raise RuntimeError("Provide a Unicode font with --font")
    font = ImageFont.truetype(font_path, 18)
    small = ImageFont.truetype(font_path, 15)
    title = ImageFont.truetype(font_path, 30)
    records = json.loads((args.renders / "contact-report.json").read_text())
    for lod in (False, True):
        items = [r for r in records if r["lod"] == lod]
        for page in range(math.ceil(len(items) / 12)):
            sheet = Image.new("RGB", (1920, 1560), (234, 235, 228))
            draw = ImageDraw.Draw(sheet)
            draw.text((24, 18), "LA LADERA · EQUIPAMIENTO EXTERIOR", font=title, fill=(25, 48, 43))
            level = "LOD1" if lod else "DETALLE CERCANO"
            draw.text((26, 62), f"{level} · Escala individual · Medidas en metros · Lámina {page + 1}",
                      font=font, fill=(57, 77, 70))
            for i, rec in enumerate(items[page * 12:(page + 1) * 12]):
                x, y = i % 4 * 480, 102 + i // 4 * 480
                sheet.paste(Image.open(args.renders / rec["file"]).convert("RGB"), (x, y))
                label = rec["label"]
                if draw.textlength(label, font=font) > 454:
                    words, line, lines = label.split(), "", []
                    for word in words:
                        proposed = (line + " " + word).strip()
                        if draw.textlength(proposed, font=font) > 454 and line:
                            lines.append(line)
                            line = word
                        else:
                            line = proposed
                    lines.append(line)
                    label = "\n".join(lines[:2])
                draw.text((x + 12, y + 401), label, font=font, fill=(25, 48, 43), spacing=2)
                dims = " × ".join(f"{n:.2f}".replace(".", ",") for n in rec["size"])
                triangles = f"{rec['triangles']:,}".replace(",", ".")
                draw.text((x + 12, y + 450), f"{dims} m · {triangles} triángulos",
                          font=small, fill=(62, 79, 72))
            path = args.out / f"contact-{'lod1' if lod else 'near'}-{page+1:02}.jpg"
            sheet.save(path, quality=90, subsampling=0)
            print(path)
    for key in ("facade-eye-1_6m", "roof-eye-1_6m"):
        source = args.renders / (key + ".png")
        if source.exists():
            Image.open(source).convert("RGB").save(args.out / (key + ".jpg"), quality=93, subsampling=0)


if __name__ == "__main__":
    main()
