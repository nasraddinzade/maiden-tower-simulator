/**
 * HOW MUCH DAYLIGHT EACH CHAMBER GETS, and for one of the eight the answer is
 * none at all.
 *
 * WHY THIS FILE EXISTS. Since 2026-08-10 the tower has no openings on the
 * storeys — [OWNER], in capitals: «НА ЯРУСАХ ОКНА ТОЛЬКО В НАЧАЛЕ И В КОНЦЕ
 * ПРОХОДОВ ЛЕСТНИЦ». Every slit is at the end of a stair passage, so a room is
 * lit only by whatever comes through its doorway onto the stair and then out of
 * the passage. That is a two-hole sight line, and nobody had ever measured
 * whether the two holes line up. They mostly do not, and the model had no way of
 * saying so: `built` reports that a SLIT reaches daylight, which is a fact about
 * the passage and not about the room behind it.
 *
 * WHAT IS MEASURED. A horizontal ray leaving the tower's axis at eye height, at
 * every bearing of the compass. It reaches the sky only if it clears, on the
 * same bearing and at the same height:
 *
 *   · the entrance — storey 1 only, and it is a hole straight through the drum
 *     with no passage in between; or
 *   · a doorway onto the stair AND a built slit at an end of that passage.
 *
 * Both are cut RADIALLY, so a ray from the axis crosses them along their own
 * axis and the test is arithmetic on azimuths and heights. The predicates below
 * are the cutting tools' own geometry re-derived without three.js — the arched
 * tunnel of doorwayCutter(), the lofted taper of windowCutter() — so this
 * measures the building the shell is actually cut into, not a simplification of
 * it. CLAUDE.md rule 6: every line here is arithmetic and it is all tested.
 *
 * WHAT IT FINDS, at the shipped bearing, and it has two quite different causes:
 *
 *   storeys 6, 7, 8   TWO bands of 2.78° apiece — one out of the HEAD of the
 *                     climb that arrives there and one out of the FOOT of the
 *                     climb that leaves — except at storey 7, where the pier eats
 *                     all but 1.52° of the head's. The band is the SLIT's own
 *                     width: 0.4 m of hole at 8.25 m of radius. The doorway is
 *                     five times wider and is never the thing in the way.
 *   storey 1          the entrance, 7.61° of it, and no stair involved.
 *   storeys 2, 3, 4   one band of 2.78° out of the FOOT of the climb that leaves
 *                     there — foot-2-3, foot-3-4, foot-4-6 — and nothing else,
 *                     because no head above them is cut.
 *   storey 5          NOTHING, and structurally so. It is reached from halfway
 *                     along the 4→6 run, which is not a passage end at all, so
 *                     its doorway has no slit within a storey of it in height.
 *                     No turn of the stair reaches that.
 *
 * FOUR OF THESE ROOMS WERE DARK UNTIL 2026-08-17 AND IT WAS A SIGN, NOT A WALL.
 * This block used to explain storeys 2, 3 and 4 by "what a foot is": the doorway
 * sitting half a flight-width ALONG THE CLIMB from the first tread while the slit
 * sat on the landing BEHIND it, 16.4° away against a doorway half-width of 7.5°.
 * That was approachAzimuthDeg() taking the shift along the climb at both ends
 * when a passage carries its landing AWAY from the flight at both. A foot reads
 * like a head now and a foot slit lights its room like a head's.
 *
 * AND EVERY BAND IS THE SLIT'S FULL WIDTH SINCE THAT EVENING, where they read
 * 2.57–2.64° in the morning. The doorway stands on the slit's own bearing now
 * rather than 3.3–4.1° off it, so the slit lies at the CROWN of the doorway's
 * arch, where archHalfSpan() is widest, instead of out toward a springing where
 * the curve was clipping a quarter of a degree off each room. The census total
 * went 29.385 → 31.358 on that alone; no room was lit or darkened by it.
 *
 * WHAT THE QUARTER TURN STILL COSTS, and it is much less than it was.
 * STAIR.startAzimuthDeg is BUTTRESS.azimuthDeg + STAIR_FROM_BUTTRESS_DEG, the
 * quarter turn is [OWNER] 2026-08-13 said by eye and worth ±15°, and his own
 * footage has since shown a glazed window standing open at head-3-4 (up/098,
 * down/137–139). Turning the stair 11.09° brings head-2-3 and head-3-4 out of the
 * pier and gives storeys 3 and 4 a SECOND band each. It no longer decides whether
 * they see daylight at all — that claim was true only while the feet were
 * misplaced, and it is retired in chamberDaylight.test.ts with its own note.
 *
 * REPORTS, DOES NOT REPAIR. Nothing here may be used to choose a bearing.
 * Turning the stair until more rooms are lit is fitting the building to a
 * preference about the building, which is CLAUDE.md rule 7, and it would be the
 * same mistake as fitting it to a solstice. The number is published instead.
 *
 * WHAT IT IS NOT A CLAIM ABOUT. Not about how the tower is lit today: the
 * footage shows the museum's own concealed strip at the springing of the ceiling
 * in the chambers (up/099, up/130) and fluorescent tube in the passages, and
 * that is fabric, not architecture. Not about brightness either — a chamber with
 * no sight line to the sky is not pitch dark in reality, because light comes
 * round the corner off the passage walls. This measures SIGHT LINES, which is
 * the thing a ray can measure honestly, and the honest translation of a dark
 * chamber is "you cannot see daylight from here", not "no photon arrives".
 *
 * AND IT STOPS AT THE DRUM FACE, with one exception. The pier IS checked, ray by
 * ray rather than once at each slit's centre line, and it has to be: head-6-7
 * stands 0.13° clear of the beak's edge, so the slit counts as reaching daylight
 * while most of the arc a walker can see through it does not. Nothing else
 * outside the wall is modelled — not the modern external stair across the
 * entrance, not the head-house on the roof — so a band here is the arc of sky the
 * MASONRY leaves open, and the street may still have something standing in it.
 */

