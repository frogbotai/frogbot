import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: { entry: 'src/main.ts', fileName: 'main', formats: ['es'] },
  },
});
