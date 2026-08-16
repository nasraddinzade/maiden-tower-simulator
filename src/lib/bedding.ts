/**
 * How deep a floor structure may be bedded into the drum — and, because the two
 * questions turn out to be one, how coarse the lathe that draws it may get.
 * three.js-free so it can be unit-tested (CLAUDE.md rule 6).
 *
 * A floor slab, a cupola skirt and the ceiling fill above a crown all run PAST
 * the room's wall face into the masonry. They have to: built to the face
 * exactly, the polygonal mismatch between their lathe and the shell's 96-gon
 * opens a ring of daylight round the room at every ceiling. That is what
 * WALL_EMBED has always been for.
 *
 * WHAT NOBODY ASKED WAS WHETHER THE STONE IS THERE. Where the stair passage
 * runs, it is not. The passage is cut in the same wall, and what it leaves
 * between the chamber and itself is a jamb thinner than the bedding was:
 *
 *   jamb  = STAIR.wallClearance − PASSAGE_SIDE_CLEARANCE − taper × headroom
 *         = 0.250 − 0.060 − 0.0441 × 2.300 = 0.0886 m
 *   embed = 0.250 m
 *
 * so 0.16 m of every slab, fill and skirt stood INSIDE the passage. Measured on
 * the built model on the climb from storey 2 to storey 3, at azimuth 156: the
 * shell's own cheek at r 3.767 from y 5.16 to 6.28, then the ceiling fill at
 * 3.863→3.875 and the storey-3 slab at 3.896 from 6.28 up to 7.06 — a ledge
 * 0.096 to 0.129 m proud, exactly TOWER.ceilingStructure tall, on the climber's
 * left, for the whole length of the flight. Seen along the passage it converges
 * to a point: the black wedge in the owner's screenshot.
 *
 * THE THREE TERMS OF THE JAMB, since only one of them is obvious.
 *
 *   · wallClearance is the stone the stair is held off the room face by. It is
 *     the whole of the jamb anybody had in mind, and WALL_EMBED was set to the
 *     same 0.25 — see cutStairwell(), which noticed the equality and read it as
 *     a happy tangency. Tangency is the case this model has twice lost a floor
 *     to, and here it was not even tangency: the other two terms eat into it.
 *   · PASSAGE_SIDE_CLEARANCE is taken on BOTH sides of the flight, so the cut
 *     goes 0.06 m further in than the flight does. (stairPassageSections() says
 *     in prose that the inner side keeps no clearance; its arithmetic takes it
 *     anyway. Left alone here — moving the cheek moves the walking surface, and
 *     that is the owner's stair, not a bedding detail.)
 *   · the taper is the term that cannot be argued away. A passage section is a
 *     RECTANGLE: its inner cheek is frozen at the radius of its own tread and
 *     runs vertically for the full headroom above it, while the room face keeps
 *     leaning outward at 0.0441 m per metre. So the jamb is thickest at the
 *     tread and thinnest at the crown, and the ceiling structures sit near the
 *     crown by construction — a floor slab is what a flight climbs to.
 *
 * WHERE THE RIM GOES. Halfway. It has two ways to fail — emerging into the room
 * (a slit) and entering the passage (the ledge) — and the midpoint of the jamb
 * is the one radius furthest from both. It is a rule rather than a tolerance,
 * which is the point: nothing here is tuned until the artefact stops showing.
 *
 * AND THEN THE LATHE HAS TO BE FINE ENOUGH TO STAY IN THAT BAND. This is the
 * half of the change that is not obvious, and it inverts a dependency that was
 * the wrong way round. lodSegments() drops a distant storey to 12 segments,
 * whose chord dips 0.155 m inside its own circle at this radius; junctions.test
 * knew that and demanded a bedding deep enough to swallow it. So the renderer's
 * coarsest level of detail was sizing a dimension of the building — and sizing
 * it past what the building has. The building is the constraint: the bedding
 * follows the jamb, and the segment count follows the bedding. It comes out at
 * 32, which the LOD ladder already used, and costs about 3 600 triangles across
 * the whole tower against a 900 000 budget.
 */

