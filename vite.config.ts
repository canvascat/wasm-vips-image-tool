import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig, lazyPlugins } from "vite-plus";

const base = process.env.DEPLOY_BASE ?? "/";
const srcDir = fileURLToPath(new URL("./src", import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  base,
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: [".workbuddy/**", "dist/**", "public/coi-serviceworker.js", "public/vips/**"],
  },
  lint: {
    ignorePatterns: ["dist/**", "public/coi-serviceworker.js", "public/vips/**"],
    plugins: ["react", "typescript", "oxc"],
    rules: {
      "react/rules-of-hooks": "error",
      "react/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
        },
      ],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
  resolve: {
    alias: {
      "@": srcDir,
    },
  },
  plugins: lazyPlugins(() => [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons.svg"],
      manifest: {
        name: "图片处理工具",
        short_name: "图片处理",
        description: "基于 wasm-vips 的本地图片处理工具",
        lang: "zh-CN",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        start_url: base,
        icons: [
          {
            src: "pwa-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
        navigateFallback: `${base}index.html`,
        runtimeCaching: [
          {
            urlPattern: /\/vips\/.*\.wasm$/,
            handler: "CacheFirst",
            options: {
              cacheName: "wasm-vips-runtime",
              expiration: { maxEntries: 6, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ]),
});
