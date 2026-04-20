/**
 * 保护区数据访问层。
 *
 * 数据来源：public/geo/reserves-registry.json
 * 由 scripts/scan-reserves.mjs 从 46 个官方 shapefile 生成。
 */

import type {
  ReserveLevel,
  ReserveRegistry,
  ReserveRegistryEntry,
} from '@/types';

// === 内存缓存（单飞） ===
let registryPromise: Promise<ReserveRegistry> | null = null;

export function loadReservesRegistry(): Promise<ReserveRegistry> {
  if (!registryPromise) {
    registryPromise = fetch('/geo/reserves-registry.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ReserveRegistry>;
      })
      .catch((e) => {
        registryPromise = null;
        throw e;
      });
  }
  return registryPromise;
}

/** 直接 fetch reserves 数组（更常用） */
export async function loadReserves(): Promise<ReserveRegistryEntry[]> {
  return (await loadReservesRegistry()).reserves;
}

export async function findReserveByCode(
  code: string,
): Promise<ReserveRegistryEntry | null> {
  const list = await loadReserves();
  return list.find((r) => r.code === code) ?? null;
}

export async function findReserveByLegacyCode(
  legacyCode: string,
): Promise<ReserveRegistryEntry | null> {
  const list = await loadReserves();
  return list.find((r) => r.legacy_code === legacyCode) ?? null;
}

export async function getReservesByLevel(
  level: ReserveLevel,
): Promise<ReserveRegistryEntry[]> {
  const list = await loadReserves();
  return list.filter((r) => r.level === level);
}

/**
 * 把任意 code（新或旧）解析为新编码。
 * 用于兼容老的 transects/cameras manifest（reserve_code 可能是旧的 SXNR-XX）。
 */
export async function resolveReserveCode(code: string): Promise<string> {
  const list = await loadReserves();
  if (list.some((r) => r.code === code)) return code;
  const hit = list.find((r) => r.legacy_code === code);
  return hit ? hit.code : code;
}

// === 颜色常量（保护区蓝色家族；按 zone 分层时用） ===

/** 三区分层时各 zone 的填充色 */
export const ZONE_COLORS: Record<'core' | 'buffer' | 'experimental' | 'unknown', string> = {
  core: '#1e40af',          // blue-800
  buffer: '#3b82f6',        // blue-500
  experimental: '#93c5fd',  // blue-300
  unknown: '#cbd5e1',       // slate-300
};

/** 合并显示时的统一色 */
export const MERGED_COLOR = '#3b82f6'; // blue-500

/** 选中态边框色（深蓝） */
export const BORDER_SELECTED = '#1e3a8a'; // blue-900
/** 默认边框色 */
export const BORDER_DEFAULT = '#2563eb'; // blue-600
