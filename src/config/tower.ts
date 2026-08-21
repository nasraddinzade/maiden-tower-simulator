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
 * WITHDRAWN, 2026-08-16. This block used to be headed "INDEPENDENTLY CONFIRMED,
 * once, and it is the only confirmation the vertical model has", and the
 * confirmation is not one. It is kept, struck through in prose, because the
 * springing it certified is the number this whole section turns on.
 *
 * WHAT IT CLAIMED. Storey 3's springing — where the vault leaves the vertical
 * wall — measured at 1.65 ± 0.09 m by fitting two circles in one frame (the
 * floor junction and the vault soffit), solving camera pitch and roll as free
 * parameters, and taking the scale from the tower's OWN sourced taper. The model
 * implies clear − cupolaRise = 2.5 − 0.9 = 1.60, and the two agreed to 0.05 m.
 *
 * WHY IT CANNOT BE WORTH THAT. The scale in that fit is the difference between
 * the two circles' radii, and the taper makes it 0.0441 m per metre of height —
 * 0.071 m out of 3.6 across a wall that is weathered into pockets a hand deep
 * (up/159, up/160). Reproduced here on storey 6 with both curves traced
 * sub-pixel across the whole frame, the residual is flat: profiling the camera
 * height from 0.80 m to 2.00 m moves the rms from 32.8 to 38.7 mm, with the
 * springing sliding from 1.39 to 3.02 m to follow it. There is no minimum to
 * find. Unbounded, the same fit walks to the trivial solution — camera on the
 * wall, h → 0 — at an rms of half a millimetre. A pitch of ±10° buys the whole
 * range on its own, and no interior frame carries a horizon to fix pitch with.
 *
 * SO THE ONE THING THE CHAMBERS CANNOT GIVE UP IS AN ABSOLUTE HEIGHT. What they
 * do give up is RATIOS between things at the same distance, which need neither
 * the pitch nor the camera's height nor the focal length — see
 * DOORWAY_HEAD_FRACTION below, which is measured that way and which refutes
 * 1.65 without needing a better fit than the one it replaces: a springing at
 * 1.65 puts the head of every chamber doorway at 1.24 m.
 *
 * Two other candidate measurements were rejected rather than adopted, and both
 * rejections still stand. Storey 5's springing was scaled off this file's own
 * ROOF_CAMERA_HEIGHT, so it is a measured ratio times an assumption and shares
 * that assumption with PARAPET — not independent. Storey 8's was scaled off a
 * fire extinguisher taken as 0.55 m tall, a dimension imported from outside the
 * building to size the building, and it is contradicted by an integer: 16–17
 * risers from the storey-8 floor to the roof deck would force a 0.284 m riser,
 * 40% above every other estimate.
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
 * m — how THICK the roof parapet is, across the top of the wall. [VIDEO]
 * 0.75, bracket 0.55…0.95. This is the number ROOF_QUESTION was asking for.
 *
 * IT IS NOT THE PARAPET'S HEIGHT AND IT WAS NOT SET EQUAL TO IT. That the two
 * come out at the same 0.75 is a coincidence of two unrelated measurements and
 * is stated here so nobody later reads it as an assumption. The height is the
 * focal-length-free ratio above; this is a full perspective reconstruction and
 * carries three times the tolerance.
 *
 * HOW IT WAS MEASURED. In the roof frames the camera stands about 2–2.6 m inside
 * the parapet and 0.6 m above its coping, so the coping's TOP SURFACE is visible
 * as a band between two arrises: the inner one, where the smooth capping meets
 * the rubble of the inner face, and the outer one, which is the silhouette
 * against the city — beyond it there is nothing but the drop. Both arrises were
 * traced sub-pixel across the frame with a matched step filter, then
 * back-projected onto the horizontal plane 0.6 m below the camera and the
 * perpendicular distance between the two plan lines taken. Frames roof/011 and
 * roof/012.
 *
 * The three inputs, and what each is worth:
 *   · the plane's depth below the lens is Δ = h_c − PARAPET = 0.444·h_c, so the
 *     measured 0.556 ratio cancels most of the phone-height guess: 0.600 ± 0.041;
 *   · the horizon, read off the far shore of the bay in the same frame, which at
 *     ~10 km sits within 2 px of the true horizon. ±30 px is ±0.11 m here and it
 *     is the dominant term;
 *   · the focal length, 1550 ± 150 px on the 1820 px axis. From the vertical
 *     vanishing point of the balustrade posts and glass edges against that same
 *     horizon — 1645 (roof/011, rms 11 px, posts on both sides of the frame),
 *     1500 (roof/012, one side only, rms 32 px) — and 1370–1500 from the stated
 *     phone's field of view with and without its stabiliser crop. t moves only
 *     0.70→0.78 across that whole span, so f is NOT what limits this.
 *
 * roof/011 gives 0.66 ± 0.12 and roof/012 gives 0.83 ± 0.04 (spread across
 * columns) at f = 1550. The 0.75 is their mean; the bracket is the two frames
 * plus the horizon and Δ terms, not a guess widened for comfort.
 *
 * ONE INDEPENDENT CHECK, AND IT READS LOW. reference-photos/views_from/"Maiden
 * towers top old city baku azerbaijan.jpg" is a 2009 Sony DSC-S730 frame with
 * FocalLength 5.8 mm in EXIF — the only hard calibration anywhere in this
 * problem — showing the same parapet from 10.9 m away across the deck. The same
 * reconstruction there gives 0.53…0.71 (camera eye 1.40…1.70 m), centre 0.57.
 * Two readings of that gap, neither of which can be settled from the pictures:
 * at 10.9 m the coping is seen at a 4.2° grazing angle, so any outward fall on
 * its top hides the far part of it and biases that figure DOWN; and the photo is
 * pre-restoration — a 2011–13 capping slab overhanging ~0.09 m a side would
 * produce exactly this difference. Either way the 2026 footage is the evidence
 * that governs a 2026 model, and the 2009 figure is carried as a floor.
 */
const PARAPET_THICKNESS = 0.75
/** m — the bracket PARAPET_THICKNESS sits in. See the note above. */
const PARAPET_THICKNESS_BRACKET = [0.55, 0.95] as const

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
/**
 * m — rise (стрела подъёма) of the shallow cupola, from the crown down to where
 * it springs off the inner wall. [ESTIMATE] 0.25, bracket 0.10…0.45.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * IT WAS 0.9, AND 0.9 IS REFUTED. 2026-08-16.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * The old value was tagged [ASSUMPTION] and defended as "kept deliberately
 * small" — [ref] calls the vaults "пологие" and the one documented cupola is
 * very flat. Both halves of that are still true and the number was still wrong,
 * because nobody had asked what it does to the rest of the section.
 *
 * WHAT IT DOES. UPPER_CLEAR is sourced and is the height at the CROWN, so the
 * springing is 2.5 − rise, and at rise 0.9 that is 1.600 m. A room whose ceiling
 * is 1.600 m at its own wall is a strong claim about the building, and it was
 * being made in silence. It was also self-contradicting: the model cut the
 * doorway onto the stair 2.100 m tall (PLAYER.height + 0.35) in that same
 * 1.600 m wall — a hole half a metre taller than the wall it is cut in. That
 * impossibility is the reason the collision went unnoticed for so long. You
 * never met the 1.600 m ceiling, because at every place you walked to the wall
 * you were walking into a 2.100 m hole in it.
 *
 * WHAT THE FOOTAGE SAYS, and it is a ratio rather than a length — see the note
 * withdrawing the storey-3 springing above for why it can only be a ratio.
 * Measured at storey 6 in up/165, the head of the chamber doorway stands at
 * 0.75 of the springing (DOORWAY_HEAD_FRACTION). So
 *
 *     doorway head = 0.75 × (2.5 − rise)
 *
 * and at rise 0.9 the tower's stair doorways come out 1.20 m tall. They are
 * doorways the owner walked through twelve times.
 *
 * THE BRACKET. 0.10…0.45, and the two ends are argued rather than read, because
 * no frame in the corpus resolves a rise:
 *
 *   · LOWER 0.10. Below rise/span ≈ 0.025 this is not a cupola but a slab with a
 *     curved soffit, and [ref] says cupola: "пологим каменным куполом" with a
 *     central oculus. up/070–073 photograph storey 3's, laid in concentric ring
 *     courses of large slabs — flat enough that a 0.9 m rise over a 3.65 m
 *     half-span would read as a dome in those frames and does not.
 *   · UPPER 0.45. There the doorway head is 1.54 m and the opening 0.81 m wide by
 *     DOORWAY_SPRINGING_RATIO — narrower than the 0.9 m flight it serves, which
 *     is the point at which the stair stops fitting through its own door.
 *   · 0.25 is the middle of that and nothing more. It gives rise/span 0.061, a
 *     sphere of 33.4 m radius, a springing 2.25 m above the floor, a doorway head
 *     at 1.688 m and a doorway 0.889 m wide. Change it and the model changes —
 *     including how tall the visitor is allowed to be, which is now bound to it
 *     by test.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * THE UPPER BOUND USED TO BE THE OWNER'S HEAD, AND THAT ARGUMENT IS DEAD.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * It read: at rise 0.45 the owner — 1.85 m [OWNER] — must crouch 0.31 m at every
 * doorway, and the frames either side of all twelve crossings show a steady
 * walking grip and no dip. The observation is fine and the inference is void,
 * because the same arithmetic applied to the whole admissible range says he
 * crouches at EVERY value of the rise:
 *
 *     head ≥ 1.90 m  ⇒  0.75 × (2.5 − rise) ≥ 1.90  ⇒  rise ≤ −0.03
 *
 * A 1.85 m man cannot walk upright through a doorway three quarters of the way
 * up a 2.5 m room, whatever the vault does. So "no dip in the frames" cannot
 * bound the rise — it bounds nothing, and if it is evidence of anything it is
 * evidence against the sourced 2.5 m or against the 0.75, not against 0.45. It
 * is replaced by DOORWAY_SPRINGING_RATIO below, which is a second measurement of
 * the same class as the first and which brackets the rise from the doorway's
 * WIDTH instead of from a visitor's stature.
 *
 * WHAT IS STILL MISSING, precisely: one tape measurement, of any single vertical
 * length inside any chamber — the springing above the floor, or the head of any
 * stair doorway. One number closes this, because everything else in the section
 * is either sourced (2.5 m) or measured as a ratio (0.75, 2.53). Failing that,
 * one photograph taken along a chamber wall with a metre rule against the stone.
 */
const CUPOLA_RISE = 0.25 // m — [ESTIMATE], bracket 0.10…0.45; see the note above
/** m — the bracket CUPOLA_RISE sits in, carried so a test can guard it. */
const CUPOLA_RISE_BRACKET = [0.1, 0.45] as const

/**
 * The head of a chamber's doorway onto the stair, as a fraction of the height at
 * which that chamber's vault springs. [VIDEO] 0.75, bracket 0.65…0.85.
 *
 * THIS IS THE MEASUREMENT THE SECTION HANGS ON, so how it was got matters.
 *
 * Three points in one image column are at the same horizontal distance from the
 * camera: the floor at the foot of a doorway's jamb, the head of that doorway,
 * and the springing arris directly above it — all in the same wall, all at
 * (near enough) the same radius from the axis. For any three such points the
 * quantity
 *
 *     D / S = (tan e_D − tan e_floor) / (tan e_S − tan e_floor)
 *
 * contains neither the distance nor the camera's height: both cancel. That is
 * the whole reason it can be measured here when a length cannot. At zero pitch
 * and roll it degenerates further, to the ratio of two row differences, and the
 * focal length cancels too.
 *
 * up/165, STOREY 6, the doorway out of the chamber onto the 6→7 climb, seen
 * near square-on with its whole height and the springing above it in one frame.
 * At column x = 250 of 1024: the floor–wall junction at row 1490, the doorway's
 * flat head at 560, the arris where the dark vault leaves the lit stone at 240.
 * (930)/(1250) = 0.744.
 *
 * The pitch is unknown and it is what the bracket is mostly made of, but it is
 * not free: at more than about +11° the floor junction in that column rises to
 * within 0.17 of the horizon, which puts the wall further away than the tower is
 * wide. Over the admissible span −20°…+10° the ratio moves 0.71…0.79.
 *
 * TWO MORE, less square-on and so carried as spread rather than as separate
 * measurements: down/135, the arched doorway out of storey 4, taken at the
 * arch's crown, 0.67; up/111, the same chamber climbing, 0.82. Centre 0.75.
 *
 * WHAT THE ARRIS IS, since the whole thing depends on reading it right. Between
 * the coursed ashlar and the smooth dark vault there is a band two or three
 * courses deep of stone eaten hollow by salt weathering, with the museum's cove
 * LED tucked at its head. Read at high magnification (up/159 right side) the
 * band is weathered WALL, not an oversailing cornice: the erosion goes inward
 * into pockets, the face stays in the plane of the ashlar below, and the bright
 * line at the top is the cove, not a shadow under a projection. So the springing
 * is the top of that band, which is what this ratio is measured against and what
 * cupolaSpringY means.
 *
 * WHAT IT IS NOT. It is not a doorway height. Multiplied by a springing that is
 * itself an estimate it gives one, and that is how STAIR.doorwayHeight is built
 * — but the fraction is the measured thing and the metre value is not.
 */
const DOORWAY_HEAD_FRACTION = 0.75
/** The bracket the fraction sits in. [VIDEO] — see the note above. */
const DOORWAY_HEAD_FRACTION_BRACKET = [0.65, 0.85] as const

/**
 * The springing height above the floor, in units of the stair doorway's own
 * CLEAR WIDTH. [VIDEO] 2.53, bracket 2.28…2.78.
 *
 * THE SECOND RATIO, and the reason it exists: DOORWAY_HEAD_FRACTION ties the
 * doorway's head to the springing and nothing ties either of them to a LENGTH.
 * This one does, because a doorway has a width as well as a height and the width
 * is the one dimension of a chamber that a plan-level figure already exists for.
 * It is the same class of measurement as the fraction — a ratio of two image
 * lengths at the same distance — and it is even cheaper: for two lengths in one
 * near-frontal wall the ratio of pixel spans IS the ratio of metres, with the
 * focal length and the principal point cancelling exactly.
 *
 * HOW IT WAS READ. Brightness profiles across the frame, nine-pixel boxcar, the
 * edge taken where the profile turns rather than by eye:
 *
 *   up/165, STOREY 6, the doorway onto the 6→7 climb. At column 280 of 1024 the
 *   springing arris (the cove LED at the top of the weathered band) is at row
 *   213, the doorway's head at 565, the floor–wall junction at 1487. The
 *   opening's jambs, read across rows 950…1350, stand at columns 245 and 730.
 *   springing/width = 1274/485 = 2.627, head/springing = 922/1274 = 0.724.
 *
 *   up/111, the arched doorway of the storey below, taken at the arch's crown.
 *   Arris 342, crown 510, floor 1330 at column 330; jambs at 310 and 718.
 *   springing/width = 988/407 = 2.427, head/springing = 0.830.
 *
 * The two frames straddle 2.53, 0.20 apart; the bracket is that spread widened
 * by what ±8 px on each of the four edges is worth, which is ±0.05 either way.
 * Note which way the one systematic runs: any obliquity in the view foreshortens
 * the WIDTH and not the height, so both readings are upper bounds on this ratio
 * — a wall turned 20° off square inflates it by 6%, one turned 35° by 22%.
 *
 * WHAT IT SETTLES, and it settles two things the head fraction could not.
 *
 * IT REFUTES rise 0.9 WITHOUT GOING NEAR A VISITOR'S HEAD. At 0.9 the springing
 * is 1.60 m and this ratio makes the doorway 0.63 m wide — narrower than the
 * 0.9 m flight behind it, and narrower than the shoulders of the man who filmed
 * it. The old refutation of 0.9 was that its doorways come out 1.20 m tall and
 * the owner walked through them; that argument turned out to prove too much (see
 * CUPOLA_RISE). This one does not depend on anybody's stature at all.
 *
 * AND IT CONTRADICTS STAIR.doorwayWidth, WHICH IS 1.1. Run the other way, a
 * 1.1 m opening puts the springing at 2.78 m and the crown above it — against a
 * SOURCED 2.5 m — so the two cannot both stand. That conflict is not resolved
 * here and the width has not been moved: see the note on STAIR.doorwayWidth for
 * the whole of it, including the one systematic that could account for it.
 */
