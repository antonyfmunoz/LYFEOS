import fs from "fs";
import path from "path";
import { createPrivateKey, sign } from "crypto";
import { canonicalExtensionManifest, extensionManifestSchema } from "../server/extension-registry";

async function run(): Promise<void> {
  const requested = process.argv[2];
  if (!requested) throw new Error("Usage: tsx scripts/publish-extension.ts extensions/manifests/<manifest>.json");
  const allowedRoot = path.resolve(process.cwd(), "extensions", "manifests");
  const manifestPath = path.resolve(process.cwd(), requested);
  const relative = path.relative(allowedRoot, manifestPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || path.extname(manifestPath) !== ".json") throw new Error("Manifest must be a JSON file under extensions/manifests.");
  const publisherKeyId = process.env.LYFEOS_EXTENSION_PUBLISHER_KEY_ID?.trim();
  const privateKeyPem = process.env.LYFEOS_EXTENSION_PUBLISHER_PRIVATE_KEY?.trim();
  const adminToken = process.env.LYFEOS_EXTENSION_REGISTRY_ADMIN_TOKEN?.trim();
  if (!publisherKeyId || !privateKeyPem || !adminToken) throw new Error("Extension publishing custody is not configured.");
  const manifest = extensionManifestSchema.parse(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("Publisher private key must be Ed25519.");
  const signature = sign(null, Buffer.from(canonicalExtensionManifest(manifest)), key).toString("base64");
  const response = await fetch("https://lyfeos.net/api/internal/extensions/packages", {
    method: "POST",
    redirect: "error",
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ publisherKeyId, manifest, signature }),
  });
  const body = await response.json().catch(() => ({})) as { package?: { id?: string; slug?: string; version?: string }; error?: string };
  if (!response.ok) throw new Error(`Extension publish failed (${response.status}): ${body.error || "provider rejected the package"}`);
  process.stdout.write(`Published ${body.package?.slug}@${body.package?.version} (${body.package?.id})\n`);
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Extension publish failed."}\n`);
  process.exitCode = 1;
});
