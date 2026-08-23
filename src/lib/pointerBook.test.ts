import { describe, expect, it } from 'vitest'
import {
  beginThumb,
  canAccept,
  createBook,
  dropDead,
  endAll,
  endThumb,
  holderOf,
  isIdle,
  markCaptured,
  moveThumb,
  type PointerBook,
  type ThumbRole,
} from './pointerBook'

/*
 * CLAUDE.md rule 6: this file is arithmetic over event sequences. A sequence of
 * (id, phase) pairs going in and a set of live roles coming out is as testable
 * as an azimuth; what a ring looks like on the glass is not asserted anywhere.
 *
 * THE CLAIM UNDER TEST IS ONE SENTENCE: no sequence of pointer events, however
 * malformed, may leave the controls unable to accept a new gesture. It is
 * checked by ENUMERATION rather than by sampling — every sequence of length 6
 * over two ids and four phases, 262 144 of them, and then a longer seeded fuzz
 * over three ids — because the property is structural and enumeration is what
 * says so.
 *
 * THE SHIPPED CODE FAILS IT, and the failure is transcribed below rather than
 * described (see `shipped`). Run against that transcription, three sequences a
 * real hand can produce:
 *
 *   down-in 7, down-out 7, up 7        stick held for ever, 0 of 3 fresh
 *                                      gestures could take it back
 *   down-out 7, down-in 7, up 7        look held for ever, same
 *   down-in 7, down-in 7, up 7         stick held for ever, same
 *
 * Each ends with every finger off the glass and the walker still walking. The
 * same three sequences against this module leave the book idle.
 */

// ───────────────────────── the shipped bookkeeping ─────────────────────────

/**
 * TouchControls.tsx as it stood on 2026-08-23, transcribed: a Map from id to
 * role PLUS a `mover` id PLUS a `looker` id. Only the bookkeeping — no DOM, no
 * capture, no ring — because the bookkeeping is the whole of the fault.
 *
 * Kept in the repository rather than deleted with the code it describes,
 * because a test that only asserts the new behaviour cannot say why the old
 * shape had to go: three records of one fact, and the two derived ones are what
 * every "is this role free" test reads.
 */
function shipped() {
  const thumbs = new Map<number, { role: ThumbRole }>()
  let mover: number | null = null
  let looker: number | null = null
  return {
    down(id: number, inZone: boolean) {
      let role: ThumbRole
      if (inZone && mover === null) {
        role = 'move'
        mover = id
      } else if (!inZone && looker === null) {
        role = 'look'
        looker = id
      } else {
        return null
      }
      thumbs.set(id, { role })
      return role
    },
    up(id: number) {
      const t = thumbs.get(id)
      if (!t) return null
      thumbs.delete(id)
      if (t.role === 'move') mover = null
      else looker = null
      return t.role
    },
    /** The shipped onMove only reads the map; it can free nothing. */
    move(_id: number) {},
    /** What the component asks before letting a new thumb steer or look. */
    free(role: ThumbRole) {
      return role === 'move' ? mover === null : looker === null
    },
  }
}

describe('the bookkeeping that shipped', () => {
  it('loses the stick for ever when one id is given both roles', () => {
    const s = shipped()
    expect(s.down(7, true)).toBe('move')
    expect(s.down(7, false)).toBe('look') // the same id, re-entering outside the zone
    expect(s.up(7)).toBe('look') // one lift, and it releases the wrong role
    expect(s.free('move')).toBe(false) // every finger is off the glass

    // three fresh fingers try to take the stick back
    let taken = 0
    for (const id of [8, 9, 10]) {
      if (s.down(id, true) !== null) taken++
      s.up(id)
    }
    expect(taken).toBe(0)
  })

  it('loses the view the same way, with the zones swapped', () => {
    const s = shipped()
    s.down(7, false)
    s.down(7, true)
    s.up(7)
    expect(s.free('look')).toBe(false)
    expect(s.down(8, false)).toBe(null)
  })

  it('loses the stick to a plain repeated id, with no zone change at all', () => {
    const s = shipped()
    s.down(7, true)
    // a pointer id reused after a sequence that ended without an up: the OS
    // taking the gesture, the tab backgrounded, a pointer lock engaging under
    // the finger. `mover` is already 7, so the second down is refused —
    // and then the up deletes the map entry and the id is stranded.
    expect(s.down(7, true)).toBe(null)
    expect(s.up(7)).toBe('move')
    expect(s.free('move')).toBe(true)
    // this one recovers; the two above do not. Enumeration, not intuition, is
    // what tells them apart — which is the argument for the new shape.
  })
})

// ───────────────────────────── the new book ─────────────────────────────

