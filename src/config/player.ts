import { deriveLampFalloff } from '../lib/lamp'
import { LIMESTONE_INTERIOR, linearLuminance } from '../lib/masonry'
import { FLOORS, STAIR } from './tower'

/**
 * First-person player parameters (Phase 6).
 *
 * The speeds here are deliberately REAL. The Phase-6 spec is explicit about it:
 * a shooter's 5 m/s would destroy the sense of scale — a 29.5 m tower crossed at
 * running speed reads as a small room. 1.4 m/s is ordinary walking pace.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * THE WALKER IS SHORTER THAN THE SPEC MADE HIM, AND THE TOWER IS WHY.
 * 2026-08-16.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * height was 1.75 and eyeHeight 1.65, "per the Phase-6 spec" — which is to say
 * from nowhere. They are the only two lengths in this project that were never
 * sourced, never measured and never derived: they are what a spec writes down
 * before anybody has measured the building. They stopped being free on the day
 * the building's own doorway acquired a measurement.
 *
 * STAIR.doorwayHeight is now 1.688 m — the sourced clear height less an
 * estimated vault rise, times a fraction measured off the owner's footage
 * (config/tower.ts → DOORWAY_HEAD_FRACTION). Twelve doorways onto the historic
 * stair, all at that height. A 1.75 m capsule does not go through a 1.688 m
 * hole, and a capsule cannot stoop; the owner, who is 1.85 m, stoops, and the
 * footage shows him doing it.
 *
 * SO THE AVATAR GIVES AND THE BUILDING DOES NOT, and the direction matters more
 * than the number. Raising the doorway until the walker fits would be setting a
 * dimension of a 12th-century wall from a capsule — which is precisely the fault
 * being repaired here, since `PLAYER.height + 0.35` WAS the doorway height until
 * today. Rule 7 in the other direction: the model shows what the measurement
 * gives, and the instrument is what is adjusted to read it.
 *
 * 1.60 m with the eye at 1.50 is an adult of ordinary short stature, eye at
 * 0.938 of it against the spec's own 0.943 — the ratio is kept, the person is
 * smaller. He clears the measured doorway head by 0.088 m, which is the margin
 * chamberSection.test.ts guards. Raise CUPOLA_RISE and that margin closes: at
 * rise 0.36 the doorway is 1.60 and this walker no longer fits either, and the
 * test says so rather than letting him stick in a wall.
 *
 * WHAT DID NOT CHANGE, and should not: `radius` and `stairHeadroom`. The radius
 * is a shoulder, not a stature, and the passage headroom is a separate
 * [ASSUMPTION] that PASSAGE_JAMB and therefore WALL_EMBED are built on — moving
 * it moves the bedding of every floor in the tower and it has nothing to do with
 * this fault.
 */
export const PLAYER = {
  /** Capsule radius, per the Phase-6 spec. */
  radius: 0.3,
  /**
   * Capsule total height. Set by the tower's own doorways, not by the spec —
   * see the note above. Must stay below STAIR.doorwayHeight.
   */
  height: 1.6,
  /** Camera height above the floor, at the spec's own eye/stature ratio. */
  eyeHeight: 1.5,
  /** Ordinary walking speed, m/s. */
  walkSpeed: 1.4,
  /** Shift — a brisk jog, not a sprint. */
  runSpeed: 2.6,
  /** Downward acceleration, m/s². Real gravity: falling down the well should feel real. */
  gravity: 9.81,
  /** Terminal descent, so a long fall stays readable rather than becoming a blur. */
  maxFallSpeed: 18,
  /**
   * Steps are ~0.2 m; autostep must clear them comfortably or the capsule
   * catches on every tread. Set above the tallest riser the stair can produce.
   *
   * Measured, autostep does NOT save a vertical face here: with this raised to
   * 0.6 the walker still would not climb a 0.42 m ledge, or a 0.2 m one. So the
   * collision geometry has to carry the walker on slopes alone — see
   * stairRampBoxes() and stairApproaches(). This value is the fallback, not the
   * mechanism.
   */
  autostepMaxHeight: 0.35,
  autostepMinWidth: 0.15,
  /**
   * Clear height the stair passage must keep above each tread, metres.
   * [ASSUMPTION] — no source measures it. It has to exceed the walker's height
   * by more than one riser: mounting a step lifts the capsule ~0.2 m, and if the
   * vault is closer than that the lift is blocked and the stair is unclimbable.
   */
  stairHeadroom: 2.3,
  /** Winder treads are steep; allow a climb angle well above the stair's pitch. */
  maxSlopeClimbAngleDeg: 60,
  /** Below this the character slides back down rather than climbing. */
  minSlopeSlideAngleDeg: 70,
  /** Keeps the capsule glued to the treads instead of bouncing down a flight. */
  snapToGroundDistance: 0.4,
  /** Small gap the controller keeps from surfaces, avoids jitter against walls. */
  characterOffset: 0.02,
  /** Mouse/touch look sensitivity, radians per pixel. */
  lookSensitivity: 0.0025,
  /** Pitch is clamped so the view cannot roll over the top. */
  maxPitchRad: Math.PI / 2 - 0.05,
} as const

