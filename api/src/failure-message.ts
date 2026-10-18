export const STALLED_MESSAGE = "Processing was interrupted repeatedly. Please upload the image again.";
export const GENERIC_FAILED_MESSAGE = "Processing failed. Please try uploading the image again.";

export function messageForFailedJob(failedReason: string | undefined): string {
  if (failedReason?.toLowerCase().includes("stalled")) {
    return STALLED_MESSAGE;
  }

  return GENERIC_FAILED_MESSAGE;
}