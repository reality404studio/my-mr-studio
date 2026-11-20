// Drop-in SVG -> 512x512 RGBA SDF texture + filled-area splat sampler + 11-stroke brush-order map for 鳥.
// Works with any black-ink calligraphy SVG placed at ./assets/glyph-bird.svg.
import {glyphStrokes} from './forms.js?v=6bc0e5d';

const INF = 1e20;

// Build a normalized 11-stroke calligraphy spine table in [0..1] canvas UV space
// aligned to the rasterized SVG's tight ink bounding box.
function buildStrokeSpine(inkBox) {
  // Measure canonical glyphStrokes bounds so they align cleanly to the real SVG ink box
  let minU = 1, maxU = 0, minV = 1, maxV = 0;
  for (const st of glyphStrokes) {
    for (const pt of st) {
      if (pt[0] < minU) minU = pt[0];
      if (pt[0] > maxU) maxU = pt[0];
      if (pt[1] < minV) minV = pt[1];
      if (pt[1] > maxV) maxV = pt[1];
    }
  }
  const spanU = Math.max(0.01, maxU - minU);
  const spanV = Math.max(0.01, maxV - minV);

  const rawPts = [];
  let totalLen = 0;
  glyphStrokes.forEach((st, strokeId) => {
    for (let k = 1; k < st.length; k++) {
      const a = st[k - 1], b = st[k];
      const ax = inkBox.x0 + ((a[0] - minU) / spanU) * inkBox.w;
      const ay = inkBox.y0 + ((a[1] - minV) / spanV) * inkBox.h;
      const bx = inkBox.x0 + ((b[0] - minU) / spanU) * inkBox.w;
      const by = inkBox.y0 + ((b[1] - minV) / spanV) * inkBox.h;
      const segLen = Math.hypot(bx - ax, by - ay);
      const steps = Math.max(3, Math.ceil(segLen * 32));
      const dx = (bx - ax) / (segLen || 1);
      const dy = -(by - ay) / (segLen || 1); // Y-up in 3D seal space
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        rawPts.push({
          x: ax + (bx - ax) * t,
          y: ay + (by - ay) * t,
          dx, dy,
          strokeId,
          dist: totalLen + segLen * t
        });
      }
      totalLen += segLen;
    }
    // Slight virtual pause between strokes so each stroke completes cleanly before next begins
    totalLen += 0.045;
  });

  const invTotal = 1 / Math.max(0.001, totalLen);
  for (const pt of rawPts) pt.order = Math.max(0, Math.min(1, pt.dist * invTotal));

  // Build 128-entry O(1) lookup table for live brush-tip emitter in Y-up [-0.5, 0.5] seal coords
  const tipTable = new Array(128);
  let idx = 0;
  for (let i = 0; i < 128; i++) {
    const p = i / 127;
    while (idx + 1 < rawPts.length && rawPts[idx + 1].order <= p) idx++;
    const cur = rawPts[idx];
    const nxt = rawPts[Math.min(rawPts.length - 1, idx + 1)];
    const span = Math.max(1e-5, nxt.order - cur.order);
    const f = cur.strokeId === nxt.strokeId ? Math.max(0, Math.min(1, (p - cur.order) / span)) : 0;
    const ux = cur.x + (nxt.x - cur.x) * f;
    const uy = cur.y + (nxt.y - cur.y) * f;
    tipTable[i] = {
      x: ux - 0.5,
      y: 0.5 - uy,
      dx: cur.dx,
      dy: cur.dy,
      strokeId: cur.strokeId
    };
  }
  return { spine: rawPts, tipTable };
}

function parseHexColor(str) {
  const s = str.trim().toLowerCase();
  if (s === 'white') return [255, 255, 255];
  if (s.startsWith('#')) {
    const h = s.slice(1);
    if (h.length === 3) {
      return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
    }
    if (h.length === 6) {
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
  }
  const m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  return null;
}

function isNearWhite(colorStr) {
  if (!colorStr) return false;
  const rgb = parseHexColor(colorStr);
  if (!rgb) return false;
  const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  return lum > 0.84;
}

function sanitizeSvg(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg') {
    throw new Error('Invalid SVG document');
  }
  // Strip near-white background tracer artifacts (e.g. #efeeee) while keeping black ink.
  const shapes = root.querySelectorAll('path, circle, ellipse, rect, polygon, polyline');
  for (const el of shapes) {
    const attrFill = el.getAttribute('fill');
    const styleAttr = el.getAttribute('style') || '';
    const styleFillMatch = styleAttr.match(/fill\s*:\s*([^;]+)/i);
    const fill = attrFill || (styleFillMatch ? styleFillMatch[1] : null);
    if (fill && isNearWhite(fill)) {
      el.remove();
    }
  }
  let vbW = 1000, vbH = 1000;
  const vb = root.getAttribute('viewBox');
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      vbW = parts[2];
      vbH = parts[3];
    }
  } else {
    const w = parseFloat(root.getAttribute('width') || '1000');
    const h = parseFloat(root.getAttribute('height') || '1000');
    if (w > 0 && h > 0) {
      vbW = w;
      vbH = h;
      root.setAttribute('viewBox', `0 0 ${w} ${h}`);
    }
  }
  const maxDim = Math.max(vbW, vbH);
  const scale = 1024 / maxDim;
  root.setAttribute('width', String(Math.round(vbW * scale)));
  root.setAttribute('height', String(Math.round(vbH * scale)));
  const serializer = new XMLSerializer();
  return { xml: serializer.serializeToString(root), aspect: vbW / vbH };
}

