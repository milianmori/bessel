import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const sourcePath = path.join(projectDir, "ersatz-bessel-user-presets.md");
const publicDir = path.join(projectDir, "public");
const targetPath = path.join(publicDir, "ersatz-bessel-user-presets.md");

await mkdir(publicDir, { recursive: true });
await copyFile(sourcePath, targetPath);

console.log(
  `Synced ${path.relative(projectDir, sourcePath)} -> ${path.relative(projectDir, targetPath)}`,
);
