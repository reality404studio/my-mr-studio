// High-resolution 2048x256 ribbon text & masking-tape atlas generator.
// Loads PearSans (assets/PearSans-SemiBold.ttf drop-in -> Mac local PearSans -> Korean sans fallback)
// and packs:
//   R = crisp PearSans text glyph alpha
//   G = soft luminous halo + delicate connecting shimmer thread across letters
//   B = translucent masking-tape washi fiber texture
//   A = ribbon silhouette mask (with subtle organic torn ends)

export const BOOKMARK_TEXT = '사람들이 자신의 영혼을 되찾는 또 다른 순간은 서로 사랑할 때입니다. p49.';
export const RIBBON_LENGTH_M = 0.30; // 30cm
export const RIBBON_HEIGHT_M = 0.03; // 3cm

const FONT_CANDIDATES = [
  './assets/PearSans-SemiBold.ttf',
  './assets/PearSans.woff2',
  './assets/PearSans.ttf',
  './assets/PearSans.otf',
];

const FALLBACK_STACK = "'PearSans', 'Pear Sans', 'PearSans-SemiBold', 'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";

export async function loadPearSansFont() {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') {
    return { family: 'PearSans', source: 'headless' };
  }

  for (const url of FONT_CANDIDATES) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (!res.ok) continue;
      const face = new FontFace('PearSans', `url(${url})`, { weight: '600', style: 'normal' });
      const loaded = await face.load();
      document.fonts.add(loaded);
      await document.fonts.ready;
      return { family: 'PearSans', source: url };
    } catch {
      // Try next candidate
    }
  }

  // Fallback to Mac-installed local PearSans or system Korean sans-serif
  let hasLocalPear = false;
  try {
    await document.fonts.load(`600 64px ${FALLBACK_STACK}`, BOOKMARK_TEXT);
    const probe = document.createElement('canvas').getContext('2d');
    if (probe) {
      const sample = '사람들이 영혼 p49.';
      probe.font = '600 64px sans-serif';
      const baseW = probe.measureText(sample).width;
      probe.font = "600 64px 'PearSans', 'Pear Sans', sans-serif";
      const pearW = probe.measureText(sample).width;
      hasLocalPear = Math.abs(pearW - baseW) > 0.5;
    }
  } catch {
    // Ignore
  }
  return {
    family: hasLocalPear ? 'PearSans' : 'Fallback',
    source: hasLocalPear ? 'local-system' : 'system-fallback',
  };
}

export async function loadCustomFontFile(file) {
  const buf = await file.arrayBuffer();
  const face = new FontFace('PearSans', buf, { weight: '600', style: 'normal' });
  const loaded = await face.load();
  document.fonts.add(loaded);
  await document.fonts.ready;
  return { family: 'PearSans', source: file.name };
}

function drawSpacedText(ctx, text, centerX, centerY, trackingPx) {
  const chars = Array.from(text);
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const totalWidth =
    widths.reduce((acc, w) => acc + w, 0) + trackingPx * Math.max(0, chars.length - 1);
  let x = centerX - totalWidth * 0.5;
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], x, centerY);
    x += widths[i] + trackingPx;
  }
  return totalWidth;
}

function measureSpacedText(ctx, text, trackingPx) {
  const chars = Array.from(text);
  let total = 0;
  for (let i = 0; i < chars.length; i++) {
    total += ctx.measureText(chars[i]).width;
    if (i > 0) total += trackingPx;
  }
  return total;
}

