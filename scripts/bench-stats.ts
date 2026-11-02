export type RunResult = {
  workers: number;
  repeat: number;
  images: number;
  failed: number;
  totalSeconds: number;
  jobsPerSecond: number;
  latencyP50: number;
  latencyP95: number;
  processingP50: number;
  processingP95: number;
  workerCpuAvgPct: number;
  allCpuAvgPct: number;
  workerMemPeakMiB: number;
  allMemPeakMiB: number;
};

export type SummaryRow = Omit<RunResult, "repeat">;

const COLUMNS = [
  "workers",
  "repeat",
  "images",
  "failed",
  "totalSeconds",
  "jobsPerSecond",
  "latencyP50",
  "latencyP95",
  "processingP50",
  "processingP95",
  "workerCpuAvgPct",
  "allCpuAvgPct",
  "workerMemPeakMiB",
  "allMemPeakMiB",
] as const;

const SUMMARY_METRICS = [
  "images",
  "totalSeconds",
  "jobsPerSecond",
  "latencyP50",
  "latencyP95",
  "processingP50",
  "processingP95",
  "workerCpuAvgPct",
  "allCpuAvgPct",
  "workerMemPeakMiB",
  "allMemPeakMiB",
] as const;

/** Percentile with linear interpolation between the two nearest values. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    throw new Error("Cannot take a percentile of an empty list.");
  }
  if (p < 0 || p > 100) {
    throw new Error("p must be between 0 and 100.");
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower);
}

export function median(values: number[]): number {
  return percentile(values, 50);
}

export function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/** "12.5%" -> 12.5. Anything unreadable counts as 0. */
export function parsePercent(text: string): number {
  const value = Number(text.replace("%", "").trim());
  return Number.isFinite(value) ? value : 0;
}

const MEMORY_FACTORS_IN_MIB: Record<string, number> = {
  b: 1 / 1048576,
  kib: 1 / 1024,
  mib: 1,
  gib: 1024,
  kb: 1000 / 1048576,
  mb: 1_000_000 / 1048576,
  gb: 1_000_000_000 / 1048576,
};

/** "123.4MiB" -> 123.4. Takes only the used part, not the "/ limit" part. */
export function parseMemoryMiB(text: string): number {
  const match = /^\s*([\d.]+)\s*([A-Za-z]+)\s*$/.exec(text);
  const factor = match ? MEMORY_FACTORS_IN_MIB[match[2].toLowerCase()] : undefined;
  if (!match || factor === undefined) {
    throw new Error(`Cannot read the memory value "${text}".`);
  }
  return Number(match[1]) * factor;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

export function toCsv(rows: RunResult[]): string {
  const lines: string[] = [COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(COLUMNS.map((column) => formatNumber(row[column])).join(","));
  }
  return lines.join("\n") + "\n";
}

/** One row per worker count: the median of the repeats (the highest for failures). */
export function summarizeByWorkers(rows: RunResult[]): SummaryRow[] {
  const counts = [...new Set(rows.map((row) => row.workers))].sort((a, b) => a - b);
  return counts.map((workers) => {
    const group = rows.filter((row) => row.workers === workers);
    const summary: Record<string, number> = { workers };
    for (const metric of SUMMARY_METRICS) {
      summary[metric] = median(group.map((row) => row[metric]));
    }
    summary.failed = Math.max(...group.map((row) => row.failed));
    return summary as SummaryRow;
  });
}