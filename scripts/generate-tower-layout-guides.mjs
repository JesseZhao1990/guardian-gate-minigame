import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(ROOT, 'scripts', 'tower-layout-guide-candidates.json');
const OUTPUT_DIR = process.env.TOWER_GUIDE_OUTPUT_DIR
  ? resolve(ROOT, process.env.TOWER_GUIDE_OUTPUT_DIR)
  : join(ROOT, 'docs', 'design', 'tower-layout-guides');
const ART_BRIEF_DIR = join(OUTPUT_DIR, 'art-briefs');
const BACKGROUND_ROOT = process.env.TOWER_GUIDE_BACKGROUND_ROOT
  ? resolve(ROOT, process.env.TOWER_GUIDE_BACKGROUND_ROOT)
  : join(ROOT, 'assets');
const TEMP_BUNDLE = join(ROOT, '.tmp', 'tower-layout-guide-runtime.cjs');
const FFMPEG = process.env.FFMPEG_PATH || '/Users/bytedance/.local/bin/ffmpeg';
const FONT_FILE = existsSync('/System/Library/Fonts/Supplemental/Arial Unicode.ttf')
  ? '/System/Library/Fonts/Supplemental/Arial Unicode.ttf'
  : '/System/Library/Fonts/STHeiti Medium.ttc';

const IMAGE_WIDTH = 3_200;
const IMAGE_HEIGHT = 1_440;
const PIXEL_COUNT = IMAGE_WIDTH * IMAGE_HEIGHT;
const IMAGE_BUFFER_BYTES = PIXEL_COUNT * 4;
const WORLD_RECT = { x: -640, y: -60, width: IMAGE_WIDTH, height: IMAGE_HEIGHT };
const HUD_VISUAL_BUFFER_PX = 128;

const COLORS = {
  routeBlocked: [255, 78, 72],
  routeA: [255, 218, 82],
  routeB: [255, 103, 211],
  routeC: [92, 229, 255],
  breach: [255, 42, 105],
  terrace: [41, 221, 255],
  legal: [96, 255, 176],
  hud: [142, 92, 246],
  codeDeadZone: [125, 132, 150],
  hudBuffer: [255, 191, 64],
  viewport: [245, 247, 255],
  fullFrame: [66, 173, 255],
  buildZone: [132, 255, 170],
  movedFrom: [188, 198, 216],
  arrowTarget: [255, 165, 72],
  anchorValid: [238, 248, 255],
  anchorInvalid: [255, 89, 89],
  dark: [4, 10, 22],
};

const HUD_RECTS = [
  { id: 'TOP', label: '顶部 HUD', rect: [320, 0, 2880, 163], kind: 'hard' },
  { id: 'LEFT_SHORTCUT', label: '战功快捷栏', rect: [360, 757, 816, 1189], kind: 'hard' },
  { id: 'BOTTOM_LEFT', label: '底部左 HUD', rect: [320, 1224, 1120, 1440], kind: 'hard' },
  { id: 'BOTTOM_RIGHT', label: '底部右 HUD', rect: [2333, 1224, 2880, 1440], kind: 'hard' },
  { id: 'PREPARATION', label: '准备栏', rect: [1267, 1075, 1933, 1216], kind: 'hard' },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: options.encoding ?? null,
    input: options.input,
    maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString('utf8')
      : String(result.stderr ?? '');
    throw new Error(`${command} failed (${String(result.status)}): ${stderr}`);
  }
  return result;
}

function loadRuntimeContracts() {
  mkdirSync(dirname(TEMP_BUNDLE), { recursive: true });
  buildSync({
    stdin: {
      contents: [
        "export { STAGE_BUNDLES } from './src/core/content';",
        "export { DESIGN_WIDTH, DESIGN_HEIGHT } from './src/core/contracts';",
        "export {",
        '  BATTLE_BACKGROUND_WORLD_RECT,',
        '  BATTLE_BOTTOM_HUD_TOP,',
        '  BATTLE_BOTTOM_HUD_LEFT_RIGHT,',
        '  BATTLE_BOTTOM_HUD_RIGHT_LEFT,',
        '  BATTLE_WORLD_SCALE,',
        '  BATTLE_WORLD_PIVOT,',
        "} from './src/render/CanvasRenderer';",
        "export {",
        '  TOWER_PLACEMENT_GRID_PX,',
        '  TOWER_ROUTE_CLEARANCE_PX,',
        '  TOWER_BREACH_CLEARANCE_PX,',
        '  TOWER_SPACING_PX,',
        '  TOWER_BUILD_ZONE_INSET_PX,',
        "} from './src/core/tower-placement';",
      ].join('\n'),
      resolveDir: ROOT,
      sourcefile: 'tower-layout-guide-runtime.ts',
      loader: 'ts',
    },
    outfile: TEMP_BUNDLE,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: ['node20'],
    logLevel: 'silent',
  });
  const require = createRequire(import.meta.url);
  delete require.cache[TEMP_BUNDLE];
  return require(TEMP_BUNDLE);
}

function worldToAsset(point) {
  return { x: point.x - WORLD_RECT.x, y: point.y - WORLD_RECT.y };
}

function assetToDesign(point) {
  return { x: point.x * 0.75 - 240, y: point.y * 0.75 };
}

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) return distance(point, start);
  const ratio = Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
  ));
  return Math.hypot(
    point.x - (start.x + dx * ratio),
    point.y - (start.y + dy * ratio),
  );
}

function distanceToPolyline(point, points) {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    minimum = Math.min(minimum, distanceToSegment(point, points[index - 1], points[index]));
  }
  return minimum;
}

function pointInRect(point, rect) {
  return point.x >= rect[0] && point.x <= rect[2] && point.y >= rect[1] && point.y <= rect[3];
}

function isHardHudAssetPoint(point) {
  return HUD_RECTS.some(({ rect }) => pointInRect(point, rect));
}

function isBuildZoneCenter(point, rules) {
  const inset = rules.buildZoneInsetPx;
  return point.x >= inset &&
    point.x <= rules.battlefieldWidthPx - inset &&
    point.y >= inset &&
    point.y <= rules.battlefieldHeightPx - inset;
}

function expandRect(rect, amount) {
  return [
    Math.max(0, rect[0] - amount),
    Math.max(0, rect[1] - amount),
    Math.min(IMAGE_WIDTH, rect[2] + amount),
    Math.min(IMAGE_HEIGHT, rect[3] + amount),
  ];
}

function ellipseRectIntersects(center, radius, rect) {
  const closestX = Math.max(rect[0], Math.min(center.x, rect[2]));
  const closestY = Math.max(rect[1], Math.min(center.y, rect[3]));
  const dx = (center.x - closestX) / radius.x;
  const dy = (center.y - closestY) / radius.y;
  return dx * dx + dy * dy <= 1;
}

