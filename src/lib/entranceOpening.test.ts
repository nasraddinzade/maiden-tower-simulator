import { describe, expect, it } from 'vitest'
import { ENTRANCE, STAIR } from '../config/tower'
import { PLAYER } from '../config/player'
import { archHalfWidthAt, archSpringHeight } from './doorwayArch'

/**
 * THE ENTRANCE OPENING, WHICH USED TO BE 2.0 m BECAUSE SOMEBODY TYPED IT.
 *
 * All maths, no renderer (rule 6). Every test here FAILED on the values shipped
 * before this file existed, where `ENTRANCE.height` was a bare literal tagged
 * [PLACEHOLDER] and there was no ratio for it to be a measurement of.
 *
 * The reading is down/206's, argued in full under ENTRANCE_HEIGHT_RATIO in
 * src/config/tower.ts. In units of the SOURCED clear width, off the outer mouth:
 *
 *     1.850 W   crown of the opening        691.5/377.9 px, rectified   [VIDEO]
 *     1.350 W   springing, = crown − W/2    the head is a semicircle    [VIDEO]
 *     0         the threshold               a strip straight to 0.29 px
 */
describe('the entrance opening is a measurement now, not a number', () => {
  it('takes its height from the sourced width and the measured ratio', () => {
    /*
     * THE GUARD THAT MATTERS. The height must remain width × ratio: the moment
     * anyone writes a metre value here again, this fails. 2.0 was not wrong by
     * much — the reading is 2.035 — but it was not a reading at all.
     */
    expect(ENTRANCE.height).toBeCloseTo(ENTRANCE.width * ENTRANCE.heightRatio, 12)
    expect(ENTRANCE.height).toBeCloseTo(2.035, 3)
    expect(ENTRANCE.width).toBe(1.1) // [İçərişəhər], and the ratio means nothing without it
  })

  it('keeps the ratio inside the bracket the frame was read within', () => {
    /*
     * 1.830 raw and 1.843…1.897 once the passage axis's 4.4°…6.4° of pitch is
     * rectified out; the bracket is those two ends widened by the 8 cm threshold
     * strip. Move the ratio outside it and the frame is being re-read, which is
     * a thing to argue in the note rather than a thing to nudge.
     */
    const [lo, hi] = ENTRANCE.heightRatioBracket
    expect(ENTRANCE.heightRatio).toBeGreaterThanOrEqual(lo)
    expect(ENTRANCE.heightRatio).toBeLessThanOrEqual(hi)
    expect(hi - lo).toBeLessThan(0.2) // tighter than DOORWAY_SPRINGING_RATIO's, and it should be
  })

  it('strikes the head as a semicircle on the opening’s own width', () => {
    /*
     * MEASURED, not assumed. archTunnel() has always struck the head at radius
     * half-the-width springing at `height − width/2`; at this door the arch fits
     * a circle of 2r = 378.33 px against a jamb width of 377.88 (0.12%) at the
     * outer mouth and 470.27 against 467.67 at the inner. So the rule the shell
     * cuts with is what the stone does here.
     *
     * The springing then stands 1.35 clear-widths above the threshold, which is
     * 1.485 m — the height the archivolt's ring is hung from.
     */
    const spring = archSpringHeight(ENTRANCE.width, ENTRANCE.height)
    expect(spring).toBeCloseTo(ENTRANCE.height - ENTRANCE.width / 2, 12)
    expect(spring / ENTRANCE.width).toBeCloseTo(ENTRANCE.heightRatio - 0.5, 12)
    expect(spring).toBeCloseTo(1.485, 3)
    // and the crown is the top of the opening, by construction of the same arch
    expect(archHalfWidthAt(ENTRANCE.width, ENTRANCE.height, ENTRANCE.height)).toBeCloseTo(0, 9)
    expect(archHalfWidthAt(ENTRANCE.width, ENTRANCE.height, spring)).toBeCloseTo(
      ENTRANCE.width / 2,
      12,
    )
  })

  it('lets the walker through at his own shoulder, across the whole bracket', () => {
    /*
     * A round-arched opening is only its full height on the centre line, so the
     * clear height that matters is the one over a 0.3 m capsule's cheek. At the
     * ratio's LOW end that is still 1.891 m against a 1.6 m walker; the entrance
     * is nowhere near the constraint the stair doorways are. This is here so
     * that a later, lower reading cannot quietly wall the front door up.
     */
    const cheek = (ratio: number) =>
      archSpringHeight(ENTRANCE.width, ENTRANCE.width * ratio) +
      Math.sqrt((ENTRANCE.width / 2) ** 2 - PLAYER.radius ** 2)
    const [lo, hi] = ENTRANCE.heightRatioBracket
    for (const ratio of [lo, ENTRANCE.heightRatio, hi]) {
      expect(cheek(ratio), `ratio ${ratio}`).toBeGreaterThan(PLAYER.height)
    }
    expect(cheek(lo)).toBeCloseTo(1.891, 3)
  })

  it('stays the tallest doorway in the tower, which is what a front door is', () => {
    /*
     * The stair doorways come out 1.688 m from DOORWAY_HEAD_FRACTION × the
     * springing; this one is 2.035 from a ratio read off a different frame. The
     * two are independent readings of the same corpus, so the comparison is
     * worth asserting: if a later reading ever makes the entrance the SHORTER of
     * the two, one of the two frames has been read wrong.
     */
    expect(STAIR.doorwayHeight).toBeCloseTo(1.688, 3)
    expect(ENTRANCE.width * ENTRANCE.heightRatio).toBeGreaterThan(STAIR.doorwayHeight)
    expect(ENTRANCE.width * ENTRANCE.heightRatio - STAIR.doorwayHeight).toBeGreaterThan(0.3)
    // and at the low end of the bracket too — the two readings do not overlap
    expect(ENTRANCE.width * ENTRANCE.heightRatioBracket[0]).toBeGreaterThan(STAIR.doorwayHeight)
  })
})
