/**
 * SINGLE SOURCE OF TRUTH for the tower's geometry (CLAUDE.md rule 2).
 * Every component derives from these numbers — no magic numbers elsewhere.
 * Change a value here and the model changes.
 *
 * Provenance tags used in comments below:
 *   [ICOMOS 958]   UNESCO ICOMOS Evaluation Report, ref. 958 — official
 *   [İçərişəhər]   İçərişəhər State Historical-Architectural Reserve (custodian)
 *   [ref]          docs/maiden-tower-reference.md (project source of truth)
 *   [OSM]          measured off the OpenStreetMap footprint (way 299418016)
 *   [ASSUMPTION]   modelling choice, NOT surveyed — flagged so it can be replaced
 *   [PLACEHOLDER]  value invented to fill a required field; no source exists yet
 *   [ESTIMATE]     chosen by judgement on the owner's instruction of 2026-08-05,
 *                  when they asked for the tower to be completed from what is in
 *                  hand rather than left with holes. NOT measured, NOT sourced.
 *                  Every one carries the reasoning that picked it. They exist so
 *                  a later survey can find them all by searching one word and
 *                  replace them without touching anything that was measured —
 *                  which is the part of rule 1 that still matters even with the
 *                  rule's first clause lifted.
 *
 * Units: metres. Y up. north = -Z, east = +X. Azimuth clockwise from north.
 *
 * TARGET STATE: the tower AS IT STANDS IN 2026, modern fabric included.
 * This is a deliberate choice, and it decides several arguments in advance:
 *   - the staircase was replaced in the 2009–2013 restoration, so the present
 *     stone stair is the one to model, not whatever the pre-2007 photographs show;
 *   - the current stone paving of the floors is post-restoration and counts as
 *     correct, even though it hides the drainage channels described in [ref];
 *   - reference photographs from 2007–2008 (the Flickr set) document an EARLIER
 *     state — use them for masonry texture and for features the restoration
 *     covered up, but never for geometry that the restoration changed.
 *
 * MODERN INSERTIONS ARE MODELLED. This header used to say the opposite — that
 * the metal spiral stair and the rest were museum equipment and no part of the
 * job — and that stopped being true on 2026-08-04, when the owner set the target
 * as the building you can walk today. The steel spiral from storey 1 to storey 2
 * IS the only way between those floors; leaving it out left the visitor route
 * with a hole where it begins. They live in config/modern.ts and config/site.ts,
 * apart from this file, so a figure read off a phone video of 2010s steelwork can
 * never be quoted as evidence about the 12th-century drum.
 */

import { azimuthToVector, taperedWallThickness } from '../lib/geometry'
import type { StairSettings, Winding } from '../lib/staircase'

// ————————————————————————— measured shell —————————————————————————

const HEIGHT = 29.5 // m — [ICOMOS 958] total above-ground height (a mean: ~28 m seaward / ~31 m landward due to sloping rock)
const OUTER_DIAMETER = 16.5 // m — [ICOMOS 958] outer diameter at base; outer drum is near-vertical
const OUTER_RADIUS = OUTER_DIAMETER / 2 // 8.25 m
const WALL_BASE = 5.0 // m — [ICOMOS 958] wall thickness at base
const WALL_TOP = 3.7 // m — mean of 3.2–4.2 m [ICOMOS 958] (some sources 4.5); Phase-1 spec fixes 3.7
const FLOOR_COUNT = 8 // [İçərişəhər], [ICOMOS 958]
const FOUNDATION_DEPTH = 15 // m — [ICOMOS 958] shaft/foundation extends ~15 m below ground

/**
 * m — how far the doorway sill stands above the former ground surface.
 * [İçərişəhər], "2 m above former ground surface". Hoisted up here because the
 * whole vertical datum hangs off it; ENTRANCE below reads it back.
 */
const SILL_ABOVE_GROUND = 2.0

/**
 * THE VERTICAL DATUM, and the thing that was wrong.
 *
 * y = 0 is the floor of storey 1, because that is what every interior dimension
 * is naturally measured from. The GROUND is not there — the entrance is raised,
 * and the sourced sill height says by exactly 2 m.
 *
 * HEIGHT is [ICOMOS 958]'s height ABOVE GROUND. The stack used to lay it off
 * from y = 0 anyway, which built the tower 31.5 m tall above its own ground line
 * and left 2.6 m over for a parapet. That was recorded here as an open conflict
 * against a parapet measured at about half a metre, and treated as evidence that
 * eight storey heights were each ~0.26 m short. They are not. The discrepancy
 * was 2.07 m against an omitted, already-sourced 2.00 m: an arithmetic slip in
 * the datum, not a survey problem. With it applied the parapet comes out at
 * 0.60 m, which lands inside the measured band, and CEILING_STRUCTURE's assumed
 * 0.8 m survives untouched — the closed form gives 0.79 ± 0.24.
 */
const GROUND_Y = -SILL_ABOVE_GROUND
/** World Y of the top of the parapet: HEIGHT above the ground, not above y = 0. */
const TOP_Y = GROUND_Y + HEIGHT

