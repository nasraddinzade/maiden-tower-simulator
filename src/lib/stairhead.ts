/**
 * THE HEAD-HOUSE over the roof stairwell — the wedge you come out of.
 *
 * WHAT IT IS, off the footage. A structure of sawn ashlar standing on the
 * terrace either side of the stair's opening in the paving, its two cheeks raked
 * to a straight arris, with an inclined glazed light lying on that arris and a
 * stainless threshold profile set flush in the slabs at the way out. up/241 and
 * up/242 show the whole wedge in profile with a man beside it; up/250, roof/008
 * and roof/009 show the ashlar and the capping close to; c. up/243 and up/241
 * show the lantern's foot landing ON the paving at the low end; roof/007 and
 * down/001 stand on the threshold looking down the stair, and down/003 shows
 * where the glass runs out and the paving takes over as the lintel.
 *
 * NOTHING HERE IS A NEW DIMENSION AND THAT IS THE POINT. Commit 5a648b0 recorded
 * this as the one unbuilt thing on the terrace and said why it was scope rather
 * than evidence: its PLAN is the opening already cut in the deck, and its RAKE
 * is the clear height the stair already keeps. Both are computed elsewhere and
 * both are passed in. What this module owns is the arithmetic between them.
 *
 * THE SOFFIT IS A CHORD, NOT AN OFFSET OF THE STAIR, and it is worth saying why
 * because the two are not the same surface and the difference is visible.
 *
 * The stair's own ceiling is `tread + headroom`, which is what the passage is
 * vaulted to under the paving. Carried on above the deck that surface is not a
 * plane: the roof climb has a landing in it — five level treads at 25.109, and a
 * level head platform of four more at deck level — and over a landing an offset
 * surface goes flat. Drawn that way the wedge's arris would read rake, flat,
 * rake, flat. Every frame that shows it shows ONE straight line from the apex to
 * the paving (up/241, up/243, roof/009), so the model draws one straight line:
 * the chord from `deckY + headroom` at the way out down to `deckY` where the
 * opening ends. Its slope is the stair's mean gradient across the opening, which
 * is the only sense in which a single plane can follow a stair that has landings
 * in it.
 *
 * WHAT THE CHORD COSTS, stated rather than discovered later. It does not hold
 * `headroom` over every tread the way the vault does. Measured on the shipped
 * configuration the clear height under it runs 1.86…2.63 m, with the minimum
 * over the last riser, where the walker steps up onto the head platform — see
 * stairheadClearance(), which is what the test asserts. That is 0.26 m over a
 * 1.60 m walker and it is not a defect of the chord: it is what a straight rake
 * costs, and the alternative — a plane parallel to the nosings that clears every
 * tread by 2.30 — stands 3.14 m above the paving at the way out, against the
 * 2.1 ± 0.2 m the frames measure. The chord's apex is 2.30 m. The frames were
 * read against the man in up/242 by the ratio method this repo uses everywhere
 * (see the note at STAIRHEAD in config/tower.ts); 2.30 sits one sigma above the
 * reading and the parallel plane sits five.
 */

import { radialYaw, rotate, yawThenPitch, type BoxSpec } from './collision'
import type { StepPlacement } from './staircase'

const DEG = Math.PI / 180

/**
 * ° — how finely the wedge is described round the drum.
 *
 * It is the paving's own lathe step (96 segments), and it is here rather than in
 * either caller because the drawn wedge and its colliders have to agree: a
 * collider chain coarser than the stone it stands on leaves a scallop of arc at
 * every joint where a walker can put a shoulder into the glass. Same argument,
 * same number, as the angular step stairwellCutTools() is given for the hole
 * this thing stands on the edge of.
 */
export const STAIRHEAD_ARC_DEG = 360 / 96

/** The opening in the paving, exactly as FloorStructures' StairwellCut gives it. */
export interface StairheadOpening {
  centreAzimuthDeg: number
  widthDeg: number
  innerRadius: number
  outerRadius: number
}

