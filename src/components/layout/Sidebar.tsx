/**
 * 右侧滑出式 Sidebar。
 *
 * 阶段 1.4：保护区改用官方 shapefile（46 个），类型用 ReserveRegistryEntry。
 *           头部显示：name_full + 级别 badge + 三区面积 + 总面积。
 *
 * - selectedReserve 为 null 时（点空地图/关闭）显示「地图设置」面板
 * - 选中保护区后显示其详情 + 4 个数据模块卡片
 */

'use client';

import { useEffect, useState } from 'react';
import type {
  CameraManifestEntry,
  ReserveLevel,
  ReserveRegistryEntry,
  TransectManifestEntry,
} from '@/types';
import {
  getTransectsByReserve,
  formatDistanceKm,
  formatDuration,
  formatDateOnly,
} from '@/lib/transects';
import { getCamerasByReserve, getCamerasByTransect } from '@/lib/cameras';

// 保护区主题色（蓝色），用于 sidebar 列表项的"选中"高亮
const RESERVE_TINT = '#3b82f6';

export type DisplayMode = 'zones' | 'merged';

interface SidebarProps {
  reserve: ReserveRegistryEntry | null;
  selectedTransectId: string | null;
  onTransectSelect: (transect: TransectManifestEntry | null) => void;
  onDetailClick: (transect: TransectManifestEntry) => void;
  onClose: () => void;
  // 地图设置（reserve 为 null 时显示设置面板）
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  levelFilter: Record<ReserveLevel, boolean>;
  onLevelFilterChange: (level: ReserveLevel, enabled: boolean) => void;
}

const otherModules = [
  { title: '生物信息', stage: 4, hint: 'DNA 测序样本与鉴定结果' },
  { title: '声音数据', stage: 4, hint: '声学采样的音频与元数据' },
];

const LEVEL_BADGE: Record<ReserveLevel, { label: string; cls: string }> = {
  national: { label: '国家级', cls: 'bg-emerald-100 text-emerald-800' },
  provincial: { label: '省级', cls: 'bg-blue-100 text-blue-800' },
  other: { label: '其他', cls: 'bg-slate-200 text-slate-700' },
};

