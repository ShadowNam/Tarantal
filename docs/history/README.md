# Development history

`Tarantal-Development-History.docx` is a Word document for the product owner. It records how the game
was built, milestone by milestone, with screenshots. A new chapter is added each time a milestone
merges.

- `history-data.cjs`: all the text (stages, requests, what's next, decisions, glossary).
- `img/`: JPEG images (max 1400 px wide, quality 80).
  - `img/renders/` holds screenshots rebuilt from old commits.
  - The other images come from committed previews and visual-test baselines.
- `build-history.cjs`: turns the data and images into the `.docx`.

## Add a milestone

1. Add an entry to `stages` in `history-data.cjs`: title, when (UTC), PRs, decision, bullets, what the
   product owner asked for, and images. Update `meta.updated`, `numbers`, `requests` and `next`.
2. Put its images in `img/` as JPEGs. Before|after previews come from `docs/art-preview/compare/`, and
   the hunt frame from `tests/e2e/visual-baselines/hunt-desktop-chromium.png`.
3. Build and check:
   ```bash
   NODE_PATH=$(npm root -g) node docs/history/build-history.cjs
   ```
   It needs the `docx` npm package. It is preinstalled globally in the Claude Code sandbox; anywhere
   else, use `npm i -g docx`. The script lists any missing images.
4. Commit the data, the images and the rebuilt `.docx` together.
