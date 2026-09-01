import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEXT_EXTENSIONS = new Set([
  ".cjs", ".css", ".graphql", ".html", ".js", ".json", ".jsx", ".md", ".mjs",
  ".scss", ".sql", ".svg", ".toml", ".ts", ".tsx", ".txt", ".xml", ".yaml", ".yml",
]);

export function findTrackedTextCorruption(root: string, trackedFiles: string[]): string[] {
  const corrupt: string[] = [];

  for (const relativePath of trackedFiles) {
    if (!TEXT_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) continue;

    const absolutePath = path.join(root, relativePath);
    let bytes: Buffer;
    try {
      if (!statSync(absolutePath).isFile()) continue;
      bytes = readFileSync(absolutePath);
    } catch {
      corrupt.push(`${relativePath}: unreadable tracked text file`);
      continue;
    }

    if (bytes.includes(0)) corrupt.push(`${relativePath}: contains null bytes`);
  }

  return corrupt;
}

function trackedFiles(root: string): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

function main() {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const corrupt = findTrackedTextCorruption(root, trackedFiles(root));
  if (corrupt.length > 0) {
    process.stderr.write(`Tracked text integrity check failed:\n${corrupt.map((item) => `- ${item}`).join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Tracked text integrity check passed.\n");
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) main();