function blendPixel(buffer, x, y, color, alpha) {
  if (x < 0 || x >= IMAGE_WIDTH || y < 0 || y >= IMAGE_HEIGHT || alpha <= 0) return;
  const offset = (y * IMAGE_WIDTH + x) * 4;
  const inverse = 255 - alpha;
  buffer[offset] = Math.round((color[0] * alpha + buffer[offset] * inverse) / 255);
  buffer[offset + 1] = Math.round((color[1] * alpha + buffer[offset + 1] * inverse) / 255);
  buffer[offset + 2] = Math.round((color[2] * alpha + buffer[offset + 2] * inverse) / 255);
  buffer[offset + 3] = 255;
}

function fillRect(buffer, rect, color, alpha) {
  const x0 = Math.max(0, Math.floor(rect[0]));
  const y0 = Math.max(0, Math.floor(rect[1]));
  const x1 = Math.min(IMAGE_WIDTH, Math.ceil(rect[2]));
  const y1 = Math.min(IMAGE_HEIGHT, Math.ceil(rect[3]));
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) blendPixel(buffer, x, y, color, alpha);
  }
}

function fillDiamond(buffer, center, radius, color, alpha) {
  for (let dy = -radius; dy <= radius; dy += 1) {
    const span = radius - Math.abs(dy);
    for (let dx = -span; dx <= span; dx += 1) {
      blendPixel(buffer, Math.round(center.x + dx), Math.round(center.y + dy), color, alpha);
    }
  }
}

function fillRotatedEllipse(buffer, center, radius, color, alpha) {
  const x0 = Math.max(0, Math.floor(center.x - radius.x));
  const x1 = Math.min(IMAGE_WIDTH - 1, Math.ceil(center.x + radius.x));
  const y0 = Math.max(0, Math.floor(center.y - radius.y));
  const y1 = Math.min(IMAGE_HEIGHT - 1, Math.ceil(center.y + radius.y));
  for (let y = y0; y <= y1; y += 1) {
    const ny = (y - center.y) / radius.y;
    for (let x = x0; x <= x1; x += 1) {
      const nx = (x - center.x) / radius.x;
      if (nx * nx + ny * ny <= 1) blendPixel(buffer, x, y, color, alpha);
    }
  }
}

function rasterizeCircleMask(mask, center, radius, alpha = 255) {
  const x0 = Math.max(0, Math.floor(center.x - radius));
  const x1 = Math.min(IMAGE_WIDTH - 1, Math.ceil(center.x + radius));
  const y0 = Math.max(0, Math.floor(center.y - radius));
  const y1 = Math.min(IMAGE_HEIGHT - 1, Math.ceil(center.y + radius));
  const radiusSquared = radius * radius;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - center.x;
      const dy = y - center.y;
      if (dx * dx + dy * dy <= radiusSquared) {
        const index = y * IMAGE_WIDTH + x;
        if (mask[index] < alpha) mask[index] = alpha;
      }
    }
  }
}

function rasterizeSegmentMask(mask, start, end, radius, alpha = 255) {
  const x0 = Math.max(0, Math.floor(Math.min(start.x, end.x) - radius));
  const x1 = Math.min(IMAGE_WIDTH - 1, Math.ceil(Math.max(start.x, end.x) + radius));
  const y0 = Math.max(0, Math.floor(Math.min(start.y, end.y) - radius));
  const y1 = Math.min(IMAGE_HEIGHT - 1, Math.ceil(Math.max(start.y, end.y) + radius));
  const radiusSquared = radius * radius;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const ratio = lengthSquared <= 0
        ? 0
        : Math.max(0, Math.min(1, ((x - start.x) * dx + (y - start.y) * dy) / lengthSquared));
      const nearestX = start.x + dx * ratio;
      const nearestY = start.y + dy * ratio;
      const offsetX = x - nearestX;
      const offsetY = y - nearestY;
      if (offsetX * offsetX + offsetY * offsetY <= radiusSquared) {
        const index = y * IMAGE_WIDTH + x;
        if (mask[index] < alpha) mask[index] = alpha;
      }
    }
  }
}

function rasterizePolylineMask(mask, points, radius, alpha = 255) {
  for (let index = 1; index < points.length; index += 1) {
    rasterizeSegmentMask(mask, points[index - 1], points[index], radius, alpha);
  }
  for (const point of points) rasterizeCircleMask(mask, point, radius, alpha);
}

function blendMask(buffer, mask, color, maximumAlpha) {
  for (let index = 0; index < mask.length; index += 1) {
    const maskAlpha = mask[index];
    if (maskAlpha === 0) continue;
    const alpha = Math.round((maskAlpha * maximumAlpha) / 255);
    const offset = index * 4;
    const inverse = 255 - alpha;
    buffer[offset] = Math.round((color[0] * alpha + buffer[offset] * inverse) / 255);
    buffer[offset + 1] = Math.round((color[1] * alpha + buffer[offset + 1] * inverse) / 255);
    buffer[offset + 2] = Math.round((color[2] * alpha + buffer[offset + 2] * inverse) / 255);
    buffer[offset + 3] = 255;
  }
}

function strokePolyline(buffer, points, width, color, alpha = 255) {
  const mask = new Uint8Array(PIXEL_COUNT);
  rasterizePolylineMask(mask, points, width / 2, 255);
  blendMask(buffer, mask, color, alpha);
}

function strokeSegment(buffer, start, end, width, color, alpha = 255) {
  const radius = width / 2;
  const x0 = Math.max(0, Math.floor(Math.min(start.x, end.x) - radius));
  const x1 = Math.min(IMAGE_WIDTH - 1, Math.ceil(Math.max(start.x, end.x) + radius));
  const y0 = Math.max(0, Math.floor(Math.min(start.y, end.y) - radius));
  const y1 = Math.min(IMAGE_HEIGHT - 1, Math.ceil(Math.max(start.y, end.y) + radius));
  const radiusSquared = radius * radius;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const ratio = lengthSquared <= 0
        ? 0
        : Math.max(0, Math.min(1, ((x - start.x) * dx + (y - start.y) * dy) / lengthSquared));
      const nearestX = start.x + dx * ratio;
      const nearestY = start.y + dy * ratio;
      const offsetX = x - nearestX;
      const offsetY = y - nearestY;
      if (offsetX * offsetX + offsetY * offsetY <= radiusSquared) {
        blendPixel(buffer, x, y, color, alpha);
      }
    }
  }
}

function strokeEllipse(buffer, center, radius, width, color, alpha = 255, dashed = false) {
  const points = [];
  const count = 180;
  for (let index = 0; index <= count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    points.push({
      x: center.x + Math.cos(angle) * radius.x,
      y: center.y + Math.sin(angle) * radius.y,
    });
  }
  for (let index = 1; index < points.length; index += 1) {
    if (!dashed || Math.floor(index / 5) % 2 === 0) {
      strokeSegment(buffer, points[index - 1], points[index], width, color, alpha);
    }
  }
}

