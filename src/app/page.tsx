/**
 * 首页：全屏地图 + 右侧 Sidebar + 详情 Modal（样线/相机）。
 *
 * 阶段 1.4：保护区数据从 /geo/reserves-registry.json 异步加载（46 个）。
 * 顶层 state：
 *   - reserves: 全部保护区列表
 *   - selectedReserve / transectsOfReserve / selectedTransect
 *   - camerasOfTransect / selectedCamera
 *   - detailTransect / detailCamera
 *   - displayMode（zones/merged） / levelFilter（national/provincial/other）
 *
 * URL 参数：?reserve=&transect=&camera=
 *   reserve 支持新编码（SXNR-N02）和旧编码（SXNR-06）。
 */

'use client';

import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';

import Sidebar, { type DisplayMode } from '@/components/layout/Sidebar';
import TransectDetailModal from '@/components/modules/TransectDetailModal';
import CameraDetailModal from '@/components/modules/CameraDetailModal';
import { loadReserves } from '@/lib/reserves';
import { getTransectsByReserve } from '@/lib/transects';
import { getCamerasByTransect } from '@/lib/cameras';
import type {
  CameraManifestEntry,
  ReserveLevel,
  ReserveRegistryEntry,
  TransectManifestEntry,
} from '@/types';

const MapView = dynamic(() => import('@/components/map/MapView'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center text-slate-500">
      地图加载中…
    </div>
  ),
});

const RESERVE_TINT = '#3b82f6';

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [reserves, setReserves] = useState<ReserveRegistryEntry[]>([]);
  const [selectedReserve, setSelectedReserve] =
    useState<ReserveRegistryEntry | null>(null);
  const [transectsOfReserve, setTransectsOfReserve] = useState<
    TransectManifestEntry[]
  >([]);
  const [selectedTransect, setSelectedTransect] =
    useState<TransectManifestEntry | null>(null);

  const [camerasOfTransect, setCamerasOfTransect] = useState<
    CameraManifestEntry[]
  >([]);
  const [selectedCamera, setSelectedCamera] =
    useState<CameraManifestEntry | null>(null);

  const [detailTransect, setDetailTransect] =
    useState<TransectManifestEntry | null>(null);
  const [detailCamera, setDetailCamera] =
    useState<CameraManifestEntry | null>(null);

  // 地图设置
  const [displayMode, setDisplayMode] = useState<DisplayMode>('zones');
  const [levelFilter, setLevelFilter] = useState<Record<ReserveLevel, boolean>>({
    national: true,
    provincial: true,
    other: true,
  });

  // 加载 46 个保护区 registry
  useEffect(() => {
    loadReserves()
      .then((list) => setReserves(list))
      .catch((e) => console.warn('[page] reserves 加载失败：', e));
  }, []);

  // 切换保护区时加载样线
  useEffect(() => {
    if (!selectedReserve) {
      setTransectsOfReserve([]);
      return;
    }
    let cancelled = false;
    getTransectsByReserve(selectedReserve.code)
      .then((list) => {
        if (!cancelled) setTransectsOfReserve(list);
      })
      .catch((e) => {
        console.warn('[page] transects 加载失败：', e);
        if (!cancelled) setTransectsOfReserve([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedReserve]);

  // 切换样线时加载该样线的相机
  useEffect(() => {
    if (!selectedTransect) {
      setCamerasOfTransect([]);
      return;
    }
    let cancelled = false;
    getCamerasByTransect(selectedTransect.id)
      .then((list) => {
        if (!cancelled) setCamerasOfTransect(list);
      })
      .catch((e) => {
        console.warn('[page] cameras 加载失败：', e);
        if (!cancelled) setCamerasOfTransect([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTransect]);

  // === URL 参数：仅初次挂载读取 ?reserve=&transect=&camera= ===
  // 兼容旧编码（SXNR-06）→ 用 legacy_code 反查
  useEffect(() => {
    if (reserves.length === 0) return; // 等 registry 加载完
    const reserveCode = searchParams.get('reserve');
    const transectId = searchParams.get('transect');
    const cameraId = searchParams.get('camera');
    if (!reserveCode) return;

    const reserve =
      reserves.find((r) => r.code === reserveCode) ??
      reserves.find((r) => r.legacy_code === reserveCode);
    if (!reserve) {
      router.replace('/');
      return;
    }

    setSelectedReserve(reserve);

    if (transectId) {
      getTransectsByReserve(reserve.code)
        .then((list) => {
          const t = list.find((x) => x.id === transectId);
          if (!t) return;
          setSelectedTransect(t);

          if (cameraId) {
            getCamerasByTransect(t.id).then((cams) => {
              const cam = cams.find((c) => c.id === cameraId);
              if (cam) setDetailCamera(cam);
            });
          }
        })
        .catch(() => {});
    }

    router.replace('/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reserves]);

  const handleReserveClick = (r: ReserveRegistryEntry) => {
    setSelectedReserve(r);
    setSelectedTransect(null);
    setSelectedCamera(null);
  };

  const handleClose = () => {
    setSelectedReserve(null);
    setSelectedTransect(null);
    setSelectedCamera(null);
  };

  return (
    <main className="relative h-[calc(100vh-4rem)]">
      <MapView
        reserves={reserves}
        selectedReserve={selectedReserve}
        onReserveClick={handleReserveClick}
        displayMode={displayMode}
        levelFilter={levelFilter}
        transects={transectsOfReserve}
        selectedTransectId={selectedTransect?.id ?? null}
        cameras={camerasOfTransect}
        selectedCameraId={selectedCamera?.id ?? null}
        onCameraClick={(c) => {
          setSelectedCamera(c);
          setDetailCamera(c);
        }}
      />
      <Sidebar
        reserve={selectedReserve}
        selectedTransectId={selectedTransect?.id ?? null}
        onTransectSelect={(t) => {
          setSelectedTransect(t);
          setSelectedCamera(null);
        }}
        onDetailClick={setDetailTransect}
        onClose={handleClose}
        displayMode={displayMode}
        onDisplayModeChange={setDisplayMode}
        levelFilter={levelFilter}
        onLevelFilterChange={(level, enabled) =>
          setLevelFilter((prev) => ({ ...prev, [level]: enabled }))
        }
      />
      <TransectDetailModal
        transect={detailTransect}
        reserveColor={RESERVE_TINT}
        onClose={() => setDetailTransect(null)}
      />
      <CameraDetailModal
        camera={detailCamera}
        reserveColor={RESERVE_TINT}
        reserveName={selectedReserve?.name_full ?? null}
        onClose={() => setDetailCamera(null)}
      />
    </main>
  );
}
