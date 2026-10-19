import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from '../vendor/pdf-lib.js';
import { loadPdf, buildPdf, parseRanges, everyN, repack, picturesToPdf, pageCount } from '../src/pdf-ops.js';

const JPEG = Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDkKKKK8U/TD//Z', 'base64'));

async function sample(pages, label = 'p') {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200 + i * 10, 300]).drawText(`${label}${i + 1}`);
  return doc.save();
}
const sizes = async (bytes) => (await loadPdf(bytes)).getPages().map((p) => Math.round(p.getWidth()));

test('merge keeps the given order across files', async () => {
  const a = await sample(2, 'a');
  const b = await sample(3, 'b');
  const out = await buildPdf([a, b], [{ src: 1, index: 2 }, { src: 0, index: 0 }, { src: 1, index: 0 }]);
  assert.deepEqual(await sizes(out), [220, 200, 200]);
});

test('rotate adds to the existing rotation and wraps at 360', async () => {
  const a = await sample(1);
  const once = await buildPdf([a], [{ src: 0, index: 0, rotate: 270 }]);
  assert.equal((await loadPdf(once)).getPage(0).getRotation().angle, 270);
  const twice = await buildPdf([once], [{ src: 0, index: 0, rotate: 180 }]);
  assert.equal((await loadPdf(twice)).getPage(0).getRotation().angle, 90);
});

test('extracting and deleting pages', async () => {
  const a = await sample(4);
  const out = await buildPdf([a], [{ src: 0, index: 1 }, { src: 0, index: 3 }]);
  assert.equal(await pageCount(out), 2);
  await assert.rejects(buildPdf([a], []), /empty/);
});

test('page ranges', () => {
  assert.deepEqual(parseRanges('1-3, 5, 7-', 8), [[0, 1, 2], [4], [6, 7]]);
  assert.deepEqual(parseRanges('2', 3), [[1]]);
  for (const bad of ['0', '4', '3-2', 'a', '1-9', '-2']) assert.throws(() => parseRanges(bad, 3), /range/);
  assert.throws(() => parseRanges('  ', 3), /range/);
});

test('every N pages', () => {
  assert.deepEqual(everyN(5, 2), [[0, 1], [2, 3], [4]]);
  assert.deepEqual(everyN(2, 5), [[0, 1]]);
});

test('invalid and encrypted files are told apart', async () => {
  await assert.rejects(loadPdf(new Uint8Array([1, 2, 3])), /invalid/);
});

test('repack keeps all pages', async () => {
  const a = await sample(3);
  const out = await repack(a);
  assert.deepEqual(await sizes(out), await sizes(a));
});

test('pictures become pages of the given size', async () => {
  const out = await picturesToPdf([{ jpeg: JPEG, width: 210, height: 297 }, { jpeg: JPEG, width: 100, height: 50 }]);
  assert.deepEqual((await loadPdf(out)).getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]), [[210, 297], [100, 50]]);
});
