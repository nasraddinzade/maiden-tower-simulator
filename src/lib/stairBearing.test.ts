/**
 * WHERE THE STAIR STANDS IN THE WALL, and the day the footage caught it wrong.
 *
 * On 2026-08-14 the owner's walkthrough falsified one of this model's openings
 * outright. head-3-4 — the landing at the top of the climb from storey 3 to
 * storey 4 — is placed at azimuth 105.5, one degree anticlockwise of the beak's
 * own axis, facing 10.64 m of solid pier, and the model withholds the opening as
 * blind. up/098, down/138 and down/139 show a two-centred pointed window at that
 * landing with the casement open, looking down on a multi-lane carriageway with
 * moving traffic, a car park and people walking on the paving.
 *
 * FOUR ASSUMPTIONS COULD HAVE GIVEN WAY AND EXACTLY ONE DID. What is tested here
 * is the half of that ruling which is arithmetic, because the other half — the
 * frames, the identification of the opening, the reading of the photograph — is
 * not something a test can hold. Specifically:
 *
 *   · that the buttress bearing CANNOT be the culprit, which is a rigidity
 *     property of how STAIR.startAzimuthDeg is defined and not a matter of
 *     opinion at all;
 *   · how far the stair would have to turn, in each sense, with the answer
 *     coming out of the same beak outline the shell is extruded from;
 *   · that the sense is decided — the anticlockwise escape is not merely less
 *     likely, it is on the wrong side of the measurement by fifty degrees;
 *   · that the measured HEIGHT of the arched opening agrees with this model's
 *     while its BEARING does not, which is what makes the disagreement a finding
 *     about one number rather than noise about the whole flight.
 *
 * NOTHING HERE TURNS ANYTHING. STAIR_FROM_BUTTRESS_DEG is still the 90 of
 * [OWNER]'s "about a quarter" — see config/tower.ts for why that is deliberate,
 * and STAIR_BEARING_QUESTION for the one sentence that would close it.
 *
 * CLAUDE.md rule 6: every assertion below is azimuth arithmetic.
 */
import { describe, expect, it } from 'vitest'
import {
  BUTTRESS,
  ENTRANCE,
  PASSAGE_OPENING,
  STAIR,
  TOWER,
  WALL_LIFTS,
  innerRadiusAt,
  stairSettings,
} from '../config/tower'
import { PLAYER } from '../config/player'
import { planAllFlights, stairPassageSections } from './staircase'
import {
  buttressDepthAt,
  openButBlindEnds,
  passageEndAnchors,
  planPassageOpenings,
  rotationToDaylightDeg,
  type ButtressPlan,
  type OpeningFitting,
} from './passageOpenings'
import windowData from '../data/windows.json'

const FITTINGS = windowData.passageOpenings as unknown as OpeningFitting[]
const MEASURED = windowData.footageReading.pointedWindowBearing.measured
const BEAK_TOP_Y = Math.min(ENTRANCE.groundY - 0.5 + TOWER.height, TOWER.topY)

/** Shortest signed difference a − b, in (−180, 180]. */
const delta = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180

/** The whole opening layout, for a given buttress bearing and quarter turn. */
function layout(buttressAzimuthDeg = BUTTRESS.azimuthDeg, fromButtressDeg = 90) {
  const buttress: ButtressPlan = { ...BUTTRESS, azimuthDeg: buttressAzimuthDeg }
  const settings = stairSettings({
    startAzimuthDeg: buttressAzimuthDeg + fromButtressDeg,
  })
  const flights = planAllFlights(settings, WALL_LIFTS, innerRadiusAt)
  const tubes = stairPassageSections(
    flights,
    settings.width,
    PLAYER.stairHeadroom,
    innerRadiusAt,
    TOWER.topY,
    undefined,
    STAIR.doorwayWidth,
  )
  const anchors = passageEndAnchors(flights, tubes, (i, end) =>
    end === 'foot' ? WALL_LIFTS[i].fromY : WALL_LIFTS[i].toY,
  )
  return planPassageOpenings({
    anchors,
    fittings: FITTINGS,
    liftLabel: (i) => ({
      from: WALL_LIFTS[i].fromFloorNumber,
      to: WALL_LIFTS[i].toFloorNumber,
    }),
    cfg: PASSAGE_OPENING,
    buttress,
    outerRadius: TOWER.outerRadius,
    buttressTopY: BEAK_TOP_Y,
    towerTopY: TOWER.topY,
  })
}

