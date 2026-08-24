import { z } from "zod";

export const searchResultKindSchema = z.enum(["mission", "document", "spreadsheet", "canvas", "database", "relationship"]);

export const workspaceSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  limit: z.coerce.number().int().min(1).max(25).default(10),
}).strict();

export const workspaceSearchResultSchema = z.object({
  kind: searchResultKindSchema,
  id: z.number().int().positive(),
  title: z.string(),
  summary: z.string(),
  category: z.string().nullable(),
  updatedAt: z.string().nullable(),
  href: z.string().startsWith("/"),
}).strict();

export const workspaceSearchResponseSchema = z.object({
  query: z.string(),
  results: z.array(workspaceSearchResultSchema),
  counts: z.record(searchResultKindSchema, z.number().int().nonnegative()),
}).strict();

export type WorkspaceSearchResult = z.infer<typeof workspaceSearchResultSchema>;
export type WorkspaceSearchResultKind = z.infer<typeof searchResultKindSchema>;

export function escapePostgresLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function plainTextExcerpt(value: string | null | undefined, query: string, maxLength = 180): string {
  const plain = (value || "").replace(/[#*_>`~\[\]()]+/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) return "";
  if (plain.length <= maxLength) return plain;
  const index = plain.toLowerCase().indexOf(query.toLowerCase());
  const start = Math.max(0, Math.min(index >= 0 ? index - Math.floor(maxLength / 3) : 0, plain.length - maxLength));
  return `${start > 0 ? "…" : ""}${plain.slice(start, start + maxLength).trim()}${start + maxLength < plain.length ? "…" : ""}`;
}
