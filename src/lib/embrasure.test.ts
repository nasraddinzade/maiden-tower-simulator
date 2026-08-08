import { describe, expect, it } from 'vitest'
import { embrasureFoulsReveal, embrasureTreads, planEmbrasure, treadWear } from './embrasure'
import {
  ENTRANCE,
  FLOORS,
  STAIR,
  TOWER,
  WALL_LIFTS,
  WINDOW_EMBRASURE,
  innerRadiusAt,
} from '../config/tower'
import { flightRiser, planAllFlights, treadDepth } from './staircase'
import { wallColliders, type WallColliderParams } from './collision'
import { PLAYER } from '../config/player'
import windowData from '../data/windows.json'
import { windowCentreY, windowStoreyIndex, type WindowSpec } from './windows'

const E = WINDOW_EMBRASURE
const floorYs = FLOORS.map((f) => f.floorY)

function innerSillAbove(w: WindowSpec) {
  const centre = windowCentreY(w, TOWER.groundY, TOWER.height)
  const storey = windowStoreyIndex(w, floorYs, TOWER.groundY, TOWER.height)
  return { above: centre - w.innerHeight / 2 - floorYs[storey], floorY: floorYs[storey] }
}

describe('which windows get steps', () => {
  const windows = windowData.windows as WindowSpec[]
  const planned = windows.map((w) => {
    const { above, floorY } = innerSillAbove(w)
    return {
      id: w.id,
      plan: planEmbrasure(above, floorY, PLAYER.eyeHeight, E.riserTarget, E.going, E.platformDepth),
    }
  })

  it('gives steps to some openings and not to most', () => {
    const withSteps = planned.filter((p) => p.plan)
    expect(withSteps.length).toBeGreaterThan(0)
    expect(withSteps.length).toBeLessThan(windows.length / 2)
  })

  it('gives them to exactly the openings whose inner sill is above eye height', () => {
    for (const { id, plan } of planned) {
      const w = windows.find((x) => x.id === id)!
      const { above } = innerSillAbove(w)
      expect(Boolean(plan), `${id}: inner sill ${above.toFixed(2)} m above the floor`).toBe(
        above - PLAYER.eyeHeight > E.riserTarget / 2,
      )
    }
  })

  it('brings the eye to the inner sill, which is the whole point of the steps', () => {
    for (const { id, plan } of planned) {
      if (!plan) continue
      const w = windows.find((x) => x.id === id)!
      const { above, floorY } = innerSillAbove(w)
      const eyeOnPlatform = plan.platformY + PLAYER.eyeHeight
      expect(eyeOnPlatform, id).toBeCloseTo(floorY + above, 9)
    }
  })

  it('keeps the risers walkable and even', () => {
    for (const { id, plan } of planned) {
      if (!plan) continue
      expect(plan.riser, `${id} riser`).toBeGreaterThan(0.1)
      expect(plan.riser, `${id} riser`).toBeLessThan(0.3)
    }
  })
})

describe('embrasure treads', () => {
  const plan = planEmbrasure(2.95, 13.62, PLAYER.eyeHeight, E.riserTarget, E.going, E.platformDepth)!

  it('climbs outward into the wall, one going per step', () => {
    const treads = embrasureTreads(plan, 4.0, E.going, E.platformDepth)
    expect(treads.length).toBe(plan.stepCount + 1)
    for (let i = 1; i < treads.length; i += 1) {
      expect(treads[i].innerRadius).toBeCloseTo(treads[i - 1].outerRadius, 9)
      expect(treads[i].treadY).toBeGreaterThanOrEqual(treads[i - 1].treadY - 1e-9)
    }
  })

  it('ends on a platform level with the top tread', () => {
    const treads = embrasureTreads(plan, 4.0, E.going, E.platformDepth)
    const last = treads[treads.length - 1]
    expect(last.treadY).toBeCloseTo(plan.platformY, 9)
    expect(last.outerRadius - last.innerRadius).toBeCloseTo(E.platformDepth, 9)
  })

  it('stays inside the masonry it is cut into', () => {
    /*
     * An embrasure that reached the outer face would be a hole through the wall,
     * not a recess. Checked at the thinnest place any of them sits.
     */
    for (const w of windowData.windows as WindowSpec[]) {
      const { above, floorY } = innerSillAbove(w)
      const p = planEmbrasure(above, floorY, PLAYER.eyeHeight, E.riserTarget, E.going, E.platformDepth)
      if (!p) continue
      const face = innerRadiusAt(p.platformY)
      expect(face + p.depth, w.id).toBeLessThan(TOWER.outerRadius)
    }
  })
})

