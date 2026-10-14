import { defineConfig } from 'vite';
import frameact from 'frameact/vite';

export default defineConfig({
  plugins: [frameact()],
  server: { port: 1234 },
  build: { target: 'es2022' },
});
