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
 *
 * Units: metres. Y up. north = -Z, east = +X. Azimuth clockwise from north.
 *
 * TARGET STATE: the tower AS IT STANDS AFTER THE 2009–2013 RESTORATION.
 * This is a deliberate choice, and it decides several arguments in advance:
 *   - the staircase was replaced during that restoration, so the present stone
 *     stair is the one to model, not whatever the pre-2007 photographs show;
 *   - the current stone paving of the floors is post-restoration and counts as
 *     correct, even though it hides the drainage channels described in [ref];
 *   - reference photographs from 2007–2008 (the Flickr set) document an EARLIER
 *     state — use them for masonry texture and for features the restoration
 *     covered up, but never for geometry that the restoration changed.
 * Modern visitor fittings (glass well covers, guard rails, handrails, strip
 * lights, the metal spiral stair) are part of that state but are NOT modelled:
 * they are museum equipment, not architecture.
 */

import { azimuthToVector, taperedWallThickness } from '../lib/geometry'
import type { Winding } from '../lib/staircase'

// ————————————————————————— measured shell —————————————————————————

const HEIGHT = 29.5 // m — [ICOMOS 958] total above-ground height (a mean: ~28 m seaward / ~31 m landward due to sloping rock)
const OUTER_DIAMETER = 16.5 // m — [ICOMOS 958] outer diameter at base; outer drum is near-vertical
const OUTER_RADIUS = OUTER_DIAMETER / 2 // 8.25 m
const WALL_BASE = 5.0 // m — [ICOMOS 958] wall thickness at base
const WALL_TOP = 3.7 // m — mean of 3.2–4.2 m [ICOMOS 958] (some sources 4.5); Phase-1 spec fixes 3.7
const FLOOR_COUNT = 8 // [İçərişəhər], [ICOMOS 958]
const FOUNDATION_DEPTH = 15 // m — [ICOMOS 958] shaft/foundation extends ~15 m below ground

// ———————————————————————— floor-stack model ————————————————————————
// Clear (floor-to-cupola-crown) heights ARE sourced [İçərişəhər / az.Wikipedia]:
//   ground storey 3.0 m; upper storeys 2.5 m "on average" (orta hesabla).
// The per-storey survey is not public, so 2.5 m is applied uniformly to floors 2–8
// [ASSUMPTION]. Ceiling structure and parapet are NOT surveyed [ASSUMPTION]; they are
// tuned so the stack sums to HEIGHT. floorY/ceilingY are DERIVED (never hardcoded):
//   3.0 + 7×2.5 (clear) + 8×0.8 (ceilings) + 2.6 (parapet) = 29.5 m ✓
// OPEN CONFLICT, recorded rather than tuned away. Measuring the exterior slit
// windows against tower height in the photographs puts the topmost slit at
// ≈0.94 H ≈ 27.7 m — which this stack places INSIDE the parapet (storey-8 ceiling
// lands at 26.1 m, ceiling structure ends at 26.9 m). A real opening cannot sit in
// solid parapet, so at least one of these is wrong: the uniform 2.5 m UPPER_CLEAR,
// the 0.8 m CEILING_STRUCTURE, or the 2.6 m parapet residual that follows from them.
// The same photographs give a mean vertical slit spacing of ≈2.8 m against the 3.3 m
// storey pitch derived here, pointing the same way. Do NOT fit the stack to the
// slits: that would silently convert a measurement into an assumption. Resolve it
// with the İçərişəhər survey.
const GROUND_CLEAR = 3.0 // m — [İçərişəhər] 1st storey clear height
const UPPER_CLEAR = 2.5 // m — [İçərişəhər] upper storeys, average → [ASSUMPTION] applied to each
const CEILING_STRUCTURE = 0.8 // m — [ASSUMPTION] masonry + fill above the cupola crown, up to the next floor
// Rise (стрела подъёма) of the shallow cupola, measured down from the crown to where
// it springs off the inner wall. [ASSUMPTION] — no source gives it. Kept deliberately
// small: [ref] calls the vaults "пологие" (shallow), and photographs of the one
// documented cupola show a very flat dome with concentric ring courses.
const CUPOLA_RISE = 0.9 // m — [ASSUMPTION]
/**
 * Oculus radius. [PHOTO] — measured, not assumed, but with a stated tolerance.
 *
 * Derived from an interior photograph of the owner's (20260801_165136.jpg, Galaxy
 * S23 Ultra). EXIF gives a 23 mm equivalent focal length, so the horizontal field
 * is 2·atan(18/23) = 76.1° and the focal length is 2555 px on the 4000 px frame.
 * The oculus ellipse spans 31.1° across its major axis, which for a horizontal
 * circle is its true diameter seen at its own distance:
 *
 *   camera 2.0 m from the axis → Ø 1.23 m → r 0.61
 *   camera 2.5 m               → Ø 1.48 m → r 0.74
 *   camera 3.0 m               → Ø 1.75 m → r 0.87
 *
 * So r = 0.75 ± 0.15, and the standing distance is the only free variable.
 *
 * This REPLACES the Phase-3 spec's 1.2 m, which was a starting guess, and it
 * sits between the other readings rather than agreeing with any: the older
 * estimates cluster near Ø 2 m (r 1.0), while the İçərişəhər museum's own
 * cutaway model — filmed in 20260801_171223.mp4 — shows a much narrower neck at
 * each crown, around r 0.25–0.45. Neither is a survey either. What would settle
 * it is one frame shot straight up from under the oculus: the springing ring and
 * the opening then appear concentric and the distance drops out of the ratio.
 */
