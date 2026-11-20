from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "bosses" / "weakpoint-atlases"
RENDER_SIZE = 224

# The first two targets are the forward armor capacitors. The remaining six
# are the red mechanical sockets at the root of each articulated tentacle.
PHASES = (
    (
        "phase1",
        ROOT / "assets" / "bosses" / "boss-01-bloodstar-phase1-4frame-alpha-v4.png",
        (
            ((130, 258), (130, 343), (283, 173), (408, 169), (453, 245), (453, 382), (405, 457), (283, 453)),
            ((112, 276), (112, 335), (275, 178), (377, 200), (436, 266), (435, 365), (375, 428), (275, 414)),
            ((135, 268), (135, 325), (284, 145), (380, 168), (446, 213), (446, 355), (382, 406), (285, 410)),
            ((98, 249), (98, 323), (242, 143), (368, 145), (414, 219), (416, 354), (366, 430), (242, 425)),
        ),
        (
            (-1.38, -0.72, -0.17, 0.29, 0.68, 1.07),
            (-0.72, -0.60, 0.15, 0.76, 0.75, 0.95),
            (-0.86, -0.81, -0.45, 1.09, 0.75, 1.11),
            (-1.01, -0.74, -0.21, 0.19, 0.62, 1.10),
        ),
    ),
    (
        "phase2",
        ROOT / "assets" / "bosses" / "boss-01-bloodstar-phase2-4frame-alpha-v4.png",
        (
            ((118, 302), (118, 360), (284, 157), (402, 176), (464, 305), (468, 398), (400, 483), (272, 518)),
            ((92, 306), (92, 367), (259, 178), (359, 193), (453, 340), (445, 406), (365, 480), (233, 506)),
            ((126, 260), (126, 325), (287, 160), (410, 142), (476, 294), (474, 356), (404, 415), (286, 424)),
            ((91, 249), (91, 324), (248, 113), (361, 135), (429, 257), (428, 350), (360, 428), (242, 472)),
        ),
        (
            (-1.02, -0.78, -0.34, 0.38, 0.66, 0.96),
            (-1.05, -0.80, -1.30, 1.05, 1.16, 1.22),
            (-1.03, 0.06, -0.78, 1.03, 0.97, 2.77),
            (-1.13, -0.69, -0.29, 0.24, 0.68, 1.12),
        ),
    ),
)


