import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export function serveStatic(app: Express, runtimeConfig: {
  clerkPublishableKey: string;
  sentryDsn?: string;
  environment?: string;
  sentryRelease?: string;
}) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, {
    index: false,
    setHeaders: (res, filePath) => {
      const normalizedPath = filePath.replace(/\\/g, "/");
      if (normalizedPath.endsWith("/sw.js")) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        res.setHeader("Service-Worker-Allowed", "/");
      } else if (normalizedPath.includes("/assets/")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      }
    },
  }));

  // fall through to index.html if the file doesn't exist
  app.use("*", async (_req, res, next) => {
    try {
      const template = await fs.promises.readFile(path.resolve(distPath, "index.html"), "utf-8");
      const serializedConfig = JSON.stringify(runtimeConfig).replace(/</g, "\\u003c");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.type("html").send(template.replace("</head>", `<script>window.__LYFEOS_RUNTIME_CONFIG__=${serializedConfig};</script></head>`));
    } catch (error) {
      next(error);
    }
  });
}
