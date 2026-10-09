import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: {
    rolldownOptions: {
      output: {
        // Stable vendor chunks: app-code changes don't invalidate them in the PWA cache.
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30 },
            {
              name: "ui",
              test: /node_modules[\\/](@base-ui|@radix-ui|radix-ui|cmdk|sonner|lucide-react)[\\/]/,
              priority: 20,
            },
            { name: "ai", test: /node_modules[\\/](ai|@ai-sdk)[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  server: {
    host: true,
    proxy: { "/api": "http://localhost:4317" },
  },
});
