/**
 * THE INTERFACE'S OWN DIMENSIONS, in CSS pixels, in one file.
 *
 * Rule 2 asks for the model's geometry to come from config and never from a
 * literal in a component. The interface had no such file and every panel carried
 * its own numbers: `width: 268`, `bottom: 44`, `maxHeight: '52vh'`, `padding:
 * '7px 10px'`, each true only of itself. That is why nobody could say what the
 * chrome covered until it was measured in a browser — the answer was spread over
 * six components and none of them could see the others.
 *
 * It is not tower geometry and rule 1 does not apply: no number here is a claim
 * about the building. Every one of them is either a published interface minimum,
 * an existing shipped value moved here unchanged, or a fraction with its
 * reasoning beside it.
 *
 * The layout arithmetic that reads these is src/lib/screenLayout.ts, and it is
 * the same arithmetic the components lay themselves out with. That is what makes
 * the coverage figures in screenLayout.test.ts statements about the interface
 * rather than about a model of it.
 */

export const UI = {
  /**
   * The gap between a panel and the edge of the screen, and between panels.
   * 12 px, which is what every docked panel already used.
   */
  gutter: 12,

  /**
   * The smallest thing a finger may be asked to hit.
   *
   * 44 CSS px: WCAG 2.5.5 (Target Size, AAA) and Apple's HIG both put it at 44,
   * Material at 48 dp. The docked panels' own buttons are 20–26 px tall — fine
   * for a cursor, which lands where it is pointed, and not usable by a thumb,
   * which lands within about 10 mm of where it is aimed. Nothing in the compact
   * layout may be smaller than this, and screenLayout.test.ts asserts it of the
   * constants rather than trusting the components.
   */
  minTouchTarget: 44,

  /**
   * THE LAYOUT AS IT SHIPS ON A DESKTOP, unchanged — these are the values the
   * panels already carried, lifted out of them so that the breakpoint can be
   * derived from the panels' real widths instead of guessed at.
   */
  docked: {
    /**
     * SunControls: fixed to the bottom-left corner.
     *
     * OUTER widths throughout this block, and the panels are set to
     * `box-sizing: border-box` so that the number here is the number on screen.
     * They used to be content widths — 268 + 10 padding + 1 border each side —
     * which is how a layout whose panels are laid out side by side could be
     * written entirely in numbers that were each 22 px smaller than the thing
     * they described. 290 renders identically to the 268 that shipped.
     */
    sunWidth: 290,
    /** Clear of the CSG stats line that sits at bottom: 12 in a dev build. */
    sunBottom: 44,
    sunMaxHeightFraction: 0.52,

    /** HypothesisPanel: fixed to the bottom-right corner. 330 + 12 + 1, each side. */
    hypothesisWidth: 356,
    hypothesisMaxHeightFraction: 0.72,

    /** DatumCaveat: centred along the bottom edge, between the other two. */
    noticeWidth: 542,
    /** One line of 11px/1.5 text plus 7px padding and a border, top and bottom. */
    noticeHeight: 33,

    /**
     * The text-sized controls, at the width their longest shipped label takes.
     * Approximations, and marked as such: they are used only to report how much
     * of the screen the docked layout covers, and the two panels above — which
     * are eight times their area — are exact.
     */
    walkButtonWidth: 150,
    walkButtonHeight: 32,
    secondaryRowWidth: 190,
    secondaryRowHeight: 26,
    languageSwitcherWidth: 112,
    languageSwitcherHeight: 28,
    hintWidth: 300,
    hintHeight: 52,
  },

  /**
   * THE LAYOUT FOR A SMALL SCREEN. One bar along the bottom edge, one panel at a
   * time raised from it, and nothing else on screen by default.
   *
   * The reason it is a bottom bar and not the top-left/top-right corners the
   * docked layout uses: a phone is held in one hand and the thumb reaches the
   * bottom third of the screen. `Walk inside` and the language switcher are the
   * two controls the brief requires within one-handed reach, and on a 812 px tall
   * screen the top-right corner is not within anybody's reach.
   */
  compact: {
    /**
     * The action bar. 56 px is Material's bottom app bar and it is the smallest
     * height that holds a 44 px target with 6 px of breathing room above and
     * below. The safe-area inset is added OUTSIDE this, as padding, so the bar's
     * touchable part never sits under a home indicator.
     */
    barHeight: 56,

    /**
     * The one-line notice above the bar (the datum caveat). 48 rather than 44 so
     * that the 44 px dismiss button inside it is not flush with its edges.
     */
    noticeHeight: 48,

    /** Between the notice and the bar. */
    stackGap: 8,

    /**
     * PORTRAIT: the sheet rises from the bar and stops at 55% of the viewport.
     *
     * Not 100%, and this is the whole point of the rework: at 375×812 the docked
     * panels covered 66–70% of the screen with the tower behind them, and a sheet
     * that filled the screen would only have moved that failure behind a tap. 55%
     * plus the bar leaves the top 38% of the screen showing the building the
     * panel is talking about, which is the minimum for a panel about a building.
     */
    sheetMaxHeightFraction: 0.55,

    /**
     * LANDSCAPE: the sheet is a column against the trailing edge instead, because
     * height is the scarce axis when the phone is turned to look at a building —
     * 375 px of it — and a sheet taking 55% of that leaves a strip. As a column it
     * costs width, of which there is 812.
     */
    sheetWidth: 360,
    sheetWidthFraction: 0.45,

    /**
     * The transient hint shown on entering walk mode, above the bar. It is its
     * own dismiss button — a tap anywhere on it takes it away — so it is a touch
     * target and gets the full 44 rather than the height one line needs.
     */
    hintHeight: 44,
    /** How long it stays before it takes itself away, milliseconds. */
    hintDurationMs: 7000,
  },
} as const

/**
 * ORIENTATION IS A SHAPE, NOT A SENSOR READING.
 *
 * `screen.orientation` reports the device; what the layout needs to know is
 * whether the viewport is wider than it is tall, which is also true of a
 * half-height desktop window and false of a phone in a split view. The aspect is
 * the thing that decides whether a bottom sheet or a side column is the one that
 * does not squeeze the view.
 */
export type Orientation = 'portrait' | 'landscape'

/** Which layout is in use. `docked` is the desktop layout, unchanged. */
export type LayoutMode = 'docked' | 'compact'
