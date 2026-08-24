/**
 * WHERE THE VIEWER MAY STAND WHEN THEY ARE NOT WALKING, in one file.
 *
 * The orbit camera shipped with no limits at all — `<OrbitControls target={[0,
 * TOWER.topY / 2, 0]} enableDamping />`, and that is the whole of it. Measured on
 * a phone, 65 px of upward thumb put the camera under the pavement and the frame
 * went black with only the axis gizmo in it; one pinch took it from 56.3 m out to
 * 349.2 m, where the tower is a mark. Neither state has a way back, because the
 * interface had no control that returns the view to anything.
 *
 * RULE 1 DOES NOT APPLY HERE, for the reason config/ui.ts gives about the
 * interface's own dimensions: not one number below is a claim about the building.
 * Every one is either a policy — how much clearance a camera keeps, how far off
 * the pole it may go — or a value DERIVED from a dimension the model already
 * carries and cites. Nothing here moves any geometry, and the two framings the
 * app opens on (position and target) are the shipped ones, lifted out of the
 * `<Canvas>` prop unchanged so the reset control has something to return TO.
 *
 * The arithmetic is src/lib/orbitFraming.ts and the tests are on both.
 */

import { polarFloorLimit, hullSphereRadius, orbitStateOf, type Vec3 } from '../lib/orbitFraming'
import { BUTTRESS, TOWER } from './tower'
import { GROUND_Y as SITE_GROUND_Y, SITE } from './site'
import { PLAYER } from './player'

const DEG = Math.PI / 180

/**
 * THE POINT THE VIEW TURNS ABOUT. `TOWER.topY / 2` = 13.75 m — the shipped
 * value, moved here rather than changed.
 *
 * It is not quite the middle of what you can see: the tower stands from the
 * paving at −1.98 to the parapet at 27.50, whose midpoint is 12.76. The 0.99 m
 * difference is the raised sill — `topY / 2` halves the height above the STOREY-1
 * FLOOR datum, not above the ground. Correcting it would tilt the opening view by
 * about a degree and would be a change to what the visitor first sees, which is
 * not what this file is for. It is written down so the next person does not have
 * to rediscover it.
 */
const TARGET: Vec3 = [0, TOWER.topY / 2, 0]

/**
 * The camera position the `<Canvas>` has always opened on, lifted out of the
 * prop so that the reset control and the opening view cannot drift apart. If a
 * camera config ever grows here — one owning the field of view and the near and
 * far planes, which are still literals in App.tsx — the framing belongs to it and
 * this should read from there rather than keep a second copy.
 */
const OPENING_POSITION: Vec3 = [36, 24, 36]

/**
 * How far the camera may go horizontally: TO THE EDGE OF THE GROUND, and no
 * further. SITE.radius = 118.25 m.
 *
 * This is the "losing the building" limit and it is deliberately NOT expressed as
 * a field-of-view rule, though it could be. Two reasons. The ground disc is a
 * hard edge in the model — past it there is nothing under the camera at all, and
 * the visitor is looking at a saucer with a tower on it from off the side of the
 * saucer — whereas a field-of-view rule is a matter of taste about how small the
 * building may get. And a rule stated in metres does not go stale if the camera's
 * fov is ever changed; one stated in screen fractions silently does.
 *
 * Since d ≥ d·sin φ for every polar angle, capping the RADIUS at the disc's
 * radius keeps the camera over the paving at every angle, which is the guarantee
 * wanted. What it costs the visitor: at the 50° vertical field the app ships
 * today the tower still fills 26.7% of the frame's height by the head-on
 * arithmetic, and 29.2% measured off the real projection in the browser — the
 * formula is a lower bound because the near face is closer than the axis is.
 * Against 9.1% at the 349.2 m the unbounded pinch reached.
 */
const MAX_DISTANCE = SITE.radius

/**
 * HOW FAR THE BUILT MODEL REACHES FROM ITS OWN AXIS: 18.95 m.
 *
 * The drum's 8.25 plus the buttress's 10.7 m projection — which is to say the
 * beak's tip, since beakOutline() puts the nose exactly there. It is the
 * buttress and not the drum that decides the near limit, and by a long way: 8.25
 * would let the camera into 10.7 m of solid pier.
 */
const HULL_REACH = TOWER.outerRadius + BUTTRESS.projection

/**
 * The clearance kept outside that hull, metres.
 *
 * Two things to pay for and both small. The near plane sits 0.1 m ahead of the
 * camera, so a camera exactly on the hull already has stone inside its frustum.
 * And the shell is not smooth: course bands, window surrounds and the roof guard
 * stand a few centimetres proud of the nominal outer radius, and none of them is
 * in HULL_REACH. Half a metre covers both with room to spare, and costs nothing —
 * the sphere is conservative by tens of metres in most azimuths anyway.
 */