function loadSvgImage(xml) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (err) => { URL.revokeObjectURL(url); reject(err); };
    img.src = url;
  });
}

// Linear-time 1D squared Euclidean distance transform (Felzenszwalb & Huttenlocher).
function edt1d(f, n, v, z, out) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const d = q - v[k];
    out[q] = d * d + f[v[k]];
  }
}

function edt2d(grid, size) {
  const f = new Float32Array(size);
  const out = new Float32Array(size);
  const v = new Int32Array(size);
  const z = new Float32Array(size + 1);
  // Columns
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) f[y] = grid[y * size + x];
    edt1d(f, size, v, z, out);
    for (let y = 0; y < size; y++) grid[y * size + x] = out[y];
  }
  // Rows
  for (let y = 0; y < size; y++) {
    const row = y * size;
    for (let x = 0; x < size; x++) f[x] = grid[row + x];
    edt1d(f, size, v, z, out);
    for (let x = 0; x < size; x++) grid[row + x] = Math.sqrt(out[x]);
  }
}

function buildSdfAndPack(alpha, size, spread, inkBox) {
  const n = size * size;
  const outDist = new Float32Array(n);
  const inDist = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = alpha[i];
    if (a >= 0.5) {
      outDist[i] = 0;
      inDist[i] = INF;
    } else {
      outDist[i] = INF;
      inDist[i] = 0;
    }
  }
  edt2d(outDist, size);
  edt2d(inDist, size);

  const { spine, tipTable } = buildStrokeSpine(inkBox);
  // Downsample spine to ~128 fast query knots for crisp nearest-stroke progression baking
  const knotCount = Math.min(128, spine.length);
  const kx = new Float32Array(knotCount);
  const ky = new Float32Array(knotCount);
  const ko = new Float32Array(knotCount);
  for (let k = 0; k < knotCount; k++) {
    const s = spine[Math.floor((k / Math.max(1, knotCount - 1)) * (spine.length - 1))];
    kx[k] = s.x; ky[k] = s.y; ko[k] = s.order;
  }

  const sdf = new Float32Array(n);
  const orderMap = new Float32Array(n);
  const rgba = new Uint8Array(n * 4);
  const inv2Spread = 1 / (2 * spread);

  for (let y = 0; y < size; y++) {
    const ny = y / (size - 1);
    const dy = ny - 0.5;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const nx = x / (size - 1);
      const dx = nx - 0.5;
      const a = alpha[i];
      // Signed distance: positive inside ink, negative outside.
      let sd = inDist[i] - outDist[i];
      if (a > 0 && a < 1) sd += (a - 0.5);
      sdf[i] = sd;

      const sdfNorm = Math.max(0, Math.min(1, 0.5 + sd * inv2Spread));
      // True 11-stroke calligraphic brush order for ink + SDF halo band; fast fallback far outside
      let order;
      if (sd > -spread * 1.1) {
        let bestD2 = 1e9, bestO = 0;
        for (let k = 0; k < knotCount; k++) {
          const ex = nx - kx[k], ey = ny - ky[k];
          const d2 = ex * ex + ey * ey;
          if (d2 < bestD2) { bestD2 = d2; bestO = ko[k]; }
        }
        order = Math.max(0, Math.min(1, bestO * 0.86 + ny * 0.14));
      } else {
        order = Math.max(0, Math.min(1, ny * 0.80 + nx * 0.24 - 0.04));
      }
      orderMap[i] = order;
      const radial = Math.max(0, Math.min(1, Math.hypot(dx, dy) * 2.0));

      const j = i * 4;
      rgba[j] = Math.round(sdfNorm * 255);
      rgba[j + 1] = Math.round(a * 255);
      rgba[j + 2] = Math.round(order * 255);
      rgba[j + 3] = Math.round(radial * 255);
    }
  }
  return { sdf, orderMap, rgba, tipTable };
}

