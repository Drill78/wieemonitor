/**
 * 首页：全屏地图 + 右侧 Sidebar + 详情 Modal。
 *
 * 状态：
 *   - selectedReserve：当前选中的保护区
 *   - transectsOfReserve：该保护区的样线列表（reserve 变化时重新拉）
 *   - selectedTransect：当前在地图上高亮 + Sidebar 高亮的样线
 *   - detailTransect：详情 Modal 当前展示的样线
 *
 * URL 参数：?reserve=SXNR-XX&transect=ID
 *   挂载时如有，自动选中并清空 URL（router.replace）。
 *
 * useSearchParams 要求 Suspense 包裹，所以 export default 拆成
 * Home（带 Suspense）+ HomeInner。
 */

'use client';

import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';

import Sidebar from '@/components/layout/Sidebar';
import TransectDetailModal from '@/components/modules/TransectDetailModal';
import { reserves } from '@/data/mock/reserves';
import { getTransectsByReserve } from '@/lib/transects';
import type { Reserve, TransectManifestEntry } from '@/types';

// Leaflet 必须在浏览器跑，这里禁用 SSR
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
  const [detailTransect, setDetailTransect] =
    useState<TransectManifestEntry | null>(null);

  // 当保护区切换时，加载该保护区的所有样线
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

  // === URL 参数处理：仅在初次挂载时读 ?reserve=...&transect=... ===
  useEffect(() => {
    const reserveCode = searchParams.get('reserve');
    const transectId = searchParams.get('transect');
    if (!reserveCode) return;

    const reserve = reserves.find((r) => r.code === reserveCode);
    if (!reserve) {
      // 无效 reserve，清掉参数即可
      router.replace('/');
      return;
    }

    setSelectedReserve(reserve);

    if (transectId) {
      // 等该保护区的 transects 加载好，找到那条选中
      getTransectsByReserve(reserveCode)
        .then((list) => {
          const t = list.find((x) => x.id === transectId);
          if (t) setSelectedTransect(t);
        })
        .catch(() => {
          // ignore
        });
    }

    // 清空 URL 参数，避免刷新重复触发
    router.replace('/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReserveClick = (r: Reserve) => {
    setSelectedReserve(r);
    setSelectedTransect(null); // 切换保护区时清空样线
  };

  const handleClose = () => {
    setSelectedReserve(null);
    setSelectedTransect(null);
  };

  return (
    <main className="relative h-[calc(100vh-4rem)]">
      <MapView
        onReserveClick={handleReserveClick}
        selectedReserve={selectedReserve}
        transects={transectsOfReserve}
        selectedTransectId={selectedTransect?.id ?? null}
      />
      <Sidebar
        reserve={selectedReserve}
        selectedTransectId={selectedTransect?.id ?? null}
        onTransectSelect={setSelectedTransect}
        onDetailClick={setDetailTransect}
        onClose={handleClose}
      />
      <TransectDetailModal
        transect={detailTransect}
        reserveColor={selectedReserve?.color}
        onClose={() => setDetailTransect(null)}
      />
    </main>
  );
}
