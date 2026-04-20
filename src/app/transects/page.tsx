/**
 * 路由 /transects ：样线数据列表页（真实数据）。
 *
 * - 加载 transects-manifest.json
 * - 按 reserve_code 分组（未归属归到末尾"未归属"组）
 * - 顶部统计：总数 / 严格归属 / 近似归属 / 未归属
 * - 搜索框：按 id（不区分大小写）
 * - 每个分组卡片可折叠（默认展开）
 * - 「查看」→ 跳到主页 /?reserve=...&transect=...，主页读 URL 参数自动选中
 * - 「详情」→ 弹 TransectDetailModal
 *
 * Header 已由 layout.tsx 全局渲染，本页不再写。
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import TransectDetailModal from '@/components/modules/TransectDetailModal';
import { reserves } from '@/data/mock/reserves';
import {
  formatDateOnly,
  formatDistanceKm,
  formatDuration,
  loadTransectManifest,
} from '@/lib/transects';
import type { TransectManifestEntry } from '@/types';

const UNASSIGNED_KEY = '__unassigned__';

export default function TransectsPage() {
  const [manifest, setManifest] = useState<TransectManifestEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [detailTransect, setDetailTransect] =
    useState<TransectManifestEntry | null>(null);

  useEffect(() => {
    loadTransectManifest()
      .then((list) => setManifest(list))
      .catch((e) => setError(String(e)));
  }, []);

  const filtered = useMemo(() => {
    if (!manifest) return [];
    const q = search.trim().toLowerCase();
    if (!q) return manifest;
    return manifest.filter((t) => t.id.toLowerCase().includes(q));
  }, [manifest, search]);

  // 分组：reserve_code → list；未归属归到 UNASSIGNED_KEY
  const grouped = useMemo(() => {
    const map = new Map<string, TransectManifestEntry[]>();
    for (const t of filtered) {
      const key = t.reserve_code ?? UNASSIGNED_KEY;
      const arr = map.get(key);
      if (arr) arr.push(t);
      else map.set(key, [t]);
    }
    return map;
  }, [filtered]);

  // 排序：先按 reserves 数组顺序，最后是未归属
  const orderedKeys = useMemo(() => {
    const keys: string[] = [];
    for (const r of reserves) {
      if (grouped.has(r.code)) keys.push(r.code);
    }
    if (grouped.has(UNASSIGNED_KEY)) keys.push(UNASSIGNED_KEY);
    return keys;
  }, [grouped]);

  // 顶部统计基于完整 manifest（不受搜索影响），让用户能看到全局口径
  const stats = useMemo(() => {
    if (!manifest) return null;
    let strict = 0, approx = 0, unassigned = 0;
    for (const t of manifest) {
      if (t.match_type === 'strict') strict++;
      else if (t.match_type === 'approximate') approx++;
      else unassigned++;
    }
    return { total: manifest.length, strict, approx, unassigned };
  }, [manifest]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between gap-4 mb-2 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">样线数据列表</h1>
          {stats && (
            <p className="text-sm text-slate-500 mt-1">
              共 <strong className="text-slate-700">{stats.total}</strong> 条 ·
              严格归属 {stats.strict} · 近似归属 {stats.approx} · 未归属{' '}
              {stats.unassigned}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="按编号搜索（如 LS-20）"
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm w-56 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* 加载/错误状态 */}
      {!manifest && !error && (
        <div className="mt-8 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      )}
      {error && (
        <div className="mt-8 text-sm text-rose-600">
          加载样线 manifest 失败：{error}
        </div>
      )}

      {/* 分组列表 */}
      {manifest && orderedKeys.length === 0 && (
        <div className="mt-8 text-sm text-slate-500 italic">
          {search ? '没有匹配的样线' : '暂无样线数据'}
        </div>
      )}

      <div className="mt-6 space-y-4">
        {orderedKeys.map((key) => {
          const list = grouped.get(key)!;
          const reserve = reserves.find((r) => r.code === key);
          const groupName =
            key === UNASSIGNED_KEY ? '未归属样线' : reserve?.name ?? key;
          const colorDot = reserve?.color ?? '#94a3b8';
          return (
            <ReserveGroup
              key={key}
              groupName={groupName}
              colorDot={colorDot}
              transects={list}
              reserveCode={key === UNASSIGNED_KEY ? null : key}
              onDetail={(t) => setDetailTransect(t)}
            />
          );
        })}
      </div>

      <TransectDetailModal
        transect={detailTransect}
        reserveColor={
          detailTransect?.reserve_code
            ? reserves.find((r) => r.code === detailTransect.reserve_code)?.color
            : undefined
        }
        onClose={() => setDetailTransect(null)}
      />
    </div>
  );
}

function ReserveGroup({
  groupName,
  colorDot,
  transects,
  reserveCode,
  onDetail,
}: {
  groupName: string;
  colorDot: string;
  transects: TransectManifestEntry[];
  reserveCode: string | null;
  onDetail: (t: TransectManifestEntry) => void;
}) {
  return (
    <details
      open
      className="bg-white border border-slate-200 rounded-lg shadow-sm"
    >
      <summary className="cursor-pointer px-5 py-3 flex items-center justify-between hover:bg-slate-50 rounded-t-lg">
        <span className="flex items-center gap-2 text-base font-semibold text-slate-800">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ backgroundColor: colorDot }}
          />
          {groupName}
        </span>
        <span className="text-sm text-slate-500">{transects.length} 条</span>
      </summary>

      <div className="border-t border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wide">
              <th className="text-left px-4 py-2 font-medium">编号</th>
              <th className="text-left px-4 py-2 font-medium">日期</th>
              <th className="text-right px-4 py-2 font-medium">里程</th>
              <th className="text-right px-4 py-2 font-medium">耗时</th>
              <th className="text-left px-4 py-2 font-medium">起点名称</th>
              <th className="text-left px-4 py-2 font-medium">归属</th>
              <th className="text-right px-4 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {transects.map((t) => (
              <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2 font-medium text-slate-900">{t.id}</td>
                <td className="px-4 py-2 text-slate-700">
                  {formatDateOnly(t.start_time)}
                </td>
                <td className="px-4 py-2 text-right text-slate-700">
                  {formatDistanceKm(t.distance_meters)}
                </td>
                <td className="px-4 py-2 text-right text-slate-700">
                  {formatDuration(t.duration_seconds)}
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {t.extra.pos_start_name || '—'}
                </td>
                <td className="px-4 py-2">
                  <MatchBadge t={t} />
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {reserveCode && (
                    <Link
                      href={`/?reserve=${reserveCode}&transect=${encodeURIComponent(t.id)}`}
                      className="text-emerald-700 hover:underline mr-3"
                    >
                      查看
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => onDetail(t)}
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

function MatchBadge({ t }: { t: TransectManifestEntry }) {
  if (t.match_type === 'strict') {
    return (
      <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
        严格
      </span>
    );
  }
  if (t.match_type === 'approximate') {
    return (
      <span
        className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800"
        title={`距边界 ${t.match_distance_km} km`}
      >
        近似 ~{t.match_distance_km}km
      </span>
    );
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-700">
      未归属
    </span>
  );
}
