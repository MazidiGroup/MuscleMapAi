import AVFoundation
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

// Batch watch-frame exporter.
//
// Derives per exercise what the prototype chose by hand:
//   · LOOP    — the period of one repetition, by frame self-similarity, plus
//               the first moment of real motion so leading stills are trimmed.
//   · FOCAL   — the crop window holding the most subject mass, which centres
//               the FIGURE rather than the thin equipment either side of it.
// Emits 48 frames at 264x320 per exercise.

let OUT_W = 264, OUT_H = 320
// ~12 fps, the rate the approved prototype ran at, with frame count following
// the rep length instead of being fixed. A 6s rep at a fixed 48 frames is
// 8 fps and visibly steps; clamping keeps the decoded set bounded either way.
let TARGET_FPS = 12.0, MIN_FRAMES = 36, MAX_FRAMES = 60
let ANALYSIS_W = 64, ANALYSIS_H = 36

func grayGrid(_ cg: CGImage, w: Int, h: Int) -> [Double] {
    var buf = [UInt8](repeating: 0, count: w * h)
    let ctx = CGContext(data: &buf, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                        space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)!
    ctx.interpolationQuality = .low
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
    return buf.map { Double($0) }
}

/// Column-wise subject mass: how much of each column is darker than the plate.
func columnMass(_ cg: CGImage, cols: Int) -> [Double] {
    let h = 48
    var buf = [UInt8](repeating: 0, count: cols * h)
    let ctx = CGContext(data: &buf, width: cols, height: h, bitsPerComponent: 8, bytesPerRow: cols,
                        space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)!
    ctx.interpolationQuality = .low
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: cols, height: h))
    // The plate is a soft gradient, not flat white, so a FIXED threshold counts
    // the vignette as subject and drags the window toward the darker corner.
    // Estimate this frame's own background from its bright end instead, and
    // square the excess so the genuinely dark figure dominates thin equipment.
    let sorted = buf.map { Double($0) }.sorted()
    let bg = sorted[Int(Double(sorted.count) * 0.90)]
    let cut = bg - 40
    var mass = [Double](repeating: 0, count: cols)
    for x in 0..<cols {
        var m = 0.0
        for y in 0..<h {
            let v = Double(buf[y * cols + x])
            if v < cut { let d = (cut - v) / 255; m += d * d }
        }
        mass[x] = m
    }
    return mass
}

struct Plan { let start: Double; let dur: Double; let focalFrac: Double; let note: String }

func analyse(_ asset: AVURLAsset, _ gen: AVAssetImageGenerator, total: Double) -> Plan {
    // 1. Sample the whole clip cheaply.
    let n = min(90, max(30, Int(total * 12)))
    var grids: [[Double]] = []
    var times: [Double] = []
    gen.maximumSize = CGSize(width: 160, height: 90)
    for i in 0..<n {
        let t = total * Double(i) / Double(n)
        guard let cg = try? gen.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil) else { continue }
        grids.append(grayGrid(cg, w: ANALYSIS_W, h: ANALYSIS_H))
        times.append(t)
    }
    guard grids.count > 8 else { return Plan(start: 0, dur: min(total, 4), focalFrac: 0.5, note: "fallback: too few samples") }
    let dt = total / Double(n)

    // 2. First real motion — trim a static lead-in.
    func diff(_ a: [Double], _ b: [Double]) -> Double {
        var s = 0.0
        for i in 0..<a.count { s += abs(a[i] - b[i]) }
        return s / Double(a.count)
    }
    let steps = (1..<grids.count).map { diff(grids[$0 - 1], grids[$0]) }
    let peak = steps.max() ?? 0
    let moveThreshold = peak * 0.18
    var startIdx = 0
    while startIdx < steps.count && steps[startIdx] < moveThreshold { startIdx += 1 }
    startIdx = max(0, min(startIdx, grids.count - 6))

    // 3. Period by self-similarity: the lag whose frames best match. Search a
    //    plausible rep length, and prefer the SHORTEST strong match so one rep
    //    is chosen over two.
    let minLag = max(2, Int(1.4 / dt))
    let maxLag = min(grids.count - startIdx - 1, Int(6.5 / dt))
    var best = (lag: 0, score: Double.infinity)
    if maxLag > minLag {
        for lag in minLag...maxLag {
            var s = 0.0, c = 0
            var i = startIdx
            while i + lag < grids.count { s += diff(grids[i], grids[i + lag]); c += 1; i += 1 }
            guard c >= 3 else { continue }
            // Shorter lags win ties — a 2x period matches just as well.
            let score = s / Double(c) * (1 + Double(lag) * 0.004)
            if score < best.score { best = (lag, score) }
        }
    }
    let loopDur = best.lag > 0 ? Double(best.lag) * dt : min(total, 4.0)
    let startT = min(times[startIdx], max(0, total - loopDur))

    // 4. Focal window: slide the output-aspect window, keep the most mass.
    gen.maximumSize = CGSize(width: 480, height: 270)
    var acc: [Double] = []
    for k in 0..<5 {
        let t = startT + loopDur * Double(k) / 5
        guard let cg = try? gen.copyCGImage(at: CMTime(seconds: min(t, total - 0.01), preferredTimescale: 600), actualTime: nil) else { continue }
        let m = columnMass(cg, cols: 96)
        if acc.isEmpty { acc = m } else { for i in 0..<m.count { acc[i] += m[i] } }
    }
    // CENTROID, not a sliding window. A subject narrower than the crop makes
    // every window containing it score identically, and picking the first
    // maximum silently pinned the figure to the right-hand edge. Columns below
    // a quarter of the peak are dropped first, so thin equipment and the
    // background sweep do not drag the centre off the body.
    var focalFrac = 0.5
    if !acc.isEmpty {
        let peak = acc.max() ?? 0
        if peak > 0 {
            var num = 0.0, den = 0.0
            for (i, m) in acc.enumerated() where m >= peak * 0.25 {
                num += Double(i) * m
                den += m
            }
            if den > 0 { focalFrac = (num / den + 0.5) / Double(acc.count) }
        }
    }
    return Plan(start: startT, dur: loopDur, focalFrac: focalFrac,
                note: String(format: "loop %.2fs from %.2fs, focal %.3f", loopDur, startT, focalFrac))
}

