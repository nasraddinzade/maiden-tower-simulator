import { describe, expect, it } from 'vitest'
import { drumProfile } from './towerShell'
import { COURSING, ENTRANCE, TOWER } from '../config/tower'

const BASE_Y = ENTRANCE.groundY - 0.5
const R = TOWER.outerRadius
const profile = drumProfile(BASE_Y, TOWER.topY, R, TOWER.groundY, COURSING)

/** The runs of the section that stand proud — one per projecting course. */
const bands = (() => {
  const out: Array<{ bottom: number; top: number; out: number }> = []
  for (let i = 0; i < profile.length - 1; i += 1) {
    const [r0, y0] = profile[i]
    const [r1, y1] = profile[i + 1]
    // a course, not the coping: both stand proud, and only the projection tells
    // them apart — the coping oversails further by design
    const isCourse = Math.abs(r0 - R - COURSING.bandProjection) < 1e-9
    if (isCourse && Math.abs(r1 - r0) < 1e-9 && y1 > y0 + 1e-6) {
      out.push({ bottom: y0, top: y1, out: r0 - R })
    }
  }
  return out
})()

describe('the banded coursing of the outer face', () => {
  it('spans the whole wall and never doubles back', () => {
    for (let i = 1; i < profile.length; i += 1) {
      expect(profile[i][1]).toBeGreaterThanOrEqual(profile[i - 1][1] - 1e-9)
    }
    expect(profile[0][1]).toBeCloseTo(BASE_Y, 9)
    expect(profile[profile.length - 1][1]).toBeCloseTo(TOWER.topY, 9)
  })

  it('leaves the lower zone plain, as both readings say', () => {
    /*
     * The wall is in two zones with a sharp boundary about 11 m above the
     * outside ground. Below it there is no rhythm at all and the courses are
     * markedly taller; a band there would be the model inventing one.
     */
    const boundary = TOWER.groundY + COURSING.bandStartAboveGround
    for (const b of bands) expect(b.bottom).toBeGreaterThanOrEqual(boundary - 1e-9)
  })

  it('stops the ribbing short of the coping', () => {
    const copingFrom = TOWER.topY - COURSING.copingDepth
    const plainFrom = copingFrom - COURSING.plainUnderCoping
    for (const b of bands) expect(b.top).toBeLessThanOrEqual(plainFrom + 1e-9)
  })

  it('holds the measured pitch between one course and the next', () => {
    expect(bands.length).toBeGreaterThan(20)
    for (let i = 1; i < bands.length; i += 1) {
      expect(bands[i].bottom - bands[i - 1].bottom).toBeCloseTo(COURSING.bandPitch, 6)
    }
  })

  it('makes every band stand proud, and by the measured amount', () => {
    /*
     * The finding is that the stripes are RELIEF. A band that projects zero is
     * the fault this exists to fix, so the assertion is on the projection and
     * not on the count.
     */
    for (const b of bands) {
      expect(b.out).toBeCloseTo(COURSING.bandProjection, 9)
      expect(b.out).toBeGreaterThan(0.02)
    }
  })

  it('gives the proud course a little over half the pitch', () => {
    for (const b of bands) {
      expect(b.top - b.bottom).toBeCloseTo(COURSING.bandPitch * COURSING.proudFraction, 6)
    }
  })

  it('oversails at the crown, further than any course does', () => {
    const maxR = Math.max(...profile.map(([r]) => r))
    expect(maxR).toBeCloseTo(R + COURSING.copingProjection, 9)
    expect(COURSING.copingProjection).toBeGreaterThan(COURSING.bandProjection)
  })

  it('covers about two thirds of the visible wall, as the readings describe', () => {
    const ribbed = bands[bands.length - 1].top - bands[0].bottom
    const visible = TOWER.topY - TOWER.groundY
    expect(ribbed / visible).toBeGreaterThan(0.5)
    expect(ribbed / visible).toBeLessThan(0.8)
  })
})
