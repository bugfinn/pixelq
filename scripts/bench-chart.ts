import type { SummaryRow } from "./bench-stats.ts";

type Series = { label: string; color: string; values: number[] };

type PanelOptions = {
  x: number;
  title: string;
  groups: string[];
  series: Series[];
};

const TOP = 120;
const HEIGHT = 210;
const WIDTH = 380;
const BOTTOM = TOP + HEIGHT;

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function panel(options: PanelOptions): string {
  const { x, title, groups, series } = options;
  const max = Math.max(0.0001, ...series.flatMap((s) => s.values)) * 1.2;
  const groupWidth = WIDTH / groups.length;
  const barWidth = (groupWidth * 0.7) / series.length;
  const parts: string[] = [];

  parts.push(
    `<text x="${x}" y="${TOP - 50}" font-size="15" font-weight="bold" fill="#222">${escapeXml(title)}</text>`,
  );

  if (series.length > 1) {
    series.forEach((s, i) => {
      const legendX = x + i * 80;
      parts.push(`<rect x="${legendX}" y="${TOP - 28}" width="12" height="12" fill="${s.color}"/>`);
      parts.push(
        `<text x="${legendX + 18}" y="${TOP - 18}" font-size="12" fill="#222">${escapeXml(s.label)}</text>`,
      );
    });
  }

  parts.push(`<line x1="${x}" y1="${BOTTOM}" x2="${x + WIDTH}" y2="${BOTTOM}" stroke="#888"/>`);

  groups.forEach((group, g) => {
    const groupX = x + g * groupWidth + groupWidth * 0.15;
    series.forEach((s, i) => {
      const value = s.values[g];
      const barHeight = (value / max) * HEIGHT;
      const barX = groupX + i * barWidth;
      const barY = BOTTOM - barHeight;
      parts.push(
        `<rect x="${barX.toFixed(1)}" y="${barY.toFixed(1)}" width="${(barWidth - 4).toFixed(1)}" height="${barHeight.toFixed(1)}" fill="${s.color}"/>`,
      );
      parts.push(
        `<text x="${(barX + (barWidth - 4) / 2).toFixed(1)}" y="${(barY - 6).toFixed(1)}" font-size="12" text-anchor="middle" fill="#222">${value.toFixed(2)}</text>`,
      );
    });
    parts.push(
      `<text x="${(x + g * groupWidth + groupWidth / 2).toFixed(1)}" y="${BOTTOM + 22}" font-size="12" text-anchor="middle" fill="#222">${escapeXml(group)}</text>`,
    );
  });

  return parts.join("\n");
}

export function renderChart(rows: SummaryRow[], subtitle: string, caption: string): string {
  const groups = rows.map((row) => `${row.workers} worker${row.workers === 1 ? "" : "s"}`);

  const throughput = panel({
    x: 50,
    title: "Throughput (jobs per second)",
    groups,
    series: [{ label: "jobs/s", color: "#2b7de9", values: rows.map((row) => row.jobsPerSecond) }],
  });

  const latency = panel({
    x: 490,
    title: "Latency, upload to done (seconds)",
    groups,
    series: [
      { label: "p50", color: "#2a9d8f", values: rows.map((row) => row.latencyP50) },
      { label: "p95", color: "#e76f51", values: rows.map((row) => row.latencyP95) },
    ],
  });

  return (
    [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 420" width="920" height="420" font-family="system-ui, sans-serif">`,
      `<rect width="920" height="420" rx="8" fill="#ffffff"/>`,
      `<text x="50" y="30" font-size="18" font-weight="bold" fill="#222">PixelQ scaling benchmark</text>`,
      `<text x="50" y="50" font-size="12" fill="#555">${escapeXml(subtitle)}</text>`,
      throughput,
      latency,
      `<text x="50" y="405" font-size="11" fill="#555">${escapeXml(caption)}</text>`,
      `</svg>`,
    ].join("\n") + "\n"
  );
}