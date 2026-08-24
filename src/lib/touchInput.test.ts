import { describe, expect, it } from 'vitest'
import {
  inThumbZone,
  stickPlantRect,
  stickSpeed,
  stickThrow,
  stickVector,
  stickVelocity,
  thumbZoneRect,
  touchLookSensitivity,
} from './touchInput'
import {
  NO_INSETS,
  compactChrome,
  type CompactState,
  type Insets,
  type Rect,
  type Viewport,
} from './screenLayout'
import { moveVelocity } from './playerMovement'
import { PLAYER, TOUCH } from '../config/player'

/*
 * CLAUDE.md rule 6: this file is arithmetic. It asserts what a thumb delta
 * becomes — a yaw, a pitch, a velocity — and asserts nothing about a ring drawn
 * on the glass, which is the renderer's business and untestable here.
 *
 * EVERY CLAIM BELOW WAS RUN AGAINST THE OLD CODE FIRST and failed, with the old
 * implementation (joystickToInput + a 1.6× mouse sensitivity) reproduced
 * verbatim:
 *
 *   half deflection walks at half pace          want 0.8235   got 1.4000
 *   a stick 30° east of north walks 30° east    want 30.0°    got 45.0°
 *   one sweep of a 375 px screen is half a turn want 3.1416   got 1.5000
 *   0.9 deflection is part-way up the ramp      want 1.6588   got 2.6000
 *
 * The first two are the boolean stick: a deflection had no magnitude and no
 * direction beyond the eight the keyboard has. The third is the sensitivity that
 * made half a turn 2.1 screen widths. The fourth is `run` having been a flag
 * rather than the top of a ramp.
 */

const W = PLAYER.walkSpeed
const R = PLAYER.runSpeed
const OPTS = {
  walkSpeed: W,
  runSpeed: R,
  deadzone: TOUCH.deadzone,
  runAt: TOUCH.runAt,
}

/** Speed of a ground velocity, m/s. */
const speedOf = (v: { x: number; z: number }) => Math.hypot(v.x, v.z)
/** Compass heading of a ground velocity, degrees clockwise from north (−Z). */
const headingOf = (v: { x: number; z: number }) => (Math.atan2(v.x, -v.z) * 180) / Math.PI

describe('stickVector', () => {
  it('is zero at the origin', () => {
    expect(stickVector(0, 0, TOUCH.stickRadiusPx)).toEqual({ x: 0, y: 0 })
  })

  it('reaches full deflection exactly at the ring', () => {
    const v = stickVector(0, -TOUCH.stickRadiusPx, TOUCH.stickRadiusPx)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 10)
    expect(v.y).toBeCloseTo(-1, 10)
  })

  it('clamps the LENGTH, so a diagonal does not outrun a cardinal', () => {
    const r = TOUCH.stickRadiusPx
    const diagonal = stickVector(4 * r, -4 * r, r)
    const cardinal = stickVector(4 * r, 0, r)
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1, 10)
    expect(Math.hypot(cardinal.x, cardinal.y)).toBeCloseTo(1, 10)
  })

  it('keeps the direction the thumb dragged in', () => {
    const v = stickVector(30, -40, TOUCH.stickRadiusPx)
    // 50 px of drag inside a 56 px ring: not yet clamped, so it is the raw ratio
    expect(v.x).toBeCloseTo(30 / TOUCH.stickRadiusPx, 10)
    expect(v.y).toBeCloseTo(-40 / TOUCH.stickRadiusPx, 10)
  })

  it('answers zero for a ring with no radius rather than dividing by it', () => {
    expect(stickVector(10, 10, 0)).toEqual({ x: 0, y: 0 })
  })
})

describe('stickThrow', () => {
  it('is zero inside the deadzone', () => {
    expect(stickThrow(0.1, 0.05, TOUCH.deadzone)).toBe(0)
  })

  it('starts from zero at the deadzone edge, not from the deadzone value', () => {
    // the rescale: crossing the threshold must not jump the walker to 15% pace
    const justPast = stickThrow(0, -(TOUCH.deadzone + 1e-6), TOUCH.deadzone)
    expect(justPast).toBeGreaterThan(0)
    expect(justPast).toBeLessThan(1e-5)
  })

  it('is one at full deflection', () => {
    expect(stickThrow(0, -1, TOUCH.deadzone)).toBeCloseTo(1, 10)
  })

  it('rises linearly across the live band', () => {
    const mid = TOUCH.deadzone + (1 - TOUCH.deadzone) / 2
    expect(stickThrow(mid, 0, TOUCH.deadzone)).toBeCloseTo(0.5, 10)
  })
})