const HULL_CLEARANCE = 0.5

/**
 * THE FLOOR THE CAMERA MAY NOT GO BELOW: the height of the walker's own eye,
 * −0.48 m, which is 1.50 m above the paving at −1.98.
 *
 * The choice of PLAYER.eyeHeight rather than the ground plane itself is not
 * decoration. A camera exactly ON the ground plane sees the paving edge-on, which
 * is a half-black frame and reads as the same failure; and this project already
 * has one answer to the question "how low can a person see this building from",
 * which is where it puts the walker's eye. Below that is not a viewpoint any
 * visitor of the tower has ever had.
 */
const CAMERA_FLOOR_Y = SITE_GROUND_Y + PLAYER.eyeHeight

/**
 * HOW CLOSE TO STRAIGHT OVERHEAD, in degrees off the +Y axis. 10°.
 *
 * This one is legibility and it is stated as such — the zenith is not a trap the
 * way the ground is, and three clamps the pole itself so the view never goes
 * degenerate. What happens at 0° is that the tower stops being a tower: the
 * silhouette is the roof disc and the 29.5 m the building is known for is gone
 * from the picture entirely.
 *
 * 10° gives that height back — 29.5·sin 10° = 5.1 m of drum in elevation — and
 * takes almost nothing for it, because the plan is foreshortened by cos 10° =
 * 0.985, a compression of 1.5% that nobody can see. The plan view survives; only
 * the exactly-overhead view goes.
 */
const POLE_GUARD_DEG = 10

/**
 * The smallest sphere about the target that contains the model, plus clearance:
 * 24.63 + 0.50 = 25.13 m.
 *
 * The binding corner is the BOTTOM of the beak — the tip at 18.95 m out and the
 * paving 15.73 m below the target — not the top, which is 23.41. Worth saying
 * because the target sits above the middle of the building, so the near limit is
 * set by the part of the model the camera has to swing UNDER.
 */
const MIN_DISTANCE = hullSphereRadius(HULL_REACH, SITE_GROUND_Y, TOWER.topY, TARGET[1]) + HULL_CLEARANCE

/**
 * 96.91°, six degrees past level.
 *
 * Derived at MAX_DISTANCE because that is where a given angle drops the camera
 * furthest — see polarFloorLimit(). At the far limit it puts the camera exactly
 * on the floor; at the distance the app opens on it stops at y = 7.50, and at the
 * near limit at 10.73. So a visitor who wants to look UP at the tower from
 * eye-level has to back off to do it, which is what a person outside a building
 * does anyway.
 */
const MAX_POLAR = polarFloorLimit(TARGET[1], CAMERA_FLOOR_Y, MAX_DISTANCE)

export const ORBIT = {
  /** The point the orbit turns about. See TARGET. */
  target: TARGET,
  /**
   * THE FRAMING THE RESET CONTROL RETURNS TO, and the one the `<Canvas>` opens
   * with — the same object, so they cannot drift apart. 51.93 m from the target
   * at a polar angle of 78.62°, both comfortably inside the limits below; a test
   * asserts that, because a reset that lands on a clamp would be a reset the
   * controls immediately move away from.
   */
  opening: {
    position: OPENING_POSITION,
    target: TARGET,
  },
  /** m — no closer than this to the target. See MIN_DISTANCE. */
  minDistance: MIN_DISTANCE,
  /** m — no further than this from the target. See MAX_DISTANCE. */
  maxDistance: MAX_DISTANCE,
  /** rad — no nearer the zenith than this. See POLE_GUARD_DEG. */
  minPolar: POLE_GUARD_DEG * DEG,
  /** rad — no lower than this. See MAX_POLAR. */
  maxPolar: MAX_POLAR,

  /* ── the inputs the two derived angles were read off, kept for the tests ── */

  /** m — world Y the camera may not descend below. See CAMERA_FLOOR_Y. */
  cameraFloorY: CAMERA_FLOOR_Y,
  /** m — how far the built model reaches from its axis. See HULL_REACH. */
  hullReach: HULL_REACH,
  /** m — clearance kept outside the model's bounding sphere. See HULL_CLEARANCE. */
  hullClearance: HULL_CLEARANCE,
} as const

/** The opening framing as OrbitControls would hold it. Used by the tests. */
export const OPENING_STATE = orbitStateOf(OPENING_POSITION, TARGET)
