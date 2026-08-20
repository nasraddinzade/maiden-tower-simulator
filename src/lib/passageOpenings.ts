/**
 * The openings in the stair passages — where the tower's slits actually are.
 *
 * THE OWNER, 2026-08-10, in capitals and unprompted:
 *
 *   "НА ЯРУСАХ ОКНА ТОЛЬКО В НАЧАЛЕ И В КОНЦЕ ПРОХОДОВ ЛЕСТНИЦ.
 *    НА САМИХ ЯРУСАХ НИКАКИХ ОКОН НЕТ"
 *
 *   — on the storeys, openings are ONLY at the beginning and the end of the
 *   stair passages; on the storeys themselves there are no windows at all.
 *
 * AND THE SAME DAY, ASKED AGAIN AND ANSWERING IN MORE DETAIL:
 *
 *   "на ярусах самих окон нет. только когда заходишь в проем чтобы подняться в
 *    некоторых местах и вначале входа на лестницу и в конце есть окна а в
 *    некоторых местах или в начале или в конце входа на лестиницу"
 *
 *   — on the storeys themselves there are no windows. Only once you step into
 *   the passage to climb: in SOME places there is one at the beginning of the
 *   stair entrance and one at the end; in others only at the beginning, or only
 *   at the end.
 *
 * [OWNER]. He is Azerbaijani, he has walked the building, and this is testimony
 * rather than a survey — but it outranks every photographic reading in this
 * repository, all of which are inferences from exterior frames about a thing
 * the photographs cannot see: which side of the wall an opening belongs to.
 *
 * WHAT THIS MODULE THEREFORE IS. An opening in the tower no longer carries its
 * own azimuth or its own height. Both are properties of the stair: a slit sits
 * at the end of a passage, so it is wherever that end is. src/data/windows.json
 * keeps what the stair cannot say — how big the hole is, how its head is
 * finished, and WHICH ENDS ARE OPEN.
 *
 * THAT LAST ONE IS DATA AND NOT A RULE, and the second statement is why. "In
 * some places both, in others only one" is not a pattern anything here can
 * derive: it is a list of twelve facts about twelve ends, and the only source
 * for it is a person who has climbed the stair. So `OpeningFitting.open` is the
 * datum, it ships as [PLACEHOLDER] on every end because nobody has yet been
 * asked end by end, and the daylight geometry below has been demoted from the
 * source of truth to a CHECK that reports a conflict — see planPassageOpenings()
 * and testimonyConflicts().
 *
 * Three-js-free on purpose (CLAUDE.md rule 6): every judgement here is arithmetic
 * and every one of them is tested.
 */

import type { PassageSection, StepPlacement } from './staircase'
import { planSillBranch, sillBranchTreads, type EmbrasureTread } from './embrasure'

const DEG = Math.PI / 180

export type PassageEnd = 'foot' | 'head'

/** Shortest signed difference a − b, in (−180, 180]. */
function delta(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180
}

/** Azimuth folded into [0, 360). */
function norm(a: number): number {
  return ((a % 360) + 360) % 360
}

// ————————————————————————— where an end IS —————————————————————————

/**
 * One extremity of one stair passage: the landing you arrive on, and the stone
 * that closes the tunnel beyond it.
 *
 * The landing is the arc between the END TREAD and the END CAP. Both are already
 * built by stairPassageSections()' lead-in and lead-out, which repeat the end
 * tread's height so the lead reads as the landing continuing to the door — so
 * this describes the passage as it is already cut, and invents nothing.
 */
export interface PassageEndAnchor {
  flightIndex: number
  end: PassageEnd
  /** Azimuth of the end cap — the tangential plane that walls the tunnel off. */
  capAzimuthDeg: number
  /** Azimuth of the end tread, where the landing gives way to steps. */
  treadAzimuthDeg: number
  /** World Y of the landing floor. */
  landingY: number
  /** World Y of the vault over the landing. */
  crownY: number
  /** Radius of the passage's OUTER cheek here — where a radial reveal starts. */
  cheekRadius: number
  /** Radius of its inner cheek, i.e. the jamb between passage and chamber. */
  innerCheekRadius: number
}

/** Stable id for an end: `foot-2-3`, `head-4-6`. Never an index — see below. */
export function passageEndId(
  fromFloorNumber: number,
  toFloorNumber: number,
  end: PassageEnd,
): string {
  return `${end}-${fromFloorNumber}-${toFloorNumber}`
}

/**
 * The two ends of each passage tube.
 *
 * IDS, NOT INDICES, downstream. Every one of the stair's inputs is a live leva
 * slider; a flight that gains or loses a step renumbers nothing, but a change to
 * the lift table would, and SunControls prints an opening's id to the viewer.
 *
 * `landingYOf` is injected exactly as stairDoorways() takes it, so a doorway and
 * the slit at the same end cannot end up at two different storey levels — they
 * are two holes in the same landing and the model has been bitten before by
 * placing such pairs from separate arithmetic.
 */
export function passageEndAnchors(
  flights: StepPlacement[][],
  tubes: PassageSection[][],
  landingYOf: (flightIndex: number, end: PassageEnd) => number,
): PassageEndAnchor[] {
  const out: PassageEndAnchor[] = []
  flights.forEach((steps, flightIndex) => {
    const tube = tubes[flightIndex]
    if (!steps || steps.length === 0 || !tube || tube.length === 0) return
    const ends: Array<[PassageEnd, StepPlacement, PassageSection]> = [
      ['foot', steps[0], tube[0]],
      ['head', steps[steps.length - 1], tube[tube.length - 1]],
    ]
    for (const [end, tread, cap] of ends) {
      out.push({
        flightIndex,
        end,
        capAzimuthDeg: cap.azimuthDeg,
        treadAzimuthDeg: tread.azimuthDeg,
        landingY: landingYOf(flightIndex, end),
        crownY: cap.topY,
        cheekRadius: cap.outerRadius,
        innerCheekRadius: cap.innerRadius,
      })
    }
  })
  return out
}

// ——————————————————————— what the JSON still says ———————————————————————

/**
 * The editable half of an opening: everything the stair cannot tell you.
 *
 * No azimuth and no heightFraction. Those were photographic readings of where
 * openings are ON THE DRUM, and they are kept — in windows.json's
 * `photographicLadder`, as the yardstick the derived layout is scored against.
 * They are no longer an input to any geometry.
 */
export interface OpeningFitting {
  /** Matches passageEndId(). */
  id: string
  /**
   * WHETHER THIS END CARRIES AN OPENING. Per-end fact; testimony is the source.
   *
   * `null` is [PLACEHOLDER] — nobody has been asked about THIS end — and it is
   * what all twelve ship as. It is not a shorthand for "no" and not a shorthand
   * for "let the geometry decide": it means the record is empty, and the model
   * says so out loud rather than pretending the gap is closed.
   *
   * This used to be called `built`, and the rename is the change. `built` was an
   * output word — what the model cuts — and it let a geometric rule quietly
   * supply the answer for every end. [OWNER] 2026-08-10 says the answer varies
   * end by end ("in some places both, in others only one"), so it is an input,
   * and an input nobody has filled in yet.
   */
  open: boolean | null
  /**
   * Whose word `open` is, e.g. "[OWNER] 2026-08-10". `null` while `open` is.
   *
   * Required, so that an end cannot be opened or shut by nobody. See
   * validateEndRecord(): a value with no source is the failure this field
   * exists to make impossible, because it is exactly how a guess becomes a fact
   * three commits later.
   */
  openSaidBy: string | null
  outerWidth: number
  outerHeight: number
  /** Upper bound, not a size: see fitReveal(). */
  innerWidth: number
  /** Upper bound, not a size: see fitReveal(). */
  innerHeight: number
  head?: 'flat' | 'round' | 'pointed'
  /** Which end of the reveal a grille hangs at. See windows.json. */
  barrierAt?: 'outer' | 'revealEnd'
  solsticeAligned: boolean
  note?: string
}