/**
 * The hand lamp, sized by deriveLampFalloff rather than by taste.
 *
 * The two distances are the building's, not choices: half a flight's width is
 * how close the wall of a stair passage comes to the walker, and the widest
 * chamber's inner radius is the farthest wall the lamp is asked to show. Change
 * STAIR.width or the taper and the lamp follows.
 *
 * The two brightnesses are [ESTIMATE] and they are about the TONE CURVE, not
 * about the tower: 0.35 linear sits in the middle of ACES at exposure 1 (byte
 * ~185), where a change of angle still changes the pixel; 0.03 is the low end
 * that still separates from black (byte ~40). They are the only numbers in this
 * block chosen by judgement, which is why they are written out rather than
 * folded into a magic intensity.
 *
 * WHAT THIS IS NOT: it is not an answer to how the tower is lit today.
 *
 * WHICH STOREYS ARE ACTUALLY BLACK, because this note used to say "a storey" and
 * mean all of them, and that has been measured and is not true.
 *
 * The chambers have no openings of their own — the owner is explicit that the
 * windows are at the ends of the stair passages — so a room is lit only through
 * its doorway onto the stair and then out of the passage, and whether that works
 * depends on whether the two holes line up. Swept ray by ray from the axis at
 * eyeHeight, seven of the eight chambers have a sight line to the sky and one
 * does not (lib/chamberDaylight.ts, which is where the argument and the numbers
 * live):
 *
 *   storey 1          7.61° of it, through the west door, no stair involved
 *   storeys 2, 3, 4   2.64°, 2.60° and 2.57°, each through the foot of the climb
 *                     that leaves there
 *   storeys 6, 7, 8   5.03°, 4.01° and 4.93° — a head and a foot apiece, the
 *                     head at storey 7 half eaten by the beak
 *   storey 5          nothing, structurally: it is reached from the middle of
 *                     the 4→6 run, which is not a passage end and is not a place
 *                     a slit can be. No turn of the stair reaches it.
 *
 * TWENTY-NINE DEGREES OF SKY IN THE WHOLE BUILDING IS STILL NOT LIGHTING, and
 * this lamp is still the only reason a visitor sees anything. It was fourteen
 * degrees and four rooms until 2026-08-17, when approachAzimuthDeg() stopped
 * putting foot doorways on the far side of their own first tread from the slit
 * that serves them; the tower did not get brighter, the model stopped being
 * wrong in a way that made three rooms black.
 *
 * THE COUNT IS ASSERTED, not merely described here, and that is the point of
 * having measured it: chamberDaylight.test.ts states seven of eight, so the day
 * anything moves a doorway or a slit the suite says which room gained or lost
 * and this note fails with it rather than quietly going stale — which is exactly
 * what the sentence it replaced had done, twice.
 *
 * AND THE MUSEUM HAS PUT FIXTURES IN, which used to be written here as an open
 * question and is not one: the walkthrough shows a continuous concealed strip at
 * the springing of the ceiling washing the chamber walls (up/099, up/130) and
 * fluorescent tube in the passages. They are fabric, they belong in the model as
 * geometry when somebody builds the museum layer, and on the day they do this
 * lamp goes back to being what it says it is — something the viewer carries.
 */
export const LAMP = {
  ...deriveLampFalloff({
    nearDistance: STAIR.width / 2,
    farDistance: Math.max(...FLOORS.map((f) => f.innerRadiusAtLevel)),
    nearTarget: 0.35,
    farTarget: 0.03,
    albedoLuminance: linearLuminance(LIMESTONE_INTERIOR),
  }),
  /**
   * Cutoff, metres. Unchanged from the hand-tuned lamp: the widest chamber is
   * 8.7 m across, so this reaches the far wall of any room in the building and
   * the window term is doing nothing at the distances that matter.
   */
  cutoffDistance: 14,
} as const
