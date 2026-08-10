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
 * WHAT MUST NOT BE DONE ABOUT THE MISMATCH: STAIR.startAzimuthDeg is 100 and is
 * itself a [PLACEHOLDER]. Turning it until the feet clear the buttress would
 * make the owner's sentence come true by moving the building, which is CLAUDE.md
 * rule 7 exactly. The mismatch is published instead.
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
   * the end. So at least one passage has to come out `both`. None does, and it
   * is not a near miss: the five feet that would make it stand at azimuth
   * 108.7–110.2 with the buttress root arc running 72.7–113.5 [OSM].
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
