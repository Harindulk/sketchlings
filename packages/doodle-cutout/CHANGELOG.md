# Changelog

## 0.2.0 (2026-10-23)

Fixes found while getting ready for a play session with children aged 4-10. Every fix has a test that fails without
it, and [BENCHMARK.md](BENCHMARK.md) has the before/after table.

### Fixed

- **Thin faint strokes next to a dark marker.** Thin pencil or pink wings and antennae were erased when the drawing
  also used a dark marker, because the marker pushed the threshold up. In hysteresis, thin strokes (what a small
  opening removes) now only have to clear the paper noise floor; thick faint ink keeps the half-threshold rule, so
  crayon fills and shadows behave exactly as before. On lined paper, thin strokes a little darker than the printed
  lines are now kept too.
- **Big coloured-in drawings.** A creature coloured in over about half the photo gave "no drawing" or line-art
  fragments. The page's white balance and the noise floor were global medians, which then fell inside the crayon;
  they now come from paper-like tiles only. When a quarter of the photo lies between the noise floor and the Otsu
  threshold, Otsu runs again below it, so the threshold separates crayon from paper rather than outline from crayon.
- A small sheet on a wide dark table no longer comes out as the whole sheet (a side effect of the threshold fix).

### Added

- `examples/demo.html`: a web page that cuts out a photo you pick, all in the browser (`bun examples/demo.html`).
- `examples/cutout-png.ts`: PNG in, sprite out, from the command line.
- `scripts/bench.ts`: the before/after benchmark, with `--baseline <old src/>`.
- GitHub Actions CI (typecheck, tests, build), `CONTRIBUTING.md`, this changelog.
- `prepare` script, so `npm install github:Harindulk/doodle-cutout` builds `dist/`.

## 0.1.0 (2026-10-21)

First release, built for Sketchlings.

- Paper and lighting estimate (flat plus paraboloid closing, O(n)), flatten, ink score from darkness, colourfulness and
  saturation, Otsu with hysteresis, gap closing, hole filling, sticker outline, palette and ink coverage.
- What surrounds the sheet (table, fingers, the paper's edge and its shadow) is cut away without losing strokes drawn
  down to the paper's edge.
- Ruled and squared paper: the printed lines are measured on the sheet's emptiest parts and taken off thin structures.
- 39 tests on synthetic photos, with no image files and no dependencies.
