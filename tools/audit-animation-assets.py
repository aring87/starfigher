"""Create technical inspection artifacts without changing source artwork."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts"
OUT.mkdir(exist_ok=True)
FILES = sorted((ROOT / "assets" / "minibosses").glob("*alpha-v2.png"))
CELL_W, CELL_H, LABEL_W, HEAD_H = 220, 145, 180, 54
sheet = Image.new("RGB", (LABEL_W + CELL_W * 4, HEAD_H + CELL_H * len(FILES)), "#060b14")
draw = ImageDraw.Draw(sheet)
font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 13)
small = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 11)
draw.text((12, 8), "MINIBOSS SOURCE ANIMATION / technical inspection", font=font, fill="#dcf4ff")
draw.text((12, 29), "Same 190 x 128 display scale; source assets untouched. Frames 0, 5, 10, 15.", font=small, fill="#81a1b5")
report = []
for row, filename in enumerate(FILES):
    source = Image.open(filename).convert("RGBA")
    fw, fh = source.width // 4, source.height // 4
    frames, bounds, centers = [], [], []
    for index in range(16):
        frame = source.crop(((index % 4) * fw, (index // 4) * fh, (index % 4 + 1) * fw, (index // 4 + 1) * fh))
        frames.append(frame)
        alpha = frame.getchannel("A").point(lambda value: 255 if value >= 32 else 0)
        box = alpha.getbbox()
        bounds.append(box)
        centers.append(((box[0] + box[2]) / 2, (box[1] + box[3]) / 2) if box else None)
    jumps = [((centers[(i+1)%16][0]-centers[i][0])**2+(centers[(i+1)%16][1]-centers[i][1])**2)**.5 for i in range(16) if centers[i] and centers[(i+1)%16]]
    item = {"file": str(filename.relative_to(ROOT)).replace("\\", "/"), "atlas": list(source.size), "cell": [fw, fh], "alphaBounds": bounds, "alphaBoundsCenters": centers, "largestLoopBoundsCenterStepSourcePixels": round(max(jumps, default=0), 3), "displayStepAt190pxWidth": round(max(jumps, default=0) * 190 / fw, 3)}
    report.append(item)
    y = HEAD_H + row * CELL_H
    label = filename.stem.split("-atlas")[0].replace("elite-", "")
    draw.text((12, y+18), label[:23], font=font, fill="#83dce8")
    if len(label) > 23: draw.text((12, y+36), label[23:], font=small, fill="#83dce8")
    draw.text((12, y+65), f"cell {fw} x {fh}", font=small, fill="#839bae")
    draw.text((12, y+82), f"bounds maxstep", font=small, fill="#839bae")
    draw.text((12, y+99), f"{item['displayStepAt190pxWidth']:.2f}px @190w", font=small, fill="#b9cddc")
    for column, index in enumerate([0, 5, 10, 15]):
        tile = Image.new("RGBA", (CELL_W, CELL_H), "#091321")
        preview = frames[index].resize((190, 128), Image.Resampling.LANCZOS)
        tile.alpha_composite(preview, (15, 8))
        tile_draw = ImageDraw.Draw(tile)
        tile_draw.text((8, 3), f"{index:02d}", font=small, fill="#a9c1d3")
        sheet.paste(tile.convert("RGB"), (LABEL_W + column * CELL_W, y))
    draw.line((0, y+CELL_H-1, sheet.width, y+CELL_H-1), fill="#203043")

sheet.save(OUT / "miniboss-animation-audit.jpg", quality=92)
(OUT / "miniboss-animation-audit.json").write_text(json.dumps({"scope": "Technical alpha-bounds inspection. Bounds-center motion is not an anatomical registration target; changing silhouettes can move the bounds without a moving root.", "sprites": report}, indent=2), encoding="utf-8")
print(f"Inspected {len(report)} miniboss sheets; wrote source contact sheet and alpha-bounds JSON.")