/** Everything the head-house is built of that is not the opening or the stair. */
export interface StairheadSpec {
  /** m — thickness of each cheek wall, outboard of the opening's own edge. */
  cheekThickness: number
  /** m — thickness of the lantern's sheet. */
  glazingThickness: number
  /** m — the metal profile along the lantern's two rakes and its eaves. */
  frameWidth: number
  /** m — the stainless threshold profile, across the way out. */
  thresholdWidth: number
}

export interface Stairhead {
  /** Azimuth of the way OUT: the end of the opening the stair's head is at. */
  exitAzimuthDeg: number
  /** Azimuth where the raking soffit comes back down onto the paving. */
  footAzimuthDeg: number
  /** m — the opening's own inner radius; the inner cheek stands inboard of it. */
  innerRadius: number
  /** m — the opening's own outer radius; the outer cheek stands outboard. */
  outerRadius: number
  /** World Y of the paving the wedge stands on. */
  deckY: number
  /** m — how far the soffit stands above the paving at the way out. */
  rise: number
}

/**
 * Which end of the opening is the way out, and how tall the wedge is there.
 *
 * THE EXIT IS THE END THE STAIR'S HEAD IS AT and it is found rather than
 * assumed. The winding of this stair is a config value and has been argued over;
 * an `exitAzimuthDeg = centre − width/2` written here would be right for one
 * winding and would put the wedge's apex at the bottom of the flight for the
 * other, with the glass lying on the paving over the way out. So the last tread
 * is passed in and the nearer edge of the opening wins.
 *
 * Returns null where there is nothing to build: no opening, no steps, or a rise
 * of nothing. A head-house of zero height is not a small head-house, it is a
 * flat sheet of glass lying in the paving, and the caller should draw neither.
 */
export function stairhead(
  opening: StairheadOpening | undefined,
  steps: StepPlacement[],
  deckY: number,
  /** Clear height the stair keeps — PLAYER.stairHeadroom at the call site. */
  headroom: number,
): Stairhead | null {
  if (!opening || opening.widthDeg <= 0 || steps.length === 0) return null
  if (opening.outerRadius <= opening.innerRadius) return null
  if (headroom <= 0) return null

  const half = opening.widthDeg / 2
  const edges = [opening.centreAzimuthDeg - half, opening.centreAzimuthDeg + half]
  const headAz = steps[steps.length - 1].azimuthDeg
  const exit =
    Math.abs(edges[0] - headAz) <= Math.abs(edges[1] - headAz) ? edges[0] : edges[1]
  const foot = exit === edges[0] ? edges[1] : edges[0]

  return {
    exitAzimuthDeg: exit,
    footAzimuthDeg: foot,
    innerRadius: opening.innerRadius,
    outerRadius: opening.outerRadius,
    deckY,
    rise: headroom,
  }
}

/**
 * World Y of the wedge's underside at an azimuth.
 *
 * Linear between the two ends and CLAMPED outside them, so nothing that samples
 * it off the end of the opening gets a soffit under the paving or one climbing
 * away over the terrace. It is a function of azimuth only — the surface is ruled
 * by horizontal radial lines, which is why a flat sheet of glass can lie on it
 * and why a collider box pitched about its own radial axis sits on it exactly.
 */
export function stairheadSoffitY(h: Stairhead, azimuthDeg: number): number {
  const span = h.footAzimuthDeg - h.exitAzimuthDeg
  if (Math.abs(span) < 1e-9) return h.deckY + h.rise
  const t = (azimuthDeg - h.exitAzimuthDeg) / span
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t
  return h.deckY + h.rise * (1 - clamped)
}

/** One sample across the wedge: an azimuth and the soffit over it. */
export interface StairheadRib {
  azimuthDeg: number
  soffitY: number
}

/**
 * The wedge sampled across its length, exit end first.
 *
 * `maxArcDeg` is the angular step of the surface the wedge stands on, passed in
 * for the same reason stairwellCutTools() takes it: the cheeks are arcs of the
 * same drum as the paving, and a wedge described more coarsely than the stone
 * under it leaves a scallop of daylight along its foot.
 */
