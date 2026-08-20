// ============================================================
// The Triangle Engine — gfx.js
// ------------------------------------------------------------
// A small, exact, dependency-free software renderer. Every picture on
// this page that shows a triangle being *drawn* is drawn by this file:
// the same matrices, the same edge functions, the same perspective
// divide that a GPU performs in silicon, written out in JavaScript so
// they can be stepped through and read.
//
// Conventions, chosen to match the hardware the page describes:
//
//   * Matrices are 4x4, column-major Float64Array (m[col * 4 + row]) —
//     the layout OpenGL has used since 1992.
//   * Clip space is OpenGL's: -w <= x, y, z <= w, with the near plane
//     at z = -w. NDC z therefore lands in [-1, 1].
//   * Screen space has y pointing DOWN, like a framebuffer. The viewport
//     transform flips y, which also flips the sign of every signed area —
//     so a front face here has a POSITIVE screen-space area, the opposite
//     of the sign the same winding gives in NDC. Both mesh generators
//     below are wound to match, and a test checks that they agree.
//   * Screen coordinates are snapped to a sub-pixel grid before
//     rasterization, as real hardware does — though at 4 fractional bits
//     rather than the 8 Direct3D mandates, so the grid is coarse enough
//     to see. It is what makes the fill rules exact rather than a matter
//     of floating-point luck.
//
// Nothing in this file touches the DOM, so all of it is testable.
// ============================================================
(function (global) {
  "use strict";

  // Sub-pixel grid. 4 fractional bits: coordinates become integers in
  // 1/16ths of a pixel, so edge functions are exact integer arithmetic.
  var SUBPIXEL_BITS = 4;
  var SUB = 1 << SUBPIXEL_BITS;

  // ----------------------------------------------------------
  // Vectors
  // ----------------------------------------------------------
  function v3(x, y, z) { return [x, y, z]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }
  function length(a) { return Math.sqrt(dot(a, a)); }
  function normalize(a) {
    var l = length(a);
    return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

  // ----------------------------------------------------------
  // Matrices (column-major, OpenGL layout)
  // ----------------------------------------------------------
  function identity() {
    var m = new Float64Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  }

  // multiply(a, b) composes so that apply(multiply(a, b), v) === apply(a, apply(b, v)).
  function multiply(a, b) {
    var o = new Float64Array(16);
    for (var c = 0; c < 4; c++) {
      for (var r = 0; r < 4; r++) {
        var s = 0;
        for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
    }
    return o;
  }

  function multiplyAll(list) {
    var m = identity();
    for (var i = 0; i < list.length; i++) m = multiply(m, list[i]);
    return m;
  }

  // Transforms a homogeneous point. v may be [x, y, z] (w defaults to 1).
  function apply(m, v) {
    var w = v.length > 3 ? v[3] : 1;
    return [
      m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * w,
      m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * w,
      m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * w,
      m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * w,
    ];
  }

  // Transforms a direction: ignores translation. Correct for normals only
  // when the matrix has no non-uniform scale or shear (see normalMatrix).
  function applyDirection(m, v) {
    return [
      m[0] * v[0] + m[4] * v[1] + m[8] * v[2],
      m[1] * v[0] + m[5] * v[1] + m[9] * v[2],
      m[2] * v[0] + m[6] * v[1] + m[10] * v[2],
    ];
  }

  function translation(x, y, z) {
    var m = identity();
    m[12] = x; m[13] = y; m[14] = z;
    return m;
  }

  function scaling(x, y, z) {
    var m = identity();
    m[0] = x; m[5] = y === undefined ? x : y; m[10] = z === undefined ? x : z;
    return m;
  }

  function rotationX(a) {
    var m = identity(), c = Math.cos(a), s = Math.sin(a);
    m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
    return m;
  }

  function rotationY(a) {
    var m = identity(), c = Math.cos(a), s = Math.sin(a);
    m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
    return m;
  }

  function rotationZ(a) {
    var m = identity(), c = Math.cos(a), s = Math.sin(a);
    m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
    return m;
  }

  // The projection every real-time renderer has used since the 1960s,
  // in the exact form glFrustum/gluPerspective produce. The whole trick
  // is row 4: it copies -z into w, so the divide that follows scales
  // everything by distance.
  function perspective(fovyRadians, aspect, near, far) {
    var f = 1 / Math.tan(fovyRadians / 2);
    var m = new Float64Array(16);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) / (near - far);
    m[11] = -1;
    m[14] = (2 * far * near) / (near - far);
    return m;
  }

  function orthographic(left, right, bottom, top, near, far) {
    var m = identity();
    m[0] = 2 / (right - left);
    m[5] = 2 / (top - bottom);
    m[10] = -2 / (far - near);
    m[12] = -(right + left) / (right - left);
    m[13] = -(top + bottom) / (top - bottom);
    m[14] = -(far + near) / (far - near);
    return m;
  }

  function lookAt(eye, target, up) {
    var f = normalize(sub(target, eye));
    var s = normalize(cross(f, up));
    var u = cross(s, f);
    var m = identity();
    m[0] = s[0]; m[4] = s[1]; m[8] = s[2];
    m[1] = u[0]; m[5] = u[1]; m[9] = u[2];
    m[2] = -f[0]; m[6] = -f[1]; m[10] = -f[2];
    m[12] = -dot(s, eye);
    m[13] = -dot(u, eye);
    m[14] = dot(f, eye);
    return m;
  }

  // Inverse-transpose of the upper 3x3, for transforming normals through
  // a non-uniform scale. Returned as a 4x4 so it composes with the rest.
  function normalMatrix(m) {
    var a = m[0], b = m[1], c = m[2];
    var d = m[4], e = m[5], f = m[6];
    var g = m[8], h = m[9], i = m[10];
    var det = a * (e * i - f * h) - d * (b * i - c * h) + g * (b * f - c * e);
    var o = identity();
    if (Math.abs(det) < 1e-12) return o;
    var id = 1 / det;
    // inverse of the 3x3, then transposed (written out directly)
    o[0] = (e * i - f * h) * id;
    o[4] = -(b * i - c * h) * id;
    o[8] = (b * f - c * e) * id;
    o[1] = -(d * i - f * g) * id;
    o[5] = (a * i - c * g) * id;
    o[9] = -(a * f - c * d) * id;
    o[2] = (d * h - e * g) * id;
    o[6] = -(a * h - b * g) * id;
    o[10] = (a * e - b * d) * id;
    return o;
  }

  // ----------------------------------------------------------
  // The perspective divide, and the viewport transform
  // ----------------------------------------------------------
  function perspectiveDivide(clip) {
    var w = clip[3];
    if (w === 0) return [0, 0, 0, 0];
    return [clip[0] / w, clip[1] / w, clip[2] / w, w];
  }

  // NDC (-1..1, y up) to screen pixels (0..width, y down).
  function viewport(ndc, width, height) {
    return [
      (ndc[0] * 0.5 + 0.5) * width,
      (1 - (ndc[1] * 0.5 + 0.5)) * height,
      ndc[2],
    ];
  }

  // ----------------------------------------------------------
  // Near-plane clipping (Sutherland-Hodgman)
  // ------------------------------------------------------------
  // The near plane in OpenGL clip space is z = -w, so the inside
  // half-space is z + w >= 0. That is the plane that genuinely MUST be
  // clipped: it is where w passes through zero and the divide blows up,
  // and it is also where geometry closer than the near plane would
  // otherwise survive with an NDC z far below -1. Clipping w >= 0 alone
  // is NOT the same test — it lets everything between the eye and the
  // near plane through.
  //
  // The other five planes are an optimisation; a rasterizer that clamps
  // its bounding box handles them.
  // ----------------------------------------------------------
  function nearDistance(vertex) {
    return vertex.clip[2] + vertex.clip[3];
  }

  function clipNear(polygon, epsilon) {
    var eps = epsilon === undefined ? 0 : epsilon;
    var out = [];
    var n = polygon.length;
    if (n === 0) return out;
    for (var i = 0; i < n; i++) {
      var a = polygon[i];
      var b = polygon[(i + 1) % n];
      var da = nearDistance(a) - eps;
      var db = nearDistance(b) - eps;
      var aIn = da >= 0;
      var bIn = db >= 0;
      if (aIn) out.push(a);
      if (aIn !== bIn) {
        var t = da / (da - db);
        out.push(lerpVertex(a, b, t));
      }
    }
    return out;
  }

  function lerpVertex(a, b, t) {
    var clip = [
      a.clip[0] + (b.clip[0] - a.clip[0]) * t,
      a.clip[1] + (b.clip[1] - a.clip[1]) * t,
      a.clip[2] + (b.clip[2] - a.clip[2]) * t,
      a.clip[3] + (b.clip[3] - a.clip[3]) * t,
    ];
    var attrs = [];
    var av = a.attrs || [];
    var bv = b.attrs || [];
    for (var i = 0; i < Math.max(av.length, bv.length); i++) {
      var x = av[i] || 0, y = bv[i] || 0;
      attrs.push(x + (y - x) * t);
    }
    return { clip: clip, attrs: attrs };
  }

  // Fans a convex polygon into triangles, the way a clipper's output is consumed.
  function fanTriangles(polygon) {
    var tris = [];
    for (var i = 1; i + 1 < polygon.length; i++) {
      tris.push([polygon[0], polygon[i], polygon[i + 1]]);
    }
    return tris;
  }

  // ----------------------------------------------------------
  // The edge function (Pineda, 1988)
  // ------------------------------------------------------------
  // E(a, b, p) is twice the signed area of the triangle a-b-p. Its sign
  // says which side of the directed line a->b the point p falls on, and
  // that single test — evaluated three times — is the whole of triangle
  // rasterization. It is also incrementally cheap: E(x + 1, y) differs
  // from E(x, y) by a constant, which is why hardware likes it.
  // ----------------------------------------------------------
  function edge(ax, ay, bx, by, px, py) {
    return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  }

  // Fill rule. With screen-space y pointing down and the winding
  // normalised so the signed area is positive, an edge owns the pixels
  // exactly on it if it is a TOP edge (horizontal, running left to
  // right) or a LEFT edge (running upward). Every other edge disowns
  // them. Two triangles sharing an edge then cover each pixel on it
  // exactly once: no seams, no double-blended pixels.
  function isTopLeft(ax, ay, bx, by) {
    if (ay === by) return bx > ax;
    return by < ay;
  }

  function snap(value) { return Math.round(value * SUB); }

  // ----------------------------------------------------------
  // rasterTriangle
  // ------------------------------------------------------------
  // Walks the bounding box of a screen-space triangle and calls back for
  // every covered sample. Vertices are { x, y } in pixels plus whatever
  // else the caller wants to carry.
  //
  // options:
  //   width, height     clip the bounding box to the target
  //   cull              "back" | "front" | "none" (default "none")
  //   fillRule          true (default) to apply the top-left rule
  //   samples           sample offsets within the pixel, default one at
  //                     the centre; pass an MSAA pattern for coverage
  //
  // The callback receives (x, y, bary, info) where bary is the
  // screen-space barycentric triple (l0, l1, l2) summing to 1, and info
  // carries the raw edge values and the coverage mask.
  // ----------------------------------------------------------
  var CENTRE = [[0.5, 0.5]];

  function rasterTriangle(v0, v1, v2, options, callback) {
    var opts = options || {};
    var samples = opts.samples || CENTRE;
    var fillRule = opts.fillRule !== false;

    var x0 = snap(v0.x), y0 = snap(v0.y);
    var x1 = snap(v1.x), y1 = snap(v1.y);
    var x2 = snap(v2.x), y2 = snap(v2.y);

    var area2 = edge(x0, y0, x1, y1, x2, y2);
    if (area2 === 0) return { area2: 0, culled: true, pixels: 0 };

    var frontFacing = area2 > 0;
    var cull = opts.cull || "none";
    if ((cull === "back" && !frontFacing) || (cull === "front" && frontFacing)) {
      return { area2: area2, culled: true, pixels: 0 };
    }

    // Normalise winding so the area is positive; remember the swap so the
    // caller's barycentrics still refer to its own vertex order. The
    // caller's own signed area is kept for the return value — flipping it
    // silently would make every triangle look front-facing.
    var callerArea2 = area2;
    var swapped = false;
    if (!frontFacing) {
      var tx = x1, ty = y1;
      x1 = x2; y1 = y2; x2 = tx; y2 = ty;
      area2 = -area2;
      swapped = true;
    }

    var minX = Math.max(0, Math.floor(Math.min(x0, x1, x2) / SUB));
    var maxX = Math.ceil(Math.max(x0, x1, x2) / SUB);
    var minY = Math.max(0, Math.floor(Math.min(y0, y1, y2) / SUB));
    var maxY = Math.ceil(Math.max(y0, y1, y2) / SUB);
    if (opts.width !== undefined) maxX = Math.min(maxX, opts.width - 1);
    if (opts.height !== undefined) maxY = Math.min(maxY, opts.height - 1);

    // Edge 0 faces vertex 0, and so on: E0 is the edge v1->v2.
    var topLeft0 = isTopLeft(x1, y1, x2, y2);
    var topLeft1 = isTopLeft(x2, y2, x0, y0);
    var topLeft2 = isTopLeft(x0, y0, x1, y1);

    var invArea = 1 / area2;
    var pixels = 0;
    var bary = [0, 0, 0];
    // NOTE: `bary` and `info` are reused between callbacks — copy them if
    // you need to keep them. `info.e` holds the edge values of the
    // INTERNAL, positively-wound triangle, so when the caller's winding was
    // reversed e1 and e2 are transposed relative to the caller's edges;
    // `bary` is corrected for that, and is what you should use.
    var info = { e: [0, 0, 0], coverage: 1, mask: 1, area2: callerArea2, frontFacing: frontFacing };

    for (var y = minY; y <= maxY; y++) {
      for (var x = minX; x <= maxX; x++) {
        var mask = 0;
        var covered = 0;
        var centreInside = false;
        var e0c = 0, e1c = 0, e2c = 0;
        for (var s = 0; s < samples.length; s++) {
          var px = snap(x + samples[s][0]);
          var py = snap(y + samples[s][1]);
          var e0 = edge(x1, y1, x2, y2, px, py);
          var e1 = edge(x2, y2, x0, y0, px, py);
          var e2 = edge(x0, y0, x1, y1, px, py);
          var inside =
            (e0 > 0 || (e0 === 0 && (!fillRule || topLeft0))) &&
            (e1 > 0 || (e1 === 0 && (!fillRule || topLeft1))) &&
            (e2 > 0 || (e2 === 0 && (!fillRule || topLeft2)));
          if (inside) { mask |= 1 << s; covered++; }
          if (s === 0) { e0c = e0; e1c = e1; e2c = e2; centreInside = inside; }
        }
        if (!covered) continue;

        // Barycentrics are always taken at the pixel centre, even when
        // only an MSAA sub-sample is covered — that is the "centroid"
        // question hardware has to answer, and this is the simple answer.
        var l0 = e0c * invArea;
        var l1 = e1c * invArea;
        var l2 = e2c * invArea;
        if (swapped) { var t = l1; l1 = l2; l2 = t; }
        bary[0] = l0; bary[1] = l1; bary[2] = l2;
        info.e[0] = e0c; info.e[1] = e1c; info.e[2] = e2c;
        info.mask = mask;
        info.coverage = covered / samples.length;
        info.centreInside = centreInside;
        pixels++;
        callback(x, y, bary, info);
      }
    }
    return { area2: callerArea2, culled: false, pixels: pixels, frontFacing: frontFacing };
  }

  // Standard 4x rotated-grid MSAA sample positions, the pattern that
  // finally made near-horizontal edges look right.
  var MSAA4 = [[0.375, 0.125], [0.875, 0.375], [0.125, 0.625], [0.625, 0.875]];

  // ----------------------------------------------------------
  // Attribute interpolation
  // ------------------------------------------------------------
  // Screen-space barycentrics interpolate anything that is linear in
  // SCREEN space. Under perspective, a vertex attribute is not: what is
  // linear is attribute/w. So divide going in, interpolate, and multiply
  // by the interpolated 1/w coming out. Skipping this is the single
  // most recognisable graphics artefact of the 1990s.
  // ----------------------------------------------------------
  function interpolateAffine(bary, a0, a1, a2) {
    return bary[0] * a0 + bary[1] * a1 + bary[2] * a2;
  }

  function interpolatePerspective(bary, a0, a1, a2, invW0, invW1, invW2) {
    var invW = bary[0] * invW0 + bary[1] * invW1 + bary[2] * invW2;
    if (invW === 0) return 0;
    return (bary[0] * a0 * invW0 + bary[1] * a1 * invW1 + bary[2] * a2 * invW2) / invW;
  }

  // NDC depth IS linear in screen space (that is the point of putting z
  // through the same divide as x and y), so it interpolates affinely.
  function interpolateDepth(bary, z0, z1, z2) {
    return bary[0] * z0 + bary[1] * z1 + bary[2] * z2;
  }

  // ----------------------------------------------------------
  // Depth buffer arithmetic
  // ------------------------------------------------------------
  // How much depth resolution survives at a given distance. A fixed-point
  // buffer spends most of its codes just in front of the near plane,
  // because the projection stores something proportional to 1/z. Float
  // depth with a reversed range spends them evenly — which is why modern
  // engines map the FAR plane to zero.
  // ----------------------------------------------------------
  function ndcDepth(zView, near, far) {
    // zView is a positive distance in front of the eye.
    var zClip = -zView;
    var z = ((far + near) / (near - far)) * zClip + (2 * far * near) / (near - far);
    var w = zView;
    return z / w;
  }

  // Smallest world-space separation at distance z that still changes an
  // n-bit fixed-point depth code. Grows with the square of the distance.
  function depthResolution(zView, near, far, bits) {
    // (2^bits - 1) distinct steps, matching the standard mapping
    // round(depth * (2^n - 1)) that the depth instrument emulates.
    var codes = Math.pow(2, bits) - 1;
    return (2 * zView * zView * (far - near)) / (codes * 2 * far * near);
  }

  // ----------------------------------------------------------
  // Texture sampling
  // ----------------------------------------------------------
  function checkerTexture(size, colourA, colourB, squares) {
    var n = squares || 8;
    var data = new Float64Array(size * size * 3);
    var cell = size / n;
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var odd = ((Math.floor(x / cell) + Math.floor(y / cell)) & 1) === 1;
        var c = odd ? colourB : colourA;
        var i = (y * size + x) * 3;
        data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2];
      }
    }
    return { size: size, data: data };
  }

  function texelAt(level, x, y) {
    var s = level.size;
    var xi = ((x % s) + s) % s;
    var yi = ((y % s) + s) % s;
    var i = (yi * s + xi) * 3;
    return [level.data[i], level.data[i + 1], level.data[i + 2]];
  }

  function sampleNearest(level, u, v) {
    return texelAt(level, Math.floor(u * level.size), Math.floor(v * level.size));
  }

  function sampleBilinear(level, u, v) {
    var s = level.size;
    var x = u * s - 0.5;
    var y = v * s - 0.5;
    var x0 = Math.floor(x), y0 = Math.floor(y);
    var fx = x - x0, fy = y - y0;
    var c00 = texelAt(level, x0, y0);
    var c10 = texelAt(level, x0 + 1, y0);
    var c01 = texelAt(level, x0, y0 + 1);
    var c11 = texelAt(level, x0 + 1, y0 + 1);
    var top = mix(c00, c10, fx);
    var bottom = mix(c01, c11, fx);
    return mix(top, bottom, fy);
  }

  // Box-filtered pyramid — Lance Williams's "Pyramidal Parametrics", 1983.
  // Each level is half the size and so costs a quarter as much memory. The
  // series 1/4 + 1/16 + 1/64 + ... sums to (1 - 4^-n)/3, which is always
  // just UNDER a third extra and approaches a third from below as the chain
  // deepens. Bounded by a third whatever the texture: that is why mipmapping
  // was affordable long before it was fast.
  function buildMipChain(base) {
    var levels = [base];
    var current = base;
    while (current.size > 1) {
      var half = current.size >> 1;
      var data = new Float64Array(half * half * 3);
      for (var y = 0; y < half; y++) {
        for (var x = 0; x < half; x++) {
          for (var c = 0; c < 3; c++) {
            var i00 = ((y * 2) * current.size + x * 2) * 3 + c;
            var i10 = ((y * 2) * current.size + x * 2 + 1) * 3 + c;
            var i01 = ((y * 2 + 1) * current.size + x * 2) * 3 + c;
            var i11 = ((y * 2 + 1) * current.size + x * 2 + 1) * 3 + c;
            data[(y * half + x) * 3 + c] =
              (current.data[i00] + current.data[i10] + current.data[i01] + current.data[i11]) / 4;
          }
        }
      }
      current = { size: half, data: data };
      levels.push(current);
    }
    return levels;
  }

  // The level-of-detail formula every API specifies: take the longest
  // texel-space step a one-pixel step makes, and take its log base 2.
  function computeLod(dudx, dvdx, dudy, dvdy, textureSize) {
    var lx = Math.sqrt(dudx * dudx + dvdx * dvdx) * textureSize;
    var ly = Math.sqrt(dudy * dudy + dvdy * dvdy) * textureSize;
    var rho = Math.max(lx, ly);
    if (rho <= 0) return 0;
    return Math.log2(rho);
  }

  // Anisotropic filtering takes several samples along the LONG axis but
  // picks its level from the SHORT one, so a floor at a grazing angle
  // stays sharp instead of being blurred to the worst case.
  function computeAnisotropy(dudx, dvdx, dudy, dvdy, textureSize) {
    var lx = Math.sqrt(dudx * dudx + dvdx * dvdx) * textureSize;
    var ly = Math.sqrt(dudy * dudy + dvdy * dvdy) * textureSize;
    var major = Math.max(lx, ly);
    var minor = Math.min(lx, ly);
    return { major: major, minor: minor, ratio: minor > 0 ? major / minor : 1 };
  }

  function sampleTrilinear(levels, u, v, lod) {
    var maxLevel = levels.length - 1;
    var l = clamp(lod, 0, maxLevel);
    var l0 = Math.floor(l);
    var l1 = Math.min(l0 + 1, maxLevel);
    var f = l - l0;
    var a = sampleBilinear(levels[l0], u, v);
    if (l0 === l1 || f === 0) return a;
    return mix(a, sampleBilinear(levels[l1], u, v), f);
  }

  // ----------------------------------------------------------
  // Shading models, in the order the field discovered them
  // ----------------------------------------------------------
  function lambert(normal, lightDir) {
    return Math.max(0, dot(normal, lightDir));
  }

  // Phong, 1975: the specular lobe is the reflected light vector against
  // the view vector. All three arguments must be unit vectors.
  //
  // The n.l gate matters: without it a light BEHIND the surface still
  // produces a highlight, because the reflected vector can swing round to
  // meet the viewer even when no light reaches the surface at all.
  function phongSpecular(normal, lightDir, viewDir, shininess) {
    var nDotL = dot(normal, lightDir);
    if (nDotL <= 0) return 0;
    var r = sub(scale(normal, 2 * nDotL), lightDir);
    return Math.pow(Math.max(0, dot(r, viewDir)), shininess);
  }

  // Blinn, 1977: use the halfway vector instead. Cheaper, and it holds
  // together at grazing angles where Phong's lobe collapses.
  function blinnSpecular(normal, lightDir, viewDir, shininess) {
    if (dot(normal, lightDir) <= 0) return 0;
    var h = normalize(add(lightDir, viewDir));
    return Math.pow(Math.max(0, dot(normal, h)), shininess);
  }

  // GGX / Trowbridge–Reitz microfacet distribution — the long tail that
  // made rough metal finally look like metal.
  function distributionGGX(nDotH, roughness) {
    // A perfectly smooth surface is a delta function, which no float can
    // hold; clamp to the smallest roughness that still evaluates.
    var a = Math.max(1e-3, roughness) * Math.max(1e-3, roughness);
    var a2 = a * a;
    var d = nDotH * nDotH * (a2 - 1) + 1;
    return a2 / (Math.PI * d * d);
  }

  function geometrySmith(nDotV, nDotL, roughness) {
    var r = roughness + 1;
    var k = (r * r) / 8;
    var gv = nDotV / (nDotV * (1 - k) + k);
    var gl = nDotL / (nDotL * (1 - k) + k);
    return gv * gl;
  }

  function fresnelSchlick(cosTheta, f0) {
    var f = Math.pow(1 - clamp(cosTheta, 0, 1), 5);
    return [
      f0[0] + (1 - f0[0]) * f,
      f0[1] + (1 - f0[1]) * f,
      f0[2] + (1 - f0[2]) * f,
    ];
  }

  // A compact Cook-Torrance evaluation, metal/rough parameterised the way
  // every engine has done it since about 2013.
  function shadePbr(normal, viewDir, lightDir, albedo, metallic, roughness, lightColour) {
    var nDotL = Math.max(0, dot(normal, lightDir));
    if (nDotL <= 0) return [0, 0, 0];
    var nDotV = Math.max(1e-4, dot(normal, viewDir));
    var h = normalize(add(lightDir, viewDir));
    var nDotH = Math.max(0, dot(normal, h));
    var vDotH = Math.max(0, dot(viewDir, h));

    var r = Math.max(0.045, roughness);
    var f0 = mix([0.04, 0.04, 0.04], albedo, metallic);
    var f = fresnelSchlick(vDotH, f0);
    var ndf = distributionGGX(nDotH, r);
    var g = geometrySmith(nDotV, nDotL, r);

    var specScale = (ndf * g) / (4 * nDotV * nDotL + 1e-6);
    var out = [0, 0, 0];
    for (var i = 0; i < 3; i++) {
      var kd = (1 - f[i]) * (1 - metallic);
      var diffuse = (kd * albedo[i]) / Math.PI;
      var specular = specScale * f[i];
      out[i] = (diffuse + specular) * lightColour[i] * nDotL;
    }
    return out;
  }

  // ----------------------------------------------------------
  // Colour: the transfer function everyone got wrong for two decades
  // ----------------------------------------------------------
  function linearToSrgb(c) {
    var x = clamp(c, 0, 1);
    return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  }

  function srgbToLinear(c) {
    var x = clamp(c, 0, 1);
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  }

  function reinhard(c) { return c / (1 + c); }

  // ----------------------------------------------------------
  // Geometry generators
  // ----------------------------------------------------------
  function unitCube() {
    var p = [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
    ];
    var edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    // Wound so that a face pointing AT the camera comes out front-facing
    // under this file's convention (positive screen-space area, y down) —
    // the same way uvSphere is wound. Reverse any of these and that face
    // disappears under backface culling while its opposite number appears.
    var faces = [
      [0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1],
      [2, 6, 7, 3], [1, 5, 6, 2], [0, 3, 7, 4],
    ];
    return { positions: p, edges: edges, faces: faces };
  }

  // A latitude/longitude sphere. Coarse enough to show Gouraud failing,
  // fine enough to show it working.
  function uvSphere(stacks, slices) {
    var positions = [];
    var normals = [];
    var triangles = [];
    for (var i = 0; i <= stacks; i++) {
      var phi = (i / stacks) * Math.PI;
      for (var j = 0; j <= slices; j++) {
        var theta = (j / slices) * Math.PI * 2;
        var n = [
          Math.sin(phi) * Math.cos(theta),
          Math.cos(phi),
          Math.sin(phi) * Math.sin(theta),
        ];
        normals.push(n);
        positions.push(n.slice());
      }
    }
    var row = slices + 1;
    for (var s = 0; s < stacks; s++) {
      for (var t = 0; t < slices; t++) {
        var a = s * row + t;
        var b = a + row;
        if (s !== 0) triangles.push([a, b, a + 1]);
        if (s !== stacks - 1) triangles.push([a + 1, b, b + 1]);
      }
    }
    return { positions: positions, normals: normals, triangles: triangles };
  }

  function faceNormal(a, b, c) {
    return normalize(cross(sub(b, a), sub(c, a)));
  }

  global.TRI_GFX = {
    SUBPIXEL_BITS: SUBPIXEL_BITS,
    SUB: SUB,
    MSAA4: MSAA4,
    v3: v3, add: add, sub: sub, scale: scale, dot: dot, cross: cross,
    length: length, normalize: normalize, mix: mix, clamp: clamp,
    identity: identity, multiply: multiply, multiplyAll: multiplyAll,
    apply: apply, applyDirection: applyDirection,
    translation: translation, scaling: scaling,
    rotationX: rotationX, rotationY: rotationY, rotationZ: rotationZ,
    perspective: perspective, orthographic: orthographic, lookAt: lookAt,
    normalMatrix: normalMatrix,
    perspectiveDivide: perspectiveDivide, viewport: viewport,
    clipNear: clipNear, nearDistance: nearDistance,
    lerpVertex: lerpVertex, fanTriangles: fanTriangles,
    edge: edge, isTopLeft: isTopLeft, rasterTriangle: rasterTriangle,
    interpolateAffine: interpolateAffine,
    interpolatePerspective: interpolatePerspective,
    interpolateDepth: interpolateDepth,
    ndcDepth: ndcDepth, depthResolution: depthResolution,
    checkerTexture: checkerTexture, buildMipChain: buildMipChain,
    sampleNearest: sampleNearest, sampleBilinear: sampleBilinear,
    sampleTrilinear: sampleTrilinear,
    computeLod: computeLod, computeAnisotropy: computeAnisotropy,
    lambert: lambert, phongSpecular: phongSpecular, blinnSpecular: blinnSpecular,
    distributionGGX: distributionGGX, geometrySmith: geometrySmith,
    fresnelSchlick: fresnelSchlick, shadePbr: shadePbr,
    linearToSrgb: linearToSrgb, srgbToLinear: srgbToLinear, reinhard: reinhard,
    unitCube: unitCube, uvSphere: uvSphere, faceNormal: faceNormal,
  };
})(typeof window !== "undefined" ? window : globalThis);
