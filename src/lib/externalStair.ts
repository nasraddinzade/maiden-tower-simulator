/**
 * The approach from the paving to the raised doorway — WHICH WAY the flight runs.
 *
 * It runs ALONG the drum, not out from it, and that is the whole of this module.
 * The model had a straight flight on the entrance's own radius: foot and head at
 * the same azimuth, the run taken out of the radius. Every exterior photograph
 * that shows the door shows something else. The flight is a straight steel run
 * laid against the wall like a chord, climbing round the drum to a LANDING in
 * front of the door, and the walker turns a quarter circle off the top tread to
 * face the doorway. reference-photos/exterior/"Torre de la Doncella, Baku,
 * Azerbaiyán, 2016-09-26, DD 06.jpg" is the clearest: the handrail rakes up the
 * flight, breaks to horizontal exactly where the flight meets the landing, and
 * runs on flat across the front of the doorway to die into the wall past the far
 * jamb. A radial flight has no landing, nothing for a rail to level off along,
 * and nowhere to turn.
 *
 * THE CONSTRUCTION, and why it is a derivation and not a second guess. The
 * photographs fix the KIND of thing and the SENSE; they do not fix an offset,
 * and nothing has put a tape across this stair. So the line is derived from the
 * one relation the photographs do settle: the landing's outer edge continues the
 * flight's outer stringer in one straight line, and the landing is as deep as the
 * flight is wide, because a quarter-turn landing has to be. That makes the
 * walking line tangent to a circle half a stair-width outside the wall face —
 * equivalently, it makes the flight's INNER edge tangent to the wall face itself,
 * touching at the door and swinging clear of the drum as it descends. That last
 * is the property to check the construction by, and the photographs show it:
 * at the head the stair is hard against the stone, and by the foot there is room
 * under and behind it for the crowd barriers that stand there.
 *
 * The consequence is that the flight's foot is NOT on the entrance's radius and
 * its two ends are at different radii. Nothing about that is a fudge: a straight
 * line cannot hold a constant distance from a circle, and the tower is the circle.
 */

import { azimuthToVector, type GroundDirection } from './geometry'

const DEG = Math.PI / 180

/** A node of the walking line, in the polar terms the collider helpers take. */
export interface ApproachNode {
  azimuthDeg: number
  treadY: number
  midRadius: number
}

export interface ApproachParams {
  /** Azimuth of the doorway, degrees clockwise from north. */
  entranceAzimuthDeg: number
  /** Radius of the drum's outer face. */
  outerRadius: number
  /** Clear width of the walking surface — flight and landing alike. */
  width: number
  /** How far the landing reaches along the wall. Must cover the doorway. */
  landingLength: number
  risers: number
  riser: number
  going: number
  /** World Y of the paving the foot stands on. */
  groundY: number
  /** World Y of the threshold, which is also the landing's walking surface. */
  thresholdY: number
  /**
   * Which way round the drum the flight descends from the door:
   * +1 toward INCREASING azimuth, −1 toward decreasing.
   */
  handedness: number
}

export interface ApproachPlan {
  /**
   * Radius the walking line is tangent to, at the point in front of the door.
   * The flight's inner edge is tangent to `outerRadius`, half a width inside it.
   */
  tangentRadius: number
  /**
   * foot → head of flight → far end of landing. One straight line in plan: the
   * landing is the flight's own line carried on past the door, level.
   */
  walkingLine: [ApproachNode, ApproachNode, ApproachNode]
  /** Yaw that sends a box's local +Z along the DESCENT and its local +X across. */
  descentYaw: number
  /** Across the flight, pointing away from the tower. */
  outward: GroundDirection
  /** Centre of each tread's walking surface, foot first. */
  treads: Array<[number, number, number]>
  /** Centre of the landing's walking surface. */
  landing: [number, number, number]
  /** How far a walker turns at the head of the flight to face the door, degrees. */
  turnDeg: number
}

