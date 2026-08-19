/**
 * The SECTION of a chamber doorway — one semicircular head, described once.
 * three.js-free so it can be unit-tested (CLAUDE.md rule 6).
 *
 * ═════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS: THE ARCH WAS DRAWN AND THE HOLE WAS SQUARE.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * towerShell.ts → archTunnel() cuts every chamber doorway as a round-arched
 * opening: jambs to a springing, then a semicircle of half the clear width. That
 * is the head the owner's footage shows over the doors out of the chambers onto
 * the stair (windows.json → footageReading.headShapes: down/130, down/156,
 * down/163; and over the portal, down/205, down/207).
 *
 * collision.ts → wallColliders() opened a RECTANGLE. Not the same rectangle
 * either: a sector is opened whole if it overlaps the doorway at all, so the
 * hole in the physics ran up to `widthDeg/2 + sectorDeg` each side of the centre
 * line — 18.7° against a doorway 15.0° wide — and it was square-headed at the
 * crown. Measured on the shipped configuration, at storey 4's head doorway:
 * 0.480 m of drawn jamb beside the opening with no collider behind it, and the
 * whole haunch of the arch — up to 0.63 m of stone over the walker's head —
 * standing in nothing at all.
 *
 * That is the mechanism the owner walked into twice. It is also, exactly, how
 * he came to walk THROUGH the vault: while CUPOLA_RISE was 0.9 the cupola's
 * skirt hung to floor + 1.350 and the doorway's head stood at floor + 2.100, so
 * the skirt crossed the opening — and the opening was a hole in the physics for
 * its full square height, so the stone hanging across it was drawn and not
 * collided. The rise is 0.25 now and the skirt clears every head by half a
 * metre (doorwayArch.test.ts states it in metres), but the fault underneath was
 * never the rise: ANYTHING drawn inside that square hole was a ghost, because
 * nothing in the model made the collider's hole the same shape as the stone's.
 *
 * So the shape is defined ONCE, here, and both sides read it. archTunnel()
 * takes its springing from archSpringHeight(); wallColliders' reveal is built
 * from revealFacets(). They cannot part company again without this file moving.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * NOTHING HERE IS A DIMENSION OF THE BUILDING.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Only two lengths enter: the doorway's clear width and its clear height, both
 * from config/tower.ts, both argued there. A semicircular head of half the clear
 * width is the form archTunnel() has always struck and is what the footage
 * shows; the springing follows from the two lengths and is not free.
 *
 * The one number chosen here is how finely a curve is approximated by flat
 * colliders, and it is not chosen by taste either — see revealFacets().
 */

/** Smallest springing a head may have, metres — archTunnel()'s own clamp. */
const MIN_SPRING = 0.01

/**
 * The clear width the cutter actually strikes, metres.
 *
 * doorwayCutter() extrudes ONE straight section radially through the wall, so
 * the opening has a single width and the section has to be wide enough to clear
 * the arc at the far end of its run — hence the chord at the doorway's OUTER
 * radius rather than at the room face or at the flight's mid-radius.
 *
 * IT IS THEREFORE NOT STAIR.doorwayWidth, and the difference is not small: at
 * 1.1 m and the storeys' radii this comes out 1.230–1.256 m, so every doorway in
 * the tower is drawn some 0.15 m wider than the config's clear width, and the
 * head springs 0.078 m lower than that width would put it. That is a dimension
 * of the building arriving from a convenience of the cutter, which is the exact
 * fault config/tower.ts was corrected for on 2026-08-16 — and it is NOT settled
 * here, because narrowing the section to 1.1 m risks leaving slivers of stone
 * standing in the passage mouth where the doorway's bearing and the flight's
 * differ, and that has to be measured before it is done, not assumed.
 *
 * What this function does settle is that ONE figure is used. The reveal
 * collider is laid on the width the stone is actually cut to, whatever that
 * width turns out to be, so correcting it later moves the drawing and the
 * physics together.
 */
export function drawnClearWidth(outerRadius: number, widthDeg: number): number {
  return Math.max(0.2, 2 * outerRadius * Math.sin(((widthDeg * Math.PI) / 180) / 2))
}

/**
 * Height above the sill at which the semicircular head springs.
 *
 * The head is a semicircle of radius half the clear width, so it occupies the
 * top `clearWidth/2` of the opening and the jambs carry the rest. Where the
 * opening is wider than twice its height there is no jamb left and the clamp
 * takes over — which is archTunnel()'s behaviour, kept here so the two agree
 * at the degenerate end as well as in the ordinary case.
 */
