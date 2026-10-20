// Prints the text macOS Vision finds in a screenshot (used by soak.mjs to read the screen of a headless VVD).
// Built on demand by soak.mjs: swiftc -O ocr.swift -o $TMPDIR/sketchlings-ocr
import AppKit
import Foundation
import Vision

let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let img = NSImage(contentsOf: url),
  let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil)
else { exit(1) }
let req = VNRecognizeTextRequest()
req.recognitionLevel = .fast // .accurate hung for minutes on this Mac
try VNImageRequestHandler(cgImage: cg).perform([req])
for o in req.results ?? [] { if let t = o.topCandidates(1).first { print(t.string) } }
