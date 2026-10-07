import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const reference = JSON.parse(readFileSync(new URL("./fixtures/ren.json", import.meta.url), "utf8"));

const lessonProgress = { introduced: 5, sessions: 1, totalPrompts: 12, characters: {}, words: {} };

test.beforeEach(async ({ page }) => {
  await page.route("**/hanzi-writer-data@*/**", (route) => route.fulfill({ json: reference, headers: { "access-control-allow-origin": "*" } }));
  await page.addInitScript((progress) => {
    if (!localStorage.getItem("mk-hanzi-tree-progress-v1")) localStorage.setItem("mk-hanzi-tree-progress-v1", JSON.stringify(progress));
  }, lessonProgress);
});

async function openPractice(page: Page, blank = false) {
  await page.goto("/");
  await page.getByRole("button", { name: "Open writing practice" }).click();
  await page.getByLabel("Characters to practice").fill("人");
  if (blank) await page.getByRole("button", { name: "Blank boxes", exact: false }).click();
  await page.getByRole("button", { name: "Open the paper" }).click();
  await expect(page.getByText("Saved on this device", { exact: true })).toBeVisible();
}

async function penStroke(canvas: Locator) {
  await canvas.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const event = (type: string, x: number, y: number, pressure: number) => element.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 17, pointerType: "pen", button: 0, buttons: type === "pointerup" ? 0 : 1,
      clientX: rect.left + rect.width * x, clientY: rect.top + rect.height * y, pressure,
    }));
    event("pointerdown", .5, .2, .1);
    event("pointermove", .4, .4, .8);
    event("pointermove", .25, .75, .05);
    event("pointerup", .25, .75, 0);
  });
}

async function records(page: Page) {
  return page.evaluate(async () => {
    // @ts-expect-error Vite serves this TypeScript module for browser integration tests.
    const storage = await import("/src/practice/storage.ts");
    return storage.listSheets();
  });
}

