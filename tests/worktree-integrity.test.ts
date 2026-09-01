import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findTrackedTextCorruption } from "../scripts/check-worktree-integrity";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("tracked text integrity", () => {
  it("accepts ordinary text and ignores binary assets", () => {
    const root = path.join(os.tmpdir(), `lyfeos-integrity-${crypto.randomUUID()}`);
    roots.push(root);
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, "route.ts"), "export const healthy = true;\n");
    writeFileSync(path.join(root, "image.png"), Buffer.from([0, 1, 2, 3]));

    expect(findTrackedTextCorruption(root, ["route.ts", "image.png"])).toEqual([]);
  });

  it("reports null-byte corruption even when file size is unchanged", () => {
    const root = path.join(os.tmpdir(), `lyfeos-integrity-${crypto.randomUUID()}`);
    roots.push(root);
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, "route.ts"), Buffer.alloc(128));

    expect(findTrackedTextCorruption(root, ["route.ts"])).toEqual([
      "route.ts: contains null bytes",
    ]);
  });
});