function strokeDashedRect(buffer, rect, width, color, alpha = 255, dash = 26, gap = 18) {
  const edges = [
    [{ x: rect[0], y: rect[1] }, { x: rect[2], y: rect[1] }],
    [{ x: rect[2], y: rect[1] }, { x: rect[2], y: rect[3] }],
    [{ x: rect[2], y: rect[3] }, { x: rect[0], y: rect[3] }],
    [{ x: rect[0], y: rect[3] }, { x: rect[0], y: rect[1] }],
  ];
  for (const [start, end] of edges) {
    const length = distance(start, end);
    const dx = (end.x - start.x) / length;
    const dy = (end.y - start.y) / length;
    for (let cursor = 0; cursor < length; cursor += dash + gap) {
      const finish = Math.min(length, cursor + dash);
      strokeSegment(buffer,
        { x: start.x + dx * cursor, y: start.y + dy * cursor },
        { x: start.x + dx * finish, y: start.y + dy * finish },
        width, color, alpha);
    }
  }
}

function hatchRect(buffer, rect, color, alpha) {
  const x0 = Math.max(0, Math.floor(rect[0]));
  const x1 = Math.min(IMAGE_WIDTH, Math.ceil(rect[2]));
  const y0 = Math.max(0, Math.floor(rect[1]));
  const y1 = Math.min(IMAGE_HEIGHT, Math.ceil(rect[3]));
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if ((x + y) % 34 < 5) blendPixel(buffer, x, y, color, alpha);
    }
  }
}

function ellipseSamples(center, radius, count = 96) {
  const points = [{ ...center }];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    points.push({
      x: center.x + Math.cos(angle) * radius.x,
      y: center.y + Math.sin(angle) * radius.y,
    });
  }
  return points;
}

function escapeDrawText(value) {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll(':', '\\:')
    .replaceAll("'", "\\'")
    .replaceAll('%', '\\%');
}

function drawTextFilter(label) {
  const x = label.centered ? `${Math.round(label.x)}-text_w/2` : String(Math.round(label.x));
  const y = label.middle ? `${Math.round(label.y)}-text_h/2` : String(Math.round(label.y));
  const box = label.box === false
    ? 'box=0'
    : `box=1:boxcolor=${label.boxColor ?? 'black@0.62'}:boxborderw=${label.boxBorder ?? 8}`;
  return [
    `drawtext=fontfile='${escapeDrawText(FONT_FILE)}'`,
    `text='${escapeDrawText(label.text)}'`,
    `x=${x}`,
    `y=${y}`,
    `fontsize=${label.size ?? 24}`,
    `fontcolor=${label.color ?? 'white'}`,
    box,
  ].join(':');
}

function decodeBackground(path) {
  const result = run(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-i', path,
    '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1',
  ], { maxBuffer: IMAGE_BUFFER_BYTES + 8 * 1024 * 1024 });
  assert(Buffer.isBuffer(result.stdout), `No decoded bytes for ${path}`);
  assert(result.stdout.length === IMAGE_BUFFER_BYTES,
    `${path} decoded to ${result.stdout.length} bytes instead of ${IMAGE_BUFFER_BYTES}.`);
  return Buffer.from(result.stdout);
}

function encodePng(buffer, labels, outputPath) {
  const filters = labels.map(drawTextFilter).join(',');
  run(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${IMAGE_WIDTH}x${IMAGE_HEIGHT}`, '-i', 'pipe:0',
    ...(filters ? ['-vf', filters] : []),
    '-frames:v', '1', '-compression_level', '5', outputPath,
  ], { input: buffer, maxBuffer: 16 * 1024 * 1024 });
}

function encodeJpeg(buffer, labels, outputPath) {
  const filters = labels.map(drawTextFilter).join(',');
  run(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${IMAGE_WIDTH}x${IMAGE_HEIGHT}`, '-i', 'pipe:0',
    ...(filters ? ['-vf', filters] : []),
    '-frames:v', '1', '-q:v', '2', '-pix_fmt', 'yuvj420p', outputPath,
  ], { input: buffer, maxBuffer: 16 * 1024 * 1024 });
}

function backgroundPath(stageId) {
  const ordinal = stageId.slice(-2);
  return join(BACKGROUND_ROOT, `stage-${ordinal}`, 'background', `${stageId}_BACKGROUND.jpg`);
}

function imageSha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function drawLegend(buffer) {
  fillRect(buffer, [12, 12, 308, 614], COLORS.dark, 205);
  fillRotatedEllipse(buffer, { x: 42, y: 214 }, { x: 22, y: 14 }, COLORS.terrace, 120);
  strokeEllipse(buffer, { x: 42, y: 214 }, { x: 22, y: 14 }, 4, COLORS.terrace, 255);
  fillRotatedEllipse(buffer, { x: 42, y: 256 }, { x: 15, y: 15 }, COLORS.legal, 120);
  strokePolyline(buffer, [{ x: 20, y: 298 }, { x: 65, y: 298 }], 18, COLORS.routeBlocked, 100);
  strokePolyline(buffer, [{ x: 20, y: 298 }, { x: 65, y: 298 }], 5, COLORS.routeA, 255);
  fillRotatedEllipse(buffer, { x: 42, y: 340 }, { x: 20, y: 20 }, COLORS.breach, 100);
  fillRect(buffer, [20, 374, 64, 400], COLORS.hud, 120);
  hatchRect(buffer, [20, 374, 64, 400], COLORS.dark, 160);
  strokeDashedRect(buffer, [19, 416, 65, 442], 3, COLORS.hudBuffer, 255, 10, 7);
  fillDiamond(buffer, { x: 42, y: 478 }, 14, COLORS.anchorValid, 255);
  strokeDashedRect(buffer, [20, 512, 64, 542], 3, COLORS.viewport, 255, 10, 7);
  strokeDashedRect(buffer, [20, 554, 64, 580], 3, COLORS.buildZone, 255, 10, 7);
}

function drawHud(buffer, stageId, labels) {
  for (const item of HUD_RECTS) {
    const codeOnly = stageId === 'STAGE_08' && item.id === 'LEFT_SHORTCUT';
    const color = codeOnly ? COLORS.codeDeadZone : COLORS.hud;
    fillRect(buffer, item.rect, color, codeOnly ? 62 : 76);
    hatchRect(buffer, item.rect, COLORS.dark, codeOnly ? 100 : 125);
    strokeDashedRect(buffer, item.rect, 4, color, 230, 28, 16);
    strokeDashedRect(buffer, expandRect(item.rect, HUD_VISUAL_BUFFER_PX), 3, COLORS.hudBuffer, 185, 24, 18);
    const labelX = Math.max(330, Math.min(item.rect[0] + 12, 2660));
    const labelY = Math.max(14, Math.min(item.rect[1] + 12, 1390));
    labels.push({
      text: codeOnly ? '代码保守死区 · 当前无可见 HUD' : item.label,
      x: labelX,
      y: labelY,
      size: 22,
      color: codeOnly ? '#d2d6df' : '#eee8ff',
      boxColor: 'black@0.58',
      boxBorder: 6,
    });
  }
}

