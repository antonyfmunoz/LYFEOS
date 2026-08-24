import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export function isPrivateOrReservedAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::1" || normalized === "::" || /^(fe8|fe9|fea|feb)/.test(normalized) || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("ff") || normalized.startsWith("2001:db8:")) return true;
  if (normalized.startsWith("::ffff:")) return isPrivateOrReservedAddress(normalized.slice(7));
  if (isIP(normalized) !== 4) return false;
  const [a, b] = normalized.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0) || a >= 224;
}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only public HTTP and HTTPS URLs are allowed.");
  if (url.username || url.password) throw new Error("URLs containing credentials are not allowed.");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) throw new Error("Private network URLs are not allowed.");
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateOrReservedAddress(address))) throw new Error("Private or reserved network destinations are not allowed.");
  return url;
}

export async function fetchPublicWebPage(raw: string, init: RequestInit = {}, maxRedirects = 3): Promise<Response> {
  let url = await assertPublicHttpUrl(raw);
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const response = await fetch(url, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location || redirect === maxRedirects) throw new Error("Webpage redirect could not be followed safely.");
    url = await assertPublicHttpUrl(new URL(location, url).toString());
  }
  throw new Error("Too many webpage redirects.");
}