import { buttressDepthAt, type ButtressPlan } from './passageOpenings'
import type { StairDoorway } from './staircase'
import type { PassageOpening } from './passageOpenings'

const DEG = Math.PI / 180

/** Shortest signed difference a − b, in (−180, 180]. */
function delta(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180
}

/** Azimuth folded into [0, 360). */
function norm(a: number): number {
  return ((a % 360) + 360) % 360
}

// ————————————————————————— the three kinds of hole —————————————————————————

/**
 * Clear half-span of an arched tunnel at height `h` above its sill, metres.
 * Negative where that height is outside the opening altogether.
 *
 * This is archTunnel()'s section, including its `Math.max(0.01, …)` clamp on the
 * springing: a semicircular head of radius half the span, so the crown stands at
 * the tunnel's stated height and the jambs are vertical below the springing.
 * Written out here rather than imported because towerShell.ts pulls in three.js
 * and this module may not.
 */
export function archHalfSpan(span: number, height: number, h: number): number {
  const half = span / 2
  const springY = Math.max(0.01, height - half)
  if (h < 0) return -1
  if (h <= springY) return half
  const dy = h - springY
  if (dy >= half) return -1
  return Math.sqrt(half * half - dy * dy)
}

/**
 * Does a horizontal ray leaving the axis on this bearing, at this height, get
 * through a stair doorway?
 *
 * THE BINDING RADIUS IS THE OUTER ONE. A doorway is a straight tunnel, not an
 * angular wedge: its cheeks are two parallel planes half a chord apart. A ray
 * from the axis stands r·sin Δ off the centre plane, so it is furthest out where
 * r is largest, which is the passage-side face. Test there and the whole run
 * through the wall is covered.
 *
 * The rake is a SHEAR, matching doorwayCutter()'s: sill and crown both lift by
 * rake × x, so the clear height never changes across the opening.
 */
export function doorwayAdmits(d: StairDoorway, azimuthDeg: number, y: number): boolean {
  const off = delta(azimuthDeg, d.azimuthDeg)
  if (Math.abs(off) >= 90) return false
  const x = d.outerRadius * Math.sin(off * DEG)
  // doorwayCutter()'s own floors on the tool, so the two cannot drift apart
  const span = Math.max(0.2, 2 * d.outerRadius * Math.sin((d.widthDeg * DEG) / 2))
  const height = Math.max(0.2, d.topY - d.bottomY)
  const h = y - d.bottomY - d.bottomRake * x
  // no head on a doorway whose wall has run out — the tool is a box carried past
  if (d.openToSky) return h >= 0 && Math.abs(x) <= span / 2
  const clear = archHalfSpan(span, height, h)
  return clear >= 0 && Math.abs(x) <= clear
}

/**
 * And out of the passage through a slit?
 *
 * The reveal is a straight loft from outerWidth × outerHeight at the drum face
 * to innerWidth × innerHeight at the passage cheek, so both the hole's section
 * and the ray's offset from its centre plane are LINEAR in radius. A linear
 * function is bounded by its endpoints, so testing the two faces is exact rather
 * than a sample of the run between them.
 *
 * Only a BUILT slit is a hole; a withheld one is stone, and `built` is where the
 * record and the buttress check have already had their say.
 */