function drawViewportFrames(buffer) {
  strokeDashedRect(buffer, [320, 0, 2880, 1439], 5, COLORS.viewport, 230, 28, 18);
  strokeDashedRect(buffer, [1, 1, 3198, 1438], 5, COLORS.fullFrame, 230, 1000, 0);
}

function drawBuildZone(buffer, rules, labels) {
  const rect = [
    rules.buildZoneInsetPx - WORLD_RECT.x,
    rules.buildZoneInsetPx - WORLD_RECT.y,
    rules.battlefieldWidthPx - rules.buildZoneInsetPx - WORLD_RECT.x,
    rules.battlefieldHeightPx - rules.buildZoneInsetPx - WORLD_RECT.y,
  ];
  strokeDashedRect(buffer, rect, 4, COLORS.buildZone, 220, 30, 18);
  labels.push({
    text: `当前塔心建造边界 · 内缩 ${rules.buildZoneInsetPx}`,
    x: rect[0] + 12,
    y: rect[1] + 10,
    size: 20,
    color: '#aaffc4',
    boxColor: 'black@0.58',
    boxBorder: 6,
  });
}

function drawRoutes(buffer, routes, routeClearance, labels) {
  const blockedMask = new Uint8Array(PIXEL_COUNT);
  for (const route of routes) {
    const points = route.points.map(worldToAsset);
    rasterizePolylineMask(blockedMask, points, routeClearance, 255);
  }
  blendMask(buffer, blockedMask, COLORS.routeBlocked, 66);

  const routeColors = [COLORS.routeA, COLORS.routeB, COLORS.routeC];
  routes.forEach((route, routeIndex) => {
    const points = route.points.map(worldToAsset);
    strokePolyline(buffer, points, routeIndex === 0 ? 12 : 8, routeColors[routeIndex] ?? COLORS.routeA, 255);
    for (const point of points) fillRotatedEllipse(buffer, point, { x: 12, y: 12 }, routeColors[routeIndex] ?? COLORS.routeA, 255);
    if (routes.length > 1) {
      const labelPoint = points[Math.min(2 + routeIndex, points.length - 1)];
      labels.push({
        text: `路线 ${String.fromCharCode(65 + routeIndex)}`,
        x: labelPoint.x + 20,
        y: Math.max(175, labelPoint.y - 42),
        size: 22,
        color: ['#ffda52', '#ff67d3', '#5ce5ff'][routeIndex] ?? '#ffda52',
        boxColor: 'black@0.62',
        boxBorder: 6,
      });
    }
  });
}

function drawBreaches(buffer, routes, breachClearance, labels) {
  const mask = new Uint8Array(PIXEL_COUNT);
  const unique = [];
  for (const route of routes) {
    const breach = worldToAsset(route.breachPoint);
    if (!unique.some((point) => distance(point, breach) < 2)) unique.push(breach);
    rasterizeCircleMask(mask, breach, breachClearance, 255);
  }
  blendMask(buffer, mask, COLORS.breach, 58);
  for (const breach of unique) {
    strokeEllipse(buffer, breach, { x: breachClearance, y: breachClearance }, 6, COLORS.breach, 240, true);
    fillDiamond(buffer, breach, 22, COLORS.breach, 255);
  }
  const labelPoint = unique[0];
  labels.push({
    text: '关印禁建 240',
    x: Math.max(340, Math.min(2580, labelPoint.x - 110)),
    y: Math.max(180, Math.min(1365, labelPoint.y - 46)),
    size: 24,
    color: '#ff8aad',
    boxColor: 'black@0.66',
    boxBorder: 7,
  });
}

function drawCandidates(buffer, stageConfig, labels) {
  const outer = stageConfig.outerRadius;
  const inner = stageConfig.innerRadius;
  for (const candidate of stageConfig.candidates) {
    const center = worldToAsset(candidate);
    fillRotatedEllipse(buffer, center, outer, COLORS.terrace, 58);
    strokeEllipse(buffer, center, outer, 9, COLORS.terrace, 255, true);
    fillRotatedEllipse(buffer, center, inner, COLORS.legal, 68);
    strokeEllipse(buffer, center, inner, 6, COLORS.legal, 255);
    fillRotatedEllipse(buffer, center, { x: 32, y: 32 }, COLORS.dark, 215);
    strokeEllipse(buffer, center, { x: 32, y: 32 }, 4, COLORS.terrace, 255);
    labels.push({
      text: candidate.adjustment ? `${candidate.id}*` : candidate.id,
      x: center.x,
      y: center.y,
      size: 23,
      color: 'white',
      box: false,
      centered: true,
      middle: true,
    });
  }
}

function drawAdjustmentProof(buffer, stageConfig, labels) {
  const adjusted = stageConfig.candidates.filter((candidate) => candidate.adjustment);
  if (adjusted.length === 0) return;
  labels.push({
    text: '标注校准证明 · 灰 FROM → 橙 RAW → 绿 T* 合法截停',
    x: 1600,
    y: 112,
    size: 27,
    color: 'white',
    boxColor: 'black@0.74',
    boxBorder: 9,
    centered: true,
  });
  for (const candidate of adjusted) {
    const from = worldToAsset(candidate.adjustment.from);
    const raw = worldToAsset(candidate.adjustment.arrowTarget);
    const resolved = worldToAsset(candidate);
    strokeSegment(buffer, from, raw, 5, COLORS.arrowTarget, 195);
    strokeSegment(buffer, raw, resolved, 5, COLORS.legal, 225);
    strokeEllipse(buffer, from, stageConfig.outerRadius, 6, COLORS.movedFrom, 220, true);
    fillDiamond(buffer, raw, 17, COLORS.dark, 220);
    fillDiamond(buffer, raw, 12, COLORS.arrowTarget, 255);
    labels.push({
      text: `${candidate.id} FROM`,
      x: Math.max(330, Math.min(2820, from.x + 18)),
      y: Math.max(175, Math.min(1370, from.y - 54)),
      size: 18,
      color: '#d5dce8',
      boxColor: 'black@0.62',
      boxBorder: 5,
    });
    labels.push({
      text: `${candidate.id} RAW ±${candidate.adjustment.targetTolerancePx ?? 24}`,
      x: Math.max(330, Math.min(2800, raw.x + 18)),
      y: Math.max(175, Math.min(1370, raw.y + 18)),
      size: 18,
      color: '#ffcb8f',
      boxColor: 'black@0.66',
      boxBorder: 5,
    });
  }
}

