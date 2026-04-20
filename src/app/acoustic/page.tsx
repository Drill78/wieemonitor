/**
 * 路由 /acoustic ：声音数据列表页。
 */

import ModulePlaceholderList from '@/components/modules/ModulePlaceholderList';

export const metadata = { title: '声音数据 · WIEE Monitor' };

export default function AcousticPage() {
  return (
    <ModulePlaceholderList
      title="声音数据列表"
      stage="阶段 4"
      description="声学采样的音频与元数据"
    />
  );
}
