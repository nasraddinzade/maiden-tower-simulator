/**
 * Which thumb is doing what, 2026-08-24.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ONE RECORD, SO A ROLE CANNOT OUTLIVE THE FINGER HOLDING IT.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * The touch layer has to tell one thumb from another — walking a building is
 * moving and looking at the same time — and until today it did that with THREE
 * pieces of state: a Map from pointerId to a role, plus a `mover` id, plus a
 * `looker` id. Three records of one fact can disagree, and they did. Driven
 * against the shipped page at 375×812, real PointerEvents with ids:
 *
 *   pointerdown  id 7, inside the movement zone   ring appears, stick live
 *   pointerdown  id 7, outside it                 role rewritten to 'look';
 *                                                 `mover` still says 7
 *   pointerup    id 7                             releases 'look' only
 *
 *   three fresh fingers in the movement zone      ring never moves, knob never
 *                                                 moves, stick frozen at 0.536
 *
 * The ring stays lit over the spot the first thumb left, the walker keeps
 * walking at 0.536 of the band for ever, and NO GESTURE CAN TAKE THE STICK
 * BACK, because `mover` is a number that no longer belongs to anybody and the
 * only test for "is the stick free" is `mover === null`. The visitor's one way
 * out is a reload. That is the shape of "теряется в каких-то моментах", and the
 * duplicate id at its head is not exotic: a pointer sequence that ends without
 * an up — the OS taking the gesture, the tab going to the background, a lock
 * engaging under the finger — leaves the id in the book, and touch pointer ids
 * are drawn from a small pool and come round again.
 *
 * SO THE MAP IS THE ONLY RECORD, and a role is taken exactly when a live thumb
 * in it holds that role. There is no second place for the answer to rot: ending
 * a thumb removes the only thing that could be holding its role, so no sequence
 * of events can leak one. The invariant is structural rather than maintained,
 * which is why the tests can enumerate every sequence rather than sample them.
 *
 * Rule 6: no DOM, no React. `pointerdown` and `pointercancel` are DOM names but
 * an (id, phase) sequence is arithmetic, and this is where it is asserted. What
 * a ring looks like is not asserted anywhere.
 *
 * Screen convention, as everywhere in touchInput.ts: +x right, +y DOWN.
 */

export type ThumbRole = 'move' | 'look'

export interface Thumb {
  id: number
  role: ThumbRole
  /** Where it landed, client px. The stick measures its throw from here. */
  originX: number
  originY: number
  /** Where it was last seen. The look role's delta is sample to sample. */
  lastX: number
  lastY: number
  /**
   * Does the canvas hold this pointer's capture? Recorded because it is the one
   * question a browser will answer about whether a pointer still exists —
   * `hasPointerCapture` — and a thumb we never managed to capture cannot be
   * asked it. See dropDead.
   */
  captured: boolean
}

export interface PointerBook {
  /** THE ONLY RECORD. Roles are derived from it and stored nowhere else. */
  thumbs: Map<number, Thumb>
}

export function createBook(): PointerBook {
  return { thumbs: new Map() }
}

/** The live thumb holding a role, or null. Linear over at most two entries. */
export function holderOf(book: PointerBook, role: ThumbRole): Thumb | null {
  for (const t of book.thumbs.values()) if (t.role === role) return t
  return null
}

/** Is this role free for a new gesture? */
export function canAccept(book: PointerBook, role: ThumbRole): boolean {
  return holderOf(book, role) === null
}

/** No thumb is down: every role is available and nothing is being driven. */
export function isIdle(book: PointerBook): boolean {
  return book.thumbs.size === 0
}

export interface BeginRequest {
  id: number
  x: number
  y: number
  /** Did it land in the movement zone? lib/touchInput.ts inThumbZone decides. */
  inZone: boolean
}

export interface BeginResult {
  /** The role this thumb was given, or null if the one it wanted was taken. */
  role: ThumbRole | null
  /**
   * Roles freed by retiring a stale entry for the SAME id, before the new one
   * was considered. The caller has to undo their effects — hide the ring, stop
   * the walker — because whatever was driving them is not on the glass.
   */
  retired: ThumbRole[]
}

