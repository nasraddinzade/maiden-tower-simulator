/**
 * THE TERRACE'S TWO SURFACES, decided here rather than in a component.
 *
 * What this module owns is the arithmetic of the roof: where each pane of the
 * balustrade stands and which way it faces, and the meridian the paving course
 * is revolved from — which is where the drainage channel lives. Nothing here
 * touches three.js and nothing here carries a dimension of its own; both
 * functions take their numbers from config/tower.ts and hand back plain
 * geometry for RoofTerrace.tsx to turn into matrices.
 *
 * IT IS HERE BECAUSE OF WHAT HAPPENED WHILE IT WAS NOT. The balustrade was
 * decided inside a useMemo in a .tsx, which rule 6 puts beyond any test, and
 * every balustrade test in the suite passed for two days while every pane on the
 * roof stood at ninety degrees to the fence — because the tests could only see
 * the config's radii and heights, and the config's radii and heights were right.
 * The same lesson was learned on the approach stair a day earlier (commit
 * 089677d) and it is the same cure.
 */

import { azimuthToVector } from './geometry'

const DEG = Math.PI / 180

/**
 * Yaw about Y that puts a box's local +X on the given bearing.
 *
 * A rotation about Y by θ sends +X to (cos θ, 0, −sin θ), and the outward radial
 * at azimuth a is (sin a, 0, −cos a); the two agree at θ = 90° − a and nowhere
 * else. It is one line and it is in the tested half of the codebase because
 * getting it wrong by exactly this quarter turn is fault (a) of 2026-08-16: with
 * θ = −a instead, +X lands on the TANGENT, and every pane on the roof stood
 * broadside to the fence — a radial fin 0.885 m deep and 15 mm wide, half of it
 * buried in the parapet and half of it out over the terrace. FloorStructures'
 * stairwell cutter has had this right all along; the balustrade never did.
 */
export function yawForBearing(azimuthDeg: number): number {
  return Math.PI / 2 - azimuthDeg * DEG
}

// ————————————————————————— the glass balustrade —————————————————————————

/** Everything the balustrade needs to be laid out. BALUSTRADE satisfies it. */
export interface BalustradeSpec {
  postCount: number
  /** m — radius of the post axes. */
  postRadius: number
  postDiameter: number
  postHeight: number
  /** m — radius of a pane's mid-plane where it meets a post. */
  glassRadius: number
  glassThickness: number
  /** m above the deck. */
  glassTop: number
  /** m above the deck. */
  glassBottom: number
  clampReach: number
  clampDiameter: number
}

/** One upright, or the flange under it: a point on the deck. */
export interface BalustradePost {
  x: number
  z: number
  azimuthDeg: number
  diameter: number
  /**
   * m relative to the deck — where the FOOT lands. Zero on the paving, and
   * −channelDepth for anything whose radius falls inside the drainage channel.
   */
  baseY: number
  /** m — the piece's own length, foot to top. */
  height: number
}

/**
 * One pane, as a flat box: a centre, a bearing for its outward normal, and the
 * three sides. `azimuthDeg` is the direction the pane FACES, so its thickness
 * runs along that bearing and its width along the tangent to it.
 */
export interface BalustradePane {
  x: number
  z: number
  /** m above the deck — the pane's centre, not its foot. */
  y: number
  /** Bearing of the outward normal: the plane the sheet stands in. */
  azimuthDeg: number
  /** m — along the tangent, post joint to post joint less the clamps. */
  width: number
  height: number
  thickness: number
  /** m — how far the pane's centre stands from the tower's axis. */
  radius: number
  /** The two posts it is clamped between. */
  betweenAzimuthDeg: readonly [number, number]
}

/**
 * One point clamp: a short cylinder lying ALONG THE RADIUS from the post's face
 * out to the glass, splayed off the post's own line so that the two which meet
 * at a joint do not occupy the same solid.
 */
export interface BalustradeClamp {
  x: number
  z: number
  /** m above the deck. */
  y: number
  /** Bearing the cylinder's axis points along. */
  azimuthDeg: number
  diameter: number
  /** m — the cylinder's length, post face to glass. */
  reach: number
}

export interface Balustrade {
  posts: BalustradePost[]
  /** The bolted-down base plates, one under each post. */
  flanges: BalustradePost[]
  panes: BalustradePane[]
  clamps: BalustradeClamp[]
}

