import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const types = await load('../src/practice/types.ts');
const ink = await load('../src/practice/ink.ts');
const storage = await load('../src/practice/storage.ts');
const character = { character: '人', pinyin: 'rén', meaning: 'person' };
const stroke = { id: 'stroke-1', startedAt: '2026-10-07T18:00:00.000Z', points: [
  { x: .3, y: .2, pressure: .12, time: 0 },
  { x: .45, y: .55, pressure: .82, time: 100 },
  { x: .2, y: .8, pressure: .08, time: 250 },
] };

test('practice begins on first ink; opening, references, and empty boxes do not count', () => {
  const sheet = types.makeSheet([character], 'copybook', true);
  assert.equal(sheet.firstWritingAt, undefined);
  assert.equal(types.writtenBoxes(sheet), 0);
  assert.deepEqual(types.writtenCharacters(sheet), []);
  const written = types.editBox(sheet, sheet.rows[0].id, 0, [stroke]);
  assert.equal(written.firstWritingAt, stroke.startedAt);
  assert.equal(types.writtenBoxes(written), 1);
  assert.deepEqual(types.writtenCharacters(written), ['人']);
  assert.equal(types.writtenBoxes(sheet), 0, 'original sheet is unchanged');
});

test('date stays with first writing and finished sheets cannot be edited', () => {
  const sheet = types.makeSheet([character], 'blank', false);
  const first = types.editBox(sheet, sheet.rows[0].id, 0, [stroke]);
  const later = types.editBox(first, sheet.rows[0].id, 1, [{ ...stroke, id: 'later', startedAt: '2026-10-09T18:00:00Z' }], new Date('2026-10-09T18:00:00Z'));
  assert.equal(later.practiceDate, first.practiceDate);
  const finished = { ...later, status: 'finished' };
  assert.equal(types.editBox(finished, sheet.rows[0].id, 0, []), finished);
});

test('normalized samples preserve geometry across different screen sizes', () => {
  const small = ink.inkPoint(60, 80, .73, 15, { left: 10, top: 30, width: 100, height: 100 });
  const large = ink.inkPoint(110, 130, .73, 15, { left: 10, top: 30, width: 200, height: 200 });
  assert.deepEqual(small, large);
  assert.equal(small.pressure, .73);
  assert.ok(ink.pressureWidth(.8) > ink.pressureWidth(.1));
});

test('brush pressure has a visible width range at light pressures and preserves legacy pen ink', () => {
  const brush = { style: 'brush', sensitivity: 2 };
  assert.ok(ink.strokeWidth(.35, brush) / ink.strokeWidth(.08, brush) > 4);
  assert.ok(ink.strokeWidth(.25, { ...brush, sensitivity: 3 }) > ink.strokeWidth(.25, brush));
  assert.equal(ink.strokeWidth(.4, {}), ink.pressureWidth(.4));
  assert.equal(ink.strokeWidth(.4, { style: 'pen' }), ink.pressureWidth(.4));
  assert.ok(ink.strokeWidth(1, brush) < .13, 'maximum remains bounded inside a character box');
});

test('saved brush appearance roundtrips alongside older pen strokes; invalid settings are rejected', () => {
  const sheet = types.makeSheet([character], 'copybook', true);
  sheet.rows[0].boxes[0] = [stroke, { ...stroke, id: 'brush', style: 'brush', sensitivity: 3 }];
  assert.deepEqual(storage.parseBackup(storage.serializeBackup([sheet])), [sheet]);
  sheet.rows[0].boxes[0][1].sensitivity = 100;
  assert.throws(() => storage.parseBackup(storage.serializeBackup([sheet])), /brush settings/);
});

test('backup roundtrip preserves handwriting pressure, time, dates, and reference geometry', () => {
  let sheet = types.makeSheet([character], 'copybook', true);
  sheet = types.editBox(sheet, sheet.rows[0].id, 0, [stroke]);
  sheet.rows[0].reference = { strokes: ['M 100 100 L 200 300 Z'], medians: [[[100, 100], [200, 300]]], source: 'saved model' };
  const restored = storage.parseBackup(storage.serializeBackup([sheet]));
  assert.deepEqual(restored, [sheet]);
  const malicious = JSON.parse(storage.serializeBackup([sheet]));
  malicious.sheets[0].rows[0].boxes[0][0].points[0].pressure = 3;
  assert.throws(() => storage.parseBackup(JSON.stringify(malicious)), /ink samples/);
  malicious.sheets[0].rows[0].boxes[0][0].points[0].pressure = .1;
  malicious.sheets[0].timezone = 'not-a-zone';
  assert.throws(() => storage.parseBackup(JSON.stringify(malicious)), /timezone/);
});

test('imports preserve existing sheets and do not overwrite conflicts', () => {
  const original = types.makeSheet([character], 'blank', true);
  assert.equal(storage.mergeBackup([original], [structuredClone(original)]).length, 0);
  const changed = { ...original, status: 'finished' };
  const additions = storage.mergeBackup([original], [changed]);
  assert.equal(additions.length, 1);
  assert.notEqual(additions[0].id, original.id);
  assert.equal(original.status, 'draft');
});

test('model coordinates use fixed box alignment; comparisons do not stretch ink to fit', () => {
  assert.deepEqual(ink.modelPoint([0, 900]), { x: .08, y: .08 });
  const reference = { strokes: ['M 0 0 L 1 1'], medians: [[[300, 650], [700, 250]]], source: 'test' };
  const aligned = [{ ...stroke, points: reference.medians[0].map((point, index) => ({ ...ink.modelPoint(point), pressure: .2, time: index })) }];
  assert.match(ink.compareInk(aligned, reference)[0].text, /close/);
  const shifted = [{ ...aligned[0], points: aligned[0].points.map((point) => ({ ...point, x: point.x + .15 })) }];
  assert.ok(ink.compareInk(shifted, reference).some((observation) => /right/.test(observation.text)));
});