import { PLAYER } from '../config/player'
import { ROOF, STAIR, TOWER, innerRadiusAt } from '../config/tower'
import { PASSAGE_SIDE_CLEARANCE } from './staircase'

/** Metres the inner face moves outward per metre of height. */
export function wallTaperSlope(base: number, top: number, height: number): number {
  return (base - top) / height
}

export interface JambInputs {
  /** Stone the flight is held off the room face by — STAIR.wallClearance. */
  wallClearance: number
  /** Clearance the CUT takes beyond the flight, on the inner side too. */
  sideClearance: number
  /** Outward lean of the room face, metres of radius per metre of height. */
  taperSlope: number
  /** Clear height the passage keeps over every tread — PLAYER.stairHeadroom. */
  headroom: number
}

/**
 * The THINNEST masonry the stair passage leaves between a chamber and itself,
 * anywhere in the tower.
 *
 * Taken at the crown of a section whose tread is a full headroom below, because
 * that is the worst case and it is a real one: a section reaches `headroom`
 * above its own tread, and over that height the room face has moved out by
 * `taperSlope × headroom` while the cheek has not moved at all.
 */
export function passageJambThickness(p: JambInputs): number {
  return p.wallClearance - p.sideClearance - p.taperSlope * p.headroom
}

/**
 * Where the bedded rim goes inside that jamb: the middle of it.
 *
 * Not a fraction chosen to make a number come out. The rim has a way of failing
 * on each side — a ring slit if it falls short of the room face, a ledge in the
 * passage if it runs past the cheek — and the midpoint is the single radius
 * that is as far as it can be from both.
 */
export function beddingDepth(jamb: number): number {
  return jamb / 2
}

/** How far a regular N-gon inscribed in radius R falls inside the true circle. */
export function chordDip(radius: number, segments: number): number {
  return radius * (1 - Math.cos(Math.PI / segments))
}

/**
 * The fewest lathe segments a bedded rim may be drawn with.
 *
 * The same halving rule once more: a facet may travel at most half the way from
 * the rim to either face it must not touch, so the chord dip is held to half the
 * bedding. Anything coarser and the rim's facet midpoints come out of the wall
 * into the room, which is the slit the bedding exists to prevent.
 */
export function latheSegmentsForBedding(embed: number, rimRadius: number): number {
  if (embed <= 0 || rimRadius <= 0) return 3
  const cos = 1 - embed / 2 / rimRadius
  if (cos <= -1) return 3
  return Math.max(3, Math.ceil(Math.PI / Math.acos(Math.min(1, cos))))
}

/** m — the thinnest jamb the stair leaves, from the shipped configuration. */
export const PASSAGE_JAMB = passageJambThickness({
  wallClearance: STAIR.wallClearance,
  sideClearance: PASSAGE_SIDE_CLEARANCE,
  taperSlope: wallTaperSlope(TOWER.wallThicknessBase, TOWER.wallThicknessTop, TOWER.height),
  headroom: PLAYER.stairHeadroom,
})

/**
 * m — how deep floors, domes and ceiling fill are bedded into the drum.
 *
 * [DERIVED], and it used to be [ASSUMPTION] 0.25 — "only deep enough that the
 * join cannot show". It was deep enough for that and 0.16 m too deep for the
 * wall it is cut into. Nothing about the bedding was measured then and nothing
 * is measured now; what changed is that the value is no longer free. Widen the
 * jamb — a bigger STAIR.wallClearance, a lower headroom, a survey that thins the
 * taper — and this follows without anyone remembering to come back here.
 */
export const WALL_EMBED = beddingDepth(PASSAGE_JAMB)

/** The widest bedded rim in the drum: the room face at the terrace, plus embed. */
export const WIDEST_BEDDED_RIM = innerRadiusAt(ROOF.deckY) + WALL_EMBED

/**
 * Floor for lodSegments() on anything bedded into the drum. See the head of this
 * file: the LOD used to set the bedding, and it is the other way round now.
 */
export const MIN_LATHE_SEGMENTS = latheSegmentsForBedding(WALL_EMBED, WIDEST_BEDDED_RIM)