const BASE = layout()
const HEAD_3_4 = BASE.find((o) => o.id === 'head-3-4')!

describe('the opening the footage falsified', () => {
  it('is the one end where the record says open and the geometry says pier', () => {
    /*
     * The whole of the finding, as the model itself reports it. Both halves have
     * to hold: an end ruled open by [VIDEO], and that same end blind on the
     * arithmetic — and no other end in either condition, or the disagreement
     * would be about the daylight check rather than about the bearing.
     */
    expect(openButBlindEnds(BASE).map((o) => o.id)).toEqual(['head-3-4'])
    expect(HEAD_3_4.open).toBe(true)
    expect(HEAD_3_4.blindBecause).toBe('buttress')
    expect(HEAD_3_4.buttressDepth).toBeGreaterThan(10)
    expect(HEAD_3_4.built).toBe(false)
  })

  it('sits inside the beak’s root arc rather than merely near its edge', () => {
    // [OSM] root arc 72.7 → 113.5; a window one degree off the beak's own axis
    expect(delta(HEAD_3_4.azimuthDeg, BUTTRESS.azimuthDeg)).toBeCloseTo(-1.2, 1)
    expect(buttressDepthAt(HEAD_3_4.azimuthDeg, BUTTRESS, TOWER.outerRadius)).toBeGreaterThan(10)
  })
})

describe('the buttress bearing cannot be the assumption that gives way', () => {
  it('carries every opening round with it, so the bearing relative to the pier never moves', () => {
    /*
     * THE ARGUMENT THAT SETTLES (d), AND IT IS RIGIDITY, NOT EVIDENCE.
     * STAIR.startAzimuthDeg is written as BUTTRESS.azimuthDeg + a constant. Turn
     * the beak and the stair, the landings and the openings all turn with it, so
     * whether a given end faces pier or daylight is untouched. Task One's roof
     * panorama also declined to refute 106.7, but that reading is worth ±20° and
     * this does not depend on it.
     */
    for (const beak of [66.7, 86.7, 106.7, 126.7, 186.7, 286.7]) {
      const head = layout(beak).find((o) => o.id === 'head-3-4')!
      expect(delta(head.azimuthDeg, beak), `beak ${beak}`).toBeCloseTo(-1.2, 1)
      expect(head.buttressDepth, `beak ${beak}`).toBeCloseTo(HEAD_3_4.buttressDepth, 6)
      expect(head.reachesDaylight, `beak ${beak}`).toBe(false)
    }
  })

  it('leaves the same turn to be made whatever the beak’s bearing is', () => {
    for (const beak of [66.7, 106.7, 286.7]) {
      const head = layout(beak).find((o) => o.id === 'head-3-4')!
      const r = rotationToDaylightDeg(
        head.azimuthDeg,
        { ...BUTTRESS, azimuthDeg: beak },
        TOWER.outerRadius,
      )
      expect(r.clockwise, `beak ${beak}`).toBeCloseTo(8.01, 1)
      expect(r.counterclockwise, `beak ${beak}`).toBeCloseTo(32.79, 1)
    }
  })
})

