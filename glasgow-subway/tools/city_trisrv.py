"""Tiny triangle() server: reads length-prefixed pickles (A, switches) on stdin, writes (verts, tris) or None. Isolates segfaults."""
import sys, pickle, struct
import numpy as np, triangle
i = sys.stdin.buffer; o = sys.stdout.buffer
while True:
    h = i.read(4)
    if len(h) < 4: break
    A, sw = pickle.loads(i.read(struct.unpack("<I", h)[0]))
    try:
        r = triangle.triangulate(A, sw); out = (np.asarray(r["vertices"]), np.asarray(r["triangles"])) if "triangles" in r else None
    except Exception: out = None
    b = pickle.dumps(out); o.write(struct.pack("<I", len(b)) + b); o.flush()
