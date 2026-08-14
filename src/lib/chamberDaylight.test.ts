/**
 * HOW MANY ROOMS IN THIS TOWER CAN SEE THE SKY, asserted as a number so that the
 * day it changes, it changes loudly.
 *
 * THE COUNT IS FOUR OF EIGHT. Storeys 2, 3, 4 and 5 — the whole middle of the
 * building — have no sight line to daylight at all from their own axis at eye
 * height. That has been true of this model since the openings moved to the ends
 * of the stair passages on 2026-08-10 and nothing in it said so: `built` reports
 * that a SLIT reaches daylight, which is a fact about the passage, and the
 * chambers were never asked. lib/chamberDaylight.ts asks them; this file pins
 * the answer.
 *
 * WHY A NUMBER AND NOT A DESCRIPTION. Two of those four are dark because of
 * STAIR_FROM_BUTTRESS_DEG, which is [OWNER]'s "about a quarter" said by eye and
 * worth ±15°, and which he has not ruled on. head-2-3 and head-3-4 are the only
 * openings that serve storeys 3 and 4, both stand inside the pier at 90, and
 * both come out of it at 90 + 11.09. So the count is a quantity that one
 * unresolved decision moves from four to six. Written as prose it would be
 * re-argued every time the stair turns, exactly as WELL.azimuthDeg's clearance
 * was; written as a test it fails out loud on the day the turn is made, and the
 * reader of that failure is told what it cost and what it bought.
 *
 * NOTHING HERE MAY BE USED TO CHOOSE A BEARING (rule 7). A test that says "six
 * is better than four" would be fitting the building to a preference about the
 * building. It says what each bearing yields and stops, and the last test in the
 * third block is there to take the temptation away: the count does not climb with
 * the turn. It is 4 at +0, 6 at +11.09, 5 at +45 and 6 again at +90. There is no
 * brightest bearing to tune toward, only a bearing the owner knows.
 *
 * CLAUDE.md rule 6: every assertion below is arithmetic on azimuths and heights.
 */
import { describe, expect, it } from 'vitest'
import {
  BUTTRESS,
  ENTRANCE,
  FLOORS,
  PASSAGE_OPENING,
  ROOF,
  STAIR,
  TOWER,
  WALL_LIFTS,
  innerRadiusAt,
  stairSettings,
} from '../config/tower'
import { PLAYER } from '../config/player'
import { planAllFlights, stairDoorways, stairPassageSections } from './staircase'
import {
  passageEndAnchors,
  planPassageOpenings,
  type OpeningFitting,
  type PassageOpening,
} from './passageOpenings'
import { OPENING_FITTINGS, SHIPPED_DOORWAYS, SHIPPED_ENDS } from './openings.fixture'
import {
  chamberDaylight,
  darkChambers,
  litChamberCount,
  type ChamberDaylight,
  type ChamberDaylightInput,
} from './chamberDaylight'

const DEG = Math.PI / 180
const BEAK_TOP_Y = Math.min(ENTRANCE.groundY - 0.5 + TOWER.height, TOWER.topY)

const ENTRANCE_HOLE = {
  azimuthDeg: ENTRANCE.azimuthDeg,
  width: ENTRANCE.width,
  height: ENTRANCE.height,
  thresholdY: ENTRANCE.thresholdY,
}

/** The tower as shipped, swept. */
const SHIPPED: ChamberDaylightInput = {
  floors: FLOORS,
  doorways: SHIPPED_DOORWAYS,
  openings: SHIPPED_ENDS,
  entrance: ENTRANCE_HOLE,
  buttress: BUTTRESS,
  buttressTopY: BEAK_TOP_Y,
  outerRadius: TOWER.outerRadius,
  eyeHeight: PLAYER.eyeHeight,
}

const CHAMBERS = chamberDaylight(SHIPPED)
const of = (n: number) => CHAMBERS.find((c) => c.floorNumber === n)!

/**
 * The whole building replanned at a different quarter turn — the stair, its
 * doorways and its slits together, because they are three views of one bearing.
 *
 * It is stairBearing.test.ts's `layout()` with the doorways added and the sweep
 * on the end. The buttress does NOT turn: STAIR.startAzimuthDeg is written as
 * BUTTRESS.azimuthDeg + STAIR_FROM_BUTTRESS_DEG, so turning the beak carries
 * every opening round with it and changes nothing — which that file proves at
 * six bearings and this one therefore need not re-prove.
 */
