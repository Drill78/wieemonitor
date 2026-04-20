/**
 * 首页：全屏地图 + 右侧 Sidebar + 详情 Modal（样线/相机）。
 *
 * 状态：
 *   - selectedReserve / transectsOfReserve / selectedTransect
 *   - camerasOfTransect / selectedCamera（相机由"选中样线"派生）
 *   - detailTransect / detailCamera（两个独立的 Modal）
 *
 * URL 参数：?reserve=SXNR-XX&transect=ID&camera=CID
 *   挂载时如有，自动选中并清空 URL（router.replace）。
 *   camera 需要等 cameras 加载完才能锁定，所以放在 transects 加载后处理。
 */

'use client';

import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';

import Sidebar from '@/components/layout/Sidebar';
import TransectDetailModal from '@/components/modules/TransectDetailModal';
import CameraDetailModal from '@/components/modules/CameraDetailModal';
import { reserves } from '@/data/mock/reserves';
import { getTransectsByReserve } from '@/lib/transects';
import { getCamerasByTransect } from '@/lib/cameras';
import type {
  CameraManifestEntry,
  Reserve,
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

  const [selectedReserve, setSelectedReserve] = useState<Reserve | null>(null);
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
  useEffect(() => {
    const reserveCode = searchParams.get('reserve');
    const transectId = searchParams.get('transect');
    const cameraId = searchParams.get('camera');
    if (!reserveCode) return;

    const reserve = reserves.find((r) => r.code === reserveCode);
    if (!reserve) {
      router.replace('/');
      return;
    }

    setSelectedReserve(reserve);

    if (transectId) {
      getTransectsByReserve(reserveCode)
        .then((list) => {
          const t = list.find((x) => x.id === transectId);
          if (!t) return;
          setSelectedTransect(t);

          // camera 必须依赖于已选中的样线
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
  }, []);

  const handleReserveClick = (r: Reserve) => {
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
        onReserveClick={handleReserveClick}
        selectedReserve={selectedReserve}
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
          // 切换/取消样线时清空相机选择
          setSelectedCamera(null);
        }}
        onDetailClick={setDetailTransect}
        onClose={handleClose}
      />
      <TransectDetailModal
        transect={detailTransect}
        reserveColor={selectedReserve?.color}
        onClose={() => setDetailTransect(null)}
      />
      <CameraDetailModal
        camera={detailCamera}
        reserveColor={selectedReserve?.color}
        reserveName={selectedReserve?.name ?? null}
        onClose={() => setDetailCamera(null)}
      />
    </main>
  );
}
