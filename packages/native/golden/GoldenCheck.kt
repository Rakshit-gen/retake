// Checks that FrameMath.kt gives the same numbers as the TypeScript version.
// Builds the same formula images as packages/quality/src/patterns.ts and
// compares against packages/quality/fixtures/golden.json.
//
//   npm run golden:kotlin
import com.margelo.nitro.retake.FrameMath
import java.io.File
import kotlin.system.exitProcess

class Pattern(val name: String, val width: Int, val height: Int, val stride: Int, val pixel: (Int, Int) -> Int)

val PATTERNS = listOf(
  Pattern("texture", 1280, 720, 1280) { x, y -> (x * 31 + y * 17 + ((x / 8 + y / 8) % 2) * 100) % 256 },
  Pattern("dark_padded", 640, 480, 704) { x, y -> 8 + ((x + y) % 8) },
  Pattern("glare_spot", 1280, 720, 1280) { x, y ->
    val dx = x - 900
    val dy = y - 200
    if (dx * dx + dy * dy < 3600) 255 else 120 + ((x / 16 + y / 16) % 2) * 30
  },
  Pattern("odd_size", 641, 479, 648) { x, y -> ((x * x) / 7 + y * 3) % 256 },
  Pattern("flat", 320, 240, 320) { _, _ -> 128 },
)

fun render(p: Pattern): ByteArray {
  val out = ByteArray(p.stride * p.height) { 255.toByte() }
  for (y in 0 until p.height) for (x in 0 until p.width) out[y * p.stride + x] = p.pixel(x, y).toByte()
  return out
}

/** Pulls `"key": value` out of one fixture object. Enough for this file's fixed shape. */
fun field(obj: String, key: String): String =
  Regex("\"$key\":\\s*(\"[^\"]*\"|[-0-9.eE+]+)").find(obj)?.groupValues?.get(1)?.trim('"')
    ?: error("missing $key")

fun main(args: Array<String>) {
  val json = File(args.getOrElse(0) { "../quality/fixtures/golden.json" }).readText()
  val objects = Regex("\\{\\s*\"name\":[^{]*\\{[^}]*\\}\\s*\\}").findAll(json).map { it.value }.toList()
  var failures = 0
  for (p in PATTERNS) {
    val obj = objects.firstOrNull { field(it, "name") == p.name } ?: error("no fixture for ${p.name}")
    val m = FrameMath.analyze(render(p), p.width, p.height, p.stride)
    val got = mapOf(
      "width" to m.width.toDouble(), "height" to m.height.toDouble(), "meanLuma" to m.meanLuma,
      "darkFraction" to m.darkFraction, "brightFraction" to m.brightFraction, "sharpness" to m.sharpness,
      "contrast" to m.contrast, "glare" to m.glare,
    )
    for ((k, v) in got) {
      val want = field(obj, k).toDouble()
      if (Math.abs(v - want) > 1e-9 * maxOf(1.0, Math.abs(want))) {
        println("FAIL ${p.name}.$k: kotlin $v, typescript $want")
        failures++
      }
    }
    if (m.dhash != field(obj, "dhash")) {
      println("FAIL ${p.name}.dhash: kotlin ${m.dhash}, typescript ${field(obj, "dhash")}")
      failures++
    }
  }

  // Rough speed on this machine's JVM, not on a phone. Warm up first so the JIT has compiled the loops.
  val frame = render(PATTERNS[0])
  val scratch = IntArray(640 * 360)
  repeat(200) { FrameMath.analyze(frame, 1280, 720, 1280, scratch = scratch) }
  val runs = 500
  val t0 = System.nanoTime()
  repeat(runs) { FrameMath.analyze(frame, 1280, 720, 1280, scratch = scratch) }
  val ms = (System.nanoTime() - t0) / 1e6 / runs
  println("analyze 1280x720 -> 640x360: %.3f ms per frame (laptop JVM, ${System.getProperty("os.arch")})".format(ms))

  if (failures > 0) {
    println("$failures mismatches")
    exitProcess(1)
  }
  println("${PATTERNS.size} patterns match the TypeScript fixtures")
}
