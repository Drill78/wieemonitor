# 数据模型草稿（DATA_MODEL.md）

> 本文件是数据库 schema 的**草稿**，详细字段会在**阶段 3**（引入数据库）时根据真实数据进一步细化。
> 当前阶段（UI 骨架）仅作为前端 mock 数据和 TypeScript 类型设计的参考。

---

## 0. 全局约定

### 命名

- 数据库 schema 按业务模块拆分：`shared`、`transect`、`camera`、`biology`、`acoustic`
- 表名小写复数：`reserves`、`transects`、`cameras`
- 字段名 snake_case：`created_at`、`reserve_id`

### 通用字段（所有表都有）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `bigserial PRIMARY KEY` | 自增主键 |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | 创建时间 |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | 更新时间（触发器自动更新） |

### 空间字段

- 所有空间字段统一使用 PostGIS 的 `geometry` 类型
- **SRID 一律 4326（WGS84）**
- 字段名一律 `geom`
- 必须建 GiST 空间索引：`CREATE INDEX ... USING GIST (geom)`

例：
```sql
geom geometry(Point, 4326) NOT NULL
geom geometry(LineString, 4326) NOT NULL
geom geometry(Polygon, 4326) NOT NULL
```

### 文件路径字段

- 不在数据库存二进制文件
- 字段名约定：`file_path`（单个文件）或单独的关联表（多文件）
- 路径**相对于配置的存储根目录**，不存绝对路径，便于将来迁移

---

## 1. shared 模块（公共维度）

### `shared.reserves` — 保护区

| 字段 | 类型 | 说明 | 状态 |
|------|------|------|------|
| `id` | `bigserial` | 主键 | ✅ 确定 |
| `name_full` | `text NOT NULL` | 保护区全名（如 "山西历山国家级自然保护区"） | ✅ 确定 |
| `name_short` | `text NOT NULL` | 短名（如 "历山"，用于地图标签） | ✅ 确定 |
| `code` | `text UNIQUE NOT NULL` | 保护区编码（`SXNR-N{01..08}` / `SXPR-P{01..35}` / `SXOR-O{01..03}`） | ✅ 确定 |
| `legacy_code` | `text` | 兼容老编码（OSM 时期的 `SXNR-01..08`），可空 | ✅ 确定 |
| `level` | `text NOT NULL` CHECK in ('national','provincial','other') | 保护区级别 | ✅ 确定 |
| `province` | `text` | 所属省份（当前全是 "山西"） | ✅ 确定 |
| `boundary_source` | `text` | 边界数据来源（当前全是 "山西省林草局 shapefile"） | ✅ 确定 |
| `area_km2_total` | `numeric` | 总面积（平方公里，由 PostGIS 计算或离线写入） | ✅ 确定 |
| `description` | `text` | 介绍文字 | 🟡 待定 |
| `established_at` | `date` | 建立时间 | 🟡 待定 |
| `created_at` / `updated_at` | `timestamptz` | 通用字段 | ✅ 确定 |

> 保护区边界按"区"拆到子表 `shared.reserve_zones`，每条 reserve 多条 zone。

### `shared.reserve_zones` — 保护区分区

| 字段 | 类型 | 说明 | 状态 |
|------|------|------|------|
| `id` | `bigserial` | 主键 | ✅ 确定 |
| `reserve_id` | `bigint REFERENCES shared.reserves(id)` | 所属保护区 | ✅ 确定 |
| `zone` | `text NOT NULL` CHECK in ('core','buffer','experimental','unknown') | 区类型 | ✅ 确定 |
| `geom` | `geometry(MultiPolygon, 4326)` | 该区合并几何 | ✅ 确定 |
| `area_km2` | `numeric` | 该区面积（PostGIS ST_Area 计算或离线写入） | ✅ 确定 |
| `feature_count` | `int` | 原始 shapefile 里属于本区的 feature 数 | 🟡 待定 |
| `created_at` / `updated_at` | `timestamptz` | | ✅ 确定 |

