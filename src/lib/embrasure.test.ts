import { describe, expect, it } from 'vitest'
import { embrasureFoulsReveal, embrasureTreads, planEmbrasure, treadWear } from './embrasure'
import {
  ENTRANCE,
  FLOORS,
  TOWER,
  WINDOW_EMBRASURE,
  innerRadiusAt,
  wallThicknessAt,
} from '../config/tower'
import { wallColliders, type WallColliderParams } from './collision'
import { PLAYER } from '../config/player'
import { SHIPPED_ENDS } from './openings.fixture'
import windowData from '../data/windows.json'

const E = WINDOW_EMBRASURE

/**
 * THE LAYER HAS NO RECEIVERS AND THE MATHS IS STILL TESTED. Read this before
 * concluding the file is dead code.
 *
 * [OWNER], 2026-08-10, twice: the tower's openings are at the beginning and the
 * end of the stair passages, and the storeys themselves have none. A stepped
 * recess in a chamber wall needs an opening in a chamber wall to climb to, and
 * after the second statement there is not one left — the modern arched window
 * went with `chamberOpenings`. So the layer builds nothing and App.tsx no longer
 * draws it.
 *
 * embrasure.ts survives because the owner's OTHER statement survives: steps do
 * lead up to some of the tower's windows. Its only remaining candidate carrier
 * is a short branch off a stair landing, which [VIDEO] shows behind a barred
 * gate on the roof climb. No source gives that branch a length, a bearing or a
 * gradient, so PASSAGE_OPENING.branchAtEnds ships empty and this module waits
 * (CLAUDE.md rule 1). Deleting it would erase the only trace of the testimony.
 *
 * [2026-08-14] AND IT IS NO LONGER WAITING ON A MAYBE. The owner's walkthrough
 * shows that branch in four places — up/218, down/124, up/168, up/143 — so the
 * arithmetic below governs a cut that will really be made. The last describe in
 * this file is the consequence: a recess that used to leave the drum through its
 * own outer face at the top of the tower now cannot, at any height, because the
 * depth is fitted to the stone instead of being stated in advance.
 */

describe('which windows get steps: under this layout, none, and here is why', () => {
  it('has no chamber opening left to give them to', () => {
    /*
     * The count that used to be here was "one, and it gets none because its sill
     * is at hand height". It is zero now, and the distinction matters: the layer
     * is empty because there is nothing in a chamber wall at all, not because
     * the one thing there was happened to be low enough to look out of.
     */
    expect(windowData.chamberOpenings).toEqual([])
  })

  it('gives none to an opening at the end of a passage either, by the rule and not by fiat', () => {
    /*
     * Not a choice and not a special case: planEmbrasure() decides on height
     * alone, and PASSAGE_OPENING puts a slit's sill one slab above the landing it
     * opens off, so the climb it would have to make is negative. The brief's "no
     * steps up to a window that is no longer there" is satisfied arithmetically,
     * with zero receivers rather than by deleting the rule.
     */
    for (const o of SHIPPED_ENDS) {
      const aboveLanding = o.centreY - o.innerHeight / 2 - o.landingY
      expect(aboveLanding).toBeLessThan(PLAYER.eyeHeight)
      expect(
        // the whole wall, i.e. the most stone any carrier could have: so a null
        // here is the HEIGHT declining the steps and never a thin wall doing it
        planEmbrasure(
          aboveLanding,
          o.landingY,
          PLAYER.eyeHeight,
          E.riserTarget,
          E.going,
          E.platformDepth,
          wallThicknessAt,
          E.outerLeaf,
        ),
        o.id,
      ).toBeNull()
    }
  })

  it('gives them to an opening whose inner sill IS above eye height, so the rule still bites', () => {
    /*
     * SYNTHETIC, and it has to be: with zero receivers in the model, a test that
     * only ever sees `null` cannot tell "the rule declines" from "the rule is
     * broken". These three heights are the ones the chamber openings used to
     * produce — 2.95, 2.60 and 1.20 m of inner sill above the floor — kept as
     * numbers rather than read out of a file that no longer holds them.
     */
    for (const above of [2.95, 2.6, 1.2]) {
      const plan = planEmbrasure(
        above,
        FLOORS[4].floorY,
        PLAYER.eyeHeight,
        E.riserTarget,
        E.going,
        E.platformDepth,
        wallThicknessAt,
        E.outerLeaf,
      )
      expect(Boolean(plan), `inner sill ${above.toFixed(2)} m above the floor`).toBe(
        above - PLAYER.eyeHeight > E.riserTarget / 2,
      )
      if (!plan) continue
      // it brings the eye to the inner sill, which is the whole point of the steps
      expect(plan.platformY + PLAYER.eyeHeight).toBeCloseTo(FLOORS[4].floorY + above, 9)
      // and the risers stay walkable and even
      expect(plan.riser).toBeGreaterThan(0.1)
      expect(plan.riser).toBeLessThan(0.3)
    }
  })
})

