import { describe, expect, it } from 'vitest'
import {
  ENTRANCE,
  FLOORS,
  STAIR,
  WALL_LIFTS,
  WATER,
  WELL,
  innerRadiusAt,
  stairSettings,
} from '../config/tower'
import { planAllFlights, stairDoorways } from './staircase'
import { SHIPPED_CUTS } from './openings.fixture'

const flights = planAllFlights(stairSettings(), WALL_LIFTS, innerRadiusAt)
const doorways = stairDoorways(
  flights,
  STAIR.width,
  ENTRANCE.height,
  innerRadiusAt,
  (i: number, end: 'foot' | 'head') => (end === 'foot' ? WALL_LIFTS[i].fromY : WALL_LIFTS[i].toY),
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
     * doorways come out at about az 15 since the flights moved to start at 100,
     * so a visitor leaving the stair on storey 3 walked into a 0.30 m pipe
     * standing across the opening. The owner photographed it.
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
     */
    const clashes: string[] = []
    for (const w of SHIPPED_CUTS) {
      const half = chaseHalfDeg(FLOORS[WELL.startsAtFloorIndex].floorY)
      const wHalf = (w.innerWidth / 2 / w.revealEndRadius) * (180 / Math.PI)
      if (sep(WELL.azimuthDeg, w.azimuthDeg) < half + wHalf) clashes.push(w.id)
    }
    expect(clashes).toEqual([])
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