function currentAnchorStatus(anchor, routes, breachPoints, rules) {
  const onGrid = Number.isInteger(anchor.x / rules.gridPx) && Number.isInteger(anchor.y / rules.gridPx);
  const routeDistance = Math.min(...routes.map((route) => distanceToPolyline(anchor, route.points)));
  const breachDistance = Math.min(...breachPoints.map((point) => distance(anchor, point)));
  const hardHud = isHardHudAssetPoint(worldToAsset(anchor));
  const buildZone = isBuildZoneCenter(anchor, rules);
  return {
    onGrid,
    routeDistance,
    breachDistance,
    hardHud,
    buildZone,
    valid: onGrid && buildZone && routeDistance >= rules.routeClearancePx &&
      breachDistance >= rules.breachClearancePx && !hardHud,
  };
}

function drawCurrentAnchors(buffer, bundle, routes, rules, labels) {
  const breachPoints = routes.map((route) => route.breachPoint);
  return bundle.route.towerAnchors.map((anchor, index) => {
    const status = currentAnchorStatus(
      anchor,
      routes,
      breachPoints,
      rules,
    );
    const asset = worldToAsset(anchor);
    const color = status.valid ? COLORS.anchorValid : COLORS.anchorInvalid;
    fillDiamond(buffer, asset, 17, COLORS.dark, 230);
    fillDiamond(buffer, asset, 12, color, 255);
    labels.push({
      text: `A${index + 1}`,
      x: asset.x + 20,
      y: asset.y - 34,
      size: 19,
      color: status.valid ? '#eef8ff' : '#ff7777',
      boxColor: 'black@0.65',
      boxBorder: 5,
    });
    return { index: index + 1, point: anchor, ...status };
  });
}

function validateCandidates(stageId, stageConfig, routes, rules) {
  const breachPoints = routes.map((route) => route.breachPoint);
  const results = [];
  for (const candidate of stageConfig.candidates) {
    assert(candidate.x % rules.gridPx === 0 && candidate.y % rules.gridPx === 0,
      `${stageId} ${candidate.id} must sit on the ${rules.gridPx}px grid.`);
    const center = { x: candidate.x, y: candidate.y };
    assert(isBuildZoneCenter(center, rules),
      `${stageId} ${candidate.id} center sits outside the current build zone.`);
    const centerRouteDistance = Math.min(...routes.map((route) => distanceToPolyline(center, route.points)));
    const centerBreachDistance = Math.min(...breachPoints.map((breach) => distance(center, breach)));
    // Keep the guide contract identical to the runtime placement contract:
    // route/breach clearances are measured from the snapped tower center. The
    // former inner-ellipse check silently added the art radius a second time,
    // so a runtime-legal platform could be rejected only by this generator.
    assert(centerRouteDistance >= rules.routeClearancePx,
      `${stageId} ${candidate.id} center enters the ${rules.routeClearancePx}px route clearance (${centerRouteDistance.toFixed(1)}).`);
    assert(centerBreachDistance >= rules.breachClearancePx,
      `${stageId} ${candidate.id} center enters the ${rules.breachClearancePx}px breach clearance (${centerBreachDistance.toFixed(1)}).`);
    const boundary = ellipseSamples(center, stageConfig.innerRadius);
    for (const point of boundary) {
      assert(!isHardHudAssetPoint(worldToAsset(point)),
        `${stageId} ${candidate.id} inner area enters a hard HUD block.`);
    }
    const assetCenter = worldToAsset(center);
    const visualBufferConflicts = HUD_RECTS
      .filter(({ rect }) => ellipseRectIntersects(assetCenter, stageConfig.outerRadius, expandRect(rect, HUD_VISUAL_BUFFER_PX)))
      .map(({ id }) => id);
    let adjustment = null;
    if (candidate.adjustment) {
      const arrowTarget = candidate.adjustment.arrowTarget;
      const targetSamples = ellipseSamples(arrowTarget, stageConfig.innerRadius);
      const targetMinimumRouteDistance = Math.min(...targetSamples.flatMap((point) =>
        routes.map((route) => distanceToPolyline(point, route.points))));
      const targetMinimumBreachDistance = Math.min(...targetSamples.flatMap((point) =>
        breachPoints.map((breach) => distance(point, breach))));
      const targetCenterRouteDistance = Math.min(...routes.map((route) =>
        distanceToPolyline(arrowTarget, route.points)));
      const targetCenterBreachDistance = Math.min(...breachPoints.map((breach) =>
        distance(arrowTarget, breach)));
      const targetAssetCenter = worldToAsset(arrowTarget);
      const targetOuterHardHudConflicts = HUD_RECTS
        .filter(({ rect }) => ellipseRectIntersects(targetAssetCenter, stageConfig.outerRadius, rect))
        .map(({ id }) => id);
      const targetVisualBufferConflicts = HUD_RECTS
        .filter(({ rect }) => ellipseRectIntersects(
          targetAssetCenter,
          stageConfig.outerRadius,
          expandRect(rect, HUD_VISUAL_BUFFER_PX),
        ))
        .map(({ id }) => id);
      const targetOnGrid = arrowTarget.x % rules.gridPx === 0 && arrowTarget.y % rules.gridPx === 0;
      const targetBuildZoneCenter = isBuildZoneCenter(arrowTarget, rules);
      const targetInnerHardHudClear = targetSamples.every((point) =>
        !isHardHudAssetPoint(worldToAsset(point)));
      const clampReasons = [];
      if (!targetOnGrid) clampReasons.push('grid');
      if (!targetBuildZoneCenter) clampReasons.push('build-zone');
      if (targetMinimumRouteDistance < rules.routeClearancePx) clampReasons.push('route-core');
      if (targetMinimumBreachDistance < rules.breachClearancePx) clampReasons.push('breach-core');
      if (!targetInnerHardHudClear) clampReasons.push('inner-hard-hud');
      if (targetOuterHardHudConflicts.length > 0) clampReasons.push('outer-hard-hud');
      adjustment = {
        ...candidate.adjustment,
        targetTolerancePx: candidate.adjustment.targetTolerancePx ?? 24,
        resolved: center,
        resolvedDistanceFromArrowTargetPx: Math.round(distance(center, arrowTarget) * 10) / 10,
        clampReasons,
        arrowTargetValidation: {
          onGrid: targetOnGrid,
          buildZoneCenter: targetBuildZoneCenter,
          centerRouteDistancePx: Math.round(targetCenterRouteDistance * 10) / 10,
          minimumInnerRouteDistancePx: Math.round(targetMinimumRouteDistance * 10) / 10,
          centerBreachDistancePx: Math.round(targetCenterBreachDistance * 10) / 10,
          minimumInnerBreachDistancePx: Math.round(targetMinimumBreachDistance * 10) / 10,
          innerHardHudClear: targetInnerHardHudClear,
          outerHardHudConflicts: targetOuterHardHudConflicts,
          visualBufferConflicts: targetVisualBufferConflicts,
        },
      };
    }
    results.push({
      id: candidate.id,
      world: center,
      asset: assetCenter,
      art: candidate.art,
      risk: candidate.risk,
      adjustment,
      buildZoneCenterValid: true,
      centerRouteDistancePx: Math.round(centerRouteDistance * 10) / 10,
      minimumInnerRouteDistancePx: Math.round((centerRouteDistance - Math.max(stageConfig.innerRadius.x, stageConfig.innerRadius.y)) * 10) / 10,
      centerBreachDistancePx: Math.round(centerBreachDistance * 10) / 10,
      minimumInnerBreachDistancePx: Math.round((centerBreachDistance - Math.max(stageConfig.innerRadius.x, stageConfig.innerRadius.y)) * 10) / 10,
      visualBufferConflicts,
    });
  }
  for (let leftIndex = 0; leftIndex < stageConfig.candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < stageConfig.candidates.length; rightIndex += 1) {
      const left = stageConfig.candidates[leftIndex];
      const right = stageConfig.candidates[rightIndex];
      assert(distance(left, right) >= rules.towerSpacingPx,
        `${stageId} ${left.id}/${right.id} centers are closer than ${rules.towerSpacingPx}px.`);
    }
  }
  assert(stageConfig.candidates.length >= stageConfig.maximumActiveTowers,
    `${stageId} needs at least ${stageConfig.maximumActiveTowers} candidate terraces.`);
  return results;
}