// ———————————————————————— floor-stack model ————————————————————————
// Clear (floor-to-cupola-crown) heights ARE sourced [İçərişəhər / az.Wikipedia]:
//   ground storey 3.0 m; upper storeys 2.5 m "on average" (orta hesabla).
// The per-storey survey is not public, so 2.5 m is applied uniformly to floors 2–8
// [ASSUMPTION]. Ceiling structure and parapet are NOT surveyed [ASSUMPTION]; they are
// tuned so the stack sums to HEIGHT. floorY/ceilingY are DERIVED (never hardcoded):
//   3.0 + 7×2.5 (clear) + 8×0.8 (ceilings) + 2.6 (parapet) = 29.5 m ✓
// RESOLVED, and it was arithmetic rather than survey. The budget is
//   sill 2.0 + 3.0 + 7×2.5 + 8×0.8 + parapet = 29.5  →  parapet 0.60 m
// The sill term used to be missing, which left 2.6 m over for the parapet and made
// eight storeys look ~0.26 m short apiece. They are not. Measured against the sea
// horizon the parapet is 0.556 of the phone's height above the deck — 0.53 m at a
// low grip, 0.81–0.89 m at a normal one — and the derived 0.60 sits inside that.
// The slit conflict went with it: the topmost exterior slit at ≈0.94 H now lands
// 2.1 m ABOVE the storey-8 floor instead of inside solid parapet.
// What is still open is which face and which ground line [ICOMOS 958] measured
// 29.5 m on; the report records ~28 m seaward against ~31 m landward, and the
// whole correction rests on the 2.0 m sill being the right offset. dC/dH = 1/8, so
// the ±1.5 m spread is ±0.19 m on CEILING_STRUCTURE — hence 0.79 ± 0.24, which is
// why the assumed 0.8 needs no revision.
/*
 * INDEPENDENTLY CONFIRMED, once, and it is the only confirmation the vertical
 * model has.
 *
 * Storey 3's springing — where the vault leaves the vertical wall — was measured
 * at 1.65 ± 0.09 m by fitting two circles in one frame (the floor junction and
 * the vault soffit), solving camera pitch and roll as free parameters, and
 * taking the scale from the tower's OWN sourced taper rather than from anything
 * in the room. The model implies clear − cupolaRise = 2.5 − 0.9 = 1.60. They
 * agree to 0.05 m, half a sigma.
 *
 * That confirms the PAIR, not either number: nothing measured separates a clear
 * height from its vault rise. Storeys 2, 4, 6 and 7 remain entirely unmeasured,
 * and the uniform 2.5 m is still an assumption laid over a sourced AVERAGE.
 *
 * Two other candidate measurements were rejected rather than adopted. Storey 5's
 * springing was scaled off this file's own ROOF_CAMERA_HEIGHT, so it is a
 * measured ratio times an assumption and shares that assumption with PARAPET —
 * not independent. Storey 8's was scaled off a fire extinguisher taken as
 * 0.55 m tall, a dimension imported from outside the building to size the
 * building, and it is contradicted by an integer: 16–17 risers from the storey-8
 * floor to the roof deck would force a 0.284 m riser, 40% above every other
 * estimate.
 */
const GROUND_CLEAR = 3.0 // m — [İçərişəhər] 1st storey clear height
const UPPER_CLEAR = 2.5 // m — [İçərişəhər] upper storeys, average → [ASSUMPTION] applied to each
/**
 * Owner's stature, metres. Stated by them, and it is the only anthropometric
 * input in the model — used solely to turn the roof measurement into metres.
 */
const OWNER_STATURE = 1.85
/**
 * m — how high the phone was above the roof deck. The owner shot the roof
 * footage "на уровне груди" on a Xiaomi 11 Lite. A chest-level grip sits at
 * about 0.73 ± 0.05 of stature, between elbow (0.63) and suprasternale (0.82),
 * so 1.35 ± 0.10 m. [ASSUMPTION] on the fraction, [OWNER] on the stature.
 */
const ROOF_CAMERA_HEIGHT = OWNER_STATURE * 0.73

/**
 * m — the roof parapet, above the deck. [VIDEO] 0.75 ± 0.06.
 *
 * This is the one vertical dimension in the model that is MEASURED, and it is
 * measured in a way that needs no camera calibration at all. In the roof frame
 * that shows the sea horizon, the parapet stands at 0.556 of the camera's own
 * height above the deck — two independent columns of the frame agreeing to 0.4%.
 * For a rectilinear camera that ratio is exactly focal-length-independent, and
 * these frames test rectilinear to 0.25 px rms against the horizon itself. So
 * the only unknown in it is how high the phone was held, which the owner has
 * now stated.
 */
const PARAPET = 0.556 * ROOF_CAMERA_HEIGHT

/**
 * m — masonry and fill above each cupola crown, up to the next floor.
 *
 * [DERIVED], and no longer the assumption it was. With the sill datum applied
 * the vertical budget closes, and with the parapet MEASURED rather than left as
 * the residual it is this that falls out of it:
 *
 *   C = (HEIGHT − sill − GROUND_CLEAR − 7×UPPER_CLEAR − PARAPET) / 8 = 0.78
 *
 * The assumption it replaces was 0.80, so the number barely moves — which is the
 * point. It is now a quantity with an equation, an error bar and a named datum
 * dependency instead of a figure tuned until the stack summed to 29.5.
 *
 * Tolerance ±0.19, and essentially all of it is dH: ∂C/∂H = 1/8 against the
 * ±1.5 m ambiguity in which face [ICOMOS 958] measured 29.5 m on (~28 m seaward,
 * ~31 m landward). The parapet contributes almost nothing — ∂C/∂P = −1/8, so
 * even ±0.06 on it is ±0.007 here. Measuring the parapet better would not help;
 * knowing which face the 29.5 m belongs to would.
 */
const CEILING_STRUCTURE =
  (HEIGHT - SILL_ABOVE_GROUND - GROUND_CLEAR - (FLOOR_COUNT - 1) * UPPER_CLEAR - PARAPET) /
  FLOOR_COUNT
// Rise (стрела подъёма) of the shallow cupola, measured down from the crown to where
// it springs off the inner wall. [ASSUMPTION] — no source gives it. Kept deliberately
// small: [ref] calls the vaults "пологие" (shallow), and photographs of the one
// documented cupola show a very flat dome with concentric ring courses.
const CUPOLA_RISE = 0.9 // m — [ASSUMPTION]
/**
 * Oculus radius. [PHOTO] — measured, not assumed, but with a stated tolerance.
 *
 * Derived from an interior photograph of the owner's (20260801_165136.jpg, Galaxy
 * S23 Ultra).
 *
 * THE FOCAL CONVENTION, which this got wrong for a long time and which anyone
 * reusing these frames needs: FocalLengthIn35mmFilm is a DIAGONAL equivalent,
 * and the sensor's native frame is 4:3, not 3:2. So the half-width to use is
 * (43.267/2)·(4/5) = 17.3066 mm, not the 18 mm half-width of a 36×24 frame.
 * The field along the 4000 px axis is therefore 2·atan(17.3066/23) = 73.92° and
 * the focal length 2658 px — against 2555 px from the old reading, which made
 * every distance-dependent length off that frame 4.3% too large. Checked three
 * ways: the manufacturer's published fields of view, the implied sensor
 * diagonals, and a Manhattan-frame calibration on 20260801_163903.jpg giving
 * 2670 ± 50 px measured. Width-on-36 mm is out by 4.5%, diagonal-on-16:9 by
 * 9.4%, diagonal-on-4:3 by 0.45%.
 *
 * The oculus ellipse spans its major axis at a known angle, which for a
 * horizontal circle is its true diameter seen at its own distance:
 *
 *   camera 2.0 m from the axis → r 0.58
 *   camera 2.5 m               → r 0.71
 *   camera 3.0 m               → r 0.83
 *
 * So r = 0.72 ± 0.14, and the standing distance is the only free variable.
 *
 * This REPLACES the Phase-3 spec's 1.2 m, which was a starting guess, and it
 * sits between the other readings rather than agreeing with any: the older
 * estimates cluster near Ø 2 m (r 1.0), while the İçərişəhər museum's own
 * cutaway model — filmed in 20260801_171223.mp4 — shows a much narrower neck at
 * each crown, around r 0.25–0.45. Neither is a survey either. What would settle
 * it is one frame shot straight up from under the oculus: the springing ring and
 * the opening then appear concentric and the distance drops out of the ratio.
 */