describe('how far the stair has to turn, and which way', () => {
  it('needs 8.01° clockwise to bring that landing out from behind the pier', () => {
    const r = rotationToDaylightDeg(HEAD_3_4.azimuthDeg, BUTTRESS, TOWER.outerRadius)
    expect(r.clockwise).toBeCloseTo(8.01, 2)
    expect(r.counterclockwise).toBeCloseTo(32.79, 2)
    // and the answer is a boundary of the same outline the shell is extruded from
    expect(buttressDepthAt(HEAD_3_4.azimuthDeg + r.clockwise + 0.01, BUTTRESS, TOWER.outerRadius))
      .toBe(0)
    expect(buttressDepthAt(HEAD_3_4.azimuthDeg + r.clockwise - 0.05, BUTTRESS, TOWER.outerRadius))
      .toBeGreaterThan(0)
  })

  it('needs 11.09° to leave no end blind at all, because head-2-3 is deeper in', () => {
    /*
     * The floor on STAIR_FROM_BUTTRESS_DEG, and it is a BOUND rather than an
     * estimate: 90 + 11.09 = 101.1 is the smallest quarter turn at which the
     * tower has no opening cut into stone. It says nothing about where inside
     * the allowed range the answer sits, and must never be averaged with the
     * measurement below to manufacture one that does.
     */
    const worst = Math.max(
      ...BASE.filter((o) => o.blindBecause === 'buttress').map(
        (o) => rotationToDaylightDeg(o.azimuthDeg, BUTTRESS, TOWER.outerRadius).clockwise,
      ),
    )
    expect(worst).toBeCloseTo(11.09, 1)
    for (const o of layoutHeads(90 + worst + 0.01)) expect(o.reachesDaylight, o.id).toBe(true)
  })

  it('turns rigidly, so one number moves every opening by the same arc', () => {
    // why the quarter turn is a single number and not a per-end correction
    for (const turn of [5, 15.1, 40]) {
      for (const o of layout(BUTTRESS.azimuthDeg, 90 + turn)) {
        const was = BASE.find((b) => b.id === o.id)!
        expect(delta(o.azimuthDeg, was.azimuthDeg), `${o.id} +${turn}`).toBeCloseTo(turn, 6)
      }
    }
  })

  it('is decided in sense by the measurement, not left as two branches', () => {
    /*
     * rotationToDaylightDeg offers both ways out. The photograph puts the arched
     * window at beak +13.9°, so the clockwise branch reaches the measurement and
     * the anticlockwise one runs away from it by fifty degrees. That is what
     * kills the reading of [OWNER]'s "to the right of the beak" as seen from the
     * ground — the layout the quarter turn replaced on 2026-08-13.
     */
    const r = rotationToDaylightDeg(HEAD_3_4.azimuthDeg, BUTTRESS, TOWER.outerRadius)
    const clockwise = delta(HEAD_3_4.azimuthDeg + r.clockwise, BUTTRESS.azimuthDeg)
    const anti = delta(HEAD_3_4.azimuthDeg - r.counterclockwise, BUTTRESS.azimuthDeg)
    expect(Math.abs(clockwise - MEASURED.beakRelativeDeg)).toBeLessThan(10)
    expect(Math.abs(anti - MEASURED.beakRelativeDeg)).toBeGreaterThan(45)
  })
})

describe('the exterior measurement, against the model it disagrees with', () => {
  it('agrees on the HEIGHT of the arched opening, which is what identifies it', () => {
    /*
     * The photograph knows nothing of this model's lift table, and lands 0.11 m
     * from its centreY for head-3-4. That is the lock on the identification and
     * it is also a clean bill for the flight arithmetic: the riser, the storey
     * heights and the landing levels put the top of that climb where the tower
     * has its one arched hole. If anybody moves the lift table, this fires.
     */
    expect(MEASURED.openingId).toBe('head-3-4')
    expect(Math.abs(MEASURED.heightM - HEAD_3_4.centreY)).toBeLessThan(MEASURED.heightUncertaintyM)
    expect(Math.abs(MEASURED.heightM - HEAD_3_4.centreY)).toBeLessThan(0.2)
  })

  it('disagrees on the BEARING by more than the uncertainty either side admits', () => {
    // 15.1° against ±4 measured and ±15 on "about a quarter" — a finding, not noise
    const modelled = delta(HEAD_3_4.azimuthDeg, BUTTRESS.azimuthDeg)
    const gap = MEASURED.beakRelativeDeg - modelled
    expect(gap).toBeCloseTo(15.1, 1)
    expect(gap).toBeGreaterThan(MEASURED.beakRelativeUncertaintyDeg)
    // and the gap clears the pier, which is the point of measuring it at all
    expect(gap).toBeGreaterThan(
      rotationToDaylightDeg(HEAD_3_4.azimuthDeg, BUTTRESS, TOWER.outerRadius).clockwise,
    )
  })

  it('lands the photographer on the avenue, which nothing in the construction forced', () => {
    // the camera bearing falls out of the junction and [OSM]'s root arc alone
    expect(
      Math.abs(MEASURED.impliedCameraBearingDeg - MEASURED.avenueNearestPointBearingDeg),
    ).toBeLessThan(1)
  })
})

/** Every head, replanned at a given quarter turn. */
function layoutHeads(fromButtressDeg: number) {
  return layout(BUTTRESS.azimuthDeg, fromButtressDeg).filter(
    (o) => o.end === 'head' && o.blindBecause !== 'parapet',
  )
}
