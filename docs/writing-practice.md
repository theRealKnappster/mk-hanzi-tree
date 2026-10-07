# Writing practice: iPad acceptance

Use Alice's iPad Pro, Apple Pencil 2nd generation, and Safari or the existing home-screen app. Open Writing practice after loading the updated app. This check uses practice data only; no lesson progress reset is required.

1. Create a copybook for 人. Confirm the reference, three faint copies, and three blank boxes are visible and comfortably sized in landscape.
2. Write a light line, a firmer line, then a continuous line while increasing and reducing pressure. Ink width should respond within a stroke. Lifting the Pencil should end that stroke.
3. Rest a palm on the page in Pencil mode. Confirm there are no unwanted palm/finger marks. Try outside-paper scrolling. Use Finger / mouse mode only when intentionally drawing without a Pencil.
4. Tap another box. Test undo, redo, stroke erasing, and clear-box confirmation. Other boxes should stay unchanged.
5. Wait for “Saved on this device.” Reload and reopen the draft. Confirm handwriting is identical. Rotate the iPad and confirm the same proportions remain.
6. Select a filled box and open Compare with model. Check side-by-side, overlay alignment, and size/placement observations. The app should preserve differences rather than stretching handwriting to fit the model.
7. Finish the sheet. Confirm writing and erasing are disabled. Start “Practice these characters again,” write another attempt, and check that History contains two separate sheets. Later repeat on another date.
8. Filter History to 人, choose the two sheets, and confirm all written repetitions appear at the same scale. Switching the comparison model applies it to both panes.
9. Export a backup to Files. Import it again: identical sheets should not duplicate. Import on another browser/device to check transfer. Keep the exported file independently of browser storage.
10. Return to the original lesson flow and confirm lesson progress, pronunciation, and multi-character exercises still work.

The module measures geometry against saved reference paths; it does not judge calligraphic style, identify missing components, validate stroke order, or award mastery. Pressure is recorded and used to render ink, not graded. Drafts are stored on the device, and unfinished strokes/pending saves may be lost if the browser closes abruptly. Finished pages cannot be edited; new practice creates new history.

## Storage and rollback

Existing lessons retain their localStorage format. Practice uses a separately named IndexedDB database, with a versioned backup format. No update or rollback clears either store. Local backups contain handwriting only; the pre-existing lesson progress is not included in handwriting exports. The repository's checkpoint preserves code, not device data.

Known character references are fetched through Hanzi Writer and saved with rows. A missing model does not prevent writing; comparison is unavailable for that row. Finished sheets use their saved references. Comparing dates explicitly chooses one saved model for both panes.

## Brush ink

The writing toolbar stays at the top of the screen while scrolling a sheet. Landscape spacing is compact, with 44-pixel minimum tap targets and the three ink tools kept together.

Brush is the default drawing tool. It has a wider pressure-to-width range than Fine pen, and the Balanced response reaches its broadest width at half the reported pressure. Light touch needs still less pressure; Firm uses the full pressure range. Input → Pencil identifies the Apple Pencil device, independently of the ink tool. This is pressure-driven brush ink, not a simulation of individual bristles or tilt.

Each stroke stores its tool and pressure response alongside raw samples, so changing tools or sensitivity does not redraw earlier writing. Strokes saved before brush support keep the original pen rendering. These optional fields also roundtrip through version 1 backups. Erasing accounts for brush width.