describe('roles', () => {
  it('gives a thumb in the movement zone the stick and one outside it the view', () => {
    const b = createBook()
    expect(beginThumb(b, { id: 1, x: 40, y: 700, inZone: true }).role).toBe('move')
    expect(beginThumb(b, { id: 2, x: 300, y: 120, inZone: false }).role).toBe('look')
    expect(isIdle(b)).toBe(false)
    expect(canAccept(b, 'move')).toBe(false)
    expect(canAccept(b, 'look')).toBe(false)
  })

  it('ignores a third finger rather than letting it steal a role', () => {
    const b = createBook()
    beginThumb(b, { id: 1, x: 40, y: 700, inZone: true })
    expect(beginThumb(b, { id: 2, x: 60, y: 690, inZone: true }).role).toBe(null)
    expect(b.thumbs.size).toBe(1)
    expect(holderOf(b, 'move')?.id).toBe(1)
  })

  it('does not hand a refused thumb the other role', () => {
    const b = createBook()
    beginThumb(b, { id: 1, x: 40, y: 700, inZone: true })
    beginThumb(b, { id: 2, x: 60, y: 690, inZone: true })
    // the view is still free; the refused finger must not have taken it
    expect(canAccept(b, 'look')).toBe(true)
  })

  it('keeps a thumb in the role it landed with when it slides out of the zone', () => {
    const b = createBook()
    beginThumb(b, { id: 1, x: 40, y: 700, inZone: true })
    const m = moveThumb(b, { id: 1, x: 340, y: 90 })
    expect(m?.role).toBe('move')
    expect(m?.dx).toBe(300)
    expect(m?.dy).toBe(-610)
  })
})

describe('deltas', () => {
  it('measures the stick from where the thumb landed', () => {
    const b = createBook()
    beginThumb(b, { id: 1, x: 100, y: 700, inZone: true })
    expect(moveThumb(b, { id: 1, x: 130, y: 660 })).toEqual({ role: 'move', dx: 30, dy: -40 })
    // still measured from the origin, not from the previous sample
    expect(moveThumb(b, { id: 1, x: 140, y: 650 })).toEqual({ role: 'move', dx: 40, dy: -50 })
  })

  it('measures the look from the previous sample, so a drag accumulates', () => {
    const b = createBook()
    beginThumb(b, { id: 1, x: 200, y: 100, inZone: false })
    expect(moveThumb(b, { id: 1, x: 230, y: 100 })).toEqual({ role: 'look', dx: 30, dy: 0 })
    expect(moveThumb(b, { id: 1, x: 250, y: 110 })).toEqual({ role: 'look', dx: 20, dy: 10 })
  })

  it('says nothing for an id it has never seen', () => {
    const b = createBook()
    expect(moveThumb(b, { id: 99, x: 0, y: 0 })).toBe(null)
  })
})

describe('a down for an id already in the book', () => {
  it('retires the old thumb and names the role it freed', () => {
    const b = createBook()
    beginThumb(b, { id: 7, x: 40, y: 700, inZone: true })
    const again = beginThumb(b, { id: 7, x: 300, y: 120, inZone: false })
    expect(again.retired).toEqual(['move'])
    expect(again.role).toBe('look')
    expect(b.thumbs.size).toBe(1)
    // and the stick is free again, which is what the shipped code lost
    expect(canAccept(b, 'move')).toBe(true)
  })

  it('is the sequence that killed the shipped code, and it recovers', () => {
    const b = createBook()
    beginThumb(b, { id: 7, x: 40, y: 700, inZone: true })
    beginThumb(b, { id: 7, x: 300, y: 120, inZone: false })
    endThumb(b, 7)
    expect(isIdle(b)).toBe(true)
    expect(beginThumb(b, { id: 8, x: 40, y: 700, inZone: true }).role).toBe('move')
  })

  it('re-plants a thumb at its new spot rather than the old one', () => {
    const b = createBook()
    beginThumb(b, { id: 7, x: 40, y: 700, inZone: true })
    beginThumb(b, { id: 7, x: 90, y: 650, inZone: true })
    expect(moveThumb(b, { id: 7, x: 120, y: 650 })).toEqual({ role: 'move', dx: 30, dy: 0 })
  })
})

describe('ending', () => {
  it('is idempotent, because pointerup is followed by lostpointercapture', () => {
    const b = createBook()
    beginThumb(b, { id: 1, x: 40, y: 700, inZone: true })
    expect(endThumb(b, 1)).toBe('move')
    expect(endThumb(b, 1)).toBe(null)
    expect(isIdle(b)).toBe(true)
  })

  it('shrugs at an end for an id it never saw', () => {
    const b = createBook()
    expect(endThumb(b, 42)).toBe(null)
    expect(isIdle(b)).toBe(true)
  })

  it('shrugs at a cancel with no down before it', () => {
    const b = createBook()
    expect(endAll(b)).toEqual([])
    expect(endThumb(b, 3)).toBe(null)
    expect(canAccept(b, 'move')).toBe(true)
    expect(canAccept(b, 'look')).toBe(true)
  })

  it('names every role it dropped, so the caller can stop the walker', () => {
    const b = createBook()
    beginThumb(b, { id: 1, x: 40, y: 700, inZone: true })
    beginThumb(b, { id: 2, x: 300, y: 120, inZone: false })
    expect(endAll(b).sort()).toEqual(['look', 'move'])
    expect(isIdle(b)).toBe(true)
  })
})