const OCULUS_RADIUS_DEFAULT = 0.75 // m radius — [PHOTO] ±0.15, see note above
const FLOOR_SLAB = 0.3 // m — [ASSUMPTION] visible thickness of the annular floor slab

// ———————————————————————— derived helpers ————————————————————————

/** Wall thickness at height y (linear taper base→top). Exported per Phase-1 spec. */
export function wallThicknessAt(y: number): number {
  return taperedWallThickness(y, HEIGHT, WALL_BASE, WALL_TOP)
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
  /**
   * Whether this storey's floor slab carries the oculus opening. Storey 1 rests
   * on the rock and has no opening beneath it; every storey above is pierced so
   * the openings line up and the sky is visible from the bottom.
   */
  hasFloorOpening: boolean
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
      oculusRadius: OCULUS_RADIUS_DEFAULT,
      wallThicknessAtLevel: wallThicknessAt(floorY),
      innerRadiusAtLevel: innerRadiusAt(floorY),
      cupolaSpringY,
      cupolaSpanRadius: innerRadiusAt(cupolaSpringY),
      hasFloorOpening: i > 0,
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
  height: HEIGHT,
  outerDiameter: OUTER_DIAMETER,
  outerRadius: OUTER_RADIUS,
  wallThicknessBase: WALL_BASE,
  wallThicknessTop: WALL_TOP,
  floorCount: FLOOR_COUNT,
  foundationDepth: FOUNDATION_DEPTH,
  /** Residual height above the top storey — the crenellated roof/parapet [ASSUMPTION]. */
  parapetHeight: HEIGHT - TOP_OF_FLOORS,
  /** Rise of each shallow cupola, crown down to its springing [ASSUMPTION]. */
  cupolaRise: CUPOLA_RISE,
  /** Visible thickness of an annular floor slab [ASSUMPTION]. */
  floorSlab: FLOOR_SLAB,
  /** Default oculus radius [PLACEHOLDER] — see the note at its definition. */
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
  sillY: 2.0, // m above base — [İçərişəhər] "2 m above former ground surface" (datum ≈ storey-1 level)
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
  startAzimuthDeg: 200, // ° — [PLACEHOLDER] where the first flight begins; no source fixes it
}

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
export const WELL = {
  diameter: 0.7, // m — [ref]; see the note above on bore vs mouth
  mouthDiameter: 1.3, // m — [ASSUMPTION] the funnel collar seen in the photographs
  collarDepth: 1.0, // m — [ASSUMPTION] how far down the funnel narrows to the bore
  depth: 21, // m — [ref] to the aquifer; İçərişəhər says 13 m
  startsAtFloorIndex: 1, // 0-based → 2nd storey [ref]; captions elsewhere say the 3rd
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
  /** Ring channels collecting from the floors. */
  channelDiameter: 0.225, // m — [ref] gives 0.20–0.25; midpoint
  channelWallThickness: 0.022, // m — [ref]
  channelSegmentLength: 0.425, // m — [ref] gives 0.40–0.45; midpoint
  /** Storeys carrying a collecting channel, 0-based: storeys 2..7 [ref]. */
  channelFloorRange: [1, 6] as const,
  /** Below ground the pipes turn rectangular and leave through the wall [ref]. */
  buriedPipeWidth: 0.22, // m — [ref]
  buriedPipeHeight: 0.18, // m — [ref]
}

// ———————————————————————————————— site ————————————————————————————————

export const SITE = {
  latitude: 40.3661, // [ref] 40°21′58″N
  longitude: 49.8372, // [ref] 49°50′14″E
}