const DOORWAY_SPRINGING_RATIO = 2.53
/** The bracket the ratio sits in — the two frames. [VIDEO], see the note above. */
const DOORWAY_SPRINGING_RATIO_BRACKET = [2.28, 2.78] as const
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
  /** Rise of each shallow cupola, crown down to its springing [ESTIMATE]. */
  cupolaRise: CUPOLA_RISE,
  /** m — the bracket the rise sits in, carried so a test can guard it. */
  cupolaRiseBracket: CUPOLA_RISE_BRACKET,
  /**
   * m — how far above its own floor an UPPER storey's vault springs off the
   * wall. [DERIVED] from a sourced clear height and an estimated rise, and the
   * one number in the chamber's section that the walker actually meets: below it
   * the room is a plain drum, above it the ceiling is coming down.
   */
  upperSpringingAboveFloor: UPPER_CLEAR - CUPOLA_RISE,
  /**
   * The doorway head as a fraction of the springing. [VIDEO] 0.75 — see
   * DOORWAY_HEAD_FRACTION for the frames and the method.
   */
  doorwayHeadFraction: DOORWAY_HEAD_FRACTION,
  /** The bracket that fraction sits in, carried so a test can guard it. */
  doorwayHeadFractionBracket: DOORWAY_HEAD_FRACTION_BRACKET,
  /**
   * The springing height in units of the stair doorway's clear width. [VIDEO]
   * 2.53 — the second ratio the chambers give up, and the only one that ties the
   * section to a length. See DOORWAY_SPRINGING_RATIO for the frames and the
   * method, and for what it says about STAIR.doorwayWidth.
   */
  doorwaySpringingRatio: DOORWAY_SPRINGING_RATIO,
  /** The bracket that ratio sits in, carried so a test can guard it. */
  doorwaySpringingRatioBracket: DOORWAY_SPRINGING_RATIO_BRACKET,
  /**
   * m — the stair doorway's clear width as the measured proportion gives it,
   * from a SOURCED crown and an estimated rise. [DERIVED] 0.889.
   *
   * NOT what the model cuts. STAIR.doorwayWidth is 1.1 and the difference is a
   * conflict, not a rounding — it is carried here so a test can state it in one
   * line instead of re-deriving it.
   */
  doorwayWidthByProportion: (UPPER_CLEAR - CUPOLA_RISE) / DOORWAY_SPRINGING_RATIO,
  /** Visible thickness of an annular floor slab [ASSUMPTION]. */
  floorSlab: FLOOR_SLAB,
  /** m — masonry and fill above each cupola crown [DERIVED]; see the note above. */
  ceilingStructure: CEILING_STRUCTURE,
  /** Default oculus radius [PHOTO] ±0.15 — see the note at its definition. */
  oculusRadius: OCULUS_RADIUS_DEFAULT,
} as const

// ———————————————————————————— the roof deck ————————————————————————————
/**
 * THE ROOF, as the footage and one calibrated photograph give it, and as the
 * model now BUILDS it (2026-08-14, third pass).
 *
 * The deck is TOP_OF_FLOORS and the paving crosses the WHOLE thickness of the
 * wall, from the room face out to the inner face of a thin parapet standing on
 * the drum's outer edge [VIDEO roof/016, roof/001, roof/021, roof/032, up/230].
 * So the parapet is a ring `parapetThickness` across and PARAPET high, and
 * everything inboard of it is paved.
 *
 * THE PAVING IS A COURSE OF STONE, NOT A PLANE, and that is what makes the rest
 * of the rebuild work. `masonryTopY` is where the drum's own stone stops and
 * `deckY` is where you stand — one `pavingDepth` higher. Three things need the
 * difference and none of them would work without it:
 *
 *   · the drum's cut and the paving's top are then never coplanar, so the wall
 *     top and the slabs laid on it cannot z-fight along the room face;
 *   · the parapet stands on the same bed as the paving rather than on top of it,
 *     which is what roof/016 shows — the coping's courses run down PAST the
 *     paving's arris into the wall;
 *   · the stair passage gets a lintel over its last roofed metre: the paving is
 *     what carries the terrace over the stair, and it is the only stone there.
 *
 * `pavingDepth` is FLOOR_SLAB, the same [ASSUMPTION] every other floor in the
 * tower is drawn with. No frame shows the slabs' depth — you only ever see their
 * top — so this is a borrowed assumption and deliberately not a new one: the
 * terrace should not acquire a number of its own that nobody measured.
 */
const DECK_OUTER_RADIUS = OUTER_RADIUS - PARAPET_THICKNESS
const DECK_INNER_RADIUS = innerRadiusAt(TOP_OF_FLOORS)
const PAVING_DEPTH = FLOOR_SLAB

/**
 * THE DRAINAGE CHANNEL round the edge of the paving. [OWNER], and then measured.
 *
 * WHAT IT IS. The paving does not run flat into the parapet. It stops a hand's
 * breadth short of it and the last strip is sunk, so that the terrace drains to
 * the wall rather than standing in water — a shallow trough running the whole
 * circuit, dressed smooth, with a crisp arris where it comes back up to the
 * paving. Every roof frame that shows the parapet's foot at all shows it:
 * roof/018 and roof/020 have it raking with the sun, one lit and one in the
 * parapet's own shadow; roof/003, roof/013, roof/012 and roof/022 show it as a
 * band running away round the drum; roof/001 and roof/016 show what it drains
 * TO — a scupper punched clean through the base of the parapet at deck level,
 * with a stone chute in it, which is an outlet and an outlet needs a channel.
 *
 * WHY THE SCUPPERS ARE NOT BUILT WITH IT. Nothing in the corpus says how many
 * there are or where they stand: two frames show one hole each, on bearings that
 * cannot be recovered because neither frame shows the drum. Rule 1 — a scupper
 * placed at a plausible azimuth would be a fabrication with a bearing on it. The
 * channel is a ring and needs no bearing; the holes do, and wait.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * THE WIDTH IS MEASURED. 0.16 m, bracket 0.13…0.20. [ESTIMATE]
 * ═════════════════════════════════════════════════════════════════════════
 *
 * By the same horizon method PARAPET_THICKNESS was got by, in the two roof
 * frames that carry both the sea horizon and the parapet's foot in one view.
 * Rows below the horizon go as f·(h − y)/d, so a point on the deck at distance d
 * sits at f·h/d and the ratio of two such rows IS the ratio of two distances —
 * no focal length in it at all. What the focal length buys is the conversion to
 * metres, and it is this file's own 1550 ± 150 px on the 1820 px axis.
 *
 *   · roof/013, columns near x 400: horizon 62, the parapet's foot 1252, the
 *     channel's outer arris 1376. The foot is at d = f·h/1190 = 1.76 m with
 *     h = ROOF_CAMERA_HEIGHT, the arris at f·h/1314 = 1.59 m, and the difference
 *     is 0.168 m.
 *   · roof/012, near x 700: horizon 70, foot 1247, arris 1355 → 1.78 and 1.63 m,
 *     difference 0.145 m.
 *
 * The two frames are 0.023 m apart, which is a fifth of what the focal length's
 * own ±10% does to either of them, so the spread is not the error — f is, with
 * the camera height (±7%) and the arris rows (±8 px) behind it.
 *
 * TWO CHECKS THAT COST NOTHING AND BOTH PASS. The same rows, read the other way
 * round, hand back numbers this file already holds: the parapet's height taken
 * as a ratio of the camera's own height gives 0.54 in roof/013 against the 0.556
 * PARAPET is built from; and the camera solved from the parapet instead of
 * stated comes out at 1.33–1.39 m against ROOF_CAMERA_HEIGHT's 1.35. Neither is
 * an independent confirmation of anything — same frames, same reader — but a
 * reading that could not reproduce them would have been a reading of the wrong
 * two lines, and that is the failure mode here.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * THE DEPTH IS NOT MEASURED AND CANNOT BE, FROM THIS CORPUS. 0.03 m [ESTIMATE]
 * ═════════════════════════════════════════════════════════════════════════
 *
 * It is not shyness: the reading is degenerate. The channel's floor at the wall
 * is the one point whose row would carry the depth, and its row is also the only
 * thing fixing the camera's distance to the parapet — one equation, two
 * unknowns, and every frame in the corpus is looked at from inside the terrace
 * where those two cannot be separated. A frame taken along the wall, or one
 * showing the scupper's chute against the paving, would separate them. There
 * isn't one.
 *
 * So the number is bracketed by argument rather than read, 0.015…0.05:
 *   · it is cut in the paving course and the frames show a dressed stone floor,
 *     not the bed underneath, so it is a small fraction of `pavingDepth` (0.30);
 *   · deeper than 0.05 and the fall across 0.16 m is steeper than 1 in 3, which
 *     would read as a distinct facet under the raking light of roof/020 and
 *     roof/003; both show a nearly flat band with the fall only at the wall;
 *   · shallower than 0.015 and there is nothing to cast the shadowed line that
 *     runs the length of the wall's foot in roof/013 — about 10 px there, which
 *     is 0.011 m at that frame's scale, and a shadow is never narrower than what
 *     throws it.
 * 0.03 is the middle of that and nothing more. Change it and the model changes.
 *
 * IT GETS NO COLLIDER, and that is a decision rather than an omission. 0.03 m is
 * below the step the capsule resolves and far below PLAYER's autostep; a ring of
 * boxes round the whole circuit to describe it would cost physics for a lip
 * nobody can feel. The deck's collider stays flat at `deckY`.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * AND IT LANDS ON THE BALUSTRADE. [OWNER] — this one needs a decision.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * A channel 0.16 m wide reaches r 7.34, and BALUSTRADE.postRadius is 7.4275. The
 * posts stand IN it, flanges and all, with 0.07 m to spare either side. Nothing
 * about that is a modelling slip — it is two measurements that cannot both be
 * right, and the second one is not this note's to overturn:
 *
 *   · the posts are at 7.4275 because `glassRadius` is DECK_OUTER_RADIUS less
 *     half a pane, i.e. because the glass was read as standing hard against the
 *     parapet's inner face. That is a reading of the frames, not a measurement
 *     off one, and it is what BALUSTRADE's own test asserts;
 *   · every frame that shows the channel shows the flanges bolted to plain
 *     paving, clear of it — roof/003 and roof/018 most plainly, roof/013 and
 *     roof/020 as well;
 *   · read the same way this width was, roof/011 and roof/013 both put the post
 *     axis about 0.20 m in from the parapet's face (the post's distance from its
 *     apparent 0.06 m diameter, the parapet's from the deck row), against the
 *     0.0725 m the config derives. The bracket on that is wide — ±0.04 m, mostly
 *     the focal length again — but it does not reach 0.07.
 *
 * So on the evidence the glass stands about 0.13 m clear of the parapet and the
 * balustrade should move inboard. That would change a number nobody asked to
 * have changed and would retire a test that currently passes, so it is left for
 * the owner. Meanwhile roofBalustrade() stands the feet on the channel's floor
 * rather than hovering them over it: the disagreement is drawn, not hidden.
 */
const ROOF_CHANNEL_WIDTH = 0.16
const ROOF_CHANNEL_DEPTH = 0.03

export const ROOF = {
  /** World Y of the paving's TOP — what you stand on, and where the stair lands. */
  deckY: TOP_OF_FLOORS,
  /**
   * m — depth of the paving course. [ASSUMPTION], borrowed from FLOOR_SLAB; see
   * the note above for why it is borrowed rather than invented.
   */
  pavingDepth: PAVING_DEPTH,
  /**
   * World Y where the DRUM'S stone stops under the paving — the level the
   * terrace void is cut down to and the level the stair passage may be vaulted
   * up to. Everything above it inboard of `deckOuterRadius` is paving or air.
   */
  masonryTopY: TOP_OF_FLOORS - PAVING_DEPTH,
  /** m — height of the parapet above the paving. [VIDEO] 0.75 ± 0.06. */
  parapetHeight: PARAPET,
  /** m — thickness of the parapet. [VIDEO] 0.75, bracket 0.55…0.95; see its note. */
  parapetThickness: PARAPET_THICKNESS,
  /** m — the bracket the thickness sits in, carried so a test can guard it. */
  parapetThicknessBracket: PARAPET_THICKNESS_BRACKET,
  /** m — radius of the paving's outer limit = the parapet's INNER face. */
  deckOuterRadius: DECK_OUTER_RADIUS,
  /** m — radius of the paving's inner limit: the storey-8 room face at deck level. */
  deckInnerRadius: DECK_INNER_RADIUS,
  /** m — width of paved deck the visitor can actually walk, room face → parapet. */
  pavedWidth: DECK_OUTER_RADIUS - DECK_INNER_RADIUS,
  /**
   * m — width of the drainage channel at the parapet's foot. [ESTIMATE] 0.16,
   * bracket 0.13…0.20, measured off roof/012 and roof/013; see the note above.
   */
  channelWidth: ROOF_CHANNEL_WIDTH,
  /**
   * m — how far the channel's floor lies below the paving. [ESTIMATE] 0.03,
   * bracket 0.015…0.05, and bracketed by argument rather than read; see above.
   */
  channelDepth: ROOF_CHANNEL_DEPTH,
  /** m — the bracket the depth sits in, carried so a test can guard it. */
  channelDepthBracket: [0.015, 0.05] as const,
  /** m — radius of the channel's inner lip, where the walkable paving begins. */
  channelInnerRadius: DECK_OUTER_RADIUS - ROOF_CHANNEL_WIDTH,
  /** World Y of the channel's floor. */
  channelInvertY: TOP_OF_FLOORS - ROOF_CHANNEL_DEPTH,
} as const

/*
 * THERE IS NO masonryInnerRadiusAt(), and the attempt is worth one note.
 *
 * The obvious way to teach the wall's colliders about the terrace is a function
 * that answers "the first solid stone going outward at height y" — the room face
 * below the paving, the parapet's inner face above it. It was written, and it is
 * wrong for the thing that wanted it: wallColliders() takes the taper of the
 * inner face ACROSS each band and lays its boxes on that cone. This face does not
 * taper at the paving, it jumps three metres in no height at all, and fed as one
 * function the storey-8 band came out tilted 46°.
 *
 * So the drum's bands stop at ROOF.masonryTopY and the parapet is raised as its
 * own ring in TowerColliders. A step is not a taper.
 */

// ————————————————————————— the roof balustrade —————————————————————————
/**
 * THE STAINLESS-AND-GLASS BALUSTRADE that stands inside the parapet.
 *
 * Modern fabric, and in the model for the reason CLAUDE.md gives for all of it:
 * the target is the tower as it stands in 2026, and "ограждение кровли" is on
 * that list by name. It is also the most conspicuous thing on the terrace — you
 * cannot look out over the city without looking through it — and the model has
 * been drawing the parapet with nothing on it.
 *
 * WHAT IT IS. Tubular posts stood on the paving at the parapet's inner foot,
 * each base a round flange bolted down, each post carrying a spider at its cap
 * and a second one low down; the panes hang OUTBOARD of the posts on point
 * clamps, edge to edge, with the joint at every post; a raking stay ties each
 * post back to the paving. roof/010, roof/011, roof/021, roof/028, roof/032 all
 * show the same fitting from different sides, and
 * reference-photos/views_from/"Baku view from Maiden Tower.JPG" [PHOTO] shows a
 * whole bay of it square-on with the parapet behind. The "SÖYKƏNMƏYİN /
 * DON'T LEAN" plate hangs on the glass in that photograph; it is signage, so it
 * belongs to the museum layer and is not built here.
 *
 * HOW THE HEIGHTS WERE GOT, since no source gives any of them. The parapet is
 * the ruler: it is 0.751 m [VIDEO] and it stands directly behind the balustrade,
 * so anything in the same frame at the same distance can be read against it.
 * Working in the [PHOTO] above, whose rows are easiest to trust because the
 * whole bay is in view:
 *
 *   · the parapet's own face runs from the paving at row 2180 to the coping's
 *     inner arris at row 1370, with the sea horizon at row 830. Rows below the
 *     horizon go as (h_c − y)/d, so 540/1350 = (h_c − 0.751)/h_c solves the
 *     camera at h_c = 1.25 m and fixes the scale at the parapet;
 *   · the right-hand post stands on the paving at row 2380 and caps at row 1292,
 *     which is 0.88 m. Its cap is a little ABOVE the coping, by 0.06 m;
 *   · the panes' top edge runs at row 1100, which is 1.03 m above the paving —
 *     about a quarter of a metre proud of the coping;
 *   · the lower spider's clamps sit at row 2210, 0.14 m up.
 *
 * The video agrees where it can be read the same way: in roof/010 the parapet's
 * face is 543 px for 0.751 m and the post measures 590 px, i.e. 0.82 m, and its
 * lower clamp is 0.145 m above the paving. Two frames and one photograph, three
 * cameras, on the post: 0.88, 0.82, cap level with the coping. The spread is the
 * uncertainty, and it is mostly the parapet's own ±0.06 carried through.
 *
 * WHAT IS NOT MEASURED, and is tagged as such below: the glass thickness (no
 * frame resolves a pane edge against anything of known size), and the pane's
 * bottom edge, which is hidden behind the base fitting in every frame — the
 * lowest thing that can actually be seen there is the lower clamp, so that is
 * what the pane is drawn down to.
 */
const BALUSTRADE_POST_SPACING = 0.9

export const BALUSTRADE = {
  /** m — top of the glass above the paving. [PHOTO] 1.03 ± 0.10; see above. */
  glassTop: 1.03,
  /**
   * m — bottom of the glass above the paving. [VIDEO] roof/010, and it is the
   * LOWER CLAMP's level rather than the pane's edge, which no frame shows. The
   * error is one clamp radius, downward, in the one place on the terrace where
   * nothing can be seen anyway.
   */
  glassBottom: 0.145,
  /** m — post above the paving. [PHOTO] 0.88, [VIDEO] roof/010 0.82; ±0.08. */
  postHeight: 0.88,
  /**
   * m — outside diameter of the post tube. [PHOTO] 80 px at 1238 px/m and
   * [VIDEO] roof/010 50 px at 723 px/m both give 0.065; rounded to 0.06.
   */
  postDiameter: 0.06,
  /**
   * m — from the post's axis to the glass. [PHOTO]: the clamp disc's centre
   * stands 80 px off the post's axis at 1238 px/m. This is what puts the panes
   * outboard of the posts, which is the way round every frame shows them.
   */
  clampReach: 0.065,
  /** m — diameter of a point-clamp disc. [PHOTO], read off the same bay. */
  clampDiameter: 0.07,
  /**
   * m — pane thickness. [ASSUMPTION]. Nothing in the corpus resolves it: the
   * green edge of a pane is a few pixels at an unknown distance in every frame
   * that shows one. 15 mm is a fabrication figure, not a reading, and it moves
   * nothing but where the pane's two faces sit relative to each other.
   */
  glassThickness: 0.015,
  /**
   * m — post to post along the parapet. [PHOTO] 0.88 ± 0.10 from the one bay in
   * view: 1105 px of lateral separation at that depth, plus a depth term that
   * needs an assumed focal length and contributes 0.01 m of the total. Rounded
   * to 0.9, which is what the count below is actually built from.
   */
  postSpacing: BALUSTRADE_POST_SPACING,
  /**
   * How many posts go round. DERIVED, not read: nothing in the corpus shows
   * enough of the circuit to count them. Spacing is what was measured, so the
   * count is what the circumference makes of it, and it is rounded to a whole
   * number of equal bays rather than left with a short one.
   */
  get postCount(): number {
    const r = this.glassRadius - this.clampReach
    return Math.max(8, Math.round((2 * Math.PI * r) / this.postSpacing))
  },
  /**
   * m — radius of the pane's mid-plane WHERE IT MEETS A POST, which is the only
   * radius a flat sheet in a round parapet has.
   *
   * The panes are flat and the parapet is not, so a pane spans the CHORD between
   * the two posts it is clamped to: its outer face touches the parapet's inner
   * face at both joints and stands one sagitta clear at mid-bay — 0.0137 m at
   * 52 bays, which is very nearly the thickness of the glass and is the reason
   * the balustrade reads as a fifty-two-sided figure rather than a circle. That
   * is what the fitting is. Reading this as the radius of a ring of glass was
   * fault (a) of 2026-08-16; see lib/roofTerrace.ts.
   */
  get glassRadius(): number {
    return DECK_OUTER_RADIUS - this.glassThickness / 2
  },
  /** m — radius of the post axes, one clamp's reach inboard of the glass. */
  get postRadius(): number {
    return this.glassRadius - this.clampReach
  },
}

