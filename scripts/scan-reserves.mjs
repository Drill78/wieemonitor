/**
 * 一次性脚本：把山西林草局官方 46 个保护区 shapefile 转为前端可用 GeoJSON。
 *
 * 用法：npm run scan:reserves
 * 依赖 .env.local 提供 WIEEMONITOR_DATA_ROOT，shapefile 目录是
 *   <ROOT>/保护区边界/*.shp
 *
 * 产出：
 *   public/geo/reserves/<CODE>.geojson           （三区分层，每区一个 Feature）
 *   public/geo/reserves/<CODE>.merged.geojson    （三区合并，单 Feature）
 *   public/geo/reserves-registry.json            （registry，所有保护区元信息）
 *   scripts/scan-reserves-report.json            （扫描报告）
 *
 * 坐标系：源数据 CGCS2000（与 WGS84 偏差 < 1m），不做坐标转换，直接当 WGS84。
 *
 * 编码规则：
 *   national   → SXNR-N01..N08（按文件名 Unicode 排序）
 *   provincial → SXPR-P01..P35
 *   other      → SXOR-O01..O03
 *
 * 旧编码兼容：旧的 SXNR-01..08（来自 OSM）按 name_short 映射到新编码，
 * 写入 registry.reserves[i].legacy_code，前端 lib/reserves.ts 提供 resolve 函数。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as shapefile from 'shapefile';
import centroid from '@turf/centroid';
import area from '@turf/area';

// === 路径与常量 ===
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUT_RESERVE_DIR = path.join(PROJECT_ROOT, 'public/geo/reserves');
const OUT_REGISTRY = path.join(PROJECT_ROOT, 'public/geo/reserves-registry.json');
const OUT_REPORT = path.join(PROJECT_ROOT, 'scripts/scan-reserves-report.json');

// 旧 OSM 数据 → 新数据的 name_short 映射（用于 legacy_code 兼容）
// key 是新数据里我们解析出的 name_short，value 是旧 mock 的 SXNR-XX
const LEGACY_BY_NAME_SHORT = {
  芦芽山: 'SXNR-01',
  庞泉沟: 'SXNR-02',
  黑茶山: 'SXNR-03',
  五鹿山: 'SXNR-04',
  灵空山: 'SXNR-05',
  历山: 'SXNR-06',
  太宽河: 'SXNR-07',
  // 蟒河 vs 阳城蟒河 vs 阳城蟒河猕猴 —— 看新数据实际名字再处理
  阳城蟒河猕猴: 'SXNR-08',
};

// GNFQ 字段值 → zone 标识
const ZONE_MAP = {
  核心区: 'core',
  缓冲区: 'buffer',
  实验区: 'experimental',
};

// === 工具函数 ===

/**
 * 解析文件名（去 .shp）→ { name_full, name_short, level }
 *
 * 标准格式：山西<X>(国家级|省级)自然保护区
 *   - level 由"国家级/省级"决定
 *   - name_short = X
 *   - name_full = 整个原始名（去 .shp 但保留前缀后缀）
 *
 * 非标准格式（3 个）：
 *   - 山西省团圆山自然保护区 / 山西省应县南山自然保护区
 *     → 去掉"山西省"前缀和"自然保护区"后缀，level=other
 *   - 忻州五台山高山草甸自然保护区
 *     → 整体保留，level=other（保留前缀让用户能区分）
 */
function parseName(filename) {
  const base = filename.replace(/\.shp$/, '');
  // 标准格式
  let m = /^山西(.+?)(国家级|省级)自然保护区$/.exec(base);
  if (m) {
    return {
      name_full: base,
      name_short: m[1],
      level: m[2] === '国家级' ? 'national' : 'provincial',
    };
  }
  // 非标准 1：山西省XXX自然保护区
  m = /^山西省(.+?)自然保护区$/.exec(base);
  if (m) {
    return {
      name_full: base,
      name_short: m[1],
      level: 'other',
    };
  }
  // 非标准 2：其它（保留全名作为 short）
  return {
    name_full: base,
    name_short: base.replace(/自然保护区$/, ''),
    level: 'other',
  };
}

/** 从一组 features 收集所有 polygon 坐标，组装为 MultiPolygon */
function combineToMultiPolygon(features) {
  const polys = [];
  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') polys.push(g.coordinates);
    else if (g.type === 'MultiPolygon') polys.push(...g.coordinates);
  }
  if (polys.length === 0) return null;
  return { type: 'MultiPolygon', coordinates: polys };
}