/**
 * Lay the balustrade out round the circuit.
 *
 * THE ONE THING WORTH READING TWICE is where a pane goes. A pane is a flat sheet
 * held on point clamps at two posts, so the sheet stands in the plane those two
 * posts define and nowhere else: its normal points along the bisecting bearing,
 * its width runs along the CHORD between the joints, and its centre sits one
 * sagitta inboard of the post circle because a chord is shorter than its arc.
 * Put the centre on the arc instead and the ends stand proud of the parapet; put
 * the normal on the post's own bearing instead of the bisector and the sheet
 * turns broadside and stops being a fence at all. Both were wrong here until
 * 2026-08-16.
 *
 * THE SECOND ARGUMENT IS THE SURFACE IT IS STANDING ON, and it is optional only
 * because a balustrade with nothing under it is still a well-formed ring. Give
 * it the paving and every foot lands on whatever is actually at that radius —
 * which, on the arrangement this file ships, is the floor of the drainage
 * channel, because the posts stand 0.0725 m in from the parapet and the channel
 * is 0.16 m wide. That is a real disagreement between two measurements and it is
 * drawn rather than papered over; see the note at ROOF_CHANNEL_WIDTH. What the
 * argument prevents is the third thing, which would be a lie: fifty-two flanges
 * hovering 0.03 m over a groove.
 *
 * Only the FEET move. Cap, clamps and glass are measured above the paving and
 * stay there, so a post standing in the channel is simply longer by its depth —
 * which is what a post standing in a channel is.
 */
export function roofBalustrade(spec: BalustradeSpec, deck?: PavingSpec): Balustrade {
  const n = Math.max(3, Math.floor(spec.postCount))
  const stepDeg = 360 / n
  const halfStepRad = (stepDeg / 2) * DEG
  // how far below the deck the ground is under the posts, and so under the
  // flanges: the same for every one of them, because they share a radius
  const footY = deck ? pavingSurfaceY(deck, spec.postRadius) - deck.deckY : 0

  const posts: BalustradePost[] = []
  const flanges: BalustradePost[] = []
  const panes: BalustradePane[] = []
  const clamps: BalustradeClamp[] = []

  /*
   * The chord the sheet spans, joint to joint, and what is left of it after the
   * clamps: the panes are edge to edge with a gap you can see daylight through
   * in roof/011, not butted. Nothing measures that gap; it is taken as the clamp
   * disc, which is the only thing at the joint whose size was read.
   */
  const chord = 2 * spec.glassRadius * Math.sin(halfStepRad)
  const paneWidth = Math.max(0.2, chord - spec.clampDiameter)
  const paneHeight = spec.glassTop - spec.glassBottom
  // a chord's mid-point is its own sagitta inboard of the circle it subtends
  const paneRadius = spec.glassRadius * Math.cos(halfStepRad)

  for (let i = 0; i < n; i += 1) {
    const az = i * stepDeg
    const dir = azimuthToVector(az)

    posts.push({
      x: dir.x * spec.postRadius,
      z: dir.z * spec.postRadius,
      azimuthDeg: az,
      diameter: spec.postDiameter,
      baseY: footY,
      // the cap is measured above the PAVING, so a foot in the channel lengthens
      // the tube instead of dropping the top of it
      height: spec.postHeight - footY,
    })
    /*
     * The flange bolted to the paving. Its diameter is the post's, doubled —
     * read off the [PHOTO] bay, where the flange is about twice the tube — and
     * it is the one part of the balustrade that touches the deck, which is why
     * it matters where the drainage channel's lip is.
     */
    flanges.push({
      x: dir.x * spec.postRadius,
      z: dir.z * spec.postRadius,
      azimuthDeg: az,
      diameter: spec.postDiameter * 2,
      baseY: footY,
      height: 0.02,
    })

    /*
     * Two clamps at the cap and two low down, one for each of the panes that
     * meet at this post — which is why they are offset tangentially rather than
     * sitting on the post's own line. roof/017, roof/021 and roof/032 show the
     * pair splayed on a forked arm; the fork itself is below the resolution this
     * model draws at.
     */
    const tangentX = Math.cos(az * DEG)
    const tangentZ = Math.sin(az * DEG)
    const clampRadius = spec.postRadius + spec.clampReach / 2
    const splay = spec.clampDiameter * 0.75
    for (const y of [spec.postHeight, spec.glassBottom]) {
      for (const side of [-1, 1]) {
        clamps.push({
          x: dir.x * clampRadius + tangentX * splay * side,
          z: dir.z * clampRadius + tangentZ * splay * side,
          y,
          azimuthDeg: az,
          diameter: spec.clampDiameter,
          reach: spec.clampReach,
        })
      }
    }

    // the pane, spanning the bay between this post and the next
    const nextAz = ((i + 1) % n) * stepDeg
    const midAz = az + stepDeg / 2
    const midDir = azimuthToVector(midAz)
    panes.push({
      x: midDir.x * paneRadius,
      z: midDir.z * paneRadius,
      y: spec.glassBottom + paneHeight / 2,
      azimuthDeg: midAz,
      width: paneWidth,
      height: paneHeight,
      thickness: spec.glassThickness,
      radius: paneRadius,
      betweenAzimuthDeg: [az, nextAz],
    })
  }

  return { posts, flanges, panes, clamps }
}

