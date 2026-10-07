# Monkey King's Hanzi Tree

A touch-first prototype for testing whether Chinese characters stick better when the same material returns through sight, sound, and physical writing. The Monkey King handles the jokes. The learner handles the brush.

## Current curriculum boundary

- Established six-level HSK Levels 1–2 vocabulary: 300 cumulative words
- 349 distinct simplified characters drawn from those words
- A 15-character hand-curated foundation retained at the start
- 12-prompt sessions
- Writing with Hanzi Writer
- Sequential whole-word writing for multi-character vocabulary
- Word-level sound identification
- Word-level meaning recognition
- Local, pathway-specific progress
- Installable home-screen web app
- Separate pressure-sensitive writing copybook, dated sheets, and model/history comparisons

The official HSK list controls coverage. The app controls the teaching order: characters enter through writing, then unlock vocabulary words once every character in the word has been introduced. Multi-character words return as writing prompts with the whole word visible while each character is traced in sequence. HSK 2 remains locked until the complete HSK 1 character inventory has entered the rotation. Character writing, word writing, and word recognition retain separate progress records. The first 15 characters include verified stroke-type names. The rest use Hanzi Writer's stroke order and direction checking without pretending unverified stroke names are authoritative.

Curriculum coverage is pinned to the established HSK syllabus published by Chinese Testing International, rather than the HSK 3.0 trial syllabus. Vocabulary pinyin and concise English glosses were curated from CC-CEDICT-derived open data; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Run locally

```bash
npm ci
npm run test:data
npm run test:practice
npm run dev
```

Pushes to `main` build and publish through GitHub Pages.

## Writing practice

Open **Writing practice** from the home screen or Pencil icon. Choose up to 12 characters and either a copybook (model, three faint copies, three empty boxes) or a blank grid. Pencil pressure controls width. Stroke examples are optional. The module does not change lesson mastery or automatically correct writing.

Sheets autosave after completed strokes. Practice starts on the first mark, with its local date and timezone. Drafts can be continued; finished sheets are read-only. Use **Compare with model** for equal-scale side-by-side and overlay views. History filters by character and compares all written repetitions from two sessions against one saved model. Observations cover size, placement, and pen-stroke count; they are not a validated handwriting grade and do not assess component correctness or stroke order.

Handwriting is stored in IndexedDB database `mk-hanzi-tree-handwriting-v1`, separately from the existing `mk-hanzi-tree-progress-v1` localStorage record. Reference geometry is saved with each row. Records stay in the current browser and do not automatically sync. **Export** downloads a JSON backup containing ink, pressure, timestamps, and model snapshots. **Import** validates the backup and never replaces existing sheets; conflicting versions are retained as separate copies. Clearing website data removes local records. A browser or device shutdown can lose an unfinished stroke or a save that has not completed.

### Checks

```bash
npm run build
npm run test:data
npm run test:practice
npx playwright install chromium webkit
npm run test:browser
```

Browser integration tests use a fixed model fixture and simulated pen input. They do not constitute physical Apple Pencil testing. See [the iPad checklist](docs/writing-practice.md).

### Rollback checkpoint

Before this module, `main` was at `26ed7c471188410a9b0ddf724179bf7022020570`, preserved in branch `checkpoint/before-writing-practice-2026-10-07`. The module is developed in `feature/writing-practice`.

To remove the module after merging, revert its merge commit on `main` and deploy through the existing Pages workflow. Alternatively deploy the checkpoint's tree in a new commit. Do not force-reset shared history. Code rollback neither deletes nor restores handwriting: the earlier app ignores the separate handwriting database, and reinstalling the module can read it again. Export records before deliberate data deletion. The service worker update changes only this app's asset caches; neither data store is cleared.
