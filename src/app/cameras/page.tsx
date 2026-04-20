/**
 * 路由 /cameras ：相机数据列表页（真实数据）。
 *
 * - 加载 cameras-manifest.json
 * - 按 transect_id 分组（未归属归到末尾"未归属"组）
 * - 顶部统计：总数 / 网格匹配 / 就近匹配 / 未归属
 * - 搜索框：按 id / 小地名 / 村
 * - 每个分组卡片可折叠
 * - 「在地图上查看」→ /?reserve=...&transect=...&camera=ID
 * - 「详情」→ 弹 CameraDetailModal
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import CameraDetailModal from '@/components/modules/CameraDetailModal';
import { reserves } from '@/data/mock/reserves';
import {
  formatDeployTime,
  formatValue,
  loadCameraManifest,
} from '@/lib/cameras';
import type { CameraManifestEntry } from '@/types';

const UNASSIGNED_KEY = '__unassigned__';

export default function CamerasPage() {
  const [manifest, setManifest] = useState<CameraManifestEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [detailCamera, setDetailCamera] =
    useState<CameraManifestEntry | null>(null);

  useEffect(() => {
    loadCameraManifest()
      .then((list) => setManifest(list))
      .catch((e) => setError(String(e)));
  }, []);

  const filtered = useMemo(() => {
    if (!manifest) return [];
    const q = search.trim().toLowerCase();
    if (!q) return manifest;
    return manifest.filter((c) => {
      const id = c.id.toLowerCase();
      const village = (c.address?.village ?? '').toLowerCase();
      const locality = (c.address?.locality ?? '').toLowerCase();
      return id.includes(q) || village.includes(q) || locality.includes(q);
    });
  }, [manifest, search]);

  // 分组：transect_id → list；未归属归到 UNASSIGNED_KEY
  const grouped = useMemo(() => {
    const map = new Map<string, CameraManifestEntry[]>();
    for (const c of filtered) {
      const key = c.transect_id ?? UNASSIGNED_KEY;
      const arr = map.get(key);
      if (arr) arr.push(c);
      else map.set(key, [c]);
    }
    // 组内按 id 自然排序
    for (const arr of map.values()) {
      arr.sort((a, b) => a.id.localeCompare(b.id));
    }
    return map;
  }, [filtered]);

  // 排序：先按 transect_id 字母序，最后是未归属
  const orderedKeys = useMemo(() => {
    const real = [...grouped.keys()]
      .filter((k) => k !== UNASSIGNED_KEY)
      .sort();
    if (grouped.has(UNASSIGNED_KEY)) real.push(UNASSIGNED_KEY);
    return real;
  }, [grouped]);

  const stats = useMemo(() => {
    if (!manifest) return null;
    let grid = 0, prox = 0, un = 0;
    for (const c of manifest) {
      if (c.match_type === 'by_grid_id') grid++;
      else if (c.match_type === 'by_proximity') prox++;
      else un++;
    }
    return { total: manifest.length, grid, prox, un };
  }, [manifest]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between gap-4 mb-2 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">红外相机列表</h1>
          {stats && (
            <p className="text-sm text-slate-500 mt-1">
              共 <strong className="text-slate-700">{stats.total}</strong> 台 ·
              网格匹配 {stats.grid} · 就近匹配 {stats.prox} · 未归属 {stats.un}
            </p>
          )}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="按编号 / 小地名 / 村搜索"
          className="border border-slate-300 rounded-md px-3 py-1.5 text-sm w-64 focus:outline-none focus:border-emerald-500"
        />
      </div>

      {!manifest && !error && (
        <div className="mt-8 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      )}
      {error && (
        <div className="mt-8 text-sm text-rose-600">
          加载相机 manifest 失败：{error}
        </div>
      )}

      {manifest && orderedKeys.length === 0 && (
        <div className="mt-8 text-sm text-slate-500 italic">
          {search ? '没有匹配的相机' : '暂无相机数据'}
        </div>
      )}

      <div className="mt-6 space-y-4">
        {orderedKeys.map((key) => {
          const list = grouped.get(key)!;
          const isUnassigned = key === UNASSIGNED_KEY;
          const cam0 = list[0];
          const reserveCode = isUnassigned ? null : cam0.reserve_code;
          const reserve = reserveCode
            ? reserves.find((r) => r.code === reserveCode)
            : null;
          return (
            <TransectGroup
              key={key}
              transectId={isUnassigned ? '未归属相机' : key}
              reserveName={reserve?.name ?? null}
              reserveCode={reserveCode}
              cameras={list}
              onDetail={(c) => setDetailCamera(c)}
            />
          );
        })}
      </div>

      <CameraDetailModal
        camera={detailCamera}
        reserveColor={
          detailCamera?.reserve_code
            ? reserves.find((r) => r.code === detailCamera.reserve_code)?.color
            : undefined
        }
        reserveName={
          detailCamera?.reserve_code
            ? reserves.find((r) => r.code === detailCamera.reserve_code)?.name ??
              null
            : null
        }
        onClose={() => setDetailCamera(null)}
      />
    </div>
  );
}

function TransectGroup({
  transectId,
  reserveName,
  reserveCode,
  cameras,
  onDetail,
}: {
  transectId: string;
  reserveName: string | null;
  reserveCode: string | null;
  cameras: CameraManifestEntry[];
  onDetail: (c: CameraManifestEntry) => void;
}) {
  return (
    <details
      open
      className="bg-white border border-slate-200 rounded-lg shadow-sm"
    >
      <summary className="cursor-pointer px-5 py-3 flex items-center justify-between hover:bg-slate-50 rounded-t-lg">
        <span className="flex items-center gap-2 text-base font-semibold text-slate-800">
          <span className="inline-block w-3 h-3 rounded-full bg-red-600" />
          样线 {transectId}
          {reserveName && (
            <span className="text-sm text-slate-500 font-normal">
              · {reserveName}
            </span>
          )}
        </span>
        <span className="text-sm text-slate-500">{cameras.length} 台</span>
      </summary>

      <div className="border-t border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wide">
              <th className="text-left px-4 py-2 font-medium">编号</th>
              <th className="text-left px-4 py-2 font-medium">坐标 (E, N)</th>
              <th className="text-right px-4 py-2 font-medium">海拔</th>
              <th className="text-left px-4 py-2 font-medium">小地名</th>
              <th className="text-left px-4 py-2 font-medium">状态</th>
              <th className="text-left px-4 py-2 font-medium">装卡时间</th>
              <th className="text-right px-4 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {cameras.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2 font-medium text-slate-900">{c.id}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-700">
                  {c.lng.toFixed(4)}, {c.lat.toFixed(4)}
                </td>
                <td className="px-4 py-2 text-right text-slate-700">
                  {c.elevation_m != null ? `${c.elevation_m} m` : 'N/A'}
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {formatValue(c.address?.locality)}
                </td>
                <td className="px-4 py-2">
                  <StatusBadge status={c.status ?? null} />
                </td>
                <td className="px-4 py-2 text-slate-700">
                  {formatDeployTime(c.deployed_at)}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {reserveCode && (
                    <Link
                      href={`/?reserve=${reserveCode}&transect=${encodeURIComponent(c.transect_id ?? '')}&camera=${encodeURIComponent(c.id)}`}
                      className="text-emerald-700 hover:underline mr-3"
                    >
                      在地图上查看
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => onDetail(c)}
                    className="text-slate-600 hover:text-emerald-700 underline underline-offset-2"
                  >
                    详情
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const s = (status ?? '').trim();
  if (s === '一切正常') {
    return (
      <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
        {s}
      </span>
    );
  }
  if (s === '未拍摄到影像数据') {
    return (
      <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">
        {s}
      </span>
    );
  }
  if (s) {
    return (
      <span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-700">
        {s}
      </span>
    );
  }
  return <span className="text-xs text-slate-400">N/A</span>;
}