export function archSpringHeight(clearWidth: number, clearHeight: number): number {
  return Math.max(MIN_SPRING, clearHeight - clearWidth / 2)
}

/**
 * Half the opening's width at a height above the sill: constant up the jambs,
 * then the semicircle. Outside [0, clearHeight] there is no opening at all.
 */
export function archHalfWidthAt(
  clearWidth: number,
  clearHeight: number,
  heightAboveSill: number,
): number {
  if (heightAboveSill < 0 || heightAboveSill > clearHeight) return 0
  const half = clearWidth / 2
  const spring = archSpringHeight(clearWidth, clearHeight)
  if (heightAboveSill <= spring) return half
  const up = heightAboveSill - spring
  if (up >= half) return 0
  return Math.sqrt(half * half - up * up)
}

/**
 * One flat face of the reveal, in the doorway's own plane: tangential offset
 * from the centre line (`t`, metres) against height above the sill (`y`).
 *
 * The plane is the doorway's TANGENT plane, not the drum's cylinder, because
 * the thing being described is the stone round a straight prism — doorwayCutter
 * extrudes one constant section radially, so its jambs are flat and its head is
 * a true semicircle rather than a surface of revolution.
 */
export interface RevealFacet {
  /** Unit normal, pointing away from the opening into the stone. */
  normalT: number
  normalY: number
  /** A point on the facet: where it touches the opening. */
  faceT: number
  faceY: number
  /** Half the facet's run along its own face. */
  halfLength: number
  /**
   * How far the stone behind this facet has to reach along its normal.
   *
   * Per facet, because the two families answer to different boundaries. A jamb
   * has to cross the hole the WALL RING leaves beside the doorway, which is the
   * caller's `depth` and is most of a metre. The head only has to fill what the
   * square cutter took and the arch gave back — see revealFacets — and that is a
   * quarter of it. They shared the jamb's figure until 2026-08-19, which was
   * harmless while the reveal was one slab per facet and expensive once it was
   * coursed: three quarters of the boxes were stone above the crown.
   */
  depth: number
}

/**
 * How many flat facets a head of this radius needs to be no more than
 * `tolerance` outside the curve.
 *
 * The facets are TANGENT to the arch, never chords. The distinction is the
 * whole safety argument: a tangent polygon contains the circle, so a facet can
 * never reach into the opening and wall a doorway up, and the error is a sliver
 * of stone left uncollided at each corner instead. This model has been walled
 * out of its own stair before and the failure is far worse than a 16 mm ghost.
 *
 * A facet spanning `Δ` of arc stands `R·(sec(Δ/2) − 1)` off the curve at its
 * ends, so N facets over the semicircle give `R·(sec(π/2N) − 1)`.
 */
export function archFacetCount(radius: number, tolerance: number): number {
  if (radius <= 0 || tolerance <= 0) return 1
  // solve R(sec(π/2N) − 1) ≤ tol  ⇒  N ≥ π / (2·acos(R/(R+tol)))
  const ratio = radius / (radius + tolerance)
  const halfAngle = Math.acos(Math.min(1, Math.max(-1, ratio)))
  if (halfAngle <= 1e-9) return 1
  return Math.max(1, Math.ceil(Math.PI / (2 * halfAngle)))
}

export interface RevealSection {
  /** The width the shell is CUT to — see drawnClearWidth(). */
  clearWidth: number
  /** Sill to crown. */
  clearHeight: number
  /**
   * How far the stone has to be held away from the opening, metres.
   *
   * It sizes the facets, which is not obvious and is where the first version of
   * this went wrong. Two neighbouring tangent planes meet in a wedge that OPENS
   * as you go away from the curve, so slabs long enough to meet at the arch
   * itself part company further out: measured, a gap 0.167 m beyond the arc at
   * 0.51 m across and 1.67 m up, in the haunch over a walker's head. A facet
   * therefore runs `(half + depth)·tan(Δ/2)`, not `half·tan(Δ/2)`.
   */
  depth: number
  /**
   * Largest distance a facet may stand off the curve. The caller passes the
   * fidelity the rest of its collider is built to — see doorwayRevealBoxes(),
   * where it is the drum ring's own chord dip: the arch is approximated exactly
   * as coarsely as the wall it is cut in, and no more finely, because a collider
   * sharper than the wall around it buys nothing anybody can feel.
   */
  tolerance: number
  /** The threshold's rake, as doorwayCutter shears the tool by it. */
  rake?: number
}