describe('the wall lets you into the embrasure', () => {
  /*
   * The recess is cut out of the SHELL, and the shell carries no collider. So a
   * recess you can see into is not a recess you can walk into unless the wall's
   * collider boxes are opened at the same arc — and when these were first built
   * they were not. Measured then: the walker pressed against solid wall 1.7 m
   * short of the steps, with the steps drawn plainly in front of it.
   */
  const embrasures = (windowData.windows as WindowSpec[])
    .map((w) => {
      const { above, floorY } = innerSillAbove(w)
      const plan = planEmbrasure(
        above,
        floorY,
        PLAYER.eyeHeight,
        E.riserTarget,
        E.going,
        E.platformDepth,
      )
      return plan ? { w, plan, floorY } : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const boxesFor = (openings: WallColliderParams['openings']) =>
    wallColliders({
      sectors: 32,
      outerRadius: TOWER.outerRadius,
      innerRadiusAt,
      baseY: ENTRANCE.groundY - 0.5,
      topY: TOWER.topY,
      bandBoundaries: FLOORS.map((f) => f.floorY).concat(TOWER.topY),
      entrance: {
        azimuthDeg: ENTRANCE.azimuthDeg,
        widthDeg: (ENTRANCE.width / TOWER.outerRadius) * (180 / Math.PI),
        sillY: ENTRANCE.thresholdY,
        headY: ENTRANCE.thresholdY + ENTRANCE.height,
      },
      openings,
      passageAt: () => [],
    })

  it('leaves no wall box standing across an embrasure', () => {
    const openings = embrasures.map(({ w, plan, floorY }) => ({
      azimuthDeg: w.azimuthDeg,
      widthDeg: ((E.width + 0.12) / innerRadiusAt(plan.platformY)) * (180 / Math.PI),
      sillY: floorY,
      headY: plan.platformY + PLAYER.eyeHeight,
    }))
    const spans = (boxes: ReturnType<typeof boxesFor>, azDeg: number, y: number) =>
      boxes.filter((b) => {
        if (b.kind !== 'wall') return false
        const [x, by, z] = b.position
        const boxAz = ((Math.atan2(x, -z) * 180) / Math.PI + 360) % 360
        const dAz = Math.abs(((boxAz - azDeg + 540) % 360) - 180)
        // the box's own sector is 360/32 = 11.25° wide
        return dAz < 6 && Math.abs(by - y) <= b.halfExtents[1]
      })

    const closed = boxesFor([])
    const opened = boxesFor(openings)
    for (const { w, plan, floorY } of embrasures) {
      const midY = (floorY + plan.platformY) / 2
      const az = ((w.azimuthDeg % 360) + 360) % 360
      expect(spans(closed, az, midY).length, `${w.id}: nothing to open`).toBeGreaterThan(0)
      expect(
        spans(opened, az, midY).length,
        `${w.id}: wall still stands across the recess at y ${midY.toFixed(2)}`,
      ).toBe(0)
    }
  })
})

describe('an embrasure and a stair passage cannot share the wall', () => {
  /*
   * THE FAULT THIS EXISTS FOR, measured by walking the model.
   *
   * With the recesses built and the stair starting at azimuth 200, the climb
   * stopped dead: 14 treads of 22 on the 2→3 flight, at azimuth 153, and 17 of
   * 39 on 4→6, at azimuth 131. Every flight completed the moment the recesses
   * were taken out. The flights stack in one sector and the widest sweeps 160°,
   * so from 200 they covered the arc from 213 down to about 40 — and the whole
   * slit column sits between azimuth 123 and 143.
   *
   * Two numbers in conflict, and the tie breaks the way it did for the window
   * bearing: STAIR.startAzimuthDeg is a [PLACEHOLDER] and the window azimuths are
   * photographs, so the placeholder moved. This test is what stops it moving
   * back, or a window drifting into the stair, without anyone noticing until they
   * try to walk up.
   */
  const flights = planAllFlights(STAIR, WALL_LIFTS, innerRadiusAt)

  const embrasures = (windowData.windows as WindowSpec[])
    .map((w) => {
      const { above, floorY } = innerSillAbove(w)
      const plan = planEmbrasure(
        above,
        floorY,
        PLAYER.eyeHeight,
        E.riserTarget,
        E.going,
        E.platformDepth,
      )
      return plan ? { w, plan, floorY } : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  it('leaves no tread of any flight inside a recess', () => {
    const clashes: string[] = []
    for (const { w, plan, floorY } of embrasures) {
      const halfDeg = ((E.width + 0.12) / 2 / innerRadiusAt(plan.platformY)) * (180 / Math.PI)
      const top = plan.platformY + PLAYER.eyeHeight
      const face = innerRadiusAt(plan.platformY)
      flights.forEach((steps, fi) => {
        for (const s of steps) {
          const dAz = Math.abs(((s.azimuthDeg - w.azimuthDeg + 540) % 360) - 180)
          if (dAz > halfDeg + STAIR.width / 2) continue
          // the passage runs from a tread-depth under the tread to the vault
          const bed = s.treadY - treadDepth(flightRiser(steps))
          const crown = s.treadY + PLAYER.stairHeadroom
          if (crown < floorY || bed > top) continue
          if (s.midRadius + STAIR.width / 2 < face) continue
          if (s.midRadius - STAIR.width / 2 > face + plan.depth) continue
          clashes.push(
            `${w.id} (az ${w.azimuthDeg}, ${floorY.toFixed(2)}–${top.toFixed(2)}) meets flight ${fi} ` +
              `at az ${s.azimuthDeg.toFixed(1)}, y ${s.treadY.toFixed(2)}`,
          )
        }
      })
    }
    expect(clashes).toEqual([])
  })
})

describe('worn treads', () => {
  it('is deterministic — the same step always wears the same way', () => {
    for (const i of [0, 1, 5, 12]) {
      expect(treadWear(i, 0.035)).toEqual(treadWear(i, 0.035))
    }
  })

  it('stays inside its amplitude, so wear can never trip anyone', () => {
    /*
     * The walking surface is the ramp chain and is unaffected, but the drawn
     * stone still has to stay close to nominal or the steps read as broken
     * rather than worn.
     */
    for (let i = 0; i < 40; i += 1) {
      const w = treadWear(i, 0.035)
      expect(Math.abs(w.nose)).toBeLessThanOrEqual(0.035 + 1e-9)
      expect(Math.abs(w.tilt)).toBeLessThanOrEqual(0.035 / 2 + 1e-9)
    }
  })

  it('actually varies between steps, or it is not wear at all', () => {
    const noses = Array.from({ length: 12 }, (_, i) => treadWear(i, 0.035).nose)
    expect(new Set(noses.map((n) => n.toFixed(4))).size).toBeGreaterThan(8)
  })
})

describe('a recess may not cut across a neighbour reveal', () => {
  const reveals = (windowData.windows as WindowSpec[]).map((w) => {
    const centre = windowCentreY(w, TOWER.groundY, TOWER.height)
    const face = innerRadiusAt(centre)
    return {
      id: w.id,
      azimuthDeg: w.azimuthDeg,
      halfWidthDeg: (w.innerWidth / 2 / Math.max(0.5, face)) * (180 / Math.PI),
      bottomY: centre - w.innerHeight / 2,
      topY: centre + w.innerHeight / 2,
    }
  })

  it('catches the clash that was in the built model', () => {
    /*
     * upper-2's step blocks stood inside upper-1's reveal — measured at radius
     * 6.63 and 7.08 on the line of sight through that opening. The two slits are
     * 4° apart and a recess subtends about 14°, so one cannot help crossing the
     * other.
     */
    const w = (windowData.windows as WindowSpec[]).find((x) => x.id === 'upper-2')!
    const { above, floorY } = innerSillAbove(w)
    const plan = planEmbrasure(above, floorY, PLAYER.eyeHeight, E.riserTarget, E.going, E.platformDepth)!
    const face = innerRadiusAt(plan.platformY)
    const mouth = w.innerWidth + 0.24
    expect(
      embrasureFoulsReveal(
        {
          id: w.id,
          azimuthDeg: w.azimuthDeg,
          halfWidthDeg: (mouth / 2 / face) * (180 / Math.PI),
          bottomY: floorY,
          topY: plan.platformY + PLAYER.eyeHeight + 0.45,
        },
        reveals,
      ),
    ).not.toBeNull()
  })

  it('lets an isolated recess through', () => {
    const w = (windowData.windows as WindowSpec[]).find((x) => x.id === 'lower-2')!
    const { above, floorY } = innerSillAbove(w)
    const plan = planEmbrasure(above, floorY, PLAYER.eyeHeight, E.riserTarget, E.going, E.platformDepth)!
    const face = innerRadiusAt(plan.platformY)
    const mouth = w.innerWidth + 0.24
    expect(
      embrasureFoulsReveal(
        {
          id: w.id,
          azimuthDeg: w.azimuthDeg,
          halfWidthDeg: (mouth / 2 / face) * (180 / Math.PI),
          bottomY: floorY,
          topY: plan.platformY + PLAYER.eyeHeight + 0.45,
        },
        reveals,
      ),
    ).toBeNull()
  })
})
