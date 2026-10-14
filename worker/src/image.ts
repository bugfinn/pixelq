import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import sharp, { type Metadata } from "sharp";

export const VARIANTS = [
  { name: "thumbnail", maxWidth: 320 },
  { name: "medium", maxWidth: 1280 },
  { name: "full", maxWidth: 2048 },
] as const;

export type VariantName = (typeof VARIANTS)[number]["name"];

export type ProcessedVariant = {
  variant: VariantName;
  path: string;
  sizeBytes: number;
  width: number;
  height: number;
};

export type ProcessOptions = {
  maxInputPixels?: number;
};

const DEFAULT_MAX_INPUT_PIXELS = 50_000_000;
const WEBP_QUALITY = 80;

export class InvalidImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidImageError";
  }
}

function isSystemError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err;
}

export async function processImage(
  inputPath: string,
  outputDir: string,
  jobId: string,
  options: ProcessOptions = {},
): Promise<ProcessedVariant[]> {
  const maxInputPixels = options.maxInputPixels ?? DEFAULT_MAX_INPUT_PIXELS;

  let metadata: Metadata;
  try {
    metadata = await sharp(inputPath).metadata();
  } catch (err) {
    if (isSystemError(err)) throw err;
    throw new InvalidImageError("The file is not a valid image.");
  }

  if ((metadata.pages ?? 1) > 1) {
    throw new InvalidImageError("Animated or multi-page images are not supported.");
  }

  const pixels = (metadata.width ?? 0) * (metadata.height ?? 0);
  if (pixels === 0) {
    throw new InvalidImageError("The file is not a valid image.");
  }
  if (pixels > maxInputPixels) {
    throw new InvalidImageError("The image is too large (too many pixels).");
  }

  const jobDir = join(outputDir, jobId);
  await mkdir(jobDir, { recursive: true });

  const results: ProcessedVariant[] = [];
  try {
    for (const { name, maxWidth } of VARIANTS) {
      const path = join(jobDir, `${name}.webp`);
      const info = await sharp(inputPath, { limitInputPixels: maxInputPixels })
        .rotate()
        .resize({ width: maxWidth, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toFile(path);
      const { size } = await stat(path);
      results.push({
        variant: name,
        path,
        sizeBytes: size,
        width: info.width,
        height: info.height,
      });
    }
  } catch (err) {
    if (isSystemError(err)) throw err;
    throw new InvalidImageError("The image could not be processed.");
  }

  return results;
}