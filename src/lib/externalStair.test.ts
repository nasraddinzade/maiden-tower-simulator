import { describe, expect, it } from 'vitest'
import { ENTRANCE_APPROACH, EXTERNAL_STAIR, GROUND_Y } from '../config/site'
import { ENTRANCE, TOWER } from '../config/tower'
import { azimuthToVector } from './geometry'
import {
  approachNosing,
  entranceApproach,
  type ApproachNode,
  type ApproachParams,
} from './externalStair'

const DEG = Math.PI / 180
const RUN = EXTERNAL_STAIR.going * EXTERNAL_STAIR.risers

const PARAMS: ApproachParams = {
  entranceAzimuthDeg: ENTRANCE.azimuthDeg,
  outerRadius: TOWER.outerRadius,
  width: EXTERNAL_STAIR.width,
  landingLength: ENTRANCE_APPROACH.landingLength,
  risers: EXTERNAL_STAIR.risers,
  riser: EXTERNAL_STAIR.riser,
  going: EXTERNAL_STAIR.going,
  groundY: GROUND_Y,
  thresholdY: ENTRANCE.thresholdY,
  handedness: ENTRANCE_APPROACH.handedness,
}

const PLAN = entranceApproach(PARAMS)
const [FOOT, HEAD, LANDING_END] = PLAN.walkingLine

/** A walking-line node as a ground point. */
function ground(n: ApproachNode) {
  const a = n.azimuthDeg * DEG
  return { x: Math.sin(a) * n.midRadius, z: -Math.cos(a) * n.midRadius }
}

function unit(from: { x: number; z: number }, to: { x: number; z: number }) {
  const dx = to.x - from.x
  const dz = to.z - from.z
  const len = Math.hypot(dx, dz)
  return { x: dx / len, z: dz / len }
}

function dot(a: { x: number; z: number }, b: { x: number; z: number }) {
  return a.x * b.x + a.z * b.z
}

/** The doorway's own outward radius: the direction a radial flight would run. */
const DOOR_RADIAL = azimuthToVector(ENTRANCE.azimuthDeg)
const ASCENT = unit(ground(FOOT), ground(HEAD))

