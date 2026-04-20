/**
 * 路由 /cameras ：红外相机数据列表页。
 */

import ModulePlaceholderList from '@/components/modules/ModulePlaceholderList';

export const metadata = { title: '红外相机 · WIEE Monitor' };

export default function CamerasPage() {
  return (
    <ModulePlaceholderList
      title="红外相机数据列表"
      stage="阶段 2"
      description="红外相机部署点位与拍摄照片"
    />
  );
}
