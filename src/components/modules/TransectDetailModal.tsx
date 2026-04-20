/**
 * 样线详情弹窗。
 *
 * 内容：
 *   - 头部：编号 + 所属保护区（带色块）+ 归属类型 badge
 *   - 基本信息（时间、点数、记录者、起止地名）
 *   - 距离与海拔（里程、min/max、累计上升/下降）
 *   - 海拔剖面图（recharts）
 *   - 起止经纬度
 *   - 折叠的原始 ExtendedData
 *
 * 关闭方式：点击 backdrop / × 按钮 / Esc
 */

'use client';

import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TransectManifestEntry } from '@/types';
import {
  computeElevationProfile,
  formatDateOnly,
  formatDateTime,
  formatDistanceKm,
  formatDuration,
  loadTransectGeoJson,
  type ElevationProfilePoint,
} from '@/lib/transects';

interface TransectDetailModalProps {
  transect: TransectManifestEntry | null;
  reserveColor?: string;       // 头部的色块色（不传就用蓝）
  onClose: () => void;
}

export default function TransectDetailModal({
  transect,
  reserveColor,
  onClose,
}: TransectDetailModalProps) {
  // Esc 关闭
  useEffect(() => {
    if (!transect) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [transect, onClose]);

  // 海拔剖面数据
  const [profile, setProfile] = useState<ElevationProfilePoint[] | null>(null);
  useEffect(() => {
    if (!transect) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    setProfile(null);
    loadTransectGeoJson(transect.geojson_path)
      .then((fc) => {
        if (cancelled) return;
        setProfile(computeElevationProfile(fc));
      })
      .catch((e) => {
        console.warn('[TransectDetailModal] geojson 加载失败：', e);
      });
    return () => {
      cancelled = true;
    };
  }, [transect]);

  if (!transect) return null;

  return (
    <div
      // z 比 Leaflet 默认面板（最高约 700）和 Sidebar(1000) 都高
      className="fixed inset-0 z-[2000] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <Header
          transect={transect}
          reserveColor={reserveColor ?? '#2563eb'}
          onClose={onClose}
        />

        <div className="p-6 space-y-6">
          <BasicInfoCard transect={transect} />
          <DistanceElevationCard transect={transect} />
          <ProfileSection profile={profile} />
          <CoordinatesCard transect={transect} />
          <RawExtraDetails transect={transect} />
        </div>
      </div>
    </div>
  );
}

// === 子组件 ===

function Header({
  transect,
  reserveColor,
  onClose,
}: {
  transect: TransectManifestEntry;
  reserveColor: string;
  onClose: () => void;
}) {
  let badge: { label: string; cls: string };
  if (transect.match_type === 'strict') {
    badge = { label: '核心区样线', cls: 'bg-emerald-100 text-emerald-800' };
  } else if (transect.match_type === 'approximate') {
    badge = {
      label: `近似归属（距边界 ${transect.match_distance_km} km）`,
      cls: 'bg-amber-100 text-amber-800',
    };
  } else {
    badge = { label: '未归属', cls: 'bg-slate-200 text-slate-700' };
  }

  return (
    <div className="px-6 pt-6 pb-4 border-b border-slate-200 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{transect.name}</h2>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          {transect.reserve_name ? (
            <div className="flex items-center gap-1.5 text-sm text-slate-700">
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ backgroundColor: reserveColor }}
              />
              {transect.reserve_name}
            </div>
          ) : (
            <span className="text-sm text-slate-500">未归属保护区</span>
          )}
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}
          >
            {badge.label}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="w-8 h-8 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition shrink-0 -mt-1 -mr-2"
        aria-label="关闭详情"
      >
        <span className="text-2xl leading-none">×</span>
      </button>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}

