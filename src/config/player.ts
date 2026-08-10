import { deriveLampFalloff } from '../lib/lamp'
import { LIMESTONE_INTERIOR, linearLuminance } from '../lib/masonry'
import { FLOORS, STAIR } from './tower'

/**
 * First-person player parameters (Phase 6).
 *
 * The speeds here are deliberately REAL. The Phase-6 spec is explicit about it:
 * a shooter's 5 m/s would destroy the sense of scale — a 29.5 m tower crossed at
 * running speed reads as a small room. 1.4 m/s is ordinary walking pace.
 */
export const PLAYER = {
  /** Capsule radius, per the Phase-6 spec. */
  radius: 0.3,
  /** Capsule total height, per the Phase-6 spec. */
  height: 1.75,
  /** Camera height above the floor. */
  eyeHeight: 1.65,
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
 * WHAT THIS IS NOT: it is not an answer to how the tower is lit today. The
 * chambers have no openings of their own — the owner is explicit that the
 * windows are at the ends of the stair passages — so without this lamp a storey
 * is black, and that darkness is testimony, not a bug. Whether the museum has
 * put fixtures in there is an open question for the owner; if it has, they are
 * fabric and belong in the model as geometry, and this lamp goes back to being
 * what it says it is: something the viewer carries.
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
