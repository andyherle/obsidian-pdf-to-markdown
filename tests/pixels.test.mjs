import test from "node:test";
import assert from "node:assert/strict";
import { classifyRawPixels, sampleCoordinate } from "../.test-build/pdf/pixels.js";

test("missing PDF.js image-kind constants do not match an undefined image kind", () => {
  assert.equal(classifyRawPixels(4, 2, 2, undefined, {}), "gray8");
  assert.equal(classifyRawPixels(2, 2, 2, undefined, {}), "gray1");
});

test("explicit image kinds require enough bytes", () => {
  const kinds = { RGBA_32BPP: 3, RGB_24BPP: 2, GRAYSCALE_1BPP: 1 };
  assert.equal(classifyRawPixels(15, 2, 2, 3, kinds), null);
  assert.equal(classifyRawPixels(16, 2, 2, 3, kinds), "rgba");
  assert.equal(classifyRawPixels(12, 2, 2, 2, kinds), "rgb");
  assert.equal(classifyRawPixels(2, 9, 1, 1, kinds), "gray1");
});

test("downsample coordinates stay inside the source image", () => {
  assert.equal(sampleCoordinate(0, 2, 8), 2);
  assert.equal(sampleCoordinate(1, 2, 8), 6);
  assert.equal(sampleCoordinate(9, 10, 3), 2);
});
