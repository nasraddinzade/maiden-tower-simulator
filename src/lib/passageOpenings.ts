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
 * [OWNER]. He is Azerbaijani, he has walked the building, and this is testimony
 * rather than a survey — but it outranks every photographic reading in this
 * repository, all of which are inferences from exterior frames about a thing
 * the photographs cannot see: which side of the wall an opening belongs to.
 *
 * WHAT THIS MODULE THEREFORE IS. An opening in the tower no longer carries its
 * own azimuth or its own height. Both are properties of the stair: a slit sits
 * at the end of a passage, so it is wherever that end is. src/data/windows.json
 * keeps what the stair cannot say — how big the hole is, how its head is
 * finished, which ends are open — and nothing else.
 *
 * Three-js-free on purpose (CLAUDE.md rule 6): every judgement here is arithmetic
 * and every one of them is tested.
 */

import type { PassageSection, StepPlacement } from './staircase'

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
   * Whether this end carries an opening.
   *
   * `null` is [PLACEHOLDER] — "nobody has ruled on this one" — and is what every
   * end ships as. The planner then decides by the rules below, which can only
   * ever REMOVE an opening (no daylight, no wall above it); `false` forces one
   * shut and `true` cannot force one open where the geometry says it lights
   * nothing.
   */
  built: boolean | null
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
  /** True when this end is actually cut. */
  built: boolean
  /** Why not, where not. */
  blockedBy?: 'buttress' | 'parapet' | 'closedInData'
  /** Metres of solid buttress a radial ray must cross here. 0 is daylight. */
  buttressDepth: number
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

    const buttressDepth =
      centreY > input.buttressTopY ? 0 : buttressDepthAt(azimuthDeg, buttress, outerRadius)

    /*
     * Two rules can take an opening away, and both are geometry rather than
     * choice. Nothing can ADD one: an end the data closes stays closed.
     *
     *  - the pier. A radial reveal on a bearing the beak covers ends inside ten
     *    metres of solid stone. The brief forbids openings that light nothing.
     *  - the parapet. The roof climb's head lands on the deck, and there is no
     *    wall over it to put a slit in — it is a door onto the roof already.
     */
    let built = f.built !== false
    let blockedBy: PassageOpening['blockedBy']
    if (f.built === false) {
      built = false
      blockedBy = 'closedInData'
    } else if (buttressDepth > 0) {
      built = false
      blockedBy = 'buttress'
    } else if (centreY + f.outerHeight / 2 > input.towerTopY) {
      built = false
      blockedBy = 'parapet'
    }

    out.push({
      ...a,
      id,
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
      built,
      blockedBy,
      buttressDepth,
      clampedWidth: fitted.clampedWidth,
      clampedHeight: fitted.clampedHeight,
      note: f.note,
    })
  }
  return out
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

/** Problems that should stop an opening being cut. Data, not exceptions. */
export function validatePassageOpening(o: PassageOpening): string[] {
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
