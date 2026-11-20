"""Normalize Iron Bloom animation sheets into isolated, padded 2x2 cells.

The generated key poses intentionally extend past their nominal quadrants.  This
tool finds each complete connected sprite on the full sheet, recovers the parts
that crossed a quadrant boundary, and recenters it inside a safe 627px cell.
It also converts the light checkerboard used by ImageGen previews into alpha.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


CELL = 627
SHEET = CELL * 2
SAFE_CONTENT = 535


@dataclass
class Component:
    root: int
    count: int
    min_x: int
    min_y: int
    max_x: int
    max_y: int
    sum_x: int
    sum_y: int

    @property
    def center(self) -> tuple[float, float]:
        return self.sum_x / self.count, self.sum_y / self.count


def to_rgba(path: Path) -> Image.Image:
    source = Image.open(path)
    if source.size != (SHEET, SHEET):
        raise ValueError(f"{path} is {source.size}; expected {(SHEET, SHEET)}")
    if source.mode == "RGBA" and source.getchannel("A").getextrema()[0] == 0:
        return source.copy()

    rgb = np.asarray(source.convert("RGB"), dtype=np.float32)
    high = rgb.max(axis=2)
    low = rgb.min(axis=2)
    mean = rgb.mean(axis=2)
    chroma = high - low

    corner_mean = float(np.mean(np.r_[mean[:24, :24].ravel(), mean[-24:, -24:].ravel()]))
    if corner_mean < 40:
        # Some generations use a black matte instead of a checkerboard.  The
        # small offset removes it while retaining nearly-black armor edges.
        alpha = (high - 3.0) * 20.0
    else:
        # The generated preview background is nearly neutral and brighter than
        # the boss.  Colored glows retain alpha through their strong chroma.
        alpha = np.maximum((220.0 - mean) * 12.0, (chroma - 5.0) * 18.0)
        alpha[(mean > 220.0) & (chroma < 12.0)] = 0
    alpha = np.clip(alpha, 0, 255).astype(np.uint8)
    rgba = np.dstack((rgb.astype(np.uint8), alpha))
    return Image.fromarray(rgba, "RGBA")


def connected_components(mask: np.ndarray):
    parent = [0]
    count = [0]
    min_x = [0]
    min_y = [0]
    max_x = [0]
    max_y = [0]
    sum_x = [0]
    sum_y = [0]
    runs: list[tuple[int, int, int, int]] = []

    def find(item: int) -> int:
        while parent[item] != item:
            parent[item] = parent[parent[item]]
            item = parent[item]
        return item

    def union(a: int, b: int) -> int:
        a = find(a)
        b = find(b)
        if a == b:
            return a
        if count[a] < count[b]:
            a, b = b, a
        parent[b] = a
        count[a] += count[b]
        min_x[a] = min(min_x[a], min_x[b])
        min_y[a] = min(min_y[a], min_y[b])
        max_x[a] = max(max_x[a], max_x[b])
        max_y[a] = max(max_y[a], max_y[b])
        sum_x[a] += sum_x[b]
        sum_y[a] += sum_y[b]
        return a

    previous: list[tuple[int, int, int]] = []
    for y in range(mask.shape[0]):
        xs = np.flatnonzero(mask[y])
        current: list[tuple[int, int, int]] = []
        if xs.size:
            breaks = np.flatnonzero(np.diff(xs) > 1)
            starts = np.r_[0, breaks + 1]
            ends = np.r_[breaks, xs.size - 1]
            previous_index = 0
            for start_index, end_index in zip(starts, ends):
                start = int(xs[start_index])
                end = int(xs[end_index])
                item = len(parent)
                pixels = end - start + 1
                parent.append(item)
                count.append(pixels)
                min_x.append(start)
                min_y.append(y)
                max_x.append(end)
                max_y.append(y)
                sum_x.append((start + end) * pixels // 2)
                sum_y.append(y * pixels)

                while previous_index < len(previous) and previous[previous_index][1] < start - 1:
                    previous_index += 1
                overlap_index = previous_index
                while overlap_index < len(previous) and previous[overlap_index][0] <= end + 1:
                    item = union(item, previous[overlap_index][2])
                    overlap_index += 1
                current.append((start, end, item))
                runs.append((y, start, end, item))
        previous = current

    components = []
    seen = set()
    for item in range(1, len(parent)):
        root = find(item)
        if root in seen:
            continue
        seen.add(root)
        components.append(
            Component(root, count[root], min_x[root], min_y[root], max_x[root], max_y[root], sum_x[root], sum_y[root])
        )
    return components, runs, find


def normalize(source_path: Path, output_path: Path, node_frames=None):
    source = to_rgba(source_path)
    alpha = np.asarray(source.getchannel("A"))
    components, runs, find = connected_components(alpha >= 96)
    bosses = sorted(components, key=lambda item: item.count, reverse=True)[:4]
    if len(bosses) != 4 or bosses[-1].count < 12_000:
        raise RuntimeError(f"Could not isolate four bosses in {source_path}; sizes={[item.count for item in bosses]}")

    # Preserve the intended TL, TR, BL, BR frame order.
    bosses.sort(key=lambda item: (item.center[1] >= CELL, item.center[0] >= CELL))
    result = Image.new("RGBA", (SHEET, SHEET), (0, 0, 0, 0))
    transformed_nodes = []
    metrics = []
    root_masks = {item.root: Image.new("L", (SHEET, SHEET), 0) for item in bosses}
    root_pixels = {root: mask.load() for root, mask in root_masks.items()}
    selected = set(root_masks)

    for y, start, end, item in runs:
        root = find(item)
        if root in selected:
            pixels = root_pixels[root]
            for x in range(start, end + 1):
                pixels[x, y] = 255

    for frame, component in enumerate(bosses):
        row, col = divmod(frame, 2)
        keep = root_masks[component.root].filter(ImageFilter.MaxFilter(9))
        kept_alpha = Image.fromarray(np.minimum(np.asarray(source.getchannel("A")), np.asarray(keep)).astype(np.uint8), "L")
        bbox = kept_alpha.getbbox()
        if not bbox:
            raise RuntimeError(f"Empty component for frame {frame}")
        isolated = source.copy()
        isolated.putalpha(kept_alpha)
        crop = isolated.crop(bbox)
        scale = min(SAFE_CONTENT / crop.width, SAFE_CONTENT / crop.height)
        width = max(1, round(crop.width * scale))
        height = max(1, round(crop.height * scale))
        resized = crop.resize((width, height), Image.Resampling.LANCZOS)
        local_x = (CELL - width) // 2
        local_y = (CELL - height) // 2
        result.alpha_composite(resized, (col * CELL + local_x, row * CELL + local_y))

        metrics.append(
            {
                "frame": frame,
                "source_bbox": bbox,
                "output_bbox": (local_x, local_y, local_x + width, local_y + height),
                "scale": scale,
                "component_pixels": component.count,
            }
        )
        if node_frames is not None:
            points = []
            for point_x, point_y in node_frames[frame]:
                global_x = col * CELL + point_x
                global_y = row * CELL + point_y
                points.append(
                    [
                        round(local_x + (global_x - bbox[0]) * scale, 1),
                        round(local_y + (global_y - bbox[1]) * scale, 1),
                    ]
                )
            transformed_nodes.append(points)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    result.save(output_path, optimize=True)
    return {"source": str(source_path), "output": str(output_path), "frames": metrics, "nodes": transformed_nodes}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--nodes", type=Path, help="JSON array containing four frame point arrays")
    args = parser.parse_args()
    node_frames = json.loads(args.nodes.read_text()) if args.nodes else None
    report = normalize(args.input, args.output, node_frames)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
