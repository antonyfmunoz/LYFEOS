export function normalizeRecoveryTag(tag: string): string {
  return tag.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}
