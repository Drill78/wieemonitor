/**
 * 路由 /biology ：生物信息（DNA）数据列表页。
 */

import ModulePlaceholderList from '@/components/modules/ModulePlaceholderList';

export const metadata = { title: '生物信息 · WIEE Monitor' };

export default function BiologyPage() {
  return (
    <ModulePlaceholderList
      title="生物信息数据列表"
      stage="阶段 4"
      description="DNA 测序样本与物种鉴定结果"
    />
  );
}
