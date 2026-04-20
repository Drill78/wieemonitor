/**
 * 相机详情弹窗。
 *
 * 内容：
 *   - 头部：相机 id + 所属样线 + 保护区 + 状态 badge
 *   - 位置信息（行政区/小地名/坐标/海拔/坡度坡位坡向）
 *   - 植被环境
 *   - 设备参数
 *   - 部署记录（含部署天数）
 *   - 图像数据占位（照片/视频，未来阶段导入）
 *   - 折叠原始 JSON
 *
 * 关闭：backdrop / × / Esc
 */

'use client';

import { useEffect } from 'react';
import type { CameraManifestEntry } from '@/types';
import {
  daysBetween,
  formatAddress,
  formatDeployTime,
  formatValue,
} from '@/lib/cameras';

interface CameraDetailModalProps {
  camera: CameraManifestEntry | null;
  reserveColor?: string;
  reserveName?: string | null;
  onClose: () => void;
}

export default function CameraDetailModal({
  camera,
  reserveColor,
  reserveName,
  onClose,
}: CameraDetailModalProps) {
  useEffect(() => {
    if (!camera) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [camera, onClose]);

  if (!camera) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <Header
          camera={camera}
          reserveColor={reserveColor ?? '#2563eb'}
          reserveName={reserveName}
          onClose={onClose}
        />

        <div className="p-6 space-y-6">
          <PositionCard camera={camera} />
          <VegetationCard camera={camera} />
          <DeviceCard camera={camera} />
          <DeploymentCard camera={camera} />
          <ImagePlaceholderCard />
          <RawDetails camera={camera} />
        </div>
      </div>
    </div>
  );
}

// === 头部 ===