function stageLabels(stageId, stageConfig, bundle, backgroundSha, routes, assetVersion) {
  const adjustedCount = stageConfig.candidates.filter((candidate) => candidate.adjustment).length;
  const labels = [
    { text: stageConfig.name, x: 28, y: 32, size: 32, color: 'white', box: false },
    { text: stageId, x: 28, y: 78, size: 22, color: '#7fe7ff', box: false },
    { text: `内部辅助图 ${assetVersion.split('-').at(-1)}`, x: 28, y: 114, size: 20, color: '#d7deea', box: false },
    { text: '候选台地外轮廓', x: 78, y: 198, size: 20, color: 'white', box: false },
    { text: '塔体道路安全核心', x: 78, y: 240, size: 20, color: 'white', box: false },
    { text: '道路中心线 / 禁建带', x: 78, y: 282, size: 20, color: 'white', box: false },
    { text: '关印禁建区', x: 78, y: 324, size: 20, color: 'white', box: false },
    { text: 'HUD 硬遮挡', x: 78, y: 366, size: 20, color: 'white', box: false },
    { text: 'HUD 视觉缓冲', x: 78, y: 408, size: 20, color: 'white', box: false },
    { text: '当前初始塔点', x: 78, y: 450, size: 20, color: 'white', box: false },
    { text: '16:9 可见边界', x: 78, y: 492, size: 20, color: 'white', box: false },
    { text: '塔心建造边界', x: 78, y: 534, size: 20, color: 'white', box: false },
    { text: 'AUXILIARY ONLY', x: 28, y: 586, size: 19, color: '#ffce70', box: false },
    { text: `候选 ${stageConfig.candidates.length} / 最多上阵 ${stageConfig.maximumActiveTowers}`, x: 2910, y: 42, size: 20, color: 'white', box: false },
    { text: `路线 ${routes.length}`, x: 2910, y: 80, size: 20, color: '#ffda52', box: false },
    { text: `背景 ${backgroundSha.slice(0, 10)}`, x: 2910, y: 118, size: 17, color: '#cad3e3', box: false },
    { text: '红带 170', x: 2910, y: 180, size: 19, color: '#ff8a84', box: false },
    { text: '关印 240', x: 2910, y: 216, size: 19, color: '#ff8aad', box: false },
    { text: '吸附 32', x: 2910, y: 252, size: 19, color: '#8fffc5', box: false },
    { text: `标注调整 ${adjustedCount}`, x: 2910, y: 286, size: 18, color: '#7fe7ff', box: false },
    { text: '建造边界 96', x: 2910, y: 320, size: 18, color: '#aaffc4', box: false },
    { text: '世界→图片', x: 2910, y: 366, size: 18, color: '#cad3e3', box: false },
    { text: 'x + 640', x: 2910, y: 398, size: 18, color: 'white', box: false },
    { text: 'y + 60', x: 2910, y: 430, size: 18, color: 'white', box: false },
    { text: '青色为改图草案', x: 2910, y: 486, size: 18, color: '#7fe7ff', box: false },
    { text: '不是运行时合法区', x: 2910, y: 518, size: 18, color: '#ffce70', box: false },
  ];
  if (stageId === 'STAGE_08') {
    labels.push({ text: '三塔开局 → 六塔上限', x: 2910, y: 560, size: 18, color: '#8fffc5', box: false });
  }
  return labels;
}

function cleanGeneratedOutputs() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(ART_BRIEF_DIR, { recursive: true });
  for (const name of readdirSync(OUTPUT_DIR)) {
    if (
      /^stage-\d{2}-tower-layout-guide\.png$/.test(name) ||
      name === 'all-stage-tower-layout-guides.jpg' ||
      name === 'tower-layout-adjustment-proof.jpg' ||
      name === 'manifest.json' ||
      name === 'README.md'
    ) {
      unlinkSync(join(OUTPUT_DIR, name));
    }
  }
  for (const name of readdirSync(ART_BRIEF_DIR)) {
    if (/^stage-\d{2}-platform-art-brief\.jpg$/.test(name)) {
      unlinkSync(join(ART_BRIEF_DIR, name));
    }
  }
}

function createContactSheet(stageFiles) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  for (const file of stageFiles) args.push('-i', file);
  const filters = stageFiles.map((_, index) => `[${index}:v]scale=1280:576[s${index}]`);
  filters.push('[s0][s1]hstack=inputs=2[r0]');
  filters.push('[s2][s3]hstack=inputs=2[r1]');
  filters.push('[s4][s5]hstack=inputs=2[r2]');
  filters.push('[s6][s7]hstack=inputs=2[r3]');
  filters.push('[r0][r1][r2][r3]vstack=inputs=4[out]');
  args.push('-filter_complex', filters.join(';'), '-map', '[out]', '-frames:v', '1', '-q:v', '2',
    join(OUTPUT_DIR, 'all-stage-tower-layout-guides.jpg'));
  run(FFMPEG, args, { maxBuffer: 32 * 1024 * 1024 });
}