function sweptAtQuarterTurn(fromButtressDeg: number): ChamberDaylight[] {
  const settings = stairSettings({ startAzimuthDeg: BUTTRESS.azimuthDeg + fromButtressDeg })
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
  const landingY = (i: number, end: 'foot' | 'head') =>
    end === 'foot' ? WALL_LIFTS[i].fromY : WALL_LIFTS[i].toY
  const openings = planPassageOpenings({
    anchors: passageEndAnchors(flights, tubes, landingY),
    fittings: OPENING_FITTINGS as OpeningFitting[],
    liftLabel: (i) => ({ from: WALL_LIFTS[i].fromFloorNumber, to: WALL_LIFTS[i].toFloorNumber }),
    cfg: PASSAGE_OPENING,
    buttress: BUTTRESS,
    outerRadius: TOWER.outerRadius,
    buttressTopY: BEAK_TOP_Y,
    towerTopY: TOWER.topY,
  })
  const doorways = stairDoorways(
    flights,
    settings.width,
    PLAYER.height + 0.35,
    innerRadiusAt,
    landingY,
    ROOF.masonryTopY,
    WALL_LIFTS.map((l) => l.opensAtY),
    STAIR.doorwayWidth,
  )
  return chamberDaylight({ ...SHIPPED, doorways, openings })
}

/** Shortest signed difference a − b, in (−180, 180]. */
const delta = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180

/**
 * Half the arc a hole of this width subtends AT THE AXIS, which is where the
 * walker's eye is. Not the half-angle it subtends at its own centre: a ray from
 * the middle of the room crosses the drum face, so the chord is what matters.
 */
const halfArcDeg = (width: number, radius: number) => Math.asin(width / 2 / radius) / DEG

/** Every doorway standing on the same landing as this end. */
const doorwaysAtLandingOf = (o: PassageOpening) =>
  SHIPPED_DOORWAYS.filter((d) => Math.abs(d.bottomY - o.landingY) < 0.6)

const BUILT = SHIPPED_ENDS.filter((o) => o.built)

/**
 * Half the arc ONE SLIT subtends at the axis. Read off the openings themselves
 * rather than from the config: the mouth's width is an editable fitting in
 * src/data/windows.json, and a constant repeated here would be a second copy of
 * it that could drift.
 */
const SLIT_HALF_DEG = halfArcDeg(BUILT[0].outerWidth, TOWER.outerRadius)

describe('the number, and it is four chambers out of eight', () => {
  it('lights storeys 1, 6, 7 and 8 and leaves 2, 3, 4 and 5 with no sight line at all', () => {
    /*
     * THE ASSERTION THIS WHOLE FILE EXISTS FOR. If it fails, the tower's
     * daylight has changed, and whoever changed it owes the commit message an
     * account of which room gained or lost a view and why.
     */
    expect(litChamberCount(CHAMBERS)).toBe(4)
    expect(darkChambers(CHAMBERS)).toEqual([2, 3, 4, 5])
    expect(CHAMBERS.filter((c) => c.lit).map((c) => c.floorNumber)).toEqual([1, 6, 7, 8])
    // and `lit` is not a second opinion: it is whether the sweep found any arc
    for (const c of CHAMBERS) expect(c.lit, `storey ${c.floorNumber}`).toBe(c.arcDeg > 0)
  })

  it('gives the whole building fourteen degrees of sky, and half of it to the door', () => {
    /*
     * Every dark chamber contributes exactly zero, so the total is a fact about
     * four rooms. Fourteen degrees out of 2880 (eight rooms × 360) is 0.49% of
     * the sky the model's chambers could in principle see.
     */
    const total = CHAMBERS.reduce((s, c) => s + c.arcDeg, 0)
    expect(total).toBeCloseTo(14.196, 2)
    expect(of(1).arcDeg / total).toBeGreaterThan(0.5)
    for (const n of [2, 3, 4, 5]) expect(of(n).arcDeg, `storey ${n}`).toBe(0)
  })
})