// Render packed 2048x256 RGBA ImageData/Canvas for WebGL2 upload.
export function buildTextAtlasCanvas(text = BOOKMARK_TEXT, width = 2048, height = 256) {
  const glyphCanvas = document.createElement('canvas');
  glyphCanvas.width = width;
  glyphCanvas.height = height;
  const gCtx = glyphCanvas.getContext('2d', { willReadFrequently: true });

  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = width;
  haloCanvas.height = height;
  const hCtx = haloCanvas.getContext('2d', { willReadFrequently: true });

  // Fit 45-character sentence across ~91% of 30cm ribbon width with generous legible weight & tracking.
  const targetWidth = width * 0.91;
  let fontSize = 54;
  let tracking = 3.2;

  gCtx.textBaseline = 'middle';
  gCtx.textAlign = 'left';
  for (let iter = 0; iter < 8; iter++) {
    gCtx.font = `600 ${fontSize.toFixed(1)}px ${FALLBACK_STACK}`;
    const measured = measureSpacedText(gCtx, text, tracking);
    if (measured > 10) {
      const ratio = targetWidth / measured;
      fontSize = Math.max(30, Math.min(76, fontSize * (0.45 + 0.55 * ratio)));
      tracking = fontSize * 0.058;
    }
  }

  const fontSpec = `600 ${fontSize.toFixed(1)}px ${FALLBACK_STACK}`;
  const cy = height * 0.515;

  // 1. Crisp foreground PearSans glyphs (with subtle 0.8px stroke so strokes stay strong in 3D MR)
  gCtx.clearRect(0, 0, width, height);
  gCtx.font = fontSpec;
  gCtx.fillStyle = '#ffffff';
  gCtx.strokeStyle = 'rgba(255,255,255,0.45)';
  gCtx.lineWidth = 1.2;
  gCtx.lineJoin = 'round';
  const drawnW = drawSpacedText(gCtx, text, width * 0.5, cy, tracking);

  // 2. Soft glow + delicate luminous thread connecting letters horizontally
  hCtx.clearRect(0, 0, width, height);
  hCtx.font = fontSpec;
  hCtx.textBaseline = 'middle';
  hCtx.textAlign = 'left';
  hCtx.save();
  hCtx.filter = 'blur(8px)';
  hCtx.fillStyle = 'rgba(255,255,255,0.92)';
  drawSpacedText(hCtx, text, width * 0.5, cy, tracking);
  hCtx.restore();

  // Connecting luminous water-silk thread behind the baseline/midline so letters stay visually chained
  const x0 = width * 0.5 - drawnW * 0.5 - 24;
  const x1 = width * 0.5 + drawnW * 0.5 + 24;
  const threadGrad = hCtx.createLinearGradient(x0, cy, x1, cy);
  threadGrad.addColorStop(0.0, 'rgba(255,255,255,0.0)');
  threadGrad.addColorStop(0.03, 'rgba(255,255,255,0.46)');
  threadGrad.addColorStop(0.5, 'rgba(255,255,255,0.52)');
  threadGrad.addColorStop(0.97, 'rgba(255,255,255,0.46)');
  threadGrad.addColorStop(1.0, 'rgba(255,255,255,0.0)');
  hCtx.save();
  hCtx.filter = 'blur(5px)';
  hCtx.fillStyle = threadGrad;
  hCtx.fillRect(x0, cy - 7, x1 - x0, 14);
  hCtx.restore();

  // Pack channels into final RGBA output canvas
  const gData = gCtx.getImageData(0, 0, width, height).data;
  const hData = hCtx.getImageData(0, 0, width, height).data;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = height;
  const oCtx = outCanvas.getContext('2d');
  const outImg = oCtx.createImageData(width, height);
  const out = outImg.data;

  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    const vDist = Math.abs(v - 0.5) * 2.0; // 0 center, 1 top/bottom edge
    // Subtle translucent masking-tape vertical fiber & edge softening
    const fiberRow = 0.5 + 0.5 * Math.sin(y * 0.55 + Math.sin(y * 0.13) * 2.4);
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const u = x / (width - 1);

      // Organic hand-torn masking tape left & right ends
      const tearL = 0.008 + 0.005 * Math.sin(v * 31.0) + 0.003 * Math.cos(v * 73.0);
      const tearR = 0.008 + 0.005 * Math.cos(v * 29.0) + 0.003 * Math.sin(v * 67.0);
      const endMaskL = Math.max(0, Math.min(1, (u - tearL) / 0.006));
      const endMaskR = Math.max(0, Math.min(1, (1.0 - tearR - u) / 0.006));
      const edgeY = Math.max(0, Math.min(1, (1.0 - vDist) / 0.055));
      const tapeSil = endMaskL * endMaskR * edgeY;

      const grain = 0.5 + 0.5 * Math.sin(x * 0.17 + y * 0.09) * Math.cos(x * 0.053 - y * 0.21);
      const washi = 0.62 + 0.22 * fiberRow + 0.16 * grain;

      out[idx] = gData[idx + 3]; // R: crisp text alpha
      out[idx + 1] = hData[idx + 3]; // G: luminous halo + connecting thread
      out[idx + 2] = Math.round(Math.max(0, Math.min(255, washi * 255))); // B: washi fiber
      out[idx + 3] = Math.round(Math.max(0, Math.min(255, tapeSil * 255))); // A: tape silhouette
    }
  }

  oCtx.putImageData(outImg, 0, 0);
  return { canvas: outCanvas, fontSize, drawnWidth: drawnW };
}
