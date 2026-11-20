"""Prepare the generated Prism Warden atlases for the canvas renderer.

Image generation preserved the Phase I alpha matte, but the Phase II edit baked a
checkerboard into its RGB layer.  Both edits share the same registered 4x4 poses,
so the clean Phase I matte is the safest way to retain the complete Phase II body
without introducing rectangular artifacts.
"""

from pathlib import Path
from collections import deque

import numpy as np
from PIL import Image


GENERATED = Path(
    r"C:\Users\aring\.codex\generated_images\01a01b98-69c5-7890-924a-9cdf4235cad6"
)
ASSETS = Path(r"G:\starfighter\assets\bosses")

PHASE1_SOURCE = GENERATED / "exec-d701c87f-c724-4c3a-810f-c967b3e6f0b9.png"
PHASE2_SOURCE = GENERATED / "exec-74f80126-6f98-4c97-8339-edb43a2a8fa5.png"
PHASE1_OUTPUT = ASSETS / "boss-07-prism-warden-phase1-granular-16frame-alpha-v3.png"
PHASE2_OUTPUT = ASSETS / "boss-07-prism-warden-phase2-granular-16frame-alpha-v3.png"
PHASE1_WEAK_OUTPUT = ASSETS / "boss-07-prism-warden-phase1-weak-glow-mask-16frame-alpha-v2.png"
PHASE2_WEAK_OUTPUT = ASSETS / "boss-07-prism-warden-phase2-weak-glow-mask-16frame-alpha-v2.png"

CELL_WIDTH = 384
CELL_HEIGHT = 256
FRAME_CONTENT_SCALE = 0.86
NODE_PIXELS = [
    [(188, 129.5), (279.3, 75.5), (273.1, 199.3), (319.3, 136.8)],
    [(183.2, 130.1), (272.8, 73.8), (268.8, 198.7), (312.5, 136.3)],
    [(179.5, 131.6), (268.6, 74.6), (266.5, 197.7), (310.5, 136.3)],
    [(179.6, 131.5), (268.7, 74.1), (267.2, 197.3), (311.4, 138.2)],
    [(187.7, 131.5), (278.4, 74.7), (277.2, 201.2), (323, 141.1)],
    [(183.5, 135.4), (280.8, 78.7), (277.9, 204.9), (321.5, 142.6)],
    [(179.8, 136.3), (277.4, 78.3), (279.9, 203.4), (316.2, 144.7)],
    [(182.1, 136), (274.9, 79.8), (275.5, 200), (316.1, 144)],
    [(185.8, 135.3), (281.5, 77.3), (278, 205.7), (326.5, 142)],
    [(184.1, 136.6), (276.8, 80.5), (276.6, 199.5), (320.2, 145.3)],
    [(181.4, 139.7), (279.1, 77), (279.5, 203.3), (317.9, 147.4)],
    [(182.7, 136.5), (270.5, 79.8), (274, 199.7), (317.8, 148.4)],
    [(187.3, 131.6), (278.4, 77.8), (273.9, 199.4), (319.1, 138.5)],
    [(183.5, 132.1), (271.9, 76.1), (267.5, 198.4), (312.2, 138.4)],
    [(183.6, 133.4), (272.4, 78.9), (272.9, 197.3), (315.8, 143)],
    [(183.8, 133.3), (270.7, 78), (270.2, 198.3), (312.7, 142.3)],
]


def connected_components(mask: np.ndarray) -> list[tuple[int, tuple[int, int, int, int]]]:
    """Return 8-connected component areas and bounds for a small atlas cell."""
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    components: list[tuple[int, tuple[int, int, int, int]]] = []
    for start_y, start_x in zip(*np.nonzero(mask & ~seen)):
        if seen[start_y, start_x]:
            continue
        queue = deque([(int(start_y), int(start_x))])
        seen[start_y, start_x] = True
        area = 0
        min_x = max_x = int(start_x)
        min_y = max_y = int(start_y)
        while queue:
            y, x = queue.popleft()
            area += 1
            min_x, max_x = min(min_x, x), max(max_x, x)
            min_y, max_y = min(min_y, y), max(max_y, y)
            for next_y in range(max(0, y - 1), min(height, y + 2)):
                for next_x in range(max(0, x - 1), min(width, x + 2)):
                    if mask[next_y, next_x] and not seen[next_y, next_x]:
                        seen[next_y, next_x] = True
                        queue.append((next_y, next_x))
        components.append((area, (min_x, min_y, max_x, max_y)))
    return sorted(components, reverse=True)


