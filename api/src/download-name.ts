const MAX_BASE_LENGTH = 80;

export function downloadName(originalName: string, variant: string): string {
  const lastSegment = originalName.split(/[\\/]/).pop() ?? "";
  const withoutExtension = lastSegment.replace(/\.[^.]*$/, "");
  const cleaned = withoutExtension
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, MAX_BASE_LENGTH);

  return `${cleaned || "image"}-${variant}.webp`;
}