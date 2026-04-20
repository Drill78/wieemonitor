/**
 * 相机数据访问层。
 * 阶段 1.3：从 public/data/cameras-manifest.json 静态文件读取
 * 阶段 3：改成 /api/cameras 接口
 */

import type { CameraManifestEntry } from '@/types';

// === 内存缓存（单飞） ===
let manifestPromise: Promise<CameraManifestEntry[]> | null = null;

export function loadCameraManifest(): Promise<CameraManifestEntry[]> {
  if (!manifestPromise) {
    manifestPromise = fetch('/data/cameras-manifest.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<CameraManifestEntry[]>;
      })
      .catch((e) => {
        manifestPromise = null;
        throw e;
      });
  }
  return manifestPromise;
}

/** 该样线下的相机 */
export async function getCamerasByTransect(
  transectId: string,
): Promise<CameraManifestEntry[]> {
  const all = await loadCameraManifest();
  return all.filter((c) => c.transect_id === transectId);
}

/** 该保护区下所有相机（跨样线） */
export async function getCamerasByReserve(
  reserveCode: string,
): Promise<CameraManifestEntry[]> {
  const all = await loadCameraManifest();
  return all.filter((c) => c.reserve_code === reserveCode);
}

// === 展示用工具 ===

/** 通用：null/undefined/空字符串/纯空白 → "N/A"；其他 → toString */
export function formatValue(v: unknown): string {
  if (v === null || v === undefined) return 'N/A';
  if (typeof v === 'string') {
    const s = v.trim();
    return s === '' ? 'N/A' : s;
  }
  if (typeof v === 'number') {
    return Number.isFinite(v) ? String(v) : 'N/A';
  }
  return String(v);
}

/** ISO 时间 → "YYYY-MM-DD HH:mm"（本地时区） */
export function formatDeployTime(iso: string | null | undefined): string {
  if (!iso) return 'N/A';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'N/A';
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${dd} ${hh}:${mm}`;
}

/** 装卡 → 取卡 之间的天数（向上取整）；任一缺失返回 null */
export function daysBetween(
  deployedAt: string | null | undefined,
  retrievedAt: string | null | undefined,
): number | null {
  if (!deployedAt || !retrievedAt) return null;
  const a = new Date(deployedAt).getTime();
  const b = new Date(retrievedAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.ceil((b - a) / (1000 * 60 * 60 * 24));
}

/** 把 address 对象拼成"省 市 县 乡 村"，缺的跳过；全空返回 null */
export function formatAddress(addr: CameraManifestEntry['address']): string | null {
  if (!addr) return null;
  const parts = [
    addr.province,
    addr.city,
    addr.county,
    addr.township,
    addr.village,
  ]
    .map((s) => (s ?? '').toString().trim())
    .filter((s) => s.length > 0);
  return parts.length === 0 ? null : parts.join(' ');
}