def mix(source: tuple[int, int, int], target: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    return tuple(round(value + (goal - value) * amount) for value, goal in zip(source, target))


def frame_center(frame: int, cell_w: int, cell_h: int, frame_nodes, node_index: int) -> tuple[float, float]:
    x, y = frame_nodes[frame][node_index]
    return (frame % 2) * cell_w + x, (frame // 2) * cell_h + y


def build_node_overlay(source: Image.Image, frame_nodes, node_index: int, state: int) -> Image.Image:
    width, height = source.size
    cell_w, cell_h = width // 2, height // 2
    scale = cell_w / RENDER_SIZE
    result = Image.new("RGBA", source.size, (0, 0, 0, 0))
    source_pixels, result_pixels = source.load(), result.load()
    radius = (5.0 if state == 0 else 7.0 if state == 1 else 8.5) * scale

    for frame in range(4):
        cell_x, cell_y = (frame % 2) * cell_w, (frame // 2) * cell_h
        center_x, center_y = frame_center(frame, cell_w, cell_h, frame_nodes, node_index)
        scan = math.ceil(radius)
        for py in range(max(cell_y, round(center_y - scan)), min(cell_y + cell_h, round(center_y + scan + 1))):
            for px in range(max(cell_x, round(center_x - scan)), min(cell_x + cell_w, round(center_x + scan + 1))):
                red, green, blue, alpha = source_pixels[px, py]
                if alpha < 32:
                    continue
                dx, dy = px - center_x, py - center_y
                distance = math.hypot(dx, dy)
                if distance > radius:
                    continue
                original = (red, green, blue)
                red_pixel = red > 58 and red > green * 1.18 and red > blue * 0.78
                bright_core = distance < 2.0 * scale and red + green + blue > 250

                if state == 0:
                    if not (red_pixel or bright_core):
                        continue
                    if distance < 1.9 * scale:
                        color = mix(original, (255, 248, 82), 0.96)
                    elif distance < 3.8 * scale:
                        color = mix(original, (255, 72, 8), 0.94)
                    else:
                        color = mix(original, (231, 18, 4), 0.76)
                elif state == 1:
                    chip = math.sin(dx * 0.53 + dy * 0.31 + node_index) + math.sin(dy * 0.71)
                    if distance < 3.8 * scale and chip > -0.72:
                        color = mix(original, (4, 3, 6), 0.96)
                    elif distance < 7.2 * scale and (red_pixel or chip > 0.72):
                        color = mix(original, (255, 78, 38), 0.82)
                    elif distance < 9.0 * scale and chip > 1.25:
                        color = mix(original, (91, 15, 25), 0.72)
                    else:
                        continue
                else:
                    jagged = radius * (0.76 + 0.11 * math.sin(math.atan2(dy, dx) * 7 + node_index))
                    if distance < jagged * 0.62:
                        color = mix(original, (2, 2, 4), 0.99)
                    elif distance < jagged:
                        color = mix(original, (80, 10, 24), 0.88)
                    elif distance < radius and red_pixel:
                        color = mix(original, (137, 15, 39), 0.58)
                    else:
                        continue
                result_pixels[px, py] = (*color, alpha)
    return result


def build_tentacle_assets(source: Image.Image, frame_nodes, node_index: int, frame_angles, tentacle_index: int) -> tuple[Image.Image, Image.Image]:
    width, height = source.size
    cell_w, cell_h = width // 2, height // 2
    scale = cell_w / RENDER_SIZE
    mask = Image.new("RGBA", source.size, (0, 0, 0, 0))
    fragment = Image.new("RGBA", source.size, (0, 0, 0, 0))
    source_pixels, mask_pixels, fragment_pixels = source.load(), mask.load(), fragment.load()
    length = 82 * scale
    reach = math.ceil(length + 24 * scale)

    for frame in range(4):
        cell_x, cell_y = (frame % 2) * cell_w, (frame // 2) * cell_h
        center_x, center_y = frame_center(frame, cell_w, cell_h, frame_nodes, node_index)
        angle = frame_angles[frame][tentacle_index]
        cos_a, sin_a = math.cos(angle), math.sin(angle)
        for py in range(max(cell_y, round(center_y - reach)), min(cell_y + cell_h, round(center_y + reach + 1))):
            for px in range(max(cell_x, round(center_x - reach)), min(cell_x + cell_w, round(center_x + reach + 1))):
                red, green, blue, alpha = source_pixels[px, py]
                if alpha < 32:
                    continue
                dx, dy = px - center_x, py - center_y
                along = dx * cos_a + dy * sin_a
                across = -dx * sin_a + dy * cos_a
                if along < 2.0 * scale or along > length:
                    continue
                progress = along / length
                half_width = (6.0 + progress * 18.0) * scale
                if abs(across) > half_width:
                    continue
                mask_pixels[px, py] = (255, 255, 255, alpha)
                fragment_pixels[px, py] = (red, green, blue, alpha)
    return mask, fragment


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for phase_name, source_path, frame_nodes, frame_angles in PHASES:
        source = Image.open(source_path).convert("RGBA")
        open_preview = source.copy()
        removed_preview = source.copy()
        removed_alpha = np.asarray(removed_preview.getchannel("A")).copy()

        for node_index in range(len(frame_nodes[0])):
            states = [build_node_overlay(source, frame_nodes, node_index, state) for state in range(3)]
            atlas = Image.new("RGBA", (source.width, source.height * 3), (0, 0, 0, 0))
            for state, overlay in enumerate(states):
                atlas.alpha_composite(overlay, (0, state * source.height))
            atlas.save(OUTPUT / f"bloodstar-{phase_name}-node{node_index + 1}-pixel-weakpoint-v3.png", optimize=True)
            open_preview.alpha_composite(states[0])

            if node_index >= 2:
                mask, fragment = build_tentacle_assets(source, frame_nodes, node_index, frame_angles, node_index - 2)
                mask.save(OUTPUT / f"bloodstar-{phase_name}-tentacle{node_index - 1}-remove-mask-v2.png", optimize=True)
                fragment.save(OUTPUT / f"bloodstar-{phase_name}-tentacle{node_index - 1}-fragment-v2.png", optimize=True)
                removed_alpha = np.minimum(removed_alpha, 255 - np.asarray(mask.getchannel("A")))

        removed_preview.putalpha(Image.fromarray(removed_alpha.astype("uint8"), "L"))
        open_preview.save(OUTPUT / f"bloodstar-{phase_name}-bright-nodes-preview-v3.png", optimize=True)
        removed_preview.save(OUTPUT / f"bloodstar-{phase_name}-all-tentacles-removed-preview-v2.png", optimize=True)


if __name__ == "__main__":
    main()