function Header({
  camera,
  reserveColor,
  reserveName,
  onClose,
}: {
  camera: CameraManifestEntry;
  reserveColor: string;
  reserveName?: string | null;
  onClose: () => void;
}) {
  // 状态 badge 颜色
  let statusBadge: { label: string; cls: string };
  const status = camera.status?.trim() ?? '';
  if (status === '一切正常') {
    statusBadge = { label: status, cls: 'bg-emerald-100 text-emerald-800' };
  } else if (status === '未拍摄到影像数据') {
    statusBadge = { label: status, cls: 'bg-amber-100 text-amber-800' };
  } else if (status) {
    statusBadge = { label: status, cls: 'bg-slate-200 text-slate-700' };
  } else {
    statusBadge = { label: '状态未填', cls: 'bg-slate-100 text-slate-500' };
  }

  // 归属说明
  let matchDesc: string;
  if (camera.match_type === 'by_grid_id') matchDesc = '网格编号匹配';
  else if (camera.match_type === 'by_proximity')
    matchDesc = `就近匹配（距样线 ${camera.match_distance_m ?? '?'}m）`;
  else matchDesc = '未归属';

  return (
    <div className="px-6 pt-6 pb-4 border-b border-slate-200 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-2xl font-bold text-slate-900">{camera.id}</h2>
        <div className="mt-1 flex items-center gap-3 flex-wrap text-sm">
          <span className="inline-flex items-center gap-1.5 text-slate-700">
            <span className="inline-block w-3 h-3 rounded-full bg-red-600" />
            {camera.transect_id ?? '未归属样线'}
            <span className="text-slate-400 text-xs">（{matchDesc}）</span>
          </span>
          {reserveName && (
            <span className="inline-flex items-center gap-1.5 text-slate-700">
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ backgroundColor: reserveColor }}
              />
              {reserveName}
            </span>
          )}
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge.cls}`}
          >
            {statusBadge.label}
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

// === 通用 Row ===

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm text-slate-900 mt-0.5 break-words">{value}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
      {children}
    </h3>
  );
}

// === 位置 ===

function PositionCard({ camera }: { camera: CameraManifestEntry }) {
  const addr = formatAddress(camera.address) ?? 'N/A';
  return (
    <section>
      <SectionTitle>位置信息</SectionTitle>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <Row label="行政区" value={addr} />
        <Row label="小地名" value={formatValue(camera.address?.locality)} />
        <Row
          label="坐标 (WGS84)"
          value={
            <span className="font-mono">
              E {camera.lng.toFixed(6)}, N {camera.lat.toFixed(6)}
            </span>
          }
        />
        <Row
          label="海拔"
          value={
            camera.elevation_m != null ? `${camera.elevation_m} m` : 'N/A'
          }
        />
        <Row label="坡度" value={formatValue(camera.slope)} />
        <Row label="坡位" value={formatValue(camera.slope_position)} />
        <Row label="坡向" value={formatValue(camera.aspect)} />
        <Row label="村民小组" value={formatValue(camera.address?.group)} />
      </div>
    </section>
  );
}

// === 植被 ===

function VegetationCard({ camera }: { camera: CameraManifestEntry }) {
  return (
    <section>
      <SectionTitle>植被环境</SectionTitle>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <Row label="植被类型" value={formatValue(camera.vegetation)} />
        <Row label="主要树种" value={formatValue(camera.dominant_species)} />
        <Row
          label="盖度"
          value={
            camera.coverage_pct != null && camera.coverage_pct !== ''
              ? `${camera.coverage_pct}%`
              : 'N/A'
          }
        />
      </div>
    </section>
  );
}

// === 设备参数 ===

function DeviceCard({ camera }: { camera: CameraManifestEntry }) {
  return (
    <section>
      <SectionTitle>设备参数</SectionTitle>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <Row label="相机型号" value={formatValue(camera.model)} />
        <Row label="相机状态" value={formatValue(camera.status)} />
        <Row label="存储介质" value={formatValue(camera.storage)} />
        <Row label="拍摄模式" value={formatValue(camera.capture_mode)} />
        <Row
          label="间隔时间"
          value={
            camera.interval_s != null ? `${camera.interval_s} 秒` : 'N/A'
          }
        />
        <Row
          label="视频长度"
          value={
            camera.video_duration_s != null
              ? `${camera.video_duration_s} 秒`
              : 'N/A'
          }
        />
        <Row label="视频格式" value={formatValue(camera.video_format)} />
        <Row label="照片格式" value={formatValue(camera.photo_format)} />
        <Row
          label="连拍"
          value={
            camera.burst_count != null ? `${camera.burst_count} 张` : 'N/A'
          }
        />
        <Row label="敏感度" value={formatValue(camera.sensitivity)} />
        <Row label="日期标签" value={formatValue(camera.date_tag)} />
        <Row label="电池情况" value={formatValue(camera.battery)} />
        <Row label="干扰强度" value={formatValue(camera.interference)} />
        <Row label="两侧感应" value={formatValue(camera.bilateral)} />
        <Row
          label="相机高度"
          value={
            camera.height_cm != null ? `${camera.height_cm} cm` : 'N/A'
          }
        />
        <Row label="相机朝向" value={formatValue(camera.facing)} />
        <Row
          label="路径宽度"
          value={
            camera.path_width_cm != null
              ? `${camera.path_width_cm} cm`
              : 'N/A'
          }
        />
      </div>
    </section>
  );
}

// === 部署记录 ===

function DeploymentCard({ camera }: { camera: CameraManifestEntry }) {
  const days = daysBetween(camera.deployed_at, camera.retrieved_at);
  return (
    <section>
      <SectionTitle>部署记录</SectionTitle>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <Row label="装卡人" value={formatValue(camera.deployed_by)} />
        <Row label="装卡时间" value={formatDeployTime(camera.deployed_at)} />
        <Row label="取卡人" value={formatValue(camera.retrieved_by)} />
        <Row label="取卡时间" value={formatDeployTime(camera.retrieved_at)} />
        <Row
          label="部署天数"
          value={days != null ? `约 ${days} 天` : 'N/A'}
        />
      </div>
    </section>
  );
}

// === 图像数据占位 ===

function ImagePlaceholderCard() {
  return (
    <section>
      <SectionTitle>图像数据</SectionTitle>
      <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col items-center py-8 bg-white rounded border">
            <div className="text-4xl mb-2">🖼️</div>
            <div className="font-medium">照片</div>
            <div className="text-sm text-slate-500 mt-2 text-center px-4">
              暂无数据
              <br />
              <span className="text-xs">该相机拍摄的照片将在未来阶段导入</span>
            </div>
          </div>
          <div className="flex flex-col items-center py-8 bg-white rounded border">
            <div className="text-4xl mb-2">🎬</div>
            <div className="font-medium">视频</div>
            <div className="text-sm text-slate-500 mt-2 text-center px-4">
              暂无数据
              <br />
              <span className="text-xs">该相机录制的视频将在未来阶段导入</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// === 原始数据折叠 ===

function RawDetails({ camera }: { camera: CameraManifestEntry }) {
  return (
    <details className="border border-slate-200 rounded-md">
      <summary className="px-4 py-2 text-sm text-slate-600 cursor-pointer hover:bg-slate-50">
        原始元数据
      </summary>
      <pre className="px-4 py-3 text-xs text-slate-700 bg-slate-50 overflow-x-auto">
{JSON.stringify(camera, null, 2)}
      </pre>
    </details>
  );
}