> 阶段 1.4 把 OSM 单 polygon 模式替换为"按区分层"。前端的"合并显示"模式
> 在数据库侧不需要单独存 —— 用 `ST_Union(geom)` over reserve_zones 即可。

---

## 2. transect 模块（样线）

### `transect.transects` — 样线

| 字段 | 类型 | 说明 | 状态 |
|------|------|------|------|
| `id` | `bigserial` | 主键 | ✅ 确定 |
| `reserve_id` | `bigint REFERENCES shared.reserves(id)` | 所属保护区 | ✅ 确定 |
| `code` | `text` | 样线编号 | ✅ 确定 |
| `name` | `text` | 样线名称 | ✅ 确定 |
| `geom` | `geometry(LineString, 4326)` | 样线轨迹 | ✅ 确定 |
| `length_m` | `numeric` | 长度（米，可由 ST_Length 计算并缓存） | ✅ 确定 |
| `surveyed_at` | `date` | 调查日期 | ✅ 确定 |
| `surveyor` | `text` | 调查人 | 🟡 待定 |
| `weather` | `text` | 天气情况 | 🟡 待定 |
| `notes` | `text` | 备注 | 🟡 待定 |
| `created_at` / `updated_at` | `timestamptz` | 通用字段 | ✅ 确定 |

> **阶段 3 待定**：是否一条样线可能在不同时间被多次调查（如果是，需要拆 `transect_surveys` 表）。

---

## 3. camera 模块（红外相机）

### `camera.cameras` — 相机部署点

| 字段 | 类型 | 说明 | 状态 |
|------|------|------|------|
| `id` | `bigserial` | 主键 | ✅ 确定 |
| `reserve_id` | `bigint REFERENCES shared.reserves(id)` | 所属保护区 | ✅ 确定 |
| `transect_id` | `bigint REFERENCES transect.transects(id)` | 所属样线（可空） | ✅ 确定 |
| `code` | `text NOT NULL` | 相机编号（如 `CAM-001`） | ✅ 确定 |
| `geom` | `geometry(Point, 4326)` | 部署位置 | ✅ 确定 |
| `elevation_m` | `numeric` | 海拔（米） | 🟡 待定 |
| `model` | `text` | 设备型号 | 🟡 待定 |
| `deployed_at` | `date` | 部署日期 | ✅ 确定 |
| `retrieved_at` | `date` | 回收日期 | 🟡 待定 |
| `status` | `text` | 状态（active / retrieved / lost） | 🟡 待定 |
| `notes` | `text` | 备注 | 🟡 待定 |
| `created_at` / `updated_at` | `timestamptz` | 通用字段 | ✅ 确定 |

### `camera.photos` — 照片记录

| 字段 | 类型 | 说明 | 状态 |
|------|------|------|------|
| `id` | `bigserial` | 主键 | ✅ 确定 |
| `camera_id` | `bigint REFERENCES camera.cameras(id)` | 拍摄相机 | ✅ 确定 |
| `file_path` | `text NOT NULL` | 文件相对路径 | ✅ 确定 |
| `taken_at` | `timestamptz` | 拍摄时间（从 EXIF 读） | ✅ 确定 |
| `width` / `height` | `int` | 尺寸 | 🟡 待定 |
| `species` | `text` | 物种鉴定结果（暂用文本，将来可改为外键） | 🟡 待定 |
| `species_confidence` | `numeric` | 自动识别置信度（如启用 AI） | 🟡 待定 |
| `tags` | `text[]` | 标签数组 | 🟡 待定 |
| `created_at` / `updated_at` | `timestamptz` | 通用字段 | ✅ 确定 |

> **阶段 3 待定**：物种是否独立成 `shared.species` 表（学名、中文名、IUCN 等级等）。

---

## 4. biology 模块（生物信息 / DNA）

### `biology.samples` — 生物样本