const OCULUS_RADIUS_DEFAULT = 0.72 // m radius — [PHOTO] ±0.14, see note above
const FLOOR_SLAB = 0.3 // m — [ASSUMPTION] visible thickness of the annular floor slab

// ———————————————————————— derived helpers ————————————————————————

/** Wall thickness at height y (linear taper base→top). Exported per Phase-1 spec. */
export function wallThicknessAt(y: number): number {
  // the taper runs over the tower's REAL extent, ground to top — not from the
  // storey-1 floor, which is 2 m up the wall
  return taperedWallThickness(y - GROUND_Y, HEIGHT, WALL_BASE, WALL_TOP)
}

/**
 * Inner radius at height y. Outer drum is vertical (constant OUTER_RADIUS); the
 * wall thins from inside going up, so the inner radius GROWS with height.
 * Sanity: at y=0 → 8.25-5.0 = 3.25 m (inner Ø 6.5 m, matches [ref] "~6.5 m внизу");
 *         at y=H → 8.25-3.7 = 4.55 m (inner Ø 9.1 m, within [ref] "~8–10 m вверху").
 */
export function innerRadiusAt(y: number): number {
  return OUTER_RADIUS - wallThicknessAt(y)
}

// ————————————————————————————— floors —————————————————————————————

export interface FloorSpec {
  /** 0-based index. */
  index: number
  /** 1-based storey number, for human-facing labels. */
  floorNumber: number
  /** World Y of the floor surface (y=0 at storey 1). */
  floorY: number
  /** World Y of the cupola crown / ceiling of this storey. */
  ceilingY: number
  /** Clear height floor→ceiling of this storey. */
  clearHeight: number
  /** Radius of the central oculus opening in this storey's cupola. */
  oculusRadius: number
  /** Wall thickness at this storey's floor level. */
  wallThicknessAtLevel: number
  /** Inner (free) radius at this storey's floor level. */
  innerRadiusAtLevel: number
  /** World Y where the cupola springs off the inner wall (below the crown). */
  cupolaSpringY: number
  /** Inner radius at the springing level — the cupola's span. */
  cupolaSpanRadius: number
  /** Whether this storey's floor slab is pierced by the opening below it. */
  hasFloorOpening: boolean
}

/**
 * The central openings, surveyed storey by storey off the owner's 2026 footage.
 *
 * The model used to pierce EVERY storey above the first, so that the openings
 * lined up and you could see the sky from the bottom. The building does not do
 * that — "на этажах не везде есть дыра по середине пола". There are three, and
 * they do not line up at all:
 *
 *   storey 1 vault → storey 2 floor   the well the modern steel spiral rises
 *                                     through, not an oculus
 *   storey 4 vault → storey 5 floor
 *   storey 7 vault → storey 8 floor
 *
 * Storeys 3 and 6 have unbroken paving and a closed vault; the round thing in
 * storey 3's floor is the WELL head, a shaft going down, not a link upward.
 *
 * Diameters are [VIDEO] — read off a frame by taking the frameless glass guard
 * round each opening as 1.00–1.10 m, the ratio being nearly independent of where
 * the camera stood. The method is written out in each entry's tolerance. The
 * storey-8 opening measures ~0.5 m smaller than storey 5's; that difference is
 * visible in the footage but sits only just outside the method's own tolerance,
 * so treat it as likely rather than settled.
 *
 * That guard is fabric and is now built — config/modern.ts, OPENING_GUARD for
 * its height and GUARDED_OPENINGS for which of these three holes carries one.
 * Note which way the dependency runs before quoting either at the other: the
 * guard's height is the ASSUMED ruler these figures were read against, not a
 * second measurement that corroborates them. The numbers below are frozen
 * results, not expressions in it, so correcting the guard does NOT correct them.
 */
const OPENINGS: Record<number, { radius: number; note: string }> = {
  // keyed by the index of the storey whose VAULT is pierced
  0: { radius: 0.9, note: '[VIDEO] Ø ~1.8 m ±0.3 — modern stair well, glass-guard ratio' },
  3: { radius: 1.2, note: '[VIDEO] Ø ~2.4 m ±0.5 — glass-guard ratio, bench cross-check' },
  6: { radius: 0.7, note: '[VIDEO] Ø ~1.4 m ±0.35 — glass-guard ratio' },
}

function buildFloors(): FloorSpec[] {
  const floors: FloorSpec[] = []
  let y = 0
  for (let i = 0; i < FLOOR_COUNT; i++) {
    const clearHeight = i === 0 ? GROUND_CLEAR : UPPER_CLEAR
    const floorY = y
    const ceilingY = floorY + clearHeight
    const cupolaSpringY = ceilingY - CUPOLA_RISE
    floors.push({
      index: i,
      floorNumber: i + 1,
      floorY,
      ceilingY,
      clearHeight,
      // 0 where the vault is closed — most of them are
      oculusRadius: OPENINGS[i]?.radius ?? 0,
      wallThicknessAtLevel: wallThicknessAt(floorY),
      innerRadiusAtLevel: innerRadiusAt(floorY),
      cupolaSpringY,
      cupolaSpanRadius: innerRadiusAt(cupolaSpringY),
      // this storey's floor is pierced iff the vault BELOW it is
      hasFloorOpening: OPENINGS[i - 1] !== undefined,
    })
    y = ceilingY + CEILING_STRUCTURE // next floor sits above this cupola
  }
  return floors
}