export default function Sidebar({
  reserve,
  selectedTransectId,
  onTransectSelect,
  onDetailClick,
  onClose,
  displayMode,
  onDisplayModeChange,
  levelFilter,
  onLevelFilterChange,
}: SidebarProps) {
  // 当没有选中保护区时，显示一个**常驻**的"地图设置"面板（不滑出）
  // 选中保护区后才滑入。
  const isOpen = reserve !== null;

  return (
    <>
      {/* 地图设置面板（左下角小卡片，selectedReserve === null 时显示） */}
      {!isOpen && (
        <MapSettingsPanel
          displayMode={displayMode}
          onDisplayModeChange={onDisplayModeChange}
          levelFilter={levelFilter}
          onLevelFilterChange={onLevelFilterChange}
        />
      )}

      <aside
        className={`absolute top-0 right-0 h-full w-[400px] bg-white shadow-2xl z-[1000] overflow-y-auto transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!isOpen}
      >
        {reserve && (
          <div className="p-6">
            <ReserveHeader reserve={reserve} onClose={onClose} />
            <ZonesAreaTable reserve={reserve} />
            <p className="text-xs text-slate-500 mt-4 mb-6">
              边界数据来源：山西省官方 shapefile（CGCS2000，按 WGS84 处理），含核心区/缓冲区/实验区。
            </p>

            <div className="space-y-3">
              <TransectsSection
                reserve={reserve}
                selectedTransectId={selectedTransectId}
                onTransectSelect={onTransectSelect}
                onDetailClick={onDetailClick}
              />

              <CamerasSection
                reserve={reserve}
                selectedTransectId={selectedTransectId}
              />

              {otherModules.map((m) => (
                <div
                  key={m.title}
                  className="border border-slate-200 rounded-lg p-4 bg-slate-50/60"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-800">
                      {m.title}
                    </span>
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
    </>
  );
}

// === 保护区头部 ===

function ReserveHeader({
  reserve,
  onClose,
}: {
  reserve: ReserveRegistryEntry;
  onClose: () => void;
}) {
  const badge = LEVEL_BADGE[reserve.level];
  return (
    <>
      <div className="flex items-start justify-between gap-3 mb-2">
        <h2 className="text-xl font-bold text-slate-900 leading-tight">
          {reserve.name_full}
        </h2>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition shrink-0 -mt-1 -mr-2"
          aria-label="关闭侧边栏"
        >
          <span className="text-2xl leading-none">×</span>
        </button>
      </div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}
        >
          {badge.label}
        </span>
        <span className="text-xs text-slate-500">编码 {reserve.code}</span>
        {reserve.legacy_code && (
          <span className="text-xs text-slate-400">
            （旧 {reserve.legacy_code}）
          </span>
        )}
      </div>
    </>
  );
}

function ZonesAreaTable({ reserve }: { reserve: ReserveRegistryEntry }) {
  const z = reserve.zones;
  const rows: { label: string; km2: number | null; color: string }[] = [
    { label: '核心区', km2: z.core?.area_km2 ?? null, color: '#1e40af' },
    { label: '缓冲区', km2: z.buffer?.area_km2 ?? null, color: '#3b82f6' },
    { label: '实验区', km2: z.experimental?.area_km2 ?? null, color: '#93c5fd' },
  ];
  return (
    <div className="bg-slate-50/60 border border-slate-200 rounded-md p-3">
      <div className="text-xs text-slate-500 mb-2">面积分区</div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-slate-700">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ backgroundColor: r.color }}
              />
              {r.label}
            </span>
            <span className="font-mono text-slate-900">
              {r.km2 != null ? `${r.km2.toFixed(1)} km²` : '—'}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between text-sm pt-1 mt-1 border-t border-slate-200">
          <span className="text-slate-700 font-medium">合计</span>
          <span className="font-mono font-semibold text-slate-900">
            {reserve.area_km2_total != null
              ? `${reserve.area_km2_total.toFixed(1)} km²`
              : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

// === 「样线数据」卡片 ===

function TransectsSection({
  reserve,
  selectedTransectId,
  onTransectSelect,
  onDetailClick,
}: {
  reserve: ReserveRegistryEntry;
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

      {error && <div className="text-xs text-rose-600">加载失败：{error}</div>}

      {transects && transects.length === 0 && (
        <div className="text-xs text-slate-400 italic">该保护区暂无样线数据</div>
      )}

      {transects && transects.length > 0 && (
        <ul className="space-y-2">
          {transects.map((t) => (
            <TransectListItem
              key={t.id}
              transect={t}
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
  selected,
  onSelect,
  onDetailClick,
}: {
  transect: TransectManifestEntry;
  selected: boolean;
  onSelect: () => void;
  onDetailClick: () => void;
}) {
  const handleDetailsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onDetailClick();
  };

  const selectedStyle: React.CSSProperties = selected
    ? {
        borderLeftColor: RESERVE_TINT,
        backgroundColor: `${RESERVE_TINT}1A`, // 10% alpha
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
            {formatDateOnly(transect.start_time)} ·{' '}
            {formatDuration(transect.duration_seconds)}
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

// === 「红外相机」卡片 ===

function CamerasSection({
  reserve,
  selectedTransectId,
}: {
  reserve: ReserveRegistryEntry;
  selectedTransectId: string | null;
}) {
  const [reserveCount, setReserveCount] = useState<number | null>(null);
  const [transectCount, setTransectCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReserveCount(null);
    setError(null);
    getCamerasByReserve(reserve.code)
      .then((list: CameraManifestEntry[]) => {
        if (!cancelled) setReserveCount(list.length);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [reserve.code]);

  useEffect(() => {
    if (!selectedTransectId) {
      setTransectCount(null);
      return;
    }
    let cancelled = false;
    getCamerasByTransect(selectedTransectId)
      .then((list) => {
        if (!cancelled) setTransectCount(list.length);
      })
      .catch(() => {
        if (!cancelled) setTransectCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTransectId]);

  return (
    <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/60">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-slate-800">红外相机</span>
        <span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-600">
          阶段 2
        </span>
      </div>

      {error && <div className="text-xs text-rose-600">加载失败：{error}</div>}

      {!error && (
        <>
          {selectedTransectId == null ? (
            <div className="text-sm text-slate-700">
              {reserveCount == null
                ? '加载中…'
                : reserveCount === 0
                  ? '该保护区暂无相机数据'
                  : `本保护区共 ${reserveCount} 台相机`}
            </div>
          ) : (
            <div className="text-sm text-slate-700">
              {transectCount == null
                ? '加载中…'
                : transectCount === 0
                  ? `${selectedTransectId} 上暂无相机`
                  : `${selectedTransectId} 上 ${transectCount} 台相机`}
            </div>
          )}

          <div className="text-xs text-slate-500 mt-2">
            点击地图上的 📷 图标查看相机详情
          </div>
        </>
      )}
    </div>
  );
}

// === 地图设置面板（左下角浮窗，未选中保护区时显示） ===

function MapSettingsPanel({
  displayMode,
  onDisplayModeChange,
  levelFilter,
  onLevelFilterChange,
}: {
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  levelFilter: Record<ReserveLevel, boolean>;
  onLevelFilterChange: (level: ReserveLevel, enabled: boolean) => void;
}) {
  return (
    <div
      className="absolute z-[900] left-4 bottom-12 bg-white/95 backdrop-blur rounded-lg shadow-md border border-slate-200 p-3 text-sm w-56"
      // 给比例尺留点空间
    >
      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
        显示模式
      </div>
      <div className="flex flex-col gap-1 mb-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="displayMode"
            checked={displayMode === 'zones'}
            onChange={() => onDisplayModeChange('zones')}
            className="accent-emerald-700"
          />
          <span>三区分层</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="displayMode"
            checked={displayMode === 'merged'}
            onChange={() => onDisplayModeChange('merged')}
            className="accent-emerald-700"
          />
          <span>合并显示</span>
        </label>
      </div>

      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
        级别筛选
      </div>
      <div className="flex flex-col gap-1">
        {(['national', 'provincial', 'other'] as ReserveLevel[]).map((lv) => (
          <label key={lv} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={levelFilter[lv]}
              onChange={(e) => onLevelFilterChange(lv, e.target.checked)}
              className="accent-emerald-700"
            />
            <span>
              <span
                className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${LEVEL_BADGE[lv].cls} mr-1`}
              >
                {LEVEL_BADGE[lv].label}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