> ⚠️ 本模块字段**全部待定**，需要在阶段 4 之前与项目所有者讨论实际数据格式（DNA 测序 → fastq？BLAST 比对结果？参考序列编号？）。

可以预先确定的字段：

| 字段 | 类型 | 说明 | 状态 |
|------|------|------|------|
| `id` | `bigserial` | 主键 | ✅ 确定 |
| `reserve_id` | `bigint REFERENCES shared.reserves(id)` | 所属保护区 | ✅ 确定 |
| `transect_id` | `bigint REFERENCES transect.transects(id)` | 所属样线（可空） | ✅ 确定 |
| `geom` | `geometry(Point, 4326)` | 采样位置 | ✅ 确定 |
| `sampled_at` | `timestamptz` | 采样时间 | ✅ 确定 |
| `sample_type` | `text` | 样本类型（粪便 / 毛发 / 组织 / 环境 DNA 等） | 🟡 待定 |
| `species` | `text` | 鉴定物种 | 🟡 待定 |
| `sequencing_file_path` | `text` | 测序数据文件路径 | 🟡 待定 |
| `created_at` / `updated_at` | `timestamptz` | 通用字段 | ✅ 确定 |

> **阶段 4 待定**：是否需要单独的 `biology.sequencing_runs`、`biology.species_identifications` 等关联表。

---

## 5. acoustic 模块（声音）

### `acoustic.recordings` — 声音记录

> ⚠️ 本模块字段**大部分待定**，需要在阶段 4 之前确认实际采样设备 / 文件格式 / 是否需要事件标注。

可以预先确定的字段：

| 字段 | 类型 | 说明 | 状态 |
|------|------|------|------|
| `id` | `bigserial` | 主键 | ✅ 确定 |
| `reserve_id` | `bigint REFERENCES shared.reserves(id)` | 所属保护区 | ✅ 确定 |
| `geom` | `geometry(Point, 4326)` | 录音位置 | ✅ 确定 |
| `file_path` | `text NOT NULL` | 音频文件相对路径 | ✅ 确定 |
| `recorded_at` | `timestamptz` | 录音开始时间 | ✅ 确定 |
| `duration_seconds` | `numeric` | 时长 | ✅ 确定 |
| `sample_rate_hz` | `int` | 采样率 | 🟡 待定 |
| `device_model` | `text` | 设备型号 | 🟡 待定 |
| `notes` | `text` | 备注 | 🟡 待定 |
| `created_at` / `updated_at` | `timestamptz` | 通用字段 | ✅ 确定 |

> **阶段 4 待定**：是否需要 `acoustic.events` 子表（标注一段音频里出现的物种、时间戳、置信度）。

---

## 6. 索引与约束建议（阶段 3 实施时参考）

- 所有 `geom` 字段建 GiST 空间索引
- 所有外键字段建 B-tree 索引
- 时间字段（`taken_at`、`recorded_at`、`surveyed_at`）建 B-tree 索引（按时间筛选频繁）
- `code` 类业务编号建唯一索引
- 软删除：暂不引入，按需要再加 `deleted_at`

---

## 7. 数据导入流程（阶段 3 设计）

预期来源：

| 数据 | 来源格式 | 导入工具 |
|------|----------|----------|
| 保护区边界 | shapefile / GeoJSON | `ogr2ogr` 或自写 Node 脚本 |
| 样线轨迹 | GPX / shapefile / Excel（经纬度） | 自写 Node 脚本 |
| 相机部署点 | Excel | 自写 Node 脚本 |
| 相机照片 | 目录扫描 + EXIF | 自写 Node 脚本 |
| 生物样本 | Excel + 测序文件目录 | 待定 |
| 声音记录 | 目录扫描 + 文件名解析 | 待定 |

> 导入脚本统一放 `scripts/import/`，每种数据一个独立脚本，幂等可重跑（用 `code` 做 upsert 键）。