/**
 * WHAT THE ROOF WAS, and what the model built until 2026-08-14. Kept because it
 * is the record of a defect that was described, argued and only then repaired.
 *
 * There was no `ROOF` block above because there was nothing sourced to put in
 * one. What the model built instead fell out of two other quantities: the deck was
 * TOP_OF_FLOORS, the top of the eighth storey's ceiling structure, and the
 * "parapet" was the whole remaining top of the wall — a ring 3.733 m thick and
 * PARAPET (0.751 m) high, from the room face at r 4.517 out to the drum face at
 * r 8.250. Nobody decided that. It was the residue of the vertical budget, and
 * the deck was drawn only as far as the room face because that is where
 * FloorStructures' annulus stopped.
 *
 * `reference-photos/views_from/Maiden towers top old city baku azerbaijan.jpg`
 * [PHOTO] did not look like that. It shows paving running out across the wall
 * thickness with people standing on it, and a low thin parapet along the outer
 * edge. If that is the building, the head of the roof stair stands UNDER the
 * paving (it is at r 4.71–5.73, inside the wall) and comes out through an
 * opening in the deck. In the model there was nothing over it but 0.751 m of the
 * ring, the passage needed 2.300, and the cutter took the ring away for about
 * 50° of arc — the stair's last steps open to the sky and a 0.190 m fin of
 * stone left standing where the deck edge and the passage cheek failed to meet.
 * That was visible from the terrace, and it was the whole of fault A.
 *
 * The breach did not begin abruptly either, and the run-up to it was its own
 * argument that that roof was wrong. From about azimuth 180 down to 163 the
 * passage's vault carried under 0.30 m of stone, thinning to 0.09 m — a lintel the
 * thickness of a book carrying the top of a tower. Nothing was done about that: it
 * was what the measured stack gave, and it was a consequence of a deck at 26.749
 * under a top at 27.500 rather than a modelling slip. It would go away by itself
 * if the paving crossed the wall.
 *
 * THE BREACH MOVED ON 2026-08-13 AND DID NOT CHANGE SIZE, which is worth one line
 * because it is the clearest demonstration that it belongs to the vertical stack
 * rather than to any bearing. When the stair turned a quarter of the drum on
 * [OWNER]'s testimony, the open-to-sky sector went from azimuth 13–63 to 110–160
 * — 16 of the roof climb's 36 sections before and after, to the section. The
 * consequence for anyone standing on the deck is that the trench is now on the
 * south-east side, over the pier rather than away from it, and the last 3.4° of
 * it (110.1–113.5) stands above the buttress head.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * 2026-08-14: THE SHAPE IS NOW KNOWN AND ONE NUMBER IS NOT. Read this before
 * the paragraphs above, which are the record of what was suspected.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * The owner's roof footage answers every SHAPE question above, and answers all
 * of them against the model. Frame numbers and the full reading are in
 * windows.json → footageReading.roof; in short:
 *
 *   THE PAVING CROSSES THE WHOLE WALL to a THIN parapet standing on the outer
 *   edge of the drum. roof/016 shows large flat slabs running up to the inner
 *   face of the parapet, the parapet three or four courses under one wide flat
 *   coping, and past the coping's outer edge nothing at all — the city, straight
 *   down. There is no second shelf of wall-top out there. So the [PHOTO] reading
 *   above was right and the residue-of-the-budget ring is wrong.
 *
 *   THE PARAPET IS NOT BREACHED BY THE STAIR. Two readings walked all 32 roof
 *   frames and found no break anywhere on the circuit; roof/007 and up/250 show
 *   it running on unbroken past the stair head.
 *
 *   THE STAIR ARRIVES AT DECK LEVEL THROUGH A DOOR. roof/007: a stainless
 *   threshold set flush IN the paving with the treads starting straight behind
 *   it. Over the stairwell stands a MODERN wedge of sawn ashlar raked to the
 *   pitch of the stair and capped by an inclined glazed light (up/250). An
 *   opening in the deck with a head-house over it — the first answer, not the
 *   second.
 *
 * SO FAULT A IS NOT A DOUBT ANY MORE, IT IS A KNOWN DEFECT. The 50° trench, the
 * last 1.55 m of the climb open to the sky, the 0.190 m fin and the book-thick
 * lintel from azimuth 180 to 163 were all consequences of a deck that stopped at
 * the room face, and the building does not do that. Note what the paragraph
 * above predicted before there was any footage: "it would go away by itself if
 * the paving crossed the wall". It did.
 *
 * THE MISSING NUMBER IS NO LONGER MISSING (2026-08-14, second pass). The
 * paragraph that stood here said the terrace could not be repaired for exactly
 * one reason: the parapet's thickness, which "no frame shows". That was wrong
 * about the frames. No frame shows the parapet's outer FACE, but several show
 * its top SURFACE between two arrises from 2 m away and 0.6 m above, and that is
 * a measurement — see PARAPET_THICKNESS, 0.75 with a 0.55…0.95 bracket, and
 * ROOF above, which carries deckOuterRadius = 7.50 m and a paved width of
 * 2.98 m from the room face out to the parapet.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * 2026-08-14, THIRD PASS: THE TERRACE IS BUILT AND FAULT A IS GONE.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * The paragraph that stood here said "what is left is build work, not evidence",
 * and listed it. That work is done, and every part of it followed from the deck
 * crossing the wall rather than from any new number:
 *
 *   · buildShellGeometry() subtracts a TERRACE VOID — a cylinder of
 *     ROOF.deckOuterRadius standing on ROOF.masonryTopY — so the top of the wall
 *     inboard of the parapet is taken away and what is left round the rim is a
 *     ring 0.75 m thick and 0.751 m high. That ring is now the parapet;
 *   · the paving is a course of stone laid on the cut, ROOF.pavingDepth deep,
 *     from the axis out past the parapet's inner face, drawn in RoofTerrace;
 *   · the stair passage is clamped to ROOF.masonryTopY, not to TOWER.topY. The
 *     cutter therefore stops under the paving instead of running up through the
 *     parapet ring, and the parapet is not touched anywhere on the circuit —
 *     which is what roof/007 and up/250 show;
 *   · where the passage runs out of stone the PAVING is opened instead, by the
 *     same stairwell cut every storey slab takes, so the stair comes out through
 *     a hole in the deck. That is roof/007's threshold, set flush in the paving.
 *
 * The three faults went with it and none of them was patched separately: there
 * is no trench, because there is no ring to trench; no 0.190 m fin, because the
 * deck edge and the passage cheek no longer have to meet; and the book-thick
 * lintel is the paving course itself, which is what a lintel there ought to be.
 * Nothing moved: the deck, the parapet, the headroom and the top of the tower are
 * the same four numbers they were.
 *
 * THE HEAD-HOUSE IS BUILT (2026-08-20) and this paragraph is what it used to
 * say: "STILL UNBUILT, and it is the only thing on the terrace that is". It was
 * right that the wedge needed no measurement that was not already here — its
 * plan is the deck opening and its rake is PLAYER.stairHeadroom — and it was
 * right that this was scope rather than evidence. Two small things did have to be
 * read off the frames after all, the lantern's frame and the threshold profile,
 * and both are measured against the well's own width; see STAIRHEAD below and
 * lib/stairhead.ts. The way out of the stair is a door under a glazed light now
 * rather than an open hole in the paving.
 *
 * STILL UNKNOWN, as opposed to merely unbuilt: the coping's own profile (whether
 * the capping slab overhangs the rubble below it, which is the most likely
 * reading of the 2009 photograph's narrower 0.57 m); and where in plan the stair
 * head stands relative to the beak.
 *
 * Printed to the dev console on every load, with the passage-opening conflicts
 * and for the same reason: a question nobody is looking at is not open, it is
 * lost.
 */
export const ROOF_QUESTION = [
  'ROOF — the terrace is DESCRIBED and now BUILT. Nothing here is a question for',
  'you; it is the standing note on what the deck is made of and what is missing.',
  '',
  'MEASURED, 2026-08-14, off your own roof footage — no question was needed:',
  '  · parapet HEIGHT   0.75 ± 0.06 m  [VIDEO] — the focal-free 0.556 ratio;',
  '  · parapet THICKNESS 0.75 m, bracket 0.55…0.95  [VIDEO] — the coping top read',
  '    between its two arrises in roof/011 and roof/012 and back-projected onto the',
  '    plane 0.6 m under the lens. Dominant term is the horizon, not the lens.',
  '  · so the paving runs from the storey-8 room face (r 4.52) out to r 7.50, a',
  '    walkable 2.98 m, and the parapet is the 0.75 m ring outside that.',
  '',
  'WHAT THE FOOTAGE ANSWERED, and what the model now builds because of it:',
  '  · the paving reaches the OUTER edge of the wall — roof/016, roof/001, up/230;',
  '  · the parapet is thin, on the outer edge, 3–4 courses under one flat coping —',
  '    roof/016, roof/011, roof/012;',
  '  · it is NOT broken where the stair comes out — roof/007, up/250, and no break',
  '    anywhere in 32 roof frames. The passage cutter is clamped to the underside',
  '    of the paving, so it can no longer reach the ring;',
  '  · the stair comes up through an OPENING IN THE PAVING at deck level, cut by',
  '    the same rule that opens every storey slab — roof/007, up/250.',
  '',
  'The old 50° breach is gone, and nothing was moved to close it: the deck, the',
  'parapet, the headroom and the top of the tower are the four numbers they were.',
  '',
  'THE BALUSTRADE is built too, from the parapet used as a ruler in your frames',
  'and in reference-photos/views_from/"Baku view from Maiden Tower.JPG": posts',
  '0.88 m on the paving at 0.9 m centres, glass to 1.03 m on point clamps. Every',
  'one of those is a ratio against the 0.751 m parapet, so they all carry its',
  '±0.06. If you can measure a post, that is the number to send.',
  '',
  'THE HEAD-HOUSE IS BUILT (2026-08-20) — the raked ashlar wedge with the glazed',
  'light (up/241, up/242, up/250, roof/007, roof/008). Plan = the deck opening,',
  'rake = the chord from PLAYER.stairHeadroom at the way out down to the paving.',
  'ONE NUMBER IN IT IS WORTH ARGUING WITH: the apex. Built at 2.30 m because that',
  'is the clear height the stair keeps everywhere else; your frames measure it at',
  '2.1 ± 0.2 m against the man in up/242 and against six 0.35 m courses. If you',
  'can put a tape on the wedge at the door, that is the number to send.',
  '',
  'STILL UNBUILT there, and both on purpose: the barred glass gate across the way',
  'out (operable, and drawn shut it walls the stair up — roof/007, up/240), and',
  'the metal capping on the ashlar arris (no frame sizes its section).',
  '',
  'STILL UNMEASURED: the coping slab’s own profile and overhang; where in plan the',
  'stair head stands relative to the beak; the glass thickness.',
] as const

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

/**
 * m — THE TRACE'S OWN SCATTER, and the only error bar anybody ever wrote down
 * about the beak.
 *
 * It is not a new measurement. The paragraph above has said since the footprint
 * was fitted that "14 drum nodes agree to ±0.03 m", and that sentence was doing
 * nothing: it sat in a comment while every number derived from the same trace
 * was used to four significant figures. Naming it makes it available to the
 * arithmetic that needs it — see edgeToleranceDeg — and it introduces nothing,
 * which is the whole point. Rule 1 is not only about inventing dimensions; a
 * tolerance invented to make a doubt come out the right size is the same fault.
 */
const OSM_NODE_SCATTER = 0.03

