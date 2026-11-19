# 图片处理工具（wasm-vips）

基于 [wasm-vips](https://github.com/kleisauke/wasm-vips) 的纯前端本地图片处理工具。图片只在浏览器内处理，不上传服务器。

## 功能

- 裁剪：拖拽框选、1:1 / 4:3 / 16:9 / 自由比例
- 旋转与翻转：90° 步进、任意角度、水平/垂直镜像
- 水印：中文文字水印（Canvas 渲染后合成）、透明 PNG 图片水印，支持位置与缩放
- 预览：工作图实时预览，导出时按原图分辨率重放操作链
- 导出：JPEG / PNG / WebP，可调质量与压缩参数
- PWA：可安装到桌面，离线可用

## 本地开发

```bash
pnpm install
pnpm dev
```

由于 wasm-vips 依赖 `SharedArrayBuffer`，开发服务器已自动下发 COOP/COEP 响应头。线上 GitHub Pages 通过 `coi-serviceworker` 补齐隔离头；Cloudflare Pages 等支持自定义头的平台可直接读取 `public/_headers`。

## 部署

推送到 `main` 分支后，GitHub Actions 自动构建并部署到 GitHub Pages：

- 构建时通过 `DEPLOY_BASE=/<repo-name>/` 设置 Vite 的 `base`
- 工作流位于 `.github/workflows/deploy-pages.yml`
- 需在仓库 Settings → Pages → Build and deployment 中选择 **GitHub Actions** 作为 Source

## 技术栈

Vite+ · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · vite-plugin-pwa · wasm-vips 0.0.19

> wasm-vips 目前仍在早期开发，版本已锁定；其构建未启用 pangocairo，因此文字水印由主线程 Canvas 渲染后传入 Worker 合成。