function createAdjustmentProofSheet(proofFiles) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  for (const file of proofFiles) args.push('-i', file);
  const filters = proofFiles.map((_, index) => `[${index}:v]scale=1280:576[p${index}]`);
  filters.push('[p0][p1]hstack=inputs=2[r0]');
  filters.push('[p2][p3]hstack=inputs=2[r1]');
  filters.push('[p4][p5]hstack=inputs=2[r2]');
  filters.push('[r0][r1][r2]vstack=inputs=3[out]');
  args.push('-filter_complex', filters.join(';'), '-map', '[out]', '-frames:v', '1', '-q:v', '2',
    join(OUTPUT_DIR, 'tower-layout-adjustment-proof.jpg'));
  run(FFMPEG, args, { maxBuffer: 32 * 1024 * 1024 });
}

function createReadme(config, stageManifests) {
  const hasLiveEvidence = existsSync(join(OUTPUT_DIR, 'wechat-live-tower-audit.jpg')) &&
    existsSync(join(OUTPUT_DIR, 'wechat-stage01-route-live.png'));
  const hasFinalFixEvidence = existsSync(join(OUTPUT_DIR, 'wechat-final-fix-proof.jpg')) &&
    existsSync(join(OUTPUT_DIR, 'wechat-final-stage01-prep.png')) &&
    existsSync(join(OUTPUT_DIR, 'wechat-final-stage05-all-towers.png'));
  const lines = [
    '# 八关塔位内部辅助图',
    '',
    '> 仅用于地图重绘、坐标对齐与微信端验收，不是运行时资源。青色台地是已采用的平台位置，正式背景中已烘焙对应的实体台地、台阶或承重结构。',
    '',
    '## 图例',
    '',
    '- 黄色中心线：当前怪物路线；第八关同时显示 A/B/C 三条路线。',
    `- 红色半透明带：道路中心线两侧 ${config.common.routeClearancePx}px 禁建带。`,
    `- 洋红虚线圈：关印周围 ${config.common.breachClearancePx}px 禁建区。`,
    '- 青色虚线椭圆：需要在背景中重绘为真实承重结构的候选台地外轮廓。',
    '- 绿色内圈：塔体相对道路、关印和 HUD 的安全核心；当前运行时建造边界只约束塔心。',
    '- 塔位编号后的 `*`：本轮按用户红色箭头调整过；原坐标和箭头目标记录在 manifest。',
    '- 紫色斜线：当前代码使用的 HUD 硬遮挡。黄色外框是 128px 塔资产视觉缓冲。',
    '- A1…：当前初始塔点；红色表示按现有网格、道路、关印、塔心建造边界或 HUD 规则不合法。',
    '- 左右白色虚线：16:9 可见边界；外侧仅在更宽屏幕中出现。',
    `- 浅绿色虚线框：当前默认塔心建造边界，战场四周内缩 ${config.common.buildZoneInsetPx}px。`,
    '',
    '## 输出',
    '',
    ...stageManifests.map((stage) => stage.stageId === 'STAGE_08'
      ? `- [${stage.stageId} · ${stage.name}](./${stage.file})：背景预留 ${stage.candidates.length} 个实体台地；当前运行时仍上阵 3 塔，后续扩塔方案目标最多 ${stage.maximumActiveTowers} 塔。`
      : `- [${stage.stageId} · ${stage.name}](./${stage.file})：${stage.candidates.length} 个实体台地，最多上阵 ${stage.maximumActiveTowers} 塔。`,
    ),
    '- [八关总览](./all-stage-tower-layout-guides.jpg)',
    '- [用户标注调整证明总览](./tower-layout-adjustment-proof.jpg)',
    ...(hasLiveEvidence ? [
      '- [微信开发者工具逐关实测总览](./wechat-live-tower-audit.jpg)',
      '- [第一关怪物沿道路行进实测](./wechat-stage01-route-live.png)',
    ] : []),
    ...(hasFinalFixEvidence ? [
      '- [最终 UI 与第五关塔位修复证明](./wechat-final-fix-proof.jpg)',
      '- [最终第一关备战态](./wechat-final-stage01-prep.png)',
      '- [最终第五关全塔态](./wechat-final-stage05-all-towers.png)',
    ] : []),
    '- [机器可读坐标与校验结果](./manifest.json)',
    ...(hasLiveEvidence ? [
      '',
      '## 微信开发者工具实测',
      '',
      '- 设备画布：844×390，pixelRatio 3；安全区 750×369。',
      '- 共导出 16 张实际 Canvas 截图，运行错误为 `null`。总览依次展示第 1～7 关全部 4 个正式塔锚点、第 8 关战斗态，以及第 1 关怪物路线。',
      ...(hasFinalFixEvidence ? [
        '- 针对战策标题叠字与第五关顶部塔体遮挡另补抓 2 张最终截图；总览已替换为修复后版本。',
      ] : []),
      '- 第 1～7 关的“全部塔”截图只在验收时临时显示 4 个已配置锚点，用来确认塔体与背景平台一一对齐；该逻辑不进入正式包。',
      '- 第 1 关战斗截图确认怪物从右上城门出现并沿道路前进，不再表现为从天而降。',
      '- 实测发现的备战关印残字、战策标题叠字与第五关顶部塔体遮挡均已纳入修复和回归。',
    ] : []),
    '',
    '## 重要说明',
    '',
    '- 背景图中只应烘焙中性的实体台地、台阶、支架和锚点，不应烘焙绿红状态、锁定文字或塔编号。',
    '- 第八关左侧灰色区域是当前代码仍会阻挡、但实际没有可见战功快捷栏的保守死区；开放无尽布阵时应同步修正判断。',
    `- 平台坐标已按当前路线、关印、塔心建造边界和 HUD 硬遮挡校验${hasLiveEvidence ? '，并已在微信开发者工具逐关复核' : ''}。`,
    '',
    '## 重新生成',
    '',
    '```bash',
    'node scripts/generate-tower-layout-guides.mjs',
    '```',
    '',
    '可在不覆盖正式辅助图的情况下，对候选背景重新叠加同一套几何契约：',
    '',
    '```bash',
    'TOWER_GUIDE_BACKGROUND_ROOT=docs/design/tower-platform-backgrounds/staged-assets \\',
    'TOWER_GUIDE_OUTPUT_DIR=docs/design/tower-platform-backgrounds/qa-overlays \\',
    'node scripts/generate-tower-layout-guides.mjs',
    '```',
    '',
    `生成版本：${config.generatedAssetVersion}`,
  ];
  writeFileSync(join(OUTPUT_DIR, 'README.md'), `${lines.join('\n')}\n`);
}

