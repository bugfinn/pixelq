import { beforeEach, describe, expect, it, vi } from "vitest";
import { FAILED_MESSAGE } from "../process-job.js";
import {
  MISSING_FILE_MESSAGE,
  decideReconcileAction,
  runReconcile,
  type StaleJob,
} from "./reconcile.js";

describe("decideReconcileAction", () => {
  it.each(["waiting", "delayed", "active", "prioritized", "waiting-children"])(
    "leaves a job alone while BullMQ says %s",
    (state) => {
      expect(decideReconcileAction(state)).toBe("leave");
    },
  );

  it("re-adds a job that BullMQ does not know", () => {
    expect(decideReconcileAction("unknown")).toBe("readd");
  });

  it("marks a job failed when BullMQ says it failed", () => {
    expect(decideReconcileAction("failed")).toBe("mark-failed");
  });

  it("reports a completed job instead of guessing", () => {
    expect(decideReconcileAction("completed")).toBe("report-inconsistent");
  });

  it("leaves a job alone when BullMQ reports a state we do not know about", () => {
    expect(decideReconcileAction("paused")).toBe("leave");
  });
});

const job = (id: string, status = "queued"): StaleJob => ({ id, status, storedPath: `/uploads/${id}.jpg` });

function setup(jobs: StaleJob[], states: Record<string, string>) {
  const deps = {
    listStaleJobs: vi.fn().mockResolvedValue(jobs),
    getJobState: vi.fn(async (id: string) => states[id] ?? "unknown"),
    enqueueImageJob: vi.fn().mockResolvedValue(undefined),
    markJobFailed: vi.fn().mockResolvedValue(undefined),
    fileExists: vi.fn().mockResolvedValue(true),
    limit: 100,
  };
  return deps;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("runReconcile", () => {
  it("does nothing to jobs that are still in the pipeline", async () => {
    const deps = setup(
      [job("a"), job("b", "processing"), job("c")],
      { a: "waiting", b: "active", c: "delayed" },
    );

    const summary = await runReconcile(deps);

    expect(summary).toMatchObject({ checked: 3, left: 3, readded: 0, markedFailed: 0 });
    expect(deps.enqueueImageJob).not.toHaveBeenCalled();
    expect(deps.markJobFailed).not.toHaveBeenCalled();
  });

  it("re-adds a queued job that Redis forgot, and a processing job whose job is gone", async () => {
    const deps = setup([job("a"), job("b", "processing")], {});

    const summary = await runReconcile(deps);

    expect(deps.enqueueImageJob).toHaveBeenCalledWith("a");
    expect(deps.enqueueImageJob).toHaveBeenCalledWith("b");
    expect(summary.readded).toBe(2);
  });

  it("marks the job failed instead of re-adding it when its upload file is missing", async () => {
    const deps = setup([job("a")], {});
    deps.fileExists.mockResolvedValue(false);

    const summary = await runReconcile(deps);

    expect(deps.enqueueImageJob).not.toHaveBeenCalled();
    expect(deps.markJobFailed).toHaveBeenCalledWith("a", MISSING_FILE_MESSAGE);
    expect(summary.missingFile).toBe(1);
  });

  it("copies a failure that BullMQ recorded into Postgres, for queued and processing rows", async () => {
    const deps = setup([job("a"), job("b", "processing")], { a: "failed", b: "failed" });

    const summary = await runReconcile(deps);

    expect(deps.markJobFailed).toHaveBeenCalledWith("a", FAILED_MESSAGE);
    expect(deps.markJobFailed).toHaveBeenCalledWith("b", FAILED_MESSAGE);
    expect(deps.enqueueImageJob).not.toHaveBeenCalled();
    expect(summary.markedFailed).toBe(2);
  });

  it("only reports a job that BullMQ calls completed", async () => {
    const deps = setup([job("a")], { a: "completed" });

    const summary = await runReconcile(deps);

    expect(deps.enqueueImageJob).not.toHaveBeenCalled();
    expect(deps.markJobFailed).not.toHaveBeenCalled();
    expect(summary.inconsistent).toBe(1);
  });

  it("keeps going when one job cannot be checked", async () => {
    const deps = setup([job("a"), job("b")], {});
    deps.getJobState.mockImplementationOnce(async () => {
      throw new Error("redis hiccup");
    });

    const summary = await runReconcile(deps);

    expect(summary).toMatchObject({ checked: 2, errors: 1, readded: 1 });
    expect(deps.enqueueImageJob).toHaveBeenCalledWith("b");
  });

  it("passes the batch limit to the query", async () => {
    const deps = setup([], {});
    deps.limit = 25;

    await runReconcile(deps);

    expect(deps.listStaleJobs).toHaveBeenCalledWith(25);
  });
});