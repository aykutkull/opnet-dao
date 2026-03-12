import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    define: {
        global: 'globalThis',
    },
    resolve: {
        alias: {
            buffer: 'buffer',
        },
    },
    build: {
        target: 'esnext',
        outDir: 'dist',
    },
    server: {
        port: 3000,
        open: true,
    },
});
