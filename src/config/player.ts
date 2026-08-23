import { deriveLampFalloff } from '../lib/lamp'
import { peakChannelResponse } from '../lib/exposure'
import { LIMESTONE_INTERIOR, LIMESTONE_LIGHT } from '../lib/masonry'
import { FLOORS, STAIR } from './tower'

/**
 * Colour of the carried lamp. It lived as a literal in FirstPersonPlayer until
 * 2026-08-20, which was a magic number in a component (rule 2) and, worse, a
 * number the arithmetic below needed and could not see: the lamp is warm, and
 * how warm decides which channel clips.
 */
const LAMP_COLOUR = '#ffd9a8'

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
  /**
   * m/s toward the surface while grounded, instead of a fall. It is what keeps
   * the character controller resolving a contact every step, and therefore what
   * keeps `computedGrounded()` true; with nothing pressing down, a capsule that
   * has just been nudged clear reports airborne and the walk turns into a
   * stutter of one-frame falls.
   *
   * It lived as a literal −0.1 inside applyGravity until 2026-08-21 with the
   * comment "slight downward bias keeps contact", and it belongs HERE for the
   * same reason normalNudgeFactor does: the two are one mechanism. The nudge
   * pushes the capsule off the stone and this brings it back, and until today
   * they did not travel the same line — see lib/playerMovement.ts →
   * contactCycleDrift, which is where the slide is worked out.
   *
   * The VALUE is unchanged and is not critical: at 60 Hz it asks for 1.67 mm
   * against a nudge of 1.00, and anything that covers the nudge behaves
   * identically because the stone stops the rest. What matters is that it is
   * bounded below by the nudge, which desiredMovement() does rather than this
   * number, so a 240 Hz frame does not come up short.
   */
  groundContactBias: 0.1,
  /** Small gap the controller keeps from surfaces, avoids jitter against walls. */
  characterOffset: 0.02,
  /**
   * How far the controller pushes itself off a contact normal before trying to
   * move again. Rapier's default is 1.0e-4 and that default is why nobody could
   * walk the steel spiral.
   *
   * WHAT IT LOOKED LIKE, and it looked like a geometry fault every time: the
   * walker climbing the spiral was carried outward — measured on a fixed
   * heading, the displacement comes out 0.28 of its own length to the OUTSIDE at
   * r 0.46 and 0.19 at r 0.54, going to 0.07 by r 0.70, and to ZERO walking down
   * the same treads and zero on the flat floor of storey 1. It is the pitch: a
   * 0.6 m capsule cannot follow a going of 0.26 m without riding the surface
   * ahead of it, and on a helix that ride has a sideways component. So every
   * ascent ends up against whatever bounds the flight — five starts from r 0.40
   * to 0.69 all converged on the same edge.
   *
   * AND THERE IT STOPPED DEAD. Pressed against the rail, on a slope, the
   * controller lost every millimetre of movement: 0.01 treads in 120 frames,
   * grounded, with the wall parallel to the way it was trying to go. On the FLAT
   * floor the same walker slides along the drum happily — 34.8° of arc out of
   * 45° at a 45° incidence — so it was never the wall and never the heading. It
   * was that a contact resolved with a 0.1 mm nudge is a contact again on the
   * next frame, and on a slope there are two of them arguing.
   *
   * 0.01 m unstuck it: the same three stalls became 5.87, 5.87 and 5.94 treads
   * and two of them ended on storey 2. It is a solver parameter, not a
   * dimension: nothing in the building moves.
   *
   * ═════════════════════════════════════════════════════════════════════════
   * AND 0.01 IS THE SHAKE. 2026-08-20.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * The owner: «камеру трясёт когда сам ходишь.» It is this number, and the
   * sentence this paragraph replaced is why nobody found it: "0.01 m is 1.4 mm
   * under a walking frame at 1/60 s and half the character offset, so it cannot
   * push the walker through anything." That arithmetic treats the nudge as a
   * SPEED. Rapier applies it as an absolute displacement along the contact
   * normal every time a contact is resolved — 10 mm per step, not 1.4.
   *
   * Instrumented on the controller itself, standing on the flat floor of storey
   * 1, one line per physics step:
   *
   *   desired.y  −1.667 mm      (applyGravity's grounded bias, −0.1 m/s × 1/60)
   *   computed.y +10.000 / −10.000 mm, alternating
   *   body.y     820.002 / 830.000 mm, alternating
   *
   * A LIMIT CYCLE, and it closes on itself: in contact, the downward bias is
   * refused by the floor and the nudge lifts the capsule a full 10 mm clear;
   * one step later it is airborne, so snapToGroundDistance drops it the same
   * 10 mm back onto the contact; and being in contact, it is nudged again. A
   * 30 Hz square wave of exactly this parameter's amplitude, on every surface
   * whose normal is near vertical — every chamber floor, every landing, the
   * roof deck, the paving outside — standing still as much as walking.
   *
   * SWEPT IN THE LIVE WORLD, peak-to-peak of the camera's own trace against a
   * straight line through its neighbouring frames, flat floor of storey 1:
   *
   *   0.01 (old)  10.2 mm      0.002   2.8 mm
   *   0.001       1.0 mm       0.0001  0.17 mm   (rapier's default)
   *
   * At 1e-4 the cycle stops dead rather than shrinking — computed.y reads
   * 0.000 every step and the body sits at 820.100 mm and does not move.
   *
   * SO WHY NOT 1e-4. Because the wall margin is real even though the stall is
   * not: climbing the masonry flight while pressed into its outer cheek the
   * walker covers 0.965 m at 0.001 against 0.814 m at 1e-4, and 1e-4 is the
   * value the passage used to weld him to. 0.001 is the knee — a tenth of the
   * shake, none of the stickiness, and one millimetre at the eye is a fifth of
   * a pixel at the distances anything in this building is seen from.
   *
   * AND THE STALL ITSELF IS GONE, which is the part that has to be said out
   * loud rather than assumed from the number still working. Re-walked at 1e-4,
   * 0.001, 0.002 and 0.01: sliding along the drum on the flat floor covers
   * 1.485–1.489 m in 200 frames at ALL FOUR — no value stalls. On the modern
   * spiral 0.01 is now the WORST of the four, 0.217 m of climb in 600 frames
   * against 0.354 m at 0.001. The stair that justified 0.01 was re-cut after it
   * was measured — 9c97c79 narrowed the walk band, stairApproaches() put five
   * ramps at the foot — so the walk above was taken against geometry that no
   * longer exists. Everything above 0.001 is now paying for nothing.
   */
  normalNudgeFactor: 0.001,
  /**
   * MOUSE look sensitivity, radians per pixel. Under pointer lock the deltas are
   * raw device counts, not screen distance, so this is rightly a constant and
   * rightly independent of the viewport — see TOUCH.turnPerSweepRad for why the
   * thumb cannot be.
   */
  lookSensitivity: 0.0025,
  /** Pitch is clamped so the view cannot roll over the top. */
  maxPitchRad: Math.PI / 2 - 0.05,
} as const