function sampleFromMask(alpha, sdf, orderMap, size, count, rng) {
  const candidates = [];
  // Stride 2 for fast candidate gathering while preserving all fine ink splatters.
  for (let y = 2; y < size - 2; y += 2) {
    for (let x = 2; x < size - 2; x += 2) {
      const i = y * size + x;
      if (alpha[i] > 0.32) {
        candidates.push(i);
      }
    }
  }
  if (!candidates.length) return null;

  const samples = new Array(count);
  const invSize = 1 / (size - 1);
  for (let k = 0; k < count; k++) {
    const idx = candidates[Math.floor(rng() * candidates.length)];
    const px = idx % size;
    const py = (idx - px) / size;
    // Sub-pixel jitter within the 2x2 cell so particles don't grid-align.
    const jx = (px + (rng() - 0.5) * 1.8) * invSize;
    const jy = (py + (rng() - 0.5) * 1.8) * invSize;

    // Sobel-like gradient on SDF -> tangent is perpendicular to edge normal.
    const gx = sdf[idx + 1] - sdf[idx - 1];
    const gy = sdf[idx + size] - sdf[idx - size];
    const gl = Math.hypot(gx, gy);
    let dx = 1, dy = 0;
    if (gl > 0.05) {
      // Tangent along stroke contour in Y-up seal coordinates
      dx = gy / gl;
      dy = gx / gl;
    } else {
      const a = rng() * Math.PI * 2;
      dx = Math.cos(a);
      dy = Math.sin(a);
    }
    const order = orderMap[idx];
    const dry = sdf[idx] < 2.8;
    samples[k] = {
      // Normalized to [-0.5, 0.5] matching the 3D seal quad coordinates (Y-up).
      x: jx - 0.5,
      y: 0.5 - jy,
      dx,
      dy,
      order,
      strokeId: Math.min(10, Math.floor(order * 11)),
      dry
    };
  }
  return samples;
}

export function createDefaultTipLookup() {
  const { tipTable } = buildStrokeSpine({ x0: 0.24, y0: 0.14, w: 0.52, h: 0.72 });
  return (progress) => {
    const idx = Math.max(0, Math.min(tipTable.length - 1, Math.round(progress * (tipTable.length - 1))));
    return tipTable[idx];
  };
}

export async function loadGlyphSdf(url, { size = 512, margin = 0.14, spread = 28 } = {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load glyph SVG (${res.status})`);
  const rawText = await res.text();
  const { xml } = sanitizeSvg(rawText);
  const img = await loadSvgImage(xml);

  // Pass 1: rasterize at full size to measure tight ink bounding box.
  const scratch = document.createElement('canvas');
  scratch.width = size;
  scratch.height = size;
  const sctx = scratch.getContext('2d', { willReadFrequently: true });
  sctx.clearRect(0, 0, size, size);
  const imgW = img.naturalWidth || size;
  const imgH = img.naturalHeight || size;
  const fit1 = Math.min(size / imgW, size / imgH);
  const dw1 = imgW * fit1, dh1 = imgH * fit1;
  sctx.drawImage(img, (size - dw1) * 0.5, (size - dh1) * 0.5, dw1, dh1);

  const raw = sctx.getImageData(0, 0, size, size).data;
  let minX = size, minY = size, maxX = -1, maxY = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const j = (y * size + x) * 4;
      const a = raw[j + 3];
      if (a > 24) {
        const lum = (raw[j] * 0.2126 + raw[j + 1] * 0.7152 + raw[j + 2] * 0.0722) / 255;
        if (lum < 0.85) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }

  // Pass 2: center-fit tight ink bounds into final canvas with clean SDF glow margin.
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = size;
  finalCanvas.height = size;
  const fctx = finalCanvas.getContext('2d', { willReadFrequently: true });
  fctx.clearRect(0, 0, size, size);

  let inkBox = { x0: margin, y0: margin, w: 1 - margin * 2, h: 1 - margin * 2 };
  if (maxX > minX && maxY > minY) {
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const targetSpan = size * (1 - margin * 2);
    const scale = Math.min(targetSpan / bw, targetSpan / bh);
    const outW = bw * scale;
    const outH = bh * scale;
    const ox = (size - outW) * 0.5;
    const oy = (size - outH) * 0.5;
    fctx.drawImage(scratch, minX, minY, bw, bh, ox, oy, outW, outH);
    inkBox = { x0: ox / size, y0: oy / size, w: outW / size, h: outH / size };
  } else {
    fctx.drawImage(scratch, 0, 0);
  }

  const finalData = fctx.getImageData(0, 0, size, size).data;
  const alpha = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const j = i * 4;
    const a = finalData[j + 3] / 255;
    const lum = (finalData[j] * 0.2126 + finalData[j + 1] * 0.7152 + finalData[j + 2] * 0.0722) / 255;
    // Ink opacity: dark opaque strokes -> 1.0, white/transparent -> 0.0
    alpha[i] = a * Math.max(0, Math.min(1, (0.90 - lum) / 0.55));
  }

  const { sdf, orderMap, rgba, tipTable } = buildSdfAndPack(alpha, size, spread, inkBox);
  return {
    size,
    rgba,
    canvas: finalCanvas,
    tipAt(progress) {
      const idx = Math.max(0, Math.min(tipTable.length - 1, Math.round(progress * (tipTable.length - 1))));
      return tipTable[idx];
    },
    sample(count, rng) {
      return sampleFromMask(alpha, sdf, orderMap, size, count, rng);
    }
  };
}
