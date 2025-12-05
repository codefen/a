import { defineConfig } from 'vite';
import obfuscator from "rollup-plugin-obfuscator";
import viteCompression from "vite-plugin-compression";

export default defineConfig({
    root: './src',
    publicDir: './assets',
    plugins: [
        obfuscator({
            compact: true,
            controlFlowFlattening: true,
            deadCodeInjection: true,
            deadCodeInjectionThreshold: 0.4,
            debugProtection: false,
            disableConsoleOutput: true,
            identifierNamesGenerator: "mangled",
            log: false,
            renameGlobals: false,
            selfDefending: true,
            stringArray: true,
            stringArrayEncoding: ["base64"],
            stringArrayRotate: true,
            stringArrayShuffle: true,
            stringArrayThreshold: 1,
            transformObjectKeys: true,
        }),
        viteCompression({ algorithm: "brotliCompress" }),
    ],
    build: {
        sourcemap: false,
        cssMinify: true,
        target: "es2020",
        outDir: "../dist",
        rollupOptions: {
            output: {
                manualChunks: undefined,
                entryFileNames: 'assets/[name].[hash].js',
                chunkFileNames: 'assets/[name].[hash].js',
                assetFileNames: 'assets/[name].[hash].[ext]',
            },
        },
    },
    server: {
        host: true,
        port: 5173,
        strictPort: true,
        watch: {
            ignored: ['**/src-tauri/**'],
        },
    },
    clearScreen: false,
    envPrefix: ['VITE_', 'TAURI_'],
});
