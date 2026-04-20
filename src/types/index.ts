/**
 * 全局 TypeScript 类型定义。
 *
 * 设计原则：字段命名尽量与 docs/DATA_MODEL.md 中的数据库表对齐，
 * 阶段 3 把 mock 数据切换为真实 API 时，前端类型几乎不用改。
 *
 * 阶段 1.4：保护区数据从官方 shapefile 加载，旧的 Reserve 类型和
 * mock 数据已废弃，统一用 ReserveRegistryEntry（见 types/reserve.ts）。
 */

// 各模块的类型定义集中在子模块，这里 re-export 方便统一引用
export * from './reserve';
export * from './transect';
export * from './camera';