def largest_component_mask(mask: np.ndarray) -> np.ndarray:
    """Keep the connected ship while discarding frame bleed and stray shards."""
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    largest: list[tuple[int, int]] = []
    for start_y, start_x in zip(*np.nonzero(mask & ~seen)):
        if seen[start_y, start_x]:
            continue
        queue = deque([(int(start_y), int(start_x))])
        seen[start_y, start_x] = True
        pixels: list[tuple[int, int]] = []
        while queue:
            y, x = queue.popleft()
            pixels.append((y, x))
            for next_y in range(max(0, y - 1), min(height, y + 2)):
                for next_x in range(max(0, x - 1), min(width, x + 2)):
                    if mask[next_y, next_x] and not seen[next_y, next_x]:
                        seen[next_y, next_x] = True
                        queue.append((next_y, next_x))
        if len(pixels) > len(largest):
            largest = pixels
    result = np.zeros_like(mask, dtype=bool)
    if largest:
        ys, xs = zip(*largest)
        result[np.asarray(ys), np.asarray(xs)] = True
    return result


def dilate_mask(mask: np.ndarray, iterations: int = 3) -> np.ndarray:
    result = mask.copy()
    for _ in range(iterations):
        padded = np.pad(result, 1, mode="constant")
        expanded = np.zeros_like(result)
        for offset_y in range(3):
            for offset_x in range(3):
                expanded |= padded[offset_y : offset_y + result.shape[0], offset_x : offset_x + result.shape[1]]
        result = expanded
    return result


def clean_alpha_cells(alpha: np.ndarray) -> np.ndarray:
    cleaned = np.zeros_like(alpha)
    for frame in range(16):
        row, col = divmod(frame, 4)
        top, left = row * CELL_HEIGHT, col * CELL_WIDTH
        cell = alpha[top : top + CELL_HEIGHT, left : left + CELL_WIDTH]
        # Segment from the solid matte so a faint antialias thread cannot join a
        # neighboring frame's shard to this frame's real ship. Then restore a
        # narrow fringe to preserve the ship's own antialiased edge.
        keep = dilate_mask(largest_component_mask(cell > 80), 3)
        cleaned[top : top + CELL_HEIGHT, left : left + CELL_WIDTH] = np.where(keep, cell, 0)
    return cleaned


def make_weak_glow_mask(rgba: np.ndarray, node_count: int) -> np.ndarray:
    """Extract only luminous pixels already belonging to tracked crystal facets."""
    output = np.zeros_like(rgba)
    yy, xx = np.mgrid[:CELL_HEIGHT, :CELL_WIDTH]
    for frame, points in enumerate(NODE_PIXELS):
        row, col = divmod(frame, 4)
        top, left = row * CELL_HEIGHT, col * CELL_WIDTH
        cell = rgba[top : top + CELL_HEIGHT, left : left + CELL_WIDTH]
        rgb = cell[..., :3].astype(np.float32)
        source_alpha = cell[..., 3].astype(np.float32) / 255
        blue_energy = rgb[..., 2] * 0.72 + rgb[..., 1] * 0.42 - rgb[..., 0] * 0.16
        brightness = rgb.mean(axis=2)
        crystal = np.clip((blue_energy - 78) / 115, 0, 1) * np.clip((brightness - 42) / 125, 0, 1)
        selection = np.zeros((CELL_HEIGHT, CELL_WIDTH), dtype=np.float32)
        for index, (node_x, node_y) in enumerate(points[:node_count]):
            radius_x = 38 if index == 0 else 36
            radius_y = 35 if index == 0 else 27
            distance = ((xx - node_x) / radius_x) ** 2 + ((yy - node_y) / radius_y) ** 2
            falloff = np.clip((1.08 - distance) / 0.23, 0, 1)
            selection = np.maximum(selection, falloff * crystal)
        mask_alpha = source_alpha * selection
        boosted = np.empty_like(rgb)
        boosted[..., 0] = np.clip(rgb[..., 0] * 0.78 + 92, 0, 255)
        boosted[..., 1] = np.clip(rgb[..., 1] * 0.72 + 142, 0, 255)
        boosted[..., 2] = 255
        out_cell = output[top : top + CELL_HEIGHT, left : left + CELL_WIDTH]
        out_cell[..., :3] = boosted.astype(np.uint8)
        out_cell[..., 3] = np.clip(mask_alpha * 255, 0, 255).astype(np.uint8)
    return output


