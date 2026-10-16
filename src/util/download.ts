import { pause } from './schedulers';

type PendingDownload = {
  url: string;
  filename: string;
};

// Chrome prevents more than 10 downloads per second
const LIMIT_PER_BATCH = 10;
const BATCH_INTERVAL = 1000;

const MAX_FILENAME_LENGTH = 180;
const MAX_EXTENSION_LENGTH = 16;
const FALLBACK_FILENAME = 'file';
// C0 / DEL / C1 controls, bidi controls (U+061C, U+200E-200F, U+202A-202E, U+2066-2069), zero-width characters
// (U+200B-200D, U+2060, U+FEFF), line / paragraph separators and the Windows / POSIX path characters.
// eslint-disable-next-line no-control-regex
const UNSAFE_FILENAME_CHARS = /[\u0000-\u001F\u007F-\u009F\u061C\u200B-\u200F\u2028-\u202E\u2060\u2066-\u2069\uFEFF]/g;
const PATH_FILENAME_CHARS = /[/\\:*?"<>|]/g;

let pendingDownloads: PendingDownload[] = [];
let planned = false;

export default function download(url: string, filename: string) {
  pendingDownloads.push({ url, filename });
  if (!planned) {
    planned = true;
    setTimeout(async () => {
      await processQueue();
      planned = false;
    }, BATCH_INTERVAL);
  }
}

async function processQueue() {
  let count = 0;
  for (const pendingDownload of pendingDownloads) {
    downloadOne(pendingDownload);
    count++;
    if (count === LIMIT_PER_BATCH) {
      await pause(BATCH_INTERVAL);
      count = 0;
    }
  }
  pendingDownloads = [];
}

// Deviation (untrusted): the file name comes from the sender (`a.download` and the `Content-Disposition` of the service
// worker). Control and bidi characters (`report.pdf\u202Eexe.gpj` reads as `report.pdfjpg.exe`), path separators and
// leading dots are removed, the length is capped with the extension kept. Idempotent.
export function sanitizeDownloadFilename(filename: string | undefined) {
  const cleaned = (filename ?? '')
    .replace(UNSAFE_FILENAME_CHARS, '')
    .replace(PATH_FILENAME_CHARS, '_')
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '');

  if (!cleaned) return FALLBACK_FILENAME;
  if (cleaned.length <= MAX_FILENAME_LENGTH) return cleaned;

  const dotIndex = cleaned.lastIndexOf('.');
  const extension = dotIndex > 0 && cleaned.length - dotIndex <= MAX_EXTENSION_LENGTH ? cleaned.slice(dotIndex) : '';
  return cleaned.slice(0, MAX_FILENAME_LENGTH - extension.length) + extension;
}

function downloadOne({ url, filename }: PendingDownload) {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.download = sanitizeDownloadFilename(filename);
  try {
    link.click();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err); // Suppress redundant "Blob loading failed" error popup on IOS
  }
}