describe('the flight runs ALONG the drum, not out from it', () => {
  /*
   * THE FAULT THIS FILE IS FOR. The model laid the flight on the entrance's own
   * radius — foot and head at azimuth 270, the run taken straight out of the
   * radius — so the walker climbed head-on at the door and there was no landing,
   * no turn and nothing for the handrail to level off along.
   *
   * Every exterior photograph that shows the doorway shows the other thing. In
   * "Torre de la Doncella, Baku, Azerbaiyán, 2016-09-26, DD 06.jpg" the flight
   * climbs ACROSS the face of the wall to a landing standing in front of the
   * door, and the rail rakes up the flight, kinks once, and runs on horizontally
   * past the far jamb into the stone. "Qiz qalasi 1.jpg" is the same arrangement
   * from another bearing; the owner's ascent frame at second 2 is the same thing
   * from the foot.
   */

  it('climbs square to the doorway radius instead of along it', () => {
    expect(Math.abs(dot(ASCENT, DOOR_RADIAL))).toBeLessThan(1e-9)
  })

  it('makes the walker turn a quarter circle at the head to face the door', () => {
    // into the doorway is inward along its own radius
    const intoDoor = { x: -DOOR_RADIAL.x, z: -DOOR_RADIAL.z }
    const turn = Math.acos(Math.min(1, Math.max(-1, dot(ASCENT, intoDoor)))) / DEG
    expect(turn).toBeCloseTo(90, 9)
    expect(PLAN.turnDeg).toBeCloseTo(turn, 9)
  })

  it('puts the foot round the drum from the door, on the side the photographs show', () => {
    /*
     * WHICH SIDE was the half of this that could have been got backwards. The
     * visible arc of a drum always runs from higher azimuth on the image left to
     * lower on the right, so a flight on the far side of the door would appear
     * to the RIGHT of it in every photograph — and it appears there in none. DD
     * 06 fixes the compass on its own: the buttress and the boulevard stand at
     * its right edge, which is the tower's east and south, so the foot lies
     * north of west.
     */
    const swing = FOOT.azimuthDeg - ENTRANCE.azimuthDeg
    expect(swing).toBeGreaterThan(0)
    expect(swing).toBeCloseTo(
      Math.atan2(ENTRANCE_APPROACH.landingLength / 2 + RUN, PLAN.tangentRadius) / DEG,
      9,
    )
  })

  it('gains far less radius than it runs, because it runs round and not out', () => {
    // a radial flight spends its whole run on radius; this one spends a third
    expect(FOOT.midRadius).toBeGreaterThan(HEAD.midRadius)
    expect(FOOT.midRadius - HEAD.midRadius).toBeLessThan(RUN / 2)
  })

  it('grazes the wall face at the door and swings clear of it going down', () => {
    /*
     * The construction's own check, and the reason it is a derivation rather
     * than a second guess: the landing is as deep as the flight is wide and
     * their outer edges are one line, which puts the INNER edge tangent to the
     * drum. So the stair touches the stone at the door — the photographs show it
     * hard against the wall there — and stands progressively clear of it going
     * down, which is where the crowd barriers fit underneath.
     */
    const inner = { x: -DOOR_RADIAL.x, z: -DOOR_RADIAL.z }
    const half = EXTERNAL_STAIR.width / 2
    const a = ground(FOOT)
    const b = ground(LANDING_END)

    let min = Infinity
    for (let k = 0; k <= 400; k++) {
      const t = k / 400
      const x = a.x + (b.x - a.x) * t + inner.x * half
      const z = a.z + (b.z - a.z) * t + inner.z * half
      min = Math.min(min, Math.hypot(x, z))
      expect(Math.hypot(x, z)).toBeGreaterThan(TOWER.outerRadius - 1e-9)
    }
    expect(min).toBeCloseTo(TOWER.outerRadius, 9)
  })
})

describe('the landing at the head', () => {
  it('is level with the threshold at both its ends', () => {
    expect(HEAD.treadY).toBeCloseTo(ENTRANCE.thresholdY, 9)
    expect(LANDING_END.treadY).toBeCloseTo(ENTRANCE.thresholdY, 9)
  })

  it('is long enough along the wall to cover the doorway it serves', () => {
    const a = ground(HEAD)
    const b = ground(LANDING_END)
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThanOrEqual(ENTRANCE.width)
  })

  it('stands square in front of the door rather than beside it', () => {
    const a = ground(HEAD)
    const b = ground(LANDING_END)
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
    const azimuth = (Math.atan2(mid.x, -mid.z) / DEG + 360) % 360
    expect(azimuth).toBeCloseTo(ENTRANCE.azimuthDeg, 9)
  })

  it('is one straight line with the flight, so the chain has no corner in plan', () => {
    // the landing is the flight's own line carried past the door on the level
    const down = unit(ground(HEAD), ground(FOOT))
    const on = unit(ground(LANDING_END), ground(HEAD))
    expect(dot(down, on)).toBeCloseTo(1, 9)
  })
})