/**
 * The eight corners of a pane, in world XZ and in metres above the deck.
 *
 * BUILT THROUGH yawForBearing() ON PURPOSE, so that it is the same box the
 * component draws and not a second opinion about it. A helper that computed the
 * corners straight from `radius`, `width` and `thickness` would have agreed with
 * the config all through the two days when every sheet was turned broadside; the
 * only way for arithmetic to catch a rotation is to perform it.
 */
export function paneCorners(pane: BalustradePane): Array<{ x: number; y: number; z: number }> {
  const t = yawForBearing(pane.azimuthDeg)
  const ex = { x: Math.cos(t), z: -Math.sin(t) } // the box's local +X, thickness
  const ez = { x: Math.sin(t), z: Math.cos(t) } //  the box's local +Z, width
  const hx = pane.thickness / 2
  const hy = pane.height / 2
  const hz = pane.width / 2
  const corners: Array<{ x: number; y: number; z: number }> = []
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        corners.push({
          x: pane.x + ex.x * hx * sx + ez.x * hz * sz,
          y: pane.y + hy * sy,
          z: pane.z + ex.z * hx * sx + ez.z * hz * sz,
        })
      }
    }
  }
  return corners
}

// ————————————————————— the paving and its drainage channel —————————————————

/** One point of a meridian, ready to be revolved about the tower's axis. */
export interface ProfilePoint {
  r: number
  y: number
}

export interface PavingSpec {
  /** World Y of the paving's top — what you stand on. */
  deckY: number
  /** World Y of the bed the course is laid on. */
  masonryTopY: number
  /** m — the parapet's inner face; the paving's last visible radius. */
  deckOuterRadius: number
  /** m — how far past that face the course is bedded into the parapet. */
  wallEmbed: number
  /** m — width of the drainage channel, measured in from the parapet's face. */
  channelWidth: number
  /** m — how far the channel's floor lies below the paving. */
  channelDepth: number
}

/**
 * The meridian of the paving course, channel and all.
 *
 * BOTTOM FIRST, then out, then up, then in. LatheGeometry winds its triangles
 * from the order the profile is given in, so a profile traversed the other way
 * round comes out with every normal reversed — and a paving slab whose top face
 * points at the floor below it is invisible from the terrace under any
 * single-sided material. Drawn that way the deck read as a hole: you looked down
 * into storey 8 through stone that was there.
 *
 * The channel is a notch taken out of the top run, hard against the parapet.
 * Traversed in this direction its three faces come out pointing INTO the trough
 * — outer wall inward, floor up, inner wall outward — which is what makes it a
 * groove you can see the bottom of rather than a ring of black.
 *
 * The course still reaches `wallEmbed` PAST the parapet's inner face, for the
 * reason the floor slabs are bedded into the wall: an edge that merely touches
 * the face leaves a ring of the mismatch between this lathe and the shell's
 * 96-gon open, and here that ring would look down eleven metres of wall. The
 * channel is cut inboard of that face, so the embedded lip is untouched.
 */
export function pavingProfile(spec: PavingSpec): ProfilePoint[] {
  const outer = spec.deckOuterRadius + spec.wallEmbed
  const top = spec.deckY
  const bottom = spec.masonryTopY
  const pts: ProfilePoint[] = [
    { r: 0, y: bottom },
    { r: outer, y: bottom },
    { r: outer, y: top },
  ]

  const width = Math.max(0, spec.channelWidth)
  const depth = Math.max(0, spec.channelDepth)
  const lip = spec.deckOuterRadius - width
  // a channel with no width, no depth, or deeper than the course it is cut in
  // is not a channel; the paving goes straight in and says nothing about it
  if (width > 0 && depth > 0 && depth < top - bottom && lip > 0) {
    pts.push({ r: spec.deckOuterRadius, y: top })
    pts.push({ r: spec.deckOuterRadius, y: top - depth })
    pts.push({ r: lip, y: top - depth })
    pts.push({ r: lip, y: top })
  }

  pts.push({ r: 0, y: top })
  pts.push({ r: 0, y: bottom })
  return pts
}

/**
 * World Y of the terrace's walking surface at a given radius: the deck
 * everywhere, and the channel's floor inside the channel.
 *
 * Derived from the same numbers the profile is, rather than read off it, so that
 * the two cannot disagree — and stated as a function because there is exactly one
 * radius on the terrace where the answer is not `deckY`, and everything that
 * stands on the terrace has to know which side of it it is on.
 */
export function pavingSurfaceY(spec: PavingSpec, radius: number): number {
  const width = Math.max(0, spec.channelWidth)
  const depth = Math.max(0, spec.channelDepth)
  const lip = spec.deckOuterRadius - width
  const inChannel =
    width > 0 && depth > 0 && lip > 0 && radius > lip && radius <= spec.deckOuterRadius
  return inChannel ? spec.deckY - depth : spec.deckY
}
