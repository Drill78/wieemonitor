/**
 * 右侧滑出式 Sidebar。
 * 当用户在地图上点击保护区后，由 page.tsx 传入 reserve 数据，从右侧滑入显示。
 *
 * 阶段 1.1：「样线数据」卡片改为真实样线列表（从 manifest 拉取）。
 *           其它 3 个模块仍是占位卡片。
 */

'use client';

import { useEffect, useState } from 'react';
import type { Reserve, TransectManifestEntry } from '@/types';
import {
  getTransectsByReserve,
  formatDistanceKm,
  formatDuration,
  formatDateOnly,
} from '@/lib/transects';

interface SidebarProps {
  reserve: Reserve | null;
  selectedTransectId: string | null;
  onTransectSelect: (transect: TransectManifestEntry | null) => void;
  onDetailClick: (transect: TransectManifestEntry) => void;
  onClose: () => void;
}

// 其余 3 个模块占位 —— 对应 ROADMAP 的阶段编号
const otherModules = [
  { title: '红外相机', stage: 2, hint: '相机部署点位 + 拍摄到的照片' },
  { title: '生物信息', stage: 4, hint: 'DNA 测序样本与鉴定结果' },
  { title: '声音数据', stage: 4, hint: '声学采样的音频与元数据' },
];

export default function Sidebar({
  reserve,
  selectedTransectId,
  onTransectSelect,
  onDetailClick,
  onClose,
}: SidebarProps) {
  const isOpen = reserve !== null;

  return (
    <aside
      // z-[1000] 高于 Leaflet 的默认 pane（200~700），保证浮在地图上方
      className={`absolute top-0 right-0 h-full w-[400px] bg-white shadow-2xl z-[1000] overflow-y-auto transform transition-transform duration-300 ease-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
      aria-hidden={!isOpen}
    >
      {reserve && (
        <div className="p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <h2 className="text-xl font-bold text-slate-900 leading-tight">
              {reserve.name}
            </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition shrink-0 -mt-1 -mr-2"
              aria-label="关闭侧边栏"
            >
              <span className="text-2xl leading-none">×</span>
            </button>
          </div>

          <div className="text-xs text-slate-500 mb-3 flex gap-3">
            <span>编码：{reserve.code}</span>
            <span>省份：{reserve.province}</span>
          </div>

          <p className="text-sm text-slate-700 leading-relaxed mb-2">
            {reserve.description}
          </p>

          <p className="text-xs text-slate-500 mb-6">
            {reserve.geojson_path
              ? '边界数据来源：OpenStreetMap。部分保护区可能仅含核心区与缓冲区，面积小于官方公开数据。'
              : '边界数据：占位圆，待补充官方 shapefile。'}
          </p>

          <div className="space-y-3">
            <TransectsSection
              reserve={reserve}
              selectedTransectId={selectedTransectId}
              onTransectSelect={onTransectSelect}
              onDetailClick={onDetailClick}
            />

            {otherModules.map((m) => (
              <div
                key={m.title}
                className="border border-slate-200 rounded-lg p-4 bg-slate-50/60"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-800">{m.title}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-600">
                    阶段 {m.stage}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mb-2">{m.hint}</div>
                <div className="text-xs text-slate-400 italic">
                  模块开发中（阶段 {m.stage}）
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

// === 「样线数据」卡片 ===

function TransectsSection({
  reserve,
  selectedTransectId,
  onTransectSelect,
  onDetailClick,
}: {
  reserve: Reserve;
  selectedTransectId: string | null;
  onTransectSelect: (transect: TransectManifestEntry | null) => void;
  onDetailClick: (transect: TransectManifestEntry) => void;
}) {
  const [transects, setTransects] = useState<TransectManifestEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTransects(null);
    setError(null);
    getTransectsByReserve(reserve.code)
      .then((list) => {
        if (!cancelled) setTransects(list);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [reserve.code]);

  return (
    <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/60">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-slate-800">样线数据</span>
        <span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-600">
          阶段 1
        </span>
      </div>

      {transects === null && !error && (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="text-xs text-rose-600">加载失败：{error}</div>
      )}

      {transects && transects.length === 0 && (
        <div className="text-xs text-slate-400 italic">
          该保护区暂无样线数据
        </div>
      )}

      {transects && transects.length > 0 && (
        <ul className="space-y-2">
          {transects.map((t) => (
            <TransectListItem
              key={t.id}
              transect={t}
              reserveColor={reserve.color}
              selected={t.id === selectedTransectId}
              onSelect={() =>
                onTransectSelect(t.id === selectedTransectId ? null : t)
              }
              onDetailClick={() => onDetailClick(t)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TransectListItem({
  transect,
  reserveColor,
  selected,
  onSelect,
  onDetailClick,
}: {
  transect: TransectManifestEntry;
  reserveColor: string;
  selected: boolean;
  onSelect: () => void;
  onDetailClick: () => void;
}) {
  const handleDetailsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onDetailClick();
  };

  // 选中态：左边 3px 同色边 + 浅同色底
  const selectedStyle: React.CSSProperties = selected
    ? {
        borderLeftColor: reserveColor,
        backgroundColor: `${reserveColor}1A`, // hex + 1A ≈ 10% alpha
      }
    : {};

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        style={selectedStyle}
        className={`w-full text-left rounded-md border-l-[3px] border-l-transparent border border-slate-200 px-3 py-2 hover:bg-slate-100 transition ${
          selected ? 'border border-slate-300' : ''
        }`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <div className="font-semibold text-slate-900">{transect.name}</div>
          <div className="text-sm text-slate-700">
            {formatDistanceKm(transect.distance_meters)}
          </div>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            {formatDateOnly(transect.start_time)} · {formatDuration(transect.duration_seconds)}
          </span>
          <span className="flex items-center gap-2">
            {transect.match_type === 'approximate' && (
              <span
                className="text-amber-600"
                title={`近似归属，距边界 ${transect.match_distance_km} km`}
              >
                ~{transect.match_distance_km}km
              </span>
            )}
            <span
              className="text-slate-400 hover:text-emerald-700 underline underline-offset-2"
              onClick={handleDetailsClick}
            >
              详情
            </span>
          </span>
        </div>
      </button>
    </li>
  );
}