describe('embrasure treads', () => {
  const plan = planEmbrasure(
    2.95,
    13.62,
    PLAYER.eyeHeight,
    E.riserTarget,
    E.going,
    E.platformDepth,
    wallThicknessAt,
    E.outerLeaf,
  )!

  it('climbs outward into the wall, one going per step', () => {
    const treads = embrasureTreads(plan, 4.0)
    expect(treads.length).toBe(plan.stepCount + 1)
    for (let i = 1; i < treads.length; i += 1) {
      expect(treads[i].innerRadius).toBeCloseTo(treads[i - 1].outerRadius, 9)
      expect(treads[i].treadY).toBeGreaterThanOrEqual(treads[i - 1].treadY - 1e-9)
    }
  })

  it('ends on a platform level with the top tread', () => {
    const treads = embrasureTreads(plan, 4.0)
    const last = treads[treads.length - 1]
    expect(last.treadY).toBeCloseTo(plan.platformY, 9)
    expect(last.outerRadius - last.innerRadius).toBeCloseTo(E.platformDepth, 9)
  })
})

/*
 * THE DESCRIBE BELOW REPLACES ONE CALLED "stays inside the masonry only in the
 * lower half of the tower, and here is where it stops", and the replacement is
 * the whole change of 2026-08-14.
 *
 * That test asserted the fault. It ran planEmbrasure over all eight storeys, put
 * the storeys whose recess stayed in the wall in one list and the storeys whose
 * recess came out through the drum in another, and pinned the answer:
 *
 *     expect(fits).toEqual([1, 2, 3, 4, 5])
 *     expect(holes).toEqual([6, 7, 8])
 *
 * which is a green test certifying that the top three storeys of the model have
 * a hole in them. It was written that way on purpose and the reason was good at
 * the time — the layer had no receivers, the branch off a landing had no source
 * for its depth, and inventing one to close the gap would have been rule 1. So
 * the constraint was recorded where the next person would find it.
 *
 * The next person found it, and what changed under it is the receivers: the
 * owner's walkthrough shows the stepped branch to a slit at a passage end in
 * four places, so the recess is a cut that will really be made. A recorded hole
 * is a finding; a recorded hole with something about to be built in it is a bug.
 * The `holes` list is empty now, and it is empty by construction rather than by
 * arithmetic that happens to come out right — planEmbrasure cannot express a
 * depth that leaves the drum.
 */
