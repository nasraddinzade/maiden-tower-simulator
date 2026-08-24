/**
 * THE CAMERA, AND THE ONE RULE THAT DECIDES HOW MUCH OF THE TOWER IS IN FRAME.
 *
 * `App.tsx` used to say `fov: 50`, and in three.js that number is the VERTICAL
 * angle. Nothing in the app ever said what the HORIZONTAL angle was, and on a
 * narrow screen the horizontal is what a visitor actually stands in: it collapses
 * out of the vertical as the viewport gets taller than it is wide.
 *
 *     phone portrait 375×812   24.3°   ← the whole of the complaint
 *     tablet portrait 768×1024 38.6°
 *     desktop 16:9             79.3°
 *     phone landscape 812×375  90.6°
 *
 * Three measurements of what 24.3° costs, taken against the shipped build:
 *
 *   · in a wall passage 0.9 m wide the side walls do not enter the frame until
 *     2.09 m ahead — nearer than that they are off the edge, so the visitor gets
 *     three steps and a brown box, with nothing to say the box is a wall;
 *   · on the first frame of walk mode the highest point of the outer face that
 *     lands in frame is 10.29 m of a 29.5 m wall (41.7%). The tower's own axis
 *     lies 26.1° off the view direction and half the field is 12.15°, so what is
 *     on screen is masonry with no edge, no top and no curvature;
 *   · in the orbit view, portrait is the ONE viewport where the building does not
 *     fit: the buttress overruns the frame by 34% of its half-width.
 *
 * SO THE HORIZONTAL IS THE ANGLE THAT IS HELD, and the vertical is derived from
 * the aspect ratio — the opposite of what three.js asks for, which is why the
 * rule has to exist at all. lib/fieldOfView.ts is the arithmetic; this file is
 * the three numbers and why they are those numbers.
 *
 * No number here is a claim about the building, so rule 1 does not apply and
 * none of them is tagged like a measurement of stone. They are one inherited
 * value, one choice, and one optical limit, and each says which it is.
 */

export interface FovRule {
  /**
   * The horizontal field the camera holds, in degrees. [CHOSEN — 70°]
   *
   * Chosen against the narrowest place a visitor stands, which is the stair
   * passage in the wall at 0.9 m clear. Half-angle 35° puts both side walls in
   * frame from 0.64 m ahead — inside arm's reach, so the passage reads as a
   * passage while you are in it rather than as a corridor that begins two metres
   * away. At the frame edge a rectilinear projection stretches by 1/cos²θ, which
   * at 35° is 1.49× — visible if you look for it, and well short of the point
   * where straight masonry starts to bow.
   *
   * Wider was tried on paper and rejected: 79.3° (the desktop's own horizontal)
   * shows the passage from 0.54 m but stretches the frame edge by 1.69×, and the
   * interior of this building is almost entirely frame edge — you are never more
   * than 3.5 m from a wall on any storey. Narrower brings the complaint back:
   * 45° does not clear the passage width until 1.09 m.
   */
  horizontalDeg: number
  /**
   * The vertical is never allowed BELOW this. [SHIPPED — 50°, unchanged]
   *
   * This is the exact value `App.tsx` has always passed, and it is a floor rather
   * than a target because of one requirement: a desktop visitor must not lose
   * anything. Holding a horizontal angle alone would take vertical field away
   * from every screen wider than the crossover — an ultrawide 21:9 would drop
   * from 50° to 39.1° vertical AND from 95.7° to 70° horizontal, which is a
   * regression dressed as a fix.
   *
   * With the floor in place the arithmetic is one-way: wherever the floor binds,
   * the camera is bit-identical to the shipped one; wherever it does not, BOTH
   * angles are wider than the shipped one. There is no aspect ratio at which
   * anything is given up. fieldOfView.test.ts asserts that over a sweep rather
   * than trusting the paragraph.
   *
   * Where the crossover lands, given the 70° above: aspect 1.5016, a hair wider
   * than 3:2. So 16:10, 16:9 and 21:9 — every shape a desktop window is normally
   * dragged to — come out EXACTLY as they do today, to the digit. Only viewports
   * narrower than 3:2 move at all.
   */
  verticalMinDeg: number
  /**
   * And never ABOVE this. [OPTICS — 90°]
   *
   * On a portrait phone the derived vertical runs away: 70° horizontal at aspect
   * 0.4618 asks for 103.6°, and 79.3° would ask for 121.7°. A rectilinear frame
   * stretches by 1/cos²θ at its edge, so a 90° axis is exactly 2× — the classic
   * limit past which a wide-angle rectilinear image stops reading as a room and
   * starts reading as a lens. 121.7° would be 4.2×.
   *
   * The ceiling is on the DERIVED axis and not on the chosen one, because the
   * chosen one is already inside it and because a desktop's horizontal exceeds
   * 90° on an ultrawide today — capping that would take field away, which the
   * floor above exists to forbid.
   *
   * What the ceiling costs: on a 375×812 phone the horizontal comes out at 49.6°
   * rather than the 70° it asks for. That is still slightly over double the
   * 24.3° it ships with, it clears the 0.9 m passage from 0.97 m ahead, and it
   * puts 91.7% of the wall's height into the first frame of walk mode instead of
   * 41.7%. The phone is the one screen where the cap, not the choice, decides.
   */
  verticalMaxDeg: number
}

export const CAMERA = {
  fov: {
    horizontalDeg: 70,
    verticalMinDeg: 50,
    verticalMaxDeg: 90,
  } as FovRule,

  /**
   * [SHIPPED] both unchanged; they were literals in App.tsx and are now named.
   * The near plane is quoted by the framing tests, which have to know where the
   * frustum starts before they can say what is inside it.
   */
  near: 0.1,
  far: 600,
}

/**
 * WHAT THE RULE DOES TO THE ORBIT FRAMING, since that is where it was caught.
 *
 * Where the orbit view stands is config/orbit.ts and stays there — this file
 * decides only how wide the view is from wherever that is. From the opening
 * position, 50.9 m out and 24 m up, a 375×812 phone under the rule contains the
 * whole built hull: it reaches 62% of the half-frame across and 49% down, and
 * even the conservative bounding CYLINDER of radius 18.95 m that portal.ts culls
 * against fits with 10% to spare. At the shipped 50° it did not — the cylinder
 * overran the frame by 93% of its half-width. The fit holds down to aspect 0.29;
 * no phone made is narrower than 0.45.
 */
