import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "https://reroute.tools",
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: {
    target: "esnext",
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react/") || id.includes("react-dom/")) {
              return "vendor-react";
            }
            if (id.includes("leaflet")) {
              return "vendor-leaflet";
            }
            if (id.includes("@dnd-kit")) {
              return "vendor-dnd";
            }
            if (id.includes("framer-motion")) {
              return "vendor-motion";
            }
            if (id.includes("date-fns")) {
              return "vendor-date";
            }
            if (id.includes("lucide-react")) {
              return "vendor-icons";
            }
            if (id.includes("@supabase")) {
              return "vendor-supabase";
            }
            if (id.includes("xlsx") || id.includes("papaparse")) {
              return "vendor-parsers";
            }
            if (id.includes("exceljs")) {
              return "vendor-excel";
            }
          }
          if (id.includes("src/services/tspSolver") || id.includes("src/services/ekispertService")) {
            return "solver-engine";
          }
          if (id.includes("src/services/aiService")) {
            return "ai-engine";
          }
        },
      },
    },
  },
});
