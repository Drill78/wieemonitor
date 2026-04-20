/**
 * 路由 /reserves ：保护区一览（46 个）。
 *
 * - 顶部统计：总数 / 国家级 / 省级 / 其他
 * - 按级别分 3 个分组卡片
 * - 每行：短名 / 全名 / 总面积 / 三区面积 / 「在地图上查看」
 * - 「查看」→ /?reserve={code}（主页 URL 参数会自动选中）
 *
 * Header 已由 layout.tsx 全局渲染，本页不再写。
 * Header 顶栏暂未加"保护区"导航按钮（避免拥挤），用户可手动访问 /reserves。
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { loadReserves } from '@/lib/reserves';
import type { ReserveLevel, ReserveRegistryEntry } from '@/types';

const LEVEL_LABEL: Record<ReserveLevel, string> = {
  national: '国家级',
  provincial: '省级',
  other: '其他',
};

const LEVEL_BADGE: Record<ReserveLevel, string> = {
  national: 'bg-emerald-100 text-emerald-800',
  provincial: 'bg-blue-100 text-blue-800',
  other: 'bg-slate-200 text-slate-700',
};

const ZONE_DOT: Record<'core' | 'buffer' | 'experimental', string> = {
  core: '#1e40af',
  buffer: '#3b82f6',
  experimental: '#93c5fd',
};

export default function ReservesPage() {
  const [reserves, setReserves] = useState<ReserveRegistryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadReserves()
      .then((list) => setReserves(list))
      .catch((e) => setError(String(e)));
  }, []);

  const filtered = useMemo(() => {
    if (!reserves) return [];
    const q = search.trim().toLowerCase();
    if (!q) return reserves;
    return reserves.filter((r) => {
      return (
        r.code.toLowerCase().includes(q) ||
        r.name_full.toLowerCase().includes(q) ||
        r.name_short.toLowerCase().includes(q) ||
        (r.legacy_code ?? '').toLowerCase().includes(q)
      );
    });
  }, [reserves, search]);

  const grouped = useMemo(() => {
    const map: Record<ReserveLevel, ReserveRegistryEntry[]> = {
      national: [],
      provincial: [],
      other: [],
    };
    for (const r of filtered) map[r.level].push(r);
    return map;
  }, [filtered]);

  const stats = useMemo(() => {
    if (!reserves) return null;
    return {
      total: reserves.length,
      national: reserves.filter((r) => r.level === 'national').length,
      provincial: reserves.filter((r) => r.level === 'provincial').length,
      other: reserves.filter((r) => r.level === 'other').length,
    };
  }, [reserves]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between gap-4 mb-2 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">保护区一览</h1>
          {stats && (
            <p className="text-sm text-slate-500 mt-1">
              共 <strong className="text-slate-700">{stats.total}</strong> 个 ·
              国家级 {stats.national} · 省级 {stats.provincial} · 其他 {stats.other}
            </p>
          )}
          <p className="text-xs text-slate-500 mt-1">
            数据来源：山西省官方 shapefile（CGCS2000，按 WGS84 处理）
          </p>
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="按名称 / 编码搜索"
          className="border border-slate-300 rounded-md px-3 py-1.5 text-sm w-56 focus:outline-none focus:border-emerald-500"
        />
      </div>

      {!reserves && !error && (
        <div className="mt-8 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      )}
      {error && (
        <div className="mt-8 text-sm text-rose-600">加载失败：{error}</div>
      )}

      {reserves && (
        <div className="mt-6 space-y-4">
          {(['national', 'provincial', 'other'] as ReserveLevel[]).map((lv) => {
            const list = grouped[lv];
            if (list.length === 0) return null;
            return (
              <LevelGroup key={lv} level={lv} reserves={list} />
            );
          })}
          {filtered.length === 0 && (
            <div className="text-sm text-slate-500 italic">
              {search ? '没有匹配的保护区' : '暂无保护区数据'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LevelGroup({
  level,
  reserves,
}: {
  level: ReserveLevel;
  reserves: ReserveRegistryEntry[];
}) {
  return (
    <details
      open
      className="bg-white border border-slate-200 rounded-lg shadow-sm"
    >
      <summary className="cursor-pointer px-5 py-3 flex items-center justify-between hover:bg-slate-50 rounded-t-lg">
        <span className="flex items-center gap-2 text-base font-semibold text-slate-800">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEVEL_BADGE[level]}`}
          >
            {LEVEL_LABEL[level]}
          </span>
        </span>
        <span className="text-sm text-slate-500">{reserves.length} 个</span>
      </summary>

      <div className="border-t border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wide">
              <th className="text-left px-4 py-2 font-medium">编码</th>
              <th className="text-left px-4 py-2 font-medium">名称</th>
              <th className="text-right px-4 py-2 font-medium">总面积</th>
              <th className="text-right px-4 py-2 font-medium">核心区</th>
              <th className="text-right px-4 py-2 font-medium">缓冲区</th>
              <th className="text-right px-4 py-2 font-medium">实验区</th>
              <th className="text-right px-4 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {reserves.map((r) => {
              const z = r.zones;
              return (
                <tr
                  key={r.code}
                  className="border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-4 py-2 font-mono text-xs text-slate-700">
                    <div>{r.code}</div>
                    {r.legacy_code && (
                      <div className="text-[10px] text-slate-400">
                        旧 {r.legacy_code}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-900">
                      {r.name_short}
                    </div>
                    <div className="text-xs text-slate-500">{r.name_full}</div>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-slate-700">
                    {r.area_km2_total != null
                      ? `${r.area_km2_total.toFixed(1)} km²`
                      : '—'}
                  </td>
                  <ZoneCell km2={z.core?.area_km2 ?? null} dot={ZONE_DOT.core} />
                  <ZoneCell km2={z.buffer?.area_km2 ?? null} dot={ZONE_DOT.buffer} />
                  <ZoneCell
                    km2={z.experimental?.area_km2 ?? null}
                    dot={ZONE_DOT.experimental}
                  />
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <Link
                      href={`/?reserve=${r.code}`}
                      className="text-emerald-700 hover:underline"
                    >
                      在地图上查看
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function ZoneCell({ km2, dot }: { km2: number | null; dot: string }) {
  return (
    <td className="px-4 py-2 text-right">
      {km2 != null ? (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-700">
          <span
            className="inline-block w-2 h-2 rounded-sm"
            style={{ backgroundColor: dot }}
          />
          {km2.toFixed(1)}
        </span>
      ) : (
        <span className="text-xs text-slate-300">—</span>
      )}
    </td>
  );
}