test("pressure, autosave, undo/redo, reload and resizing preserve ink and existing lessons", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await openPractice(page);
  const canvas = page.locator('canvas[aria-label="Write 人, box 1"]');
  await penStroke(canvas);
  await expect.poll(async () => (await records(page))[0].rows[0].boxes[0].length).toBe(1);
  await expect.poll(async () => (await records(page))[0].rows[0].reference?.strokes).toEqual(reference.strokes);
  const original = (await records(page))[0];
  const pressures = original.rows[0].boxes[0][0].points.map((point: { pressure: number }) => point.pressure);
  expect(pressures).toHaveLength(3);
  [.1, .8, .05].forEach((pressure, index) => expect(pressures[index]).toBeCloseTo(pressure, 6));
  await expect.poll(async () => (await records(page))[0].rows[0].reference?.strokes).toEqual(reference.strokes);
  expect(original.rows[0].reference.strokes).toEqual(reference.strokes);
  await page.getByRole("button", { name: "Undo last ink edit" }).click();
  await expect.poll(async () => (await records(page))[0].rows[0].boxes[0].length).toBe(0);
  await page.getByRole("button", { name: "Redo last ink edit" }).click();
  await expect.poll(async () => (await records(page))[0].rows[0].boxes[0].length).toBe(1);
  await page.getByRole("button", { name: "Compare with model", exact: true }).click();
  await expect(page.getByRole("region", { name: "Compare with the model" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open writing practice" }).click();
  await page.locator(".draft-list button").first().click();
  await page.setViewportSize({ width: 834, height: 1194 });
  const restored = (await records(page))[0];
  expect(restored.rows[0].boxes[0]).toEqual(original.rows[0].boxes[0]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mk-hanzi-tree-progress-v1")!))).toEqual(lessonProgress);
  await page.screenshot({ path: `test-results/${test.info().project.name}-copybook.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("brush and fine pen retain their own appearance when changing pressure settings and reloading", async ({ page }) => {
  await openPractice(page);
  const canvas = page.locator('canvas[aria-label="Write 人, box 1"]');
  await expect(page.getByRole("button", { name: "Brush", exact: true })).toHaveAttribute("aria-pressed", "true");
  await penStroke(canvas);
  await expect.poll(async () => (await records(page))[0].rows[0].boxes[0].length).toBe(1);
  await page.getByLabel("Brush pressure response").selectOption("3");
  await penStroke(canvas);
  await expect.poll(async () => (await records(page))[0].rows[0].boxes[0].length).toBe(2);
  await page.getByRole("button", { name: "Fine pen", exact: true }).click();
  await penStroke(canvas);
  await expect.poll(async () => (await records(page))[0].rows[0].boxes[0].length).toBe(3);
  const original = (await records(page))[0].rows[0].boxes[0];
  expect(original.map((stroke: { style: string; sensitivity?: number }) => [stroke.style, stroke.sensitivity])).toEqual([["brush", 2], ["brush", 3], ["pen", undefined]]);
  await page.reload();
  await page.getByRole("button", { name: "Open writing practice" }).click();
  await page.locator(".draft-list button").first().click();
  expect((await records(page))[0].rows[0].boxes[0]).toEqual(original);
});

test("finished sheets are read-only; another session appears in same-character comparisons", async ({ page }) => {
  await openPractice(page, true);
  await penStroke(page.locator('canvas[aria-label="Write 人, box 2"]'));
  await expect.poll(async () => (await records(page))[0].rows[0].boxes[1].length).toBe(1);
  await expect(page.getByRole("button", { name: "Finish sheet" })).toBeEnabled();
  await page.getByRole("button", { name: "Finish sheet" }).click();
  await expect.poll(async () => (await records(page))[0].status).toBe("finished");
  await penStroke(page.locator('canvas[aria-label="Write 人, box 2"]'));
  expect((await records(page))[0].rows[0].boxes[1]).toHaveLength(1);
  await page.getByRole("button", { name: "Practice these characters again" }).click();
  await penStroke(page.locator('canvas[aria-label="Write 人, box 1"]'));
  await expect.poll(async () => (await records(page)).length).toBe(2);
  await expect(page.getByText("Saved on this device", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByLabel("Filter handwriting by character").selectOption("人");
  await expect(page.getByRole("region", { name: "Compare 人 over time" })).toBeVisible();
  await expect(page.locator(".history-repetitions figure")).toHaveCount(2);
  await page.screenshot({ path: `test-results/${test.info().project.name}-history.png`, fullPage: true });
});

test("backup imports do not overwrite sheets; rejected imports leave records unchanged", async ({ page }) => {
  await openPractice(page);
  await penStroke(page.locator('canvas[aria-label="Write 人, box 1"]'));
  await expect(page.getByText("Saved on this device", { exact: true })).toBeVisible();
  const original = await records(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(`test-results/${test.info().project.name}-backup.json`);
  await page.locator('input[type="file"]').setInputFiles(`test-results/${test.info().project.name}-backup.json`);
  await expect(page.getByText("Imported 0 sheets. Existing sheets were preserved.")).toBeVisible();
  expect(await records(page)).toEqual(original);
  await page.locator('input[type="file"]').setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"format":"wrong"}') });
  await expect(page.getByText("Choose a Hanzi Tree handwriting backup (version 1).")).toBeVisible();
  expect(await records(page)).toEqual(original);
});

test("Safari stylus touch input records force once and ignores palm touches in Pencil mode", async ({ page }) => {
  await openPractice(page);
  const canvas = page.locator('canvas[aria-label="Write 人, box 1"]');
  await canvas.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const touch = (id: number, type: string, x: number, y: number, force: number) => ({ identifier: id, touchType: type, clientX: rect.left + rect.width * x, clientY: rect.top + rect.height * y, force });
    const dispatch = (type: string, touches: object[]) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "changedTouches", { value: touches });
      Object.defineProperty(event, "touches", { value: type === "touchend" ? [] : touches });
      element.dispatchEvent(event);
    };
    dispatch("touchstart", [touch(1, "direct", .2, .2, 0)]);
    dispatch("touchmove", [touch(1, "direct", .5, .5, 0)]);
    dispatch("touchend", [touch(1, "direct", .5, .5, 0)]);
    element.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", pointerId: 2, bubbles: true }));
    dispatch("touchstart", [touch(2, "stylus", .5, .2, .12)]);
    dispatch("touchmove", [touch(2, "stylus", .4, .5, .85)]);
    dispatch("touchmove", [touch(2, "stylus", .2, .8, .04)]);
    dispatch("touchend", [touch(2, "stylus", .2, .8, 0)]);
  });
  await expect.poll(async () => (await records(page))[0].rows[0].boxes[0].length).toBe(1);
  expect((await records(page))[0].rows[0].boxes[0][0].points.map((point: { pressure: number }) => point.pressure)).toEqual([.12, .85, .04]);
});

test("stroke erasing and undo affect only the selected box", async ({ page }) => {
  await openPractice(page);
  const first = page.locator('canvas[aria-label="Write 人, box 1"]');
  await penStroke(first);
  await penStroke(page.locator('canvas[aria-label="Write 人, box 2"]'));
  await expect.poll(async () => (await records(page))[0].rows[0].boxes[1].length).toBe(1);
  await page.getByRole("button", { name: "Eraser", exact: true }).click();
  await penStroke(first);
  await expect.poll(async () => (await records(page))[0].rows[0].boxes[0].length).toBe(0);
  expect((await records(page))[0].rows[0].boxes[1]).toHaveLength(1);
  await page.getByRole("button", { name: "Undo last ink edit" }).click();
  await expect.poll(async () => (await records(page))[0].rows[0].boxes[0].length).toBe(1);
});

test("failed saves are visible, block leaving, and can recover without losing ink", async ({ page }) => {
  await openPractice(page);
  await expect.poll(async () => (await records(page))[0].rows[0].reference?.strokes).toEqual(reference.strokes);
  await expect(page.getByText("Saved on this device", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    Object.assign(window, { restorePracticeTransactions: () => { IDBDatabase.prototype.transaction = original; } });
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      if (args[1] === "readwrite") throw new DOMException("Simulated storage failure", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  await penStroke(page.locator('canvas[aria-label="Write 人, box 1"]'));
  await expect(page.getByText("Not saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close writing practice" }).click();
  await expect(page.getByRole("heading", { name: "Writing practice", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish sheet" })).toBeDisabled();
  await page.evaluate(() => (window as unknown as { restorePracticeTransactions: () => void }).restorePracticeTransactions());
  await page.getByRole("button", { name: "Retry saving" }).click();
  await expect(page.getByText("Saved on this device", { exact: true })).toBeVisible();
  expect((await records(page))[0].rows[0].boxes[0]).toHaveLength(1);
});