function BasicInfoCard({ transect }: { transect: TransectManifestEntry }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
        基本信息
      </h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <MetaRow
          label="记录开始"
          value={formatDateTime(transect.start_time)}
        />
        <MetaRow label="记录结束" value={formatDateTime(transect.end_time)} />
        <MetaRow
          label="耗时"
          value={formatDuration(transect.duration_seconds)}
        />
        <MetaRow label="轨迹点数" value={transect.point_count.toLocaleString()} />
        <MetaRow
          label="记录者"
          value={transect.extra.creator || '—'}
        />
        <MetaRow
          label="标签"
          value={transect.extra.track_tags || '—'}
        />
        <MetaRow
          label="起点名称"
          value={transect.extra.pos_start_name || '—'}
        />
        <MetaRow
          label="终点名称"
          value={transect.extra.pos_end_name || '—'}
        />
      </div>
    </section>
  );
}

function DistanceElevationCard({
  transect,
}: {
  transect: TransectManifestEntry;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
        距离与海拔
      </h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <MetaRow label="里程" value={formatDistanceKm(transect.distance_meters)} />
        <MetaRow
          label="海拔范围"
          value={
            transect.elevation_min != null && transect.elevation_max != null
              ? `${transect.elevation_min.toFixed(0)} ~ ${transect.elevation_max.toFixed(0)} m`
              : '—'
          }
        />
        <MetaRow
          label="累计上升"
          value={`${transect.elevation_gain.toFixed(0)} m`}
        />
        <MetaRow
          label="累计下降"
          value={`${transect.elevation_loss.toFixed(0)} m`}
        />
      </div>
    </section>
  );
}

function ProfileSection({
  profile,
}: {
  profile: ElevationProfilePoint[] | null;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
        海拔剖面
      </h3>
      {profile === null && (
        <div className="h-[260px] bg-slate-100 rounded animate-pulse" />
      )}
      {profile && profile.length === 0 && (
        <div className="text-xs text-slate-500 italic">无可用坐标点</div>
      )}
      {profile && profile.length > 0 && (
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={profile}
              margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
            >
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis
                dataKey="distance_m"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}`}
                tick={{ fill: '#64748b', fontSize: 12 }}
                label={{
                  value: '距离 (km)',
                  position: 'insideBottom',
                  offset: -2,
                  style: { fill: '#64748b', fontSize: 12 },
                }}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fill: '#64748b', fontSize: 12 }}
                label={{
                  value: '海拔 (m)',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fill: '#64748b', fontSize: 12 },
                }}
                width={60}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as ElevationProfilePoint;
                  return (
                    <div className="bg-white border border-slate-200 rounded shadow px-3 py-2 text-xs">
                      <div>距离 {(p.distance_m / 1000).toFixed(2)} km</div>
                      <div>海拔 {p.elevation_m.toFixed(0)} m</div>
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="elevation_m"
                stroke="#dc2626"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function CoordinatesCard({ transect }: { transect: TransectManifestEntry }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
        起止坐标（WGS84）
      </h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 font-mono text-xs">
        <MetaRow
          label="起点"
          value={
            transect.start_point
              ? `${transect.start_point.lng.toFixed(6)}, ${transect.start_point.lat.toFixed(6)}`
              : '—'
          }
        />
        <MetaRow
          label="终点"
          value={
            transect.end_point
              ? `${transect.end_point.lng.toFixed(6)}, ${transect.end_point.lat.toFixed(6)}`
              : '—'
          }
        />
      </div>
      <div className="text-xs text-slate-500 mt-2">
        采集日期：{formatDateOnly(transect.start_time)}
      </div>
    </section>
  );
}

function RawExtraDetails({
  transect,
}: {
  transect: TransectManifestEntry;
}) {
  return (
    <details className="border border-slate-200 rounded-md">
      <summary className="px-4 py-2 text-sm text-slate-600 cursor-pointer hover:bg-slate-50">
        原始元数据
      </summary>
      <pre className="px-4 py-3 text-xs text-slate-700 bg-slate-50 overflow-x-auto">
{JSON.stringify(transect.extra, null, 2)}
      </pre>
    </details>
  );
}
