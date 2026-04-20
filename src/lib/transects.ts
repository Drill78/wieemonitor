/**
 * 样线数据访问层。
 *
 * 阶段 1.1：从 public/data/* 静态文件读取
 * 阶段 3：改成调用 /api/transects 等接口（接口签名与本文件函数尽量对齐，便于切换）
 */

import type { FeatureCollection } from 'geojson';
import type { TransectManifestEntry } from '@/types';

// === 内存缓存 ===
// manifest 全局只 fetch 一次（小、不会变）
let manifestPromise: Promise<TransectManifestEntry[]> | null = null;
// 单条 geojson 按 path 缓存
const geojsonCache = new Map<string, Promise<FeatureCollection>>();

/**
 * 加载 transects-manifest.json。多次调用复用同一个 Promise（单飞）。
 */
export function loadTransectManifest(): Promise<TransectManifestEntry[]> {
  if (!manifestPromise) {
    manifestPromise = fetch('/data/transects-manifest.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<TransectManifestEntry[]>;
      })
      .catch((e) => {
        // 失败时清缓存，下次还能重试
        manifestPromise = null;
        throw e;
      });
  }
  return manifestPromise;
}

/**
 * 拉某保护区的所有样线（基于 manifest 内存筛选）
 */
export async function getTransectsByReserve(
  reserveCode: string,
): Promise<TransectManifestEntry[]> {
  const all = await loadTransectManifest();
  return all.filter((t) => t.reserve_code === reserveCode);
}

/**
 * 加载单条样线的 GeoJSON FeatureCollection。
 * 同一 path 重复请求只发一次网络。
 */
export function loadTransectGeoJson(path: string): Promise<FeatureCollection> {
  let p = geojsonCache.get(path);
  if (!p) {
    p = fetch(path)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<FeatureCollection>;
      })
      .catch((e) => {
        geojsonCache.delete(path);
        throw e;
      });
    geojsonCache.set(path, p);
  }
  return p;
}

// === 展示用的小工具 ===

/** 米 → "X.XX km" */
export function formatDistanceKm(meters: number): string {
  return `${(meters / 1000).toFixed(2)} km`;
}

/** 秒 → "Xh Ym" 或 "Ym" */
export function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** ISO 时间 → "YYYY-MM-DD"（按本地时区） */
export function formatDateOnly(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** ISO 时间 → "YYYY-MM-DD HH:mm"（按本地时区） */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${dd} ${hh}:${mm}`;
}

// === 海拔剖面 ===

const toRad = (d: number) => (d * Math.PI) / 180;

/** 球面 haversine 距离（米） */
function haversineMeters(
  lat1: number, lng1: number, lat2: number, lng2: number,
): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface ElevationProfilePoint {
  index: number;
  distance_m: number;   // 累计距离（米）
  elevation_m: number;  // 海拔（米；缺失时 0）
}

/**
 * 从 transect GeoJSON 抽取轨迹坐标，计算累计距离 + 海拔序列。
 * 兼容 LineString / MultiLineString（取第一段）。
 *
 * 用 unknown + 运行时判断而不是依赖严格的 GeoJSON 类型 ——
 * 因为 GeoJSON 的 Geometry 是一个包含 GeometryCollection 的联合类型，
 * 直接拿 .coordinates 会让 TS 报错。
 */
export function computeElevationProfile(
  geojson: unknown,
): ElevationProfilePoint[] {
  let coords: number[][] = [];
  const features = (geojson as { features?: unknown[] })?.features ?? [];
  for (const f of features) {
    const g = (f as { geometry?: { type?: string; coordinates?: unknown } })?.geometry;
    if (!g || typeof g.type !== 'string') continue;
    if (g.type === 'LineString' && Array.isArray(g.coordinates)) {
      coords = g.coordinates as number[][];
      break;
    }
    if (g.type === 'MultiLineString' && Array.isArray(g.coordinates)) {
      const arr = (g.coordinates as number[][][])[0] ?? [];
      coords = arr;
      break;
    }
  }

  const out: ElevationProfilePoint[] = [];
  let cum = 0;
  for (let i = 0; i < coords.length; i++) {
    const [lng, lat, alt] = coords[i];
    if (i > 0) {
      const [pLng, pLat] = coords[i - 1];
      cum += haversineMeters(pLat, pLng, lat, lng);
    }
    out.push({
      index: i,
      distance_m: cum,
      elevation_m: typeof alt === 'number' ? alt : 0,
    });
  }
  return out;
}