describe('why a head lights the room and a foot lights only the passage', () => {
  it('puts every head’s slit inside a doorway on its own landing', () => {
    /*
     * THE MECHANISM, and it is the whole of the finding. At a head the doorway
     * and the slit stand on the SAME side of the last tread — both on the
     * landing between the top step and the end cap — so their arcs overlap and
     * there is a line of sight from the room, through the passage, to the sky.
     * Measured, the two centres are 3.4–4.0° apart against a doorway half-arc of
     * 6.2–7.3°.
     */
    const heads = BUILT.filter((o) => o.end === 'head')
    expect(heads.length).toBeGreaterThan(0)
    for (const o of heads) {
      const gaps = doorwaysAtLandingOf(o).map((d) => ({
        gap: Math.abs(delta(o.azimuthDeg, d.azimuthDeg)),
        half: d.widthDeg / 2,
      }))
      const nearest = gaps.reduce((a, b) => (a.gap < b.gap ? a : b))
      expect(nearest.gap, `${o.id} offset`).toBeLessThan(4.0)
      expect(nearest.gap, `${o.id} overlap`).toBeLessThan(nearest.half + SLIT_HALF_DEG)
    }
  })

  it('puts every foot’s slit 13.5–16.4° outside every doorway on its landing', () => {
    /*
     * And at a foot the doorway is on the OTHER side of the first tread: you
     * come through it half a flight-width along the climb, while the slit stays
     * behind you on the landing. Nothing lines up, so the light falls on the
     * steps and never reaches the room. The clear stone between the two arcs is
     * 5.9° at the tightest of the six.
     */
    const feet = BUILT.filter((o) => o.end === 'foot')
    expect(feet.length).toBe(6)
    for (const o of feet) {
      const gaps = doorwaysAtLandingOf(o).map((d) => ({
        gap: Math.abs(delta(o.azimuthDeg, d.azimuthDeg)),
        half: d.widthDeg / 2,
      }))
      const nearest = gaps.reduce((a, b) => (a.gap < b.gap ? a : b))
      expect(nearest.gap, `${o.id} offset`).toBeGreaterThan(13.5)
      expect(nearest.gap, `${o.id} offset`).toBeLessThan(16.4)
      for (const g of gaps) {
        expect(g.gap, `${o.id} clear of doorway`).toBeGreaterThan(g.half + SLIT_HALF_DEG)
      }
    }
  })

  it('lights a chamber through the SLIT’s width and never the doorway’s', () => {
    /*
     * Which of the two holes is the aperture, settled by arithmetic rather than
     * by inspection: a slit is 0.4 m at the drum face and a doorway is five
     * times wider, so the band a room gets is the slit's own 2.778° and the
     * doorway is never the thing in the way. Storey 7 is the exception and it is
     * not the doorway that takes it — see the pier, below.
     */
    for (const o of BUILT) expect(o.outerWidth, o.id).toBeCloseTo(BUILT[0].outerWidth, 9)
    expect(SLIT_HALF_DEG * 2).toBeCloseTo(2.778, 3)
    for (const n of [6, 8]) {
      expect(of(n).bands).toHaveLength(1)
      expect(of(n).arcDeg, `storey ${n}`).toBeCloseTo(SLIT_HALF_DEG * 2, 3)
    }
    expect(of(6).bands[0].through).toBe('head-4-6')
    expect(of(8).bands[0].through).toBe('head-7-8')
  })

  it('leaves storey 5 with a doorway that stands at no passage end at all', () => {
    /*
     * The other kind of darkness, and no turn of the stair reaches it. Storey 5
     * is reached from the MIDDLE of the single 4→6 run, so its doorway is not at
     * an end of anything and the nearest slit is a whole storey away in height.
     * Storey 2's is the ordinary case: its only doorway is the foot of 2→3.
     */
    const five = SHIPPED_DOORWAYS.filter((d) => Math.abs(d.bottomY - FLOORS[4].floorY) < 0.6)
    expect(five).toHaveLength(1)
    for (const o of SHIPPED_ENDS) {
      expect(Math.abs(o.landingY - FLOORS[4].floorY), `${o.id}`).toBeGreaterThan(1)
    }
  })
})