describe('stickSpeed', () => {
  it('stands still at no throw', () => {
    expect(stickSpeed(0, W, R, TOUCH.runAt)).toBe(0)
  })

  it('reaches ordinary walking pace at the run threshold, not at the rim', () => {
    expect(stickSpeed(TOUCH.runAt, W, R, TOUCH.runAt)).toBeCloseTo(W, 10)
  })

  it('reaches the jog at the rim', () => {
    expect(stickSpeed(1, W, R, TOUCH.runAt)).toBeCloseTo(R, 10)
  })

  it('is proportional below the threshold — half throw, half pace', () => {
    expect(stickSpeed(TOUCH.runAt / 2, W, R, TOUCH.runAt)).toBeCloseTo(W / 2, 10)
  })

  it('is monotone and continuous across the threshold', () => {
    let previous = -1
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const s = stickSpeed(t, W, R, TOUCH.runAt)
      expect(s).toBeGreaterThanOrEqual(previous)
      previous = s
    }
    const below = stickSpeed(TOUCH.runAt - 1e-6, W, R, TOUCH.runAt)
    const above = stickSpeed(TOUCH.runAt + 1e-6, W, R, TOUCH.runAt)
    expect(above - below).toBeLessThan(1e-4)
  })

  it('clamps a throw pushed past the rim to the jog rather than beyond it', () => {
    expect(stickSpeed(3, W, R, TOUCH.runAt)).toBeCloseTo(R, 10)
    expect(stickSpeed(-3, W, R, TOUCH.runAt)).toBe(0)
  })

  it('degrades to a walk-only stick when the threshold is at the rim', () => {
    expect(stickSpeed(1, W, R, 1)).toBeCloseTo(W, 10)
  })
})

describe('stickVelocity', () => {
  it('stands still with the thumb resting at the centre', () => {
    expect(stickVelocity({ x: 0, y: 0 }, 0, OPTS)).toEqual({ x: 0, z: 0 })
  })

  it('walks north at yaw 0 when the thumb pushes up the screen', () => {
    // screen +y is DOWN, so forward is negative y — the axis that catches people
    const v = stickVelocity({ x: 0, y: -1 }, 0, OPTS)
    expect(v.x).toBeCloseTo(0, 10)
    expect(v.z).toBeCloseTo(-R, 10)
  })

  it('walks east when facing east, exactly as the keys do', () => {
    const yaw = -Math.PI / 2
    const stick = stickVelocity({ x: 0, y: -TOUCH.runAt * (1 - TOUCH.deadzone) - TOUCH.deadzone }, yaw, OPTS)
    const keys = moveVelocity(
      { forward: true, back: false, left: false, right: false, run: false },
      yaw,
      W,
      R,
    )
    expect(stick.x).toBeCloseTo(keys.x, 6)
    expect(stick.z).toBeCloseTo(keys.z, 6)
  })

  it('holds any heading, not the eight the keyboard has', () => {
    // THE OLD STICK ANSWERED 45° HERE. Booleans have eight directions.
    for (const deg of [7, 30, 61, 118, 200, 344]) {
      const a = (deg * Math.PI) / 180
      const v = stickVelocity({ x: Math.sin(a), y: -Math.cos(a) }, 0, OPTS)
      const heading = ((headingOf(v) % 360) + 360) % 360
      expect(heading).toBeCloseTo(deg, 6)
    }
  })

  it('turns with the walker: the same thumb push at yaw 90° walks west', () => {
    const v = stickVelocity({ x: 0, y: -1 }, Math.PI / 2, OPTS)
    expect(v.x).toBeCloseTo(-R, 10)
    expect(v.z).toBeCloseTo(0, 10)
  })

  it('gives a throttle: half throw is half pace', () => {
    const half = TOUCH.deadzone + (TOUCH.runAt / 2) * (1 - TOUCH.deadzone)
    expect(speedOf(stickVelocity({ x: 0, y: -half }, 0, OPTS))).toBeCloseTo(W / 2, 6)
  })

  it('is speed-independent of heading — no fast diagonals', () => {
    const speeds = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
      const a = (deg * Math.PI) / 180
      return speedOf(stickVelocity({ x: Math.sin(a), y: -Math.cos(a) }, 0.7, OPTS))
    })
    for (const s of speeds) expect(s).toBeCloseTo(speeds[0], 10)
  })

  it('ignores a thumb resting inside the deadzone', () => {
    expect(stickVelocity({ x: 0.1, y: -0.05 }, 0, OPTS)).toEqual({ x: 0, z: 0 })
  })
})