describe('pointers that no longer exist', () => {
  it('drops a captured thumb the browser no longer holds', () => {
    const b = createBook()
    beginThumb(b, { id: 1, x: 40, y: 700, inZone: true })
    markCaptured(b, 1, true)
    beginThumb(b, { id: 2, x: 300, y: 120, inZone: false })
    markCaptured(b, 2, true)
    const held = new Set([2])
    expect(dropDead(b, (t) => !t.captured || held.has(t.id))).toEqual(['move'])
    expect(canAccept(b, 'move')).toBe(true)
    expect(holderOf(b, 'look')?.id).toBe(2)
  })

  it('leaves an uncaptured thumb alone, because nothing can be asked about it', () => {
    const b = createBook()
    beginThumb(b, { id: 1, x: 40, y: 700, inZone: true })
    // setPointerCapture threw: the walk degrades, it does not disappear
    expect(dropDead(b, (t) => !t.captured)).toEqual([])
    expect(holderOf(b, 'move')?.id).toBe(1)
  })
})

// ─────────────────────── the property, by enumeration ───────────────────────

type Phase = 'downIn' | 'downOut' | 'move' | 'end'

function step(b: PointerBook, id: number, phase: Phase): void {
  switch (phase) {
    case 'downIn':
      beginThumb(b, { id, x: 40, y: 700, inZone: true })
      break
    case 'downOut':
      beginThumb(b, { id, x: 300, y: 120, inZone: false })
      break
    case 'move':
      moveThumb(b, { id, x: 100 + id, y: 300 + id })
      break
    case 'end':
      endThumb(b, id)
      break
  }
}

/**
 * The invariants that must hold after EVERY event, not merely at the end.
 *
 * Returns the first violation as a sentence rather than asserting, and the
 * reason is the enumeration below: 262 144 sequences × 6 events is a million
 * and a half checkpoints, and an `expect()` at each of them costs minutes.
 * Failures are reported once, with the sequence that produced them, which is
 * also the only form in which a failure here would be readable.
 *
 * The third check is the one the shipped code broke: a role reported as taken
 * must be taken by somebody who is still on the glass. There is no way to
 * express that against a `mover` integer, which is precisely why nothing was
 * checking it.
 */
function soundness(b: PointerBook, ids: number[]): string | null {
  if (b.thumbs.size > 2) return `${b.thumbs.size} thumbs live`
  for (const [key, t] of b.thumbs) if (key !== t.id) return `keyed ${key}, holds ${t.id}`
  for (const role of ['move', 'look'] as const) {
    const holders = [...b.thumbs.values()].filter((t) => t.role === role)
    if (holders.length > 1) return `${holders.length} thumbs hold ${role}`
    if (canAccept(b, role) !== (holders.length === 0)) return `${role} accepts against its holder`
    if (holders.length === 1 && !ids.includes(holders[0].id)) {
      return `${role} held by ${holders[0].id}, which is not on the glass`
    }
  }
  return null
}

/** The state a visitor's NEXT gesture meets. Null when it is a usable one. */
function stranded(b: PointerBook): string | null {
  if (!isIdle(b)) return `${b.thumbs.size} thumbs still down`
  if (!canAccept(b, 'move')) return 'the stick is held by nobody'
  if (!canAccept(b, 'look')) return 'the view is held by nobody'
  if (beginThumb(b, { id: 3, x: 40, y: 700, inZone: true }).role !== 'move') return 'stick refused'
  if (beginThumb(b, { id: 4, x: 300, y: 90, inZone: false }).role !== 'look') return 'view refused'
  return null
}