/** How an opening is fixed to the end of a passage. Every field is derived. */
export interface PassageOpeningCfg {
  /**
   * m — masonry between the landing floor and the slit's sill. [PLACEHOLDER];
   * see PASSAGE_OPENING in config/tower.ts for why it is one slab thickness.
   */
  sillAboveLanding: number
  /** m — masonry between the slit's head and the passage vault. [PLACEHOLDER] */
  lintelUnderCrown: number
  /** ° of jamb kept between the reveal's mouth and the end cap. CSG hygiene. */
  jambMarginDeg: number
  /** m kept between the reveal's inner head and the vault soffit. CSG hygiene. */
  crownMargin: number
}

/** An opening, fully placed. */
export interface PassageOpening extends PassageEndAnchor {
  id: string
  /** `2-3`, `4-6` — the flight both of whose ends share it. */
  passage: string
  azimuthDeg: number
  centreY: number
  /** Radius where the reveal STOPS — the passage's outer cheek, not the room. */
  revealEndRadius: number
  outerWidth: number
  outerHeight: number
  innerWidth: number
  innerHeight: number
  head?: 'flat' | 'round' | 'pointed'
  barrierAt?: 'outer' | 'revealEnd'
  solsticeAligned: boolean
  /** THE RECORD, carried through untouched. `null` is [PLACEHOLDER]. */
  open: boolean | null
  /** Whose word `open` is, where there is one. */
  openSaidBy?: string
  /**
   * THE CHECK, and no longer the source of truth: could an opening here reach
   * daylight at all, and is there wall to cut it in?
   */
  reachesDaylight: boolean
  /** What the check found in the way. */
  blindBecause?: 'buttress' | 'parapet'
  /** Metres of solid buttress a radial ray must cross here. 0 is daylight. */
  buttressDepth: number
  /**
   * WHAT THE CHECK'S VERDICT IS WORTH: how far this end stands from the pier's
   * traced edge, and how finely that edge can be read. See pierEdgeReading().
   */
  pier: PierEdgeReading
  /** True when this end is actually cut. */
  built: boolean
  /**
   * Which authority `built` came from. 'record' where the datum decided it,
   * 'placeholder' where the record is empty and the check stood in for it.
   */
  decidedBy: 'record' | 'placeholder'
  /**
   * The record says this end is open and the check says it is blind. Reported,
   * never resolved quietly — see testimonyConflicts().
   */
  conflict?: 'openButBlind'
  /** True where the recorded inner width did not fit the landing's arc. */
  clampedWidth: boolean
  /** True where the recorded inner height did not fit under the vault. */
  clampedHeight: boolean
  note?: string
}

// ————————————————————————— the buttress in plan —————————————————————————

export interface ButtressPlan {
  azimuthDeg: number
  projection: number
  tipWidth: number
  rootArcDeg: number
  skewDeg: number
  /**
   * ° the traced outline can be read to at all. See BUTTRESS.edgeToleranceDeg in
   * config/tower.ts, which derives it from the [OSM] fit's own node scatter.
   *
   * REQUIRED, not optional, and that is the point of putting it here rather than
   * on the planner's input: every caller in the project already passes BUTTRESS
   * or a spread of it, so the tolerance travels with the bearings it qualifies
   * and a doctored beak cannot arrive without one. A datum that can be passed
   * around without its error bar will be read to the last digit somebody typed —
   * which is exactly what happened to the 113.5 below.
   */
  edgeToleranceDeg: number
}

/**
 * The beak's outline in plan, as (x, z) in the tower's own frame.
 *
 * The SAME construction beakShape() extrudes — root arc, long flank, semicircular
 * nose, short flank — rebuilt here without three.js so the daylight test is pure
 * arithmetic and can run in the planner rather than only against a built mesh.
 * If the two ever disagree the model has two buttresses, so there is a test that
 * casts rays at the assembled shell and compares.
 */
export function beakOutline(
  b: ButtressPlan,
  outerRadius: number,
  noseSegments = 16,
): Array<[number, number]> {
  const R = outerRadius
  const tip = R + b.projection
  const halfTip = b.tipWidth / 2
  const arc = b.rootArcDeg * DEG
  const skew = b.skewDeg * DEG
  const thetaA = -skew - arc / 2
  const thetaB = -skew + arc / 2
  const noseCentre = tip - halfTip

  // plan coordinates with the nose axis along +y, exactly as beakShape() builds it
  const local: Array<[number, number]> = []
  // closing points sunk inside the drum, so a ray from the axis meets a closed loop
  local.push([R * 0.45 * Math.sin(thetaA), R * 0.45 * Math.cos(thetaA)])
  local.push([R * Math.sin(thetaA), R * Math.cos(thetaA)])
  local.push([-halfTip, noseCentre])
  for (let i = 0; i <= noseSegments; i += 1) {
    const t = Math.PI - (i / noseSegments) * Math.PI
    local.push([halfTip * Math.cos(t), noseCentre + halfTip * Math.sin(t)])
  }
  local.push([R * Math.sin(thetaB), R * Math.cos(thetaB)])
  local.push([R * 0.45 * Math.sin(thetaB), R * 0.45 * Math.cos(thetaB)])

  // turn the nose axis from north to the buttress's azimuth
  return local.map(([x, y]) => {
    const r = Math.hypot(x, y)
    const a = Math.atan2(x, y) + b.azimuthDeg * DEG
    return [r * Math.sin(a), r * Math.cos(a)]
  })
}

/**
 * Metres of solid buttress a RADIAL ray at this azimuth must cross before it
 * reaches daylight. Zero means the drum face is the outside of the building here.
 *
 * Cast from the drum's own surface outward, and the answer is the FARTHEST
 * crossing, not the nearest: the pier is convex and a ray leaving the re-entrant
 * clips a flank before it is clear.
 */
export function buttressDepthAt(
  azimuthDeg: number,
  b: ButtressPlan,
  outerRadius: number,
): number {
  const pts = beakOutline(b, outerRadius)
  const a = azimuthDeg * DEG
  const ox = Math.sin(a)
  const oz = Math.cos(a)
  const sx = ox * outerRadius
  const sz = oz * outerRadius
  let farthest = 0
  for (let i = 0; i < pts.length; i += 1) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[(i + 1) % pts.length]
    const dx = bx - ax
    const dz = bz - az
    const den = ox * -dz - oz * -dx
    if (Math.abs(den) < 1e-12) continue
    const rx = ax - sx
    const rz = az - sz
    const t = (rx * -dz - rz * -dx) / den
    const s = (ox * rz - oz * rx) / den
    if (t > 1e-9 && s >= 0 && s <= 1) farthest = Math.max(farthest, t)
  }
  return farthest
}

/**
 * How far a bearing has to turn, each way, to come out from behind the pier.
 *
 * WHY THIS EXISTS. On 2026-08-14 the owner's own footage falsified one of this
 * model's openings outright: head-3-4 is placed at azimuth 105.5 facing 10.6 m of
 * solid buttress and is withheld as blind, and up/098, down/138 and down/139 show
 * a person standing at it looking down on a multi-lane road, a car park and people
 * on the paving. Something in the layout is wrong, and the first thing anybody
 * needs to know is HOW WRONG — whether the gap is a fraction of a degree, which
 * would be noise, or tens of degrees, which would be a different building.
 *
 * So this reports the two rotations that reach daylight rather than one "answer".
 * It chooses nothing: it does not know which sense is right, it does not apply
 * anything, and a caller that turns the stair by what it returns is fitting the
 * building to a picture, which is rule 7. It is a ruler, not a repair.
 *
 * Clockwise means increasing azimuth (CLAUDE.md rule 3). Infinity means no
 * rotation within `limitDeg` clears it, which for a pier of finite arc cannot
 * happen and is returned rather than thrown so a caller can print it.
 */
