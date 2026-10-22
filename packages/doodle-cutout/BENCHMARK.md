# Benchmark: 0.1.0 → 0.2.0

Every case in `scripts/photos.ts`, plus the phone app's bundled sample photo, run through the code before the 0.2.0
fixes and after, with the options the Sketchlings phone uses (`{outline: 8}`). To reproduce, check out the last 0.1.0
commit next to this one and point the bench at its `src/`:

```sh
git worktree add ../before <last 0.1.0 commit>
bun scripts/bench.ts --baseline ../before/src path/to/photo.png
```

- **Before / After:** the drawing's bounding box in input pixels, and how much of the photo the final mask covers.
- **Mask IoU:** how alike the two masks are (intersection over union, at working resolution). 1.000 means unchanged.
- **Times:** median of 3 runs, on a busy machine (a virtual Fire TV device and a headless browser were running), so
  compare them within a row, not with the README's table.

| Case | Size | Before | After | Mask IoU | ms before | ms after |
|---|---|---|---|---|---|---|
| example: monster | 900×675 | 573×520 at 183,79, 18.2% | 575×520 at 182,79, 18.2% | 1.000 | 254 | 327 |
| example: crayon blob | 600×450 | 299×219 at 151,111, 19.0% | 299×219 at 151,111, 19.0% | 1.000 | 111 | 136 |
| example: ruled | 600×800 | 454×594 at 76,152, 19.2% | 455×594 at 75,152, 19.2% | 0.999 | 196 | 232 |
| blank page, heavy shadows | 768×1024 | nothing found | nothing found | 1 (both empty) | 335 | 406 |
| dark photo | 768×1024 | 453×598 at 158,204, 24.4% | 453×598 at 158,204, 24.4% | 1.000 | 499 | 604 |
| lined paper | 768×1024 | 475×622 at 163,193, 26.8% | 477×623 at 162,193, 26.8% | 1.000 | 289 | 529 |
| coloured paper (yellow) | 768×1024 | 453×598 at 158,204, 24.5% | 453×599 at 158,204, 24.5% | 1.000 | 352 | 337 |
| coloured paper (light blue) | 768×1024 | 453×598 at 158,204, 24.5% | 453×599 at 158,204, 24.5% | 1.000 | 288 | 320 |
| hard shadow across the page | 768×1024 | 453×598 at 158,204, 24.5% | 453×599 at 158,204, 24.5% | 1.000 | 453 | 411 |
| sheet on a table | 768×1024 | 453×576 at 158,194, 23.6% | 453×576 at 158,194, 23.6% | 1.000 | 282 | 491 |
| small sheet on a wide dark table | 1024×768 | 420×380 at 300,200, 20.3% | 231×258 at 395,255, 5.4% | 0.267 | 276 | 315 |
| small sheet on a wide light table | 1024×768 | 229×256 at 396,256, 5.3% | 229×256 at 396,256, 5.3% | 1.000 | 397 | 365 |
| legs to the paper edge | 768×1024 | 453×756 at 158,84, 30.9% | 453×756 at 158,84, 30.9% | 1.000 | 305 | 378 |
| two drawings | 1024×768 | 763×441 at 134,134, 22.1% | 763×441 at 134,134, 22.1% | 1.000 | 287 | 280 |
| tiny 64 px | 64×48 | 39×29 at 13,10, 29.9% | 40×29 at 12,10, 30.7% | 0.975 | 7 | 4 |
| huge 6000 px | 6000×4500 | 2690×3464 at 1658,556, 24.5% | 2690×3470 at 1658,556, 24.5% | 1.000 | 560 | 450 |
| C4: faint wings, plain | 768×1024 | 345×395 at 207,363, 12.5% | 551×559 at 109,199, 19.7% | 0.637 | 267 | 315 |
| C4: pencil wings, plain | 768×1024 | 551×558 at 109,200, 19.5% | 553×559 at 108,199, 19.7% | 0.990 | 323 | 405 |
| C4: faint wings, lined | 768×1024 | 315×396 at 227,362, 12.5% | 317×396 at 226,362, 12.5% | 1.000 | 335 | 315 |
| C4: pencil wings, lined | 768×1024 | 315×396 at 227,362, 12.5% | 317×396 at 226,362, 12.5% | 0.999 | 343 | 333 |
| C2: coloured in, 50% | 768×1024 | 623×827 at 73,99, 1.7% | 625×829 at 72,98, 51.8% | 0.033 | 327 | 394 |
| C2: coloured in, 65% | 768×1024 | 709×941 at 30,42, 1.6% | 711×944 at 29,40, 67.0% | 0.023 | 313 | 747 |
| C2: coloured in, 60%, lined | 768×1024 | 681×905 at 44,60, 61.7% | 683×907 at 43,59, 62.0% | 0.994 | 297 | 325 |
| C3: streaky crayon off the photo edge + doodle | 1024×768 | 517×451 at 9,159, 21.0% | 517×451 at 9,159, 21.4% | 0.981 | 433 | 430 |
| C3: solid crayon off the photo edge + doodle | 1024×768 | 191×151 at 705,225, 2.9% | 191×151 at 705,225, 2.9% | 1.000 | 303 | 317 |
| phone app sample photo (JPEG) | 900×675 | 573×520 at 183,79, 18.2% | 574×520 at 182,79, 18.2% | 1.000 | 238 | 249 |

## Reading the table

- **Fixed (C4):** *faint wings, plain*. Before, the pink wings and antennae were erased (12.5% of the photo: the body only). After, the whole bug is there (19.7%).
- **Fixed (C2):** *coloured in, 50% and 65%*. Before, these came out as line-art fragments (1.6-1.7%). After, the whole creature (51.8% and 67.0%).
- **Fixed as a side effect:** *small sheet on a wide dark table*. Before, the cut-out was the whole sheet. After, only the creature.
- **Unchanged, known limit (lined C4):** on blue-lined paper, pink wings as dark as the printed lines still go with the lines (*faint wings, lined*). Pencil wings at 3 px, a little darker than the lines, are kept now; that case is a test, not a bench row.
- **Unchanged, known limit (C3):** a solid crayon creature running off the photo edge, next to a separate doodle, still gives the doodle only, before and after. With streaky crayon, or with no other drawing, the creature is kept.
- **Everything else:** mask IoU 0.975-1.000. The differences are single pixels at stroke ends.

On the 34-photo stress set (crayon and marker on white, cream, lined and squared paper, with blur, JPEG, white
balance, fingers at the edge, shadows, rotated sheets on tables), old and new masks agree at IoU ≥ 0.97 on 30 photos.
The other 4 are the big coloured-in drawings, which go from fragments to IoU 0.995 against the ground truth.

## Speed

The new steps (paper-tile statistics, the thin-stroke mask, the second Otsu pass) are a few O(n) passes. Interleaved
old/new timing, median of 25 runs on the same busy machine: 900×675 monster 350 → 351 ms, 768×1024 lined paper
417 → 383 ms, that is, the same within noise. A drawing coloured in over most of the photo now takes longer (about
450-700 ms), because the old code returned a tiny wrong mask and the new one composes a photo-sized sprite.
