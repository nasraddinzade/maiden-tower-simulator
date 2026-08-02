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
