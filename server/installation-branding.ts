import { domainToASCII } from "node:url";

export function normalizeInstallationHostname(input: string): string | null {
  const withoutPort = input.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  const ascii = domainToASCII(withoutPort);
  if (!ascii || ascii.length < 4 || ascii.length > 253 || ascii === "localhost" || /^\d+(?:\.\d+){3}$/.test(ascii)) return null;
  if (!ascii.split(".").every((label) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(label))) return null;
  return ascii;
}
