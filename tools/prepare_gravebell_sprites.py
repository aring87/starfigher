"""Convert generated Gravebell animation sheets into safe transparent atlases."""

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


GENERATED = Path(
    r"C:\Users\aring\.codex\generated_images\01a01b98-69c5-7890-924a-9cdf4235cad6"
)
ASSETS = Path(r"G:\starfighter\assets\bosses")

PHASE1_SOURCE = GENERATED / "exec-86308419-3f6e-4644-b4d9-43c96687f560.png"
PHASE2_SOURCE = GENERATED / "exec-d07d80f5-5b6a-4a49-94e1-20a2bbed8453.png"
PHASE1_OUTPUT = ASSETS / "boss-08-gravebell-phase1-granular-16frame-alpha-v1.png"
PHASE2_OUTPUT = ASSETS / "boss-08-gravebell-phase2-granular-16frame-alpha-v1.png"
PHASE1_WEAK_OUTPUT = ASSETS / "boss-08-gravebell-phase1-weak-glow-mask-16frame-alpha-v1.png"
PHASE2_WEAK_OUTPUT = ASSETS / "boss-08-gravebell-phase2-weak-glow-mask-16frame-alpha-v1.png"

SOURCE_GRID = 4
OUTPUT_CELL = 320
PADDED_CONTENT = 282


def component_filter(mask: np.ndarray, minimum_area: int = 12) -> np.ndarray:
    """Remove tiny checkerboard compression flecks while retaining separate chains."""
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    result = np.zeros_like(mask, dtype=bool)
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
        if len(pixels) >= minimum_area:
            ys, xs = zip(*pixels)
            result[np.asarray(ys), np.asarray(xs)] = True
    return result


def extract_transparent_cell(cell: Image.Image) -> Image.Image:
    rgb = np.asarray(cell.convert("RGB"), dtype=np.uint8)
    maximum = rgb.max(axis=2).astype(np.int16)
    minimum = rgb.min(axis=2).astype(np.int16)
    saturation = maximum - minimum

    # The generated background is a neutral 242–255 checkerboard. The boss is
    # darker and/or violet, including its bright energy pixels.
    foreground = (minimum < 226) | (saturation > 18)
    foreground = component_filter(foreground)

    matte = Image.fromarray((foreground * 255).astype(np.uint8), "L").filter(
        ImageFilter.GaussianBlur(0.55)
    )
    rgba = np.dstack((rgb, np.asarray(matte, dtype=np.uint8)))
    rgba[rgba[..., 3] == 0, :3] = 0
    return Image.fromarray(rgba, "RGBA")


def find_grid_cuts(source: Image.Image) -> tuple[list[int], list[int]]:
    """Put cuts in the quiet gutters instead of assuming mathematically equal cells."""
    rgb = np.asarray(source, dtype=np.uint8)
    maximum = rgb.max(axis=2).astype(np.int16)
    minimum = rgb.min(axis=2).astype(np.int16)
    foreground = (minimum < 226) | ((maximum - minimum) > 18)

    def cuts_for_axis(projection: np.ndarray, length: int) -> list[int]:
        cuts = [0]
        radius = round(length * 0.055)
        for index in range(1, SOURCE_GRID):
            expected = round(index * length / SOURCE_GRID)
            start, stop = expected - radius, expected + radius
            # Score a slim band so one stray antialiased pixel cannot select a bad cut.
            scores = np.convolve(projection, np.ones(5, dtype=np.int64), mode="same")
            cut = int(start + np.argmin(scores[start:stop]))
            cuts.append(cut)
        cuts.append(length)
        return cuts

    return (
        cuts_for_axis(foreground.sum(axis=0), source.width),
        cuts_for_axis(foreground.sum(axis=1), source.height),
    )


