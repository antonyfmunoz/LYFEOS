import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const sentrySourceMapConfig = {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  release: process.env.SENTRY_RELEASE,
};

const sentrySourceMapUploadRequested = [
  sentrySourceMapConfig.authToken,
  sentrySourceMapConfig.org,
  sentrySourceMapConfig.project,
].some(Boolean);

const sentrySourceMapUploadEnabled = Object.values(sentrySourceMapConfig).every(
  Boolean,
);

if (sentrySourceMapUploadRequested && !sentrySourceMapUploadEnabled) {
  throw new Error(
    "Incomplete Sentry source-map build configuration. Set SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT, and SENTRY_RELEASE together.",
  );
}

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    themePlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
    ...(sentrySourceMapUploadEnabled
      ? [
          sentryVitePlugin({
            authToken: sentrySourceMapConfig.authToken,
            org: sentrySourceMapConfig.org,
            project: sentrySourceMapConfig.project,
            telemetry: false,
            release: {
              inject: false,
              name: sentrySourceMapConfig.release,
              setCommits: false,
            },
            sourcemaps: {
              assets: "./dist/public/**",
              filesToDeleteAfterUpload: "./dist/public/**/*.map",
            },
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: sentrySourceMapUploadEnabled ? "hidden" : false,
  },
});