func export(id: String, src: String, outDir: String) -> String {
    let asset = AVURLAsset(url: URL(fileURLWithPath: src))
    let total = CMTimeGetSeconds(asset.duration)
    guard total.isFinite, total > 0.5 else { return "\(id): SKIP (bad duration)" }
    let gen = AVAssetImageGenerator(asset: asset)
    gen.appliesPreferredTrackTransform = true
    gen.requestedTimeToleranceBefore = .zero
    gen.requestedTimeToleranceAfter = .zero
    let plan = analyse(asset, gen, total: total)
    gen.maximumSize = CGSize(width: 1936, height: 1072)
    try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
    let frames = max(MIN_FRAMES, min(MAX_FRAMES, Int((plan.dur * TARGET_FPS).rounded())))
    var written = 0
    for i in 0..<frames {
        let t = plan.start + plan.dur * Double(i) / Double(frames)   // endpoint exclusive
        guard let cg = try? gen.copyCGImage(at: CMTime(seconds: min(t, total - 0.001), preferredTimescale: 600), actualTime: nil) else { continue }
        let cropH = cg.height
        let cropW = Int(Double(cropH) * Double(OUT_W) / Double(OUT_H))
        var x = Int(plan.focalFrac * Double(cg.width)) - cropW / 2
        x = max(0, min(cg.width - cropW, x))
        guard let c = cg.cropping(to: CGRect(x: x, y: 0, width: cropW, height: cropH)) else { continue }
        let ctx = CGContext(data: nil, width: OUT_W, height: OUT_H, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!,
                            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
        ctx.interpolationQuality = .high
        ctx.draw(c, in: CGRect(x: 0, y: 0, width: OUT_W, height: OUT_H))
        guard let out = ctx.makeImage() else { continue }
        let url = URL(fileURLWithPath: String(format: "%@/%02d.jpg", outDir, i))
        if let d = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil) {
            CGImageDestinationAddImage(d, out, [kCGImageDestinationLossyCompressionQuality: 0.62] as CFDictionary)
            CGImageDestinationFinalize(d)
            written += 1
        }
    }
    // Manifest travels with the pack: the player needs the count and the loop
    // length, and neither is guessable from the files alone.
    let meta = String(format: "{\"frames\":%d,\"loopSeconds\":%.4f,\"focal\":%.4f,\"w\":%d,\"h\":%d}",
                      written, plan.dur, plan.focalFrac, OUT_W, OUT_H)
    try? meta.write(toFile: "\(outDir)/pack.json", atomically: true, encoding: .utf8)
    return String(format: "%@: %d frames, %.2fs, %.1f fps — %@",
                  id, written, plan.dur, Double(written) / plan.dur, plan.note)
}

let args = CommandLine.arguments
let srcDir = args[1], dstRoot = args[2]
let ids = Array(args.dropFirst(3))
for id in ids {
    print(export(id: id, src: "\(srcDir)/\(id).mp4", outDir: "\(dstRoot)/\(id)"))
    fflush(stdout)
}
