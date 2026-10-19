import { describe, expect, it } from "vitest";
import { toJobResponse, type JobRecord, type OutputRecord } from "./job-view.js";

const ID = "11111111-2222-4333-8444-555555555555";

const job = (overrides: Partial<JobRecord> = {}): JobRecord => ({
  id: ID,
  originalName: "photo.jpg",
  originalSizeBytes: 2000,
  status: "done",
  attempts: 1,
  error: null,
  createdAt: new Date("2026-10-20T10:00:00.000Z"),
  startedAt: new Date("2026-10-20T10:00:01.000Z"),
  finishedAt: new Date("2026-10-20T10:00:02.000Z"),
  expiresAt: new Date("2026-10-21T10:00:02.000Z"),
  ...overrides,
});

const output = (variant: string, width: number): OutputRecord => ({
  jobId: ID,
  variant,
  sizeBytes: width * 10,
  width,
  height: width / 2,
});

describe("toJobResponse", () => {
  it("describes a finished job with a download url per output", () => {
    const response = toJobResponse({
      job: job(),
      outputs: [output("thumbnail", 320), output("medium", 1280), output("full", 2048)],
    });

    expect(response).toMatchObject({
      id: ID,
      originalName: "photo.jpg",
      originalSizeBytes: 2000,
      status: "done",
      attempts: 1,
      error: null,
      createdAt: "2026-10-20T10:00:00.000Z",
      expiresAt: "2026-10-21T10:00:02.000Z",
    });
    expect(response.outputs[1]).toEqual({
      variant: "medium",
      width: 1280,
      height: 640,
      sizeBytes: 12800,
      url: `/api/files/${ID}/medium`,
    });
  });

  it("lists outputs as thumbnail, medium, full whatever order they come in", () => {
    const response = toJobResponse({
      job: job(),
      outputs: [output("full", 2048), output("thumbnail", 320), output("medium", 1280)],
    });

    expect(response.outputs.map((o) => o.variant)).toEqual(["thumbnail", "medium", "full"]);
  });

  it("uses null for times that do not exist yet and an empty list for no outputs", () => {
    const response = toJobResponse({
      job: job({ status: "queued", startedAt: null, finishedAt: null, expiresAt: null, originalSizeBytes: null }),
      outputs: [],
    });

    expect(response).toMatchObject({
      startedAt: null,
      finishedAt: null,
      expiresAt: null,
      originalSizeBytes: null,
      outputs: [],
    });
  });

  it("never exposes server file paths", () => {
    const text = JSON.stringify(
      toJobResponse({
        job: { ...job(), storedPath: "/srv/uploads/secret.jpg" } as JobRecord,
        outputs: [{ ...output("full", 2048), path: "/srv/outputs/secret.webp" } as OutputRecord],
      }),
    );

    expect(text).not.toContain("/srv/");
    expect(text).not.toContain("storedPath");
    expect(text).not.toContain("path");
  });
});