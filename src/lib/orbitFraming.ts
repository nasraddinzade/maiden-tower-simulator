/**
 * THE ORBIT CAMERA'S ARITHMETIC, and the thing an unbounded one does to a thumb.
 *
 * MEASURED ON A 375×812 PHONE, on the shipped `<OrbitControls target={[0,
 * TOWER.topY / 2, 0]} enableDamping />` with no limits of any kind:
 *
 *   upward drag   40 px    60 px    80 px    200 px
 *   camera y      8.50     0.36     −7.21    −36.68   m
 *
 * The ground outside is at −1.98, so somewhere around 65 px of thumb the camera
 * leaves the world through the pavement and the frame goes black — the axis
 * gizmo is the only thing left in it (`mob_08_under_ground.png`, camera y
 * −38.18). 65 px is about a centimetre of travel and less than twice the 44 px
 * this project already calls the smallest thing a finger may be asked to hit.
 * Nobody aims for it; it is what an ordinary tap does when the thumb rolls.
 *
 * The dolly was unbounded at the other end: one pinch took the camera from 56.3
 * to 349.2 m and the tower became a mark in an empty sky.
 *
 * NOTHING HERE IS ABOUT THE BUILDING and rule 1 does not apply — the same
 * reasoning config/ui.ts sets out. A camera limit is not a measurement; it is a
 * rule about where a viewer may stand, and every one of them below is derived
 * from a dimension the model already carries.
 *
 * These are PURE FUNCTIONS taking explicit arguments, so that config/orbit.ts
 * can apply them to the tower's own numbers without this file having to import
 * the tower. The values that fall out are in config/orbit.ts with their
 * reasoning; the tests exercise both.
 *
 * CONVENTIONS, and they are three.js OrbitControls' own:
 *   · the camera's position is spherical about the TARGET, not the origin;
 *   · `polar` is measured from +Y — 0 is straight above the target, π/2 is level
 *     with it, and anything past π/2 puts the camera BELOW the target's plane;
 *   · distances are metres, angles radians, drags CSS pixels.
 */

/** Where the camera is, in the frame OrbitControls actually clamps in. */
export interface OrbitState {
  /** Metres from the target. OrbitControls' `spherical.radius`. */
  distance: number
  /** Radians from +Y. OrbitControls' `spherical.phi`. */
  polar: number
}

/** The four numbers OrbitControls will take, and the only four it will take. */
export interface OrbitLimits {
  minDistance: number
  maxDistance: number
  minPolar: number
  maxPolar: number
}

export type Vec3 = [number, number, number]

/**
 * World Y of a camera at this state. The one line the whole fault reduces to:
 * past polar = π/2 the cosine is negative and the camera is descending, and
 * nothing in the shipped controls said where to stop.
 */
export function cameraHeight(targetY: number, s: OrbitState): number {
  return targetY + s.distance * Math.cos(s.polar)
}

/**
 * How far the camera stands from the tower's axis, on the ground's own plane.
 * This is what decides whether it is still over the modelled site or out past
 * the rim of it.
 */
export function cameraGroundReach(s: OrbitState): number {
  return Math.abs(s.distance * Math.sin(s.polar))
}

/** The spherical state of a camera at `position` orbiting `target`. */
export function orbitStateOf(position: Vec3, target: Vec3): OrbitState {
  const dx = position[0] - target[0]
  const dy = position[1] - target[1]
  const dz = position[2] - target[2]
  const distance = Math.hypot(dx, dy, dz)
  // acos of the clamped ratio: at distance 0 the polar angle is undefined, and
  // an OrbitControls that has been dollied onto its own target is a state this
  // module exists to make unreachable rather than one it should model.
  const polar = distance === 0 ? Math.PI / 2 : Math.acos(clamp(dy / distance, -1, 1))
  return { distance, polar }
}

/** What OrbitControls.update() does to a state, in one place, testable. */
export function clampOrbit(s: OrbitState, l: OrbitLimits): OrbitState {
  return {
    distance: clamp(s.distance, l.minDistance, l.maxDistance),
    polar: clamp(s.polar, l.minPolar, l.maxPolar),
  }
}

