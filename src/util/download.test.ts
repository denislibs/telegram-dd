// Original test (not in telegram-tt): the file name of a download comes from the sender and is cleaned before it reaches
// `a.download` and the service worker's `Content-Disposition`.
import { afterEach, describe, expect, it, vi } from 'vitest';

import download, { sanitizeDownloadFilename } from './download';

describe('sanitizeDownloadFilename', () => {
  it('keeps an ordinary name', () => {
    expect(sanitizeDownloadFilename('report final (2).pdf')).toBe('report final (2).pdf');
    expect(sanitizeDownloadFilename('отчёт.pdf')).toBe('отчёт.pdf');
  });

  it('removes the bidi override that spoofs an extension', () => {
    const name = sanitizeDownloadFilename('report.pdf‮exe.gpj');
    expect(name).toBe('report.pdfexe.gpj');
    expect(name).not.toMatch(/[‪-‮⁦-⁩]/);
  });

  it('removes control, zero-width and separator characters', () => {
    expect(sanitizeDownloadFilename('a\u0000b\u001Fc\u007Fd\u0085e​f g﻿h')).toBe('abcdefgh');
  });

  it('replaces path separators and drops leading dots and spaces', () => {
    expect(sanitizeDownloadFilename('../../etc/passwd')).toBe('.._.._etc_passwd'.replace(/^\.+/, ''));
    expect(sanitizeDownloadFilename('..\\win\\sys.dll')).toBe('_win_sys.dll');
    expect(sanitizeDownloadFilename('.hidden')).toBe('hidden');
    expect(sanitizeDownloadFilename('   spaced.txt  ')).toBe('spaced.txt');
  });

  it('caps the length and keeps a short extension', () => {
    const name = sanitizeDownloadFilename(`${'a'.repeat(5000)}.zip`);
    expect(name.length).toBeLessThanOrEqual(180);
    expect(name.endsWith('.zip')).toBe(true);
  });

  it('never returns an empty name', () => {
    expect(sanitizeDownloadFilename('')).toBe('file');
    expect(sanitizeDownloadFilename(undefined)).toBe('file');
    expect(sanitizeDownloadFilename('‮‮')).toBe('file');
    expect(sanitizeDownloadFilename('...')).toBe('file');
  });

  it('is idempotent', () => {
    const once = sanitizeDownloadFilename('x‮/..\\y.tar.gz');
    expect(sanitizeDownloadFilename(once)).toBe(once);
  });
});

describe('download', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('clicks a link with a sanitised name, in a new window without an opener', async () => {
    vi.useFakeTimers();
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
      clicked.push(this);
    });

    download('blob:http://localhost/x', 'evil‮exe.txt');
    await vi.advanceTimersByTimeAsync(1100);

    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe('evilexe.txt');
    expect(clicked[0].rel).toBe('noopener noreferrer');
    expect(clicked[0].target).toBe('_blank');
  });
});
