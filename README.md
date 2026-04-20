# wieemonitor

本项目由 **沃成生态环境研究所（Wocheng Institute of Ecology and Environment，简称 WIEE）** 建设。项目名 `wieemonitor` = **WIEE + monitor**，即"沃成生态环境研究所监测平台"。

一个以地图为核心的生态监测多模态数据平台。聚合并可视化四类数据：样线、红外相机、生物信息（DNA）、声音。

> 项目顶层指南见 [CLAUDE.md](./CLAUDE.md)；架构、路线图、数据模型见 [`docs/`](./docs/)。

---

## 技术栈

- Next.js 16+（App Router）+ TypeScript + React 19
- Tailwind CSS v4
- react-leaflet + leaflet（OpenStreetMap 底图，WGS84）
- 后续：PostgreSQL + PostGIS（阶段 3 引入）

## 启动开发服务器

```bash
# 安装依赖（首次或拉取后）
npm install

# 启动开发服务器
npm run dev
```

然后在浏览器打开 [http://localhost:3000](http://localhost:3000)。

## 常用命令

```bash
npm run dev      # 启动开发服务器（热更新）
npm run build    # 生产构建
npm run start    # 启动生产服务器（需先 build）
npm run lint     # 代码检查
```

## 部署

本项目**自托管**在单位内部服务器电脑上，**不部署到 Vercel**。详见 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) 与未来的 `docs/DEPLOY.md`。