export function revealAdmits(
  o: PassageOpening,
  azimuthDeg: number,
  y: number,
  outerRadius: number,
): boolean {
  if (!o.built) return false
  const off = delta(azimuthDeg, o.azimuthDeg)
  if (Math.abs(off) >= 90) return false
  const rise = Math.abs(y - o.centreY)
  if (rise > o.outerHeight / 2 || rise > o.innerHeight / 2) return false
  const s = Math.sin(off * DEG)
  if (Math.abs(outerRadius * s) > o.outerWidth / 2) return false
  if (Math.abs(o.revealEndRadius * s) > o.innerWidth / 2) return false
  return true
}

/** The one hole in this tower that needs no stair: the west door. */
export interface EntranceHole {
  azimuthDeg: number
  width: number
  height: number
  /** World Y of the threshold — the floor of storey 1, which it opens onto. */
  thresholdY: number
}

/**
 * Straight through the drum, arched, no passage in between — which is why
 * storey 1 is the one chamber whose daylight owes the stair nothing.
 */
export function entranceAdmits(
  e: EntranceHole,
  azimuthDeg: number,
  y: number,
  outerRadius: number,
): boolean {
  const off = delta(azimuthDeg, e.azimuthDeg)
  if (Math.abs(off) >= 90) return false
  const clear = archHalfSpan(e.width, e.height, y - e.thresholdY)
  return clear >= 0 && Math.abs(outerRadius * Math.sin(off * DEG)) <= clear
}

// ————————————————————————————— the sweep —————————————————————————————

/** One arc of sky a chamber can see, and what it sees it through. */
export interface DaylightBand {
  /** Opening id, or `entrance`. */
  through: string
  fromDeg: number
  toDeg: number
  arcDeg: number
}

/** One chamber's whole share of the sky, as seen from its axis at eye height. */
export interface ChamberDaylight {
  floorNumber: number
  eyeY: number
  bands: DaylightBand[]
  /** Total ° of the 360 that reach the sky. */
  arcDeg: number
  lit: boolean
}

export interface ChamberDaylightInput {
  floors: Array<{ floorNumber: number; floorY: number }>
  doorways: StairDoorway[]
  openings: PassageOpening[]
  /** Omit and storey 1 goes dark with the rest — useful for isolating the stair. */
  entrance?: EntranceHole
  /**
   * The pier, so a ray can be stopped by it individually.
   *
   * PassageOpening.built already asks whether a slit's OWN bearing clears the
   * beak, and that is not the same question: head-6-7 clears it by 0.13°, so the
   * slit is cut and yet the walker looking through it sees pier over most of the
   * arc. Omit and the sweep reports what the stone alone leaves open.
   */
  buttress?: ButtressPlan
  /** World Y the pier stops at. Above it a radial ray is clear of it. */
  buttressTopY?: number
  outerRadius: number
  /** Above the floor. The walker's, so the answer is what the walker sees. */
  eyeHeight: number
  /**
   * ° between samples. The narrowest aperture in the tower is a 0.4 m slit seen
   * from the axis, 2.8° across, so 0.1 lands ~28 samples inside the smallest
   * band there is and cannot step over one. The edges are bisected afterwards,
   * so this sets what the sweep can FIND, not the precision of what it reports.
   */
  stepDeg?: number
}

/**
 * WHAT LETS A RAY OUT ON THIS BEARING, or null.
 *
 * Every doorway and every opening in the tower is offered, not just this
 * storey's, and that is deliberate: a sweep that pre-selects by storey would be
 * asserting the storey assignment rather than measuring it. The heights do the
 * separating on their own — a storey is 3.28 m and an opening is 1.9 m tall, so
 * an eye at floor + 1.65 cannot fall inside another storey's hole.
 */
function apertureAt(
  input: ChamberDaylightInput,
  azimuthDeg: number,
  y: number,
): string | null {
  // the pier stands in front of the whole bearing, whatever the wall does
  if (
    input.buttress &&
    y <= (input.buttressTopY ?? Number.POSITIVE_INFINITY) &&
    buttressDepthAt(azimuthDeg, input.buttress, input.outerRadius) > 0
  ) {
    return null
  }
  if (input.entrance && entranceAdmits(input.entrance, azimuthDeg, y, input.outerRadius)) {
    return 'entrance'
  }
  if (!input.doorways.some((d) => doorwayAdmits(d, azimuthDeg, y))) return null
  for (const o of input.openings) {
    if (revealAdmits(o, azimuthDeg, y, input.outerRadius)) return o.id
  }
  return null
}

