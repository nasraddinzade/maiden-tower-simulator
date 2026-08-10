/**
 * The openings the application ships with, laid out from the CONFIG's own stair
 * settings. Test fixture only — not collected by vitest (include is
 * `src/**\/*.test.ts`) and imported by no production module.
 *
 * It exists because five test files need the same list and each of them used to
 * read src/data/windows.json directly. That was fine while an opening's azimuth
 * lived in the file; since 2026-08-10 an opening is the end of a flight, and a
 * test that rebuilds the flight plan its own way is testing a different tower
 * from the one the app cuts. One derivation, one place to correct it.
 *
 * NOTE that this uses the config defaults, not the leva panel's live values. It
 * therefore answers "what does the shipped configuration produce", which is the
 * right question for a test and the wrong one for the app — see the flightPlan
 * memo in App.tsx.
 */

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
  passageEndAnchors,
  planPassageOpenings,
  type PassageOpening,
} from './passageOpenings'
import { windowCentreY, type ChamberWindowSpec } from './windows'
import type { WindowCut } from './towerShell'
import windowData from '../data/windows.json'

export const CHAMBER_WINDOWS = windowData.chamberOpenings as unknown as ChamberWindowSpec[]

export const SHIPPED_FLIGHTS = planAllFlights(stairSettings(), WALL_LIFTS, innerRadiusAt)

export const SHIPPED_TUBES = stairPassageSections(
  SHIPPED_FLIGHTS,
  STAIR.width,
  PLAYER.stairHeadroom,
  innerRadiusAt,
  undefined,
  STAIR.doorwayWidth,
)

/** All twelve ends, built and withheld alike. */
export const SHIPPED_ENDS: PassageOpening[] = planPassageOpenings({
  anchors: passageEndAnchors(SHIPPED_FLIGHTS, SHIPPED_TUBES, (i, end) =>
    end === 'foot' ? WALL_LIFTS[i].fromY : WALL_LIFTS[i].toY,
  ),
  fittings: windowData.passageOpenings as never,
  liftLabel: (i) => ({
    from: WALL_LIFTS[i].fromFloorNumber,
    to: WALL_LIFTS[i].toFloorNumber,
  }),
  cfg: PASSAGE_OPENING,
  buttress: BUTTRESS,
  outerRadius: TOWER.outerRadius,
  buttressTopY: Math.min(ENTRANCE.groundY - 0.5 + TOWER.height, TOWER.topY),
  towerTopY: TOWER.topY,
})

/** Exactly what the shell is cut with: the built ends plus the arched window. */
export const SHIPPED_CUTS: WindowCut[] = [
  ...SHIPPED_ENDS.filter((o) => o.built).map((o) => ({
    id: o.id,
    azimuthDeg: o.azimuthDeg,
    centreY: o.centreY,
    outerWidth: o.outerWidth,
    outerHeight: o.outerHeight,
    innerWidth: o.innerWidth,
    innerHeight: o.innerHeight,
    revealEndRadius: o.revealEndRadius,
    head: o.head,
    barrierAt: o.barrierAt,
    clipAgainstStairBearing: false,
  })),
  ...CHAMBER_WINDOWS.map((w) => {
    const centreY = windowCentreY(w, TOWER.groundY, TOWER.height)
    return {
      id: w.id,
      azimuthDeg: w.azimuthDeg,
      centreY,
      outerWidth: w.outerWidth,
      outerHeight: w.outerHeight,
      innerWidth: w.innerWidth,
      innerHeight: w.innerHeight,
      revealEndRadius: innerRadiusAt(centreY),
      head: w.head,
      barrierAt: w.barrierAt,
      clipAgainstStairBearing: true,
    }
  }),
]
