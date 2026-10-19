import { describe, expect, it } from "vitest";
import { downloadName } from "./download-name.js";

describe("downloadName", () => {
  it("combines the original name and the variant", () => {
    expect(downloadName("holiday photo.jpg", "medium")).toBe("holiday_photo-medium.webp");
  });

  it("does not leave stray underscores at the ends", () => {
    expect(downloadName("photo (1).jpg", "medium")).toBe("photo_1-medium.webp");
  });

  it("drops any folder part of the name", () => {
    expect(downloadName("../../etc/passwd.png", "full")).toBe("passwd-full.webp");
    expect(downloadName("C:\\Users\\me\\cat.png", "thumbnail")).toBe("cat-thumbnail.webp");
  });

  it("removes quotes, line breaks and other unsafe characters", () => {
    const name = downloadName('a"b\r\nSet-Cookie: x=1.jpg', "full");

    expect(name).toBe("a_b_Set-Cookie_x_1-full.webp");
    expect(name).not.toMatch(/["\r\n]/);
  });

  it("falls back to a plain name when nothing usable is left", () => {
    expect(downloadName("....jpg", "full")).toBe("image-full.webp");
    expect(downloadName("日本語.png", "full")).toBe("image-full.webp");
    expect(downloadName("", "full")).toBe("image-full.webp");
  });

  it("keeps the name to a sensible length", () => {
    const name = downloadName(`${"a".repeat(300)}.jpg`, "full");

    expect(name.length).toBeLessThanOrEqual(80 + "-full.webp".length);
  });
});