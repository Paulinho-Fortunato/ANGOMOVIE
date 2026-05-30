import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    // Otimizações para produção
    minify: "esbuild",
    cssCodeSplit: true,
    // Aumentar limite de aviso de chunk size para 700KB
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          // Separar React e ReactDOM em vendor
          vendor: ["react", "react-dom"],
          // Separar framer-motion em chunk próprio
          animations: ["framer-motion"],
          // Separar outras bibliotecas grandes se necessário
        },
        // Garante que o entry point seja um arquivo separado
        entryFileNames: `assets/[name]-[hash].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        assetFileNames: `assets/[name]-[hash].[ext]`,
      },
    },
  },
  server: {
    headers: {
      // Headers seguros para desenvolvimento
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