export const FLOORS: FloorSpec[] = buildFloors()

/** Y of the top of the 8th storey's ceiling structure (base of the parapet). */
const TOP_OF_FLOORS = FLOORS[FLOOR_COUNT - 1].ceilingY + CEILING_STRUCTURE

// —————————————————————————— tower summary ——————————————————————————

export const TOWER = {
  /** m — [ICOMOS 958] height ABOVE GROUND. Not a world Y; see topY. */
  height: HEIGHT,
  /** World Y of the ground outside — the datum HEIGHT is measured from. */
  groundY: GROUND_Y,
  /** World Y of the top of the parapet. THIS is the tower's top, not `height`. */
  topY: TOP_Y,
  outerDiameter: OUTER_DIAMETER,
  outerRadius: OUTER_RADIUS,
  wallThicknessBase: WALL_BASE,
  wallThicknessTop: WALL_TOP,
  floorCount: FLOOR_COUNT,
  foundationDepth: FOUNDATION_DEPTH,
  /**
   * m — the roof parapet above the deck. [VIDEO] 0.75 ± 0.06; see PARAPET.
   *
   * RESOLVED. This note used to record it as an open contradiction: the config
   * gave 2.6 m as the residual of the stack while the roof footage measured
   * about half a metre, and that was read as evidence that eight storey heights
   * were each some 0.26 m short. They were not. The whole gap was an arithmetic
   * slip in the datum — [ICOMOS 958]'s 29.5 m is height ABOVE GROUND, and the
   * stack laid it off from the storey-1 floor, 2 m up the wall, omitting the
   * sourced sill. 2.07 m of discrepancy against a 2.00 m omission.
   *
   * It is no longer a residual at all. PARAPET is the measured input now and
   * CEILING_STRUCTURE is what falls out of the budget, which is the right way
   * round: one of them was measured and the other never was. This expression
   * stays as a consistency check — it must reproduce PARAPET, and if it ever
   * stops doing so the datum or a sourced clear height has moved.
   */
  parapetHeight: TOP_Y - TOP_OF_FLOORS,
  /** Rise of each shallow cupola, crown down to its springing [ASSUMPTION]. */
  cupolaRise: CUPOLA_RISE,
  /** Visible thickness of an annular floor slab [ASSUMPTION]. */
  floorSlab: FLOOR_SLAB,
  /** m — masonry and fill above each cupola crown [DERIVED]; see the note above. */
  ceilingStructure: CEILING_STRUCTURE,
  /** Default oculus radius [PHOTO] ±0.15 — see the note at its definition. */
  oculusRadius: OCULUS_RADIUS_DEFAULT,
} as const

// —————————————————————————————— buttress —————————————————————————————
// Massive solid beak-like projection (docs/maiden-tower-reference.md).

// Plan geometry measured from the OpenStreetMap footprint (way 299418016) by
// RANSAC-fitting the drum and treating the outliers as the buttress. Scale check:
// the fit gives Ø 16.67 m against the documented 16.5 m (1%), and 14 drum nodes
// agree to ±0.03 m — so the tracing is consistent. [OSM] = hand-traced from
// satellite imagery: better than inventing numbers (rule 1), weaker than a survey.
//
// AZIMUTH CONFLICT: [ref]/[ICOMOS 958] say the buttress points "east" (~90°,
// glossed as equinox sunrise). The footprint measures 106.7° (ESE) — 17° away,
// more than tracing error explains. The prose figure may be rounded to fit the
// astronomical hypothesis. Default to the MEASURED value and let Phase 8 report
// whatever the equinox test actually yields (rule 7: no fitting geometry to a
// hypothesis). Set back to 90 in leva to compare.
export const BUTTRESS = {
  azimuthDeg: 106.7, // [OSM] centre→tip-midpoint bearing; [ref] prose says ~90° — see note above
  projection: 10.7, // m beyond the outer wall — [OSM] (tip at r 19.01, drum r 8.34)
  tipWidth: 3.0, // m across the nose — [OSM] (was a 9.0 m invention before measuring)
  rootArcDeg: 40.8, // ° of drum circumference the buttress springs from — [OSM] 72.7°→113.5°
  skewDeg: 13.6, // ° the tip axis leans off the root-arc midpoint — [OSM]; this is the asymmetry seen in photos
  plan: 'beak-rounded' as const, // клювообразная, скруглённая [ref]
  get direction() {
    return azimuthToVector(this.azimuthDeg)
  },
}

// —————————————————————————————— entrance —————————————————————————————
// RESOLVED (was an open question): the ground entrance faces WEST, not south-east.
//
// [ref] and English Wikipedia say "south-east"; [İçərişəhər] (the monument's official
// custodian) and az.Wikipedia say the sole entrance is on the west side ("qərb tərəfində"),
// 2 m above the former ground surface and 1.1 m wide.
//
// The photographs settle it. In reference-photos/exterior/"Torre de la Doncella … DD 06.jpg"
// the doorway faces the camera squarely while the buttress is COMPLETELY absent from frame.
// A 10.7 m buttress can only vanish when the camera sits near the anti-buttress bearing
// (~287°), which puts the entrance near west. Were the entrance at 135°, the buttress at
// 106.7° would be a mere 28° away and would dominate that photograph. It does not appear.
// A separate frame showing entrance and buttress together puts them ~160° apart, matching
// 270° vs 106.7°, not 135° vs 106.7°.
//
// So [ref] is wrong here: its "south-east door" is a DIFFERENT opening — the "door to
// nowhere" partway up the tower, which is what Islamov's winter-solstice claim concerns.
// The two were conflated. docs/maiden-tower-reference.md still needs that correction.
//
// 270 is taken from the source (İçərişəhər's compass word) rather than from my own
// photogrammetry (~287°), whose ±20° precision does not justify overriding a cited figure.
export const ENTRANCE = {
  azimuthDeg: 270, // west — [İçərişəhər]/az.Wikipedia, corroborated photographically; NOT [ref]'s 135°
  width: 1.1, // m — [İçərişəhər] doorway width (sourced)
  height: 2.0, // m — [PLACEHOLDER] opening height not in sources
  /**
   * m — how far the sill stands above the FORMER GROUND SURFACE, which is
   * outside the tower. [İçərişəhər], "2 m above former ground surface".
   *
   * This used to be read as a world Y, on a note that the datum was "≈ storey-1
   * level". That conflated the street outside with the floor inside, and it put
   * the threshold two metres ABOVE the chamber it opens onto: you climbed the
   * stair, went through the door and stood on a lip with a two-metre drop in
   * front of you, unable to reach the floor or anything on it.
   *
   * The footage says the opposite. Coming in through the door the route is level
   * and then rises — two or three broad steps within the passage, and more up
   * around the drum inside. So the threshold is at the chamber floor and the
   * former ground surface is 2 m BELOW it, out in the street. That is also the
   * plain meaning of a raised entrance.
   */
  sillY: SILL_ABOVE_GROUND,
  /** World Y of the threshold: the floor of storey 1, which it opens onto. */
  get thresholdY() {
    return FLOORS[0].floorY
  },
  /** World Y of the ground outside, one sill height below the threshold. */
  get groundY() {
    return FLOORS[0].floorY - this.sillY
  },
  get direction() {
    return azimuthToVector(this.azimuthDeg)
  },
}

