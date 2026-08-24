/**
 * Who gets the survey aids.
 *
 * The ground grid, the axes cross and the corner axis gizmo are instruments for
 * building the tower, not for visiting it. They were gated on `!firstPerson`
 * alone — a question about where the CAMERA is standing, where the question
 * meant was who is LOOKING — so all three shipped to the public site and met the
 * visitor on the page he lands on. Measured on the phone against the built
 * bundle, 2026-08-24: prod_P_03_daylight.png, prod_L_02_sheet.png,
 * prod_T_01_orbit.png.
 *
 * The gizmo is the worst of the three, twice over. It sits bottom-right, which
 * is where a right thumb rests on a phone — a control-looking thing under the
 * thumb that swings the camera when pressed, with nothing in the interface
 * naming it. And it renders a second pass after the scene, which is what left
 * the F3 readout reporting nine draw calls for a ninety-five-call frame; see
 * lib/frameCounters.ts.
 *
 * BOTH CONDITIONS STAY. Inside the tower the grid shows through the floor and
 * the axes hang down the middle of every room, so `!walking` was right as far as
 * it went. It was never the whole rule.
 *
 * This is the same line `<Leva hidden={!import.meta.env.DEV}>` already drew for
 * the tuning panel, and drawn for the same reason: a public control that alters
 * what the app is saying about the building, with no indication that it has.
 */
export interface HelperContext {
  /** `import.meta.env.DEV` — true under `npm run dev`, false in the built bundle. */
  dev: boolean
  /** The visitor is walking the model rather than orbiting it. */
  walking: boolean
}

export function showSurveyAids({ dev, walking }: HelperContext): boolean {
  return dev && !walking
}
