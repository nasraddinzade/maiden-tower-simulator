import { describe, expect, it } from 'vitest'
import { planSillBranch, sillBranchTreads } from './embrasure'
import { planPassageBranches, branchesDeclined } from './passageOpenings'
import { revealWidthAt } from './towerShell'
import { PASSAGE_OPENING, TOWER, WINDOW_EMBRASURE } from '../config/tower'
import { SHIPPED_BRANCHES, SHIPPED_CUTS, SHIPPED_ENDS } from './openings.fixture'

const E = WINDOW_EMBRASURE

/**
 * THE STEPS UP TO THE SLITS, and what may be asserted about them.
 *
 * The branch is the one part of this model whose SHAPE is observed and whose
 * SIZE is not: [VIDEO] shows two or three courses of steps climbing inside an
 * embrasure to a slit's sill (up/218, down/124, up/168, up/143) and there is no
 * object of known size in any of the 492 frames to measure them against. So
 * nothing below asserts a metre. What it asserts is that the branch spends no
 * number the model did not already have, and that where it does spend one — the
 * stone outboard of the passage cheek — it cannot spend more than there is.
 */

describe('the riser is the climb divided by the count, and nothing else', () => {
  it('closes on the climb exactly, at every count', () => {
    /*
     * THE PROPERTY THE WHOLE CHANGE RESTS ON. A step COUNT is not a height; it
     * becomes one only by assuming a riser, and assuming a riser is forbidden
     * (rule 1). It does not have to be assumed: the climb is already carried, as
     * PASSAGE_OPENING.sillAboveLanding, and dividing it by the counted steps
     * introduces nothing. So stepCount risers must land on the embrasure floor
     * to the last decimal — not "about", because a residue would be exactly the
     * invented height this construction exists to avoid.
     */
    for (const climb of [0.05, 0.25, 0.3, 0.9, 1.75]) {
      for (const n of [1, 2, 3, 6]) {
        const p = planSillBranch(3.781, 3.781 + climb, n, E.going, 3.5, E.outerLeaf)
        expect(p, `${climb}/${n}`).not.toBeNull()
        expect(p!.riser * p!.stepCount).toBeCloseTo(climb, 12)
        expect(p!.platformY).toBeCloseTo(3.781 + climb, 12)
      }
    }
  })

  it('scales with the sill and not with anything else', () => {
    /*
     * The payoff, stated as a property rather than hoped for in a comment: when
     * the owner answers with metres, the treads follow without being touched.
     * Double the climb and every riser doubles; the going, which is a separate
     * [ESTIMATE], does not move at all.
     */
    const a = planSillBranch(0, 0.3, 2, E.going, 3.5, E.outerLeaf)!
    const b = planSillBranch(0, 0.6, 2, E.going, 3.5, E.outerLeaf)!
    expect(b.riser).toBeCloseTo(2 * a.riser, 12)
    expect(b.going).toBeCloseTo(a.going, 12)
    expect(b.depth).toBeCloseTo(a.depth, 12)
  })

  it('gives no branch where there is nothing to climb', () => {
    // a landing already level with the embrasure floor is a doorway, not a stair
    expect(planSillBranch(4, 4, 2, E.going, 3.5, E.outerLeaf)).toBeNull()
    expect(planSillBranch(4, 3.9, 2, E.going, 3.5, E.outerLeaf)).toBeNull()
  })

  it('lands its last tread on the embrasure floor, so no step is left over', () => {
    const p = planSillBranch(10, 10.25, 3, E.going, 3.0, E.outerLeaf)!
    const treads = sillBranchTreads(p, 5.0)
    expect(treads).toHaveLength(3)
    expect(treads[treads.length - 1].treadY).toBeCloseTo(p.platformY, 12)
    // and each tread is one going further out and one riser higher than the last
    for (let i = 1; i < treads.length; i += 1) {
      expect(treads[i].innerRadius - treads[i - 1].innerRadius).toBeCloseTo(p.going, 12)
      expect(treads[i].treadY - treads[i - 1].treadY).toBeCloseTo(p.riser, 12)
    }
    // the flight starts at the face it is cut in, and ends where `depth` says
    expect(treads[0].innerRadius).toBeCloseTo(5.0, 12)
    expect(treads[treads.length - 1].outerRadius).toBeCloseTo(5.0 + p.depth, 12)
  })
})

