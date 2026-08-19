import test from "node:test";
import assert from "node:assert/strict";
import { fitImageDimensions, MAX_CANVAS_PIXELS } from "../.test-build/pdf/dimensions.js";

test("image dimensions preserve aspect ratio and do not upscale embedded images", () => {
  assert.deepEqual(
    fitImageDimensions(4000, 2000, 2000),
    { width: 2000, height: 1000, scale: 0.5, pixelLimited: false }
  );
  assert.deepEqual(
    fitImageDimensions(800, 400, 2000),
    { width: 800, height: 400, scale: 1, pixelLimited: false }
  );
});

test("page snapshots can upscale but remain within the memory cap", () => {
  const fitted = fitImageDimensions(1000, 1000, 8000, { allowUpscale: true, maxScale: 4 });
  assert.equal(fitted.width, 4000);
  assert.equal(fitted.height, 4000);
  assert.equal(fitted.width * fitted.height, MAX_CANVAS_PIXELS);
  assert.equal(fitted.pixelLimited, false);

  const limited = fitImageDimensions(8000, 8000, 8000);
  assert.ok(limited.width * limited.height <= MAX_CANVAS_PIXELS);
  assert.equal(limited.pixelLimited, true);
});