describe('what the quarter turn costs, so the day it moves the count moves with it', () => {
  it('is worth exactly two rooms: four chambers at 90, six at 90 + 11.09', () => {
    /*
     * 11.09 is stairBearing.test.ts's bound — the smallest clockwise turn at
     * which no opening in the tower is cut into stone — and the two ends it
     * frees, head-2-3 and head-3-4, are the only openings that serve storeys 3
     * and 4. So the bound and the daylight are the same fact counted twice.
     *
     * THIS IS NOT AN ARGUMENT FOR TURNING IT. See the block below.
     */
    expect(litChamberCount(sweptAtQuarterTurn(90))).toBe(4)
    expect(darkChambers(sweptAtQuarterTurn(90))).toEqual([2, 3, 4, 5])

    const freed = sweptAtQuarterTurn(90 + 11.09)
    expect(litChamberCount(freed)).toBe(6)
    expect(darkChambers(freed)).toEqual([2, 5])
    expect(freed.find((c) => c.floorNumber === 3)!.bands[0].through).toBe('head-2-3')
    expect(freed.find((c) => c.floorNumber === 4)!.bands[0].through).toBe('head-3-4')
  })

  it(
    'cannot reach storeys 2 and 5 at any bearing the quarter turn could take',
    () => {
      /*
       * The line between the two causes, drawn by exhaustion rather than by
       * argument. Storeys 3 and 4 are dark because of where the pier is; storeys
       * 2 and 5 are dark because of what a foot is, and turning the stair through
       * a whole revolution never lights either of them. Coarse steps are enough:
       * the property is structural, and a bearing at which a foot's doorway
       * swallowed its own slit would have to hold over tens of degrees, not
       * fractions.
       */
      for (let turn = 0; turn < 360; turn += 15) {
        const dark = darkChambers(sweptAtQuarterTurn(90 + turn))
        expect(dark, `turn +${turn}`).toContain(2)
        expect(dark, `turn +${turn}`).toContain(5)
      }
    },
    // 24 whole towers replanned and swept ray by ray lands either side of
    // vitest's 5 s default depending on how warm the machine is — the same trap
    // appBoot's import fell into. Stated rather than paid for by coarsening the
    // sweep, which would weaken what the test can see.
    30_000,
  )

  it('does not brighten with the turn, so there is no bearing to tune toward', () => {
    /*
     * RULE 7, MADE ARITHMETIC. Anybody reading the test above is one step from
     * "so turn it until the tower lights up". The count is not monotonic and has
     * no interior maximum worth chasing: past +30 the head of 4→6 swings into
     * the pier and storey 6 goes dark, so +45 is WORSE than +11.09, and +90 is
     * level with it. Six is a ceiling reached by many bearings and by none of
     * them uniquely, which is what makes daylight useless as a way of choosing
     * one — and the reason the choice stays the owner's.
     */
    const at = (t: number) => litChamberCount(sweptAtQuarterTurn(90 + t))
    expect(at(11.09)).toBe(6)
    expect(at(45)).toBe(5)
    expect(at(45)).toBeLessThan(at(11.09))
    expect(at(90)).toBe(at(11.09))
  })
})

describe('what the pier takes off the top, over and above the ends it buries', () => {
  it('halves storey 7’s band although the slit that serves it is cut', () => {
    /*
     * head-6-7 stands 0.1292° clear of the beak's traced daylight edge — 18.6 mm
     * on the drum face, against a trace whose own nodes scatter 30 mm — so the
     * opening counts as reaching daylight and is cut. What the walker gets is
     * another matter: the band starts AT the pier's edge and the beak eats the
     * 45% of the slit's mouth that lies clockwise of it. A per-slit check cannot
     * see this; only a ray-by-ray sweep can, which is why the sweep takes the
     * buttress rather than trusting `built`.
     */
    const edgeDeg = BUTTRESS.azimuthDeg - BUTTRESS.skewDeg + BUTTRESS.rootArcDeg / 2
    expect(edgeDeg).toBeCloseTo(113.5, 6)
    expect(of(7).bands).toHaveLength(1)
    expect(of(7).bands[0].fromDeg).toBeCloseTo(edgeDeg, 3)
    expect(of(7).arcDeg).toBeCloseTo(1.518, 3)
    // …and it is the pier and nothing else: lift the beak away and the full slit returns
    const noBeak = chamberDaylight({ ...SHIPPED, buttress: undefined })
    expect(noBeak.find((c) => c.floorNumber === 7)!.arcDeg).toBeCloseTo(SLIT_HALF_DEG * 2, 3)
    // which does NOT light the two the beak buries — those ends are not cut at all
    expect(darkChambers(noBeak)).toEqual([2, 3, 4, 5])
  })
})

describe('storey 1, the one chamber that owes the stair nothing', () => {
  it('sees the sky through the west door and through nothing else', () => {
    expect(of(1).bands).toHaveLength(1)
    expect(of(1).bands[0].through).toBe('entrance')
    const noDoor = chamberDaylight({ ...SHIPPED, entrance: undefined })
    expect(noDoor.find((c) => c.floorNumber === 1)!.lit).toBe(false)
    expect(litChamberCount(noDoor)).toBe(3)
  })

  it('is narrowed by the arch over that door, not by its width', () => {
    /*
     * A check that the sweep reads the HEAD of an opening and not a rectangle
     * standing in for it. The doorway is 1.1 m wide, which is 7.650° seen from
     * the axis. The eye at 1.65 m stands 0.20 m above the springing of a
     * semicircular head struck at 0.55 m radius, so the clear half-span there is
     * √(0.55² − 0.20²) = 0.512 m and the band closes to 7.121°.
     */
    const half = Math.sqrt(0.55 ** 2 - (PLAYER.eyeHeight - (ENTRANCE.height - 0.55)) ** 2)
    expect(of(1).arcDeg).toBeCloseTo(2 * halfArcDeg(2 * half, TOWER.outerRadius), 3)
    expect(of(1).arcDeg).toBeCloseTo(7.121, 3)
    expect(of(1).arcDeg).toBeLessThan(2 * halfArcDeg(ENTRANCE.width, TOWER.outerRadius))
  })
})