describe('a branch may not leave the drum through its own outer face', () => {
  /*
   * THE CONSTRAINT b36496b MEASURED, applied to the carrier that finally exists.
   *
   * It was found on the chamber recess: 4.20 m of flight cut into a wall that
   * thins from 4.855 m to 3.820 m came out through the drum by 0.09 m at storey
   * 6 and 0.38 m at storey 8. The branch is a different recess in a different
   * face and the arithmetic that stops it is deliberately the SAME arithmetic —
   * see fitDepthToStone() in embrasure.ts. A second private clamp is how a
   * measured fault comes back in different clothes.
   */
  it('takes the shortfall out of the going and never out of the riser', () => {
    const roomy = planSillBranch(0, 0.3, 3, 0.5, 3.5, 0.3)!
    const tight = planSillBranch(0, 0.3, 3, 0.5, 1.0, 0.3)!
    expect(roomy.depthLimitedByWall).toBe(false)
    expect(roomy.going).toBeCloseTo(0.5, 12)
    expect(tight.depthLimitedByWall).toBe(true)
    expect(tight.depth).toBeCloseTo(0.7, 12) // 1.0 of stone less a 0.3 leaf
    expect(tight.going).toBeCloseTo(0.7 / 3, 12)
    // the climb is untouched: the flight gets steeper in plan, never in section
    expect(tight.riser).toBeCloseTo(roomy.riser, 12)
    expect(tight.riser * tight.stepCount).toBeCloseTo(0.3, 12)
  })

  it('leaves the whole leaf standing, whatever the count asks for', () => {
    for (const n of [2, 3, 6, 12]) {
      const p = planSillBranch(0, 0.3, n, 0.5, 2.0, 0.3)
      expect(p, `${n}`).not.toBeNull()
      expect(p!.depth).toBeLessThanOrEqual(2.0 - 0.3 + 1e-12)
      expect(p!.coverBeyond).toBeGreaterThanOrEqual(0.3 - 1e-12)
      expect(p!.depth + p!.coverBeyond).toBeCloseTo(2.0, 12)
    }
  })

  it('declines outright where the leaf is the whole wall', () => {
    // no recess at all, rather than one with a negative tread
    expect(planSillBranch(0, 0.3, 2, 0.5, 0.3, 0.3)).toBeNull()
    expect(planSillBranch(0, 0.3, 2, 0.5, 0.2, 0.3)).toBeNull()
  })
})

describe('the shipped tower', () => {
  const BUILT = SHIPPED_ENDS.filter((o) => o.built)

  it('reaches every slit it cuts by steps, and none of them by a lip', () => {
    /*
     * WHAT THE MODEL USED TO CLAIM, said plainly because "nothing was built" was
     * never the neutral option: the reveal's floor stands above the landing at
     * every end, so before this there was exactly ONE step up into every
     * embrasure — a lip nobody chose and nobody tagged, and the one riser count
     * the footage never shows. Two is observed (up/218, up/087, up/168); three is
     * the recorded dissent (down/124). One is not a reading of anything.
     */
    expect(BUILT.length).toBeGreaterThan(0)
    expect(SHIPPED_BRANCHES.map((b) => b.id).sort()).toEqual(BUILT.map((o) => o.id).sort())
    expect(branchesDeclined(SHIPPED_ENDS, PASSAGE_OPENING.branchAtEnds, SHIPPED_BRANCHES)).toEqual([])
    for (const b of SHIPPED_BRANCHES) expect(b.stepCount, b.id).toBeGreaterThan(1)
  })

  it('gives none to an end that carries no slit', () => {
    // an uncut end has nothing to climb to; the record naming it changes nothing
    const withBranch = new Set(SHIPPED_BRANCHES.map((b) => b.id))
    for (const o of SHIPPED_ENDS) {
      if (!o.built) expect(withBranch.has(o.id), o.id).toBe(false)
    }
  })

  it('tops out on the floor the shell was cut with, not on a second reading of it', () => {
    /*
     * THE LAW THIS MODEL HAS BROKEN TWICE: two features of one opening placed
     * from two arithmetics. The branch's top tread and the reveal's floor are the
     * same stone, so they must be the same number — the FITTED one, after
     * fitReveal() has clamped the opening under the passage vault, and not
     * landingY + PASSAGE_OPENING.sillAboveLanding read straight out of the config.
     */
    expect(SHIPPED_BRANCHES.length).toBeGreaterThan(0)
    const byId = new Map(SHIPPED_ENDS.map((o) => [o.id, o]))
    for (const b of SHIPPED_BRANCHES) {
      const o = byId.get(b.id)!
      expect(b.platformY, b.id).toBeCloseTo(o.centreY - o.innerHeight / 2, 12)
      expect(b.landingY, b.id).toBeCloseTo(o.landingY, 12)
      expect(b.azimuthDeg, b.id).toBeCloseTo(o.azimuthDeg, 12)
      expect(b.faceRadius, b.id).toBeCloseTo(o.cheekRadius, 12)
    }
  })

  it('measures its stone from the passage cheek and not from the whole wall', () => {
    /*
     * A recess off a chamber floor starts at the room face and has
     * wallThicknessAt(y); a branch starts where the passage has ALREADY been
     * driven and has only what is left beyond it — 3.535 m at the foot of 2→3
     * against a wall of 4.855. Measuring the wall would let the flight spend
     * stone the stair has already spent.
     */
    expect(SHIPPED_BRANCHES.length).toBeGreaterThan(0)
    for (const b of SHIPPED_BRANCHES) {
      const stone = TOWER.outerRadius - b.faceRadius
      expect(b.depth + b.coverBeyond, b.id).toBeCloseTo(stone, 9)
      expect(b.coverBeyond, b.id).toBeGreaterThanOrEqual(WINDOW_EMBRASURE.outerLeaf - 1e-9)
      expect(b.faceRadius + b.depth, b.id).toBeLessThanOrEqual(TOWER.outerRadius - WINDOW_EMBRASURE.outerLeaf + 1e-9)
    }
  })

  it('carries its flight on the cut it belongs to', () => {
    // the branch rides on the WindowCut so the two cannot be handed different
    // bearings, cheeks or widths; every cut the shell makes carries one
    for (const w of SHIPPED_CUTS) {
      expect(w.branch, w.id).toBeDefined()
      const b = SHIPPED_BRANCHES.find((x) => x.id === w.id)!
      expect(w.branch!.riser).toBeCloseTo(b.riser, 12)
      expect(w.branch!.going).toBeCloseTo(b.going, 12)
      expect(w.branch!.stepCount).toBe(b.stepCount)
      expect(w.branch!.landingY).toBeCloseTo(b.landingY, 12)
    }
  })
})

