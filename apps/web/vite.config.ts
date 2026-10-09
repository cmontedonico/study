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
    proxy: {
      "/api": {
        target: "http://localhost:4317",
        changeOrigin: true, // Host becomes localhost:4317, so the server still sees a local request
        // The server rejects cross-origin writes: present the dev page's local Origin (:5173) as the target's own.
        // Foreign origins are left untouched, so a random website still gets a 403 through the dev proxy.
        configure: (proxy) =>
          proxy.on("proxyReq", (req) => {
            const origin = String(req.getHeader("origin") ?? "");
            if (/^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(origin)) {
              req.setHeader("origin", "http://localhost:4317");
            }
          }),
      },
    },
  },
});