export function stairheadRibs(h: Stairhead, maxArcDeg: number): StairheadRib[] {
  const span = h.footAzimuthDeg - h.exitAzimuthDeg
  const pieces = Math.max(1, Math.ceil(Math.abs(span) / Math.max(1e-6, maxArcDeg)))
  const out: StairheadRib[] = []
  for (let i = 0; i <= pieces; i += 1) {
    const az = h.exitAzimuthDeg + (span * i) / pieces
    out.push({ azimuthDeg: az, soffitY: stairheadSoffitY(h, az) })
  }
  return out
}

/**
 * The tightest the wedge comes to a tread, and where.
 *
 * Only treads UNDER the wedge count — a tread out past the foot has the paving
 * over it, not the glass, and the paving's own clearance is the passage cutter's
 * business (it is clamped to ROOF.masonryTopY and is a different number).
 *
 * Returned rather than asserted here so the test can state the property and the
 * dev console can print the figure: this is the number that decides whether a
 * visitor can walk out, and it must never be somewhere only a test can see it.
 */
export function stairheadClearance(
  h: Stairhead,
  steps: StepPlacement[],
): { minimum: number; azimuthDeg: number; treadY: number } | null {
  const lo = Math.min(h.exitAzimuthDeg, h.footAzimuthDeg)
  const hi = Math.max(h.exitAzimuthDeg, h.footAzimuthDeg)
  let best: { minimum: number; azimuthDeg: number; treadY: number } | null = null
  for (const s of steps) {
    if (s.azimuthDeg < lo - 1e-9 || s.azimuthDeg > hi + 1e-9) continue
    const clear = stairheadSoffitY(h, s.azimuthDeg) - s.treadY
    if (!best || clear < best.minimum) {
      best = { minimum: clear, azimuthDeg: s.azimuthDeg, treadY: s.treadY }
    }
  }
  return best
}

/** The two cheeks, as radial bands. The wedge stands OUTSIDE the opening. */
export interface StairheadCheek {
  innerRadius: number
  outerRadius: number
  /** Which side of the well it is on, for anything that needs to tell them apart. */
  side: 'inner' | 'outer'
}

/**
 * THE CHEEKS STAND ON PAVING, NOT OVER THE HOLE, which is the whole of their
 * plan and the reason their thickness is not a measurement.
 *
 * The opening runs from `innerRadius` to `outerRadius`; a wall bedded anywhere
 * inside that band stands on air. So each cheek is laid outboard of its own edge
 * of the well — the inner one inward, the outer one outward — and what is left
 * to choose is how thick.
 *
 * It is not chosen. On the inner side there is exactly one answer: the well's
 * inner edge is `innerRadiusAt(deckY) + STAIR.wallClearance` and the paving's own
 * inner rim is `innerRadiusAt(deckY)`, so the strip of stone between the hole and
 * the storey-8 room face is STAIR.wallClearance wide and the wall fills it. A
 * thinner cheek leaves a ledge of paving hanging over the room; a thicker one
 * stands out over the room face with nothing under it. See STAIRHEAD in
 * config/tower.ts for the reading that says the outer cheek is the same wall
 * built twice.
 */
export function stairheadCheeks(h: Stairhead, spec: StairheadSpec): StairheadCheek[] {
  const t = Math.max(0.01, spec.cheekThickness)
  return [
    { innerRadius: Math.max(0.05, h.innerRadius - t), outerRadius: h.innerRadius, side: 'inner' },
    { innerRadius: h.outerRadius, outerRadius: h.outerRadius + t, side: 'outer' },
  ]
}

