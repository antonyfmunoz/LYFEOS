export interface UMHFederationConfig {
  installationId: string;
  tenantId: string;
  keyId: string;
  sharedSecret: string;
  controlPlaneUrl?: string;
}

/** Federation is opt-in so a standalone LyfeOS deployment remains standalone. */
export function getUMHFederationConfig(): UMHFederationConfig | undefined {
  const installationId = process.env.UMH_FEDERATION_INSTALLATION_ID;
  const tenantId = process.env.UMH_FEDERATION_TENANT_ID;
  const keyId = process.env.UMH_FEDERATION_KEY_ID;
  const sharedSecret = process.env.UMH_FEDERATION_SHARED_SECRET;

  if (!installationId || !tenantId || !keyId || !sharedSecret) return undefined;

  const controlPlaneUrl = process.env.UMH_CONTROL_PLANE_URL?.replace(/\/$/, "");
  return { installationId, tenantId, keyId, sharedSecret, controlPlaneUrl };
}
