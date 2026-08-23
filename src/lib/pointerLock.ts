/**
 * Who may take the cursor, 2026-08-24.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * A MEASUREMENT IN THIS REPOSITORY WAS WRONG, AND THIS FILE IS THE CORRECTION.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * FirstPersonPlayer.tsx has said since 2026-08-23 that "on a phone there is no
 * pointer to lock, so it rejects — every time a thumb touched the scene". That
 * was measured under a desktop browser's device-emulation mode, where
 * `requestPointerLock()` answers `WrongDocumentError` — reproduced again today,
 * 375×812 with an Android UA and five touch points, one call, one rejection. It
 * is an artefact of the emulator and NOT a fact about phones.
 *
 * CHROME ON ANDROID GRANTS POINTER LOCK. The owner's own screenshot, on a real
 * device: he tapped a hotspot, the panel opened, the touch controls stopped
 * responding, and along the bottom of the phone sat the browser's own banner —
 * "To show your cursor, switch apps, reload the page, or go…" — which is the
 * pointer-lock notification and appears only when the lock has been GRANTED.
 * With the pointer locked the browser routes pointer input to the locked
 * element as movement deltas: clientX/clientY stop moving, so the stick reads
 * zero throw from a frozen origin and a drag turns the view by nothing. The
 * visitor is stranded, and the banner tells him his way out is to reload.
 *
 * So the rejection was never the safety net. The gate has to be here instead,
 * and it has to be decided BEFORE the request, not caught after it.
 *
 * WHAT THIS GATES ON, and it is deliberately not "is this a phone". A visitor
 * with both a touchscreen and a mouse is an ordinary visitor — a laptop with a
 * touchscreen, a tablet with a trackpad — and a device test would take mouse
 * look away from the first and hand a phone banner to the second. The question
 * that has an answer is not what hardware is present but WHICH INPUT IS DRIVING
 * THE APP RIGHT NOW, and a pointer event carries that in `pointerType`. So the
 * decision below is a function of the gesture, not of the machine: the same
 * laptop locks the pointer for a mouse click and refuses one for a finger, in
 * either order, with no state to get stale.
 *
 * Rule 6: this is a pure function of an input kind and two booleans. Which
 * listener feeds it is FirstPersonPlayer's business and is not tested.
 */

/**
 * The four answers `PointerEvent.pointerType` can be reduced to.
 *
 * `unknown` is a real case and not a defensive stub: Firefox has dispatched
 * `click` as a plain MouseEvent for years, a click synthesised by assistive
 * technology or by `element.click()` carries no pointer at all, and the spec
 * lets a user agent report an empty string for a device it cannot classify.
 */
export type PointerKind = 'mouse' | 'pen' | 'touch' | 'unknown'

export function classifyPointer(pointerType: string | null | undefined): PointerKind {
  switch (pointerType) {
    case 'mouse':
      return 'mouse'
    case 'pen':
      return 'pen'
    case 'touch':
      return 'touch'
    default:
      return 'unknown'
  }
}

/**
 * Which input produced this click.
 *
 * TWO SOURCES, IN THIS ORDER, and the order is the whole of the hybrid-device
 * answer. A `click` that is itself a PointerEvent — Chrome and Safari — knows
 * what pressed it, so it wins outright: on a touchscreen laptop the finger tap
 * and the mouse click that follow one another get different answers with no
 * memory between them. Only when the click carries no pointer at all do we fall
 * back to the kind of the last pointerdown the element saw, which is what
 * Firefox needs and is always 'mouse' at the instant a Firefox mouse click
 * fires.
 *
 * Neither available means nobody pressed anything with a pointer, and that is
 * not a request to capture the mouse — see pointerLockAction.
 */
export function drivingKind(
  clickPointerType: string | null | undefined,
  lastPointerDownKind: PointerKind | null,
): PointerKind {
  const fromClick = classifyPointer(clickPointerType)
  if (fromClick !== 'unknown') return fromClick
  return lastPointerDownKind ?? 'unknown'
}

export type LockAction = 'request' | 'exit' | 'none'

export interface LockContext {
  /** The input that produced the gesture now asking. */
  kind: PointerKind
  /** Is the walk surface already the pointer-lock target? */
  locked: boolean
  /** Does this document expose the API at all? */
  supported: boolean
}

/**
 * What to do about the pointer lock for one gesture.
 *
 * MOUSE — request it, exactly as the desktop has always done. Relative motion
 * is the whole point: a locked mouse reports device counts and can be dragged
 * across a desk, which is why PLAYER.lookSensitivity is a constant per pixel
 * and TOUCH.turnPerSweepRad is not. Already locked, there is nothing to ask
 * for, and asking again while the browser is mid-exit is the desktop rejection
 * the .catch() was written for.
 *
 * TOUCH AND PEN — never request. Both are ABSOLUTE devices: they report where
 * they are, not how far they moved, so there is no motion for a lock to
 * liberate, and locking one costs the visitor the controls and gets him a
 * banner telling him to reload. A stylus is grouped with a finger rather than
 * with a mouse for that reason and not because of the hardware it is attached
 * to — a pen on a desktop tablet still reports a position on glass.
 *
 * AND IF IT IS SOMEHOW ALREADY LOCKED, EXIT. That is the half of this that
 * rescues the owner's screenshot rather than merely not repeating it: a visitor
 * who arrives at a touch already locked — by a build before this one, by a
 * stray compatibility click, by a lock inherited from a mouse he has since put
 * down — gets it handed back on his next touch instead of being asked to reload.
 *
 * UNKNOWN — do nothing, in both directions. A click with no pointer behind it
 * is not a request to capture the mouse; and it must not exit a lock either,
 * because on a desktop the only clicks that reach a locked canvas are the
 * locked mouse's own, and taking the lock away from a click we merely failed to
 * classify would be the desktop regression this change is forbidden to make.
 */
export function pointerLockAction(c: LockContext): LockAction {
  if (!c.supported) return 'none'
  if (c.kind === 'mouse') return c.locked ? 'none' : 'request'
  if (c.kind === 'touch' || c.kind === 'pen') return c.locked ? 'exit' : 'none'
  return 'none'
}
