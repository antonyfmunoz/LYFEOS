import { generateKeyPairSync, sign } from "crypto";
import { describe, expect, it } from "vitest";
import { canonicalExtensionManifest, extensionManifestDigest, verifyExtensionManifest } from "../server/extension-registry";

describe("signed extension registry", () => {
  const manifest = { schema: "lyfeos.extension.v1" as const, slug: "test-extension", version: "1.0.0", displayName: "Test Extension", description: "A deterministic test manifest.", permissions: ["projection.progression.summary.read" as const], capabilityContract: "projection_and_draft_only" as const };

  it("canonicalizes, fingerprints, and verifies an Ed25519 signature", () => {
    const keys = generateKeyPairSync("ed25519");
    const signature = sign(null, Buffer.from(canonicalExtensionManifest(manifest)), keys.privateKey).toString("base64");
    const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(extensionManifestDigest(manifest)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(verifyExtensionManifest(manifest, signature, publicKey)).toBe(true);
    expect(verifyExtensionManifest({ ...manifest, version: "1.0.1" }, signature, publicKey)).toBe(false);
  });

  it("rejects undeclared fields and executable entrypoints", () => {
    expect(() => canonicalExtensionManifest({ ...manifest, entrypoint: "https://publisher.example/code.js" })).toThrow();
  });
});
