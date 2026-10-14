import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InvalidImageError, processImage } from "./image.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pixelq-test-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeJpeg(name: string, width: number, height: number) {
  const path = join(dir, name);
  const data = await sharp({
    create: { width, height, channels: 3, background: "#336699" },
  })
    .jpeg()
    .toBuffer();
  await writeFile(path, data);
  return path;
}

async function writeAnimatedWebp(name: string) {
  const width = 20;
  const frameHeight = 10;
  const frame = (shade: number) => Buffer.alloc(width * frameHeight * 3, shade);
  const frames = Buffer.concat([frame(0), frame(120), frame(240)]);
  const data = await sharp(frames, {
    raw: { width, height: frameHeight * 3, channels: 3, pageHeight: frameHeight },
  })
    .webp({ delay: [100, 100, 100], loop: 0 })
    .toBuffer();
  const path = join(dir, name);
  await writeFile(path, data);
  return path;
}

describe("processImage", () => {
  it("creates thumbnail, medium and full WebP files at the right widths", async () => {
    const input = await writeJpeg("big.jpg", 3000, 2000);

    const result = await processImage(input, dir, "job-1");

    expect(result.map((v) => v.variant)).toEqual(["thumbnail", "medium", "full"]);
    expect(result.map((v) => v.width)).toEqual([320, 1280, 2048]);
    expect(result.map((v) => v.height)).toEqual([213, 853, 1365]);

    for (const v of result) {
      const meta = await sharp(v.path).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBe(v.width);
      expect(meta.height).toBe(v.height);
      expect(v.sizeBytes).toBe((await stat(v.path)).size);
    }
  });

  it("builds output paths from the job id", async () => {
    const input = await writeJpeg("a.jpg", 400, 300);

    const result = await processImage(input, dir, "abc-123");

    expect(result.map((v) => v.path)).toEqual([
      join(dir, "abc-123", "thumbnail.webp"),
      join(dir, "abc-123", "medium.webp"),
      join(dir, "abc-123", "full.webp"),
    ]);
  });

  it("never enlarges a small image", async () => {
    const input = await writeJpeg("small.jpg", 100, 50);

    const result = await processImage(input, dir, "job-small");

    for (const v of result) {
      expect(v.width).toBe(100);
      expect(v.height).toBe(50);
    }
  });

  it("applies the EXIF orientation so images are not left sideways", async () => {
    const path = join(dir, "rotated.jpg");
    const data = await sharp({
      create: { width: 400, height: 200, channels: 3, background: "#336699" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    await writeFile(path, data);

    const result = await processImage(path, dir, "job-rotated");
    const full = result.find((v) => v.variant === "full");

    expect(full?.width).toBe(200);
    expect(full?.height).toBe(400);
  });

  it("removes metadata from the output", async () => {
    const path = join(dir, "exif.jpg");
    const data = await sharp({
      create: { width: 50, height: 50, channels: 3, background: "#aa0000" },
    })
      .jpeg()
      .withExif({ IFD0: { Copyright: "secret" } })
      .toBuffer();
    await writeFile(path, data);
    expect((await sharp(data).metadata()).exif).toBeDefined();

    const result = await processImage(path, dir, "job-exif");

    for (const v of result) {
      expect((await sharp(v.path).metadata()).exif).toBeUndefined();
    }
  });

  it("can run twice for the same job and overwrite its own files", async () => {
    const input = await writeJpeg("again.jpg", 800, 600);

    const first = await processImage(input, dir, "job-twice");
    const second = await processImage(input, dir, "job-twice");

    expect(second).toEqual(first);
    expect((await readFile(second[0]!.path)).length).toBe(first[0]!.sizeBytes);
  });

  it("rejects an animated image with a clear message", async () => {
    const input = await writeAnimatedWebp("anim.webp");

    await expect(processImage(input, dir, "job-anim")).rejects.toThrow(InvalidImageError);
    await expect(processImage(input, dir, "job-anim")).rejects.toThrow(/animated/i);
  });

  it("rejects a file that is not an image", async () => {
    const path = join(dir, "notes.jpg");
    await writeFile(path, "this is not an image");

    await expect(processImage(path, dir, "job-bad")).rejects.toThrow(InvalidImageError);
    await expect(processImage(path, dir, "job-bad")).rejects.toThrow(/not a valid image/i);
  });

  it("rejects an image with too many pixels", async () => {
    const input = await writeJpeg("pixels.jpg", 20, 20);

    await expect(
      processImage(input, dir, "job-pixels", { maxInputPixels: 100 }),
    ).rejects.toThrow(InvalidImageError);
    await expect(
      processImage(input, dir, "job-pixels", { maxInputPixels: 100 }),
    ).rejects.toThrow(/too large/i);
  });

  it("leaves no output files behind when the image is rejected", async () => {
    const input = await writeAnimatedWebp("anim2.webp");

    await expect(processImage(input, dir, "job-clean")).rejects.toThrow();

    await expect(stat(join(dir, "job-clean"))).rejects.toThrow();
  });
});