describe('the branch is as wide as the reveal it climbs in', () => {
  it('reads the splay back at both faces', () => {
    /*
     * WINDOW_EMBRASURE.width is an [ESTIMATE] and the branch does not spend it:
     * the steps are the floor of the reveal, so their width is the reveal's own
     * at each radius. This is the arithmetic the cutter takes that width from,
     * and it must return the two widths the reveal was cut to, at the two planes
     * the reveal honours them at.
     */
    for (const w of SHIPPED_CUTS) {
      expect(revealWidthAt(w, TOWER.outerRadius), w.id).toBeCloseTo(w.outerWidth, 12)
      expect(revealWidthAt(w, w.revealEndRadius), w.id).toBeCloseTo(w.innerWidth, 12)
      // and it narrows the whole way out, so no tread is wider than its mouth
      let last = Infinity
      for (let r = w.revealEndRadius; r <= TOWER.outerRadius; r += 0.25) {
        const width = revealWidthAt(w, r)
        expect(width).toBeLessThanOrEqual(last + 1e-12)
        last = width
      }
    }
  })

  it('clamps outside the wall rather than extrapolating the splay', () => {
    const w = SHIPPED_CUTS[0]
    expect(revealWidthAt(w, TOWER.outerRadius + 3)).toBeCloseTo(w.outerWidth, 12)
    expect(revealWidthAt(w, w.revealEndRadius - 3)).toBeCloseTo(w.innerWidth, 12)
  })
})

describe('the record and the plan', () => {
  it('names every end, so an end can be struck out rather than added', () => {
    /*
     * The list is per-end and full, not a boolean. That shape is the affordance:
     * the day [OWNER] says one of these ends has no steps, the fix is deleting an
     * id — and until he does, no end quietly gets the lip back.
     */
    expect([...PASSAGE_OPENING.branchAtEnds].sort()).toEqual(SHIPPED_ENDS.map((o) => o.id).sort())
  })

  it('builds nothing at an end the record leaves out', () => {
    const some = planPassageBranches({
      openings: SHIPPED_ENDS,
      atEnds: ['foot-2-3'],
      stepCount: PASSAGE_OPENING.branchSteps,
      going: E.going,
      outerLeaf: E.outerLeaf,
      outerRadius: TOWER.outerRadius,
    })
    expect(some.map((b) => b.id)).toEqual(['foot-2-3'])
    expect(
      planPassageBranches({
        openings: SHIPPED_ENDS,
        atEnds: [],
        stepCount: PASSAGE_OPENING.branchSteps,
        going: E.going,
        outerLeaf: E.outerLeaf,
        outerRadius: TOWER.outerRadius,
      }),
    ).toEqual([])
  })

  it('reports an end whose stone refused the flight instead of dropping it', () => {
    // no shipped end refuses; the report has to work anyway, or a branch that
    // fails to appear is indistinguishable from one nobody asked for
    const starved = planPassageBranches({
      openings: SHIPPED_ENDS,
      atEnds: PASSAGE_OPENING.branchAtEnds,
      stepCount: PASSAGE_OPENING.branchSteps,
      going: E.going,
      // a leaf as thick as the thinnest wall outboard of any cheek
      outerLeaf: 99,
      outerRadius: TOWER.outerRadius,
    })
    expect(starved).toEqual([])
    expect(
      branchesDeclined(SHIPPED_ENDS, PASSAGE_OPENING.branchAtEnds, starved).sort(),
    ).toEqual(SHIPPED_ENDS.filter((o) => o.built).map((o) => o.id).sort())
  })
})
