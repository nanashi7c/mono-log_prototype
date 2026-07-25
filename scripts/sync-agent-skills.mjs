import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const source = path.join(repositoryRoot, "skills");
const destinations = [
  path.join(repositoryRoot, ".claude", "skills"),
  path.join(repositoryRoot, ".agents", "skills"),
];
const isCheck = process.argv.includes("--check");
const isDryRun = process.argv.includes("--dry-run");

if (isCheck && isDryRun) {
  throw new Error("--check and --dry-run cannot be used together.");
}

const normalizePath = (value) =>
  process.platform === "win32" ? value.toLowerCase() : value;

const tryRealpath = async (target) => {
  try {
    return await realpath(target);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
};

const listFiles = async (directory, relativeDirectory = "") => {
  const entries = await readdir(path.join(directory, relativeDirectory), {
    withFileTypes: true,
  });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(directory, relativePath)));
      continue;
    }

    if (!entry.isFile()) {
      throw new Error(`Unsupported entry in skills source: ${relativePath}`);
    }

    files.push(relativePath);
  }

  return files.sort();
};

const sourceRealpath = await tryRealpath(source);
if (!sourceRealpath) {
  throw new Error(`Skills source does not exist: ${source}`);
}

const sourceFiles = await listFiles(source);
if (!sourceFiles.some((file) => path.basename(file) === "SKILL.md")) {
  throw new Error(`No SKILL.md was found under: ${source}`);
}

const hasSameContents = async (destination) => {
  const destinationRealpath = await tryRealpath(destination);
  if (!destinationRealpath) {
    return false;
  }

  const destinationFiles = await listFiles(destination);
  if (
    sourceFiles.length !== destinationFiles.length ||
    sourceFiles.some((file, index) => file !== destinationFiles[index])
  ) {
    return false;
  }

  for (const file of sourceFiles) {
    const [sourceContent, destinationContent] = await Promise.all([
      readFile(path.join(source, file)),
      readFile(path.join(destination, file)),
    ]);

    if (!sourceContent.equals(destinationContent)) {
      return false;
    }
  }

  return true;
};

const inspectDestination = async (destination) => {
  const destinationRealpath = await tryRealpath(destination);
  if (!destinationRealpath) {
    return { isShared: false };
  }

  if (
    normalizePath(destinationRealpath) === normalizePath(sourceRealpath)
  ) {
    return { isShared: true };
  }

  const destinationStats = await lstat(destination);
  if (destinationStats.isSymbolicLink()) {
    throw new Error(
      `Refusing to replace a link outside the skills source: ${destination}`,
    );
  }

  return { isShared: false };
};

let hasMismatch = false;

for (const destination of destinations) {
  const { isShared } = await inspectDestination(destination);
  if (isShared) {
    console.log(`SKIP ${path.relative(repositoryRoot, destination)} (shared)`);
    continue;
  }

  const isSynchronized = await hasSameContents(destination);

  if (isCheck) {
    console.log(
      `${isSynchronized ? "OK" : "MISMATCH"} ${path.relative(repositoryRoot, destination)}`,
    );
    hasMismatch ||= !isSynchronized;
    continue;
  }

  if (isSynchronized) {
    console.log(`SKIP ${path.relative(repositoryRoot, destination)} (current)`);
    continue;
  }

  if (isDryRun) {
    console.log(`SYNC ${path.relative(repositoryRoot, destination)}`);
    continue;
  }

  await rm(destination, { recursive: true, force: true });
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
  console.log(`SYNCED ${path.relative(repositoryRoot, destination)}`);
}

if (hasMismatch) {
  process.exitCode = 1;
}
