import sharp from "sharp";
import { describe, expect, it } from "vitest";

describe("toolchain smoke test", () => {
  it("can create and read an image with sharp", async () => {
    const png = await sharp({
      create: { width: 10, height: 6, channels: 3, background: "#ff0000" },
    })
      .png()
      .toBuffer();

    const meta = await sharp(png).metadata();

    expect(meta.format).toBe("png");
    expect(meta.width).toBe(10);
    expect(meta.height).toBe(6);
  });
});