describe('the treads', () => {
  it('lays the tread width ACROSS the climb, not along it', () => {
    /*
     * The box is built width × riser × going in its own axes, so the yaw has to
     * send its local +Z along the travel. It used to be π − az, which was that
     * yaw for a flight running out from the door and is a right angle out for
     * one running round the drum: every tread would come out 1.4 m deep along
     * the climb and 0.30 m across it, a narrow ribbon overlapping four deep.
     */
    const yaw = PLAN.descentYaw
    const along = { x: Math.sin(yaw), z: Math.cos(yaw) }
    const across = { x: Math.cos(yaw), z: -Math.sin(yaw) }
    const descent = { x: -ASCENT.x, z: -ASCENT.z }
    expect(dot(along, descent)).toBeCloseTo(1, 9)
    expect(dot(across, descent)).toBeCloseTo(0, 9)
  })

  it('runs from the paving to the threshold, tread by tread', () => {
    expect(PLAN.treads).toHaveLength(EXTERNAL_STAIR.risers)
    expect(PLAN.treads[0][1]).toBeCloseTo(GROUND_Y + EXTERNAL_STAIR.riser, 9)
    expect(PLAN.treads[EXTERNAL_STAIR.risers - 1][1]).toBeCloseTo(ENTRANCE.thresholdY, 6)
  })

  it('brings the top tread up against the landing, not against the wall', () => {
    const top = PLAN.treads[EXTERNAL_STAIR.risers - 1]
    const head = ground(HEAD)
    const gap = Math.hypot(top[0] - head.x, top[2] - head.z)
    // the top tread's centre is half a going short of the landing's near edge
    expect(gap).toBeCloseTo(EXTERNAL_STAIR.going / 2, 9)
  })

  it('is wider than it is deep, which is what makes it a flight', () => {
    expect(EXTERNAL_STAIR.width).toBeGreaterThan(EXTERNAL_STAIR.going * 2)
  })
})

describe('the nosing line the balustrade hangs off', () => {
  it('passes through every tread nosing on the way up', () => {
    for (let i = 0; i < EXTERNAL_STAIR.risers; i++) {
      const n = approachNosing(PARAMS, EXTERNAL_STAIR.going * i)
      expect(n.position[1]).toBeCloseTo(GROUND_Y + EXTERNAL_STAIR.riser * (i + 1), 9)
    }
  })

  it('stops raking at the top nosing and runs level across the landing', () => {
    /*
     * The rail used to stop a going short of the wall because what happened at
     * the top of it was in no frame. It is in the photographs: it kinks once, at
     * the head, and runs on flat past the door. If the rake carried to the head
     * instead of to the top NOSING the rail would arrive a riser above the
     * doorway it is meant to arrive level at.
     */
    const kink = approachNosing(PARAMS, RUN - EXTERNAL_STAIR.going)
    const end = approachNosing(PARAMS, RUN + ENTRANCE_APPROACH.landingLength)
    expect(kink.position[1]).toBeCloseTo(ENTRANCE.thresholdY, 9)
    expect(end.position[1]).toBeCloseTo(ENTRANCE.thresholdY, 9)
  })

  it('keeps the balustrade outside the treads, not inside them', () => {
    // the standards stand ON the flight: half the width less the rail's radius
    const half = EXTERNAL_STAIR.width / 2 - EXTERNAL_STAIR.railRadius
    expect(half).toBeGreaterThan(0)
    expect(half * 2).toBeLessThanOrEqual(EXTERNAL_STAIR.width)
  })
})

describe('the balustrade the photographs show', () => {
  it('is a dense fan, not a dozen posts', () => {
    /*
     * The reading calls the balustrade the stair's most characteristic feature
     * and says the model had the wrong object: a dense fan of closely-spaced
     * flat straps, roughly forty to forty-five a side, against twelve round
     * tubes at one per tread.
     */
    const perSide = EXTERNAL_STAIR.risers * EXTERNAL_STAIR.postsPerTread
    expect(perSide).toBeGreaterThanOrEqual(35)
    expect(perSide).toBeLessThanOrEqual(55)
  })

  it('spaces the straps closer than a tread', () => {
    const spacing = EXTERNAL_STAIR.going / EXTERNAL_STAIR.postsPerTread
    expect(spacing).toBeLessThan(EXTERNAL_STAIR.going)
    // and not so close that the guard reads as a solid screen
    expect(spacing).toBeGreaterThan(EXTERNAL_STAIR.strapWidth)
  })

  it('is a strap on edge, deeper than it is thick', () => {
    expect(EXTERNAL_STAIR.strapWidth).toBeGreaterThan(EXTERNAL_STAIR.strapThickness * 2)
  })
})
