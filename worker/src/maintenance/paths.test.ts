import { describe, expect, it } from "vitest";
import { isInside } from "./paths.js";

describe("isInside", () => {
  it("accepts a file directly inside the folder", () => {
    expect(isInside("/data/uploads", "/data/uploads/a.jpg")).toBe(true);
  });

  it("accepts a nested path", () => {
    expect(isInside("/data/outputs", "/data/outputs/job-1/full.webp")).toBe(true);
  });

  it("rejects the folder itself", () => {
    expect(isInside("/data/uploads", "/data/uploads")).toBe(false);
  });

  it("rejects a path that climbs out with ..", () => {
    expect(isInside("/data/uploads", "/data/uploads/../secrets/key")).toBe(false);
  });

  it("rejects a sibling folder that only shares the name prefix", () => {
    expect(isInside("/data/uploads", "/data/uploads2/a.jpg")).toBe(false);
  });

  it("rejects an unrelated absolute path", () => {
    expect(isInside("/data/uploads", "/etc/passwd")).toBe(false);
  });

  it("accepts a file whose name starts with two dots", () => {
    expect(isInside("/data/uploads", "/data/uploads/..hidden")).toBe(true);
  });
});