def build_atlas(source_path: Path) -> np.ndarray:
    source = Image.open(source_path).convert("RGB")
    x_edges, y_edges = find_grid_cuts(source)
    print(f"{source_path.name} x cuts: {x_edges}; y cuts: {y_edges}")
    atlas = Image.new("RGBA", (OUTPUT_CELL * 4, OUTPUT_CELL * 4))
    widest = max(right - left for left, right in zip(x_edges, x_edges[1:]))
    tallest = max(bottom - top for top, bottom in zip(y_edges, y_edges[1:]))
    scale = min(PADDED_CONTENT / widest, PADDED_CONTENT / tallest)

    for frame in range(16):
        row, col = divmod(frame, 4)
        cell = source.crop(
            (x_edges[col], y_edges[row], x_edges[col + 1], y_edges[row + 1])
        )
        transparent = extract_transparent_cell(cell)
        resized = (round(cell.width * scale), round(cell.height * scale))
        transparent = transparent.resize(
            resized, Image.Resampling.LANCZOS
        )
        paste = ((OUTPUT_CELL - resized[0]) // 2, (OUTPUT_CELL - resized[1]) // 2)
        atlas.alpha_composite(
            transparent, (col * OUTPUT_CELL + paste[0], row * OUTPUT_CELL + paste[1])
        )

    return np.asarray(atlas)


def report_bounds(label: str, rgba: np.ndarray) -> None:
    for frame in range(16):
        row, col = divmod(frame, 4)
        alpha = rgba[
            row * OUTPUT_CELL : (row + 1) * OUTPUT_CELL,
            col * OUTPUT_CELL : (col + 1) * OUTPUT_CELL,
            3,
        ]
        ys, xs = np.where(alpha > 8)
        bounds = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
        if min(bounds[0], bounds[1]) <= 0 or bounds[2] >= OUTPUT_CELL - 1 or bounds[3] >= OUTPUT_CELL - 1:
            raise ValueError(f"{label} frame {frame} touches a cell edge: {bounds}")
        print(f"{label} frame {frame:02d}: {bounds}")


def build_weak_mask(
    label: str,
    rgba: np.ndarray,
    seeds: list[tuple[float, float]],
    radii: list[tuple[float, float]],
) -> tuple[np.ndarray, list[list[list[float]]]]:
    """Retain only violet sprite pixels near tracked hardware/energy nodes."""
    mask_atlas = np.zeros_like(rgba)
    positions: list[list[list[float]]] = []
    tracked = [list(seed) for seed in seeds]
    for frame in range(16):
        row, col = divmod(frame, 4)
        cell = rgba[
            row * OUTPUT_CELL : (row + 1) * OUTPUT_CELL,
            col * OUTPUT_CELL : (col + 1) * OUTPUT_CELL,
        ]
        rgb = cell[..., :3].astype(np.int16)
        source_alpha = cell[..., 3].astype(np.float32) / 255
        maximum = rgb.max(axis=2)
        # Violet energy has both red and blue above green. Weight the bright
        # cores most heavily so animation tracking stays on actual sprite light.
        purple = np.maximum(0, rgb[..., 0] - rgb[..., 1] + 8) + np.maximum(
            0, rgb[..., 2] - rgb[..., 1] + 10
        )
        energy = source_alpha * purple * np.maximum(0, maximum - 48)
        yy, xx = np.mgrid[:OUTPUT_CELL, :OUTPUT_CELL]
        frame_positions: list[list[float]] = []
        combined = np.zeros((OUTPUT_CELL, OUTPUT_CELL), dtype=bool)
        for index, ((seed_x, seed_y), (radius_x, radius_y)) in enumerate(
            zip(tracked, radii)
        ):
            search_x, search_y = radius_x * 1.45, radius_y * 1.45
            search = (
                ((xx - seed_x) / search_x) ** 2
                + ((yy - seed_y) / search_y) ** 2
                <= 1
            )
            weights = energy * search
            total = weights.sum()
            if total > 0:
                center_x = float((weights * xx).sum() / total)
                center_y = float((weights * yy).sum() / total)
                # Avoid a single sparkle producing a visible tracking snap.
                center_x = float(np.clip(center_x, seed_x - 5.5, seed_x + 5.5))
                center_y = float(np.clip(center_y, seed_y - 5.5, seed_y + 5.5))
                tracked[index] = [center_x, center_y]
            else:
                center_x, center_y = seed_x, seed_y
            frame_positions.append([round(center_x, 1), round(center_y, 1)])
            region = (
                ((xx - center_x) / radius_x) ** 2
                + ((yy - center_y) / radius_y) ** 2
                <= 1
            )
            selected = region & (source_alpha > 0.08) & (purple > 28) & (maximum > 78)
            combined |= selected

        # Slightly join neighboring lit pixels, then clip back to the sprite's
        # original alpha: the weakpoint remains the art's real silhouette.
        expanded = np.asarray(
            Image.fromarray((combined * 255).astype(np.uint8), "L").filter(
                ImageFilter.MaxFilter(3)
            )
        )
        alpha = (
            expanded.astype(np.float32) / 255 * source_alpha * 255
        ).astype(np.uint8)
        destination = mask_atlas[
            row * OUTPUT_CELL : (row + 1) * OUTPUT_CELL,
            col * OUTPUT_CELL : (col + 1) * OUTPUT_CELL,
        ]
        destination[..., :3] = cell[..., :3]
        destination[..., 3] = alpha
        positions.append(frame_positions)
    print(f"{label} node pixels = {positions}")
    return mask_atlas, positions


def main() -> None:
    phase1 = build_atlas(PHASE1_SOURCE)
    phase2 = build_atlas(PHASE2_SOURCE)
    report_bounds("phase1", phase1)
    report_bounds("phase2", phase2)
    Image.fromarray(phase1, "RGBA").save(PHASE1_OUTPUT, optimize=True)
    Image.fromarray(phase2, "RGBA").save(PHASE2_OUTPUT, optimize=True)
    phase1_weak, _ = build_weak_mask(
        "phase1", phase1, [(139, 100), (149, 171), (219, 151)], [(11, 9), (15, 22), (13, 13)]
    )
    phase2_weak, _ = build_weak_mask(
        "phase2", phase2, [(139, 114), (166, 184), (103, 207), (258, 207)], [(11, 9), (26, 22), (12, 12), (12, 12)]
    )
    Image.fromarray(phase1_weak, "RGBA").save(PHASE1_WEAK_OUTPUT, optimize=True)
    Image.fromarray(phase2_weak, "RGBA").save(PHASE2_WEAK_OUTPUT, optimize=True)
    print(PHASE1_OUTPUT)
    print(PHASE2_OUTPUT)
    print(PHASE1_WEAK_OUTPUT)
    print(PHASE2_WEAK_OUTPUT)


if __name__ == "__main__":
    main()
