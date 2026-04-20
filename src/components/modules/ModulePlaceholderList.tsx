/**
 * 数据模块占位列表（4 个路由页共用）。
 *
 * 阶段 0：纯 UI 骨架，灰色 pulse 占位条 + 禁用的"+ 新建"按钮。
 * 后续阶段：每个模块各自从 mock / API 拉数据，替换本组件为真实列表。
 */

interface ModulePlaceholderListProps {
  title: string;        // 例如 "样线数据列表"
  stage: string;        // 例如 "阶段 1"
  description: string;  // 例如 "野外调查样线 GIS 轨迹"
}

export default function ModulePlaceholderList({
  title,
  stage,
  description,
}: ModulePlaceholderListProps) {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {description} · 数据模块开发中（对应 ROADMAP {stage}）
          </p>
        </div>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="px-4 py-2 rounded-md bg-slate-200 text-slate-400 text-sm cursor-not-allowed shrink-0"
          title="尚未开放"
        >
          + 新建
        </button>
      </div>

      <div className="mt-8 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-slate-100 rounded-lg p-4">
            <div className="flex items-center gap-4">
              <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
              <div className="h-4 w-48 bg-slate-200 rounded animate-pulse" />
              <div className="h-4 w-24 bg-slate-200 rounded animate-pulse ml-auto" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