// —————————————————————————————— staircase ——————————————————————————————
// [ref]: the stair runs in the body of the masonry, abutting the inner circle.
// None of its dimensions are surveyed; the values below come from the Phase-4
// spec's stated bands, and the flight is laid out to hit each floor exactly.
//
// WINDING — decided against the Phase-4 spec's assumption, on photographic evidence.
//
// The spec assumed clockwise-when-ascending. Independent blind readings of the
// HISTORIC stair-in-wall photographs disagreed with it: every reading that
// resolved the tread wedges found the NARROW end on the tower-axis side to the
// left when looking up the flight, which puts the axis on your left as you climb
// and therefore makes the helix COUNTERCLOCKWISE seen from above. The readings
// also correctly discarded the newel-spiral photographs, which show the MODERN
// visitor stair and carry no information about the original.
//
// Still worth a human check: this rests on reading wedge convergence in dim,
// wide-angle photographs, not on a survey. Flipping this one value mirrors every
// flight, and the leva control does it instantly.
export const STAIR: {
  winding: Winding
  riserTarget: number
  goingTarget: number
  width: number
  wallClearance: number
  startAzimuthDeg: number
  doorwayWidth: number
  landingLength: number
  endLandingLength: number
} = {
  winding: 'counterclockwise', // from photographs; contradicts the spec's assumed clockwise
  riserTarget: 0.2, // m — spec band 0.18–0.22; the real riser is rounded to fit each storey
  goingTarget: 0.3, // m — [ASSUMPTION] tread depth along the walking line; not in any source
  width: 0.9, // m — radial width of the flight, per the Phase-4 spec
  /**
   * m — thickness of the masonry jamb between the room and the stair passage.
   * [ASSUMPTION] — no source gives it.
   *
   * This has been round the houses. It was 0.15 as an arbitrary gap, then 0 on
   * the reading that the source has the stair ABUTTING the inner face
   * ("примыкает к внутренней окружности стены"). Zero is wrong: it puts the
   * passage's inner boundary exactly on the room's face, so there is no stone
   * between them at all and the flight is once again an open niche onto the
   * chamber for its whole length — which the walkthrough footage flatly
   * contradicts, showing a closed vaulted tunnel entered by a doorway. "Abuts
   * the inner circumference" means the flight sits against the inner ring of
   * the masonry, not flush with the room. So: a real jamb.
   */
  wallClearance: 0.25,
  /**
   * ° — where every flight begins. Still [PLACEHOLDER]: no source fixes it.
   *
   * It was 200, and 200 put the stair through the windows. The flights stack in
   * one sector and the widest sweeps 160°, so from 200 they cover the whole arc
   * from 213 down to about 40 — and the openings run from about 123 to 174 once
   * the lower column is where the photographs put it. Walked, that is not a near
   * miss: with the stepped embrasures built, the climb stopped dead at azimuth
   * 153 on the 2→3 flight and at 131 on 4→6, and every flight completed the
   * moment the recesses were taken out.
   *
   * The arc in that argument was 123–143 when it was written, because the lower
   * column was then filed at 141, inside the upper column instead of 29° round
   * from it. Correcting the windows widened the arc to about 50°, and 100° still
   * clears it — the sweep runs down through 0 to about −60 and never reaches
   * 123. The conclusion survived, but it survived the correction rather than
   * following from the figure quoted, which is worth saying out loud.
   *
   * Two unsourced-against-measured numbers again, and the tie breaks the same way
   * it did for the window bearing: the stair's azimuth is a PLACEHOLDER and the
   * windows' azimuths are photographs. So the placeholder moves. 100° keeps the
   * whole sweep — down through 0 to about −60 on the long flight — clear of the
   * slit column without ever reaching the entrance sector at 270.
   *
   * It runs through the buttress instead, which is not a problem but a slightly
   * better place for a stair: there is more masonry there than anywhere else on
   * the drum.
   */
  startAzimuthDeg: 100,
  /**
   * m — clear width of the doorway between a chamber and the stair passage.
   * [ESTIMATE] 1.1, taken from the SOURCED main entrance, which [İçərişəhər]
   * gives as 1.1 m wide.
   *
   * It used to be the flight's own width, 0.9. That is what a flight needs, not
   * what a doorway needs: you arrive at a landing travelling ACROSS the opening
   * and have to turn through it, and a 0.6 m walker turning into a 0.9 m hole
   * catches on the jamb. Measured, the climb stopped at storey 3 with the walker
   * pressed against a jamb 0.32 m away — the doorway ran out at azimuth 146.25°
   * and the jamb sector began at 146.375°, so the opening was exactly as wide as
   * the flight and not a centimetre more.
   *
   * Matching the main entrance is the least invented figure available: it is the
   * only doorway width the sources give for this building, and a secondary
   * opening being no wider than the front door is a safe way round. Replace it
   * with a tape measurement across any stair doorway and everything downstream
   * follows.
   *
   * IT DID NOT UNBLOCK THE CLIMB, and that is worth recording so nobody assumes
   * it did. Walked afterwards, the walker still stops on the storey-3 floor at
   * 7.08 m, pressed against the same jamb: probing puts the obstruction 0.339 m
   * away at radius 3.80 and azimuth 145.0, which is the inner edge of the jamb
   * occupying the sector centred on 152° (spanning 145.1–158.9° and 7.06–9.16 m).
   * Widening the opening from 0.9 to 1.1 moved its edge from 146.25° to about
   * 147.6°, so it now OVERLAPS that sector by 2.5° where before it abutted it —
   * and the jamb should therefore have been clipped away over the doorway's
   * height range. It was not. So the fault is in the clipping in
   * wallColliders(), not in how wide the hole is, and this widening is a
   * reasonable change that fixes a different problem than the one it was aimed
   * at. See the chip filed for the jamb clipping.
   */
  doorwayWidth: 1.1,

  /**
   * How far a landing runs along the walking line, metres. [ESTIMATE]
   *
   * Long enough to stand on and turn round in, which is what a landing between
   * two flights is for, and short enough not to eat the climb: at the 0.3 m
   * going this is four treads' worth. No source gives it — the footage shows the
   * turn, not its length.
   */
  landingLength: 1.2,

  /**
   * m — the level platform inside the passage at each end of a flight.
   * [ESTIMATE], and the smallest one that is honestly a landing.
   *
   * There has to be something here. Without it the doorway opens straight onto
   * the nosing of the first step, with the passage's end cap a doorway's depth
   * behind it, and from the chamber that reads as a raw rectangular pocket in
   * the wall — which is what the owner saw and called unhewn. A stair in a wall
   * is entered onto a landing.
   *
   * 0.9 m is three treads at the 0.3 m going: enough to stand on with the door
   * behind you before the first riser, and short enough that four of them (two
   * flights' worth) do not push the stack round the drum. No source gives it.
   */
  endLandingLength: 0.9,
}