function main() {
  assert(existsSync(FFMPEG), `ffmpeg not found at ${FFMPEG}`);
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  assert(config.schemaVersion === 1, 'Unsupported tower guide candidate schema.');
  const runtime = loadRuntimeContracts();
  assert(JSON.stringify(runtime.BATTLE_BACKGROUND_WORLD_RECT) === JSON.stringify(WORLD_RECT),
    'Renderer background world rect changed; update the guide generator before rendering.');
  assert(runtime.DESIGN_WIDTH === 1920 && runtime.DESIGN_HEIGHT === 1080,
    'Guide generator expects the 1920x1080 battle design space.');
  assert(runtime.TOWER_ROUTE_CLEARANCE_PX === config.common.routeClearancePx,
    'Route clearance config does not match runtime.');
  assert(runtime.TOWER_BREACH_CLEARANCE_PX === config.common.breachClearancePx,
    'Breach clearance config does not match runtime.');
  assert(runtime.TOWER_PLACEMENT_GRID_PX === config.common.gridPx,
    'Placement grid config does not match runtime.');
  assert(runtime.TOWER_SPACING_PX === config.common.towerSpacingPx,
    'Tower spacing config does not match runtime.');
  assert(runtime.TOWER_BUILD_ZONE_INSET_PX === config.common.buildZoneInsetPx,
    'Build-zone inset config does not match runtime.');

  cleanGeneratedOutputs();
  const stageFiles = [];
  const proofFiles = [];
  const stageManifests = [];
  for (const stageId of Object.keys(config.stages).sort()) {
    const stageConfig = config.stages[stageId];
    const bundle = runtime.STAGE_BUNDLES[stageId];
    assert(bundle, `Missing runtime bundle for ${stageId}`);
    const routes = bundle.endless?.routes ?? [bundle.route];
    const background = backgroundPath(stageId);
    assert(existsSync(background), `Missing ${background}`);
    const backgroundSha = imageSha256(background);
    const candidateResults = validateCandidates(stageId, stageConfig, routes, config.common);

    const buffer = decodeBackground(background);
    const artBriefBuffer = Buffer.from(buffer);
    const artBriefLabels = [
      {
        text: `${stageConfig.name} · 塔台美术落位参考`,
        x: 40,
        y: 36,
        size: 32,
        color: 'white',
        boxColor: 'black@0.78',
        boxBorder: 10,
      },
      {
        text: '红带=道路禁建 · 青圈=需要绘制实体平台 · 最终图不得保留任何彩色标记',
        x: 40,
        y: 92,
        size: 23,
        color: '#fff1bb',
        boxColor: 'black@0.74',
        boxBorder: 8,
      },
    ];
    drawRoutes(artBriefBuffer, routes, config.common.routeClearancePx, artBriefLabels);
    drawCandidates(artBriefBuffer, stageConfig, artBriefLabels);
    const ordinal = stageId.slice(-2);
    const artBriefOutput = join(ART_BRIEF_DIR, `stage-${ordinal}-platform-art-brief.jpg`);
    encodeJpeg(artBriefBuffer, artBriefLabels, artBriefOutput);

    fillRect(buffer, [0, 0, IMAGE_WIDTH, IMAGE_HEIGHT], COLORS.dark, 26);
    drawViewportFrames(buffer);
    drawLegend(buffer);
    const labels = stageLabels(
      stageId,
      stageConfig,
      bundle,
      backgroundSha,
      routes,
      config.generatedAssetVersion,
    );
    drawBuildZone(buffer, config.common, labels);
    drawRoutes(buffer, routes, config.common.routeClearancePx, labels);
    drawBreaches(buffer, routes, config.common.breachClearancePx, labels);
    drawHud(buffer, stageId, labels);
    drawCandidates(buffer, stageConfig, labels);
    const anchors = drawCurrentAnchors(buffer, bundle, routes, config.common, labels);

    const file = `stage-${ordinal}-tower-layout-guide.png`;
    const output = join(OUTPUT_DIR, file);
    encodePng(buffer, labels, output);
    if (stageConfig.candidates.some((candidate) => candidate.adjustment)) {
      const proofBuffer = Buffer.from(buffer);
      const proofLabels = labels.map((label) => ({ ...label }));
      drawAdjustmentProof(proofBuffer, stageConfig, proofLabels);
      const proofFile = join(ROOT, '.tmp', `${stageId.toLowerCase()}-tower-layout-proof.png`);
      encodePng(proofBuffer, proofLabels, proofFile);
      proofFiles.push(proofFile);
    }
    stageFiles.push(output);
    stageManifests.push({
      stageId,
      name: stageConfig.name,
      file,
      background: {
        path: relative(ROOT, background),
        sha256: backgroundSha,
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
        worldRect: WORLD_RECT,
      },
      routeIds: routes.map((route) => route.id),
      maximumActiveTowers: stageConfig.maximumActiveTowers,
      outerRadius: stageConfig.outerRadius,
      innerRadius: stageConfig.innerRadius,
      candidates: candidateResults,
      currentAnchors: anchors,
    });
    process.stdout.write(`generated ${relative(ROOT, output)}\n`);
  }

  createContactSheet(stageFiles);
  assert(proofFiles.length === 6, `Expected 6 adjusted stage proofs, received ${proofFiles.length}.`);
  createAdjustmentProofSheet(proofFiles);
  for (const proofFile of proofFiles) unlinkSync(proofFile);
  const manifest = {
    schemaVersion: 1,
    status: config.status,
    generatedAssetVersion: config.generatedAssetVersion,
    generatedAt: new Date().toISOString(),
    sourceConfig: relative(ROOT, CONFIG_PATH),
    mapping: {
      worldToAsset: { x: '+640', y: '+60' },
      designToAsset: { x: '4/3*x+320', y: '4/3*y' },
      visible16x9: [320, 0, 2880, 1440],
    },
    rules: config.common,
    hudRects: HUD_RECTS.map((item) => ({ ...item, visualBufferPx: HUD_VISUAL_BUFFER_PX })),
    stages: stageManifests,
  };
  writeFileSync(join(OUTPUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  createReadme(config, stageManifests);
  process.stdout.write(`generated ${relative(ROOT, join(OUTPUT_DIR, 'all-stage-tower-layout-guides.jpg'))}\n`);
  process.stdout.write(`generated ${relative(ROOT, join(OUTPUT_DIR, 'tower-layout-adjustment-proof.jpg'))}\n`);
  process.stdout.write(`generated ${relative(ROOT, join(OUTPUT_DIR, 'manifest.json'))}\n`);
  process.stdout.write(`generated ${relative(ROOT, join(OUTPUT_DIR, 'README.md'))}\n`);
  process.stdout.write(`generated ${relative(ROOT, ART_BRIEF_DIR)}\n`);
}

try {
  main();
} finally {
  rmSync(TEMP_BUNDLE, { force: true });
  for (let index = 3; index <= 8; index += 1) {
    rmSync(join(ROOT, '.tmp', `stage_${String(index).padStart(2, '0')}-tower-layout-proof.png`), {
      force: true,
    });
  }
}