/**
 * The touch controls, 2026-08-23.
 *
 * A phone has no pointer lock, no WASD and no mouse, and the owner is about to
 * link this publicly — a phone visitor is the likeliest visitor there is. These
 * are the parameters of the input that replaces all three; the arithmetic that
 * consumes them is lib/touchInput.ts and it is tested there.
 *
 * They live in config rather than in the widget for the same reason every other
 * number in this project does (rule 2): the values below are the whole feel of
 * walking on a phone, and a feel argued about in a component is a feel nobody
 * can find.
 *
 * WHAT IS A PHYSICAL LENGTH AND WHAT IS A FRACTION OF THE GLASS — the division
 * that decides which of these scale with the screen:
 *
 *   the stick is a THUMB. A thumb is 20 mm of flesh whatever it is resting on,
 *   so the ring is in CSS pixels, which are defined to hold a constant angular
 *   size across devices. It does not scale.
 *
 *   the zone and the look sweep are GLASS. Where the thumb can reach and how far
 *   it can travel are fractions of the display, so both are fractions.
 */
export const TOUCH = {
  /**
   * Ring radius, CSS px — full deflection. 56 px is a 112 px circle, about
   * 30 mm, which is the reach of a thumb pivoting at its own knuckle. Carried
   * over unchanged from the Phase-6 stick: it was the one thing about that stick
   * that measured right.
   */
  stickRadiusPx: 56,
  /** Knob radius, CSS px. Half the ring, so the knob is visible at any throw. */
  stickKnobRadiusPx: 22,
  /**
   * Deflection below which the thumb is resting, not steering. Skin on glass
   * wanders a few pixels while the hand holds the phone; 0.15 of 56 px is 8 px,
   * which is under a thumbprint and over that wander.
   */
  deadzone: 0.15,
  /**
   * The throw at which the walk reaches PLAYER.walkSpeed. Above it the ramp runs
   * on to PLAYER.runSpeed at the rim, so the last 15% of the ring is the jog
   * that Shift is on a keyboard. Below it the whole band is a proportional walk,
   * which is what lets a visitor edge along a 0.9 m stair passage.
   */
  runAt: 0.85,
  /**
   * The movement zone: the left half of the display, bottom 55% of it. On a
   * 375 × 812 phone that is 187 × 447 px under a left thumb, and it leaves the
   * upper left — where the walk button and the hint sit — as somewhere to drag
   * to LOOK rather than as more joystick.
   */
  zoneWidthFraction: 0.5,
  zoneHeightFraction: 0.55,
  /**
   * How far the view turns for a drag across the SHORT side of the display.
   * Half a turn: one sweep of a thumb puts the room behind you in front of you.
   *
   * MEASURED AGAINST WHAT IT REPLACES. The touch path used to multiply the mouse
   * sensitivity by 1.6 — 0.004 rad/px — so half a turn took 785 px, or 2.1
   * screen widths of a 375 px phone, in three separate swipes. π across 375 px
   * is 0.00838 rad/px, and it also puts the full pitch range (2 × maxPitchRad =
   * 3.04 rad) inside 363 px, so floor to ceiling is one comfortable drag as
   * well.
   */
  turnPerSweepRad: Math.PI,
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
 * ~175), where a change of angle still changes the pixel; 0.03 is the low end
 * that still separates from black (byte ~30). They are the only numbers in this
 * block chosen by judgement, which is why they are written out rather than
 * folded into a magic intensity.
 *
 * [2026-08-20] AND THEY ARE NOW ABOUT THE RIGHT CHANNEL. Until today they were
 * applied to the stone's LUMINANCE, and the picture clips per channel: the wall
 * at the head landing of the climb 2→3 measured R 226 — the shoulder byte —
 * flat across the frame, while this note claimed byte 185 and mid-curve. Both
 * bytes above are the corrected ones; nothing about the intent changed.
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
  /** The lamp's own colour, and an input to the solve rather than a decoration. */
  colour: LAMP_COLOUR,
  ...deriveLampFalloff({
    nearDistance: STAIR.width / 2,
    farDistance: Math.max(...FLOORS.map((f) => f.innerRadiusAtLevel)),
    nearTarget: 0.35,
    farTarget: 0.03,
    /*
     * THE STONE THE PASSAGE CHEEK IS ACTUALLY MADE OF, in the channel that
     * clips. This used to be LIMESTONE_INTERIOR read as a luminance, and both
     * halves of that were wrong.
     *
     * The drum — inside face as well as out, every cheek and vault of every
     * stair passage, every reveal — is drawn with `shellMat`, the EXTERIOR
     * palette (App.tsx). LIMESTONE_INTERIOR reaches the floors, the cupolas and
     * the treads and nothing else. In red the two run 0.402 against 0.153, a
     * factor of 2.63, so the lamp was solved against a stone it does not light.
     * Add the luminance-for-peak-channel error and the near wall came out at
     * R 226, the shoulder byte, σ 9.6 across the frame.
     */
    nearResponse: peakChannelResponse(LAMP_COLOUR, LIMESTONE_LIGHT),
    /*
     * And the far condition is about the other stone, because the far condition
     * is about what DISAPPEARS rather than what clips: the floor across the
     * widest chamber is LIMESTONE_INTERIOR at the full farDistance. Solved
     * against the bright stone alone it lands on byte 13, which is a floor you
     * cannot see you are standing on.
     */
    farResponse: peakChannelResponse(LAMP_COLOUR, LIMESTONE_INTERIOR),
  }),
  /**
   * Cutoff, metres. Unchanged from the hand-tuned lamp: the widest chamber is
   * 8.7 m across, so this reaches the far wall of any room in the building and
   * the window term is doing nothing at the distances that matter.
   */
  cutoffDistance: 14,
} as const
