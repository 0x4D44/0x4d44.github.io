#!/usr/bin/env python3
"""Original, deterministic Andean ground textures; offline, no downloaded inputs.

The 1,023 independent samples are drawn on a torus. The last sample row and
column repeat the first, giving the explicit opposite-edge contract used by
the independent Node validator without mirroring any interior image region.
PNG palettes are lossless authored colour/vector tables, never a JPEG source.

Run with system Python, NumPy, Pillow and SciPy at low priority. All outputs
are review masters; groundsky_build.py supplies the compressed delivery pack.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import zlib

os.environ.setdefault("OPENBLAS_NUM_THREADS", "2")
os.environ.setdefault("OMP_NUM_THREADS", "2")

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates


ROOT = Path(__file__).resolve().parents[1]
N = 1023
SIZE = 1024
LUMA = 8
NORMAL_DIRECTIONS = 12
NORMAL_SLOPES = (0.09, 0.24, 0.60, 1.60)

# Ground colours are deliberately earthy, with no photographic baked lighting.
# Bases correspond to colour classes: substrate, secondary, dry/mineral, dark.
SPECS = [
    ("kikuyu_lush", "Kikuyu — lush", 2.0, "grass", [(70, 91, 42), (90, 110, 50), (112, 112, 61), (54, 64, 34)], 223),
    ("kikuyu_dry", "Kikuyu — dry", 2.0, "grass", [(137, 123, 72), (162, 145, 84), (108, 113, 56), (91, 80, 47)], 239),
    ("kikuyu_trampled", "Kikuyu — trampled", 2.0, "grass", [(106, 105, 59), (99, 111, 56), (137, 121, 77), (89, 69, 49)], 232),
    ("kikuyu_clover_edge", "Kikuyu — clover margin", 2.0, "grass", [(73, 89, 43), (95, 111, 51), (119, 116, 67), (55, 76, 38)], 223),
    ("dirt_brown", "Bare dirt — warm brown", 2.0, "dirt", [(119, 89, 64), (140, 114, 87), (164, 147, 111), (87, 67, 50)], 232),
    ("dirt_dry_pale", "Bare dirt — dry pale", 2.0, "dirt", [(157, 137, 105), (178, 162, 130), (128, 121, 100), (117, 95, 70)], 242),
    ("red_clay_dry", "Red clay — dry fissures", 2.5, "clay", [(150, 94, 66), (170, 112, 78), (188, 146, 103), (104, 67, 51)], 235),
    ("red_clay_wet", "Red clay — rain darkened", 2.5, "clay", [(108, 65, 47), (127, 74, 51), (146, 97, 69), (72, 48, 39)], 144),
    ("gravel_fine_grey", "Gravel — fine grey", 2.0, "gravel", [(113, 108, 96), (151, 149, 135), (178, 172, 153), (83, 83, 77)], 227),
    ("gravel_coarse_river", "Gravel — river rounded", 2.5, "gravel", [(126, 111, 88), (156, 150, 128), (176, 164, 139), (93, 101, 96)], 218),
    ("packed_earth_tyres", "Packed earth — tyre tracks", 4.0, "tracks", [(128, 104, 76), (146, 125, 91), (174, 151, 110), (93, 74, 56)], 227),
    ("packed_earth_footworn", "Packed earth — footworn", 3.0, "tracks", [(145, 126, 96), (164, 147, 112), (188, 170, 137), (106, 91, 69)], 224),
    ("mud_rutted", "Mud — shallow wheel ruts", 4.0, "mud", [(94, 77, 58), (114, 94, 71), (138, 119, 87), (60, 54, 45)], 162),
    ("mud_puddled", "Mud — puddled depressions", 3.0, "mud", [(99, 81, 59), (118, 101, 72), (142, 126, 96), (66, 66, 55)], 166),
    ("stone_scatter_dark", "Stone scatter — dark soil", 3.0, "stones", [(102, 83, 61), (140, 139, 126), (164, 149, 118), (75, 84, 72)], 230),
    ("stone_scatter_pale", "Stone scatter — pale soil", 3.0, "stones", [(157, 137, 102), (161, 155, 134), (189, 179, 150), (116, 122, 108)], 236),
    ("leaf_litter_eucalyptus", "Leaf litter — eucalyptus", 2.0, "leaves", [(106, 86, 59), (139, 132, 81), (171, 139, 83), (93, 94, 59)], 231),
    ("leaf_litter_mixed", "Leaf litter — mixed broadleaf", 2.0, "leaves", [(106, 88, 60), (149, 107, 64), (177, 149, 87), (84, 101, 55)], 235),
    ("cobble_edge_moss", "Cobble edge — moss joints", 2.5, "cobbles", [(69, 83, 47), (137, 135, 114), (161, 156, 133), (97, 106, 73)], 220),
    ("cracked_concrete_light", "Concrete — pale weathered", 3.0, "concrete", [(162, 158, 140), (183, 179, 159), (126, 126, 113), (89, 88, 79)], 226),
    ("cracked_concrete_dark", "Concrete — damp cracked", 3.0, "concrete", [(119, 123, 110), (139, 143, 125), (94, 105, 80), (65, 75, 63)], 196),
    ("asphalt_repaired", "Asphalt — repair patches", 3.0, "asphalt", [(91, 94, 88), (67, 70, 66), (138, 139, 124), (47, 50, 48)], 218),
    ("asphalt_gravel_edge", "Asphalt — gravel margin", 3.0, "asphalt", [(81, 85, 81), (120, 115, 102), (157, 151, 132), (54, 59, 57)], 227),
    ("sand_to_kikuyu", "Sand to kikuyu — organic margin", 4.0, "transition", [(174, 157, 116), (86, 106, 48), (129, 127, 67), (104, 91, 60)], 236),
]


def periodic_noise(rng: np.random.Generator, cells: int, n: int = N) -> np.ndarray:
    """Sample a genuine periodic random lattice, avoiding stitched/mirrored seams."""
    lattice = rng.random((cells, cells)).astype(np.float32)
    # Add wrap padding for cubic interpolation; coordinates never reach the duplicate endpoint.
    padded = np.pad(lattice, 2, mode="wrap")
    line = np.arange(n, dtype=np.float32) * cells / n + 2
    yy, xx = np.meshgrid(line, line, indexing="ij")
    field = map_coordinates(padded, [yy, xx], order=3, mode="wrap").astype(np.float32)
    return np.clip(field, 0.0, 1.0)


def wrap_end(a: np.ndarray) -> np.ndarray:
    return np.concatenate((np.concatenate((a, a[:1]), axis=0),
                           np.concatenate((a, a[:1]), axis=0)[:, :1]), axis=1)


class Surface:
    def __init__(self, spec: tuple, seed: int):
        self.id, self.title, self.metres, self.family, self.colours, self.rough = spec
        self.rng = np.random.default_rng(seed)
        self.low = periodic_noise(self.rng, 6)
        self.mid = periodic_noise(self.rng, 23)
        self.small = periodic_noise(self.rng, 64)
        self.shade = np.clip(2.0 + self.low * 2.6 + self.mid * 1.1 + self.small * 0.5, 0, 7)
        self.labels = np.zeros((N, N), dtype=np.uint8)
        self.height = (self.mid - 0.5) * 0.0012 + (self.small - 0.5) * 0.00025
        self.rough_delta = np.zeros((N, N), dtype=np.float32)

    def stamp(self, cx, cy, rx, ry, angle=0, label=1, height=0.005,
              shape="stone", shade=None, rough_delta=0):
        """Analytic toroidal footprint: rounded stone, tapered leaf or grass blade."""
        radius = int(math.ceil(max(rx, ry))) + 2
        xs = np.arange(int(cx) - radius, int(cx) + radius + 1)
        ys = np.arange(int(cy) - radius, int(cy) + radius + 1)
        xx, yy = np.meshgrid(xs - cx, ys - cy)
        c, s = math.cos(angle), math.sin(angle)
        u, v = (xx * c + yy * s) / rx, (-xx * s + yy * c) / ry
        if shape == "leaf":
            q = np.abs(u) + v * v
        elif shape == "blade":
            # Both ends taper; asymmetry comes from the off-axis central spine.
            q = u * u + np.abs(v) ** 1.25
        else:
            az = np.arctan2(v, u)
            edge = 1.0 + 0.10 * np.sin(az * 5.0 + cx) + 0.06 * np.cos(az * 3.0 + cy)
            q = (u * u + v * v) / edge
        mask = q < 1
        roi = np.ix_(ys % N, xs % N)
        lab = self.labels[roi]
        if label is not None:
            lab[mask] = label
            self.labels[roi] = lab
        hh = self.height[roi]
        bump = np.maximum(0, 1.0 - q) ** (0.55 if shape == "stone" else 0.9)
        hh += bump * height
        self.height[roi] = hh
        sh = self.shade[roi]
        if shade is not None:
            sh[mask] = np.clip(shade + 0.55 * np.sin(u[mask] * 3 + v[mask]), 0, 7)
            self.shade[roi] = sh
        if rough_delta:
            rr = self.rough_delta[roi]
            rr[mask] = rough_delta
            self.rough_delta[roi] = rr

    def stroke(self, points, width, label=3, height=-0.002, shade=2.5, rough_delta=0):
        """Draw a short wrapped polyline with a smooth cross-section in height."""
        p = np.asarray(points, dtype=np.float32)
        min_x, min_y = np.floor(p.min(axis=0) - width - 3).astype(int)
        max_x, max_y = np.ceil(p.max(axis=0) + width + 3).astype(int)
        # Sources deliberately use short paths: this also bounds memory for malformed input.
        if max_x - min_x > N or max_y - min_y > N:
            for a, b in zip(points[:-1], points[1:]):
                self.stroke([a, b], width, label, height, shade, rough_delta)
            return
        w, h = max_x - min_x + 1, max_y - min_y + 1
        mask_im = Image.new("L", (w, h))
        ImageDraw.Draw(mask_im).line([(float(x - min_x), float(y - min_y)) for x, y in points],
                                    fill=255, width=max(1, int(width)), joint="curve")
        mask = np.asarray(mask_im, dtype=np.float32) / 255.0
        soft = gaussian_filter(mask, 0.72)
        ys, xs = np.arange(min_y, max_y + 1) % N, np.arange(min_x, max_x + 1) % N
        roi = np.ix_(ys, xs)
        self.height[roi] += soft * height
        if label is not None:
            a = self.labels[roi]; a[mask > 0.1] = label; self.labels[roi] = a
        a = self.shade[roi]; a[mask > 0.1] = shade; self.shade[roi] = a
        if rough_delta:
            a = self.rough_delta[roi]; a[mask > 0.1] = rough_delta; self.rough_delta[roi] = a

    def grass(self, count, coverage=None, dry=False, sparse=False):
        for _ in range(count):
            x, y = self.rng.uniform(0, N, 2)
            if coverage is not None and not coverage[int(y), int(x)]:
                continue
            if sparse and self.low[int(y), int(x)] < 0.38:
                continue
            length = self.rng.uniform(6, 19)
            label = int(self.rng.choice([0, 1, 2, 3], p=[0.15, 0.48, 0.25 if dry else 0.09, 0.12 if dry else 0.28]))
            if self.family == "transition":
                label = int(self.rng.choice([1, 2], p=[0.78, 0.22]))
            self.stamp(x, y, self.rng.uniform(0.8, 1.8), length, self.rng.uniform(-math.pi, math.pi),
                       label, self.rng.uniform(0.0007, 0.0022), "blade", self.rng.uniform(2.0, 6.0))

    def pebbles(self, count, sizes=(2, 8), labels=(1, 2, 3), height=0.004, coverage=None):
        for _ in range(count):
            x, y = self.rng.uniform(0, N, 2)
            if coverage is not None and not coverage[int(y), int(x)]:
                continue
            rx = self.rng.uniform(*sizes)
            ry = rx * self.rng.uniform(0.6, 1.45)
            self.stamp(x, y, rx, ry, self.rng.uniform(-math.pi, math.pi),
                       int(self.rng.choice(labels)), height * rx / max(sizes), "stone", self.rng.uniform(2.0, 6.0))

    def fissures(self, cells=5, width=2.0, height=-0.002, label=3):
        """A relaxed jittered quadrilateral network; each vertex is shared by adjacent cells."""
        jitter = self.rng.uniform(-0.25, 0.25, (cells, cells, 2))
        step = N / cells
        for y in range(cells):
            for x in range(cells):
                start = (np.array([x + 0.5, y + 0.5]) + jitter[y, x]) * step
                for dx, dy in [(1, 0), (0, 1)]:
                    end = (np.array([x + dx + 0.5, y + dy + 0.5]) + jitter[(y + dy) % cells, (x + dx) % cells]) * step
                    mid = (start + end) / 2 + self.rng.uniform(-0.12, 0.12, 2) * step
                    self.stroke([start, mid, end], width, label, height, self.rng.uniform(1.5, 3.0))
                    if self.rng.random() < 0.40:
                        tip = mid + self.rng.uniform(-0.20, 0.20, 2) * step
                        self.stroke([mid, tip], max(1, width - 1), label, height * 0.65, 3.0)

    def build(self):
        family, key = self.family, self.id
        if family == "grass":
            if key == "kikuyu_trampled":
                self.labels[self.low + 0.35 * self.mid < 0.40] = 3
                self.labels[self.mid > 0.64] = 2
                self.height *= 0.5
            self.grass(2500 if key != "kikuyu_trampled" else 1800,
                       dry=key == "kikuyu_dry", sparse=key == "kikuyu_trampled")
            if key == "kikuyu_clover_edge":
                for _ in range(90):
                    x, y = self.rng.uniform(0, N, 2)
                    for theta in [0, 2.1, 4.2]:
                        self.stamp(x + 5 * math.cos(theta), y + 5 * math.sin(theta), 5, 7,
                                   theta, 3, 0.0018, "leaf", 4.8)
        elif family == "dirt":
            self.pebbles(380, (1.3, 4.5), height=0.0025)
            for _ in range(28):
                x, y = self.rng.uniform(0, N, 2)
                self.stroke([(x, y), (x + 14, y + 4), (x + 24, y + 14)], 1.0, 3, -0.0008, 2.8)
        elif family == "clay":
            self.fissures(7 if key.endswith("dry") else 4, 2 if key.endswith("dry") else 1, -0.003)
            self.pebbles(130, (1.5, 4.0), height=0.0018)
            if key.endswith("wet"):
                self.rough_delta[self.low < 0.35] = -35
        elif family == "gravel":
            if key == "gravel_fine_grey":
                self.pebbles(2200, (2.0, 7.5), height=0.006)
            else:
                self.pebbles(780, (6.0, 19.0), height=0.012)
                self.pebbles(400, (1.6, 5.0), height=0.003)
        elif family == "tracks":
            self.pebbles(340, (1.8, 5.0), height=0.0028)
            if key == "packed_earth_tyres":
                for track in [N * 0.25, N * 0.69]:
                    for y in np.arange(0, N, N / 18):
                        for side in [-1, 1]:
                            pts = [(track + side * 46, y - 15), (track + side * 10, y + 9)]
                            self.stroke(pts, 9, 3, -0.004, 3.0)
                    for y in np.arange(0, N, N / 16):
                        self.stroke([(track - 52, y), (track - 52, y + N / 16 + 1)], 3, 3, -0.002, 3.2)
                        self.stroke([(track + 52, y), (track + 52, y + N / 16 + 1)], 3, 3, -0.002, 3.2)
            else:
                x = np.arange(N)[None, :]
                y = np.arange(N)[:, None]
                worn = (np.sin(x * 2 * math.pi / N + 0.23 * np.sin(y * 4 * math.pi / N)) > 0.73)
                self.labels[worn] = 1
                self.shade[worn] += 0.35
                self.rough_delta[worn] = -15
                for _ in range(20):
                    cx, cy = self.rng.uniform(0, N, 2)
                    self.stamp(cx, cy, 10, 20, self.rng.uniform(-0.5, 0.5), None, -0.001, "stone")
        elif family == "mud":
            self.pebbles(95, (2.0, 5.0), height=0.002)
            if key == "mud_rutted":
                for track in [N * 0.22, N * 0.68]:
                    for y in np.arange(0, N, N / 32):
                        bend = 14 * math.sin(2 * math.pi * y / N)
                        self.stroke([(track + bend, y), (track + bend + 4, y + N / 32 + 2)],
                                    23, 3, -0.006, 3.0, -75)
                        self.stroke([(track + bend - 23, y), (track + bend - 22, y + N / 32 + 2)],
                                    8, 1, 0.003, 4.0)
            for _ in range(18 if key == "mud_puddled" else 6):
                cx, cy = self.rng.uniform(0, N, 2)
                self.stamp(cx, cy, self.rng.uniform(25, 75), self.rng.uniform(18, 45),
                           self.rng.uniform(0, math.pi), 3, -0.002, "stone", 4.1, -115)
        elif family == "stones":
            self.pebbles(100, (7, 24), height=0.018)
            self.pebbles(330, (1.8, 5), height=0.003)
        elif family == "leaves":
            self.pebbles(170, (1.5, 4), height=0.002)
            eucalyptus = key.endswith("eucalyptus")
            for _ in range(160 if eucalyptus else 190):
                x, y = self.rng.uniform(0, N, 2)
                angle = self.rng.uniform(0, 2 * math.pi)
                rx, ry = (self.rng.uniform(3, 7), self.rng.uniform(18, 35)) if eucalyptus else (self.rng.uniform(9, 17), self.rng.uniform(16, 27))
                label = int(self.rng.choice([1, 2, 3], p=[0.35, 0.46, 0.19]))
                self.stamp(x, y, rx, ry, angle, label, 0.0015, "leaf", self.rng.uniform(2.6, 5.6))
                along = np.array([-math.sin(angle), math.cos(angle)]) * ry * 0.85
                self.stroke([np.array([x, y]) - along, np.array([x, y]) + along], 1, None, 0.0005, 4.3)
        elif family == "cobbles":
            self.height -= 0.004
            rows, cols = 11, 12
            sy, sx = N / rows, N / cols
            for y in range(rows):
                for x in range(cols):
                    cx = (x + 0.5 + (y % 2) * 0.5) * sx + self.rng.uniform(-4, 4)
                    cy = (y + 0.5) * sy + self.rng.uniform(-4, 4)
                    self.stamp(cx, cy, sx * self.rng.uniform(0.39, 0.46), sy * self.rng.uniform(0.39, 0.46),
                               self.rng.uniform(-0.20, 0.20), int(self.rng.choice([1, 2, 3], p=[0.6, 0.32, 0.08])),
                               self.rng.uniform(0.012, 0.018), "stone", self.rng.uniform(2.4, 5.8))
            moss = self.labels == 0
            self.grass(400, coverage=moss)
        elif family == "concrete":
            self.pebbles(340, (1.0, 3.2), labels=(1, 2), height=0.00065)
            self.fissures(3, 2, -0.0018)
            if key.endswith("dark"):
                self.labels[self.low < 0.29] = 2
                self.rough_delta[self.low < 0.29] = -20
            else:
                for _ in range(30):
                    x, y = self.rng.uniform(0, N, 2)
                    self.stamp(x, y, self.rng.uniform(2, 6), self.rng.uniform(2, 5),
                               self.rng.uniform(0, math.pi), 2, -0.0005, "stone", 3.2)
        elif family == "asphalt":
            if key == "asphalt_repaired":
                self.labels[(self.low > 0.58) & (self.mid > 0.36)] = 1
                for x, y, rx, ry in [(260, 320, 140, 110), (760, 690, 150, 95), (920, 180, 60, 140)]:
                    self.stamp(x, y, rx, ry, 0.2, 3, 0.001, "stone", 3.2)
                    self.stamp(x, y, rx - 6, ry - 6, 0.2, 1, 0.001, "stone", 4.2)
                self.fissures(3, 1, -0.001, label=3)
                self.pebbles(950, (1.0, 2.3), labels=(0, 2), height=0.0007)
            else:
                edge = self.low + self.mid * 0.40 > 0.71
                self.labels[edge] = 1
                self.pebbles(1250, (2.0, 6.0), labels=(1, 2, 3), height=0.004, coverage=edge)
                self.pebbles(450, (1.0, 2.0), labels=(2,), height=0.0007)
        elif family == "transition":
            x, y = np.meshgrid(np.arange(N), np.arange(N))
            fringe = (np.cos(2 * math.pi * x / N + 0.30 * np.sin(4 * math.pi * y / N))
                      + (self.mid - 0.5) * 0.75 + (self.small - 0.5) * 0.3)
            grass = fringe > 0.10
            self.labels[grass] = 1
            self.labels[(fringe > -0.1) & (fringe <= 0.10)] = 2
            self.grass(4000, coverage=fringe > -0.18)
            self.pebbles(140, (1.5, 4.0), labels=(2, 3), height=0.0018, coverage=fringe < 0.10)
        return self

    def images(self):
        shade = np.clip(np.rint(self.shade), 0, LUMA - 1).astype(np.uint8)
        albedo_index = self.labels * LUMA + shade
        palette = []
        for colour in self.colours:
            for light in range(LUMA):
                scale = 0.87 + light * (0.26 / (LUMA - 1))
                palette.extend([int(np.clip(round(c * scale), 0, 255)) for c in colour])
        albedo = Image.fromarray(wrap_end(albedo_index), "P")
        albedo.putpalette(palette + [0] * (768 - len(palette)))

        smooth = gaussian_filter(self.height, 0.75, mode="wrap")
        # Tangent-space OpenGL +Y: image rows increase downwards, UV v upwards.
        dx = (np.roll(smooth, -1, 1) - np.roll(smooth, 1, 1)) * (N / self.metres) * 0.5
        dy = (np.roll(smooth, -1, 0) - np.roll(smooth, 1, 0)) * (N / self.metres) * 0.5
        gx, gy = -dx, dy
        slope = np.sqrt(gx * gx + gy * gy)
        direction = np.mod(np.rint(np.arctan2(gy, gx) * NORMAL_DIRECTIONS / (2 * math.pi)).astype(int), NORMAL_DIRECTIONS)
        levels = np.array(NORMAL_SLOPES)
        bin_id = np.argmin(abs(slope[:, :, None] - levels[None, None, :]), axis=2)
        normal_index = (1 + bin_id * NORMAL_DIRECTIONS + direction).astype(np.uint8)
        normal_index[slope < 0.045] = 0
        normal_palette = [128, 128, 255]
        for magnitude in NORMAL_SLOPES:
            length = math.sqrt(1 + magnitude * magnitude)
            for d in range(NORMAL_DIRECTIONS):
                angle = d * 2 * math.pi / NORMAL_DIRECTIONS
                vector = [magnitude * math.cos(angle) / length, magnitude * math.sin(angle) / length, 1.0 / length]
                normal_palette.extend([int(round((v * 0.5 + 0.5) * 255)) for v in vector])
        normal = Image.fromarray(wrap_end(normal_index), "P")
        normal.putpalette(normal_palette + [0] * (768 - len(normal_palette)))

        # AO derives from concavity, not albedo brightness. M is always zero.
        blur = gaussian_filter(smooth, 3.5, mode="wrap")
        concavity = np.clip((blur - smooth) * 300, 0, 1)
        ao_bin = np.clip(np.rint(concavity * 3), 0, 3).astype(np.uint8)
        rough_value = np.clip(self.rough + (self.mid - 0.5) * 18 + self.rough_delta, 24, 252)
        # Eight roughness bins include the smooth puddles and wet clay.
        rough_min = max(24, self.rough - (120 if self.family == "mud" else 42 if self.id.endswith("wet") else 24))
        rough_max = min(252, self.rough + 16)
        rough_bin = np.clip(np.rint((rough_value - rough_min) / (rough_max - rough_min) * 7), 0, 7).astype(np.uint8)
        orm = Image.fromarray(wrap_end(ao_bin * 8 + rough_bin), "P")
        orm_palette = []
        for a in range(4):
            for r in range(8):
                orm_palette.extend([255 - a * 15, int(round(rough_min + (rough_max - rough_min) * r / 7)), 0])
        orm.putpalette(orm_palette + [0] * (768 - len(orm_palette)))
        return {"albedo": albedo, "normal": normal, "orm": orm}


def hash_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save_png(image: Image.Image, path: Path):
    """Lossless row-filter search, including palette PNGs Pillow leaves unfiltered.

    This is an encoder only. Acceptance decodes the files in independent Node
    code and checks the actual pixels, not this function's array inputs.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = np.asarray(image, dtype=np.uint8)
    if image.mode == "P":
        channels, colour_type = 1, 3
    elif image.mode == "RGBA":
        channels, colour_type = 4, 6
    elif image.mode == "RGB":
        channels, colour_type = 3, 2
    else:
        raise ValueError("Unsupported source PNG mode: " + image.mode)
    pixels = raw.reshape(image.height, image.width * channels).astype(np.int16)
    left, above, upper_left = np.zeros_like(pixels), np.zeros_like(pixels), np.zeros_like(pixels)
    left[:, channels:] = pixels[:, :-channels]
    above[1:] = pixels[:-1]
    upper_left[1:, channels:] = pixels[:-1, :-channels]
    p = left + above - upper_left
    dl, da, du = abs(p - left), abs(p - above), abs(p - upper_left)
    paeth = np.where((dl <= da) & (dl <= du), left, np.where(da <= du, above, upper_left))
    predictors = [np.zeros_like(pixels), left, above, (left + above) // 2, paeth]
    filtered = [((pixels - predict) & 255).astype(np.uint8) for predict in predictors]
    candidates = []
    for i, rows in enumerate(filtered):
        stream = np.empty((image.height, rows.shape[1] + 1), dtype=np.uint8)
        stream[:, 0] = i; stream[:, 1:] = rows
        candidates.append(zlib.compress(stream.tobytes(), 9))
    scores = np.stack([abs(a.astype(np.int8).astype(np.int16)).sum(axis=1) for a in filtered])
    best = np.argmin(scores, axis=0)
    stream = np.empty((image.height, pixels.shape[1] + 1), dtype=np.uint8)
    for y, i in enumerate(best):
        stream[y, 0] = i; stream[y, 1:] = filtered[i][y]
    candidates.append(zlib.compress(stream.tobytes(), 9))
    compressed = min(candidates, key=len)

    def chunk(name: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + name + data + struct.pack(">I", zlib.crc32(name + data) & 0xFFFFFFFF)

    encoded = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", image.width, image.height, 8, colour_type, 0, 0, 0))
    if image.mode == "P":
        count = int(raw.max()) + 1
        encoded += chunk(b"PLTE", bytes(image.getpalette()[:count * 3]))
        if "transparency" in image.info:
            encoded += chunk(b"tRNS", bytes(image.info["transparency"][:count]))
    encoded += chunk(b"IDAT", compressed) + chunk(b"IEND", b"")
    temporary = path.with_suffix(".png.tmp")
    temporary.write_bytes(encoded)
    temporary.replace(path)


def record(path, key, kind, role, world_size, tiling, **extra):
    with Image.open(path) as image:
        width, height = image.size
    return {
        "id": key, "path": path.relative_to(ROOT).as_posix(), "format": "png",
        "kind": kind, "role": role, "width": width, "height": height,
        "tiling": {"x": tiling, "y": tiling}, "worldSizeM": world_size,
        "intendedUse": {
            "ground": "Repeat on terrain with a matching tangent normal and packed ORM; dormant review master.",
            "decal": "Place just above terrain, straight alpha blend, depth-write off; apply at the documented metre scale.",
            "blend-mask": "Linear scalar splat weights in RGBA; each channel is a separate full-resolution tileable mask.",
        }[kind],
        "colourSpace": "srgb" if role == "albedo" else "linear",
        "colourSpaceNotes": "sRGB colour, alpha linear, straight/unassociated alpha" if role == "albedo" else "Linear data; never apply sRGB decoding",
        "bytes": path.stat().st_size, "sha256": hash_file(path), **extra,
    }


DECALS = [
    ("dirt_patch_soft", "dirt_brown", [2.4, 2.1]),
    ("dirt_scuffed_path", "packed_earth_footworn", [3.8, 1.8]),
    ("dirt_footworn_spots", "dirt_dry_pale", [1.8, 1.6]),
    ("dirt_clay_margin", "red_clay_dry", [3.0, 2.6]),
    ("gravel_patch_fine", "gravel_fine_grey", [2.2, 2.0]),
    ("gravel_patch_coarse", "gravel_coarse_river", [2.8, 2.4]),
    ("gravel_spill_elongated", "gravel_fine_grey", [4.0, 1.5]),
    ("gravel_grass_intrusion", "stone_scatter_pale", [2.5, 2.0]),
    ("grass_patch_lush", "kikuyu_lush", [2.5, 2.2]),
    ("grass_patch_dry", "kikuyu_dry", [2.8, 2.4]),
    ("grass_patch_sparse", "kikuyu_trampled", [3.4, 2.2]),
    ("grass_patch_moss", "kikuyu_clover_edge", [1.2, 1.0]),
    ("mud_patch_dark", "mud_rutted", [2.4, 2.0]),
    ("mud_patch_puddle", "mud_puddled", [3.0, 2.5]),
    ("mud_patch_rut", "mud_rutted", [4.0, 1.4]),
    ("mud_patch_splash", "red_clay_wet", [1.6, 1.2]),
]


def build_decals(master: Path, files: list):
    n = 512
    line = np.linspace(-1, 1, n, dtype=np.float32)
    yy, xx = np.meshgrid(line, line, indexing="ij")
    for i, (key, material, metres) in enumerate(DECALS):
        source = Image.open(master / "ground" / f"{material}_albedo.png").convert("RGB")
        # The crop gives a different composition while retaining true material hue.
        x0, y0 = 40 + (i * 53) % 260, 30 + (i * 79) % 280
        source = source.crop((x0, y0, x0 + 700, y0 + 700)).resize((n, n), Image.Resampling.LANCZOS)
        indexed = source.quantize(colors=8, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        ci = np.asarray(indexed, dtype=np.uint8)
        colours = indexed.getpalette()[:24]
        angle = i * 0.67
        a, b = math.cos(angle), math.sin(angle)
        u, v = xx * a + yy * b, -xx * b + yy * a
        radius = np.sqrt((u / (0.94 if i % 3 else 0.82)) ** 2 + (v / 0.86) ** 2)
        theta = np.arctan2(v, u)
        boundary = (0.70 + 0.085 * np.sin(3 * theta + i * 0.5)
                    + 0.058 * np.sin(5 * theta - i * 0.8) + 0.035 * np.cos(9 * theta + i))
        # Non-concentric, varying-width feather. Marginal pinholes expose the ground below.
        feather = 0.15 + 0.035 * np.sin(theta * 4 + i)
        t = np.clip((boundary - radius) / feather + 0.5, 0, 1)
        alpha = t * t * (3 - 2 * t)
        if i in [2, 7, 10, 15]:
            small = np.sin(xx * (16 + i) + i) * np.cos(yy * (19 + i) - i)
            alpha *= np.clip(0.88 + small * 0.35, 0.6, 1.0)
        alpha[:8] = alpha[-8:] = 0
        alpha[:, :8] = alpha[:, -8:] = 0
        ai = np.clip(np.rint(alpha * 31), 0, 31).astype(np.uint8)
        image = Image.fromarray(ai * 8 + ci, "P")
        palette, transparency = [], []
        for ar in range(32):
            palette.extend(colours)
            transparency.extend([round(ar * 255 / 31)] * 8)
        image.putpalette(palette)
        image.info["transparency"] = bytes(transparency)
        path = master / "decals" / f"{key}_albedo.png"
        save_png(image, path)
        files.append(record(path, f"{key}_albedo", "decal", "albedo", metres, False,
                            material=material, materialId=material, decalId=key,
                            alphaMode="straight", transparentGutterPx=8, featherMetres=[0.08, 0.32],
                            channelPacking="RGB=sRGB material colour, A=linear terrain coverage"))
        print(f"decal {key}: {path.stat().st_size:,} bytes", flush=True)


MASK_NAMES = [
    "broad_islands", "fine_islands", "meandering_ribbons", "broken_rock_margin",
    "damp_hollows", "grass_tuft_islands", "branching_paths", "feathered_clay_patches",
]


def build_masks(master: Path, files: list):
    rng = np.random.default_rng(840219)
    fields = []
    y, x = np.meshgrid(np.arange(N) / N, np.arange(N) / N, indexing="ij")
    for i in range(8):
        broad = periodic_noise(rng, 4 + i)
        detail = periodic_noise(rng, 16 + i * 3)
        if i == 2:
            a = np.sin(x * 8 * math.pi + 1.6 * np.sin(y * 4 * math.pi)) * 0.5 + 0.5
        elif i == 6:
            a = np.maximum(1 - abs(np.sin(x * 6 * math.pi + detail)),
                           1 - abs(np.sin(y * 6 * math.pi + broad)))
        else:
            a = broad * 0.80 + detail * 0.20
        # Smooth thresholds retain intermediate coverage and produce exact endpoints 0,255.
        a = np.clip((a - 0.25) / 0.50, 0, 1)
        a = a * a * (3 - 2 * a)
        # Sixteen authored weights; consumers bilinearly filter then renormalise splat sums.
        a = np.rint(a * 15) * 17
        fields.append(wrap_end(np.rint(a).astype(np.uint8)))
    for i in range(2):
        image = Image.fromarray(np.stack(fields[i * 4:i * 4 + 4], axis=-1), "RGBA")
        path = master / "masks" / f"terrain_blend_masks_{i + 1:02d}.png"
        save_png(image, path)
        files.append(record(path, f"terrain_blend_masks_{i + 1:02d}", "blend-mask", "mask",
                            [8.0, 8.0], True, channels=MASK_NAMES[i * 4:i * 4 + 4],
                            alphaMode="data", channelPacking="RGBA = four independent scalar splat masks; alpha is data, not opacity",
                            atlasLayout="channel-packed; each mask uses the entire 1024 by 1024 image"))
        print(f"mask atlas {i + 1}: {path.stat().st_size:,} bytes", flush=True)


def verify_pngs(files):
    edge_count = 0
    total = 0
    for entry in files:
        path = ROOT / entry["path"]
        assert path.stat().st_size == entry["bytes"], entry["path"] + " file bytes"
        assert hash_file(path) == entry["sha256"], entry["path"] + " file SHA-256"
        with Image.open(path) as image:
            assert image.size == (entry["width"], entry["height"]), entry["path"] + " image dimensions"
            a = np.asarray(image.convert("RGBA"))
        total += entry["bytes"]
        if entry["tiling"]["x"]:
            assert np.array_equal(a[:, 0], a[:, -1]), entry["path"] + " x seam"
            assert np.array_equal(a[0], a[-1]), entry["path"] + " y seam"
            edge_count += 2
        if entry["role"] == "normal":
            vectors = a[:, :, :3].astype(np.float32) / 127.5 - 1
            lengths = np.linalg.norm(vectors, axis=2)
            assert float(abs(lengths - 1).max()) < 0.008, entry["path"] + " unit normals"
            assert np.all(vectors[:, :, 2] > 0), entry["path"] + " forward normals"
        if entry["role"] == "orm":
            assert np.all(a[:, :, 2] == 0), entry["path"] + " metallic"
        if entry["kind"] == "decal":
            alpha = a[:, :, 3]
            assert int(alpha.min()) == 0 and int(alpha.max()) == 255
            assert len(np.unique(alpha)) >= 12
            assert not np.any(alpha[:8]) and not np.any(alpha[-8:])
            assert not np.any(alpha[:, :8]) and not np.any(alpha[:, -8:])
    print(f"Source self-check: {len(files)} PNGs; {edge_count} exact edge comparisons; total {total:,} bytes", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", choices=["ground", "decals", "masks", "repack", "verify", "all"], default="all")
    args = parser.parse_args()
    try:
        os.nice(max(0, 19 - os.getpriority(os.PRIO_PROCESS, 0)))
    except (AttributeError, OSError):
        pass
    master = ROOT / "dev/groundsky/masters"
    metadata_path = ROOT / "dev/groundsky/ground-metadata.json"
    if args.only != "all" and metadata_path.exists():
        metadata = json.loads(metadata_path.read_text())
        keep = {"ground": "ground", "decals": "decal", "masks": "blend-mask", "repack": "none", "verify": "none"}[args.only]
        files = [x for x in metadata["files"] if x["kind"] != keep]
    else:
        files = []
    if args.only == "verify":
        if len(files) != 90:
            raise ValueError("Expected all 90 authored ground, decal and mask images for read-back verification")
        verify_pngs(files)
        return
    if args.only == "repack":
        for entry in files:
            path = ROOT / entry["path"]
            with Image.open(path) as source:
                image = source.copy()
            before = path.stat().st_size
            save_png(image, path)
            entry.update(bytes=path.stat().st_size, sha256=hash_file(path))
            print(f"repack {entry['id']}: {before:,} -> {entry['bytes']:,} bytes", flush=True)
    if args.only in ["all", "ground"]:
        for i, spec in enumerate(SPECS):
            surface = Surface(spec, 913000 + i * 131).build()
            images = surface.images()
            image_bytes = 0
            for role, image in images.items():
                path = master / "ground" / f"{surface.id}_{role}.png"
                save_png(image, path)
                image_bytes += path.stat().st_size
                files.append(record(path, f"{surface.id}_{role}", "ground", role,
                                    [surface.metres, surface.metres], True,
                                    material=surface.id, materialId=surface.id,
                                    title=surface.title,
                                    channelPacking={"albedo": "RGB=sRGB base colour, A=opaque",
                                                    "normal": "RGB=OpenGL tangent normal, +Y; A=opaque",
                                                    "orm": "R=ambient occlusion, G=perceptual roughness, B=metallic (zero), A=opaque"}[role]))
            print(f"ground {i + 1:02d}/24 {surface.id}: {image_bytes:,} bytes", flush=True)
    if args.only in ["all", "decals"]:
        build_decals(master, files)
    if args.only in ["all", "masks"]:
        build_masks(master, files)
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata = {
        "version": 1, "generator": "tools/groundsky_ground.py", "seed": 913000,
        "provenance": "Entirely original deterministic procedural texturing. No source photographs, scraped images, or reused textures.",
        "materials": [{"id": s[0], "title": s[1], "worldSizeM": [s[2], s[2]], "family": s[3]} for s in SPECS],
        "files": sorted(files, key=lambda x: x["path"]),
    }
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n")
    verify_pngs(files)


if __name__ == "__main__":
    main()