describe('a recess may not punch through the outer face', () => {
  /*
   * 2.95 m is the sill the chamber openings used to produce, and the tallest of
   * them: seven risers, the deepest recess these dimensions can ask for. It is
   * kept as a number rather than read from a file, because the file that held it
   * lost its chamber openings on 2026-08-10 — see the head of this file.
   */
  const SILL = 2.95
  const at = (floorY: number) =>
    planEmbrasure(
      SILL,
      floorY,
      PLAYER.eyeHeight,
      E.riserTarget,
      E.going,
      E.platformDepth,
      wallThicknessAt,
      E.outerLeaf,
    )

  it('leaves a leaf of stone outboard of the recess at every storey in the tower', () => {
    /*
     * THE PROPERTY. Not "it fits at these storeys" — it fits, full stop, and the
     * wall is what decides how deep it is allowed to be.
     *
     * The old rule failed this from storey 4 up: an unconditional 4.20 m against
     * 4.399 m of wall at storey 4 leaves 0.199 m, which is inside the leaf; from
     * storey 6 the recess is through the face outright.
     */
    for (const f of FLOORS) {
      const p = at(f.floorY)
      expect(p, `storey ${f.floorNumber}: the tower has wall enough for a recess here`).not.toBeNull()
      const face = innerRadiusAt(p!.platformY)
      expect(
        face + p!.depth,
        `storey ${f.floorNumber}: the back of the recess stands at radius ` +
          `${(face + p!.depth).toFixed(3)} and may not pass ${(TOWER.outerRadius - E.outerLeaf).toFixed(3)}`,
      ).toBeLessThanOrEqual(TOWER.outerRadius - E.outerLeaf + 1e-9)
    }
  })

  it('says how much stone it left, and it is never less than the leaf', () => {
    for (const f of FLOORS) {
      const p = at(f.floorY)!
      expect(p.coverBeyond, `storey ${f.floorNumber}: cover beyond the recess`).toBeGreaterThanOrEqual(
        E.outerLeaf - 1e-9,
      )
      expect(p.coverBeyond, `storey ${f.floorNumber}`).toBeCloseTo(
        wallThicknessAt(p.platformY) - p.depth,
        9,
      )
    }
  })

  it('keeps the drawn treads inside the same stone, not just the stated depth', () => {
    /*
     * The number and the stone have to agree. A clamped `depth` drawn with the
     * nominal going would put the last tread through the face while the plan
     * still read as sound, which is the worse of the two failures — so the going
     * travels on the plan and embrasureTreads has no other one to reach for.
     */
    for (const f of FLOORS) {
      const p = at(f.floorY)!
      const face = innerRadiusAt(p.platformY)
      const treads = embrasureTreads(p, face)
      const last = treads[treads.length - 1]
      expect(last.outerRadius, `storey ${f.floorNumber}: last tread`).toBeLessThanOrEqual(
        TOWER.outerRadius - E.outerLeaf + 1e-9,
      )
      expect(last.outerRadius - face, `storey ${f.floorNumber}: treads match the plan`).toBeCloseTo(
        p.depth,
        9,
      )
    }
  })

  it('buys the depth from the going, and only where the wall makes it', () => {
    /*
     * Storeys 1–3 are untouched — the wall there is thick enough for the mason's
     * own 0.50 m tread — and the cut-back is monotonic above them, because the
     * wall taper is. A model that shortened treads everywhere would be paying a
     * price the building does not charge.
     */
    const goings: number[] = []
    for (const f of FLOORS) {
      const p = at(f.floorY)!
      const room = wallThicknessAt(p.platformY) - E.outerLeaf
      const wanted = p.stepCount * E.going + E.platformDepth
      if (wanted <= room) {
        expect(p.depth, `storey ${f.floorNumber}`).toBeCloseTo(wanted, 9)
        expect(p.going, `storey ${f.floorNumber}`).toBeCloseTo(E.going, 9)
        expect(p.depthLimitedByWall, `storey ${f.floorNumber}`).toBe(false)
      } else {
        expect(p.depth, `storey ${f.floorNumber}`).toBeCloseTo(room, 9)
        expect(p.going, `storey ${f.floorNumber}`).toBeLessThan(E.going)
        expect(p.depthLimitedByWall, `storey ${f.floorNumber}`).toBe(true)
      }
      goings.push(p.going)
    }
    expect(goings.slice(0, 3).every((g) => Math.abs(g - E.going) < 1e-9)).toBe(true)
    for (let i = 1; i < goings.length; i += 1) {
      expect(goings[i], `storey ${i + 1} tread`).toBeLessThanOrEqual(goings[i - 1] + 1e-9)
    }
  })

  it('never buys it from the riser, the step count or the platform', () => {
    /*
     * The point of the flight is that the platform brings the eye to the sill. If
     * fitting the wall moved the platform, the recess would fit and light nothing,
     * which is the trade this must never make.
     */
    for (const f of FLOORS) {
      const p = at(f.floorY)!
      expect(p.platformY + PLAYER.eyeHeight, `storey ${f.floorNumber}: eye at the sill`).toBeCloseTo(
        f.floorY + SILL,
        9,
      )
      expect(p.riser * p.stepCount, `storey ${f.floorNumber}`).toBeCloseTo(SILL - PLAYER.eyeHeight, 9)
      expect(p.platformDepth, `storey ${f.floorNumber}`).toBeCloseTo(E.platformDepth, 9)
    }
  })

  it('declines the recess outright where the stone will not hold the platform', () => {
    /*
     * A wall with exactly the leaf plus the platform in it has no room for a
     * single tread, and the honest answer is that there is no recess here — not a
     * recess with a tread of zero, and certainly not one with a negative tread.
     * Synthetic: no storey of this tower is that thin, and the rule has to hold
     * for whatever carrier the branch turns out to sit on, including one cut from
     * a passage cheek that has only a metre or so of stone outboard of it.
     */
    const thin = (metres: number) => () => metres
    const plan = (stone: number) =>
      planEmbrasure(
        SILL,
        0,
        PLAYER.eyeHeight,
        E.riserTarget,
        E.going,
        E.platformDepth,
        thin(stone),
        E.outerLeaf,
      )
    expect(plan(E.outerLeaf + E.platformDepth)).toBeNull()
    expect(plan(E.outerLeaf + E.platformDepth - 0.5)).toBeNull()
    // one tread's worth over the platform, and it is a recess again
    const just = plan(E.outerLeaf + E.platformDepth + 0.35)!
    expect(just).not.toBeNull()
    expect(just.depth).toBeCloseTo(E.platformDepth + 0.35, 9)
    expect(just.coverBeyond).toBeCloseTo(E.outerLeaf, 9)
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
  /*
   * SYNTHETIC, because the shipped data no longer produces one. The invariant is
   * about wallColliders(), not about this tower's window list: a recess cut in
   * the shell must be matched by an opening in the collider band, or you can see
   * into a hole you cannot enter. It has to keep holding for whatever carrier the
   * owner's "steps lead up to some of the windows" turns out to have.
   */
  const embrasures = [
    { azimuthDeg: 200, sillAbove: 2.95, floorY: FLOORS[4].floorY },
    { azimuthDeg: 250, sillAbove: 2.6, floorY: FLOORS[6].floorY },
  ]
    .map(({ azimuthDeg, sillAbove, floorY }) => {
      const plan = planEmbrasure(
        sillAbove,
        floorY,
        PLAYER.eyeHeight,
        E.riserTarget,
        E.going,
        E.platformDepth,
        wallThicknessAt,
        E.outerLeaf,
      )
      return plan ? { w: { id: `synthetic-${azimuthDeg}`, azimuthDeg }, plan, floorY } : null
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

/*
 * THE DESCRIBE THAT USED TO STAND HERE HAS HAD ITS PREMISE TURNED INSIDE OUT,
 * and it is replaced by this note rather than deleted, because the reasoning is
 * the record.
 *
 * It was called "an embrasure and a stair passage cannot share the wall", and it
 * existed because of a measured fault: with the recesses built and the stair
 * starting at azimuth 200, the climb stopped dead — 14 treads of 22 on the 2→3
 * flight at azimuth 153, and 17 of 39 on 4→6 at azimuth 131. Every flight
 * completed the moment the recesses were taken out. The flights stack in one
 * sector and the widest sweeps 160°, so from 200 they covered the arc from 213
 * down to about 40, and the whole slit column sat between azimuth 123 and 143.
 *
 * The tie was broken the way it was for the window bearing: STAIR.startAzimuthDeg
 * was a [PLACEHOLDER] and the window azimuths were photographs, so the placeholder
 * moved, to 100. On 2026-08-13 it moved again, to BUTTRESS.azimuthDeg + 90 =
 * 196.7, on [OWNER]'s own account of where the stair stands relative to the beak
 * — within 3.3° of the 200 this paragraph records as the fault. That is not the
 * fault returning: the recesses it collided with no longer exist, because the
 * same witness withdrew the chamber openings on 2026-08-10 and this whole layer
 * with them.
 *
 * [OWNER] 2026-08-10 inverts the premise. An opening is not a competitor for the
 * stair's wall — it IS the stair's wall, cut radially through the outer cheek of
 * a passage over its landing. "They cannot share the wall" has become "they
 * must", and the argument that moved the placeholder AWAY from the windows is
 * void, because the placeholder now decides where the windows are. Written up in
 * full at STAIR.startAzimuthDeg.
 *
 * What replaces the test: passageOpenings.test.ts asserts that every opening's
 * mouth fits inside its own landing's arc with a jamb to spare, and
 * towerShell.test.ts still checks there is floor under every tread of every
 * flight — which was always the real guard against a reveal eating the stair.
 */

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
  /*
   * SYNTHETIC INPUTS, reconstructing the clash that WAS in the built model.
   *
   * The case is worth keeping exactly: upper-2's step blocks stood inside
   * upper-1's reveal, at radius 6.63 and 7.08 on the line of sight through that
   * opening. The two slits were 4 deg apart on the drum and a recess subtends
   * about 14 deg, so one could not help crossing the other.
   *
   * The two openings it names no longer exist as geometry, so the figures are
   * written down here rather than read out of windows.json. The RULE is what is
   * under test and it is not about those two slits: any two openings close
   * enough in bearing will do it, and the owner's "steps lead up to some of the
   * windows" may yet put two recesses near each other on a stair landing.
   */
  const reveals = [
    { id: 'neighbour', azimuthDeg: 132, halfWidthDeg: 11.6, bottomY: 17.8, topY: 20.2 },
  ]
  const recess = (azimuthDeg: number) => ({
    id: 'recess',
    azimuthDeg,
    halfWidthDeg: 13.9,
    bottomY: 16.91,
    topY: 20.0,
  })

  it('catches the clash that was in the built model', () => {
    // 4 deg apart, a 27.8 deg recess against a 23.2 deg reveal: unavoidable
    expect(embrasureFoulsReveal(recess(136), reveals)).not.toBeNull()
  })

  it('lets an isolated recess through', () => {
    expect(embrasureFoulsReveal(recess(230), reveals)).toBeNull()
  })
})
