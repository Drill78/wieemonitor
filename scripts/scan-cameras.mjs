/**
 * 一次性脚本：扫描外部目录下的 xlsx 相机部署登记表，生成
 *   - public/data/cameras-manifest.json   — 相机元数据索引
 *   - scripts/scan-cameras-report.json    — 扫描汇总报告
 *
 * 用法：npm run scan:cameras
 * 依赖 .env.local 提供 WIEEMONITOR_DATA_ROOT 环境变量。
 *
 * 归属算法（两层）：
 *   1) by_grid_id：相机的"网格编号"标准化（去 -/空格、转大写）后等于
 *      transects-manifest 里某条样线 id 的标准化结果 → 命中
 *   2) by_proximity：第 1 层失败时，对每条样线 LineString 求相机点的
 *      最近距离，取最短；≤ 500m 则归属
 *   3) 否则 unassigned
 *
 * ⚠️ 列映射用列名匹配（不是硬编码列号），兼容将来表格列顺序变化。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import { point as turfPoint, lineString as turfLineString } from '@turf/helpers';

// xlsx 是 CJS-only 包，ESM 下用 createRequire 加载最稳
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

// === 路径与常量 ===
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const TRANSECTS_DIR = path.join(PROJECT_ROOT, 'public/data/transects');
const TRANSECTS_MANIFEST = path.join(PROJECT_ROOT, 'public/data/transects-manifest.json');
const OUT_MANIFEST = path.join(PROJECT_ROOT, 'public/data/cameras-manifest.json');
const OUT_REPORT = path.join(PROJECT_ROOT, 'scripts/scan-cameras-report.json');

const PROXIMITY_THRESHOLD_M = 500;

// === 列名 → manifest 字段映射 ===
// 顺序和 manifest 字段对应；只列要保留的列，其他列（手填/度分秒坐标等）忽略。
const COLUMN_MAPPING = {
  序号: 'seq',
  地理单元: 'geographic_unit',
  相机编号: 'id',
  网格编号: 'grid_id_raw',
  省: 'address.province',
  市: 'address.city',
  县: 'address.county',
  '乡/镇': 'address.township',
  村: 'address.village',
  小地名: 'address.locality',
  村民小组: 'address.group',
  '东经(自动)': 'lng',
  '北纬(自动)': 'lat',
  '海拔(m)': 'elevation_m',
  坡度: 'slope',
  坡位: 'slope_position',
  坡向: 'aspect',
  植被类型: 'vegetation',
  主要树种: 'dominant_species',
  '盖度(%)': 'coverage_pct',
  相机型号: 'model',
  相机状态: 'status',
  存储介质: 'storage',
  拍摄模式: 'capture_mode',
  '间隔时间(秒)': 'interval_s',
  '视频长度(秒)': 'video_duration_s',
  视频格式: 'video_format',
  照片格式: 'photo_format',
  '连拍模式(张)': 'burst_count',
  敏感度: 'sensitivity',
  日期标签: 'date_tag',
  电池情况: 'battery',
  干扰强度: 'interference',
  两侧感应: 'bilateral',
  '相机高度(cm)': 'height_cm',
  相机朝向: 'facing',
  '路径宽度(cm)': 'path_width_cm',
  装卡人: 'deployed_by',
  '装卡时间(年月日时分)': 'deployed_at',
  取卡人: 'retrieved_by',
  '取卡时间(年月日时分)': 'retrieved_at',
};

// 哪些字段强制转 number（NaN 视为 null）
const NUMERIC_FIELDS = new Set([
  'seq',
  'lng',
  'lat',
  'elevation_m',
  'interval_s',
  'video_duration_s',
  'burst_count',
  'height_cm',
  'path_width_cm',
]);

// 时间字段（要走 parseDeployTime）
const TIME_FIELDS = new Set(['deployed_at', 'retrieved_at']);

// === 工具函数 ===

function normalizeId(s) {
  return String(s ?? '')
    .replace(/[-\s]+/g, '')
    .toUpperCase();
}

/** 统一空值判断：null / undefined / "" / 仅空白 → true */
function isBlank(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  return false;
}

