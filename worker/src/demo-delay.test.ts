import { describe, expect, it } from "vitest";
import { demoDelayMs } from "./demo-delay.js";

describe("demoDelayMs", () => {
  it("does not delay when the demo delay is 0", () => {
    expect(demoDelayMs(1, 0)).toBe(0);
  });

  it("delays the first start of a job", () => {
    expect(demoDelayMs(1, 20_000)).toBe(20_000);
  });

  it("does not delay a job that is started again after its worker died", () => {
    expect(demoDelayMs(2, 20_000)).toBe(0);
  });

  it("does not delay later starts either", () => {
    expect(demoDelayMs(5, 20_000)).toBe(0);
  });
});