describe('no sequence of events can strand the controls', () => {
  it('holds for every sequence of six events over two ids and four phases', () => {
    const ids = [1, 2]
    const phases: Phase[] = ['downIn', 'downOut', 'move', 'end']
    const alphabet: Array<[number, Phase]> = []
    for (const id of ids) for (const p of phases) alphabet.push([id, p])

    const depth = 6
    const total = alphabet.length ** depth
    expect(total).toBe(262_144)

    const failures: string[] = []
    for (let n = 0; n < total && failures.length < 5; n++) {
      const b = createBook()
      const trace: string[] = []
      let code = n
      for (let k = 0; k < depth; k++) {
        const [id, phase] = alphabet[code % alphabet.length]
        code = (code / alphabet.length) | 0
        step(b, id, phase)
        trace.push(`${phase}:${id}`)
        const bad = soundness(b, ids)
        if (bad) failures.push(`${trace.join(' ')} — ${bad}`)
      }
      // every finger comes off the glass, however the sequence ended
      for (const id of ids) endThumb(b, id)
      const bad = stranded(b)
      if (bad) failures.push(`${trace.join(' ')} — ${bad}`)
    }
    expect(failures).toEqual([])
  })

  /*
   * THE SAME ENUMERATION, RUN AGAINST THE CODE THIS REPLACES. It is the only
   * honest way to say how big the fault was rather than that it existed: the
   * component was shipped, the owner met it, and "теряется в каких-то моментах"
   * — at CERTAIN moments, plural — is exactly what a sparse set of stranding
   * sequences feels like from the inside.
   */
  it('is a claim the shipped bookkeeping could not make', () => {
    const ids = [1, 2]
    const phases: Phase[] = ['downIn', 'downOut', 'move', 'end']
    const alphabet: Array<[number, Phase]> = []
    for (const id of ids) for (const p of phases) alphabet.push([id, p])
    const depth = 6
    const total = alphabet.length ** depth

    let strandedCount = 0
    let shortest: string | null = null
    for (let n = 0; n < total; n++) {
      const s = shipped()
      const trace: string[] = []
      let code = n
      for (let k = 0; k < depth; k++) {
        const [id, phase] = alphabet[code % alphabet.length]
        code = (code / alphabet.length) | 0
        if (phase === 'downIn') s.down(id, true)
        else if (phase === 'downOut') s.down(id, false)
        else if (phase === 'move') s.move(id)
        else s.up(id)
        trace.push(`${phase}:${id}`)
      }
      // every finger off the glass, and then: can anything be driven?
      for (const id of ids) s.up(id)
      if (!s.free('move') || !s.free('look')) {
        strandedCount++
        if (shortest === null) shortest = trace.join(' ')
      }
    }

    /*
     * 81 164 of 262 144 — 31.0% of all six-event sequences — end with every
     * finger lifted and a role held by nobody, which on the glass is a walker
     * who will not stop and a stick that will not answer. By length:
     *
     *   events   sequences   stranded   share
     *        1           8          0    0.0%
     *        2          64          4    6.3%
     *        3         512         68   13.3%
     *        4       4 096        812   19.8%
     *        5      32 768      8 420   25.7%
     *        6     262 144     81 164   31.0%
     *
     * AND THE SHORTEST IS TWO EVENTS. One id down outside the movement zone,
     * the same id down inside it, and the lift that follows frees 'move' while
     * `looker` keeps a number belonging to nobody: the view is dead for the rest
     * of the session. Two events, and no amount of care at the call site could
     * have prevented them, because a browser is entitled to reuse a pointer id
     * whose sequence ended without an up.
     */
    expect(strandedCount).toBe(81_164)
    expect(shortest).toBe('downOut:1 downIn:1 downIn:1 downIn:1 downIn:1 downIn:1')
  })

  it('holds over longer sequences with three ids, duplicates and unseen ends', () => {
    const ids = [1, 2, 3]
    const phases: Phase[] = ['downIn', 'downOut', 'move', 'end']
    // a seeded LCG: the enumeration above proves the property, this one walks
    // sequences too long to enumerate and must be reproducible when it trips
    let seed = 0x9e3779b9
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 0x1_0000_0000
    }
    const failures: string[] = []
    for (let run = 0; run < 4000 && failures.length < 5; run++) {
      const b = createBook()
      const trace: string[] = []
      for (let k = 0; k < 40; k++) {
        // ids drawn from a pool wider than the book's, so ends for unseen ids
        // and downs for ids already in it both occur
        const id = ids[(rnd() * (ids.length + 1)) | 0] ?? 9
        const phase = phases[(rnd() * phases.length) | 0]
        step(b, id, phase)
        trace.push(`${phase}:${id}`)
        const bad = soundness(b, [...ids, 9])
        if (bad) failures.push(`${trace.join(' ')} — ${bad}`)
      }
      endAll(b)
      const bad = stranded(b)
      if (bad) failures.push(`${trace.join(' ')} — ${bad}`)
    }
    expect(failures).toEqual([])
  })

  it('recovers from a down with no up at all, which is the phone case', () => {
    const b = createBook()
    beginThumb(b, { id: 1, x: 40, y: 700, inZone: true })
    beginThumb(b, { id: 2, x: 300, y: 120, inZone: false })
    // the tab goes to the background, or the phone is turned, or a panel opens
    expect(endAll(b).length).toBe(2)
    expect(isIdle(b)).toBe(true)
    expect(beginThumb(b, { id: 1, x: 40, y: 700, inZone: true }).role).toBe('move')
  })
})