/**
 * A thumb lands.
 *
 * A DOWN FOR AN ID ALREADY IN THE BOOK RETIRES THE OLD ONE FIRST, and that is
 * the cheapest certain answer to "drop pointers that no longer exist": the
 * browser telling us a pointer has just gone down is proof that any earlier
 * pointer of that id has ended, whether or not we were told so. Retiring rather
 * than ignoring is what stops one missed `pointerup` from costing the visitor
 * the controls for the rest of the session.
 *
 * The role a thumb wants is decided once, by where it landed, and is never
 * revisited — a thumb that starts on the stick and slides across the screen is
 * still the stick. If that role is taken the thumb is ignored outright rather
 * than given the other one: a third finger stealing the view would jump it.
 */
export function beginThumb(book: PointerBook, r: BeginRequest): BeginResult {
  const retired: ThumbRole[] = []
  const stale = book.thumbs.get(r.id)
  if (stale) {
    book.thumbs.delete(r.id)
    retired.push(stale.role)
  }

  const wanted: ThumbRole = r.inZone ? 'move' : 'look'
  if (!canAccept(book, wanted)) return { role: null, retired }

  book.thumbs.set(r.id, {
    id: r.id,
    role: wanted,
    originX: r.x,
    originY: r.y,
    lastX: r.x,
    lastY: r.y,
    captured: false,
  })
  return { role: wanted, retired }
}

/** Record whether the canvas took this pointer's capture. */
export function markCaptured(book: PointerBook, id: number, captured: boolean): void {
  const t = book.thumbs.get(id)
  if (t) t.captured = captured
}

export interface MoveResult {
  role: ThumbRole
  /**
   * For 'move', the offset from where the thumb landed — the stick's throw.
   * For 'look', the offset since the previous sample — a drag increment.
   */
  dx: number
  dy: number
}

/** A thumb moves. Null for an id the book has never heard of. */
export function moveThumb(
  book: PointerBook,
  r: { id: number; x: number; y: number },
): MoveResult | null {
  const t = book.thumbs.get(r.id)
  if (!t) return null
  const out: MoveResult =
    t.role === 'move'
      ? { role: 'move', dx: r.x - t.originX, dy: r.y - t.originY }
      : { role: 'look', dx: r.x - t.lastX, dy: r.y - t.lastY }
  t.lastX = r.x
  t.lastY = r.y
  return out
}

/**
 * A thumb ends — up, cancel, or a capture taken away.
 *
 * All three are the same event to this book, and it is idempotent by
 * construction: `pointerup` is followed by an implicit `lostpointercapture`, so
 * the second call finds nothing and says so. An end for an id that was never
 * seen is likewise not an error — it is a pointer that belonged to something
 * else, or one we retired earlier.
 */
export function endThumb(book: PointerBook, id: number): ThumbRole | null {
  const t = book.thumbs.get(id)
  if (!t) return null
  book.thumbs.delete(id)
  return t.role
}

/**
 * Everything ends.
 *
 * The escape hatch for every way out of the walk that does not come with events
 * of its own: the tab going to the background, the window losing focus, the
 * phone being turned, a panel opening over the canvas, walk mode being left. A
 * gesture that spans any of those has stopped being a gesture, and starting the
 * next one must not depend on hearing the end of the last.
 */
export function endAll(book: PointerBook): ThumbRole[] {
  const roles: ThumbRole[] = []
  for (const t of book.thumbs.values()) roles.push(t.role)
  book.thumbs.clear()
  return roles
}

/**
 * Retire every thumb the caller says is gone.
 *
 * The predicate is the caller's because only the caller can ask the browser.
 * The one question a browser will answer about a pointer's existence is
 * `hasPointerCapture`, and it is only meaningful for a pointer we captured —
 * hence Thumb.captured, and hence a predicate over the whole thumb rather than
 * over an id.
 */
export function dropDead(
  book: PointerBook,
  isAlive: (t: Thumb) => boolean,
): ThumbRole[] {
  const dead: ThumbRole[] = []
  for (const t of [...book.thumbs.values()]) {
    if (isAlive(t)) continue
    book.thumbs.delete(t.id)
    dead.push(t.role)
  }
  return dead
}