/**
 * The stair settings as ONE object, with the leva panel's overrides folded in.
 *
 * Not a convenience. STAIR grew two fields — landingLength and endLandingLength
 * — and every caller of planAllFlights was building its own six-field literal
 * from the leva controls, so both were silently undefined and the landings were
 * simply not in the tower. Worse, they were not missing everywhere: hotspots.ts
 * and two test files pass STAIR itself, so the tests were asserting a stair the
 * application did not build.
 *
 * Threading the whole object through is CLAUDE.md rule 2 applied properly —
 * change a number in the config and the model changes. A literal that has to be
 * kept in sync by hand is a place where that stops being true.
 */
export function stairSettings(overrides: Partial<StairSettings> = {}): StairSettings {
  return { ...STAIR, ...overrides }
}

// ———————————————————— vertical circulation, 2026 ————————————————————
//
// How you actually get from storey to storey in the tower AS IT STANDS.
//
// This replaces the model's earlier assumption — one continuous helix in the
// wall running the full 23.6 m, a flight per storey gap — which was mine, not
// the sources'. docs/maiden-tower-reference.md says only that the stair "примыкает
// к внутренней окружности стены, проходит в теле кладки"; it fixes neither the
// extent nor the number of flights. It does say the storeys are linked vertically
// through the oculi, which is a different arrangement altogether.
//
// The table below is the owner's own account of the building, walked in 2026 and
// corroborated frame by frame against their two walkthrough videos (ascent
// "снизу вверх", descent "сверху вниз"). Timings cited are seconds into the ascent.
//
// The one that breaks the pattern is 4→6: a SINGLE flight spanning two storey
// heights, with a doorway onto storey 5 partway along. Everywhere else you leave
// the passage at each storey, cross the chamber and enter the next doorway — no
// flight runs past a storey. That is the whole of "сплошная только для двух ярусов".
export type LiftKind =
  /** Free-standing modern steel spiral, in the middle of the chamber. */
  | 'modernSpiral'
  /** Original stone flight inside the wall thickness. */
  | 'wallStair'

export interface StairLift {
  kind: LiftKind
  /** World Y the flight leaves from. */
  fromY: number
  /** World Y it arrives at. */
  toY: number
  /**
   * Floor levels this flight runs PAST without ending, opening onto them partway
   * along. Empty for every lift but 4→6.
   */
  opensAtY: number[]
  /** The same storeys as 1-based numbers, for the slab cuts and for labels. */
  opensAtFloorNumbers: number[]
  /**
   * Heights where the flight runs level for a few treads before climbing on.
   *
   * Only the roof climb has one. It is not a storey and there is no room at that
   * level — see FlightParams.landingsAtY for why it is modelled as level treads
   * rather than as two separate flights.
   */
  landingsAtY: number[]
  /** For labels and for provenance in the UI. */
  fromFloorNumber: number
  toFloorNumber: number
  /** Where this came from, so nobody has to guess later. */
  source: string
}

