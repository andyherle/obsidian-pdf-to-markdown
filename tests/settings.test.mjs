import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, normalizeSettings } from "../.test-build/types.js";

test("saved settings are validated and clamped", () => {
  const settings = normalizeSettings({
    sourceAction: "remove",
    imageFormat: "avif",
    imageQuality: 0.1,
    maxImageDimension: 99_999,
    minImageDimension: -50,
    tableMinConfidence: 1,
    extractImages: false
  });
  assert.equal(settings.sourceAction, DEFAULT_SETTINGS.sourceAction);
  assert.equal(settings.imageFormat, DEFAULT_SETTINGS.imageFormat);
  assert.equal(settings.imageQuality, 0.45);
  assert.equal(settings.maxImageDimension, 8000);
  assert.equal(settings.minImageDimension, 1);
  assert.equal(settings.tableMinConfidence, 0.9);
  assert.equal(settings.extractImages, false);
});

test("missing settings use stable defaults", () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
});