/**
 * Colliders: two walls and a roof.
 *
 * WHY THE ROOF NEEDS ONE AT ALL, since nobody walks on a stairhead. The deck's
 * collider has a HOLE in it over the whole opening (see TowerColliders' note on
 * stairwell.outerRadius). At the foot of the wedge the soffit is at deck level,
 * so from the terrace the opening's far end is a knife edge in the paving with
 * nothing standing on it — walk onto it and you drop into the stairwell through
 * glass that is drawn and not there. The lantern is a real surface you can put a
 * hand on, which is this model's own test for whether a thing gets a collider,
 * and it is also the lid on that hole.
 *
 * The roof boxes are pitched about their own RADIAL axis, which is exact rather
 * than approximate: the soffit is ruled by horizontal radial lines, so a plane
 * containing one of them can lie on the surface. What it cannot do is match the
 * tangential slope at every radius at once — the slope goes as 1/r — and over
 * the box's 1.5 m of radial reach that is 0.018 m at the corners, which is a
 * fifth of the glass's own thickness.
 */
export function stairheadColliders(
  h: Stairhead,
  spec: StairheadSpec,
  /** Angular step; the same one the ribs are cut at. */
  maxArcDeg: number,
): BoxSpec[] {
  const out: BoxSpec[] = []
  const ribs = stairheadRibs(h, maxArcDeg)
  if (ribs.length < 2) return out
  const cheeks = stairheadCheeks(h, spec)
  /*
   * The roof's build-up is the frame's own depth, not the glass's. A 15 mm
   * cuboid is a collider a fast walker can pass through in one step, and the
   * thing being described is a glazed light sitting in a metal frame, so the
   * frame is what is thick there. The glass is drawn at its own thickness.
   */
  const roofThickness = Math.max(spec.frameWidth, spec.glazingThickness)

  for (let i = 0; i < ribs.length - 1; i += 1) {
    const a0 = ribs[i]
    const a1 = ribs[i + 1]
    const midAz = (a0.azimuthDeg + a1.azimuthDeg) / 2
    const rad = midAz * DEG
    const spanDeg = Math.abs(a1.azimuthDeg - a0.azimuthDeg)
    const soffit = stairheadSoffitY(h, midAz)

    for (const cheek of cheeks) {
      const height = soffit - h.deckY
      if (height <= 1e-4) continue
      const mid = (cheek.innerRadius + cheek.outerRadius) / 2
      // the chord at the band's OUTER radius, so neighbouring boxes meet at the
      // rim instead of leaving a slot there — floorColliders' own rule
      const halfChord = cheek.outerRadius * Math.tan((spanDeg / 2) * DEG) * 1.06
      out.push({
        halfExtents: [(cheek.outerRadius - cheek.innerRadius) / 2, height / 2, halfChord],
        position: [Math.sin(rad) * mid, h.deckY + height / 2, -Math.cos(rad) * mid],
        quaternion: yawThenPitch(radialYaw(rad), 0),
        kind: 'wall',
      })
    }

    // the roof, spanning the well and both cheeks
    const innerR = cheeks[0].innerRadius
    const outerR = cheeks[1].outerRadius
    const midR = (innerR + outerR) / 2
    const arc = spanDeg * DEG * midR
    // dY/ds along increasing azimuth; a box pitched by −atan(dY/ds) about its
    // local +X carries its faces on that slope (see yawThenPitch)
    const pitch = arc > 1e-9 ? -Math.atan2(a1.soffitY - a0.soffitY, arc) : 0
    const halfChord = outerR * Math.tan((spanDeg / 2) * DEG) * 1.06
    /*
     * Hung so its UNDERSIDE is the soffit: the walker is beneath it and the
     * clearance stairheadClearance() reports is the clearance they get.
     *
     * The offset is taken THROUGH the rotation rather than added to Y, because
     * the pitch has tilted the box's own up-axis and half of the lift is now
     * tangential. Added to Y alone the underside would sit a few millimetres
     * under the glass at one end of every box and over it at the other, which is
     * the same class of error as a box yawed the wrong quarter turn — small, and
     * everywhere.
     */
    const q = yawThenPitch(radialYaw(rad), pitch)
    const lift = rotate(q, [0, roofThickness / 2, 0])
    out.push({
      halfExtents: [(outerR - innerR) / 2, roofThickness / 2, halfChord],
      position: [
        Math.sin(rad) * midR + lift[0],
        soffit + lift[1],
        -Math.cos(rad) * midR + lift[2],
      ],
      quaternion: q,
      kind: 'guard',
    })
  }
  return out
}
