import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
const key = "mk-hanzi-tree-progress-v1";
const record = { writing: 2, sound: 1, meaning: 3, attempts: { writing: 4, sound: 2, meaning: 5 }, correct: { writing: 3, sound: 1, meaning: 4 } };
const progress = { introduced: 7, sessions: 4, totalPrompts: 48, characters: { 人: record }, words: { 人: record } };
const empty = { introduced: 0, sessions: 0, totalPrompts: 0, characters: {}, words: {} };
const stamp = "2026-10-07T12:00:00.000Z";
const sheet = { version: 1, id: "source-sheet", layout: "blank", status: "draft", guides: true, timezone: "UTC", createdAt: stamp, lastSavedAt: stamp, firstWritingAt: stamp, practiceDate: "2026-10-07", rows: [{ id: "row", character: "人", pinyin: "rén", meaning: "person", boxes: [[{ id: "ink", startedAt: stamp, style: "brush", sensitivity: 3, points: [{ x: .5, y: .2, pressure: .7, time: 0 }, { x: .2, y: .8, pressure: .1, time: 80 }] }], [], [], [], [], []] }] };
const backup = () => JSON.stringify({ format: "hanzi-tree-complete", version: 1, exportedAt: stamp, progress, sheets: [sheet] });
async function inspect(page: Page, contents: string) {
  await page.getByLabel("Choose complete backup").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(contents) });
}
async function sheets(page: Page) {
  return page.evaluate(async () => {
    // @ts-expect-error Vite serves the source module.
    return (await import("/src/practice/storage.ts")).listSheets();
  });
}

test("complete backup transfers lessons and pressure ink between isolated stores, survives reload, and skips duplicates", async ({ browser }) => {
  const source = await browser.newContext({ serviceWorkers: "block" });
  const destination = await browser.newContext({ serviceWorkers: "block" });
  try {
    const a = await source.newPage(); const b = await destination.newPage();
    await a.goto("http://127.0.0.1:5173/");
    await expect(a.getByRole("button", { name: "Back up or transfer progress" })).toBeVisible();
    await a.evaluate(async ({ key, progress, sheet }) => {
      localStorage.setItem(key, JSON.stringify(progress));
      // @ts-expect-error Vite source module.
      await (await import("/src/practice/storage.ts")).putSheets([sheet]);
    }, { key, progress, sheet });
    await a.reload(); await a.getByRole("button", { name: "Back up or transfer progress" }).click();
    const download = a.waitForEvent("download");
    await a.getByRole("button", { name: "Export complete backup", exact: true }).click();
    const file = await download; const content = await readFile((await file.path())!, "utf8");
    expect(JSON.parse(content).progress).toEqual(progress); expect(JSON.parse(content).sheets).toEqual([sheet]);
    await b.goto("http://127.0.0.1:5173/"); await b.getByRole("button", { name: "Back up or transfer progress" }).click();
    await inspect(b, content); await expect(b.getByLabel("Import preview")).toBeVisible();
    expect(JSON.parse((await b.evaluate(key => localStorage.getItem(key), key))!)).toEqual(empty);
    await b.getByRole("button", { name: "Apply import" }).click(); await expect(b.getByRole("status")).toContainText("Import complete");
    await b.reload(); expect(JSON.parse((await b.evaluate(key => localStorage.getItem(key), key))!)).toEqual(progress);
    expect(await sheets(b)).toEqual([sheet]);
    await b.getByRole("button", { name: "Back up or transfer progress" }).click(); await inspect(b, content); await b.getByRole("button", { name: "Apply import" }).click();
    await expect(b.getByRole("status")).toContainText("0 handwriting sheets added"); expect(await sheets(b)).toHaveLength(1);
    expect(await sheets(a)).toEqual([sheet]);
  } finally { await source.close(); await destination.close(); }
});

test("invalid backups and cancelled previews leave current lessons and sheets intact", async ({ page }) => {
  await page.goto("/"); await page.getByRole("button", { name: "Back up or transfer progress" }).click();
  const invalid = JSON.parse(backup()); invalid.progress.characters.人.correct.writing = 999;
  await inspect(page, JSON.stringify(invalid)); await expect(page.getByRole("status")).toContainText("invalid lesson scores");
  await expect(page.getByRole("button", { name: "Apply import" })).toHaveCount(0);
  await inspect(page, backup()); await page.getByRole("button", { name: "Cancel import" }).click();
  expect(JSON.parse((await page.evaluate(key => localStorage.getItem(key), key))!)).toEqual(empty); expect(await sheets(page)).toEqual([]);
});

test("failed handwriting transaction restores original lessons", async ({ page }) => {
  await page.goto("/"); await page.getByRole("button", { name: "Back up or transfer progress" }).click(); await inspect(page, backup());
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(...args: Parameters<typeof original>) {
      if (args[1] === "readwrite") throw new Error("Simulated disk failure");
      return original.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "Apply import" }).click(); await expect(page.getByRole("status")).toContainText("Simulated disk failure");
  expect(JSON.parse((await page.evaluate(key => localStorage.getItem(key), key))!)).toEqual(empty); expect(await sheets(page)).toEqual([]);
});
