import type { Express, Request, Response } from "express";
import { LYFEOS_CAPABILITY_MANIFEST, umhCommandEnvelopeSchema } from "@shared/umh";
import { getUMHFederationConfig } from "../umh/config";
import { verifyUMHSignature } from "../umh/crypto";
import { executeMissionCreateCommand, FederationError } from "../umh/service";

function manifest() {
  return {
    ...LYFEOS_CAPABILITY_MANIFEST,
    status: getUMHFederationConfig() ? "enabled" as const : "disabled" as const,
  };
}

export function registerUMHRoutes(app: Express): void {
  app.get("/api/umh/v1/manifest", (_req, res) => res.json(manifest()));
  app.get("/api/umh/v1/health", (_req, res) => {
    const config = getUMHFederationConfig();
    res.json({ status: "ok", federation: config ? "enabled" : "disabled", outboundDelivery: Boolean(config?.controlPlaneUrl) });
  });

  app.post("/api/umh/v1/commands", async (req: Request, res: Response) => {
    const config = getUMHFederationConfig();
    if (!config) return res.status(503).json({ error: "UMH federation is not configured for this projection" });

    const keyId = req.header("x-umh-key-id") ?? "";
    const timestamp = req.header("x-umh-timestamp") ?? "";
    const nonce = req.header("x-umh-nonce") ?? "";
    const signature = req.header("x-umh-signature") ?? "";
    if (keyId !== config.keyId || !verifyUMHSignature(config.sharedSecret, timestamp, nonce, signature, req.body)) {
      return res.status(401).json({ error: "Invalid federation signature" });
    }

    const parsed = umhCommandEnvelopeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid command envelope", details: parsed.error.flatten() });

    try {
      const outcome = await executeMissionCreateCommand(parsed.data, nonce, config);
      return res.status(outcome.replayed ? 200 : 201).json(outcome);
    } catch (error) {
      if (error instanceof FederationError) return res.status(error.status).json({ error: error.message });
      throw error;
    }
  });
}