/**
 * A point on the nosing line, which is what the balustrade is hung off.
 *
 * The nosing line runs through the front edge of every tread's surface and so
 * sits one riser ABOVE the walking line the ramp chain gives (that one passes
 * through the back edges). Anything a visitor can see or hold is measured off
 * this one; anything they stand on is measured off the other. The two are a
 * riser apart and the difference has to be paid somewhere — see the note on the
 * guards in the component.
 */
export interface NosingPoint {
  position: [number, number, number]
  /** World Y of the tread surface under it, for standards that must reach it. */
  treadY: number
}

export function entranceApproach(p: ApproachParams): ApproachPlan {
  const az = p.entranceAzimuthDeg * DEG
  const s = p.handedness >= 0 ? 1 : -1
  const run = p.risers * p.going

  // The landing is as deep as the flight is wide and their outer edges are one
  // line, so the walking surface stands off the wall face by half a width and
  // the flight's inner edge grazes the stone at the door. See the module note.
  const tangentRadius = p.outerRadius + p.width / 2

  // Unit tangent at the door, signed so +t is the way the flight descends.
  const tangent: GroundDirection = { x: s * Math.cos(az), z: s * Math.sin(az) }
  const at = (t: number, y: number): [number, number, number] => [
    Math.sin(az) * tangentRadius + t * tangent.x,
    y,
    -Math.cos(az) * tangentRadius + t * tangent.z,
  ]
  const node = (t: number, y: number): ApproachNode => ({
    // the tangent point is perpendicular to the radius, so both of these are
    // exact rather than a small-angle reading of the same triangle
    azimuthDeg: p.entranceAzimuthDeg + Math.atan2(t * s, tangentRadius) / DEG,
    treadY: y,
    midRadius: Math.hypot(tangentRadius, t),
  })

  const tHead = p.landingLength / 2
  const tFoot = tHead + run
  const tLandingEnd = -p.landingLength / 2

  const treads: Array<[number, number, number]> = []
  for (let i = 0; i < p.risers; i++) {
    // tread i is the surface you arrive on after climbing i+1 risers
    treads.push(at(tFoot - p.going * (i + 0.5), p.groundY + p.riser * (i + 1)))
  }

  return {
    tangentRadius,
    walkingLine: [
      node(tFoot, p.groundY),
      node(tHead, p.thresholdY),
      node(tLandingEnd, p.thresholdY),
    ],
    descentYaw: Math.atan2(tangent.x, tangent.z),
    // across a tangent line, at its tangent point, IS the radius there
    outward: azimuthToVector(p.entranceAzimuthDeg),
    treads,
    landing: at(0, p.thresholdY),
    turnDeg: 90,
  }
}

/**
 * The nosing line of the flight and then of the landing, `d` from the foot.
 *
 * Past the head of the flight it goes level: that is what the landing is. The
 * balustrade is hung off this, and the photographs show the rail doing exactly
 * this — raking up the flight, kinking once, running flat past the door.
 */
export function approachNosing(p: ApproachParams, d: number): NosingPoint {
  const az = p.entranceAzimuthDeg * DEG
  const s = p.handedness >= 0 ? 1 : -1
  const run = p.risers * p.going
  const tangentRadius = p.outerRadius + p.width / 2
  const tHead = p.landingLength / 2
  const tFoot = tHead + run

  const t = tFoot - d
  // The rake stops at the TOP NOSING, which is one going short of the head: the
  // top tread's own surface is already at threshold level, and the landing only
  // carries it further. Running the rake all the way to `run` would lift the
  // rail a riser above the door it is supposed to arrive level at.
  const climbed = Math.min(d, run - p.going)
  const y = p.groundY + p.riser + climbed * (p.riser / p.going)
  // the tread you stand on at `d`: whole risers climbed, the landing after that
  const index = Math.min(Math.floor(d / p.going), p.risers - 1)
  const treadY = p.groundY + p.riser * (index + 1)

  return {
    position: [
      Math.sin(az) * tangentRadius + t * s * Math.cos(az),
      y,
      -Math.cos(az) * tangentRadius + t * s * Math.sin(az),
    ],
    treadY,
  }
}