export function rotationToDaylightDeg(
  azimuthDeg: number,
  b: ButtressPlan,
  outerRadius: number,
  limitDeg = 180,
): { clockwise: number; counterclockwise: number } {
  const blind = (a: number) => buttressDepthAt(a, b, outerRadius) > 0
  if (!blind(azimuthDeg)) return { clockwise: 0, counterclockwise: 0 }

  const find = (sign: 1 | -1): number => {
    const coarse = 0.25
    let lo = 0
    for (let d = coarse; d <= limitDeg + 1e-9; d += coarse) {
      if (!blind(azimuthDeg + sign * d)) {
        let hi = d
        // bisect the crossing: lo is blind, hi is clear
        for (let i = 0; i < 40; i += 1) {
          const mid = (lo + hi) / 2
          if (blind(azimuthDeg + sign * mid)) lo = mid
          else hi = mid
        }
        return hi
      }
      lo = d
    }
    return Number.POSITIVE_INFINITY
  }

  return { clockwise: find(1), counterclockwise: find(-1) }
}

// ——————————— the pier's edge, and how finely it can be read at all ———————————

/**
 * The two azimuths at which the beak's root leaves the drum.
 *
 * Arithmetic on the [OSM] plan, not a second reading of it: the root arc is
 * `rootArcDeg` wide and centred `skewDeg` counterclockwise of the nose axis, so
 * its edges are azimuthDeg − skewDeg ± rootArcDeg/2 — 72.7 and 113.5 as shipped.
 * buttressDepthAt() finds the same two boundaries by casting rays at the outline,
 * and a test asserts they agree; this exists because a NUMBER can be compared
 * against a tolerance and a ray cannot.
 */
export function pierEdgesDeg(b: ButtressPlan): { counterclockwise: number; clockwise: number } {
  const mid = b.azimuthDeg - b.skewDeg
  return {
    counterclockwise: norm(mid - b.rootArcDeg / 2),
    clockwise: norm(mid + b.rootArcDeg / 2),
  }
}

/**
 * ° a bearing stands clear of the nearer pier edge. Negative inside the root arc.
 *
 * The same quantity rotationToDaylightDeg() searches for by bisection, in closed
 * form and with a sign — for the two blind ends the two agree to six figures
 * (8.0084 and 11.0872), which is the check that this is measuring the pier and
 * not an idea of it.
 */
export function pierClearanceDeg(azimuthDeg: number, b: ButtressPlan): number {
  const e = pierEdgesDeg(b)
  const past = delta(azimuthDeg, e.clockwise)
  const before = delta(e.counterclockwise, azimuthDeg)
  const outside = [past, before].filter((d) => d > 0)
  return outside.length > 0 ? Math.min(...outside) : Math.max(past, before)
}

/** m of an outer mouth of this width, centred here, that stands over pier root. */
export function pierBlockedWidth(
  azimuthDeg: number,
  outerWidth: number,
  b: ButtressPlan,
  outerRadius: number,
): number {
  const halfDeg = outerWidth / 2 / outerRadius / DEG
  const halfArc = b.rootArcDeg / 2
  const c = delta(azimuthDeg, b.azimuthDeg - b.skewDeg)
  const lo = Math.max(c - halfDeg, -halfArc)
  const hi = Math.min(c + halfDeg, halfArc)
  return Math.max(0, hi - lo) * DEG * outerRadius
}

/**
 * WHERE ONE OPENING STANDS AGAINST THE PIER, AND WHETHER THAT CAN BE KNOWN.
 *
 * Two numbers about the same hole, and they are not the same question:
 * `centreDeg` is the bearing the daylight check tested, `mouthDeg` is where the
 * stone actually is once the hole has a width. Both are published because they
 * disagree at the one end this whole apparatus was written for.
 */
