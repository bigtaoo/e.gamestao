import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // 不写死端口：由启动方通过 PORT 指定，没给就让 vite 自己挑
  server: {
    host: true,
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
  },
  build: { target: 'es2022', outDir: 'dist' },
});
