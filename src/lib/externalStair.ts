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
   * How far off the walking line the drum's face lies at the landing's FAR END,
   * measured along `outward`. Negative: the stone is on the tower side.
   *
   * The landing's inner edge is a straight line at `outerRadius` and the drum
   * is a circle, so the two part company either side of the door — by nothing
   * at the doorway itself and by |this| less half a width at the far end. It is
   * where the return rail has to reach to die into the stone, which is what the
   * photographs show it doing, and the same number says why the landing's wall
   * side needs no guard at all: the gap there is 0.03 m, not a place to fall.
   */
  wallOffsetAtLandingEnd: number
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

  // A point s along `outward` from the walking line at parameter t stands at
  // hypot(tangentRadius + s, t) from the axis, because the tangent and the
  // radius at the tangent point are perpendicular. Setting that to outerRadius
  // and taking the root on the tower side gives where the stone is.
  const wallOffsetAtLandingEnd =
    Math.sqrt(Math.max(0, p.outerRadius * p.outerRadius - tLandingEnd * tLandingEnd)) - tangentRadius

  return {
    tangentRadius,
    wallOffsetAtLandingEnd,
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

/** What the balustrade is made of, over and above the plan of the stair. */
export interface BalustradeParams {
  /** How far the rail stands above the tread a visitor's foot is on. */
  guardHeight: number
  /** Radius of the handrail tube; the standards stand this far in from the edge. */
  railRadius: number
  /** Standards per tread, each side. */
  postsPerTread: number
  /**
   * Clear width of the doorway the landing serves.
   *
   * The wall-side rail needs it and no other part of the balustrade does: that
   * rail runs on level past the head and has to stop at the near JAMB. Anywhere
   * further and it is a rail across a doorway.
   */
  doorwayWidth: number
}

/** A standard: a plumb strap from the surface it stands on up to the rail. */
export interface BalustradePost {
  position: [number, number, number]
  /** Plumb length, tread surface to rail. */
  height: number
  /**
   * Yaw of the strap's own plane. A strap is flat, so it has to lie ALONG its
   * own run and stand edge-on across it; the return at the landing's end runs
   * the other way from the flight and is turned with it.
   */
  yaw: number
}

/** A straight length of handrail, centre to centre of its two ends. */
export interface BalustradeRail {
  a: [number, number, number]
  b: [number, number, number]
}

export interface ApproachBalustrade {
  posts: BalustradePost[]
  rails: BalustradeRail[]
}

/**
 * The balustrade the photographs show, as geometry rather than as three.js.
 *
 * It lived inside the component's useMemo until the owner reported the rail
 * missing down one side, and that is the reason it is here: nothing could see
 * how many runs were built or where they went, because a .tsx is not testable
 * under rule 6. The count and the spacing had tests; the ARRANGEMENT — which
 * edge of the walking surface carries a rail — had none, and the arrangement is
 * what was wrong.
 *
 * THREE RUNS, one per edge a visitor can walk off, and that is the property to
 * read this by. The flight has two open sides and gets a rail down each. The
 * landing has three edges that are not the flight: the OPEN side, which
 * continues the flight's outer rail on the level; the FAR END, which had
 * nothing at all and is where a walker who climbs and does not turn steps off
 * 1.98 m onto the paving; and the WALL side, which is the drum, and gets no
 * rail because a rail against masonry is not a thing anyone builds.
 *
 * WHAT THE PHOTOGRAPHS SETTLE, and they settle all three. In
 * reference-photos/exterior/"Torre de la Doncella, Baku, Azerbaiyán,
 * 2016-09-26, DD 06.jpg" the outer rail rakes up the flight, breaks to
 * horizontal at the head, runs flat across the front of the doorway and then
 * TURNS AT THE FAR END AND DIES INTO THE STONE past the far jamb — the return
 * is in the frame, and the model simply did not have it. The wall-side rail is
 * in the same frame doing the same thing on its own side: it rakes, kinks level
 * at the head, runs a short way and goes into the stone. In the model it
 * stopped dead at the kink and left three standards holding nothing up.
 *
 * The one thing the photographs cannot fix is where the wall-side rail's level
 * run ENDS, because the wall-side line never actually reaches the drum: it is
 * tangent-parallel and passes 0.02 m clear at the door. So it ends where the
 * only stone on that side begins, which is the doorway's near jamb.
 *
 * All of it is hung off the NOSING line and not off the walking line the ramp
 * chain gives, because a guard height is measured from the surface a visitor's
 * foot is on and that is the drawn tread. The two run a riser apart; the guard
 * colliders are the place that difference is paid back.
 */
export function approachBalustrade(
  p: ApproachParams,
  g: BalustradeParams,
): ApproachBalustrade {
  const posts: BalustradePost[] = []
  const rails: BalustradeRail[] = []
  if (p.width <= 0 || g.guardHeight <= 0) return { posts, rails }

  const plan = entranceApproach(p)
  const { outward, descentYaw } = plan
  const perTread = Math.max(1, Math.round(g.postsPerTread))
  const spacing = p.going / perTread
  // set in from the tread's edge by the rail's own radius, so the balustrade
  // stands ON the walking surface rather than half off it
  const halfWidth = p.width / 2 - g.railRadius

  const run = p.risers * p.going
  /** The topmost nosing, where the rake ends and the level runs begin. */
  const dKink = run - p.going
  /** The far end of the landing, where the return closes it. */
  const dEnd = run + p.landingLength
  /**
   * The doorway's near jamb, where the wall-side rail dies into the stone.
   * Clamped to the kink: a doorway wider than the landing would otherwise ask
   * for a rail running backwards down the flight.
   */
  const dJamb = Math.max(dKink, dEnd - p.landingLength / 2 - g.doorwayWidth / 2)

  /** A point on one side's nosing line, `d` in from the foot, lifted by `lift`. */
  const online = (d: number, side: number, lift: number) => {
    const n = approachNosing(p, d)
    return {
      position: [
        n.position[0] + side * outward.x * halfWidth,
        n.position[1] + lift,
        n.position[2] + side * outward.z * halfWidth,
      ] as [number, number, number],
      treadY: n.treadY,
    }
  }

  const stand = (d: number, side: number) => {
    const { position, treadY } = online(d, side, g.guardHeight)
    // a standard is plumb, so it runs from the tread it stands on up to the
    // raking rail: at a nosing that is exactly the guard height, and anywhere
    // further into a tread it is longer by the rake
    posts.push({
      position: [position[0], (treadY + position[1]) / 2, position[2]],
      height: position[1] - treadY,
      yaw: descentYaw,
    })
  }
  const rail = (dA: number, dB: number, side: number) => {
    if (dB - dA < 1e-9) return
    rails.push({ a: online(dA, side, g.guardHeight).position, b: online(dB, side, g.guardHeight).position })
  }

  // The OPEN side, foot to the far end of the landing: rake, one kink, level.
  for (let d = 0; d < dEnd - 1e-9; d += spacing) stand(d, 1)
  rail(0, dKink, 1)
  rail(dKink, dEnd, 1)

  // The WALL side, the same rake and the same kink, ending at the near jamb.
  for (let d = 0; d < dJamb - 1e-9; d += spacing) stand(d, -1)
  rail(0, dKink, -1)
  rail(dKink, dJamb, -1)

  // The RETURN across the landing's far end, open corner to the stone. Its
  // standards are turned a quarter circle: they run across the flight, not
  // along it, and a flat strap read broadside is a different object.
  const end = approachNosing(p, dEnd)
  const across = (s: number, y: number): [number, number, number] => [
    end.position[0] + outward.x * s,
    y,
    end.position[2] + outward.z * s,
  ]
  const sWall = plan.wallOffsetAtLandingEnd
  if (halfWidth - sWall > 1e-9) {
    rails.push({ a: across(halfWidth, end.treadY + g.guardHeight), b: across(sWall, end.treadY + g.guardHeight) })
    for (let s = halfWidth; s > sWall + 1e-9; s -= spacing) {
      posts.push({
        position: across(s, end.treadY + g.guardHeight / 2),
        height: g.guardHeight,
        yaw: descentYaw + Math.PI / 2,
      })
    }
  }

  return { posts, rails }
}
