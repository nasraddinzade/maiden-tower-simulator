/**
 * HOW MANY ROOMS IN THIS TOWER CAN SEE THE SKY, asserted as a number so that the
 * day it changes, it changes loudly.
 *
 * THE COUNT IS SEVEN OF EIGHT. Only storey 5 has no sight line to daylight at
 * all from its own axis at eye height, and its darkness is structural: it is
 * reached from the MIDDLE of the single 4→6 run, so its doorway stands at no
 * passage end and there is no slit within a storey of it in height.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * IT WAS FOUR OF EIGHT UNTIL 2026-08-17, AND THAT COUNT WAS A SIGN ERROR.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * The three rooms that were dark and are not — storeys 2, 3 and 4 — were dark
 * because approachAzimuthDeg() put every FOOT doorway on the far side of its
 * first tread from the landing, while planPassageOpenings() centred the slit on
 * the landing. Doorway and slit ended up 13.5–16.4° apart round the drum with
 * solid stone between them, so a foot's light fell on the steps and never
 * reached the room it opened off. Straightened, a foot reads like a head — 3.3
 * to 4.1° apart, 10.2 to 12.6° of overlap — and each of those three rooms gets
 * about 2.6° of sky through its own way onto the stair.
 *
 * This file said so on 2026-08-16, in a paragraph headed "THREE OF THE FOUR ARE
 * A MODEL RULE AND NOT THE TOWER", and then left the four standing because the
 * bill looked too big to pay on the strength of a screenshot. The owner walked
 * the tower again and it was still there. It has been paid.
 *
 * AND THE QUARTER TURN IS NO LONGER WORTH TWO ROOMS — IT IS WORTH NONE. That was
 * this file's central finding and it does not survive: head-2-3 and head-3-4 are
 * NOT the only openings that serve storeys 3 and 4, because the feet below them
 * do it too, and the feet are nowhere near the pier. Swept every 15° through a
 * whole revolution the count is seven at twenty-two bearings of twenty-four and
 * six at the other two, where storey 2's own foot swings into the beak. So
 * STAIR_FROM_BUTTRESS_DEG has lost its most expensive consequence: turning it
 * still moves eleven openings, but it no longer decides whether the middle of
 * the building can see out. That is a smaller reason to press him for an answer,
 * and it is recorded here rather than quietly deleted because the old claim was
 * asserted loudly and in this file.
 *
 * NOTHING HERE MAY BE USED TO CHOOSE A BEARING (rule 7), and the temptation is
 * now smaller than the argument against it was.
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
import { archSpringHeight } from './doorwayArch'
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
    STAIR.doorwayHeight,
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

describe('the number, and it is seven chambers out of eight', () => {
  it('leaves only storey 5 with no sight line at all', () => {
    /*
     * THE ASSERTION THIS WHOLE FILE EXISTS FOR. If it fails, the tower's
     * daylight has changed, and whoever changed it owes the commit message an
     * account of which room gained or lost a view and why.
     */
    expect(litChamberCount(CHAMBERS)).toBe(7)
    expect(darkChambers(CHAMBERS)).toEqual([5])
    expect(CHAMBERS.filter((c) => c.lit).map((c) => c.floorNumber)).toEqual([1, 2, 3, 4, 6, 7, 8])
    // and `lit` is not a second opinion: it is whether the sweep found any arc
    for (const c of CHAMBERS) expect(c.lit, `storey ${c.floorNumber}`).toBe(c.arcDeg > 0)
  })

  it('gives the whole building thirty-one degrees of sky, a quarter of it to the door', () => {
    /*
     * Storey 5 contributes exactly zero, so the total is a fact about seven
     * rooms. Thirty-one degrees out of 2880 (eight rooms × 360) is 1.1% of the
     * sky the model's chambers could in principle see — still a dark building.
     *
     * 14.196 → 14.109 on 2026-08-16, when the walker's eye came down from 1.65 to
     * 1.50 m and the doorway heads from 2.100 to 1.688: storey 1 gained, the
     * three stair-lit rooms each lost a quarter of a degree to the curve of an
     * arch the eye now sits inside, and the two nearly cancelled.
     *
     * 14.109 → 29.385 on the morning of 2026-08-17, which is not a cancellation
     * of anything. Six FOOT slits started lighting the rooms they open off
     * instead of only the treads: storeys 2, 3 and 4 gained a band each where
     * they had none, and storeys 6, 7 and 8 gained a second band apiece on top
     * of the head's.
     *
     * 29.385 → 31.358 the same evening, and this one is the arch giving back the
     * quarter-degree it took in the paragraph above. The doorway stands on the
     * slit's own bearing now (approachAzimuthDeg), so the slit sits at the CROWN
     * of the arch instead of 3.3–4.1° off toward one springing, and the clear
     * half-span there is the arch's widest. NOTHING WAS LIT OR DARKENED BY IT:
     * seven rooms of eight before and after, the same eleven bands through the
     * same eleven holes, each of them now the full width of its own slit.
     *
     * The door is 24% of the tower's daylight, which is the honest way round for
     * a building with twelve slits in it.
     *
     * 31.358 → 31.387 on 2026-08-21, and all 0.029° of it is storey 1's: the
     * entrance head stopped being an invented 2.000 m and became a measured
     * 2.035 (ENTRANCE_HEIGHT_RATIO), which lifts the springing of its arch by
     * the same 35 mm and leaves the eye 0.015 m above it instead of 0.050. The
     * other seven rooms are untouched to the last decimal — the entrance is the
     * only opening in the census that is not a slit.
     */
    const total = CHAMBERS.reduce((s, c) => s + c.arcDeg, 0)
    expect(total).toBeCloseTo(31.387, 2)
    expect(of(1).arcDeg / total).toBeGreaterThan(0.24)
    expect(of(1).arcDeg / total).toBeLessThan(0.25)
    expect(of(5).arcDeg).toBe(0)
    // three rooms lit through a foot alone, three through a head and a foot
    for (const n of [2, 3, 4]) expect(of(n).bands, `storey ${n}`).toHaveLength(1)
    for (const n of [6, 7, 8]) expect(of(n).bands, `storey ${n}`).toHaveLength(2)
    for (const n of [2, 3, 4]) expect(of(n).bands[0].through).toMatch(/^foot-/)
  })
})