export const BUTTRESS = {
  azimuthDeg: 106.7, // [OSM] centre→tip-midpoint bearing; [ref] prose says ~90° — see note above
  projection: 10.7, // m beyond the outer wall — [OSM] (tip at r 19.01, drum r 8.34)
  tipWidth: 3.0, // m across the nose — [OSM] (was a 9.0 m invention before measuring)
  rootArcDeg: 40.8, // ° of drum circumference the buttress springs from — [OSM] 72.7°→113.5°
  skewDeg: 13.6, // ° the tip axis leans off the root-arc midpoint — [OSM]; this is the asymmetry seen in photos
  /**
   * ° — HOW FINELY THE TRACED EDGES CAN BE READ AT ALL. 0.03 m of node scatter
   * standing on a drum of radius 8.25 is 0.208° of azimuth, and no bearing taken
   * off this footprint means anything below that.
   *
   * WHY IT HAD TO BECOME A NUMBER. The beak's daylight edge comes out at
   * azimuth 113.5 (= azimuthDeg − skewDeg + rootArcDeg/2) and the model was
   * cutting an opening at 113.629 BECAUSE of the 0.129° between them — 19 mm on
   * the face of the drum, against a trace whose own best-constrained nodes
   * wander 30 mm. Whether that window existed was therefore decided by the
   * fourth significant figure of a satellite tracing rather than by the
   * building, and nothing in the code knew it: 113.5 was carried like a survey.
   * A datum with no tolerance beside it will always be read to the last digit
   * somebody typed.
   *
   * IT IS A FLOOR AND NOT THE ERROR, and reading it as the error would be the
   * next version of the same mistake. 0.03 m is what FOURTEEN drum nodes agree
   * to. The beak is described by TWO — src/data/windows.json →
   * pointedWindowBearing calls the edge's 6.8° offset from the axis "the softest
   * term in the chain" and prices the systematic that rides on it in whole
   * degrees. So a bearing that clears this tolerance is not thereby safe; it is
   * only not obviously unsafe. What would replace it is a survey, or the
   * İçərişəhər plans (docs/maiden-tower-reference.md → «Чего нет в открытом
   * доступе»), and either would make this constant redundant, which is the best
   * thing that could happen to it.
   */
  edgeToleranceDeg: (OSM_NODE_SCATTER / OUTER_RADIUS) * (180 / Math.PI),
  /** m of node scatter the tolerance above is the angle of. [OSM], see the note. */
  traceScatter: OSM_NODE_SCATTER,
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
/** m — the doorway's CLEAR WIDTH. [İçərişəhər]/az.Wikipedia, sourced. */
const ENTRANCE_WIDTH = 1.1

/**
 * The entrance opening's height above its threshold, in units of that clear
 * width. [VIDEO] 1.85, bracket 1.80…1.92.
 *
 * THIS REPLACES A [PLACEHOLDER] 2.0 THAT NOBODY HAD EVER MEASURED. It was the
 * front door of the building — the first opening a visitor walks through — and
 * its height was the one dimension in this block invented outright, standing
 * beside a width and a sill height that are both cited. Two archives that show
 * the door had never been read for it: the descent leaves the building through
 * it (down/205–208), and reference-photos/exterior/ has 208 frames of the west
 * face. The method is 827c26c's, applied where it works best.
 *
 * WHY A RATIO AND NOT A LENGTH, again. Nothing in the corpus gives a scale at
 * the entrance. But the width IS sourced, so a ratio of two image lengths in one
 * plane converts straight to metres, and for a plane square to the camera the
 * focal length and the principal point cancel exactly.
 *
 * THE FRAME. down/206, taken inside the entrance passage looking out along its
 * axis, with the whole opening — crown, both jambs and the threshold — in one
 * view. Read by brightness profile across each row, nine-pixel boxcar, the edge
 * taken at the half-height of the step rather than by eye:
 *
 *   the daylight aperture is bounded by the OUTER mouth of the doorway (looking
 *   through a tunnel, the far mouth is the one that subtends less), and the dark
 *   ring outside it is the reveal, not a frame. Proof that it is the reveal: two
 *   seconds later, in down/207, the walker is nearer and the ring has grown from
 *   22% of the aperture to 39%. A flat lining would hold its proportion; a depth
 *   cannot.
 *
 *   OUTER mouth: circle fit to the arch over 178 edge points, centre
 *   (521.04, 892.06), r 189.16 px, residual rms 2.55 px. Straight-jamb width
 *   over rows 930…1000: 377.88 px. Threshold: a metal strip whose top edge fits
 *   a line to 0.29 px of scatter across 330 px of the opening, at y 1386.6, its
 *   near edge at 1402.3 — 8 cm of floor, and the door's own closing plane is
 *   inside it.
 *   crown→threshold / width = 691.5/377.9 = 1.830.
 *
 *   INNER mouth (the passage-side arris, the outer edge of that dark ring):
 *   centre (520.40, 912.23), r 235.13 px, rms 2.04, jamb width 467.67 px. It is
 *   the same opening 1.24× nearer.
 *
 * THE HEAD IS A TRUE SEMICIRCLE ON THE OPENING'S OWN WIDTH, which is the thing
 * archTunnel() has always ASSUMED and which nothing had ever checked. At the
 * outer mouth 2r = 378.33 px against a jamb width of 377.88 — 0.12%. At the
 * inner mouth 470.27 against 467.67 — 0.6%. So the springing sits exactly at the
 * top of the jambs and the rise is exactly half the span, at both faces, and
 * lib/towerShell.ts's rule is a measurement at this door rather than a habit.
 * The springing itself stands 1.33 clear-widths (1.46 m) above the threshold.
 *
 * THE CORRECTION, AND IT IS THE BIGGEST TERM. The camera is not square to the
 * opening: the vanishing point of the passage axis — recovered from the two arch
 * fits, since the two mouths are scaled copies of each other about it — sits at
 * (523.7, 809.0), which is 101 px above the frame's centre. Sideways that is
 * 0.6° and worth nothing; vertically it is 4.4°…6.4° of downward pitch, for a
 * focal length of 900…2000 px. Rectifying the measured points through that
 * rotation lifts the ratio from 1.830 to 1.843…1.897, the correction being
 * larger the wider the lens.
 *
 * The phone's own field would put f near 1210 px on a 1820 px frame (the still
 * calibration under OCULUS_RADIUS_DEFAULT gives f/long-axis = 0.6645), which
 * asks for 1.87. But the semicircle above argues the pitch term is smaller than
 * that: a true semicircle seen at 5° of pitch should read 2r − jamb width ≈
 * +3.2 px and it reads +0.45. So the honest value is between the raw reading and
 * the fully corrected one, and the bracket is the two ends of that plus the 8 cm
 * threshold strip (±0.021 either way).
 *
 * ONE CORROBORATION THAT COSTS NOTHING, and it is about the WIDTH rather than
 * the height. The same solution puts the camera 1.73…1.79 m above the threshold
 * — a phone at eye height for the 1.85 m man [OWNER] who filmed it. Had the
 * sourced 1.1 m been the masonry opening outside some lining rather than the
 * clear opening, the width would be 1.34 m and the same arithmetic would have
 * him holding the phone at 2.1 m. It does not, so the 1.1 m is the hole he
 * walked through, which is the hole this model cuts.
 *
 * WHAT IS NOT SETTLED: lens distortion, which is not modelled at all here and
 * which the rectification cannot separate from the pitch. WHAT WOULD SETTLE IT,
 * in one observation: a photograph taken from outside, square to the west face,
 * with the lens at the height of the opening's own middle and the whole opening
 * plus its threshold in frame. That kills the pitch term outright and leaves a
 * ratio of two spans in one fronto-parallel plane. A tape on the threshold-to-
 * crown would of course end the argument entirely.
 */
const ENTRANCE_HEIGHT_RATIO = 1.85
/** The bracket the ratio sits in. [VIDEO] — see the note above. */
const ENTRANCE_HEIGHT_RATIO_BRACKET = [1.8, 1.92] as const

export const ENTRANCE = {
  azimuthDeg: 270, // west — [İçərişəhər]/az.Wikipedia, corroborated photographically; NOT [ref]'s 135°
  width: ENTRANCE_WIDTH, // m — [İçərişəhər] doorway width (sourced)
  /**
   * m — crown above the threshold. [VIDEO], measured off down/206 as a ratio of
   * the sourced width; see ENTRANCE_HEIGHT_RATIO for the whole reading. NOT a
   * number to be typed in: it is a measurement times a source, and the test in
   * src/lib/entranceOpening.test.ts holds it to that.
   */
  height: ENTRANCE_WIDTH * ENTRANCE_HEIGHT_RATIO,
  /** Height in units of the clear width — the thing that was measured. [VIDEO] */
  heightRatio: ENTRANCE_HEIGHT_RATIO,
  /** The bracket that ratio was read within. [VIDEO] */
  heightRatioBracket: ENTRANCE_HEIGHT_RATIO_BRACKET,
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

/**
 * ° from the buttress, clockwise, to the foot of every flight. [OWNER] 2026-08-13.
 *
 * THIS VALUE IS NOW KNOWN TO BE TOO SMALL BY AT LEAST 8°, AND IT IS STILL 90.
 * Read the whole of the next section before touching it; the reason it has not
 * been moved is not inertia and not doubt about the finding.
 *
 * HIS WORD IS "RIGHT", NOT NINETY. Asked where the entrance to the stair is when
 * you look down on the tower from above, he put it to the RIGHT of the beak —
 * clockwise from it — "about a quarter of the circumference". A quarter is 90°,
 * and 90 is written here because it is the arithmetic of the sentence, not
 * because anybody stood in the tower with a compass. Read the ± with it: a
 * quarter of a circle said by eye is worth perhaps ±15°, and the whole of the
 * layout below moves with it.
 *
 * It is a SEPARATE FACT from the bearing it is added to. BUTTRESS.azimuthDeg is
 * [OSM], traced off a footprint and the one solid bearing in the model; this is
 * testimony about where the stair stands relative to it. Keeping them apart is
 * the point of the constant: correct the traced bearing and the stair follows,
 * correct the quarter turn and the buttress does not move.
 *
 * ————————————————————————————————————————————————————————————————————————
 * REFUTED, 2026-08-14, BY HIS OWN FOOTAGE. See STAIR_BEARING_QUESTION below.
 *
 * The model puts head-3-4 — the landing at the top of the climb from storey 3 to
 * storey 4 — at azimuth 105.5, one degree counterclockwise of the beak's own
 * axis, facing 10.64 m of solid pier, and withholds the opening as blind. The
 * footage shows a two-centred pointed WINDOW at exactly that landing, standing
 * open, looking down on a multi-lane road with moving traffic, a car park and
 * people on the paving: up/097–098 climbing, down/137–139 descending. A window
 * cannot be blind and see a car park. One of the model's assumptions is wrong.
 *
 * IT IS THIS ONE, and the other three candidates are excluded, not preferred
 * against:
 *
 *   the buttress bearing — CANNOT BE IT, and this is arithmetic rather than
 *     judgement. STAIR.startAzimuthDeg is defined as BUTTRESS.azimuthDeg + this
 *     constant, so turning the buttress turns the stair with it and every
 *     opening keeps its bearing RELATIVE to the pier. No value of
 *     BUTTRESS.azimuthDeg brings this window into daylight. (Task One's roof
 *     panorama also declined to refute 106.7, but that is the weaker argument
 *     and it is not the one relied on here.)
 *
 *   the window being in a STOREY wall rather than a passage — EXCLUDED BY THE
 *     DESCENT. down/135 is the arched doorway out of the storey-4 chamber,
 *     down/136 is inside the passage, down/137–139 is the window, down/140 is
 *     the first step down the flight. The window stands between the chamber door
 *     and the top tread: it is the head of the passage, which is where this model
 *     puts head-3-4, and it agrees with [OWNER] 2026-08-10 that the chambers
 *     carry no openings. This retires the caveat windows.json has carried since
 *     the head shapes were read ("two readings could not tell which side of the
 *     doorway it is on").
 *
 *   the stacking — all six flights at one bearing, [OWNER] 2026-08-09 — NOT
 *     TOUCHED BY THIS EVIDENCE. Moving one flight and not the others would need
 *     a per-flight bearing, which no source gives and which his instruction
 *     denies. It stays the open question it was; see windows.json →
 *     placeInTheWall, which now carries a second, independent arrival at the
 *     same disagreement.
 *
 * HOW FAR OUT, from three independent handles:
 *   · ≥ 8.01° clockwise — the model's own arithmetic, rotationToDaylightDeg() in
 *     lib/passageOpenings.ts: the smallest turn that brings head-3-4 out from
 *     behind the pier. ≥ 11.09° to bring head-2-3 out with it, which is the
 *     smallest rigid turn that leaves NO end blind.
 *   · +15.1° ± 4 — measured. reference-photos/exterior/«2022-ci ildəki Qız
 *     Qalası şəkli.jpg» is taken from the avenue and shows the drum's left
 *     silhouette, the top rim and the drum↔buttress junction together. The
 *     junction is a MERIDIAN at a fixed azimuth ([OSM] root arc, clockwise edge
 *     113.5), so measuring the window against it cancels the camera bearing and
 *     yields a bearing RELATIVE TO THE BEAK, which is the quantity this constant
 *     is. The one arched opening on the drum — every other is a 0.2 m slit —
 *     lands at beak +13.9° and at height 11.48 m against this model's 11.593 m
 *     for head-3-4, an agreement of 0.11 m that identifies it beyond argument
 *     and says the lift table and the flight arithmetic are right. Only the
 *     bearing is wrong. Cross-check the construction did not have to pass: the
 *     camera bearing it implies is 137.5°, and [OSM] puts the nearest point of
 *     Neftçilər prospekti at 137.4°.
 *   · the SENSE is confirmed. rotationToDaylightDeg also offers −32.79°, i.e. a
 *     counterclockwise reading of his "right", which would put the window at beak
 *     −34. The photograph puts it at beak +13.9. The counterclockwise branch —
 *     the layout this value replaced — is dead, and that is worth having.
 *
 * WHAT IT COSTS IN DAYLIGHT: NOTHING, AND IT USED TO COST TWO WHOLE ROOMS.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * WITHDRAWN 2026-08-17. The two rooms were a sign error, not a pier.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * The claim was: head-2-3 and head-3-4 are the two ends this value buries in the
 * pier, and they are THE ONLY openings that serve storeys 3 and 4, because a
 * doorway and a slit line up only at a flight's HEAD — at a foot the doorway
 * stood half a flight-width up the climb from the first tread while the slit
 * stood on the landing behind it, 13.5–16.4° away. The first clause is still
 * true. The second was an artefact of approachAzimuthDeg() sending the shift
 * along the climb at a foot, which it stopped doing on 2026-08-17. The feet
 * below those two heads serve the same two rooms and stand nowhere near the
 * beak.
 *
 * So the census is seven of eight at this value AND at 90 + 11.09, and seven at
 * twenty-two of the twenty-four bearings a whole revolution passes through. What
 * the turn buys is a second band in two rooms that already have one.
 *
 * THAT WAS NEVER AN ARGUMENT FOR TURNING IT and is now not even a temptation.
 * The count used to be 4 at +0, 6 at +11.09, 5 at +45 where the head of 4→6
 * swings into the pier in its turn, 6 again at +90 — not monotonic, no brightest
 * bearing to tune toward. It is 7 at all four. Had there been a maximum,
 * choosing it would be rule 7 wearing a friendlier face than a solstice.
 *
 * IT IS ALL STILL MEASURED, and that is what caught the sign. The census exists
 * because for a long time the model shipped a tower whose middle four storeys had
 * no view out and nothing in it said so. lib/chamberDaylight.ts measures it,
 * chamberDaylight.test.ts asserts the count, and when the doorways moved the
 * count moved audibly with them — which is how a retired finding gets retired
 * rather than quietly rotting.
 *
 * WHY IT IS STILL 90. Because the evidence settles the DIRECTION and a FLOOR and
 * does not settle the VALUE, and this number turns every azimuth in the project.
 * +15.1 comes from one photograph; the same photograph's other openings do not
 * admit any single rigid rotation (see windows.json → placeInTheWall), so
 * shipping 105.1 would repair one opening while silently asserting five more.
 * And it would overwrite testimony with photogrammetry, which is the exact move
 * [OWNER] ruled out on 2026-08-09. One sentence from him closes it; until then
 * the model carries the contradiction in the open, where testimonyConflicts()
 * prints it on every load.
 */
const STAIR_FROM_BUTTRESS_DEG = 90

/**
 * The one question that would settle where the stair stands in the wall.
 *
 * Printed to the dev console on every load, beside ROOF_QUESTION and the
 * passage-opening conflicts, and for the same reason: a question nobody is
 * looking at is not open, it is lost. Unlike ROOF_QUESTION this one really is a
 * question — the footage measures the disagreement but cannot choose the value,
 * and the value moves every azimuth in the project.
 */
export const STAIR_BEARING_QUESTION = [
  'THE STAIR IS TURNED TOO FAR ANTICLOCKWISE AND YOUR OWN FOOTAGE PROVES IT.',
  '',
  'The model puts the top landing of the climb 3→4 at azimuth 105.5 — one degree',
  'off the beak’s own axis — facing 10.64 m of solid pier, and refuses to cut an',
  'opening there. up/097–098 and down/137–139 show you standing at that landing at',
  'a two-centred pointed window, casement open, looking down on the avenue, a car',
  'park and people on the paving. Both cannot be true.',
  '',
  'WHAT THAT DOES NOT MEAN, so nobody re-opens it:',
  '  · it is NOT the buttress bearing. STAIR.startAzimuthDeg is BUTTRESS.azimuthDeg',
  '    plus a constant, so turning the beak turns the stair with it and the window',
  '    keeps its bearing relative to the pier. No value of 106.7 clears it.',
  '  · it is NOT a window on the storey. down/135 is the chamber door, down/140 is',
  '    the first tread down; the window is between them, in the passage.',
  '',
  'WHAT IS MEASURED:',
  '  · at least +8.0° clockwise to bring that landing into daylight, +11.1° to',
  '    bring the landing above storey 2 out with it — the model’s own arithmetic,',
  '    rotationToDaylightDeg();',
  '  · +15.1° ± 4 from the 2022 photograph off the avenue, which puts the arched',
  '    window at beak +13.9° and at height 11.48 m against the model’s 11.593 m.',
  '    The height agreeing to 0.11 m is what identifies it: the flight arithmetic',
  '    is right and only the bearing is wrong.',
  '  · the sense of your "to the right of the beak" is CONFIRMED by the same',
  '    photograph. The anticlockwise reading is dead.',
  '',
  'AND WHAT IT COSTS IN DAYLIGHT: NOTHING, AND THIS LINE USED TO SAY TWO ROOMS.',
  'The claim was that the two blind ends above are the only openings serving',
  'storeys 3 and 4. On 2026-08-17 that turned out to be a sign in',
  'approachAzimuthDeg() rather than the pier: the FEET of the same flights light',
  'the same two rooms and stand nowhere near the beak. Swept ray by ray at eye',
  'height, seven chambers of eight see the sky at 90 and seven at +11.09; only',
  'storey 5 is dark, and no turn reaches it. The turn buys two rooms a SECOND',
  'band of light, not their first.',
  '',
  'NOTHING HAS BEEN TURNED. STAIR_FROM_BUTTRESS_DEG is still the 90 of your',
  '"about a quarter", because +15.1 is one photograph and this number moves every',
  'azimuth in the project — and because turning the stair until a photograph comes',
  'true is what rule 7 forbids.',
  '',
  'ONE SENTENCE CLOSES IT. Standing at that pointed window and looking straight',
  'out of it, is the beak below you to your LEFT, and roughly how far round —',
  'a hand’s width, or a quarter of the way round the tower? If it is a little to',
  'the left, STAIR_FROM_BUTTRESS_DEG becomes about 105 and eleven openings move',
  'with it. If the beak is directly below the window, the model is right and the',
  'photograph is being read wrong.',
] as const

export const STAIR: {
  winding: Winding
  riserTarget: number
  goingTarget: number
  width: number
  wallClearance: number
  startAzimuthDeg: number
  doorwayWidth: number
  doorwayHeight: number
  landingLength: number
  endLandingLength: number
} = {
  /**
   * Axis on the CLIMBER'S LEFT, so the helix runs counterclockwise seen from
   * above. Unchanged since 2026-08-06; what changed on 2026-08-14 is what it
   * rests on.
   *
   * IT USED TO REST on two historic interior stills that contradicted each
   * other, which is why src/lib/staircase.ts called the question UNRESOLVED. It
   * now rests on the owner's own walkthrough footage, read four times
   * independently: three of the readings resolve the tread wedge and all three
   * put the narrow ends on the climber's left — up/059, up/060, up/093, up/112,
   * up/117, up/119, up/152 on the climb, and down/173 on the descent, where left
   * and right reverse and the reader reversed them. The stainless handrail is on
   * the climber's right on every stone flight, which is the WIDE side of a
   * winder because the narrow side has nothing to stand on; up/119 shows a man
   * climbing with his right hand on it, walking the wide half of the treads. Not
   * one frame in 492 reads the other way.
   *
   * NOT CALLED SETTLED, and the honest reason is the size of the effect. Across
   * a 0.9 m flight at a mid-radius of 4–5 m the taper is a few per cent, read
   * off treads dished hollow by wear, in handheld wide-angle frames with no
   * scale — a camera off the passage's axis can fake that in either direction.
   * The fourth reading looked only at the last climb to the roof and measured
   * equal treads at both walls, which is not a counter-reading: that flight is
   * straight and has no wedge (windows.json → footageReading.straightRoofFlight).
   * Three readings leaning one way and none the other is strong evidence, not a
   * measurement, so the question stays in the queue — demoted, and with the
   * frames named so nobody starts again from the two stills.
   *
   * IT STILL MIRRORS THE WHOLE FAÇADE. Flipping it moves every exterior slit
   * onto the other side of the drum; the switch is live in the leva panel. And
   * the tempting shortcut is still forbidden: an exterior frame could in
   * principle settle the winding by asking which sense puts the slits where they
   * are seen, but doing that fits an unresolved value to bearings this project
   * calls ±20° systematic, on top of a start azimuth that is testimony given by
   * eye. Two unknowns, one observation.
   *
   * QUESTION FOR THE OWNER, still open: climbing a passage in the wall, is the
   * tower's axis on your left or on your right?
   */
  winding: 'counterclockwise',
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
   * ° — where every flight begins. [OWNER] 2026-08-13, resolved against [OSM].
   *
   * NO LONGER A [PLACEHOLDER], AND NOT A MEASUREMENT EITHER. It is one sentence
   * of testimony added to one traced bearing, and it is written as that sum
   * rather than as a literal so that the two halves can be corrected separately.
   *
   * WHAT HE SAID. Asked, looking down on the tower from above, where the entrance
   * to the stair stands relative to the beak, he answered: to the RIGHT of it —
   * clockwise — about a quarter of the circumference. BUTTRESS.azimuthDeg is
   * 106.7 [OSM], so a quarter turn clockwise is 196.7. He has walked the building
   * and could not measure it; the quarter is his eye, not a survey.
   *
   * THE FLIGHT'S FIRST TREAD IS NOT THE DOORWAY, and the difference is worth
   * stating before anyone checks the arithmetic against his sentence. This angle
   * places the first RISER; the landing at the foot runs back from it by
   * endLandingLength and the doorway sits at the ramp's own bearing, so the foot
   * landings come out centred at 205.4–206.9 and the foot doorways at 190.6–191.5.
   * Between the first tread and the door onto it is some 6–16° of arc, which is
   * inside the error of "about a quarter" by a wide margin and is not corrected
   * for. Solving the start angle backwards so that some chosen part of the foot
   * landed exactly on 196.7 would be fitting a testimony to three decimal places
   * it does not have.
   *
   * READ THE HISTORY, BECAUSE THIS VALUE HAS BEEN AROUND THE HOUSES AND THE
   * UNCOMFORTABLE PART IS THE PART THAT MATTERS.
   *
   * It was 200 for a long time, and earlier in this same session it was moved to
   * 100 — on the ground that from 200 the flights swept straight through the
   * columns of slits read off the exterior photographs, and that between an
   * unsourced stair azimuth and a photographed window bearing the unsourced one
   * should move. Walked, that was not a near miss: the climb stopped dead at
   * azimuth 153 on 2→3 and at 131 on 4→6 against the stepped embrasures.
   *
   * The owner's answer says the stair was RIGHT THE FIRST TIME and the slits were
   * in the wrong place. That is not special pleading, because the premise of the
   * 100 argument has since been withdrawn by the same witness: on 2026-08-10 he
   * said the storeys carry no openings at all and that every slit is the end of a
   * stair passage, and the model was rebuilt on it. The photographed columns are
   * therefore a CONSEQUENCE of where the stair runs, not an independent constraint
   * on it, and the collision the 100 move was made to avoid cannot arise — there
   * is nothing left in the wall for the stair to run through. What moved the value
   * to 100 was real evidence honestly applied to a model that no longer exists.
   *
   * 196.7 IS NOT 200 RESTORED. It is 3.3° away from it and it arrives from a
   * different direction entirely — from a bearing he gave, tied to the one solid
   * measurement in the project, rather than from the round number a spec once
   * suggested. That it lands so near the old value is a coincidence worth
   * noticing and worth not leaning on.
   *
   * WHAT IT COSTS AND BUYS, measured on the built model rather than argued —
   * see the re-derivation in src/data/windows.json:
   *   - all SIX flight feet now stand clear of the pier (they were five-of-six
   *     blind in 10.21–10.55 m of it) and carry openings;
   *   - two heads go the other way: head-2-3 at azimuth 102.4 and head-3-4 at
   *     105.5 now look into 9.88 m and 10.64 m of buttress and are withheld —
   *     AND ONE OF THE TWO IS NOW KNOWN TO BE A WINDOW WITH A VIEW. That is the
   *     refutation written up at STAIR_FROM_BUTTRESS_DEG above; it says this
   *     value is too small by at least 8°, and by about 15° if the one exterior
   *     photograph that can measure it is right. The cost line is left standing
   *     because the cost was correctly foreseen here and paid anyway;
   *   - nine ends are cut where six were. The owner also said there are TOO FEW
   *     openings, and this is the cause; nine against the eight the photographs
   *     count is the first time the model has overshot rather than undershot.
   *   - three passages come out open at BOTH ends and three at one end only,
   *     which is the shape of his 2026-08-10 sentence and something no setting of
   *     the old value could produce. That is a corroboration and NOT a reason:
   *     the angle was set from his answer about the beak, before this was known,
   *     and it must never be tuned to keep it true.
   *
   * ON A KNIFE EDGE, and it must be said in the same breath: head-6-7 comes out
   * at azimuth 113.6292 against a pier whose daylight edge is at 113.5000. It is
   * open by 0.1292° — 18.6 mm on the drum face. Nothing about that opening is
   * decided by evidence; it is decided by the fourth significant figure of an OSM
   * trace. head-7-8 at 116.0 clears by 2.5°, which is barely better.
   *
   * TWO CORRECTIONS TO THAT PARAGRAPH, 2026-08-15, and the second is the larger.
   *
   * The 14 mm it used to give was arithmetic, and wrong: 0.1292° × π/180 × 8.25 m
   * is 0.0186 m. The old figure was the arc of the ROUNDED 0.1°, not of the
   * clearance, and it had been quoted back in four files. It made the margin sound
   * thinner than it is, so nothing was decided on the error — but a wrong number
   * defending a right conclusion is still a wrong number.
   *
   * And "nothing about that opening is decided by evidence" was left standing as a
   * remark, which is exactly the failure it describes: the model went on cutting
   * the window and shipping the doubt as a comment. The trace states its own
   * scatter — ±0.03 m over fourteen drum nodes, which is ±0.208° or ±30 mm at this
   * radius — so the 18.6 mm is 0.62 of the noise, and that comparison is now
   * arithmetic the model performs rather than prose. BUTTRESS.edgeToleranceDeg
   * carries the tolerance; lib/passageOpenings.ts → pierEdgeReading() decides what
   * to do about an opening inside it (cut it, and stop calling it a fact) and
   * argues why the other two answers are worse; and the viewer is told, because a
   * visitor in that passage is looking at the window and reads no comments.
   *
   * WHAT WOULD CHANGE IT:
   *   - the owner correcting "a quarter" to a third or a sixth: change
   *     STAIR_FROM_BUTTRESS_DEG, not this line;
   *   - a survey correcting the buttress bearing off 106.7: change BUTTRESS and
   *     the stair follows by itself, which is the whole reason this is a sum;
   *   - him saying which side he was facing. "Looking down on the tower" fixes the
   *     sense of "right" only if the viewer is above it looking down, which is how
   *     the question was put; asked from the ground the same word means the
   *     opposite turn, and 106.7 − 90 = 16.7 is the layout this replaced.
   *
   * A CHEAP CROSS-CHECK NOBODY HAS RUN. With the entrance at 270 [İçərişəhər] and
   * the foot doorways at about 191, a person standing in a chamber and facing the
   * entrance has the doorway onto the stair some 79° round to their LEFT, just
   * behind the shoulder. That is a prediction of this value, answerable in one
   * word, and it is a different question from the one he has just answered.
   */
  startAzimuthDeg: BUTTRESS.azimuthDeg + STAIR_FROM_BUTTRESS_DEG,
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
   *
   * ═════════════════════════════════════════════════════════════════════════
   * AND THE FOOTAGE SAYS 0.889, WHICH IS A CONFLICT AND NOT A ROUNDING.
   * 2026-08-17.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * DOORWAY_SPRINGING_RATIO measures the springing at 2.53 doorway-widths above
   * the floor. The springing is 2.25 m — sourced crown less an estimated rise —
   * so the opening the footage shows is 0.889 m wide, which is the flight's own
   * width to a centimetre. Run the other way, 1.1 m demands a springing at
   * 2.783 m and therefore a crown above it, against [İçərişəhər]'s SOURCED
   * 2.5 m. The two cannot both stand.
   *
   * IT IS NOT MOVED, AND THE REASON IS NOT COST. It is that the measurement has
   * exactly one systematic and it runs the right way to explain the whole gap:
   * obliquity foreshortens a width and never a height, so a wall seen 33–37° off
   * square reads 1.1 m as 0.89. up/165 shows the left cheek's reveal in shadow
   * across a third of the opening, which is what an oblique view of a tunnel
   * through a 3.7 m wall looks like. I cannot recover that angle from the frame
   * and I will not assume it in either direction.
   *
   * WHAT WOULD SETTLE IT, exactly: one tape across any stair doorway, jamb to
   * jamb. It is the same single measurement CUPOLA_RISE is waiting on — either a
   * width or a height closes the whole section, because everything else in it is
   * sourced or is a ratio. Until then the model cuts 1.1 m, which is the SOURCED
   * main entrance and the least invented figure available, and chamberSection
   * .test.ts states the disagreement in metres so it cannot go quiet.
   */
  doorwayWidth: 1.1,
  /**
   * m — clear height of the opening, floor to head. [DERIVED] 1.688.
   *
   * IT USED TO BE `PLAYER.height + 0.35`, AND THAT IS THE FAULT THIS FILE HAS
   * JUST BEEN CORRECTED FOR. Not a dimension of the building at all: the
   * avatar's capsule plus a third of a metre, written at five call sites, sizing
   * a hole in a 12th-century wall from the thing that walks through it. It came
   * out 2.100 m in a wall whose vault sprang at 1.600, so the model was cutting
   * an opening half a metre taller than the masonry it was cut in — twelve
   * times — and that hole is exactly why nobody ever met the 1.600 m ceiling.
   *
   * It is now the building's own: the springing, which is sourced clear height
   * less an estimated rise, times a fraction MEASURED off the footage. See
   * DOORWAY_HEAD_FRACTION for the frames and the method, and CUPOLA_RISE for the
   * argument that the rise is 0.25 and not 0.9.
   *
   * Taken at the UPPER storeys' springing, which is every storey the historic
   * stair serves. Storey 1 has no stair doorway — it is reached through ENTRANCE
   * and left by the modern spiral — and its own vault springs 0.5 m higher.
   *
   * A doorway can no longer be taller than the wall it is cut in, whatever
   * anyone does to the rise afterwards, because the fraction is below one by
   * measurement. chamberSection.test.ts asserts that and asserts the walker
   * still fits under it.
   */
  doorwayHeight: DOORWAY_HEAD_FRACTION * (UPPER_CLEAR - CUPOLA_RISE),

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
     *
     * [2026-08-14] AND THE RUN ABOVE THE LANDING IS STRAIGHT, WHICH THIS LIFT IS
     * NOT. Three independent readings of the frames say the last climb runs
     * straight under a barrel vault between parallel cheeks (up/222–224,
     * down/003–011), and one of them made the direct test: consecutive nosings in
     * up/223 measure the same tread depth at both walls, so there is no wedge and
     * it is not a winder. The other six stone flights are short winders that
     * turn. Nothing is changed here, because making it straight needs a direction
     * and a length that no source gives, and because the roof exit's bearing is
     * what the roof breach and head-8-9 both hang off — it is not a local edit.
     * Recorded so it is not rediscovered: windows.json →
     * footageReading.straightRoofFlight. The same frames also show there is no
     * upper LANDING at the top: up/225 and roof/007 put the last tread directly
     * at the threshold in the deck, where STAIR.endLandingLength lays a platform.
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

// ——————————————————————— the head-house on the terrace ———————————————————————
/**
 * THE WEDGE OVER THE ROOF STAIRWELL, which 5a648b0 left as the one unbuilt thing
 * on the terrace and which is built now (2026-08-20).
 *
 * WHAT THE FOOTAGE SHOWS. A structure of sawn ashlar standing on the paving
 * either side of the stair's opening, raked to a single straight arris from an
 * apex at the way out down to the slabs at the far end, with an inclined glazed
 * light lying on the rake and a stainless threshold profile set flush in the
 * paving where you step out. up/241 and up/242 have the whole wedge in profile —
 * 242 with a man standing against its vertical end, which is the only scale in
 * any of these frames; up/250, roof/008 and roof/009 are close on the ashlar and
 * its capping; up/243 and the tail of up/241 show the lantern's foot landing ON
 * the paving; roof/007 and down/001 stand on the threshold; down/003 looks back
 * from inside at the point where the glass runs out and the paving takes over as
 * the lintel over the passage.
 *
 * ALMOST NOTHING HERE IS A NEW NUMBER, and that is what 5a648b0 promised: the
 * PLAN is the opening already cut in the deck (App's `stairwells[FLOORS.length]`,
 * 69.97° of arc from r 4.767 to 5.767 on the shipped configuration) and the RAKE
 * is the clear height the stair already keeps (PLAYER.stairHeadroom). Two things
 * had to be read off the frames and they are tagged [VIDEO] below; one is derived
 * and checked against the frames; one is borrowed from the balustrade.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * THE APEX IS DERIVED AND THE FRAMES ARE THE CHECK. 2.30 m [DERIVED].
 * ═════════════════════════════════════════════════════════════════════════
 *
 * The soffit at the way out is `ROOF.deckY + PLAYER.stairHeadroom` — the same
 * clear height the passage is vaulted to under the paving, carried on above it.
 * It is not stored here because it is not a choice; lib/stairhead.ts takes the
 * headroom as an argument for the same reason stairwellSpanDeg() does.
 *
 * THE FRAMES MEASURE 2.1 ± 0.2 m and the two agree inside that. up/242 has a man
 * standing against the wedge's vertical end. For any two verticals standing on
 * one ground plane, H/h_camera = (row_foot − row_head)/(row_foot − row_horizon),
 * which needs neither the focal length nor either distance — the same
 * focal-free ratio PARAPET is measured by. Reading the man at rows 1374/916 and
 * the wall's near corner at 1415/831, with the horizon off the far shore of the
 * bay at row 962, the wall comes out at 1.16 × the man's own height: 2.09 m for
 * a 1.80 m man, 2.20 for a 1.90 m one. The RATIO is what is robust — moving the
 * horizon ±40 px moves it by less than 0.01 — and the man's stature is what is
 * not. A second reading agrees: the near corner carries six regular courses of
 * 90.4 px in 583 px of wall, and six courses of the 0.35 m these read as is
 * 2.10 m.
 *
 * SO WHY BUILD 2.30 RATHER THAN 2.10. Because 2.10 is a reading against an
 * unknown man and 2.30 is the number the rest of the stair is already built to,
 * and because of what the difference costs the walker: the rake is a chord (see
 * lib/stairhead.ts), so the clear height under it is least over the last riser,
 * and at an apex of 2.30 that minimum is 1.86 m against a 1.60 m walker. At 2.10
 * it is 1.70. Ten centimetres over a capsule's head is the margin this model has
 * been caught by before. If the owner measures the wedge, this is the one number
 * to send and it is one line in App.tsx away from the built model.
 *
 * WHAT WAS NOT BUILT AND WHY, because both are conspicuous in the frames:
 *
 *   · THE GLASS SCREEN AND ITS BARRED GATE across the way out — roof/007 and
 *     down/001 from inside, up/240 from the terrace, where it reads as a
 *     frameless glass box with a flat glass lid standing on the paving. It is
 *     operable: drawn shut it walls the stair up, and nothing in the corpus
 *     shows the hinge side, the leaf's swing or where the box's fourth face is.
 *     A gate is also the part of this that is fit-out rather than fabric — it is
 *     what closes the tower at six o'clock. Left out on both grounds.
 *   · THE RAKING METAL CAPPING on the ashlar's arris (roof/009 most plainly, and
 *     the white line down every profile view). Its section is a few pixels
 *     against nothing of known size in every frame. The lantern's own frame is
 *     drawn because it can be measured against the light it frames; this cannot.
 *   · THE COURSING. It is read — regular courses about 0.35 m deep, stretchers
 *     about 0.70 m, laid half-lap, joints FLUSH and hairline (up/242 at the near
 *     corner; roof/008) — and deliberately not carved. The drum's courses are
 *     drawn as relief by CourseBands because the drum's courses ARE relief, with
 *     a shadow under every bed. These are sawn flush, so relief here would be a
 *     fabrication with a shadow in it, and a joint depth is exactly the kind of
 *     plausible small number rule 1 is about.
 */
export const STAIRHEAD = {
  /**
   * m — thickness of each cheek wall. [DERIVED], and on the inner side there is
   * no other answer available.
   *
   * The opening's inner edge is `innerRadiusAt(ROOF.deckY) + STAIR.wallClearance`
   * and the paving's inner rim is `innerRadiusAt(ROOF.deckY)`, so the strip of
   * stone between the hole and the storey-8 room face is STAIR.wallClearance
   * wide and the inner cheek is exactly what stands on it. Thinner and a ledge
   * of paving hangs over the room; thicker and the wall oversails the room face
   * with nothing under it.
   *
   * THE OUTER CHEEK IS THE SAME WALL BUILT TWICE, and the frames say so rather
   * than symmetry. In up/243 and the tail of up/241 the ashlar band beside the
   * lantern measures 0.24 ± 0.07 of the lantern's own width, and the lantern
   * spans the well — 1.00 m — so the band is 0.24 m against this 0.25. That is
   * the whole of the measurement and it is quoted because it agrees, not because
   * anything was fitted to it.
   */
  cheekThickness: 0.25, // = STAIR.wallClearance; see above
  /**
   * m — the lantern's sheet. [ASSUMPTION], borrowed from BALUSTRADE.glassThickness
   * rather than invented afresh: nothing in the corpus resolves a pane edge
   * against anything of known size, on the roof or here, and the terrace should
   * not acquire a second unmeasured glass thickness. Same borrow, same reason, as
   * ROOF.pavingDepth taking FLOOR_SLAB.
   */
  glazingThickness: 0.015,
  /**
   * m — the metal profile along the lantern's two rakes and its eaves. [VIDEO]
   * 0.08, bracket 0.05…0.13.
   *
   * It is the most conspicuous thing on the wedge — the white line that reads
   * from anywhere on the terrace — and it is measured against the one ruler in
   * the same plane as it: the light it frames, which spans the well and is
   * therefore 1.00 m across plus its bearings. At the lantern's foot in up/241
   * the eaves profile is about 40 px where the sheet is about 700 px across;
   * halfway up the rake in up/243 the flank profile is about 55 px against about
   * 450 px, which is wider because that band is seen edge-on and includes the
   * upstand. The bracket is the spread of the two, and it is wide because the
   * profile is a folded metal section read at an angle, not a flat face.
   */
  frameWidth: 0.08,
  /**
   * m — the stainless threshold profile set flush in the paving at the way out.
   * [VIDEO] 0.04, bracket 0.03…0.06.
   *
   * roof/007 and down/001 both show it as a bright strip lying IN the slabs with
   * the treads starting straight behind it. Measured against the well's own
   * width the same way the frame is: in down/001 the visible run of the profile
   * is about 754 px for something under the well's 1.00 m of radial band, and its
   * own width is about 27 px, so 0.03…0.04 m. It is drawn flush — its top face
   * is ROOF.deckY — and gets no collider, for the reason the drainage channel
   * gets none: it is below anything the capsule can feel.
   */
  thresholdWidth: 0.04,
} as const

// ———————————————————— openings at the ends of the passages ————————————————————
/**
 * How a slit is fixed to the end of a stair passage.
 *
 * [OWNER], 2026-08-10: "НА ЯРУСАХ ОКНА ТОЛЬКО В НАЧАЛЕ И В КОНЦЕ ПРОХОДОВ
 * ЛЕСТНИЦ. НА САМИХ ЯРУСАХ НИКАКИХ ОКОН НЕТ" — openings are only at the
 * beginning and the end of the stair passages; the storeys themselves have none.
 * See src/lib/passageOpenings.ts for what follows from that and src/data/
 * windows.json for what it costs the photographic record.
 *
 * WHICH ends are open is NOT here and must not be put here. His second statement
 * the same day says it varies from passage to passage, so it is twelve facts
 * rather than a rule, and a rule in the config is exactly the shape it must not
 * take. It lives per end in windows.json, as [PLACEHOLDER] until he answers.
 *
 * Nothing here is a measurement, and two of the four are not even estimates —
 * they are CSG hygiene, which is why they are named for what they do rather than
 * for a part of the building.
 */
export const PASSAGE_OPENING = {
  /**
   * m — masonry between the landing floor and the slit's sill. [PLACEHOLDER],
   * and since 2026-08-14 a placeholder whose REASONING is refuted as well as its
   * value. It is still what the model builds, because nothing has replaced it.
   *
   * WHAT THE WALKTHROUGH FOOTAGE SHOWS, all four readings of it agreeing and
   * none dissenting. The sill is never at the level of the landing you step onto
   * out of the chamber. There are always several risers in between: the opening
   * stands at the top of the first short run of treads (up/168 — the sill block
   * about two courses above the tread under it), or steps climb to it inside the
   * embrasure (up/218 — two shallow ones; down/124 — three large ones). So the
   * building does not put one course of stone under a slit and the 0.30 is not a
   * description of it.
   *
   * AND THE BOUND GOES WITH IT, which matters more than the value. The old note
   * bounded this above at 0.40 m — PLAYER.stairHeadroom 2.30 less the 1.90 m
   * opening — and that arithmetic assumed the opening is cut in the wall OF THE
   * LANDING. It is not: it is at the far end of the passage, over treads that
   * are still climbing, so the clear height over the landing does not constrain
   * it at all. A model that clamps to 0.40 is enforcing a premise the footage
   * has taken away. Nothing is clamped differently yet, because unclamping it
   * without a measurement would just move the invention somewhere else.
   *
   * WHAT THE FOOTAGE CANNOT GIVE: metres. There is no scale object in any of the
   * 492 frames — no tape, no door of known size, no rule against a wall. Every
   * figure in the readings is a riser count times an ASSUMED riser, or a
   * proportion of a person at unknown distance through a wide-angle phone lens.
   * Rule 1 forbids all of it, and here it is working against a conclusion rather
   * than for one.
   *
   * NOR CAN THE EXTERIOR PHOTOGRAPHS, and that record is kept because it is the
   * other half of why 0.30 is still here: the eight measured slit centres,
   * re-referred to the nearest landing below them, imply sills from −0.43 to
   * +2.08 m. A 2.5 m spread is not a measurement of anything, and taking its
   * median would be dressing a guess as a reading. The 0.30 was chosen instead as
   * a CONSTRUCTION rule whose whole virtue was that it introduced no new number —
   * one slab thickness of stone under the sill, the same course the floors are
   * built of. That virtue survives the footage; the description does not.
   *
   * QUESTION FOR THE OWNER, and it has changed shape: not "knee, waist or
   * chest" — that measures from the treads directly under the sill, and the
   * model needs it from the landing at the chamber door. Ask instead how many
   * STEPS there are between the two, and how high the sill is at the window
   * itself. See windows.json → sillHeightQuestion.ask and → footageReading.sill.
   */
  sillAboveLanding: FLOOR_SLAB,
  /** m — the same course of stone over the head. [PLACEHOLDER]; see above. */
  lintelUnderCrown: FLOOR_SLAB,
  /**
   * ° of jamb kept between the reveal's inner mouth and the passage's end cap.
   * CSG hygiene, not a dimension: the mouth is nearly as long as the landing it
   * opens off, and without a margin the loft's middle ring lands exactly on the
   * plane the end cap was just swept from.
   */
  jambMarginDeg: 1,
  /** m kept between the reveal's inner head and the vault soffit. CSG hygiene. */
  crownMargin: 0.05,
  /**
   * Ends carrying a stepped BRANCH up from the landing to the floor of the
   * slit's embrasure. Was [PLACEHOLDER] and shipped EMPTY; ships FULL now, and
   * the change is an argument rather than a decision.
   *
   * WHAT WAS BUILT BEFORE. Nothing, and "nothing" was never the neutral option.
   * The reveal's floor stands above the landing at every end the tower cuts, so
   * the model has always claimed there is exactly ONE step up into every
   * embrasure — a lip, chosen by nobody, tagged by nobody, and the one riser
   * count the footage never shows. Filling this list does not add a claim to a
   * blank; it replaces a silent claim with a sourced one.
   *
   * WHY EVERY END. Not "every end has a branch" as a survey result — nobody has
   * walked the tower counting, and that is still recorded as open below. It is
   * that the question this list answers is "what stands between the landing and
   * the embrasure floor", and there is no end where the honest answer is
   * "nothing". The list keeps its per-end shape precisely so an id can be struck
   * out the day [OWNER] names an end that has none; an end that carries no slit
   * gets no branch anyway, because planPassageBranches() only serves ends the
   * shell was cut for.
   *
   * WHAT THE FOOTAGE SETTLES, unchanged from the 2026-08-14 reading: that the
   * branch exists, that it is at the END of a passage and not in a chamber wall,
   * that it climbs OUTWARD into the embrasure toward the slit, and that the
   * recess it climbs in is broad enough to stand in and narrows to a slot before
   * the daylight (up/168, down/124). up/087: a locked barred gate two steps up
   * off a landing. up/218: two shallow stone steps climbing inside the embrasure
   * to the sill, a barred screen across its mouth. up/143: the fork at the foot
   * of a flight, the main run bearing away and a short branch continuing on.
   *
   * WHAT IS STILL NOT SETTLED, and none of it inferable from these frames:
   *     · the going. [ESTIMATE], borrowed from WINDOW_EMBRASURE rather than
   *       invented here; the footage cannot correct it, because no object of
   *       known size stands in any of the 492 frames.
   *     · the bearing and the length of the branch tunnel, i.e. how far off the
   *       landing's own line it runs before it reaches the reveal. The model
   *       runs it straight out along the opening's own radius, which is where
   *       the reveal already goes.
   *     · whether every passage end has one — see WHY EVERY END above for what
   *       is being claimed instead.
   *     · WHICH end each frame is. The climb is continuous and a frame number
   *       could be walked back to a storey, but that is a chain of inferences
   *       about a thing the frames do not label, so no end here carries a
   *       per-end count. See branchSteps.
   *
   * QUESTION FOR THE OWNER, and it is now the same question as the sill's — see
   * windows.json → sillHeightQuestion.ask, which already asks for the step count
   * and the height at the window and says the riser will be got from his count.
   */
  branchAtEnds: [
    'foot-2-3',
    'head-2-3',
    'foot-3-4',
    'head-3-4',
    'foot-4-6',
    'head-4-6',
    'foot-6-7',
    'head-6-7',
    'foot-7-8',
    'head-7-8',
    'foot-8-9',
    'head-8-9',
  ] as string[],
  /**
   * Risers between the landing and the embrasure floor. [VIDEO], counted.
   *
   * A COUNT IS NOT A HEIGHT, and this is the one place that distinction stops
   * being an obstacle. The old objection to modelling the branch was that
   * "counting risers means assuming a riser" — true, if the climb were unknown.
   * It is not: the climb is sillAboveLanding above, already a [PLACEHOLDER],
   * already what the shell is cut with. So planSillBranch() takes riser =
   * climb / branchSteps and the branch adds no number of its own. Give the sill
   * its real metres and the treads follow without being touched.
   *
   * TWO, AND THE DISSENT IS RECORDED RATHER THAN AVERAGED. up/218 reads as two
   * steps inside the embrasure; up/087 as two steps up off the landing; up/168
   * puts the sill about two courses over the tread beneath it. down/124 reads as
   * THREE courses, and the older [VIDEO] 429–449 s reading counted 6/3/3 on three
   * branches. Nothing here reconciles them and nothing should: the frames are of
   * different ends of different passages and the building may well do both.
   *
   * WHERE THEY DISAGREE THE MODEL TAKES THE SMALLER, and the tie-break is about
   * the direction of the risk, not about the shape of the building. The count
   * sets how far the flight runs into the wall (stepCount × going), and the only
   * failure the wall constraint exists to prevent is a recess leaving the drum
   * through its own outer face — measured at 0.09 m over at storey 6 and 0.38 m
   * at storey 8 before b36496b. Two cannot cause it where three might. It is not
   * a claim that two is the commoner arrangement.
   */
  branchSteps: 2,
  /**
   * The branches [VIDEO] 429–449 s counted at 6, 3 and 3 steps, kept as the
   * dissenting reading of the count above rather than as a list of things left
   * out. Until 2026-08-20 this field said those branches were "deliberately NOT
   * modelled"; they are modelled now, at branchSteps risers rather than at 6, 3
   * and 3, because no frame ties any of those counts to an end of this model.
   *
   * The old reason for leaving them out has expired with the riser it assumed:
   * "6 × 0.2 m of climb plus a 1.9 m slit puts the head 3.1 m over a 2.30 m
   * vault" is arithmetic on a 0.2 m riser nobody measured. Under riser =
   * climb / stepCount six risers climb the same height two do, and the head goes
   * nowhere.
   */
  branchStepsDissent: [6, 3, 3],
} as const

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
 *
 * WHERE THE GATE STANDS is unchanged and its justification is not. The reading
 * was "in a slit's embrasure the wrought gate stands at the top of the steps, at
 * the outer end, with the whole flight of steps between the room and the gate".
 * There is no flight of steps between a room and this gate any more: behind it
 * now is the stair landing itself. That may well be the correct reading of the
 * same frame — a barred gate at the outer end of a reveal, with the passage
 * behind it — but it is a different sentence about the same photograph, and
 * re-using the old wording silently would hide that the premise moved.
 *
 * The other half of that per-opening rule — a grille at the far end of the
 * reveal, at the room face, with a lock plate, a keeper on the right jamb and a
 * glazed casement — was carried by the arched window alone, and that window went
 * out on 2026-08-10. 'revealEnd' is now a value nothing uses. It stays in the
 * type because it records a reading of a photograph, and a photograph does not
 * stop being evidence when a model changes.
 */
export const WINDOW_GRILLE = {
  /** Square bar, side in metres. [ESTIMATE] */
  barSide: 0.02,
  /**
   * Uprights across the opening, and rails across them. [ESTIMATE]
   *
   * Counts, not a gap. A gap of 0.12 m fitted ONE upright and eleven rails into
   * a 0.40 m slit — a ladder on its side. The photographs of a slit's gate show
   * the opposite proportion: eight to eleven uprights with two or three rails,
   * which is what a smith makes. Nine and three sit in the middle of both
   * ranges. The counts also keep the character constant across openings of
   * different size, which a fixed gap does not.
   */
  uprights: 9,
  rails: 3,
  /** Set back from the outer face, so the grid sits inside the reveal. [ESTIMATE] */
  inset: 0.1,
  /** How far each bar runs past the opening into the jamb. [ESTIMATE] */
  embed: 0.05,
} as const

/**
 * The stepped embrasures at the windows whose sills are out of reach.
 *
 * NOTHING USES THIS ANY MORE, and the reason is worth more than the numbers.
 *
 * "к некоторым окнам в настоящей башне ведут ступени" [OWNER]. This block was
 * that testimony's carrier: recesses cut into a CHAMBER wall, with steps up to a
 * slit's inner sill. planEmbrasure() derived which openings got them from the
 * openings' own heights and returned three of nine — lower-2, upper-1, upper-2.
 *
 * On 2026-08-10 the same owner said there are no openings in the chamber walls
 * at all, and said it again when the one exception the model had kept — the
 * later arched window — was put to him. That does not contradict the steps; it
 * relocates them. The receivers are zero now (an opening at the end of a passage
 * has its sill 0.30 m above the landing, so planEmbrasure() returns null for
 * every one), and the layer is off.
 *
 * A CONSTRAINT DISCOVERED WHILE CHECKING THAT, recorded before anything was
 * built on it, AND SINCE ENFORCED: these dimensions gave a recess 4.20 m deep for
 * a sill 2.95 m up, whatever height it was at, and the wall thins from 4.855 m at
 * storey 1 to 3.820 m at storey 8. Such a recess fitted inside the masonry up to
 * storey 5 and broke through the outer face from storey 6 — by 0.09 m at storey
 * 6 and 0.38 m at storey 8. The old test never asked, because the one chamber
 * window it ran over sat at storey 4.
 *
 * [2026-08-14] It stopped being a note and became arithmetic, because the thing
 * it was waiting on arrived. The walkthrough shows the stepped branch to a slit
 * at a passage end plainly and in several places — up/218, down/124, up/168,
 * up/143 — so the recess is a real cut in a real wall and not a number nobody
 * spends. planEmbrasure() now takes the stone available at the platform's own
 * height and the leaf that must survive beyond it (`outerLeaf` below), and takes
 * any shortfall out of the going. It CANNOT return a depth that leaves the drum.
 * Recording a hole in the outer face of a tower for a second time would have been
 * a worse failure than the first, because the first was a discovery.
 *
 * A CONFLICT THAT HAS TURNED INTO A CORROBORATION, which is a thing that has to
 * be recorded rather than quietly re-used. This note used to hold, as a conflict,
 * a [VIDEO] reading counting three barred branches off the stair at 6, 3 and 3
 * steps — the count matching the derivation, the step numbers (6, 5, 1) not. It
 * is not a conflict under the owner's new statement: a branch off the STAIR
 * climbing to a slit is what the roof-climb footage plainly shows at 429–449 s,
 * and it is the natural home for "steps lead up to some of the windows". What
 * agreed was the COUNT of branches, not the number of steps, and it was not
 * right to tune the steps to a recollection of frames before and it is not right
 * now. See PASSAGE_OPENING.branchAtEnds.
 *
 * [2026-08-20] TWO OF THESE NUMBERS ARE SPENT AFTER ALL, and it is worth being
 * exact about which. The branch at a passage end is built now — planSillBranch()
 * in lib/embrasure.ts — and it borrows `going` and `outerLeaf` from this block
 * rather than opening estimates of its own. It does NOT use `riserTarget`, which
 * is the whole point of it: the riser comes from the sill divided by the counted
 * steps. It does not use `platformDepth` either, because the embrasure floor is
 * the standing place and is already cut. `width` stays unspent: the branch is as
 * wide as the reveal it climbs in, which is a dimension the model already has.
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
  /**
   * m — the stone that must survive between the back of the recess and the
   * OUTER FACE OF THE TOWER. [PLACEHOLDER], and one course, for the same reason
   * PASSAGE_OPENING.sillAboveLanding is one course: it introduces no new number.
   *
   * THAT IT IS POSITIVE IS MEASURED, and it is the frames that measure it. up/168
   * and down/124 both look straight up an embrasure from inside: a recess broad
   * enough to stand in, narrowing to a slot a hand wide where the daylight is. So
   * the recess does NOT run to the face — the wall closes in front of it and the
   * slit alone goes through. Run the 0.9 m recess to the drum and the tower would
   * carry a 0.9 m hole where every exterior photograph shows a 0.4 m slit.
   *
   * HOW MUCH stone is not measured and cannot be, by the same argument that
   * governs everything else read off this footage: nothing of known size stands
   * in any of the 492 frames, so a leaf read off them is a proportion of a person
   * at unknown distance through a wide-angle lens. Rule 1. FLOOR_SLAB is borrowed
   * rather than invented — the one course-of-stone unit this model already owns,
   * the same course the floors are built of and the same one that stands under a
   * slit's sill and over its head.
   *
   * WHAT IT COSTS, said here rather than discovered later. planEmbrasure() takes
   * the depth out of the going, so with a 2.95 m sill the treads run 0.500 m at
   * storeys 1–3 and are cut back to 0.486, 0.465, 0.444, 0.424 and 0.403 m from
   * storey 4 up. The width-to-going ratio therefore climbs from 1.8 to 2.2, and
   * 2.2 is outside the 0.9–1.9 the one interior photograph of an embrasure gives.
   * That is published and not hidden, and it argues that the next thing to give
   * is `width` — an [ESTIMATE] — and never the wall, which is sourced.
   *
   * QUESTION FOR THE OWNER: standing in one of those embrasures, how thick is the
   * stone the slit itself is cut through — a hand, a forearm, an arm's length?
   */
  outerLeaf: FLOOR_SLAB,
  /**
   * m — how far a tread's nosing and level wander from nominal. [ESTIMATE]
   *
   * The steps in the photographs are worn: wavy nosings, hollowed middles, no
   * two at the same angle, in three independent frames. Identical boxes with
   * sharp arrises read as new concrete. Small enough not to trip anyone — the
   * walking surface is the ramp chain, which is unaffected — and large enough to
   * break the machined look.
   */
  wear: 0.035,
} as const

/**
 * The dressed surround every opening has, and the model had none.
 *
 * From outside, the model drew a bare slot in flush rubble — the owner's "окна
 * фигово получились" is half this. The photographs show each opening framed in
 * worked stone distinct from the rubble around it: a lintel or hood above, a
 * PROJECTING sill below with a rounded weathered edge (on the lower slit it
 * visibly tilts outward, i.e. it throws water), and dressed blocks up the jambs.
 *
 * Not every opening has the full set — upper-3 reads as lintel and sill only —
 * but the presence is not in doubt across the set. The SIZE is: one reading put
 * the surround at three to four slit-widths, the re-check nearer two to two and
 * a half. Everything here is therefore [ESTIMATE], chosen at the lower end of
 * that disagreement, because a surround that is too big is a worse mistake than
 * one that is too small — it stops reading as a frame and starts reading as a
 * panel.
 */
/**
 * The archivolt round the doorway — a ring of dressed voussoirs standing proud
 * of the wall.
 *
 * The model drew the entrance as a plain arched hole. The reading of the
 * exterior set is firm that it is not: a full ring of worked stone round a
 * semicircular head, the ring standing distinctly proud of the rubble, with a
 * recess between its outer face and the door leaf behind. It is the one opening
 * everyone photographs, and a bare hole is the wrong reading of the whole
 * façade.
 *
 * [PHOTO] for the ring's existence and rough proportion, [ESTIMATE] for the
 * figures: about 0.2–0.25 m radial by 0.2 m along the arc, standing 0.03–0.06 m
 * proud. The middle of each range is taken.
 */
export const ENTRANCE_ARCHIVOLT = {
  /** m — how far the ring reaches out from the opening's edge. [ESTIMATE] */
  ringDepth: 0.22,
  /** m — how far it stands proud of the wall face. [ESTIMATE] */
  projection: 0.045,
  /** m — the depth of one voussoir along the wall. [ESTIMATE] */
  stoneDepth: 0.2,
  /** How many stones make the ring. [ESTIMATE] — enough to read as voussoirs. */
  stones: 15,
} as const

/**
 * NOT BUILT WHERE THERE IS NO DAYLIGHT. A surround is dressed stone on the drum
 * face; on a bearing the buttress covers, the "drum face" is 10 m inside a solid
 * pier and the frame would be masonry buried in masonry. The planner never marks
 * such an end built (see PassageOpening.built and reachesDaylight), so today
 * nothing reaches this block that should not — but the guard belongs with the
 * rule, because the first nudge of STAIR.startAzimuthDeg changes which ends are
 * covered, and because since 2026-08-10 the owner may yet say that one of the
 * ends inside the pier carries an opening, which is reported as a conflict
 * rather than cut.
 */
export const WINDOW_SURROUND = {
  /** m — how far the sill stands proud of the wall face. [ESTIMATE] */
  sillProjection: 0.09,
  /** m — thickness of the sill slab. [ESTIMATE] */
  sillThickness: 0.12,
  /** m — height of the lintel or hood above the opening. [ESTIMATE] */
  headHeight: 0.22,
  /** m — how far the frame reaches past the opening on each side. [ESTIMATE] */
  sideMargin: 0.16,
  /** m — how far the dressed frame is set into the wall. [ESTIMATE] */
  depth: 0.14,
  /** The fall on the sill's top, so it throws water. [ESTIMATE] */
  sillFall: 0.06,
} as const

/**
 * The banded coursing of the outer face — the thing that makes the drum read as
 * this building and not as a cylinder.
 *
 * The model drew a smooth cylinder and put the banding entirely in the shader,
 * as tone. Two independent readings of the exterior set say the stripes are
 * RELIEF: each band's stones oversail the course below, every bed is a small
 * ledge with a hard shadow under it, and the silhouette is visibly serrated. An
 * albedo-only band cannot do that at any contrast.
 *
 * Both readings also agree the wall is in TWO zones with a sharp horizontal
 * boundary: plain, flush, large-block work below, regular ribbed courses above.
 * Their numbers, given independently:
 *   boundary   11 ± 1 m above the outside ground   /   11.3 ± 1.0 m
 *   band pitch 0.52 m (0.27 proud + 0.24 recessed) /   0.50 ± 0.04 m
 *   projection 0.08 m (range 0.05–0.13)            /   0.03–0.05 m
 * The pitch agrees closely; the projection does not, and the values below take
 * the middle of the disagreement rather than either end. Everything here is
 * [PHOTO] with that spread, not a measurement.
 *
 * The verification pass that would have tested these against the images died on
 * a session limit, so nothing here has been through the adversarial check the
 * rest of the window work had.
 *
 * NOT YET BUILT. Turning this into relief means making the drum a lathe of a
 * stepped profile instead of a cylinder. That was tried and backed out: the
 * banded profile changes the outer radius by up to the coping's oversail, and
 * four tests are written against a constant 8.25 — the bounding box, the window
 * overshoot, the through-hole ray and the floor under the treads. Every one of
 * them is answerable, but not in the same pass as the buttress, and a half-done
 * lathe is worse than a cylinder. The numbers are recorded here so the reading is
 * not lost.
 */
export const COURSING = {
  /** m above the outside ground where the plain zone gives way to the ribbed one. [PHOTO] ±1 */
  bandStartAboveGround: 11,
  /** m — one projecting course plus one recessed course. [PHOTO] ±0.04 */
  bandPitch: 0.51,
  /** m — how far a projecting course stands proud of the recessed one. [PHOTO], readings differ 0.03–0.13 */
  bandProjection: 0.055,
  /** Fraction of the pitch taken by the projecting course. [PHOTO] */
  proudFraction: 0.53,
  /** m — plain, unribbed courses under the coping. [PHOTO] ±0.2 */
  plainUnderCoping: 0.7,
  /** m — the rounded coping roll oversails the drum by this. [PHOTO], readings 0.05–0.30 */
  copingProjection: 0.16,
  /** m — how deep that coping band is. [PHOTO] */
  copingDepth: 0.55,
} as const

/**
 * 0-based index of the storey whose floor the wellhead opens in. Hoisted out of
 * WELL so that `offsetByRecess` below can read the wall's own radius at that
 * level; WELL.startsAtFloorIndex carries the argument for the value.
 */
const WELLHEAD_FLOOR_INDEX = 2
/** m — the funnel collar at the mouth. WELL.mouthDiameter carries the measurement. */
const WELLHEAD_MOUTH_DIAMETER = 1.08

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
  mouthDiameter: WELLHEAD_MOUTH_DIAMETER,
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
  startsAtFloorIndex: WELLHEAD_FLOOR_INDEX,
  /**
   * Azimuth of the WELLHEAD. Of the wellhead alone — see WALL_SHAFT below.
   *
   * ═════════════════════════════════════════════════════════════════════════
   * IT WAS 182 AND IT DROVE TWO THINGS. [OWNER] 2026-08-17, of the model on
   * screen: «на третьем ярусе вот это отверстие внутри стены стоит на
   * противоположной стороне, а колодец внутри стены между входами на лестницу.
   * А ты взял их поставил вместе.»
   * ═════════════════════════════════════════════════════════════════════════
   *
   * THEY ARE TWO OBJECTS AND HIS FOOTAGE SHOWS THEM SEPARATELY. up/076 and
   * up/077 (152 and 154 s into the ascent) are a tall narrow black slot rising
   * through several courses in an arched recess, its sill rubble at floor level
   * — the chase. up/081 (162 s) is the wellhead: a glazed opening in the floor
   * between two piers, a glass label bolted to the left one. Ten seconds of
   * walking apart, on one storey, and this file had them on one bearing, which
   * is not a placement error but a category error: one number cannot be two
   * places.
   *
   * ── THE WELLHEAD IS NOW DERIVED, NOT PLACED ───────────────────────────────
   *
   * «между входами на лестницу» — BETWEEN THE ENTRANCES TO THE STAIR. Storey 3
   * has exactly two: the head of flight 2→3 at 102.413 and the foot of 3→4 at
   * 206.580, both already computed by stairDoorways(). Their facing jambs stand
   * at 109.658 and 199.335, so the gap is 89.677° of wall, and betweenDoorways()
   * in lib/waterSystem.ts puts the mouth in the middle of it: 154.496 → 154.
   *
   * BOTH DOORWAYS MOVED ON THE EVENING OF 2026-08-17 AND THIS BEARING DID NOT,
   * to the last digit. approachAzimuthDeg() stopped standing a doorway half a
   * flight width from its end tread and stood it in the middle of its landing,
   * where the slit is — [OWNER]'s «прямо», twice asked for — which sends the two
   * ends of storey 3 3.952° further apart each, in opposite senses, about a
   * midpoint that cannot move. The gap opened from 81.772° to 89.677° and the
   * wellhead stayed at 154.496. A placement that survives its own inputs moving
   * is worth more than one that happens to be right today.
   *
   * HOW MUCH FREEDOM IS LEFT, because the sentence does not give a degree. The
   * mouth is 1.08 m across on a 2.4 m radius and so takes 13.003° of arc; it may
   * therefore stand anywhere from 122.661 to 186.332 before its rim touches a
   * jamb. That is a band 63.671° wide — ±31.835°, or 1.334 m of travel along the
   * floor. 154 is its middle, which is the only point in it that does not prefer
   * one doorway to the other, and the whole of the claim is "the middle of a band
   * 1.33 m wide", not "154.0".
   *
   * THE DERIVATION DOES NOT DEPEND ON offsetFromAxis, and that matters because
   * that radius is a [PLACEHOLDER] known to be too small (see below). The mouth's
   * width enters the BAND and cancels out of its MIDDLE. Push the wellhead out to
   * the wall and the freedom grows — at 3.2 m the mouth takes 9.71° and the band
   * opens to ±35.1° — but the bearing does not move at all. Contrast the old
   * tangent placement, which moved 8° for the same correction.
   *
   * THAT IS STILL TRUE AND IT IS NO LONGER ENOUGH, 2026-08-21. The radius has
   * since been read off the frames — offsetByRecess, 4.189, the mouth in the
   * floor of a wall recess — and at that radius this bearing does not move by a
   * degree and stops being AVAILABLE: 154 is inside storey 3's stairwell cut and
   * inside the arc the 2→3 passage occupies in the wall below. The insensitivity
   * this paragraph claims is a property of betweenDoorways(), not of the tower.
   * Nothing here is withdrawn; the whole of the argument is at offsetFromAxis.
   *
   * AND THE FIRST SENTENCE'S BEARING IS INSIDE THIS BAND, at its very clockwise
   * end: the tangent to the departure doorway's jamb, 186.332 with the doorway
   * where it stands tonight and 182.380 with it where it stood this morning. So
   * this is not his first sentence being overturned by his second. «Рядом с
   * проходом» puts the mouth hard against one of the two doorways; «между
   * входами» centres it between both. The move is 31.8°, and everything it costs
   * is measured below.
   *
   * WHAT IT COSTS: THE PIER IN up/080. That frame shows the wellhead's recess and
   * the stair's mouth as two openings in one wall with ONE pier between them, and
   * on the tangent placement that pier measures 0.878 m — near enough the frame
   * to read as support. At 154 it is 2.061 m to the departure jamb and 2.019 m to
   * the arrival one, which is a wider pier than the frame looks. That is recorded rather than
   * argued away: it was never a measurement — a pier read off a handheld
   * wide-angle frame with no scale is not one in this project — and it was always
   * labelled a corroboration. A sentence naming both doorways outranks it.
   *
   * WHAT IT SETTLES. The first question WELL_BEARING_CONFLICT used to ask was
   * "which side of the door?", because one frame was carrying the side by itself.
   * Between two doorways there is no side to pick. The question is closed.
   *
   * ── THE HISTORY, kept because the reasons matter more than the numbers ─────
   *
   * NO LONGER A [PLACEHOLDER]. [OWNER] 2026-08-16: «колодец должен стоять рядом
   * с проходом» — the well stands NEXT TO THE PASSAGE. That is testimony about
   * where a thing is, and it overrides a derivation about where a thing may be.
   *
   * HIS FOOTAGE SAYS THE SAME AND SAYS WHICH PASSAGE. On the ascent the walker
   * crosses storey 3 and the last thing before the climb is the wellhead:
   * up/081 shows it glazed in the floor of an arched recess in the wall, a glass
   * label fixed to the recess's jamb; up/080 shows that recess and the stair's
   * mouth as two openings in the same wall with ONE pier between them, the
   * steps rising immediately beyond it; up/082 and up/084 look down the shaft;
   * up/085 is the first tread and up/086 the barred opening at the foot of the
   * 3→4 passage. So the passage he means is the one storey 3 is LEFT by — the
   * foot of flight 3→4, whose doorway this model puts at azimuth 190.77.
   *
   * 182 IS THAT SENTENCE AS ARITHMETIC. besideDoorwayBearing() in
   * lib/waterSystem.ts puts the mouth's rim tangent to the radial plane of the
   * doorway's near jamb: 206.580 − 7.245 of doorway − 13.003 of mouth = 186.33,
   * to the nearest whole degree, because nothing has measured the bearing itself
   * and a decimal would imply something had. It leaves the mouth's rim 0.88 m
   * from the jamb's inner corner, which is about the width of the pier in
   * up/080 — a corroboration and NOT the derivation; a pier read off a handheld
   * wide-angle frame with no scale is not a measurement in this project.
   *
   * ═════════════════════════════════════════════════════════════════════════
   * IT WAS 171 UNTIL 2026-08-17, AND THE WELL DID NOT MOVE — THE DOOR DID.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * Nothing here was re-argued and nothing about the wellhead was re-read. The
   * doorway this bearing is tangent to stood at 190.772 because
   * approachAzimuthDeg() put every FOOT doorway on the wrong side of its end
   * tread — over the flight's own second, third and fourth treads instead of on
   * the landing. Straightened, the storey-3 foot doorway stood at 202.628 and the
   * same derivation gave 182.38; centred on its landing the same evening it
   * stands at 206.580 and gives 186.33. The tangent is a construction and not a
   * number — it follows the doorway wherever the doorway goes, which is the whole
   * reason this value has moved four times and never once been re-argued.
   *
   * THIS IS THE HAZARD THE OLD NOTE PROMISED WOULD COME, ARRIVING. It said "the
   * stair is still the thing that moves… this number must move with it", and
   * that is exactly what has happened, only through the doorway's side rather
   * than through STAIR_FROM_BUTTRESS_DEG. The owner's sentence is RELATIONAL —
   * beside the passage — so honouring it means the well follows the passage. A
   * well left at 171 while its doorway moved 12° would be the letter of his
   * placement against the whole of its meaning.
   *
   * THE SIDE WAS ANTICLOCKWISE, and it rested on one frame: up/080 has the steps
   * to the right of the recess with the camera facing the wall, and facing
   * outward the right hand runs clockwise, so the well was the lower bearing. It
   * was the weakest joint in the whole placement and it is now load-free — 154
   * lies anticlockwise of the departure doorway anyway, so the frame's reading is
   * still honoured, but nothing hangs on it: a bearing between TWO named openings
   * is fixed without asking which hand either of them is on.
   *
   * THE EARLIER HISTORY, because this value has been round the houses and the
   * reasons matter more than the numbers.
   *
   * It was 20, and at 20 the downpipe stood IN A DOORWAY: the chase is cut down
   * the room-side face and the head doorways came out at about az 15 while the
   * flights started at 100, so a visitor leaving the stair on storey 3 walked
   * into a 0.30 m pipe across the opening. The owner photographed it and called
   * it, exactly, pipes in the entrances. THAT FAULT IS NOT BEING REOPENED — the
   * doorway guard still holds, and it now holds on the chase's own bearing.
   *
   * It was then 230, to clear those doorways while the flights started at 100;
   * the flights have started at 196.7 since 2026-08-13 and the argument was
   * rebuilt twice on other grounds and void twice. Measured at last with the
   * chase's own half-width counted in, 230 stood 2.1° inside the roof climb's
   * passage and overlapped foot-8-9's reveal in plan, both held off by height
   * alone and one of them by 1.98 m of it.
   *
   * It was then 312: the middle of the only arc the drum leaves free, 232.12° →
   * 32.75° through north. That derivation is not withdrawn and is not wrong — it
   * is still in clearArcsFor() and still tested — it simply answers a question
   * about a VERTICAL RUN IN THE WALL, which is what WALL_SHAFT is and what a
   * wellhead in the floor is not. The two questions were being asked of one
   * number; now each is asked of its own. And the rule turns out to have been
   * pointing the right way all along: WALL_SHAFT lands at 334, inside that same
   * free arc, 21.6° off its middle.
   *
   * THE STAIR IS STILL THE THING THAT MOVES. STAIR_FROM_BUTTRESS_DEG is known to
   * be too small by at least 8° and has deliberately not been changed, so BOTH
   * doorways this bearing hangs between will move, and this number with them —
   * and now WALL_SHAFT with it, 180° behind. That is a feature rather than a
   * hazard, and it has been exercised twice: the derivation is run against the
   * live flight plan in wellClearance.test.ts, the departure doorway moved
   * 11.856° on 2026-08-17 and the suite said so rather than leaving the well
   * where the old sign had put it. Note what the new derivation does to that
   * sensitivity: a bearing hung off ONE doorway moves the whole of that doorway's
   * move; a bearing between two moves the AVERAGE of theirs. It is half as
   * twitchy, and the day the quarter turn is given both doorways will move
   * together and this bearing will barely notice.
   */
  azimuthDeg: 154,
  /**
   * m — WHERE THE FOOTAGE PUTS THE MOUTH'S CENTRE. [VIDEO] 4.189 ± 0.15.
   *
   * NOT what the model draws. It is carried beside the shipped radius and read
   * by nothing that renders, exactly as TOWER.doorwayWidthByProportion is: so a
   * test can state a conflict in one line instead of re-deriving it, and so the
   * day the conflict is decided the number is already here.
   *
   * WHAT THE FRAMES SHOW IS A STRUCTURE, NOT A LENGTH. The wellhead is not a
   * hole in open floor. It is the floor of an arched recess cut into the
   * chamber wall, and five frames say so from two directions:
   *   up/080   the recess and the stair's mouth — two openings in one wall with
   *            a single pier between them, the glass lying in the recess floor;
   *   up/081   close on it: the plate's near corner stands at the foot of the
   *            pier's arris and its near edge runs along the opening line with
   *            room floor beyond, so the plate lies INSIDE the recess and spans
   *            it from the opening to the back;
   *   down/163, down/164  the same pair on the way down, the plaque bolted to
   *            the pier, room floor again beyond the plate's near edge;
   *   up/082, up/083  looking down: the shaft's FAR rim stands at the recess's
   *            back wall with a stone lip a hand wide between them.
   *
   * So the recess is ONE MOUTH DEEP, give or take its two margins, and the
   * mouth's near rim stands on the chamber face. The arithmetic on that reading
   * is the whole of this value:
   *
   *     centre = innerRadiusAt(floorY) + mouthDiameter / 2
   *            = 3.649 + 0.540 = 4.189
   *
   * ± 0.15 for the two margins and for where a rubble arris really stands
   * against a modelled face.
   *
   * IT IS NOT A METRIC MEASUREMENT AND MUST NOT BE QUOTED AS ONE. A single
   * frame cannot give a DEPTH without a focal length or a known length along
   * the depth direction, and the one length that would serve — the mouth's own
   * 1.08 m read from near rim to far rim — is under glass and in shadow in every
   * frame there is. What the frames give is the RELATION; the two numbers in it
   * are this file's own, one sourced and one [PHOTO].
   *
   * IT REPLACES THE OLD READING OF 3.1–3.2, which had the mouth tangent to the
   * face from inside the room. The frames put it the other way round: the mouth
   * is IN the wall, not against it.
   */
  offsetByRecess:
    innerRadiusAt(FLOORS[WELLHEAD_FLOOR_INDEX].floorY) + WELLHEAD_MOUTH_DIAMETER / 2,
  /**
   * Distance of the wellhead from the tower axis. 2.4, REFUTED AND UNCHANGED —
   * and what keeps it is a conflict, not inertia. See offsetByRecess above for
   * what the footage measures instead.
   *
   * IT IS REFUTED TWICE AND NEITHER REFUTATION NEEDS A PIXEL MEASURED.
   *   · 2.4 stands the mouth in OPEN FLOOR, 1.249 m clear of the room face.
   *     Walked in the live model on 2026-08-21: the wellhead's ring and its
   *     glass sit at r 2.400, az 154.00 on storey 3's paving, in the middle of
   *     the room. Every frame of the real chamber puts them in a wall recess.
   *   · a bore 21 m deep sunk from storey 3's floor at r 2.4 crosses chambers 2
   *     and 1 in mid-air, and WaterSystem has to carry it in an [ASSUMPTION]
   *     masonry casing — a pier standing in two rooms, and the note there says
   *     no source confirms one. The owner's own walkthrough of both chambers
   *     (up/010–021 and up/036–048 going up, down/175–205 coming out) shows
   *     them clear: cases, screens and the steel spiral, and no pier.
   *
   * AND IT CANNOT BE CORRECTED WITHOUT DECIDING THE BEARING. Put the mouth
   * where offsetByRecess puts it and, at azimuth 154:
   *   · its rim reaches 4.729, and storey 3's own stairwell cut — the opening
   *     flight 2→3 breaks through the slab by — runs 108.24° → 176.28° at radii
   *     3.899 → 4.899. The mouth lands inside it. At 2.4 the rim stops at 2.940
   *     and that same hole is 0.959 m away, which is the clearance the suite has
   *     been asserting all along.
   *   · the shaft below it is worse. Between storey 2's floor and storey 3's,
   *     the wall from 92.53° to 217.14° IS the 2→3 passage, so a vertical bore
   *     of the mouth's width at 4.189 crosses it at ANY bearing in that arc. 154
   *     is the middle of the arc, and so is the tangent placement 186.33 this
   *     file carried before it. The wall is free from 217.14° round through
   *     north to 92.53°, and nothing has ever put the wellhead there.
   *
   * SO THE NOTE THIS ONE REPLACES WAS WRONG ABOUT THE ONE THING IT PROMISED.
   * It said "the one measurement most likely to arrive next can no longer move
   * the wellhead", meaning betweenDoorways() is insensitive to this radius. The
   * DERIVATION is; the BUILDING is not. Correcting the radius moves the bearing
   * by not one degree and makes that bearing unavailable, which is the stronger
   * statement of the two: at 154 the wellhead may stand anywhere except in the
   * wall, and the wall is where the footage puts it.
   *
   * WHAT WOULD CLOSE IT, cheapest first:
   *   1. ONE SENTENCE — beside WHICH of the two stair doorways the recess
   *      stands. up/080 and down/163 both show a single narrow pier between the
   *      recess and a stair mouth, which is the tangent placement rather than
   *      the bisector; that is a frame against a sentence, and the sentence has
   *      won this argument once already (see azimuthDeg), so nothing here
   *      reopens it. But a tangent placement does not clear the passage either,
   *      so the sentence has to say more than which side.
   *   2. THE QUARTER TURN. STAIR_FROM_BUTTRESS_DEG is known short by at least
   *      8°, and it moves the passage arc, the stairwell cut and the derived
   *      bearing together. Whether that opens a gap is not something this file
   *      can say in advance, and it is asserted rather than guessed in
   *      wellClearance.test.ts.
   * Neither is a thing arithmetic may decide, so the radius waits and says so.
   */
  offsetFromAxis: 2.4,
}

/**
 * THE SLOT IN THE WALL — the vertical chase the Ø 30 cm downpipe stands in.
 *
 * A SEPARATE OBJECT FROM THE WELLHEAD, WITH A SEPARATE BEARING, and until
 * 2026-08-17 this model did not have one. WELL.azimuthDeg drove both, so they
 * could not be apart however the evidence read; the owner walked storey 3 and
 * said so: «на третьем ярусе вот это отверстие внутри стены стоит на
 * противоположной стороне… А ты взял их поставил вместе.»
 *
 * WHAT IT IS, in his own footage. up/076 and up/077 — 152 and 154 s into the
 * ascent — show a tall narrow black slot cut through several courses inside an
 * arched recess, sill of rubble at floor level, dark the whole way up. That is
 * the same feature this file has always modelled as the downpipe's chase, which
 * [ref] describes as the niche the pipe comes out of and which App.tsx cuts into
 * the shell unconditionally. It is not the wellhead and it never was.
 *
 * ── 334 IS «НА ПРОТИВОПОЛОЖНОЙ СТОРОНЕ» AS ARITHMETIC ────────────────────────
 *
 * Opposite the wellhead: 154 + SHAFT_FROM_WELLHEAD_DEG = 334. That is the whole
 * derivation, and it is relational in the same way «между входами» is, so it
 * follows the wellhead wherever the stair sends it. It is a whole degree because
 * nothing has measured this bearing directly either; a decimal would imply
 * something had.
 *
 * ── WHAT THE SPLIT COSTS AND WHAT IT PAYS ───────────────────────────────────
 *
 * IT PAYS THE ENTIRE STAIR BILL. At 182 the chase broke into a stair passage on
 * four of the five storeys it runs up, 36.6–39.6° into each and 0.34 m past a
 * jamb 0.25 m thick — on storey 3 opening onto the treads of flight 3→4 at floor
 * level, with no threshold between room and stair at all. At 334 chaseBreaches()
 * returns EMPTY. The nearest doorway is the head of 4→6 at 65.27°, the nearest
 * reveal head-4-6 at 59.75°, the nearest passage 4→6 at 58.75° in plan, the
 * entrance at 48.90°. 334 lies inside the single free arc the drum leaves —
 * 232.12° → 32.75° — 58.75° from its nearer end. Nothing is cut that should not
 * be cut, and this is measured in wellClearance.test.ts against every doorway,
 * every reveal and every passage tube, in azimuth AND in height.
 *
 * IT COSTS THE JUNCTION, AND THE BILL IS 6.23 m. The pipe now stands on the far
 * side of the chamber from the mouth it delivers into, so the leg between them
 * crosses storey 3: 6.225 m against a room 7.299 m across, at 0.25 m above the
 * floor. NOTHING MEASURES THAT ROUTE. [ref] describes the pipe and the well and
 * is silent on how one reaches the other; the last courses of the real junction
 * were lifted long ago and the museum's cutaway draws it schematically. So the
 * model draws the only line arithmetic can draw — straight — and draws it in the
 * SCHEMATIC half of the water layer, where a diagram of a connection belongs.
 * It is not hidden: the droplets run along it, so the crossing is the most
 * visible thing in the layer rather than the least.
 *
 * THE QUESTION THAT WOULD CLOSE IT was already written down here before he
 * answered the first half of it: WELL_BEARING_CONFLICT used to ask "does the
 * pipe run where the mouth is?" and note that if it rose on another part of the
 * wall and reached the well low down, there was no conflict at all. He has now
 * said the first half — the shaft is opposite — and the second half stands open:
 * whether the leg crosses the room at floor level or runs under the paving.
 * One sentence closes it. Nothing here will invent it.
 */
export const WALL_SHAFT = {
  /**
   * Azimuth of the chase, [OWNER] 2026-08-17 via SHAFT_FROM_WELLHEAD_DEG.
   * Kept as a stored number rather than computed from WELL so that the config
   * stays the one place geometry is read from (CLAUDE.md rule 2); the derivation
   * is asserted in wellClearance.test.ts, which fails the day the two drift.
   */
  azimuthDeg: 334,
}

/**
 * Degrees from the wellhead round to the shaft. «На противоположной стороне».
 *
 * A named constant and not an inline 180 for the same reason
 * STAIR_FROM_BUTTRESS_DEG is one: it is the whole content of a sentence somebody
 * said about the building, and the day the sentence is refined — "not quite
 * opposite, a little toward the window" — there is exactly one number to change.
 */
export const SHAFT_FROM_WELLHEAD_DEG = 180

/**
 * THE WELLHEAD AND THE SHAFT, NOW TWO BEARINGS, printed on every load.
 *
 * It kept its name because it is still the same kind of thing App.tsx uses for
 * the openings — the record and the geometry side by side, with both halves
 * standing — but the conflict it reports has changed hands. It used to be that
 * one bearing did two jobs and the second job cost four stair passages. Splitting
 * them on the owner's own sentence pays that bill in full and leaves one debt in
 * its place: 6.23 m of pipe crossing storey 3 by a route nobody has measured.
 *
 * The numbers here are the shipped configuration's and are recomputed live by
 * chaseBreaches() — this text says what they mean, App.tsx prints what they are.
 */
export const WELL_BEARING_CONFLICT = [
  'УСТЬЕ И ШТРАБА РАЗВЕДЕНЫ. ЭТО СНИМАЕТ ВЕСЬ СЧЁТ ПО ЛЕСТНИЦЕ И ОСТАВЛЯЕТ ОДИН',
  'ДОЛГ — 6.23 м трубы поперёк третьего яруса.',
  '',
  '«Отверстие внутри стены стоит на противоположной стороне, а колодец между',
  'входами на лестницу» — 17.08.2026. Одним азимутом задавались оба; теперь два:',
  '  WELL.azimuthDeg       312 → 171 → 182 → 154   устье в полу',
  '  WALL_SHAFT.azimuthDeg              154 + 180 = 334   щель в стене',
  '',
  'УСТЬЕ БОЛЬШЕ НЕ [PLACEHOLDER]. На ярусе 3 ровно два входа на лестницу — верх',
  'марша 2→3 на 102.413 и низ 3→4 на 206.580. Между их косяками 89.677°, устье',
  'встаёт посередине: 154.496 → 154.',
  'СКОЛЬКО СВОБОДЫ ОСТАЛОСЬ: устье шириной 1.08 м на радиусе 2.4 занимает 13.003°,',
  'поэтому оно может стоять где угодно от 122.661 до 186.332 — полоса 63.671°,',
  'то есть ±31.835°, или 1.334 м хода по полу. 154 — её середина. Утверждение',
  'звучит как «посередине полосы шириной 1.33 м», а не как «154.0».',
  'И ЗАМЕТЬТЕ: 182 лежало в этой же полосе, у самого её края. Ваша вторая фраза',
  'не отменяет первую, она её центрирует. Сдвиг — 31.8°.',
  'ОБА ПРОЁМА СДВИНУЛИСЬ ВЕЧЕРОМ 17.08, каждый на 3.952° дальше от своей первой',
  'ступени — на середину своей площадки, туда, где стоит окно («окна при входе на',
  'лестницу опять направо смотрят»). Разошлись они в РАЗНЫЕ стороны, поэтому',
  'середина между ними не сдвинулась ни на цифру: 154.496 было, 154.496 и есть.',
  'Полоса свободы стала шире, устье осталось там же.',
  '',
  'ЧТО ЭТО ОПЛАТИЛО. На 182 штраба вскрывала лестничные проходы на четырёх ярусах',
  'из пяти (36.6–39.6° внутрь, 0.34 м в перемычку толщиной 0.25 м; на ярусе 3 щель',
  'выходила прямо на ступени марша 3→4 на уровне пола). На 334 не задет НИ ОДИН:',
  '  ближайший дверной проём — верх 4→6, 61.67°',
  '  ближайшая оконная ниша — head-4-6, 59.75°',
  '  ближайший проход       — 4→6, 58.75° в плане',
  '  вход                   — 48.90°',
  '334 лежит внутри единственной свободной дуги барабана (232.12° → 32.75°), в',
  '58.75° от её ближнего конца. Мерено по азимуту И по высоте, для каждого проёма,',
  'каждой ниши и каждого тубуса.',
  '',
  'ЧТО ЭТО СТОИТ. Труба теперь стоит на противоположной стороне зала от устья,',
  'в которое сливает. Колено между ними пересекает ярус 3: 6.225 м при поперечнике',
  'комнаты 7.299 м, на высоте 0.25 м над полом. ЭТОТ МАРШРУТ НИКТО НЕ МЕРИЛ.',
  '[ref] описывает и трубу, и колодец, и молчит о том, как одно доходит до другого.',
  'Поэтому модель ведёт прямую — единственную линию, которую можно вывести, — и',
  'ведёт её в СХЕМАТИЧЕСКОМ слое, где место диаграмме соединения. Не спрятано:',
  'капли бегут по ней, так что переход через зал виден лучше всего остального.',
  '',
  'ЧТО ЭТО ЗАКРОЕТ, по убыванию цены:',
  '  1. КАК ТРУБА ДОХОДИТ ДО КОЛОДЦА? Поверху через зал или под полом? Этот вопрос',
  '     здесь уже стоял 16.08 — и вы ответили на его первую половину. Осталась',
  '     вторая, и одна фраза её закрывает.',
  '  2. РАДИУС УСТЬЯ ИЗМЕРЕН — И НЕ ВСТАЁТ. up/080, up/081, down/163, down/164,',
  '     up/082, up/083: устье лежит в полу АРКОВОЙ НИШИ в стене. Стекло идёт от',
  '     линии проёма до задней стенки ниши, дальний край шахты — у самой стенки.',
  '     Значит ближний край устья стоит на грани зала, а центр — на',
  '     3.649 + 0.54 = 4.19 м (±0.15). Не 2.4 и не 3.1–3.2, как читалось раньше.',
  '     НО 4.19 НЕ ПОСТАВИТЬ, пока не решён азимут. На 154°:',
  '       · устье попадает ВНУТРЬ проёма в перекрытии яруса 3 — марш 2→3 пробивает',
  '         плиту на 108.24°–176.28°, радиусы 3.899–4.899;',
  '       · ствол под ним между ярусами 2 и 3 идёт СКВОЗЬ сам марш 2→3: стену там',
  '         занимает проход от 92.53° до 217.14°. Прежний тангенс 186.33 — в том же',
  '         секторе. Свободна стена от 217.14° через север до 92.53°.',
  '     ЧТО ЗАКРОЕТ: у КАКОГО из двух входов стоит ниша (up/080 и down/163',
  '     показывают между нишей и лестницей ОДИН узкий столб) — и четверть оборота,',
  '     которая двигает проход, проём в плите и сам азимут разом.',
  '  3. ЛЕСТНИЦА. STAIR_FROM_BUTTRESS_DEG заведомо мал минимум на 8°; оба проёма',
  '     сдвинутся, а с ними — и устье, и штраба. Но устье теперь идёт за СРЕДНИМ',
  '     из двух проёмов, а не за одним, и потому вдвое менее чувствительно.',
] as const

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