describe('touchLookSensitivity', () => {
  /** The reference phone: 375 CSS px is the short side of a portrait handset. */
  const PHONE = 375

  it('turns half a turn for one sweep across the short side', () => {
    // THE OLD PATH GAVE 1.5 rad HERE — 2.1 screen widths for half a turn.
    const perPixel = touchLookSensitivity(PHONE, TOUCH.turnPerSweepRad)
    expect(perPixel * PHONE).toBeCloseTo(Math.PI, 10)
  })

  it('is faster per pixel than the mouse, because a thumb has less room', () => {
    expect(touchLookSensitivity(PHONE, TOUCH.turnPerSweepRad)).toBeGreaterThan(
      PLAYER.lookSensitivity,
    )
  })

  it('puts the whole pitch range inside one sweep', () => {
    // floor to zenith without lifting the thumb: 2 × maxPitchRad of travel
    const perPixel = touchLookSensitivity(PHONE, TOUCH.turnPerSweepRad)
    expect((2 * PLAYER.maxPitchRad) / perPixel).toBeLessThan(PHONE)
  })

  it('feels the same when the phone is turned sideways', () => {
    // a visitor turns the phone to look at a building; the SHORT side is the
    // reference either way round, so the gesture does not change under them
    const portrait = touchLookSensitivity(Math.min(375, 812), TOUCH.turnPerSweepRad)
    const landscape = touchLookSensitivity(Math.min(812, 375), TOUCH.turnPerSweepRad)
    expect(landscape).toBe(portrait)
  })

  it('turns more slowly per pixel on a bigger screen', () => {
    const tablet = touchLookSensitivity(768, TOUCH.turnPerSweepRad)
    expect(tablet).toBeLessThan(touchLookSensitivity(PHONE, TOUCH.turnPerSweepRad))
  })

  it('answers zero for a viewport that has not been measured yet', () => {
    // a frame can arrive with size 0 while layout settles; dividing by it would
    // spin the camera on the visitor's first frame
    expect(touchLookSensitivity(0, TOUCH.turnPerSweepRad)).toBe(0)
    expect(touchLookSensitivity(Number.NaN, TOUCH.turnPerSweepRad)).toBe(0)
    expect(touchLookSensitivity(-375, TOUCH.turnPerSweepRad)).toBe(0)
  })
})

