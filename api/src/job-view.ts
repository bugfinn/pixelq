export const VARIANTS = ["thumbnail", "medium", "full"] as const;
export type Variant = (typeof VARIANTS)[number];

export type JobRecord = {
  id: string;
  originalName: string;
  originalSizeBytes: number | null;
  status: string;
  attempts: number;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  expiresAt: Date | null;
};

export type OutputRecord = {
  jobId: string;
  variant: string;
  sizeBytes: number;
  width: number;
  height: number;
};

export type JobWithOutputs = {
  job: JobRecord;
  outputs: OutputRecord[];
};

const iso = (date: Date | null) => (date ? date.toISOString() : null);

const variantRank = (variant: string) => {
  const index = VARIANTS.indexOf(variant as Variant);
  return index === -1 ? VARIANTS.length : index;
};

export function toJobResponse({ job, outputs }: JobWithOutputs) {
  return {
    id: job.id,
    originalName: job.originalName,
    originalSizeBytes: job.originalSizeBytes,
    status: job.status,
    attempts: job.attempts,
    error: job.error,
    createdAt: iso(job.createdAt),
    startedAt: iso(job.startedAt),
    finishedAt: iso(job.finishedAt),
    expiresAt: iso(job.expiresAt),
    outputs: [...outputs]
      .sort((a, b) => variantRank(a.variant) - variantRank(b.variant))
      .map((output) => ({
        variant: output.variant,
        width: output.width,
        height: output.height,
        sizeBytes: output.sizeBytes,
        url: `/api/files/${job.id}/${output.variant}`,
      })),
  };
}