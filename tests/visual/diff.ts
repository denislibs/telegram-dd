import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export const DIFF_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '__diff__');

export interface DiffResult {
  width: number;
  height: number;
  diffPixels: number;
  /** diffPixels / (width * height), 0..1. */
  ratio: number;
  sizeMismatch: boolean;
  files: { reference: string; candidate: string; diff: string };
}

/** Copies a PNG onto a transparent canvas of the given size (screens of different size are still comparable). */
function pad(png: PNG, width: number, height: number): PNG {
  if (png.width === width && png.height === height) return png;
  const out = new PNG({ width, height });
  PNG.bitblt(png, out, 0, 0, png.width, png.height, 0, 0);
  return out;
}

/** Diffs two PNG screenshots with pixelmatch and writes `<name>.{reference,candidate,diff}.png` to __diff__/. */
export function diffScreenshots(
  name: string,
  referenceBuffer: Buffer,
  candidateBuffer: Buffer,
  pixelThreshold = 0.1,
): DiffResult {
  const referenceRaw = PNG.sync.read(referenceBuffer);
  const candidateRaw = PNG.sync.read(candidateBuffer);
  const width = Math.max(referenceRaw.width, candidateRaw.width);
  const height = Math.max(referenceRaw.height, candidateRaw.height);
  const reference = pad(referenceRaw, width, height);
  const candidate = pad(candidateRaw, width, height);
  const diff = new PNG({ width, height });

  let diffPixels = pixelmatch(reference.data, candidate.data, diff.data, width, height, {
    threshold: pixelThreshold,
    includeAA: false,
  });
  const sizeMismatch = referenceRaw.width !== candidateRaw.width || referenceRaw.height !== candidateRaw.height;
  if (sizeMismatch) {
    // The padded area counts as different even where both canvases happen to be transparent.
    const sharedPixels =
      Math.min(referenceRaw.width, candidateRaw.width) * Math.min(referenceRaw.height, candidateRaw.height);
    diffPixels = Math.max(diffPixels, width * height - sharedPixels);
  }

  mkdirSync(DIFF_DIR, { recursive: true });
  const files = {
    reference: resolve(DIFF_DIR, `${name}.reference.png`),
    candidate: resolve(DIFF_DIR, `${name}.candidate.png`),
    diff: resolve(DIFF_DIR, `${name}.diff.png`),
  };
  writeFileSync(files.reference, referenceBuffer);
  writeFileSync(files.candidate, candidateBuffer);
  writeFileSync(files.diff, PNG.sync.write(diff));

  return { width, height, diffPixels, ratio: diffPixels / (width * height), sizeMismatch, files };
}