/**
 * THE THUMB, AS AN ANGLE. three's own mapping, and the reason 60 px matters.
 *
 * `handleTouchMoveRotate` → `rotateUp(2π · Δy / element.clientHeight)`, and
 * `rotateUp(a)` does `sphericalDelta.phi -= a`. Δy is measured downwards, so a
 * drag UP the screen is a negative Δy and therefore a POSITIVE change of polar
 * angle: the gesture that means "look up at the tower" is the gesture that
 * drives the camera down through the floor.
 *
 * A full screen height of drag is a full turn — 812 px for 2π. That is the
 * whole of the sensitivity: there is no acceleration curve and no per-device
 * scaling, so a phone's short axis makes the camera four times as twitchy as a
 * 1600 px desktop window does for the same finger movement.
 *
 * `upwardDragPx` is positive upwards, so that the sign reads the way the thumb
 * moves rather than the way the DOM counts.
 */
export function polarAfterDrag(
  polar: number,
  upwardDragPx: number,
  viewportHeightPx: number,
): number {
  return polar + (2 * Math.PI * upwardDragPx) / viewportHeightPx
}

/**
 * The smallest sphere, centred on a target ON THE AXIS, that contains a solid of
 * revolution reaching `reach` metres from that axis and standing between
 * `bottomY` and `topY`.
 *
 * WHY A SPHERE AND NOT THE SILHOUETTE: `minDistance` is spherical — it is the
 * only near limit OrbitControls has — so the honest bound is the conservative
 * one. The alternative is a per-frame test of the camera against the model's
 * real outline, which fights the damping and has to run whether or not anybody
 * is dragging. A sphere costs the visitor the band between the drum's face and
 * the sphere in the azimuths where nothing projects, and buys the guarantee that
 * NO azimuth puts the camera inside stone.
 */
export function hullSphereRadius(
  reach: number,
  bottomY: number,
  topY: number,
  targetY: number,
): number {
  return Math.max(Math.hypot(reach, targetY - bottomY), Math.hypot(reach, topY - targetY))
}

/**
 * The largest polar angle that still keeps the camera at or above `floorY`, at
 * every distance out to `maxDistance`.
 *
 * The invariant wanted is on the camera's HEIGHT and the control clamps its
 * ANGLE, and height depends on both: y = targetY + d·cos φ. One constant angle
 * can only be safe for every allowed d if it is safe for the WORST d, which is
 * the largest — the further out the camera is, the further the same angle drops
 * it. So this is deliberately conservative at close range: at the distance the
 * app opens on, the clamp stops the camera some metres higher than it strictly
 * needs to.
 *
 * That is the price of a limit that is a number rather than a frame loop, and it
 * is worth paying. A per-frame height guard would have to push the polar angle
 * back while the damping is still carrying the camera the other way, which is a
 * fight the visitor can feel; a constant is applied by OrbitControls' own
 * `update()` before anything is drawn, so the view simply stops.
 */
export function polarFloorLimit(targetY: number, floorY: number, maxDistance: number): number {
  return Math.acos(clamp((floorY - targetY) / maxDistance, -1, 1))
}

/**
 * What fraction of the viewport's HEIGHT a vertical extent of `extent` metres
 * fills, seen head-on from `distance` with a vertical field of `fovDeg`.
 *
 * Vertical, and that matters: three's `fov` is the vertical one, so this figure
 * is the same on a phone in portrait as on an ultrawide. It is what "losing the
 * building" means as arithmetic — at the 349.2 m the pinch reached, the tower's
 * 29.5 m filled 9.1% of the frame, some 74 px of an 812 px screen, at which
 * point neither the storeys nor the beak are separable from each other.
 */
export function frameHeightFraction(extent: number, distance: number, fovDeg: number): number {
  const frame = 2 * distance * Math.tan((fovDeg * Math.PI) / 360)
  return extent / frame
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