export interface PierEdgeReading {
  /** ° the landing centre — the bearing the check tests — clears the pier edge. */
  centreDeg: number
  /** m that clearance is worth on the face of the drum. The knife edge, in metres. */
  centreOffset: number
  /** ° the nearer JAMB of the outer mouth clears it. Negative: the mouth overlaps. */
  mouthDeg: number
  /** m of the outer mouth standing over pier root; 0 where the mouth is all clear. */
  blockedWidth: number
  /** m the outer mouth is wide, carried so blockedWidth reads as a fraction of it. */
  mouthWidth: number
  /** ° the trace can be read to at all — ButtressPlan.edgeToleranceDeg. */
  toleranceDeg: number
  /** m that tolerance is worth on the drum face, for comparing like with like. */
  toleranceOffset: number
  /** True where the beak's head is below this opening, so none of it bites. */
  aboveBeakHead: boolean
  /**
   * THE FINDING. |centreDeg| is inside toleranceDeg: the clearance this end was
   * cut (or withheld) on is smaller than the scatter of the trace it was measured
   * against, so the datum does not decide it in either direction.
   */
  insideDatumError: boolean
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THE MODEL DOES WITH AN OPENING ITS OWN DATUM CANNOT DECIDE.
 * Decided 2026-08-15. head-6-7 is the case; the rule is general.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THE CASE. head-6-7's landing centre comes out at azimuth 113.6292. The pier's
 * traced daylight edge is at 113.5000. The opening is therefore open by 0.1292°,
 * which is 18.6 mm on the face of the drum — and the fallback check cuts it for
 * that reason and no other. The trace those 113.5000 come from states its own
 * scatter: fourteen drum nodes agreeing to ±0.03 m, which at r 8.25 is ±0.208°,
 * or ±30 mm. The clearance is 0.62 of the noise. Nothing about that window is
 * decided by the building.
 *
 * (18.6 mm, not the 14 mm this repository carried in four places since the knife
 * edge was first noticed. 0.1292° × π/180 × 8.25 m = 0.0186 m. The old figure was
 * an arithmetic slip and it flattered nobody — it made the margin sound thinner
 * than it is — but a wrong number defending a right conclusion is still a wrong
 * number, and it had been quoted back three times.)
 *
 * THE DECISION: CUT IT, AND STOP CALLING IT A FACT. Not "drop it", and the
 * reasons are in order of how much they weigh.
 *
 *   1. THE RECORD IS EMPTY HERE. `open` for this end is null — [PLACEHOLDER],
 *      nobody has been asked. This file is explicit that null "is not a shorthand
 *      for no", and withholding the opening would let a geometric rule fill in a
 *      fact the record leaves blank. That is the exact move the 2026-08-10 rebuild
 *      took OUT of this file when `built` became `open`.
 *
 *   2. DROPPING IT ASSERTS A NEGATIVE ON THE SAME DATUM THAT COULD NOT ASSERT
 *      THE POSITIVE. There is a sharper reading available — see mouthDeg below,
 *      the mouth overlaps the pier by 1.26° — but it comes off the identical
 *      two-node tracing of the beak. A longer lever arm on the same soft datum
 *      is not a better source, and using it to delete an opening would be
 *      spending the doubt in whichever direction happened to be convenient.
 *
 *   3. AND THE OVERLAP IS NOT ABOUT THE TOWER. Where an opening sits along its
 *      landing is a MODEL RULE — planPassageOpenings centres it, on an argument
 *      about fitting rather than about evidence — and the landing is 20.4° long
 *      against a 2.78° mouth. Slide the slit 1.3° along its own landing, which
 *      nothing in any source forbids, and the mouth clears the pier entirely.
 *      A quantity that can be zeroed by re-reading one of the model's own
 *      conventions cannot be used to demolish an opening.
 *
 * WHAT IS NOT DONE, AND MUST NOT BE. `reachesDaylight`, `blindBecause`,
 * `buttressDepth` and `built` keep exactly the meanings they had: a radial ray
 * cast at the landing's centre bearing. They are the vocabulary of the quarter-
 * turn finding (config/tower.ts → STAIR_FROM_BUTTRESS_DEG and the eleven tests in
 * lib/stairBearing.test.ts, which measure head-3-4's 10.64 m of pier and the
 * 8.01°/11.09° rotations out of it). Redefining `reachesDaylight` to mean "the
 * whole mouth is clear" would silently move that finding's numbers, and a finding
 * that moves when somebody improves an unrelated check is not a finding. So this
 * reading is ADDITIVE: it measures more, and it decides nothing that was already
 * decided.
 *
 * WHAT IS DONE INSTEAD: the doubt is published in three places, so that it costs
 * something to ignore. `insideDatumError` on the opening itself; a line out of
 * testimonyConflicts() into the dev console on every load; and — the part that
 * matters, because the other two are for whoever edits the model — a caveat in
 * the VIEWER's interface, since a visitor standing in that passage is looking at
 * a window that may not be there. src/components/ui/DatumCaveat.tsx.
 *
 * WHAT WOULD RETIRE ALL OF IT. One survey bearing for the beak's root, or the
 * İçərişəhər plans. Until then the honest state of this opening is "cut, and
 * unsupported", and the model says both halves.
 *
 * THE ONE CLAIM THIS DOES NOT MAKE. It has been suggested that the pier's edge
 * drifts with height because the beak tapers, so that 113.5 is not one bearing
 * but a range. THE MODEL'S BEAK DOES NOT TAPER — beakShape() extrudes one plan
 * straight up and buttressDepthAt() has no height term at all, so in this model
 * the edge is the same 113.5 at every level and the only height dependence is the
 * step at the beak's head. Whether the BUILDING's pier tapers is a different
 * question, and this repository has no measurement of it: no source gives one and
 * the exterior photographs have not been read for it. It is therefore left alone
 * rather than assumed — but if it is ever measured it belongs exactly here, as a
 * second term in edgeToleranceDeg, and it would make this doubt larger and not
 * smaller.
 */
export function pierEdgeReading(
  azimuthDeg: number,
  outerWidth: number,
  b: ButtressPlan,
  outerRadius: number,
  aboveBeakHead: boolean,
): PierEdgeReading {
  const centreDeg = pierClearanceDeg(azimuthDeg, b)
  const halfDeg = outerWidth / 2 / outerRadius / DEG
  return {
    centreDeg,
    centreOffset: centreDeg * DEG * outerRadius,
    mouthDeg: centreDeg - halfDeg,
    blockedWidth: aboveBeakHead ? 0 : pierBlockedWidth(azimuthDeg, outerWidth, b, outerRadius),
    mouthWidth: outerWidth,
    toleranceDeg: b.edgeToleranceDeg,
    toleranceOffset: b.edgeToleranceDeg * DEG * outerRadius,
    aboveBeakHead,
    insideDatumError: !aboveBeakHead && Math.abs(centreDeg) <= b.edgeToleranceDeg,
  }
}

// ————————————————————————— fitting the reveal —————————————————————————

/**
 * The recorded inner sizes are UPPER BOUNDS, and the passage decides the rest.
 *
 * windows.json is explicit that they were never measured — "INNER sizes are NOT
 * measured at all: only one interior photograph of a slit exists, and it gives
 * proportion, not metres. They are modelled as a splay." So clamping them costs
 * no observation, whereas letting them stand costs geometry: a 1.5 m mouth on a
 * 4.7 m cheek spans 18.3° and the landing it opens off is 20.4° long, so a slit
 * placed anywhere but the middle of its landing cuts through the end cap into
 * whatever lies beyond — which for a stack of flights is the next tunnel.
 *
 * Height is the same argument with a harder bound: the clear light over a
 * landing is the passage's headroom, 2.30 m, and the recorded 2.4 m inner height
 * does not fit at any sill.
 */
export function fitReveal(
  wanted: { innerWidth: number; innerHeight: number; outerWidth: number; outerHeight: number },
  a: PassageEndAnchor,
  centreY: number,
  cfg: PassageOpeningCfg,
): { innerWidth: number; innerHeight: number; clampedWidth: boolean; clampedHeight: boolean } {
  const landingArcDeg = Math.abs(delta(a.capAzimuthDeg, a.treadAzimuthDeg))
  const halfDeg = Math.max(0, landingArcDeg / 2 - cfg.jambMarginDeg)
  const maxInnerWidth = 2 * a.cheekRadius * halfDeg * DEG
  const innerWidth = Math.min(wanted.innerWidth, maxInnerWidth)

  const halfHeight = Math.min(
    centreY - a.landingY,
    a.crownY - cfg.crownMargin - centreY,
  )
  const maxInnerHeight = Math.max(0, 2 * halfHeight)
  const innerHeight = Math.min(wanted.innerHeight, maxInnerHeight)

  return {
    innerWidth,
    innerHeight,
    clampedWidth: innerWidth < wanted.innerWidth - 1e-9,
    clampedHeight: innerHeight < wanted.innerHeight - 1e-9,
  }
}

// ——————————————————————————— the planner ———————————————————————————

export interface PlanPassageOpeningsInput {
  anchors: PassageEndAnchor[]
  fittings: OpeningFitting[]
  /** So an id can be built from the lift, not from an array position. */
  liftLabel: (flightIndex: number) => { from: number; to: number }
  cfg: PassageOpeningCfg
  buttress: ButtressPlan
  outerRadius: number
  /** World Y the buttress stops at — above it a radial ray is clear of the pier. */
  buttressTopY: number
  /** World Y of the top of the parapet: no wall above this to put an opening in. */
  towerTopY: number
}

/**
 * WHERE AN OPENING GOES, and it is one rule with no free parameter.
 *
 * CENTRED ON THE LANDING, cut RADIALLY through the passage's OUTER CHEEK.
 *
 * Not through the end cap. The cap is a plane of constant azimuth standing across
 * the tunnel, so a hole through it would run TANGENTIALLY: from the cheek at
 * r ≈ 4.7 to the drum face at 8.25 is √(8.25² − 4.7²) = 6.8 m of stone on that
 * bearing. That is not a slit, it is a mineshaft, and it would come out on the
 * drum some metres round from the landing it was meant to light. Cut radially
 * through the cheek instead and the masonry crossed is 2.5–3.5 m, the outer face
 * is straight in front of anyone standing on the landing, and the reveal widens
 * INWARD — which is what [ref] says the tower's openings do.
 *
 * That also means passageEnds.test.ts does not have to be turned inside out. Its
 * invariant — all twelve ends walled off, zero m² of cap looking into stone —
 * stays literally true. The owner's "at the end of the passage" is a PLACE, not
 * a surface.
 *
 * CENTRED, rather than pushed hard against the cap, because the mouth is nearly
 * as long as the landing (18.3° of mouth on a 20.4° landing at the lowest end)
 * and the middle is the only position that fits at every end. It is worth being
 * explicit that this is not a preference: pushing the slit outward to the cap is
 * what would be needed to bring the lower ends out of the buttress's shadow, and
 * that would be choosing a placement for its result.
 *
 * WHICH ENDS ARE OPEN IS NOT DECIDED HERE ANY MORE, and that is the change of
 * 2026-08-10's second statement.
 *
 * It used to be: an end is open unless the pier or the parapet is in the way.
 * That reads as geometry doing honest work, and it is not — it is a RULE
 * standing in for a FACT. The owner's second statement says the fact varies from
 * passage to passage, so no rule of any shape can produce it, and the rule this
 * file had produces a layout his sentence excludes: five passages open at the
 * head only, one open at the foot only, and NOT ONE open at both, when "both" is
 * the first case he names.
 *
 * So `open` decides and this arithmetic only checks:
 *
 *   open === false   shut, on the record's authority.
 *   open === true    cut, IF the check finds daylight. If it does not, nothing
 *                    is cut and a CONFLICT is raised — an opening into ten
 *                    metres of pier lights nothing, which the brief forbids
 *                    outright, and quietly cutting it would be worse than
 *                    quietly dropping it. Neither is done quietly.
 *   open === null    [PLACEHOLDER]. The check stands in, `decidedBy` says so,
 *                    and testimonyConflicts() keeps saying the record is empty.
 *
 * WHAT MUST NOT BE DONE ABOUT A MISMATCH, and it is left standing although the
 * particular mismatch it was written about has gone: turning STAIR.startAzimuthDeg
 * until a statement of the owner's comes true is fitting the building to the
 * claim, which is CLAUDE.md rule 7 exactly. A mismatch is published instead.
 *
 * [2026-08-13] The mismatch that stood here — no passage open at both ends, when
 * "both" is the first case he names — is gone, and how it went is the only thing
 * that makes its absence acceptable. He was asked a DIFFERENT question, about
 * where the stair stands relative to the buttress seen from above, and answered a
 * quarter turn clockwise. STAIR.startAzimuthDeg is derived from that now
 * (BUTTRESS.azimuthDeg + 90), five feet came out of the pier, and three passages
 * came out open at both ends. Nobody searched for an angle that produced it; had
 * it produced the contradiction again, the contradiction would have shipped
 * again. Read it as corroboration, never as a target.
 */
export function planPassageOpenings(input: PlanPassageOpeningsInput): PassageOpening[] {
  const { anchors, fittings, liftLabel, cfg, buttress, outerRadius } = input
  const out: PassageOpening[] = []

  for (const a of anchors) {
    const { from, to } = liftLabel(a.flightIndex)
    const id = passageEndId(from, to, a.end)
    const f = fittings.find((x) => x.id === id)
    if (!f) continue

    // centre of the landing arc, walked from the cap toward the treads
    const azimuthDeg = norm(a.capAzimuthDeg + delta(a.treadAzimuthDeg, a.capAzimuthDeg) / 2)
    const centreY = a.landingY + cfg.sillAboveLanding + f.outerHeight / 2
    const fitted = fitReveal(f, a, centreY, cfg)

    const aboveBeakHead = centreY > input.buttressTopY
    const buttressDepth = aboveBeakHead ? 0 : buttressDepthAt(azimuthDeg, buttress, outerRadius)
    const pier = pierEdgeReading(azimuthDeg, f.outerWidth, buttress, outerRadius, aboveBeakHead)

    /*
     * THE CHECK. Two things can make an end blind, and both are measurements of
     * the model rather than opinions about the building:
     *
     *  - the pier. A radial reveal on a bearing the beak covers ends inside ten
     *    metres of solid stone.
     *  - the parapet. The roof climb's head lands on the deck, and there is no
     *    wall over it to put a slit in — it is a door onto the roof already.
     */
    let blindBecause: PassageOpening['blindBecause']
    if (buttressDepth > 0) blindBecause = 'buttress'
    else if (centreY + f.outerHeight / 2 > input.towerTopY) blindBecause = 'parapet'
    const reachesDaylight = blindBecause === undefined

    const decidedBy: PassageOpening['decidedBy'] = f.open === null ? 'placeholder' : 'record'
    const built = f.open === false ? false : reachesDaylight
    const conflict: PassageOpening['conflict'] =
      f.open === true && !reachesDaylight ? 'openButBlind' : undefined

    out.push({
      ...a,
      id,
      passage: `${from}-${to}`,
      azimuthDeg,
      centreY,
      revealEndRadius: a.cheekRadius,
      outerWidth: f.outerWidth,
      outerHeight: f.outerHeight,
      innerWidth: fitted.innerWidth,
      innerHeight: fitted.innerHeight,
      head: f.head,
      barrierAt: f.barrierAt,
      solsticeAligned: f.solsticeAligned,
      open: f.open,
      openSaidBy: f.openSaidBy ?? undefined,
      reachesDaylight,
      blindBecause,
      buttressDepth,
      pier,
      built,
      decidedBy,
      conflict,
      clampedWidth: fitted.clampedWidth,
      clampedHeight: fitted.clampedHeight,
      note: f.note,
    })
  }
  return out
}

// ————————————————— the record against the model, said out loud —————————————————

/** How the two ends of one passage come out. The owner's own vocabulary. */
export type PassagePattern = 'both' | 'beginningOnly' | 'endOnly' | 'neither'

export interface PassageEndPair {
  passage: string
  flightIndex: number
  /** The foot — "вначале входа на лестницу", the beginning of the climb. */
  beginning: boolean
  /** The head — "в конце", the end of it. */
  end: boolean
  pattern: PassagePattern
}

/**
 * Each passage reduced to the shape the owner described it in.
 *
 * He named three cases: both ends, beginning only, end only. `neither` is the
 * fourth and he did not name it, which is a fact about the model to report and
 * not a rule to enforce — a passage with no opening at all is what the check
 * produces when the pier stands at one end and the parapet at the other.
 */
export function passageEndPairs(all: PassageOpening[]): PassageEndPair[] {
  const byPassage = new Map<string, PassageEndPair>()
  for (const o of all) {
    const e = byPassage.get(o.passage) ?? {
      passage: o.passage,
      flightIndex: o.flightIndex,
      beginning: false,
      end: false,
      pattern: 'neither' as PassagePattern,
    }
    if (o.end === 'foot') e.beginning = o.built
    else e.end = o.built
    byPassage.set(o.passage, e)
  }
  const out = [...byPassage.values()]
  for (const e of out) {
    e.pattern = e.beginning && e.end ? 'both' : e.beginning ? 'beginningOnly' : e.end ? 'endOnly' : 'neither'
  }
  return out
}

/** Ends the record opens and the geometry cannot light. */
export function openButBlindEnds(all: PassageOpening[]): PassageOpening[] {
  return all.filter((o) => o.conflict === 'openButBlind')
}

/** Ends nobody has ruled on. Twelve of twelve, as this ships. */
export function unresolvedEnds(all: PassageOpening[]): PassageOpening[] {
  return all.filter((o) => o.open === null)
}

/**
 * Ends whose existence the [OSM] trace cannot settle — see pierEdgeReading().
 *
 * ONE, AS THIS SHIPS, AND ONE IS THE DANGEROUS NUMBER. A single case reads like
 * a quirk of one opening and gets written into a comment; the reason it is a
 * function is that the next turn of STAIR_FROM_BUTTRESS_DEG will produce a
 * different one, and whoever makes that turn should be told by the model rather
 * than by rediscovering the arithmetic.
 */
export function openingsInsideDatumError(all: PassageOpening[]): PassageOpening[] {
  return all.filter((o) => o.pier.insideDatumError)
}

/**
 * Everywhere the model and the testimony disagree, as sentences.
 *
 * REPORTS, DOES NOT REPAIR. This is the function the dev console prints and the
 * tests assert against, and both exist for the same reason: the answer to "which
 * ends are open" is missing from the record, the model is standing in for it
 * with a geometric check, and the check produces a layout the owner's own words
 * exclude. Any of that can be fixed by asking him twelve questions
 * (see windows.json → openEndsQuestion). None of it may be fixed by turning
 * STAIR.startAzimuthDeg until the sentence comes true.
 */
export function testimonyConflicts(all: PassageOpening[]): string[] {
  const lines: string[] = []

  for (const o of openButBlindEnds(all)) {
    lines.push(
      `${o.id}: the record says this end is open (${o.openSaidBy ?? 'no source'}) but a radial ` +
        `reveal at azimuth ${o.azimuthDeg.toFixed(1)}° is blind — ` +
        (o.blindBecause === 'buttress'
          ? `${o.buttressDepth.toFixed(1)} m of solid buttress`
          : 'parapet above it, not wall') +
        '. Nothing is cut. Either the end is not this one, or STAIR.startAzimuthDeg is wrong.',
    )
  }

  /*
   * [OWNER] 2026-08-10: "в некоторых местах и вначале входа на лестницу и в
   * конце есть окна" — in SOME places there is one at the beginning AND one at
   * the end. So at least one passage has to come out `both`.
   *
   * This fired for three days and stopped on 2026-08-13, when the stair moved a
   * quarter turn on his separate testimony about the buttress and three passages
   * came out `both`. The check is kept, and kept in this shape, because it is now
   * the guard on an agreement rather than the report of a disagreement: if
   * anybody turns the stair, flips the winding or fills in the record such that
   * no passage has openings at both ends again, this says so on the next load.
   */
  const pairs = passageEndPairs(all)
  if (pairs.length > 0 && !pairs.some((p) => p.pattern === 'both')) {
    lines.push(
      `no passage has an opening at both ends: ${pairs
        .map((p) => `${p.passage} ${p.pattern}`)
        .join(', ')}. [OWNER] 2026-08-10 says some passages do. Which ones is ` +
        'unrecorded (windows.json → openEndsQuestion); the fallback check cannot ' +
        'produce one, and STAIR.startAzimuthDeg must not be turned until it can.',
    )
  }

  const unresolved = unresolvedEnds(all)
  if (unresolved.length > 0) {
    lines.push(
      `${unresolved.length} of ${all.length} passage ends carry no ruling on whether they are ` +
        `open (${unresolved.map((o) => o.id).join(', ')}). The daylight check is standing in.`,
    )
  }

  return lines
}

/**
 * The ends the [OSM] trace is too coarse to have ruled on, as sentences.
 *
 * A SEPARATE REPORT FROM testimonyConflicts(), AND THE SEPARATION IS THE POINT.
 * That one is about the RECORD: every line in it can be retired by asking the
 * owner a question, and a test asserts it falls silent once all twelve ends are
 * answered — "proof that the report is not always-on noise". Folding this in
 * would have broken that invariant and deserved to, because no answer of his can
 * retire this: he is not the person who can say where the beak's root meets the
 * drum to better than a fifth of a degree. Only a survey can, or the İçərişəhər
 * plans. So it is its own channel, it stays lit whatever the record says, and it
 * says out loud which way the model jumped while it could not tell.
 *
 * Both numbers in millimetres. Degrees at the fourth decimal place read as
 * precision — which is exactly how 113.5 came to be used as though it were one —
 * and 19 mm against 30 mm does not.
 */
export function datumWarnings(all: PassageOpening[]): string[] {
  return openingsInsideDatumError(all).map(
    (o) =>
      `${o.id}: ${o.built ? 'CUT' : 'withheld'} on a clearance of ` +
      `${o.pier.centreDeg.toFixed(3)}° from the pier's traced edge — ` +
      `${(o.pier.centreOffset * 1000).toFixed(0)} mm on the drum face, against a trace whose own ` +
      `nodes scatter ±${(o.pier.toleranceOffset * 1000).toFixed(0)} mm ` +
      `(±${o.pier.toleranceDeg.toFixed(3)}°). The [OSM] footprint does not decide whether this ` +
      'opening exists, and no testimony can: it is carried as uncertain rather than as a fact — ' +
      'see pierEdgeReading() and the caveat the viewer is shown. Its outer mouth also overlaps ' +
      `the root by ${(o.pier.blockedWidth * 1000).toFixed(0)} mm of ` +
      `${(o.pier.mouthWidth * 1000).toFixed(0)}, which measures the centring rule and not the tower.`,
  )
}

/** Problems with one end's record, before any geometry is involved. */
export function validateEndRecord(f: OpeningFitting): string[] {
  const errs: string[] = []
  if (f.open !== null && !f.openSaidBy) {
    errs.push(`${f.id}: open is ${f.open} with no source — say who says so`)
  }
  if (f.open === null && f.openSaidBy) {
    errs.push(`${f.id}: a source is recorded but open is still [PLACEHOLDER]`)
  }
  return errs
}

// ————————————————————————— scoring the photographs —————————————————————————

/** What eleven exterior frames established, kept as a yardstick. */
export interface PhotographicLadder {
  columns: Array<{ name: string; azimuthDeg: number | number[]; heightFractions: number[] }>
  separationDeg: number
  separationSpreadDeg: number
  count: number
}

/**
 * How far the derived layout stands from the photographed one.
 *
 * REPORTS, DOES NOT ASSERT. The photographs and the owner disagree about the
 * count and about the bearing, and the honest thing is to publish the residual
 * rather than to tune either until it vanishes. Every number here is a
 * subtraction; none of them feeds geometry.
 */
export function ladderResidual(
  all: PassageOpening[],
  ladder: PhotographicLadder,
  height: number,
): {
  count: number
  countResidual: number
  /** Foot-to-head bearing of one flight, ignoring the double-height 4→6. */
  separationDeg: number
  separationResidual: number
  rungSpacing: number
  photographedRungSpacing: number
  rungResidual: number
} {
  /*
   * THE SEPARATION IS A FLIGHT'S OWN SWEEP, which is why it cannot be tuned.
   *
   * The photographs measured how far apart the two columns of slits stand. Under
   * the owner's rule one column is the flights' feet and the other their heads,
   * so that distance IS the arc a flight turns through — and a flight's arc is
   * (rise / riser) × (going / midRadius), all four of them fixed by the storey
   * height and the stair's own dimensions. Measured over the flights that climb
   * one storey it is 89–105°, against 35 ± 6 photographed. Reaching 35 would need
   * a going of about 0.12 m, which is not a step.
   *
   * The 4→6 flight is left out because it spans two storey heights and sweeps
   * 160°, so including it would flatter neither reading.
   */
  const perFlight = new Map<number, { foot?: number; head?: number }>()
  for (const o of all) {
    const e = perFlight.get(o.flightIndex) ?? {}
    e[o.end] = o.azimuthDeg
    perFlight.set(o.flightIndex, e)
  }
  const sweeps: number[] = []
  for (const e of perFlight.values()) {
    if (e.foot === undefined || e.head === undefined) continue
    const sweep = Math.abs(delta(e.foot, e.head))
    // the double-height flight turns half again as far; excluded, see above
    if (sweep < 140) sweeps.push(sweep)
  }
  const separationDeg = sweeps.length
    ? sweeps.reduce((a, b) => a + b, 0) / sweeps.length
    : 0

  const built = all.filter((o) => o.built)
  const ys = built.map((o) => o.centreY).sort((p, q) => p - q)
  const rungSpacing = ys.length > 1 ? (ys[ys.length - 1] - ys[0]) / (ys.length - 1) : 0

  const fracs = ladder.columns.flatMap((c) => c.heightFractions).sort((p, q) => p - q)
  const photographedRungSpacing =
    fracs.length > 1 ? ((fracs[fracs.length - 1] - fracs[0]) / (fracs.length - 1)) * height : 0

  return {
    count: built.length,
    countResidual: built.length - ladder.count,
    separationDeg,
    separationResidual: separationDeg - ladder.separationDeg,
    rungSpacing,
    photographedRungSpacing,
    rungResidual: rungSpacing - photographedRungSpacing,
  }
}

// ——————————— the photographed pattern, re-measured from the frames ———————————

/**
 * ONE RUNG OF THE LADDER THE EXTERIOR FRAMES ACTUALLY SHOW, in the one unit
 * that borrows no datum from anybody: DRUM RADII, COUNTED DOWN FROM THE CROWN.
 *
 * `photographicLadder` above states the same eight slits as fractions of the
 * tower's HEIGHT, and that is why its numbers and these do not agree. A fraction
 * of the height needs two things the frames do not supply: where the ground is,
 * and how tall the tower is above it. On the beak side the ground is not where
 * [ICOMOS]'s 29.5 m is measured from — the frames put the drum's visible foot
 * 4.2–4.4 radii below the crown, which is 34.7–36.3 m if the drum is the
 * documented 16.5 m across, so the old fractions were divided by a span some
 * six metres too long and every slit came out too low on the tower.
 *
 * Below-crown-in-radii needs neither. The crown is visible in every frame and
 * the radius is what the camera fit measures the drum to be, so the same number
 * can be computed for the model — (topY − centreY) / outerRadius — with nothing
 * assumed on either side. That is the whole reason this shape exists.
 */
export interface PhotographedRung {
  /** Which storey's landing level this rung stands at. See patternResidual(). */
  storey: number
  /** (crown − rung) ÷ drum radius. Measured, not derived from any storey table. */
  belowCrownRadii: number
  /**
   * ° from the camera's own bearing, in one named frame. NOT an azimuth: no
   * frame in this corpus fixes its own bearing better than about ±20°, so only
   * DIFFERENCES between rungs in the same frame are worth anything.
   */
  deltaDeg: number
}

/** What the frames measure, as a whole. Every field is a measurement. */
export interface PhotographedPattern {
  /** The frames it was measured on. Named, so a reading can be re-run. */
  frames: string[]
  count: number
  rungs: PhotographedRung[]
  /** ° between the two columns' mean bearings. */
  separationDeg: number
  /** ° of spread in that figure across frames and camera distances. */
  separationSpreadDeg: number
  /** ° the bearing jumps between two adjacent rungs, and above which storey. */
  bearingJumpDeg: number
  bearingJumpAboveStorey: number
  /** ° the upper column drifts over its four rungs. */
  upperColumnDriftDeg: number
  /** ° of spread in the lower column — how nearly it is one vertical generator. */
  lowerColumnSpreadDeg: number
  /** Drum radii between rungs, over the storeys both patterns have. */
  rungPitchRadii: number
  /** How near a model level must come to count as the same rung. */
  matchToleranceRadii: number
}

/**
 * Where the model puts an opening, measured the same way: down from the crown,
 * in drum radii. Distinct levels only — three landings carry two openings each,
 * and a pair 92° apart is ONE rung of a ladder seen in elevation, not two.
 */
export function crownRelativeLevels(
  all: PassageOpening[],
  topY: number,
  outerRadius: number,
): number[] {
  const seen: number[] = []
  for (const o of all) {
    if (!o.built) continue
    const v = (topY - o.centreY) / outerRadius
    if (!seen.some((w) => Math.abs(w - v) < 1e-6)) seen.push(v)
  }
  return seen.sort((a, b) => a - b)
}

/**
 * How far the built layout stands from the pattern the frames measure.
 *
 * REPORTS, DOES NOT ASSERT, exactly like ladderResidual() — and it exists
 * beside that function rather than replacing it because they are scored on
 * different rulers and both rulers should stay visible. ladderResidual() asks
 * how the model compares with the reading that was in the file; this asks how it
 * compares with the frames re-measured through a fitted camera. Where they
 * disagree the disagreement is about the RULER, and that is worth being able to
 * see rather than having quietly replaced.
 */
export function patternResidual(
  all: PassageOpening[],
  pattern: PhotographedPattern,
  topY: number,
  outerRadius: number,
): {
  count: number
  countResidual: number
  levels: number[]
  matched: Array<{ storey: number; photographed: number; model: number; residual: number }>
  /** Photographed rungs with no model level near them. The real gap. */
  unmatchedStoreys: number[]
  worstMatchedResidual: number
  /** Drum radii per storey, over the storeys both patterns reach. */
  pitchRadii: number
  photographedPitchRadii: number
  pitchResidualRadii: number
} {
  const levels = crownRelativeLevels(all, topY, outerRadius)
  const matched: Array<{ storey: number; photographed: number; model: number; residual: number }> = []
  const unmatchedStoreys: number[] = []
  for (const r of pattern.rungs) {
    let best: number | undefined
    for (const v of levels) {
      if (best === undefined || Math.abs(v - r.belowCrownRadii) < Math.abs(best - r.belowCrownRadii)) {
        best = v
      }
    }
    if (best === undefined || Math.abs(best - r.belowCrownRadii) > pattern.matchToleranceRadii) {
      unmatchedStoreys.push(r.storey)
      continue
    }
    matched.push({
      storey: r.storey,
      photographed: r.belowCrownRadii,
      model: best,
      residual: best - r.belowCrownRadii,
    })
  }

  /*
   * PITCH OVER THE STOREYS BOTH PATTERNS REACH, and taken end to end rather than
   * as a mean of gaps. End to end is immune to a rung the model does not have —
   * the storey-5 exit sits between two matched levels and drops out of the
   * subtraction — and to the ±0.03 radii of scatter on any single rung, which a
   * mean of seven small differences would carry straight through.
   */
  const hi = matched.reduce((a, b) => (b.storey > a.storey ? b : a), matched[0])
  const lo = matched.reduce((a, b) => (b.storey < a.storey ? b : a), matched[0])
  const span = hi && lo ? hi.storey - lo.storey : 0
  const pitchRadii = span > 0 ? (lo.model - hi.model) / span : 0
  const photographedPitchRadii = span > 0 ? (lo.photographed - hi.photographed) / span : 0

  const built = all.filter((o) => o.built).length
  return {
    count: built,
    countResidual: built - pattern.count,
    levels,
    matched,
    unmatchedStoreys,
    worstMatchedResidual: matched.reduce((m, r) => Math.max(m, Math.abs(r.residual)), 0),
    pitchRadii,
    photographedPitchRadii,
    pitchResidualRadii: pitchRadii - photographedPitchRadii,
  }
}

/*
 * ————————————————— THE SWEEP AND THE DRIFT ARE ONE QUANTITY —————————————————
 *
 * The three functions below exist to settle an argument the file was losing on
 * the wrong ground. `reconciliation` → `different-sweep` said a flight might
 * sweep 35° instead of 97°, and it was answered with "then the tread would be
 * 0.12 m, which is not a tread". That answer is weak, and it is weak in a way
 * that invites the next reader to push back: STAIR.goingTarget is marked
 * [ASSUMPTION] and not in any source, endLandingLength is an [ESTIMATE], and the
 * walking line's radius is a model choice too. Three soft numbers is not a
 * refutation, it is an invitation.
 *
 * THE PHOTOGRAPH REFUTES IT WITHOUT THEM. Stack flights of equal rise at one
 * bearing and their far ends do not stand in a vertical line — the wall thins
 * with height, the walking line moves outward, and a flight of the same rise and
 * the same tread sweeps LESS arc higher up. So the column of far ends leans, and
 * by exactly
 *
 *     drift  =  sweep × (1 − r_low / r_high)
 *
 * because a flight's arc is (number of treads × going) ÷ r, and the number of
 * treads and the going are the same for every equal-rise flight. THE TREAD, THE
 * RISER AND THE WALKING RADIUS ALL CANCEL in that ratio: only the taper survives,
 * and the taper is docs-sourced (5.0 m at the base, 3.7 m at the top).
 *
 * So a measured lean measures a sweep, with no assumption in the chain. The
 * frames measure the upper column leaning 5.1° per storey. That needs a sweep
 * near 176°. A 35° sweep would lean 1.02°. The reading `different-sweep` asks for
 * is refuted BY THE SAME PHOTOGRAPH IT WAS DRAWN FROM, five times over, and the
 * refutation survives any tread a person could climb.
 *
 * It does not rescue the model either, and that must be said in the same breath:
 * the model's flights lean 2.3–3.1° per storey against 5.1 measured. Both
 * readings are wrong on this quantity; one is wrong by a factor of two and the
 * other by a factor of five.
 *
 * Reporting only. No caller places anything from these.
 */

/**
 * The rigid coupling: what fraction of a flight's sweep a stacked column of its
 * far ends drifts, over the whole span between the two radii.
 *
 * `rLow` and `rHigh` are the walking-line radii of the lowest and highest flight
 * in the column. Independent of tread, riser and rise.
 */
export function driftPerSweep(rLow: number, rHigh: number): number {
  if (rLow <= 0 || rHigh <= 0) throw new Error('radii must be positive')
  return 1 - rLow / rHigh
}

/**
 * Invert it: the sweep a measured drift implies. The one way a photograph can
 * measure a stair's sweep without anybody guessing a tread.
 *
 * `storeys` is how many storey gaps the drift was measured over, so the answer
 * is in the same per-storey units as the measurement.
 */
export function sweepFromDrift(
  driftPerStoreyDeg: number,
  rLow: number,
  rHigh: number,
  storeys: number,
): number {
  if (storeys <= 0) throw new Error('storeys must be positive')
  const perStorey = driftPerSweep(rLow, rHigh) / storeys
  if (perStorey <= 0) return Number.POSITIVE_INFINITY
  return driftPerStoreyDeg / perStorey
}

/** How much of a foot-to-head separation is the climb, and how much is not. */
export interface SeparationParts {
  /** Foot opening to head opening, degrees. */
  totalDeg: number
  /** The risers alone — the only part that is (rise/riser) × (going/r). */
  climbDeg: number
  /** The two end landings. STAIR.endLandingLength is an [ESTIMATE], 0.9 m. */
  landingDeg: number
  /** The openings standing clear of the flight's ends. A rule, not a dimension. */
  clearanceDeg: number
  /** Fraction of the separation that is not the climb. */
  notFromTheClimb: number
}

/**
 * Split a modelled foot-to-head separation into its three parts.
 *
 * WHY IT IS WORTH A FUNCTION. windows.json used to state that the separation is
 * "(rise / riser) × (going / midRadius)" and therefore "not a free parameter".
 * THAT IS WRONG, and this measures by how much: of the 104.5° the model puts
 * between foot-2-3 and head-2-3, 64.3° is the climb, 20.1° is the two end
 * landings and 20.1° is planPassageOpenings holding each opening clear of the
 * flight's last tread. Two fifths of the disagreement is estimate and rule.
 *
 * It still does not rescue `different-sweep`: strip both and 64.3° remains
 * against 35.3° measured. But the file said something untrue in its own defence,
 * and the correction belongs where the claim was made.
 */
export function separationParts(input: {
  totalDeg: number
  /** First tread to last tread, degrees. */
  flightArcDeg: number
  /** The part of that arc spent on the two flat end landings. */
  landingArcDeg: number
}): SeparationParts {
  const climbDeg = input.flightArcDeg - input.landingArcDeg
  const clearanceDeg = input.totalDeg - input.flightArcDeg
  return {
    totalDeg: input.totalDeg,
    climbDeg,
    landingDeg: input.landingArcDeg,
    clearanceDeg,
    notFromTheClimb: input.totalDeg > 0 ? 1 - climbDeg / input.totalDeg : 0,
  }
}

/** Problems that should stop an opening being cut. Data, not exceptions. */
export function validatePassageOpening(o: PassageOpening): string[] {
  /*
   * AN END WITH NO WALL OVER IT HAS NO SHAPE TO CHECK, and asking these questions
   * of one produces noise, not a finding.
   *
   * `parapet` means the landing is the roof deck: 0.751 m of masonry stands over
   * it and a 1.9 m slit does not fit in that at any sill. The planner has said so
   * already, in `blindBecause`, and nothing is cut. Re-reporting it here as "head
   * above the passage vault" is the same fact wearing a second hat, and it would
   * make an honest model fail its own validator.
   *
   * It surfaced on 2026-08-10 only because stairPassageSections() stopped putting
   * this end's crown at 29.049 — 1.55 m above the top of the tower. The reveal was
   * being measured against a vault in mid-air and of course it fitted. `buttress`
   * is deliberately NOT excused the same way: there the masonry is real and the
   * opening's shape is real, it is only what lies beyond it that is solid.
   */
  if (o.blindBecause === 'parapet') return []

  const errs: string[] = []
  if (o.outerWidth <= 0 || o.outerHeight <= 0) errs.push(`${o.id}: outer size must be positive`)
  if (o.innerWidth <= o.outerWidth) errs.push(`${o.id}: does not flare inward`)
  if (o.innerHeight < o.outerHeight) errs.push(`${o.id}: inner height below outer height`)
  if (o.revealEndRadius <= 0) errs.push(`${o.id}: reveal ends at or inside the axis`)
  if (o.centreY - o.outerHeight / 2 < o.landingY) {
    errs.push(`${o.id}: sill below the landing it opens off`)
  }
  if (o.centreY + o.outerHeight / 2 > o.crownY) {
    errs.push(`${o.id}: head above the passage vault`)
  }
  return errs
}

// ————————————————— the steps up to the slit —————————————————

/**
 * One branch: the short flight from a landing up into the slit's embrasure.
 *
 * PLACED BY THE OPENING AND BY NOTHING ELSE, which is the same law that governs
 * the openings themselves. The flight runs out along the opening's own radius,
 * starts at the passage's outer cheek — where the reveal starts — and its top
 * tread is the reveal's floor. So it cannot end up on a bearing the reveal is
 * not on, at a height the reveal is not at, or in a wall the reveal is not in;
 * this model has lost a floor twice to a pair of features placed from two
 * arithmetics and the branch is not going to be the third.
 */
export interface PassageBranch {
  /** The opening's id — the branch has no identity of its own. */
  id: string
  azimuthDeg: number
  /** Where the flight starts: the passage's outer cheek, the reveal's own start. */
  faceRadius: number
  landingY: number
  /** World Y of the top tread = the floor of the reveal, as the shell cut it. */
  platformY: number
  stepCount: number
  riser: number
  going: number
  depth: number
  coverBeyond: number
  depthLimitedByWall: boolean
  treads: EmbrasureTread[]
}

export interface PlanPassageBranchesInput {
  /** Only ends that are actually cut get one; an uncut end has nothing to climb to. */
  openings: PassageOpening[]
  /** Ends the record says carry a branch. See PASSAGE_OPENING.branchAtEnds. */
  atEnds: readonly string[]
  /** Risers between the landing and the embrasure floor. [VIDEO], counted. */
  stepCount: number
  /** m — tread depth going into the wall. [ESTIMATE], borrowed from WINDOW_EMBRASURE. */
  going: number
  /** m of stone that must survive under the slit, beyond the back of the flight. */
  outerLeaf: number
  /** The drum's outer radius, so the stone outboard of each cheek can be measured. */
  outerRadius: number
}

/**
 * A branch at every end that carries a slit and is named in the record.
 *
 * THE STONE EACH ONE MAY EAT INTO is the wall outboard of that end's OWN cheek,
 * `outerRadius − cheekRadius`, and not wallThicknessAt(y). The distinction is
 * the one embrasure.ts spells out and it is not pedantry: a recess off a chamber
 * floor starts at the room face and has the whole wall; a branch off a landing
 * starts where the passage has already been driven and has only what is left
 * beyond it. That is 3.535 m at the foot of 2→3 and 2.668 m at the top, against
 * a wall of 4.855 and 3.820 — so using the wall would let a flight take stone
 * the stair has already taken.
 */
export function planPassageBranches(input: PlanPassageBranchesInput): PassageBranch[] {
  const named = new Set(input.atEnds)
  const out: PassageBranch[] = []
  for (const o of input.openings) {
    if (!o.built || !named.has(o.id)) continue
    // the floor of the reveal AS FITTED — the same number the shell is cut with
    const embrasureFloorY = o.centreY - o.innerHeight / 2
    const plan = planSillBranch(
      o.landingY,
      embrasureFloorY,
      input.stepCount,
      input.going,
      input.outerRadius - o.cheekRadius,
      input.outerLeaf,
    )
    if (!plan) continue
    out.push({
      id: o.id,
      azimuthDeg: o.azimuthDeg,
      faceRadius: o.cheekRadius,
      landingY: plan.landingY,
      platformY: plan.platformY,
      stepCount: plan.stepCount,
      riser: plan.riser,
      going: plan.going,
      depth: plan.depth,
      coverBeyond: plan.coverBeyond,
      depthLimitedByWall: plan.depthLimitedByWall,
      treads: sillBranchTreads(plan, o.cheekRadius),
    })
  }
  return out
}

/**
 * Ends that carry a slit, are named in the record, and got no branch anyway.
 *
 * Reported rather than swallowed, for the reason every other check in this file
 * exists: planSillBranch() returns null when the landing is already at the
 * embrasure floor or when the wall outboard of the cheek cannot take a flight,
 * and a branch that quietly fails to appear is indistinguishable from one nobody
 * asked for.
 */
export function branchesDeclined(
  openings: PassageOpening[],
  atEnds: readonly string[],
  built: PassageBranch[],
): string[] {
  const named = new Set(atEnds)
  const have = new Set(built.map((b) => b.id))
  return openings.filter((o) => o.built && named.has(o.id) && !have.has(o.id)).map((o) => o.id)
}