/**
 * The stone round the opening, as flat faces laid ON it.
 *
 * Two jambs and a ring of facets over the head. The jambs are tangent to the
 * head at its springing, so they belong to the same family and the corner where
 * a jamb meets the first head facet has the same error as any other corner.
 *
 * A facet is returned as a face, not as a box: it has no thickness and no
 * radial extent, because how deep INTO THE WALL the stone goes is a question
 * about the stair passage behind it, and that is the caller's to answer. What
 * is settled here is where the stone starts, which is the only part the drawn
 * opening decides.
 *
 * THE RAKE IS EXACT, not approximated. doorwayCutter() shears the whole tool —
 * `y += rake·t` — so a raked doorway's head leans with its sill, and a shear
 * carries planes to planes: the face point rides the shear and the normal
 * transforms by the inverse transpose, (nT, nY) → (nT − rake·nY, nY). Only the
 * run along a face stretches. One doorway in the tower rakes — the opening onto
 * storey 5, halfway along the single 4→6 flight, where the treads really do
 * pass the doorway at different heights.
 */
export function revealFacets(s: RevealSection): RevealFacet[] {
  const half = s.clearWidth / 2
  const spring = archSpringHeight(s.clearWidth, s.clearHeight)
  const rake = s.rake ?? 0
  const out: RevealFacet[] = []

  /*
   * The two jambs: vertical faces at ±half, running the WHOLE height and not
   * merely up to the springing.
   *
   * The jamb plane is tangent to the head at its springing, so above that point
   * it lies outside the opening and cannot block anything — and it has to go up
   * there, because the head facets are short. A facet only spans its own arc,
   * so above the springing and outboard of the head there is a strip of stone
   * that belongs to neither: measured before this ran the full height, a gap at
   * 1.13 m across and 1.15 m up, which is beside a walker's shoulder.
   *
   * A vertical line is the one direction the shear leaves alone, so a jamb keeps
   * its plane; what moves is how much of it has to be there. Over the tangential
   * run the slab covers, the sheared band slides by `rake × depth`, so the jamb
   * grows by that at each end.
   */
  const slide = Math.abs(rake) * (half + s.depth)
  for (const side of [-1, 1]) {
    out.push({
      normalT: side,
      normalY: 0,
      faceT: side * half,
      faceY: s.clearHeight / 2 + rake * side * half,
      halfLength: s.clearHeight / 2 + slide,
      depth: s.depth,
    })
  }

  /*
   * HOW DEEP THE HEAD GOES, which is not how deep the jambs go.
   *
   * What the head has to put back is the difference between the square hole the
   * collider ring cuts and the arched one the shell draws: the region above the
   * arc, under the square's top — which is the crown's own level — and inside
   * `|t| ≤ half`, because past that the jambs already run the whole height. The
   * furthest that boundary lies from the arc along a normal is over the 45°
   * haunch, at `half·(√2 − 1)`; the tolerance is added because a facet stands
   * that far off the curve to begin with, and the rake because a shear carries
   * the corner sideways.
   */
  const headDepth = Math.min(
    s.depth,
    half * (Math.SQRT2 - 1) + s.tolerance + Math.abs(rake) * half,
  )
  const n = archFacetCount(half, s.tolerance)
  const step = Math.PI / n
  // long enough that neighbouring slabs still meet at the far edge of the stone
  const halfLength = (half + headDepth) * Math.tan(step / 2) * 1.08
  for (let i = 0; i < n; i += 1) {
    const theta = (i + 0.5) * step // 0 at the +t springing, π at the −t one
    const faceT = half * Math.cos(theta)
    const faceY = spring + half * Math.sin(theta)
    const nt = Math.cos(theta) - rake * Math.sin(theta)
    const ny = Math.sin(theta)
    const len = Math.hypot(nt, ny) || 1
    out.push({
      normalT: nt / len,
      normalY: ny / len,
      faceT,
      faceY: faceY + rake * faceT,
      halfLength: halfLength * Math.sqrt(1 + rake * rake),
      depth: headDepth,
    })
  }
  return out
}
