# Contributing

Thanks for helping. doodle-cutout is small on purpose: one function, no dependencies, classic image processing that
runs on a phone in well under a second. Changes that keep it that way are the easiest to merge.

## Setup

You need [Bun](https://bun.sh) 1.2 or later (for the HTML demo). Node 18+ works for building.

```sh
bun install
bun test           # the whole suite, about 10 s
bun run typecheck
bun run build      # dist/ (ESM + .d.ts)
```

## Reporting a bad cut-out

The most useful issue is a photo that comes out wrong. Attach the photo, or a cropped or redrawn version if it shows a
child's work you can't share. Say what you expected and what you got. If you can, add the `result.debug` masks
(`cutout(img, {debug: true})`): they show which step went wrong.

## Making a change

1. **Write a failing test first.** Tests draw their own photos with `test/helpers/synth.ts` (paper, marker, crayon,
   tables, lighting, sensor noise), so a new case is a few lines. Check that it fails without your change.
2. **Keep the rest the same.** Run the benchmark against a copy of the code before your change:

   ```sh
   git worktree add ../doodle-cutout-before HEAD
   bun scripts/bench.ts --baseline ../doodle-cutout-before/src
   ```

   Every case your change is not about should keep a mask IoU of about 1.000. If something gets worse, change the
   approach, or put the new behaviour behind an option. Add the table to `BENCHMARK.md` if the output changes.
3. **Keep it fast.** The bench prints times. A change that makes a 1024 px photo noticeably slower needs a good reason.
4. **Keep it small.** No new runtime dependencies. Match the code around you: short functions, plain names, one-line
   comments that say *why*.
5. Add a line to `CHANGELOG.md`, and update the README if an option or a limit changes.

If you change what the examples look like, regenerate them with `bun run images`.

## Licence

By contributing you agree that your contribution is licensed under the MIT licence of this project.