function buildLifts(): StairLift[] {
  // TOP_OF_FLOORS is the base of the parapet, i.e. the deck you walk out onto
  const y = (floorNumber: number) =>
    floorNumber > FLOOR_COUNT ? TOP_OF_FLOORS : FLOORS[floorNumber - 1].floorY

  const lift = (
    kind: LiftKind,
    from: number,
    to: number,
    source: string,
    opensOnto: number[] = [],
    /** Fractions of the climb at which the flight pauses on the level. */
    landingsAt: number[] = [],
  ): StairLift => ({
    kind,
    fromY: y(from),
    toY: y(to),
    opensAtY: opensOnto.map(y),
    opensAtFloorNumbers: opensOnto,
    landingsAtY: landingsAt.map((t) => y(from) + (y(to) - y(from)) * t),
    fromFloorNumber: from,
    toFloorNumber: to,
    source,
  })

  return [
    // "с первого яруса на второй по середине есть винтовая лестница" — and the
    // footage shows it plainly: a free-standing dark-steel spiral with chequer
    // treads and a part-glazed balustrade, climbed 48–72 s, no landing on the way.
    lift('modernSpiral', 1, 2, '[OWNER] + [VIDEO] ascent 48–72 s'),
    /*
     * A caution on the uniformity this table implies. Moving time up 2→3 is
     * 23.6 s against 8.8 s for 6→7, and no pause accounts for the difference.
     * Either the flights differ markedly in length — which would kill the
     * uniform 2.5 m storey — or the walker's pace varied that much. Nothing in
     * the corpus separates the two, and no flight below the roof yielded a tread
     * count: each begins with a straight run and breaks into winders inside the
     * wall, so no single frame holds both the first tread and the last.
     */
    lift('wallStair', 2, 3, '[OWNER] + [VIDEO] ascent 100–126 s'),
    lift('wallStair', 3, 4, '[OWNER] + [VIDEO] ascent 169–196 s'),
    // The exception. One flight, two storey heights, storey 5 entered from
    // partway along it: "с 4 на 5 и 6 всего одна лестница где на 5 выходишь
    // с середины пути по лестнице".
    lift('wallStair', 4, 6, '[OWNER] + [VIDEO] ascent 220–310 s', [5]),
    lift('wallStair', 6, 7, '[OWNER] + [VIDEO] ascent 337–345 s'),
    /*
     * The last two are [VIDEO] only — the owner's account stopped at 6→7. Both
     * walkthroughs show worn stone treads in a close ashlar passage with a bolted
     * tubular handrail at these levels, and no modern stair anywhere above the
     * entry chamber, so stone is what the footage supports.
     *
     * 8→roof IS NOT ONE FLIGHT, and the model has it wrong. Verified frame by
     * frame in the ascent and corroborated by the descent's matching traverse:
     * the walker leaves the storey-8 floor at 429.0 s, climbs 3–4 risers to a
     * LANDING by 432.5, stands seven seconds at a barred gate — behind which a
     * SEPARATE blocked stair rises to a window slit — turns at 441.8, then climbs
     * a straight run of 13 ± 1 risers to the deck at 449.4. Sixteen or seventeen
     * risers in two flights about a landing, plus a branch that is not modelled
     * at all. Left as one flight here only because splitting it needs a level
     * that is not a floor, and that is a change to the lift table's shape.
     *
     * What the count DOES establish: 16–17 risers over the derived 3.281 m rise
     * is 0.193–0.205 m per riser, which brackets the assumed 0.2 exactly. Note
     * the circularity — the rise came from the model — so this shows count and
     * assumption are mutually consistent, not that either is right. The one
     * independent photogrammetric estimate, 0.193–0.304 m off a calibrated
     * still, has its lower edge in the same place.
     */
    lift('wallStair', 7, 8, '[VIDEO] ascent 395–404 s — frames extracted, never analysed'),
    /*
     * The roof climb, and the only lift with a landing in it.
     *
     * [VIDEO] ascent 429–449 s: 16–17 risers, TWO flights with a landing between
     * them. The count and the landing's existence are read off the footage; WHERE
     * along the climb it falls is not — the frames show the turn but not how many
     * steps preceded it, and the camera is at chest height on a moving body.
     *
     * Halfway is therefore [ESTIMATE], chosen because it is what two flights of
     * equal length means and because nothing in the footage argues for an uneven
     * split. If anyone ever counts the risers before and after the turn, this is
     * one number to change.
     */
    lift(
      'wallStair',
      8,
      FLOOR_COUNT + 1,
      '[VIDEO] ascent 429–449 s — 16–17 risers, TWO flights and a landing; the landing is placed at mid-climb [ESTIMATE]',
      [],
      [0.5],
    ),
  ]
}

export const LIFTS: StairLift[] = buildLifts()

/** Just the flights cut in the masonry — the modern spiral is not one of them. */
export const WALL_LIFTS: StairLift[] = LIFTS.filter((l) => l.kind === 'wallStair')

// ———————————————————————————————— well ————————————————————————————————

// The best-sourced part of the whole model: [ref] gives almost every dimension
// here, down to the pipe wall thickness. Three conflicts are recorded rather
// than resolved, because resolving them needs the İçərişəhər survey:
//   - storey of the mouth: 2nd per [ref]; 3rd per the Commons photo caption and
//     İçərişəhər's own Google Arts entry;
//   - depth: 21 m per [ref] and AZƏRTAC; 13 m per that same İçərişəhər entry;
//   - Ø 0.7 m is almost certainly the BORE, not the mouth — the photographs show
//     a funnel collar visibly wider than the shaft below it, so modelling 0.7 m
//     at floor level will look narrower than every reference photograph.
/**
 * The grilles over the openings.
 *
 * MODERN FABRIC, and in scope: CLAUDE.md lists window grilles among the
 * insertions the 2026 target state includes. The tower's slits carry a plain
 * welded grid, set back in the reveal rather than flush with the face.
 *
 * Every number here is [ESTIMATE] and none of it can be measured from what we
 * have: the exterior photographs resolve the grid as a texture, not as bars, and
 * no interior frame shows one close enough to count. What they do establish is
 * the character — a coarse grid of a few bars each way, not a fine mesh and not
 * a single stanchion — so the values are chosen to read as that at walking
 * distance and are deliberately round, to look like the guesses they are.
 */
export const WINDOW_GRILLE = {
  /** Square bar, side in metres. [ESTIMATE] */
  barSide: 0.02,
  /** Clear gap between bars, both ways. [ESTIMATE] */
  gap: 0.12,
  /** Set back from the outer face, so the grid sits inside the reveal. [ESTIMATE] */
  inset: 0.1,
  /** How far each bar runs past the opening into the jamb. [ESTIMATE] */
  embed: 0.05,
} as const

/**
 * The stepped embrasures at the windows whose sills are out of reach.
 *
 * "к некоторым окнам в настоящей башне ведут ступени" [OWNER]. Which ones is not
 * chosen here — planEmbrasure() derives it from the openings' own heights, and
 * comes out at three of the nine: lower-2, upper-1 and upper-2, whose inner
 * sills stand 1.83, 2.95 and 2.60 m above the floors they light. The other six
 * sit between 1.06 and 1.61 m, which is a window you simply look out of.
 *
 * A CONFLICT worth writing down: an earlier reading of the walkthrough footage
 * counted three barred branches off the stair with 6, 3 and 3 steps. The COUNT
 * of branches matches this derivation exactly; the steps do not — the rule below
 * gives 6, 5 and 1. The 6 agrees. Nothing here is tuned to make the other two
 * agree, because the footage note is a recollection of frames, not a measurement,
 * and bending the geometry to it would be fitting the model to a memory.
 */