def pad_every_frame(rgba: np.ndarray) -> np.ndarray:
    """Scale each registered pose inward so no real limb can touch a cell edge."""
    output = np.zeros_like(rgba)
    resized_width = round(CELL_WIDTH * FRAME_CONTENT_SCALE)
    resized_height = round(CELL_HEIGHT * FRAME_CONTENT_SCALE)
    for frame, points in enumerate(NODE_PIXELS):
        row, col = divmod(frame, 4)
        top, left = row * CELL_HEIGHT, col * CELL_WIDTH
        cell = Image.fromarray(
            rgba[top : top + CELL_HEIGHT, left : left + CELL_WIDTH], "RGBA"
        )
        resized = cell.resize(
            (resized_width, resized_height), Image.Resampling.LANCZOS
        )
        core_x, core_y = points[0]
        paste_x = round(core_x - core_x * FRAME_CONTENT_SCALE)
        paste_y = round(core_y - core_y * FRAME_CONTENT_SCALE)
        canvas = Image.new("RGBA", (CELL_WIDTH, CELL_HEIGHT))
        canvas.alpha_composite(resized, (paste_x, paste_y))
        output[top : top + CELL_HEIGHT, left : left + CELL_WIDTH] = np.asarray(canvas)
    return output


def main() -> None:
    phase1 = Image.open(PHASE1_SOURCE).convert("RGBA")
    phase2_rgb = np.asarray(Image.open(PHASE2_SOURCE).convert("RGB"), dtype=np.uint8)
    phase1_rgba = np.asarray(phase1, dtype=np.uint8)

    if phase1_rgba.shape[:2] != phase2_rgb.shape[:2]:
        raise ValueError("The two generated atlases must remain pixel-registered")

    # The model-produced matte is nearly binary but retains a useful soft fringe.
    # Suppress only its invisible 1/255 noise so the canvas never samples a haze.
    alpha = phase1_rgba[..., 3].copy()
    alpha[alpha < 8] = 0
    alpha = clean_alpha_cells(alpha)

    phase1_clean = phase1_rgba.copy()
    phase1_clean[..., 3] = alpha

    phase2_clean = np.dstack((phase2_rgb, alpha))

    phase1_weak = make_weak_glow_mask(phase1_clean, 3)
    phase2_weak = make_weak_glow_mask(phase2_clean, 4)

    phase1_clean = pad_every_frame(phase1_clean)
    phase2_clean = pad_every_frame(phase2_clean)
    phase1_weak = pad_every_frame(phase1_weak)
    phase2_weak = pad_every_frame(phase2_weak)

    for frame in range(16):
        row, col = divmod(frame, 4)
        cell_alpha = phase1_clean[
            row * CELL_HEIGHT : (row + 1) * CELL_HEIGHT,
            col * CELL_WIDTH : (col + 1) * CELL_WIDTH,
            3,
        ]
        ys, xs = np.where(cell_alpha > 8)
        bounds = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
        if bounds[0] <= 0 or bounds[1] <= 0 or bounds[2] >= CELL_WIDTH - 1 or bounds[3] >= CELL_HEIGHT - 1:
            raise ValueError(f"Frame {frame} still touches a cell edge: {bounds}")
        print(f"frame {frame:02d} padded bounds: {bounds}")

    Image.fromarray(phase1_clean, "RGBA").save(PHASE1_OUTPUT, optimize=True)
    Image.fromarray(phase2_clean, "RGBA").save(PHASE2_OUTPUT, optimize=True)
    Image.fromarray(phase1_weak, "RGBA").save(PHASE1_WEAK_OUTPUT, optimize=True)
    Image.fromarray(phase2_weak, "RGBA").save(PHASE2_WEAK_OUTPUT, optimize=True)

    for label, rgba in (("phase1", phase1_clean), ("phase2", phase2_clean)):
        a = rgba[..., 3]
        print(
            f"{label}: {rgba.shape[1]}x{rgba.shape[0]}, "
            f"visible={int(np.count_nonzero(a))}, opaque={int(np.count_nonzero(a > 245))}"
        )


if __name__ == "__main__":
    main()
