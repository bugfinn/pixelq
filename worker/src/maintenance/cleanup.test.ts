import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCleanup, runSweep } from "./cleanup.js";

const HOUR = 60 * 60 * 1000;
const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ID3 = "33333333-3333-4333-8333-333333333333";

let root: string;
let uploadDir: string;
let outputDir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pixelq-maint-"));
  uploadDir = join(root, "uploads");
  outputDir = join(root, "outputs");
  await mkdir(uploadDir);
  await mkdir(outputDir);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const exists = (path: string) => stat(path).then(() => true, () => false);

async function makeUpload(name: string, ageMs = 0) {
  const path = join(uploadDir, name);
  await writeFile(path, "x");
  const when = new Date(Date.now() - ageMs);
  await utimes(path, when, when);
  return path;
}

async function makeOutputFolder(name: string, ageMs = 0) {
  const path = join(outputDir, name);
  await mkdir(path);
  await writeFile(join(path, "full.webp"), "x");
  const when = new Date(Date.now() - ageMs);
  await utimes(path, when, when);
  return path;
}

describe("runCleanup", () => {
  it("deletes the upload, the output folder and then the row of an expired job", async () => {
    const upload = await makeUpload(`${ID1}.jpg`);
    const folder = await makeOutputFolder(ID1);
    const deleteJob = vi.fn().mockResolvedValue(true);

    const summary = await runCleanup({
      uploadDir,
      outputDir,
      findExpiredJobs: async () => [{ id: ID1, storedPath: upload }],
      deleteJob,
      limit: 100,
    });

    expect(await exists(upload)).toBe(false);
    expect(await exists(folder)).toBe(false);
    expect(deleteJob).toHaveBeenCalledWith(ID1);
    expect(summary).toMatchObject({ expired: 1, deleted: 1, errors: 0 });
  });

  it("copes with files that are already gone", async () => {
    const deleteJob = vi.fn().mockResolvedValue(true);

    const summary = await runCleanup({
      uploadDir,
      outputDir,
      findExpiredJobs: async () => [{ id: ID1, storedPath: join(uploadDir, `${ID1}.jpg`) }],
      deleteJob,
      limit: 100,
    });

    expect(summary.deleted).toBe(1);
  });

  it("refuses to delete a stored path outside the upload folder but still removes the row", async () => {
    const outside = join(root, "important.txt");
    await writeFile(outside, "keep me");
    const deleteJob = vi.fn().mockResolvedValue(true);

    const summary = await runCleanup({
      uploadDir,
      outputDir,
      findExpiredJobs: async () => [{ id: ID1, storedPath: outside }],
      deleteJob,
      limit: 100,
    });

    expect(await exists(outside)).toBe(true);
    expect(summary).toMatchObject({ refusedPaths: 1, deleted: 1 });
  });

  it("keeps going when one job fails", async () => {
    const a = await makeUpload(`${ID1}.jpg`);
    const b = await makeUpload(`${ID2}.jpg`);
    const deleteJob = vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValue(true);

    const summary = await runCleanup({
      uploadDir,
      outputDir,
      findExpiredJobs: async () => [
        { id: ID1, storedPath: a },
        { id: ID2, storedPath: b },
      ],
      deleteJob,
      limit: 100,
    });

    expect(summary).toMatchObject({ expired: 2, deleted: 1, errors: 1 });
    expect(await exists(b)).toBe(false);
  });

  it("asks for at most the batch limit", async () => {
    const findExpiredJobs = vi.fn().mockResolvedValue([]);

    await runCleanup({ uploadDir, outputDir, findExpiredJobs, deleteJob: vi.fn(), limit: 7 });

    expect(findExpiredJobs).toHaveBeenCalledWith(7);
  });
});

describe("runSweep", () => {
  const sweep = (existing: string[], extra: object = {}) =>
    runSweep({
      uploadDir,
      outputDir,
      findExistingJobIds: async (ids) => new Set(ids.filter((id) => existing.includes(id))),
      minAgeMs: HOUR,
      limit: 500,
      ...extra,
    });

  it("removes an old upload that has no database row", async () => {
    const orphan = await makeUpload(`${ID1}.png`, 2 * HOUR);

    const summary = await sweep([]);

    expect(await exists(orphan)).toBe(false);
    expect(summary.removedFiles).toBe(1);
  });

  it("keeps an old upload whose job row exists", async () => {
    const file = await makeUpload(`${ID1}.jpg`, 2 * HOUR);

    await sweep([ID1]);

    expect(await exists(file)).toBe(true);
  });

  it("keeps a recent upload even without a row", async () => {
    const file = await makeUpload(`${ID1}.jpg`, 5 * 60 * 1000);

    await sweep([]);

    expect(await exists(file)).toBe(true);
  });

  it("never touches files that do not look like ours", async () => {
    const odd = await makeUpload("notes.txt", 5 * HOUR);
    const almost = await makeUpload(`${ID1}.gif`, 5 * HOUR);

    await sweep([]);

    expect(await exists(odd)).toBe(true);
    expect(await exists(almost)).toBe(true);
  });

  it("removes an old output folder without a row, and keeps one with a row", async () => {
    const orphanFolder = await makeOutputFolder(ID2, 2 * HOUR);
    const liveFolder = await makeOutputFolder(ID3, 2 * HOUR);

    const summary = await sweep([ID3]);

    expect(await exists(orphanFolder)).toBe(false);
    expect(await exists(liveFolder)).toBe(true);
    expect(summary.removedFolders).toBe(1);
  });

  it("does nothing when the folders do not exist yet", async () => {
    await rm(uploadDir, { recursive: true });
    await rm(outputDir, { recursive: true });

    const summary = await sweep([]);

    expect(summary).toMatchObject({ candidates: 0, removedFiles: 0, removedFolders: 0 });
  });

  it("does not look anything up when there are no candidates", async () => {
    const findExistingJobIds = vi.fn();

    await runSweep({ uploadDir, outputDir, findExistingJobIds, minAgeMs: HOUR, limit: 500 });

    expect(findExistingJobIds).not.toHaveBeenCalled();
  });
});