/** Bisect the bearing at which `inside` stops holding, between two bearings. */
function edgeDeg(inside: (a: number) => boolean, within: number, without: number): number {
  let lo = within
  let hi = without
  for (let i = 0; i < 48; i += 1) {
    const mid = (lo + hi) / 2
    if (inside(mid)) lo = mid
    else hi = mid
  }
  return lo
}

/** One chamber, swept. */
export function sweepChamber(
  input: ChamberDaylightInput,
  floor: { floorNumber: number; floorY: number },
): ChamberDaylight {
  const step = input.stepDeg ?? 0.1
  const eyeY = floor.floorY + input.eyeHeight
  const count = Math.round(360 / step)

  const at = (a: number) => apertureAt(input, a, eyeY)
  const hits: Array<{ az: number; through: string }> = []
  for (let i = 0; i < count; i += 1) {
    const az = i * (360 / count)
    const through = at(az)
    if (through) hits.push({ az, through })
  }
  if (hits.length === 0) {
    return { floorNumber: floor.floorNumber, eyeY, bands: [], arcDeg: 0, lit: false }
  }

  // contiguous runs of the same aperture, wrapping through 0°
  const runs: Array<{ through: string; first: number; last: number }> = []
  for (const h of hits) {
    const open = runs[runs.length - 1]
    if (open && open.through === h.through && Math.abs(h.az - open.last - 360 / count) < 1e-9) {
      open.last = h.az
    } else {
      runs.push({ through: h.through, first: h.az, last: h.az })
    }
  }
  if (
    runs.length > 1 &&
    runs[0].through === runs[runs.length - 1].through &&
    runs[0].first === 0 &&
    Math.abs(runs[runs.length - 1].last + 360 / count - 360) < 1e-9
  ) {
    const tail = runs.pop()!
    runs[0].first = tail.first - 360
  }

  const bands: DaylightBand[] = runs.map((r) => {
    const inside = (a: number) => at(a) === r.through
    const from = edgeDeg(inside, r.first, r.first - step)
    const to = edgeDeg(inside, r.last, r.last + step)
    return { through: r.through, fromDeg: norm(from), toDeg: norm(to), arcDeg: to - from }
  })

  return {
    floorNumber: floor.floorNumber,
    eyeY,
    bands,
    arcDeg: bands.reduce((sum, b) => sum + b.arcDeg, 0),
    lit: bands.length > 0,
  }
}

/** Every chamber, swept. */
export function chamberDaylight(input: ChamberDaylightInput): ChamberDaylight[] {
  return input.floors.map((f) => sweepChamber(input, f))
}

/** How many chambers can see the sky. THE NUMBER, and it is meant to be read. */
export function litChamberCount(all: ChamberDaylight[]): number {
  return all.filter((c) => c.lit).length
}

/** And which ones cannot, by floor number. */
export function darkChambers(all: ChamberDaylight[]): number[] {
  return all.filter((c) => !c.lit).map((c) => c.floorNumber)
}

/**
 * The census as sentences, for the dev console — beside testimonyConflicts()
 * and for the same reason. A model that quietly leaves half its rooms without a
 * sight line to the sky is making a large claim about the building in silence.
 */
export function daylightCensus(all: ChamberDaylight[]): string[] {
  const lit = all.filter((c) => c.lit)
  const dark = darkChambers(all)
  const lines = [
    `${lit.length} of ${all.length} chambers can see daylight from the axis at eye height: ` +
      lit
        .map((c) => `storey ${c.floorNumber} ${c.arcDeg.toFixed(1)}° (${c.bands.map((b) => b.through).join(', ')})`)
        .join('; ') +
      '.',
  ]
  if (dark.length > 0) {
    lines.push(
      `Storeys ${dark.join(', ')} have no sight line to the sky at all. The tower's slits are at ` +
        'the ends of the stair passages [OWNER 2026-08-10], so a room is lit only where its ' +
        'doorway onto the stair stands at a passage END and the slit there is cut. A doorway ' +
        'partway ALONG a flight has no slit within a storey of it in height, and no turn of ' +
        'the stair reaches that. Not a bug and not to be repaired by turning the stair (rule 7).',
    )
  }
  return lines
}