describe('why a head and a foot now light the room in the same way', () => {
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

  it('puts every foot’s slit inside a doorway on its landing too', () => {
    /*
     * AND A FOOT IS THE SAME MECHANISM NOW, which is the whole of the repair of
     * 2026-08-17. A foot's doorway used to sit on the OTHER side of the first
     * tread from its slit — you came through it half a flight-width along the
     * climb while the slit stayed behind you — and the clear stone between the
     * two arcs was 5.9° at the tightest of the six. Both are on the landing now,
     * at the same 3.3–4.1° a head has, because foot-N and head-(N−1) share that
     * landing and there was never a reason for the two to read differently.
     */
    const feet = BUILT.filter((o) => o.end === 'foot')
    expect(feet.length).toBe(6)
    for (const o of feet) {
      const gaps = doorwaysAtLandingOf(o).map((d) => ({
        gap: Math.abs(delta(o.azimuthDeg, d.azimuthDeg)),
        half: d.widthDeg / 2,
      }))
      const nearest = gaps.reduce((a, b) => (a.gap < b.gap ? a : b))
      expect(nearest.gap, `${o.id} offset`).toBeLessThan(4.1)
      expect(nearest.gap, `${o.id} overlap`).toBeLessThan(nearest.half + SLIT_HALF_DEG)
    }
  })

  it('lights a chamber through the SLIT’s width exactly, the doorway clipping nothing', () => {
    /*
     * Which of the two holes is the aperture. The slit is 0.4 m at the drum face
     * and the doorway five times wider, so the slit's own 2.778° is very nearly
     * the whole band — and it USED to be exactly the whole band, when the doorway
     * stood 2.100 m tall and the walker's eye at 1.65 m passed 0.45 m below its
     * head with the arch nowhere near.
     *
     * THAT MARGIN WENT ON 2026-08-16 AND CAME BACK ON THE 17th. The head is
     * 1.688 m now — measured, see STAIR.doorwayHeight — and the eye stands 0.19 m
     * under it, INSIDE the curve of a head struck across the opening.
     * doorwayAdmits() reads that curve (archHalfSpan), so while the slit stood
     * 3.3–4.1° off the doorway's centre line, one edge of every stair-lit band
     * was the arch rather than the slit and each room lost a quarter of a degree.
     *
     * The two are concentric now — that is the whole of the «прямо» repair — so
     * the slit sits at the crown, where an arch is widest, and the doorway is
     * irrelevant to the band again. Irrelevant for a reason this time, rather
     * than by having 0.45 m of slack.
     *
     * EQUALITY, not a bracket: these are the same 2.77825° to nine decimal
     * places, because the aperture IS the slit. If a doorway ever drifts off its
     * slit's bearing again, this is the test that reports it in degrees of sky.
     */
    for (const o of BUILT) expect(o.outerWidth, o.id).toBeCloseTo(BUILT[0].outerWidth, 9)
    expect(SLIT_HALF_DEG * 2).toBeCloseTo(2.778, 3)
    // every band in the building, save the entrance's and the one the beak eats
    for (const c of CHAMBERS) {
      for (const b of c.bands) {
        if (b.through === 'entrance' || b.through === 'head-6-7') continue
        const w = b.toDeg - b.fromDeg
        expect(w, `${c.floorNumber} via ${b.through}`).toBeCloseTo(SLIT_HALF_DEG * 2, 9)
      }
    }
    expect(of(6).bands.map((b) => b.through)).toEqual(['head-4-6', 'foot-6-7'])
    expect(of(8).bands.map((b) => b.through)).toEqual(['head-7-8', 'foot-8-9'])
    expect(of(6).arcDeg).toBeCloseTo(SLIT_HALF_DEG * 4, 9)
    expect(of(8).arcDeg).toBeCloseTo(SLIT_HALF_DEG * 4, 9)
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

describe('what the quarter turn costs, which is no longer a single room', () => {
  it('is worth nothing in rooms: seven chambers at 90 and seven at 90 + 11.09', () => {
    /*
     * THE FINDING THIS BLOCK USED TO CARRY IS RETIRED, and it is worth being
     * plain about why rather than letting the numbers change quietly.
     *
     * It read: 11.09 is stairBearing.test.ts's bound — the smallest clockwise
     * turn at which no opening is cut into stone — and the two ends it frees,
     * head-2-3 and head-3-4, are THE ONLY openings that serve storeys 3 and 4, so
     * the turn is worth exactly two rooms. The second clause was false and was
     * false because of the sign in approachAzimuthDeg(): the feet below those
     * heads serve the same two rooms, and the feet are nowhere near the pier.
     *
     * So the turn buys a SECOND band in two rooms that already have one. It is
     * still the difference between eleven openings being cut where they are and
     * eleven being cut somewhere else; it is no longer the difference between the
     * middle of the tower seeing daylight and not.
     */
    expect(litChamberCount(sweptAtQuarterTurn(90))).toBe(7)
    expect(darkChambers(sweptAtQuarterTurn(90))).toEqual([5])
    expect(sweptAtQuarterTurn(90).find((c) => c.floorNumber === 3)!.bands.map((b) => b.through)).toEqual(['foot-3-4'])

    const freed = sweptAtQuarterTurn(90 + 11.09)
    expect(litChamberCount(freed)).toBe(7)
    expect(darkChambers(freed)).toEqual([5])
    expect(freed.find((c) => c.floorNumber === 3)!.bands.map((b) => b.through)).toEqual([
      'head-2-3',
      'foot-3-4',
    ])
    expect(freed.find((c) => c.floorNumber === 4)!.bands.map((b) => b.through)).toEqual([
      'head-3-4',
      'foot-4-6',
    ])
  })

  it(
    'cannot reach storey 5 at any bearing the quarter turn could take',
    () => {
      /*
       * The one structural darkness, drawn by exhaustion rather than by argument.
       * Storey 5 is reached from the middle of the 4→6 run, so its doorway stands
       * at no passage end and no turn of the stair puts a slit anywhere near it.
       * Coarse steps are enough: the property is structural, and a bearing at
       * which a mid-flight doorway acquired an end would have to hold over tens
       * of degrees, not fractions.
       *
       * STOREY 2 USED TO BE IN THIS LIST AND IS NOT. It is lit at twenty-two of
       * these twenty-four bearings and dark at two — +240 and +255, where its own
       * foot slit swings behind the beak — which is a fact about the pier, the
       * same kind as storeys 3 and 4's used to be, and not about what a foot is.
       */
      const darkAt: number[] = []
      for (let turn = 0; turn < 360; turn += 15) {
        const dark = darkChambers(sweptAtQuarterTurn(90 + turn))
        expect(dark, `turn +${turn}`).toContain(5)
        if (dark.includes(2)) darkAt.push(turn)
      }
      expect(darkAt).toEqual([240, 255])
    },
    // 24 whole towers replanned and swept ray by ray lands either side of
    // vitest's 5 s default depending on how warm the machine is — the same trap
    // appBoot's import fell into. Stated rather than paid for by coarsening the
    // sweep, which would weaken what the test can see.
    30_000,
  )

  it('does not brighten with the turn, so there is no bearing to tune toward', () => {
    /*
     * RULE 7, MADE ARITHMETIC, and now nearly trivial. The count was 4 at +0, 6
     * at +11.09, 5 at +45 and 6 at +90 — not monotonic, no interior maximum worth
     * chasing. It is 7 at all four. Whatever case there is for turning the stair,
     * daylight is not it and cannot be made into it.
     */
    const at = (t: number) => litChamberCount(sweptAtQuarterTurn(90 + t))
    expect(at(0)).toBe(7)
    expect(at(11.09)).toBe(7)
    expect(at(45)).toBe(7)
    expect(at(90)).toBe(7)
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
    const viaHead = of(7).bands.find((b) => b.through === 'head-6-7')!
    expect(viaHead.fromDeg).toBeCloseTo(edgeDeg, 3)
    expect(viaHead.toDeg - viaHead.fromDeg).toBeCloseTo(1.518, 3)
    // …and it is the pier and nothing else: lift the beak away and the slit
    // returns whole, with nothing at all taken off it since 2026-08-17
    const noBeak = chamberDaylight({ ...SHIPPED, buttress: undefined })
    expect(noBeak.find((c) => c.floorNumber === 7)!.arcDeg).toBeCloseTo(SLIT_HALF_DEG * 4, 9)
    /*
     * AND WHAT LIFTING THE BEAK NO LONGER DOES is light anything. It used to
     * leave storeys 2, 3, 4 and 5 dark — the two ends it buries are not cut at
     * all, so removing it could not reach them — and that is still true of the
     * ends. It just no longer matters to the census, because those rooms are lit
     * through their own feet whether the pier is there or not.
     */
    expect(darkChambers(noBeak)).toEqual([5])
  })
})

describe('storey 1, the one chamber that owes the stair nothing', () => {
  it('sees the sky through the west door and through nothing else', () => {
    expect(of(1).bands).toHaveLength(1)
    expect(of(1).bands[0].through).toBe('entrance')
    const noDoor = chamberDaylight({ ...SHIPPED, entrance: undefined })
    expect(noDoor.find((c) => c.floorNumber === 1)!.lit).toBe(false)
    expect(litChamberCount(noDoor)).toBe(6)
    expect(darkChambers(noDoor)).toEqual([1, 5])
  })

  it('is narrowed by the arch over that door, not by its width', () => {
    /*
     * A check that the sweep reads the HEAD of an opening and not a rectangle
     * standing in for it. The doorway is 1.1 m wide, which is 7.650° seen from
     * the axis. The eye stands above the springing of a semicircular head struck
     * at 0.55 m radius, so the clear half-span there is √(0.55² − rise²).
     *
     * This is the ONE room in the tower that gained by the walker shrinking:
     * the eye came down from 1.65 to 1.50 m, so its rise above that springing
     * fell from 0.20 to 0.05 and the band opened from 7.121° to 7.613°. Nothing
     * about the door moved then — ENTRANCE was untouched by the chamber-section
     * repair of 2026-08-16 — which is exactly why this test is worth keeping in
     * the form of the formula rather than the number.
     *
     * It moved on 2026-08-21, and the formula is why this cost one line: the
     * head went from an invented 2.000 m to a measured 2.035, the springing rose
     * with it, the rise fell 0.050 → 0.015 and the band opened 7.613° → 7.642°.
     * The half-span is written from ENTRANCE.width now rather than from a 0.55
     * typed twice, so the next reading of the door carries itself in here.
     */
    const rise = PLAYER.eyeHeight - archSpringHeight(ENTRANCE.width, ENTRANCE.height)
    const half = Math.sqrt((ENTRANCE.width / 2) ** 2 - rise ** 2)
    expect(of(1).arcDeg).toBeCloseTo(2 * halfArcDeg(2 * half, TOWER.outerRadius), 3)
    expect(of(1).arcDeg).toBeCloseTo(7.642, 3)
    expect(of(1).arcDeg).toBeLessThan(2 * halfArcDeg(ENTRANCE.width, TOWER.outerRadius))
  })
})
