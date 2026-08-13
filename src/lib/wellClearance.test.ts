import { describe, expect, it } from 'vitest'
import {
  ENTRANCE,
  FLOORS,
  STAIR,
  TOWER,
  WALL_LIFTS,
  WATER,
  WELL,
  innerRadiusAt,
  stairSettings,
} from '../config/tower'
import { planAllFlights, stairDoorways } from './staircase'
import { downpipeChases } from './waterSystem'
import { SHIPPED_CUTS } from './openings.fixture'

const flights = planAllFlights(stairSettings(), WALL_LIFTS, innerRadiusAt)
const doorways = stairDoorways(
  flights,
  STAIR.width,
  ENTRANCE.height,
  innerRadiusAt,
  (i: number, end: 'foot' | 'head') => (end === 'foot' ? WALL_LIFTS[i].fromY : WALL_LIFTS[i].toY),
  TOWER.topY,
  WALL_LIFTS.map((l) => l.opensAtY),
  STAIR.doorwayWidth,
)

/** Half the arc the downpipe's chase occupies, in degrees, at a height. */
function chaseHalfDeg(y: number) {
  return ((WATER.downpipeDiameter * 2.2) / 2 / innerRadiusAt(y)) * (180 / Math.PI)
}

const sep = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

describe('the downpipe stands clear of everything a visitor walks through', () => {
  it('is not in a stair doorway', () => {
    /*
     * IT WAS. The chase is cut down the room-side face and the stair's head
     * doorways came out at about az 15 when the flights started at 100, so a
     * visitor leaving the stair on storey 3 walked into a 0.30 m pipe standing
     * across the opening. The owner photographed it.
     *
     * [2026-08-13] The stair turned a quarter of the drum and the doorways came
     * round with it: the feet are at about 191 and the roof climb's at 205.0,
     * which is the closest anything gets to the chase at 230 — 14.5° clear. The
     * fault this test was written for has not recurred, but the margin has gone
     * from three figures of arc to two, so it is now doing real work.
     */
    const clashes: string[] = []
    for (const d of doorways) {
      const half = chaseHalfDeg((d.bottomY + d.topY) / 2)
      if (sep(WELL.azimuthDeg, d.azimuthDeg) < half + d.widthDeg / 2) {
        clashes.push(`doorway at az ${d.azimuthDeg.toFixed(1)}, y ${d.bottomY.toFixed(2)}`)
      }
    }
    expect(clashes).toEqual([])
  })

  it('is not in a window reveal', () => {
    /*
     * NEARLY A DUPLICATE OF THE STAIR TEST NOW, and it is kept anyway.
     *
     * EVERY opening is an end of a flight since [OWNER] 2026-08-10 — the arched
     * window, which had a bearing of its own and was the one thing this could
     * catch that the stair test could not, went out with `chamberOpenings` when
     * he restated the rule. So "clear of the reveals" is now largely implied by
     * "clear of the arc the stair sweeps" below. Kept because the implication
     * runs the wrong way to rely on: a reveal reaches OUT from the passage cheek
     * to the drum face, so an opening can foul the chase at a radius the passage
     * never occupies — and because which ends are cut is a [PLACEHOLDER] that
     * moves the day the owner answers, at which point this may start catching
     * something again.
     *
     * The premise the old version rested on is also gone and should not be
     * quietly reused: WELL.azimuthDeg = 230 was chosen partly because "the slit
     * columns stand between 123 and 170". No slit stands there now. The value
     * survives its own re-check on other grounds; see the note in config.
     *
     * IT NOW ASKS ABOUT HEIGHT, AND IT HAD TO. On 2026-08-13 the stair turned a
     * quarter of the drum and this test failed on foot-8-9 — azimuth 218.5
     * against a chase at 230, the two overlapping by 0.2° once both half-widths
     * are counted. They do not touch: the chase's topmost length ends at the
     * storey-7 springing, 21.79, and that reveal starts at 23.77, so there is
     * 1.98 m of masonry between them. The old version compared bearings alone and
     * borrowed one half-angle from storey 3 for every opening in the tower, so it
     * could not see that. Giving it the second dimension is a correction, not a
     * relaxation — and downpipeChases() is now the one place either side is
     * derived, because App.tsx and this file used to build the chase separately.
     */
    const chases = downpipeChases(
      FLOORS,
      WATER.channelFloorRange,
      WELL.startsAtFloorIndex,
      WELL.azimuthDeg,
      WATER.downpipeDiameter,
    )
    expect(chases.map((c) => c.floorIndex)).toEqual([2, 3, 4, 5, 6])

    const clashes: string[] = []
    for (const w of SHIPPED_CUTS) {
      const wHalf = (w.innerWidth / 2 / w.revealEndRadius) * (180 / Math.PI)
      const sill = w.centreY - w.outerHeight / 2
      const head = w.centreY + w.outerHeight / 2
      for (const c of chases) {
        if (head < c.bottomY || sill > c.topY) continue
        const half = chaseHalfDeg((c.bottomY + c.topY) / 2)
        if (sep(c.azimuthDeg, w.azimuthDeg) < half + wHalf) {
          clashes.push(`${w.id} against the chase on storey ${c.floorIndex + 1}`)
        }
      }
    }
    expect(clashes).toEqual([])
  })

  it('clears the nearest reveal in bearing by 11° and in height by 1.9 m', () => {
    /*
     * The margin the test above passes on, written down, because "no clash" hides
     * how close the near miss is. foot-8-9 is 11.5° from the chase's bearing
     * against a combined half-width of 11.7° — i.e. they DO overlap in plan, and
     * only the vertical gap keeps them apart. If the downpipe were ever carried a
     * storey higher, or that opening's landing lowered, this becomes a real
     * collision and not a bookkeeping one.
     */
    const worst = SHIPPED_CUTS.map((w) => ({
      id: w.id,
      gap: sep(WELL.azimuthDeg, w.azimuthDeg),
    })).reduce((a, b) => (b.gap < a.gap ? b : a))
    expect(worst.id).toBe('foot-8-9')
    expect(worst.gap).toBeGreaterThan(11)
    expect(worst.gap).toBeLessThan(12)

    const chases = downpipeChases(
      FLOORS,
      WATER.channelFloorRange,
      WELL.startsAtFloorIndex,
      WELL.azimuthDeg,
      WATER.downpipeDiameter,
    )
    const top = Math.max(...chases.map((c) => c.topY))
    const sill = SHIPPED_CUTS.find((w) => w.id === 'foot-8-9')!.centreY - 1.9 / 2
    expect(sill - top).toBeGreaterThan(1.9)
  })

  it('is not in the entrance passage', () => {
    const half = chaseHalfDeg(0)
    const eHalf = (ENTRANCE.width / 2 / innerRadiusAt(0)) * (180 / Math.PI)
    expect(sep(WELL.azimuthDeg, ENTRANCE.azimuthDeg)).toBeGreaterThan(half + eHalf)
  })

  it('is not inside the arc the stair sweeps', () => {
    /*
     * Not just the doorways: the chase runs the full height of several storeys,
     * and the passage behind the wall face is where the flights are. A pipe in
     * the flight is as wrong as a pipe in the door.
     */
    for (const flight of flights) {
      for (const step of flight) {
        expect(sep(WELL.azimuthDeg, step.azimuthDeg)).toBeGreaterThan(
          chaseHalfDeg(step.treadY) + (STAIR.width / 2 / step.midRadius) * (180 / Math.PI),
        )
      }
    }
  })
})