export const WINDOW_EMBRASURE = {
  /** m — target riser, matched to the stair's own so the two read as one mason's work. [ESTIMATE] */
  riserTarget: 0.2,
  /**
   * m — tread depth going into the wall. [ESTIMATE]
   *
   * WIDE AND DEEP, not a stepladder. The first version had 0.28 m treads in a
   * 1.2 m recess — a width-to-going ratio of 4.3 — and the owner called the
   * result crude. The one photograph that shows an embrasure from inside
   * (interior/flickr_adamharvey_inside_maiden_tower_passage.jpg) gives no metres,
   * because nothing of known size is in frame, but the RATIO is dimensionless
   * and survives the projection: 0.9–1.9 over the physically possible camera
   * positions. So the building has a few deep broad steps where the model had a
   * fine ladder, and at any absolute size that reads as cheap.
   *
   * 0.5 and 0.9 give 1.8, inside that band. Most of the correction is taken out
   * of the width rather than the going, because the going is bounded by the wall:
   * upper-1 climbs six steps, and at 0.5 m each plus the platform the recess is
   * 3.7 m into a wall 4.26 m thick there. A 1.0 m going would not fit.
   */
  going: 0.5,
  /** m — clear width of the recess. [ESTIMATE]; see the note on `going`. */
  width: 0.9,
  /** m — the standing place at the top, deep enough for both feet. [ESTIMATE] */
  platformDepth: 0.7,
} as const

export const WELL = {
  diameter: 0.7, // m — [ref]; see the note above on bore vs mouth
  /**
   * m — the funnel collar at the wellhead. [PHOTO] ±0.11.
   *
   * Measured on 20260801_165004.jpg, main camera, DigitalZoomRatio 1.0. The
   * mouth's ellipse has an axis ratio of 0.865, so the optical axis was 30.2°
   * off the floor normal and the distance follows from the phone's height; the
   * 1850 px major axis then gives 1.08 m. Replaces an assumed 1.30, which was
   * 17% — two sigma — too wide.
   *
   * It also settles a suspicion this file already recorded: [ref]'s 0.70 m is
   * the BORE, not the mouth. WELL.diameter stays at 0.70.
   */
  mouthDiameter: 1.08,
  collarDepth: 1.0, // m — [ASSUMPTION] how far down the funnel narrows to the bore
  depth: 21, // m — [ref] to the aquifer; İçərişəhər says 13 m
  /**
   * 0-based index of the storey whose floor the wellhead opens in. 2 → STOREY 3.
   *
   * [VIDEO], and it overrides [ref]'s 2nd storey. Two independent readings of
   * the owner's 2026 walkthroughs — the ascent and the descent, read blind of
   * each other — both put the glass-covered wellhead in the floor of the third
   * chamber, alongside the display case of stacked ceramic pipe sections, and
   * both describe the second chamber's floor as unbroken.
   *
   * The conflict is real and is NOT resolved by preference. [ref] says the well
   * was FOUND on the 2nd storey and İçərişəhər's own captions elsewhere say the
   * 3rd, so the documents already disagree with each other. What settles it for
   * THIS model is the target: the tower as it stands in 2026, and the footage is
   * that state. A 1962-63 excavation note about where a shaft was discovered is
   * evidence about the building's history, not about which floor a visitor sees
   * it in today — and if the two are genuinely different, both are right.
   */
  startsAtFloorIndex: 2,
  /** Azimuth of the wellhead within the room. [PLACEHOLDER] — no source fixes it. */
  azimuthDeg: 20,
  /** Distance of the wellhead from the tower axis. [PLACEHOLDER]. */
  offsetFromAxis: 2.4,
}

// ———————————————————————— water collection ————————————————————————
// [ref]: "Керамическая труба Ø 30 см идёт вниз из ниш в колодец. Между 2-м и 7-м
// ярусами — полукруглый жёлоб на каждом ярусе: керамические трубы Ø 20–25 см,
// стенка 2.2 см, сегмент 40–45 см… Ниже уровня земли трубы четырёхугольные,
// 22 × 18 см, идут снаружи сквозь стену."
export const WATER = {
  /** Main downpipe from the niches into the well. */
  downpipeDiameter: 0.30, // m — [ref]

  /*
   * How far above the wellhead's rim the horizontal leg crosses to the mouth.
   * [ESTIMATE] — no measurement exists for it, and none is likely to: the last
   * courses of the real pipe were lifted long ago and the museum's cutaway
   * draws the junction schematically. 0.25 m is a plumber's clearance, enough
   * to see daylight between leg and rim.
   *
   * It is a named constant because the vertical run must END here rather than
   * carry on to the rim. It used to run past the leg and stop 0.25 m lower,
   * which read as a pipe standing IN the wellhead and rising out of it — water
   * running the wrong way. A downpipe delivers from above.
   */
  downpipeElbowRise: 0.25, // m — [ESTIMATE]
  /** Ring channels collecting from the floors. */
  channelDiameter: 0.225, // m — [ref] gives 0.20–0.25; midpoint
  channelWallThickness: 0.022, // m — [ref]
  channelSegmentLength: 0.425, // m — [ref] gives 0.40–0.45; midpoint
  /** Storeys carrying a collecting channel, 0-based: storeys 2..7 [ref]. */
  channelFloorRange: [1, 6] as const,
  /** Below ground the pipes turn rectangular and leave through the wall [ref]. */
  buriedPipeWidth: 0.22, // m — [ref]
  buriedPipeHeight: 0.18, // m — [ref]
  /**
   * m — how far below the paving the buried pipes run. [ASSUMPTION]; [ref] says
   * only that they are "ниже уровня земли".
   *
   * It matters that this is measured DOWN FROM THE GROUND rather than given as a
   * world Y. It used to be a hard-coded −1.2 in the component, which was under
   * the paving while the paving was near y = 0. Once the ground was put where
   * the raised entrance says it is, two metres lower, the pipes were left
   * standing 0.8 m in open air, sticking out of the tower's base like planks.
   */
  buriedPipeDepth: 0.6,
}

// ———————————————————————————————— site ————————————————————————————————

export const SITE = {
  latitude: 40.3661, // [ref] 40°21′58″N
  longitude: 49.8372, // [ref] 49°50′14″E
}