/** 算 bbox（[minLng, minLat, maxLng, maxLat]） */
function computeBBox(features) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  function walk(coords) {
    if (typeof coords[0] === 'number') {
      const [lng, lat] = coords;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    } else {
      for (const c of coords) walk(c);
    }
  }
  for (const f of features) {
    if (f.geometry?.coordinates) walk(f.geometry.coordinates);
  }
  if (!Number.isFinite(minLng)) return null;
  return [minLng, minLat, maxLng, maxLat];
}

/** 算保护区中心：先合并为 MultiPolygon 再 centroid（更稳） */
function computeCenter(geom) {
  if (!geom) return null;
  try {
    const c = centroid({ type: 'Feature', geometry: geom, properties: {} });
    const [lng, lat] = c.geometry.coordinates;
    return { lng, lat };
  } catch {
    return null;
  }
}

/** 算面积（km²）。turf area 返回 m² */
function computeAreaKm2(geom) {
  if (!geom) return null;
  try {
    return area({ type: 'Feature', geometry: geom, properties: {} }) / 1_000_000;
  } catch {
    return null;
  }
}

/** 安全转 number，无效返回 null */
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

// === 主流程 ===

async function main() {
  const DATA_ROOT = process.env.WIEEMONITOR_DATA_ROOT;
  if (!DATA_ROOT) {
    console.error('✗ 未设置 WIEEMONITOR_DATA_ROOT。请检查 .env.local');
    process.exit(1);
  }
  const SHP_DIR = path.join(DATA_ROOT, '保护区边界');
  console.log(`[shapefile 目录] ${SHP_DIR}`);
  try {
    const s = await fs.stat(SHP_DIR);
    if (!s.isDirectory()) throw new Error('不是目录');
  } catch (e) {
    console.error(`✗ 无法访问 shapefile 目录：${e.message}`);
    process.exit(1);
  }

  // 列出所有 .shp
  const allFiles = await fs.readdir(SHP_DIR);
  const shpFiles = allFiles.filter((f) => f.toLowerCase().endsWith('.shp'));
  console.log(`  找到 ${shpFiles.length} 个 .shp`);

  // 按级别分组并排序，分配编码
  const parsed = shpFiles.map((file) => ({ file, ...parseName(file) }));
  const byLevel = { national: [], provincial: [], other: [] };
  for (const p of parsed) byLevel[p.level].push(p);
  for (const lv of ['national', 'provincial', 'other']) {
    byLevel[lv].sort((a, b) => a.file.localeCompare(b.file, 'zh-Hans-CN'));
  }
  // 编码生成
  const codeOf = new Map();
  byLevel.national.forEach((p, i) => codeOf.set(p.file, `SXNR-N${String(i + 1).padStart(2, '0')}`));
  byLevel.provincial.forEach((p, i) => codeOf.set(p.file, `SXPR-P${String(i + 1).padStart(2, '0')}`));
  byLevel.other.forEach((p, i) => codeOf.set(p.file, `SXOR-O${String(i + 1).padStart(2, '0')}`));

  // 清理旧输出目录的"散乱"老文件（仅保留我们规范产出的 SXNR-N* / SXPR-P* / SXOR-O*）
  await fs.mkdir(OUT_RESERVE_DIR, { recursive: true });
  const existing = await fs.readdir(OUT_RESERVE_DIR);
  for (const f of existing) {
    if (!/^(SXNR-N\d{2}|SXPR-P\d{2}|SXOR-O\d{2})(\.merged)?\.geojson$/.test(f)) {
      await fs.unlink(path.join(OUT_RESERVE_DIR, f));
      console.log(`  [清理] 删除旧文件 ${f}`);
    }
  }

  const registryEntries = [];
  const errors = [];
  const gnfqStats = new Map(); // 字段值统计
  const areaWarnings = [];
  const nonStandardLog = [];

  for (const p of parsed) {
    const code = codeOf.get(p.file);
    const baseName = p.file.replace(/\.shp$/, '');
    const fullPath = path.join(SHP_DIR, p.file);
    const dbfPath = fullPath.replace(/\.shp$/, '.dbf');
    console.log(`\n=== ${code}  ${p.name_short}  [${p.level}] ===`);

    // 读取所有 features（GBK 编码 dbf）
    let features;
    try {
      features = [];
      const src = await shapefile.open(fullPath, dbfPath, { encoding: 'gbk' });
      while (true) {
        const r = await src.read();
        if (r.done) break;
        features.push(r.value);
      }
    } catch (e) {
      console.log(`  ✗ 解析失败：${e.message}`);
      errors.push({ code, file: p.file, message: e.message });
      continue;
    }
    console.log(`  features=${features.length}`);

    // 按 GNFQ 分组
    const byZone = { core: [], buffer: [], experimental: [], unknown: [] };
    for (const f of features) {
      const raw = f.properties?.GNFQ ?? '';
      gnfqStats.set(raw, (gnfqStats.get(raw) || 0) + 1);
      const z = ZONE_MAP[raw] || 'unknown';
      byZone[z].push(f);
    }

    // 三区合并几何 + 整体合并
    const zonesGeom = {};
    const zonesInfo = {};
    let officialAreaSum = 0;
    for (const z of ['core', 'buffer', 'experimental']) {
      const arr = byZone[z];
      if (arr.length === 0) continue;
      const geom = combineToMultiPolygon(arr);
      const km2 = computeAreaKm2(geom);
      const officialHa = arr.reduce((acc, f) => acc + (num(f.properties?.MJ) ?? 0), 0);
      officialAreaSum += officialHa;
      zonesGeom[z] = geom;
      zonesInfo[z] = {
        area_km2: km2 != null ? +km2.toFixed(3) : null,
        feature_count: arr.length,
        official_area_ha: +officialHa.toFixed(2),
      };
    }
    if (byZone.unknown.length > 0) {
      console.log(`  ⚠ ${byZone.unknown.length} 个 feature 的 GNFQ 字段无法识别（zone=unknown）`);
      const unknownGeom = combineToMultiPolygon(byZone.unknown);
      const km2 = computeAreaKm2(unknownGeom);
      zonesGeom.unknown = unknownGeom;
      zonesInfo.unknown = {
        area_km2: km2 != null ? +km2.toFixed(3) : null,
        feature_count: byZone.unknown.length,
      };
      const officialHa = byZone.unknown.reduce((acc, f) => acc + (num(f.properties?.MJ) ?? 0), 0);
      officialAreaSum += officialHa;
    }

    // 全部合并几何（用于 merged.geojson + center/bbox/total area）
    const allGeom = combineToMultiPolygon(features);
    const totalKm2 = computeAreaKm2(allGeom);
    const center = computeCenter(allGeom);
    const bbox = computeBBox(features);

    // MJ 字段单位假设是公顷（ha）。1 km² = 100 ha。
    if (totalKm2 != null && officialAreaSum > 0) {
      const officialKm2 = officialAreaSum / 100;
      const diff = Math.abs(totalKm2 - officialKm2) / officialKm2;
      if (diff > 0.1) {
        areaWarnings.push({
          code,
          name_short: p.name_short,
          computed_km2: +totalKm2.toFixed(2),
          official_km2_assumed_ha: +officialKm2.toFixed(2),
          relative_diff_pct: +(diff * 100).toFixed(1),
        });
      }
    }

    // 写出 <CODE>.geojson（三区分层）
    const zoneFeatures = [];
    for (const z of ['core', 'buffer', 'experimental', 'unknown']) {
      if (!zonesGeom[z]) continue;
      zoneFeatures.push({
        type: 'Feature',
        geometry: zonesGeom[z],
        properties: {
          code,
          name_short: p.name_short,
          name_full: p.name_full,
          zone: z,
          area_km2: zonesInfo[z].area_km2,
          feature_count: zonesInfo[z].feature_count,
        },
      });
    }
    await fs.writeFile(
      path.join(OUT_RESERVE_DIR, `${code}.geojson`),
      JSON.stringify({ type: 'FeatureCollection', features: zoneFeatures }),
      'utf8',
    );

    // 写出 <CODE>.merged.geojson
    if (allGeom) {
      await fs.writeFile(
        path.join(OUT_RESERVE_DIR, `${code}.merged.geojson`),
        JSON.stringify({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: allGeom,
              properties: {
                code,
                name_short: p.name_short,
                merged: true,
                area_km2: totalKm2 != null ? +totalKm2.toFixed(3) : null,
              },
            },
          ],
        }),
        'utf8',
      );
    }

    // 老编码映射
    const legacy_code = LEGACY_BY_NAME_SHORT[p.name_short] ?? null;
    if (p.level === 'other') {
      nonStandardLog.push({ code, file: p.file, name_short: p.name_short });
    }

    registryEntries.push({
      code,
      legacy_code,
      name_full: p.name_full,
      name_short: p.name_short,
      level: p.level,
      center,
      bbox,
      area_km2_total: totalKm2 != null ? +totalKm2.toFixed(3) : null,
      zones: {
        ...(zonesInfo.core ? { core: zonesInfo.core } : {}),
        ...(zonesInfo.buffer ? { buffer: zonesInfo.buffer } : {}),
        ...(zonesInfo.experimental ? { experimental: zonesInfo.experimental } : {}),
        ...(zonesInfo.unknown ? { unknown: zonesInfo.unknown } : {}),
      },
      geojson_path: `/geo/reserves/${code}.geojson`,
      merged_geojson_path: `/geo/reserves/${code}.merged.geojson`,
      source_file: baseName,
    });

    const zonesSummary = ['core', 'buffer', 'experimental']
      .map((z) => (zonesInfo[z] ? `${z}=${zonesInfo[z].feature_count}` : ''))
      .filter(Boolean)
      .join(' ');
    console.log(
      `  ✓ ${code} | ${zonesSummary}${byZone.unknown.length ? ` unknown=${byZone.unknown.length}` : ''}` +
        ` | 计算面积 ${totalKm2 != null ? totalKm2.toFixed(2) : '?'} km²` +
        ` | legacy=${legacy_code ?? '-'}`,
    );
  }

  // 写出 registry
  const registry = {
    generated_at: new Date().toISOString(),
    source: '山西省林草局 shapefile（CGCS2000，按 WGS84 处理）',
    count: registryEntries.length,
    by_level: {
      national: registryEntries.filter((r) => r.level === 'national').length,
      provincial: registryEntries.filter((r) => r.level === 'provincial').length,
      other: registryEntries.filter((r) => r.level === 'other').length,
    },
    reserves: registryEntries,
  };
  await fs.writeFile(OUT_REGISTRY, JSON.stringify(registry, null, 2), 'utf8');
  console.log(`\n[registry] 写入 ${path.relative(PROJECT_ROOT, OUT_REGISTRY)}`);

  // 报告
  const report = {
    scanned_at: new Date().toISOString(),
    shp_dir: SHP_DIR,
    total_shp: shpFiles.length,
    success: registryEntries.length,
    failed: errors.length,
    by_level: registry.by_level,
    gnfq_field_values: Object.fromEntries(gnfqStats),
    legacy_mapping: registryEntries
      .filter((r) => r.legacy_code)
      .map((r) => ({ legacy: r.legacy_code, new: r.code, name_short: r.name_short })),
    legacy_unmapped: Object.entries(LEGACY_BY_NAME_SHORT)
      .filter(([k]) => !registryEntries.some((r) => r.name_short === k))
      .map(([name_short, legacy]) => ({ legacy, expected_name_short: name_short })),
    non_standard_files: nonStandardLog,
    area_warnings_over_10pct: areaWarnings,
    errors,
  };
  await fs.writeFile(OUT_REPORT, JSON.stringify(report, null, 2), 'utf8');
  console.log(`[报告] 写入 ${path.relative(PROJECT_ROOT, OUT_REPORT)}`);

  // 汇总
  console.log('\n=== 汇总 ===');
  console.log(`  shp 数：${shpFiles.length}`);
  console.log(`  成功：${registryEntries.length}`);
  console.log(`  失败：${errors.length}`);
  console.log(
    `  按级别：国家级 ${registry.by_level.national} / 省级 ${registry.by_level.provincial} / 其他 ${registry.by_level.other}`,
  );
  console.log('  GNFQ 字段实际值：');
  for (const [k, v] of gnfqStats) console.log(`    "${k}" → ${v} 次`);
  console.log(`  老编码映射：${report.legacy_mapping.length} 个`);
  for (const m of report.legacy_mapping) console.log(`    ${m.legacy} → ${m.new}  (${m.name_short})`);
  if (report.legacy_unmapped.length > 0) {
    console.log('  ⚠ 老编码无对应新数据：');
    for (const m of report.legacy_unmapped)
      console.log(`    ${m.legacy} 期望名 "${m.expected_name_short}"`);
  }
  if (areaWarnings.length > 0) {
    console.log(`  面积差异 > 10% 警告：${areaWarnings.length} 个`);
    for (const w of areaWarnings.slice(0, 10))
      console.log(
        `    ${w.code} ${w.name_short}: 算 ${w.computed_km2} km² vs 官方(假设 ha) ${w.official_km2_assumed_ha} km²  Δ${w.relative_diff_pct}%`,
      );
  }
  if (nonStandardLog.length > 0) {
    console.log('  非标命名文件 (level=other)：');
    for (const f of nonStandardLog) console.log(`    ${f.code}  ${f.file}  → ${f.name_short}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
