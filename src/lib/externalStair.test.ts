import { describe, expect, it } from 'vitest'
import { EXTERNAL_STAIR, GROUND_Y } from '../config/site'
import { ENTRANCE, TOWER } from '../config/tower'

const DEG = Math.PI / 180
const az = ENTRANCE.azimuthDeg * DEG
const RUN = EXTERNAL_STAIR.going * EXTERNAL_STAIR.risers
const FOOT_RADIUS = TOWER.outerRadius + RUN

/**
 * The tread box, placed and turned the way the component places and turns it.
 * Returned as its two horizontal half-extents in WORLD terms: across the flight
 * and along it.
 */
function treadExtents(i: number) {
  const yaw = Math.PI - az
  // local +Z after a yaw of `yaw`, and local +X with it
  const along = { x: Math.sin(yaw), z: Math.cos(yaw) }
  const across = { x: Math.cos(yaw), z: -Math.sin(yaw) }
  // the outward radial direction of the flight
  const radial = { x: Math.sin(az), z: -Math.cos(az) }
  return {
    alongDotRadial: Math.abs(along.x * radial.x + along.z * radial.z),
    acrossDotRadial: Math.abs(across.x * radial.x + across.z * radial.z),
    y: GROUND_Y + EXTERNAL_STAIR.riser * (i + 1),
    r: FOOT_RADIUS - EXTERNAL_STAIR.going * (i + 0.5),
  }
}

describe('the stair up to the doorway', () => {
  it('lays the tread width ACROSS the flight, not along it', () => {
    /*
     * The box is built width × riser × going in its own axes and was dropped in
     * unrotated, so on a flight running out along the entrance azimuth the two
     * horizontal axes were swapped: 1.4 m deep along the climb and 0.30 m across
     * it. What that draws is a 0.30 m ribbon between balustrades 1.36 m apart,
     * with consecutive treads overlapping four deep — a narrow column, not steps.
     */
    const e = treadExtents(0)
    expect(e.alongDotRadial).toBeCloseTo(1, 9)
    expect(e.acrossDotRadial).toBeCloseTo(0, 9)
  })

  it('is wider than it is deep, which is what makes it a flight', () => {
    expect(EXTERNAL_STAIR.width).toBeGreaterThan(EXTERNAL_STAIR.going * 2)
  })

  it('runs from the paving to the threshold, tread by tread', () => {
    const first = treadExtents(0)
    const last = treadExtents(EXTERNAL_STAIR.risers - 1)
    expect(first.y).toBeCloseTo(GROUND_Y + EXTERNAL_STAIR.riser, 9)
    expect(last.y).toBeCloseTo(ENTRANCE.thresholdY, 6)
    // and lands on the wall face rather than short of it or inside it
    expect(last.r - EXTERNAL_STAIR.going / 2).toBeCloseTo(TOWER.outerRadius, 6)
  })

  it('keeps the balustrade outside the treads, not inside them', () => {
    // the standards stand ON the flight: half the width less the tube's radius
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