function toNumberOrNull(v) {
  if (isBlank(v)) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** "202508211500" / 202508211500 → "2025-08-21T15:00:00+08:00" */
function parseDeployTime(raw) {
  if (isBlank(raw)) return null;
  const s = String(raw).padStart(12, '0');
  if (!/^\d{12}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00+08:00`;
}

/** 把扁平的 path 写入嵌套对象，例如 setNested(o, "address.city", "运城") */
function setNested(obj, dottedPath, value) {
  const keys = dottedPath.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}

/** 递归扫描 ROOT 下所有 .xlsx */
async function walkXlsx(dir) {
  const found = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    throw new Error(`无法读取目录 "${dir}"：${e.message}`);
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // 跳过 ~$ 临时锁文件、隐藏目录
      if (entry.name.startsWith('~$') || entry.name.startsWith('.')) continue;
      found.push(...(await walkXlsx(full)));
    } else if (
      entry.isFile() &&
      entry.name.toLowerCase().endsWith('.xlsx') &&
      !entry.name.startsWith('~$') // Excel 临时文件
    ) {
      found.push(full);
    }
  }
  return found;
}

/** 加载所有样线 + 它们的几何，构建归属判定所需结构 */
async function loadTransects() {
  const txt = await fs.readFile(TRANSECTS_MANIFEST, 'utf8');
  const manifest = JSON.parse(txt);
  const out = [];
  for (const t of manifest) {
    let coords = null;
    try {
      // t.geojson_path 形如 "/data/transects/LS-19.geojson"，
      // 是 web 路径。要落到磁盘上需补 "public" 前缀。
      const geo = JSON.parse(
        await fs.readFile(
          path.join(PROJECT_ROOT, 'public', t.geojson_path.replace(/^\/+/, '')),
          'utf8',
        ),
      );
      const f = geo.features?.[0];
      if (f?.geometry?.type === 'LineString') {
        coords = f.geometry.coordinates;
      } else if (f?.geometry?.type === 'MultiLineString') {
        coords = f.geometry.coordinates[0];
      }
    } catch (e) {
      console.warn(`  [transect] ${t.id} geojson 加载失败：${e.message}`);
    }
    out.push({
      id: t.id,
      normalized: normalizeId(t.id),
      reserve_code: t.reserve_code,
      reserve_name: t.reserve_name,
      coords, // 二维数组 [[lng,lat,alt?],...] 或 null
    });
  }
  return out;
}

/** 解析单个 xlsx 的相机表 sheet */
function parseCameraSheet(filePath) {
  const wb = XLSX.readFile(filePath);
  // 优先名字含"相机"的 sheet；否则用第一个
  const sheetName =
    wb.SheetNames.find((n) => n.includes('相机')) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    blankrows: false,
  });
  if (rows.length < 2) return { sheetName, header: [], data: [] };
  const header = rows[0].map((h) => (h == null ? '' : String(h).trim()));
  // colName → colIdx，但要选出我们关心的
  const colMap = new Map();
  for (let i = 0; i < header.length; i++) {
    const name = header[i];
    if (COLUMN_MAPPING[name] !== undefined) colMap.set(name, i);
  }
  return { sheetName, header, colMap, rows: rows.slice(1) };
}

/** 把一行原始数组转为 manifest entry（不含归属字段，归属在调用处补） */
function rowToEntry(row, colMap, sourceFile) {
  const entry = { address: {} };
  for (const [colName, fieldPath] of Object.entries(COLUMN_MAPPING)) {
    const idx = colMap.get(colName);
    if (idx === undefined) continue;
    let v = row[idx];
    // 时间字段
    if (TIME_FIELDS.has(fieldPath)) {
      v = parseDeployTime(v);
    } else if (NUMERIC_FIELDS.has(fieldPath)) {
      v = toNumberOrNull(v);
    } else if (isBlank(v)) {
      v = null;
    } else if (typeof v === 'string') {
      v = v.trim();
    }
    setNested(entry, fieldPath, v);
  }
  entry.source_file = sourceFile;
  return entry;
}

/** 距离（米）：点到一段 LineString 最近距离 */
function pointToLineMeters(lng, lat, lineCoords) {
  if (!Array.isArray(lineCoords) || lineCoords.length < 2) return Infinity;
  const pt = turfPoint([lng, lat]);
  const ln = turfLineString(lineCoords);
  const np = nearestPointOnLine(ln, pt, { units: 'kilometers' });
  return np.properties.dist * 1000;
}

// === 主流程 ===

async function main() {
  const DATA_ROOT = process.env.WIEEMONITOR_DATA_ROOT;
  if (!DATA_ROOT) {
    console.error('✗ 未设置 WIEEMONITOR_DATA_ROOT。请检查 .env.local');
    process.exit(1);
  }
  console.log(`[数据根目录] ${DATA_ROOT}`);

  // 验证根目录存在
  try {
    const s = await fs.stat(DATA_ROOT);
    if (!s.isDirectory()) throw new Error('不是目录');
  } catch (e) {
    console.error(`✗ 无法访问数据根目录：${e.message}`);
    process.exit(1);
  }

  // 加载样线索引
  console.log('\n[加载样线 manifest]');
  const transects = await loadTransects();
  console.log(`  共 ${transects.length} 条样线`);
  const byNormalized = new Map(transects.map((t) => [t.normalized, t]));

  // 扫描 xlsx
  console.log(`\n[扫描 XLSX] 在 ${DATA_ROOT} 下递归搜索 .xlsx`);
  const xlsxPaths = await walkXlsx(DATA_ROOT);
  console.log(`  找到 ${xlsxPaths.length} 个 xlsx 文件`);

  const manifest = [];
  const errors = [];
  const idSeen = new Map();
  const noCoord = [];

  for (const fullPath of xlsxPaths) {
    const relPath = path.relative(DATA_ROOT, fullPath);
    console.log(`\n=== ${relPath} ===`);
    let parsed;
    try {
      parsed = parseCameraSheet(fullPath);
    } catch (e) {
      console.log(`  ✗ 读取失败：${e.message}`);
      errors.push({ file: relPath, stage: 'read', message: e.message });
      continue;
    }
    // 不像相机表的 xlsx（如发票、其他业务表）：silently 跳过，不算 error
    const looksLikeCameraSheet =
      parsed.colMap &&
      parsed.colMap.has('相机编号') &&
      parsed.colMap.has('网格编号');
    if (!looksLikeCameraSheet) {
      console.log(
        `  · 跳过（非相机表；无"相机编号"+"网格编号"列；sheet="${parsed.sheetName}"）`,
      );
      continue;
    }
    console.log(
      `  sheet="${parsed.sheetName}", 数据行 ${parsed.rows.length}, 识别 ${parsed.colMap.size} 列`,
    );

    let okInFile = 0;
    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i];
      // 跳过完全空行
      if (row.every((v) => isBlank(v))) continue;
      const e = rowToEntry(row, parsed.colMap, relPath);

      // 必须有 id
      if (isBlank(e.id)) {
        errors.push({
          file: relPath,
          stage: 'missing_id',
          row_index: i + 2,
        });
        continue;
      }
      // id 去重
      const seenCount = idSeen.get(e.id) || 0;
      if (seenCount > 0) {
        const uniq = `${e.id}_${seenCount + 1}`;
        errors.push({
          file: relPath,
          stage: 'duplicate_id',
          message: `${e.id} → ${uniq}`,
        });
        e.id = uniq;
      }
      idSeen.set(e.id, seenCount + 1);

      // 必须有坐标才能上图（仍然写入 manifest 以便统计）
      if (e.lng == null || e.lat == null) {
        noCoord.push({ id: e.id, file: relPath });
      }

      // === 归属判定 ===
      let transect_id = null;
      let reserve_code = null;
      let match_type = 'unassigned';
      let match_distance_m = null;

      // 第 1 层：网格 id 匹配
      if (e.grid_id_raw) {
        const norm = normalizeId(e.grid_id_raw);
        const hit = byNormalized.get(norm);
        if (hit) {
          transect_id = hit.id;
          reserve_code = hit.reserve_code;
          match_type = 'by_grid_id';
        }
      }

      // 第 2 层：就近（仅 1 层失败 + 有坐标 + 有候选 LineString）
      if (match_type === 'unassigned' && e.lng != null && e.lat != null) {
        let bestDist = Infinity;
        let bestT = null;
        for (const t of transects) {
          if (!t.coords) continue;
          const d = pointToLineMeters(e.lng, e.lat, t.coords);
          if (d < bestDist) {
            bestDist = d;
            bestT = t;
          }
        }
        if (bestT && bestDist <= PROXIMITY_THRESHOLD_M) {
          transect_id = bestT.id;
          reserve_code = bestT.reserve_code;
          match_type = 'by_proximity';
          match_distance_m = +bestDist.toFixed(1);
        }
      }

      manifest.push({
        ...e,
        transect_id,
        reserve_code,
        match_type,
        match_distance_m,
      });
      okInFile++;
    }
    console.log(`  ✓ 入库 ${okInFile} 条`);
  }

  // 排序：按 transect_id（自然顺序）再按 id
  manifest.sort((a, b) => {
    const ta = a.transect_id ?? 'ZZZ';
    const tb = b.transect_id ?? 'ZZZ';
    if (ta !== tb) return ta.localeCompare(tb);
    return a.id.localeCompare(b.id);
  });

  await fs.writeFile(OUT_MANIFEST, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\n[manifest] 写入 ${path.relative(PROJECT_ROOT, OUT_MANIFEST)}`);

  // === 统计 ===
  const byMatch = { by_grid_id: 0, by_proximity: 0, unassigned: 0 };
  const byTransect = new Map();
  for (const c of manifest) {
    byMatch[c.match_type] = (byMatch[c.match_type] || 0) + 1;
    const k = c.transect_id ?? '(未归属)';
    byTransect.set(k, (byTransect.get(k) || 0) + 1);
  }

  // 字段填写率
  const allKeys = ['lng', 'lat', 'elevation_m', 'model', 'status', 'storage', 'capture_mode',
    'interval_s', 'video_duration_s', 'video_format', 'photo_format', 'burst_count',
    'sensitivity', 'date_tag', 'battery', 'interference', 'bilateral', 'height_cm',
    'facing', 'path_width_cm', 'deployed_by', 'deployed_at', 'retrieved_by', 'retrieved_at',
    'slope', 'slope_position', 'aspect', 'vegetation', 'dominant_species', 'coverage_pct'];
  const total = manifest.length;
  const fillRate = {};
  for (const key of allKeys) {
    let n = 0;
    for (const c of manifest) if (!isBlank(c[key])) n++;
    fillRate[key] = total ? +(n / total * 100).toFixed(1) : 0;
  }
  // 列出 < 100% 的
  const incompleteFields = Object.entries(fillRate)
    .filter(([, v]) => v < 100)
    .sort((a, b) => a[1] - b[1]);

  const report = {
    scanned_at: new Date().toISOString(),
    data_root: DATA_ROOT,
    total_xlsx: xlsxPaths.length,
    total_cameras: manifest.length,
    by_match_type: byMatch,
    by_transect: Object.fromEntries(byTransect),
    no_coord_count: noCoord.length,
    no_coord_items: noCoord,
    errors,
    fill_rate_under_100: Object.fromEntries(incompleteFields),
  };
  await fs.writeFile(OUT_REPORT, JSON.stringify(report, null, 2), 'utf8');
  console.log(`[报告] 写入 ${path.relative(PROJECT_ROOT, OUT_REPORT)}`);

  console.log('\n=== 汇总 ===');
  console.log(`  扫描 xlsx：${xlsxPaths.length}`);
  console.log(`  相机总数：${manifest.length}`);
  console.log(`  ── 网格匹配：${byMatch.by_grid_id}`);
  console.log(`  ── 就近匹配：${byMatch.by_proximity}（≤ ${PROXIMITY_THRESHOLD_M}m）`);
  console.log(`  ── 未归属：  ${byMatch.unassigned}`);
  console.log(`  缺坐标：${noCoord.length}`);
  console.log(`  错误/警告：${errors.length}`);
  console.log('  按样线分组：');
  for (const [k, v] of byTransect) {
    console.log(`    ${k}: ${v} 台`);
  }
  if (incompleteFields.length > 0) {
    console.log('  填写率 < 100% 的字段（仅显示 ≤ 50%）：');
    for (const [k, v] of incompleteFields) {
      if (v <= 50) console.log(`    ${k}: ${v}%`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
