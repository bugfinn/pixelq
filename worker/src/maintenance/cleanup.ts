import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { isInside } from "./paths.js";

const UPLOAD_NAME = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp)$/i;
const OUTPUT_DIR_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ExpiredJob = {
  id: string;
  storedPath: string;
};

export type CleanupDeps = {
  uploadDir: string;
  outputDir: string;
  findExpiredJobs(limit: number): Promise<ExpiredJob[]>;
  deleteJob(jobId: string): Promise<boolean>;
  limit: number;
};

export type CleanupSummary = {
  expired: number;
  deleted: number;
  refusedPaths: number;
  errors: number;
};

export async function runCleanup(deps: CleanupDeps): Promise<CleanupSummary> {
  const summary: CleanupSummary = { expired: 0, deleted: 0, refusedPaths: 0, errors: 0 };

  const expired = await deps.findExpiredJobs(deps.limit);
  summary.expired = expired.length;

  for (const job of expired) {
    try {
      if (isInside(deps.uploadDir, job.storedPath)) {
        await rm(job.storedPath, { force: true });
      } else {
        summary.refusedPaths++;
        console.error(`Cleanup: refusing to delete "${job.storedPath}" because it is outside the upload folder.`);
      }

      const outputFolder = join(deps.outputDir, job.id);
      if (isInside(deps.outputDir, outputFolder)) {
        await rm(outputFolder, { recursive: true, force: true });
      }

      if (await deps.deleteJob(job.id)) {
        summary.deleted++;
      }
    } catch (err) {
      summary.errors++;
      console.error(`Cleanup: could not remove job ${job.id}:`, err);
    }
  }

  return summary;
}

export type SweepDeps = {
  uploadDir: string;
  outputDir: string;
  findExistingJobIds(ids: string[]): Promise<Set<string>>;
  minAgeMs: number;
  limit: number;
  now?: () => number;
};

export type SweepSummary = {
  candidates: number;
  removedFiles: number;
  removedFolders: number;
  errors: number;
};

type Candidate = { id: string; path: string; kind: "file" | "folder" };

async function listOldEntries(
  dir: string,
  pattern: RegExp,
  kind: "file" | "folder",
  cutoff: number,
  idOf: (name: string) => string | null,
): Promise<Candidate[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }

  const found: Candidate[] = [];
  for (const entry of entries) {
    const matchesKind = kind === "file" ? entry.isFile() : entry.isDirectory();
    if (!matchesKind || !pattern.test(entry.name)) {
      continue;
    }

    const id = idOf(entry.name);
    if (!id) {
      continue;
    }

    const path = join(dir, entry.name);
    const info = await stat(path);
    if (info.mtimeMs < cutoff) {
      found.push({ id: id.toLowerCase(), path, kind });
    }
  }

  return found;
}

export async function runSweep(deps: SweepDeps): Promise<SweepSummary> {
  const summary: SweepSummary = { candidates: 0, removedFiles: 0, removedFolders: 0, errors: 0 };
  const cutoff = (deps.now ?? Date.now)() - deps.minAgeMs;

  const files = await listOldEntries(deps.uploadDir, UPLOAD_NAME, "file", cutoff, (name) => {
    const match = UPLOAD_NAME.exec(name);
    return match?.[1] ?? null;
  });
  const folders = await listOldEntries(deps.outputDir, OUTPUT_DIR_NAME, "folder", cutoff, (name) => name);

  const candidates = [...files, ...folders].slice(0, deps.limit);
  summary.candidates = candidates.length;
  if (candidates.length === 0) {
    return summary;
  }

  const existing = await deps.findExistingJobIds([...new Set(candidates.map((c) => c.id))]);

  for (const candidate of candidates) {
    if (existing.has(candidate.id)) {
      continue;
    }

    const root = candidate.kind === "file" ? deps.uploadDir : deps.outputDir;
    if (!isInside(root, candidate.path)) {
      continue;
    }

    try {
      await rm(candidate.path, { recursive: candidate.kind === "folder", force: true });
      if (candidate.kind === "file") {
        summary.removedFiles++;
      } else {
        summary.removedFolders++;
      }
    } catch (err) {
      summary.errors++;
      console.error(`Sweep: could not remove "${candidate.path}":`, err);
    }
  }

  return summary;
}