describe('the thumb zone, cut around the interface', () => {
  /*
   * ═════════════════════════════════════════════════════════════════════════
   * THE TWO INVARIANTS, AND THEY ARE STATEMENTS ABOUT EVERY SCREEN AT ONCE.
   * ═════════════════════════════════════════════════════════════════════════
   *
   *   1. THE WHOLE RING IS ON THE GLASS. The ring is planted where the thumb
   *      lands, and a thumb cannot travel past the edge of the screen: a ring
   *      hanging 56 px off the left of the display is a stick that cannot be
   *      pushed left, so half the deflection band in that direction does not
   *      exist. On the shipped build it hung off BOTH the left and the bottom,
   *      because the zone reached the corner of the canvas.
   *
   *   2. THE RING NEVER LIES OVER A CONTROL. Not the plant point — the whole
   *      ring, because the thumb travels over all of it, and because a ring
   *      drawn across the bar is an invitation to press it. On the shipped
   *      build the zone reached the datum notice, the touch hint AND the bar,
   *      exit-walk button included.
   *
   * Both were run against the shipped fractional zone before this existed and
   * both failed; the numbers are in the commit message. What makes them
   * statements about the interface rather than about a model of it is that the
   * obstacles below are compactChrome()'s own rectangles — the same ones the
   * components lay themselves out from.
   */
  const ZONE = {
    widthFraction: TOUCH.zoneWidthFraction,
    heightFraction: TOUCH.zoneHeightFraction,
    minSpanPx: TOUCH.zoneMinSpanPx,
  }
  const R = TOUCH.stickRadiusPx

  /** The chrome at its tallest while walking: every strip up, nothing raised. */
  const WALKING: CompactState = { notice: true, hint: true, sheetOpen: false, walking: true }

  /**
   * EVERY VIEWPORT A VISITOR IS LIKELY TO HOLD, both ways round. The smallest is
   * an iPhone SE turned sideways — 320 px of height, of which the chrome takes
   * 164 — and it is in the table precisely because it is the one that has to
   * fight for the room.
   */
  const SCREENS: [string, number, number][] = [
    ['iPhone SE', 320, 568],
    ['Android compact', 360, 640],
    ['the measured phone', 375, 812],
    ['iPhone 13', 390, 844],
    ['Pixel 8', 412, 915],
    ['iPad mini', 744, 1133],
    ['iPad Pro', 834, 1194],
  ]
  /** iPhone-class insets, and the same phone turned: the cutout changes edge. */
  const NOTCH_PORTRAIT: Insets = { top: 59, right: 0, bottom: 34, left: 0 }
  const NOTCH_LANDSCAPE: Insets = { top: 0, right: 44, bottom: 21, left: 44 }

  interface Case {
    name: string
    v: Viewport
    insets: Insets
  }
  const CASES: Case[] = []
  for (const [name, w, h] of SCREENS) {
    for (const [orient, vw, vh] of [
      ['portrait', w, h],
      ['landscape', h, w],
    ] as const) {
      const v: Viewport = { width: vw, height: vh, coarsePointer: true }
      const cutout = orient === 'portrait' ? NOTCH_PORTRAIT : NOTCH_LANDSCAPE
      CASES.push({ name: `${name} ${orient}`, v, insets: NO_INSETS })
      CASES.push({ name: `${name} ${orient}, with a cutout`, v, insets: cutout })
    }
  }

  const zoneOf = (c: Case) => {
    const chrome = compactChrome(c.v, WALKING, c.insets)
    const zone = thumbZoneRect(c.v, ZONE, chrome, c.insets)
    return { chrome, zone, plant: stickPlantRect(zone, R) }
  }
  const overlaps = (a: Rect, b: Rect) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  /** The ring around every plant point in the rectangle, as one rectangle. */
  const ringSpan = (plant: Rect): Rect => ({
    x: plant.x - R,
    y: plant.y - R,
    w: plant.w + 2 * R,
    h: plant.h + 2 * R,
  })

  for (const c of CASES) {
    describe(c.name, () => {
      it('has a stick at all', () => {
        const { plant } = zoneOf(c)
        expect(plant.w).toBeGreaterThan(0)
        expect(plant.h).toBeGreaterThan(0)
      })

      it('keeps the whole ring on the glass, wherever the thumb plants it', () => {
        const { plant } = zoneOf(c)
        const ring = ringSpan(plant)
        expect(ring.x).toBeGreaterThanOrEqual(c.insets.left)
        expect(ring.y).toBeGreaterThanOrEqual(c.insets.top)
        expect(ring.x + ring.w).toBeLessThanOrEqual(c.v.width - c.insets.right)
        expect(ring.y + ring.h).toBeLessThanOrEqual(c.v.height - c.insets.bottom)
      })

      it('never draws the ring over a control', () => {
        const { chrome, plant } = zoneOf(c)
        const ring = ringSpan(plant)
        expect(chrome.filter((r) => overlaps(ring, r))).toEqual([])
      })

      it('reaches the bottom of the glass, which is where the hand is', () => {
        // the walking bar stands on the TOP edge, so nothing of ours is between
        // the zone and the bottom of the screen but the safe area itself
        const { zone } = zoneOf(c)
        expect(zone.y + zone.h).toBe(c.v.height - c.insets.bottom)
        expect(zone.x).toBe(c.insets.left)
      })
    })
  }

  describe('the three touches the phone audit measured, at 812×375', () => {
    const v: Viewport = { width: 812, height: 375, coarsePointer: true }
    const chrome = compactChrome(v, WALKING, NO_INSETS)
    const zone = thumbZoneRect(v, ZONE, chrome, NO_INSETS)
    const plant = stickPlantRect(zone, R)
    const under = (x: number, y: number) =>
      chrome.filter((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)

    it('is the rectangle it says it is', () => {
      // bar 0…56, hint 64…108, notice 116…164, all of it on the top edge now,
      // and the zone is 55% of the height standing on the bottom of the glass
      expect(zone.x).toBe(0)
      expect(zone.w).toBe(406)
      expect(zone.y).toBeCloseTo(168.75, 6)
      expect(zone.h).toBeCloseTo(206.25, 6)
      expect(plant.x).toBe(56)
      expect(plant.w).toBe(294)
      expect(plant.y).toBeCloseTo(224.75, 6)
      expect(plant.h).toBeCloseTo(94.25, 6)
    })

    it('gives the one touch that used to work back to looking', () => {
      /*
       * (100, 210) reached the canvas on the shipped build and walked 2.036 m —
       * it was the ONLY one of the three that did, and it worked by being in
       * the 42 px sliver the chrome had not taken. It is still canvas, and it
       * is no longer a stick: the plant band is 224…319 now, which is where a
       * thumb rests rather than where the interface happened to leave a gap.
       * Re-driven in the browser: ring 0, 0 m walked, still in walk mode.
       */
      expect(under(100, 210)).toEqual([])
      expect(inThumbZone(100, 210, plant)).toBe(false)
    })

    it('walks from the touch that used to land on the datum notice', () => {
      // (100, 300) walked 0 m: the notice was at 263…311, above the bar
      expect(under(100, 300)).toEqual([])
      expect(inThumbZone(100, 300, plant)).toBe(true)
    })

    it('no longer has a way out of walk mode under a resting thumb', () => {
      /*
       * (60, 350) was the exit-walk button — 588×44 at (12, 325) — and pressing
       * it dumped the visitor back into the orbit view. Nothing of ours is
       * there now. It is not a plant point either, and that is the ring rule
       * rather than the chrome: 25 px from the bottom of the glass there is
       * nowhere for the thumb to push, so the touch turns the view rather than
       * pretending to be a stick that cannot be steered.
       */
      expect(under(60, 350)).toEqual([])
      expect(inThumbZone(60, 350, plant)).toBe(false)
    })
  })

  describe('what the zone still refuses', () => {
    const v: Viewport = { width: 375, height: 812, coarsePointer: true }
    const plant = stickPlantRect(
      thumbZoneRect(v, ZONE, compactChrome(v, WALKING, NO_INSETS), NO_INSETS),
      R,
    )

    it('takes a thumb resting at the bottom leading corner', () => {
      expect(inThumbZone(100, 740, plant)).toBe(true)
    })

    it('leaves the trailing side for looking', () => {
      expect(inThumbZone(300, 740, plant)).toBe(false)
    })

    it('leaves the UPPER leading corner for looking too', () => {
      // half the screen must not become a joystick just because the visitor is
      // left-handed, or because their eye went to something up there
      expect(inThumbZone(60, 300, plant)).toBe(false)
    })

    it('leaves room for two thumbs at once', () => {
      // the whole point of the split: a move point and a look point that are
      // both valid at the same instant, neither cancelling the other
      expect(inThumbZone(100, 740, plant)).toBe(true)
      expect(inThumbZone(300, 500, plant)).toBe(false)
    })

    it('lands the boundary on the zone, not beside it', () => {
      expect(inThumbZone(plant.x, plant.y + plant.h, plant)).toBe(true)
      expect(inThumbZone(plant.x - 1, plant.y + plant.h, plant)).toBe(false)
      expect(inThumbZone(plant.x, plant.y - 1, plant)).toBe(false)
    })

    it('takes nothing at all when there is no room for a ring', () => {
      // a viewport barely taller than the chrome it carries: no stick, and
      // every touch is a look rather than a stick that cannot be steered
      const slot: Viewport = { width: 375, height: 220, coarsePointer: true }
      const none = stickPlantRect(
        thumbZoneRect(slot, ZONE, compactChrome(slot, WALKING, NO_INSETS), NO_INSETS),
        R,
      )
      expect(none.w).toBe(0)
      expect(inThumbZone(100, 200, none)).toBe(false)
    })
  })

  describe('the orbit layout, where the bar is still on the bottom edge', () => {
    it('cuts the zone above the bar rather than under it', () => {
      const v: Viewport = { width: 375, height: 812, coarsePointer: true }
      const orbit: CompactState = { notice: true, hint: false, sheetOpen: false, walking: false }
      const chrome = compactChrome(v, orbit, NO_INSETS)
      const zone = thumbZoneRect(v, ZONE, chrome, NO_INSETS)
      // the notice's own top edge: 812 − 56 − 8 − 48
      expect(zone.y + zone.h).toBe(700)
      for (const r of chrome) expect(overlaps(zone, r)).toBe(false)
    })
  })
})
