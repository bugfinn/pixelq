import { describe, expect, it } from "vitest";
import {
  GENERIC_FAILED_MESSAGE,
  STALLED_MESSAGE,
  messageForFailedJob,
} from "./failure-message.js";

describe("messageForFailedJob", () => {
  it("explains a job that stalled too many times", () => {
    expect(messageForFailedJob("job stalled more than allowable limit")).toBe(STALLED_MESSAGE);
  });

  it("recognizes the stalled reason regardless of letter case", () => {
    expect(messageForFailedJob("Job STALLED more than allowable limit")).toBe(STALLED_MESSAGE);
  });

  it("uses a generic message for any other reason", () => {
    expect(messageForFailedJob("Cannot read properties of undefined")).toBe(GENERIC_FAILED_MESSAGE);
  });

  it("uses the generic message when there is no reason", () => {
    expect(messageForFailedJob(undefined)).toBe(GENERIC_FAILED_MESSAGE);
  });

  it("never copies the internal reason into the message", () => {
    const reason = "ENOENT: no such file /home/secret/uploads/x.jpg";

    expect(messageForFailedJob(reason)).not.toContain("secret");
  });
});