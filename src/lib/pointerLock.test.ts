import { describe, expect, it } from 'vitest'
import {
  classifyPointer,
  drivingKind,
  pointerLockAction,
  type LockAction,
  type PointerKind,
} from './pointerLock'

/*
 * CLAUDE.md rule 6: a decision over an input kind and two booleans is
 * arithmetic. Whether Chrome on Android actually grants the lock is a fact
 * about a browser and is not asserted here — it is asserted by the owner's
 * screenshot, which is what this file exists to answer.
 *
 * WHAT THE SHIPPED CODE DECIDED, measured against the running page at 375×812
 * with an Android UA and five touch points, requestPointerLock() wrapped and
 * counted:
 *
 *   touch pointerdown, pointerup, click on the canvas
 *     pointerdown defaultPrevented   true      (the suppression was in force)
 *     requestPointerLock calls       1         (and it still asked)
 *     outcome                        rejected: WrongDocumentError
 *
 * The rejection is the emulator; the CALL is the fault. On the owner's Pixel the
 * same call is granted, the browser routes pointer input to the locked element
 * as movement deltas, and the touch controls stop receiving what they expect.
 * There was no gate at all: any click, from any device, asked for the lock.
 */

const KINDS: PointerKind[] = ['mouse', 'pen', 'touch', 'unknown']

describe('classifyPointer', () => {
  it('passes the three the spec defines', () => {
    expect(classifyPointer('mouse')).toBe('mouse')
    expect(classifyPointer('pen')).toBe('pen')
    expect(classifyPointer('touch')).toBe('touch')
  })

  it('calls everything else unknown, including the empty string and no value', () => {
    expect(classifyPointer('')).toBe('unknown')
    expect(classifyPointer(undefined)).toBe('unknown')
    expect(classifyPointer(null)).toBe('unknown')
    expect(classifyPointer('trackpad')).toBe('unknown')
  })
})

describe('drivingKind', () => {
  it('believes the click when the click knows — Chrome and Safari', () => {
    expect(drivingKind('touch', 'mouse')).toBe('touch')
    expect(drivingKind('mouse', 'touch')).toBe('mouse')
  })

  it('falls back to the last pointerdown when the click is a plain MouseEvent', () => {
    expect(drivingKind(undefined, 'mouse')).toBe('mouse')
    expect(drivingKind('', 'touch')).toBe('touch')
  })

  it('is unknown when neither knows', () => {
    expect(drivingKind(undefined, null)).toBe('unknown')
    expect(drivingKind('', null)).toBe('unknown')
  })

  /*
   * THE HYBRID DEVICE, which is why this is not a device test. One laptop, one
   * session, a touchscreen and a mouse both in use: the answer has to change
   * with the gesture and not with the hardware, in either order and with no
   * memory carried between them.
   */
  it('answers per gesture on a device that has both', () => {
    expect(drivingKind('touch', null)).toBe('touch')
    expect(drivingKind('mouse', 'touch')).toBe('mouse')
    expect(drivingKind('touch', 'mouse')).toBe('touch')
  })
})

describe('pointerLockAction', () => {
  it('requests for a mouse that has not got the lock — the desktop path', () => {
    expect(pointerLockAction({ kind: 'mouse', locked: false, supported: true })).toBe('request')
  })

  it('asks for nothing when the mouse already has it', () => {
    expect(pointerLockAction({ kind: 'mouse', locked: true, supported: true })).toBe('none')
  })

  it('NEVER requests for a touch, locked or not', () => {
    expect(pointerLockAction({ kind: 'touch', locked: false, supported: true })).not.toBe('request')
    expect(pointerLockAction({ kind: 'touch', locked: true, supported: true })).not.toBe('request')
  })

  it('hands the lock back when a touch arrives and one is somehow engaged', () => {
    expect(pointerLockAction({ kind: 'touch', locked: true, supported: true })).toBe('exit')
    expect(pointerLockAction({ kind: 'pen', locked: true, supported: true })).toBe('exit')
  })

  it('groups a pen with a finger, because both report a position and not a motion', () => {
    expect(pointerLockAction({ kind: 'pen', locked: false, supported: true })).toBe('none')
  })

  it('leaves a lock alone for a click it could not classify', () => {
    // on a desktop the only clicks reaching a locked canvas are the locked
    // mouse's own; taking the lock away from one we merely failed to read
    // would be the regression this change is forbidden to make
    expect(pointerLockAction({ kind: 'unknown', locked: true, supported: true })).toBe('none')
    expect(pointerLockAction({ kind: 'unknown', locked: false, supported: true })).toBe('none')
  })

  it('does nothing at all where the API is absent', () => {
    for (const kind of KINDS) {
      for (const locked of [false, true]) {
        expect(pointerLockAction({ kind, locked, supported: false })).toBe('none')
      }
    }
  })

  /*
   * THE WHOLE CLAIM, over the entire product of inputs: 'request' is reachable
   * from a mouse and from nothing else. Sixteen combinations, enumerated rather
   * than sampled, because the one that gets through is the one that strands a
   * visitor with a banner telling him to reload.
   */
  it('reaches "request" from a mouse and from nothing else', () => {
    const requesting: Array<[PointerKind, boolean, boolean]> = []
    for (const kind of KINDS) {
      for (const locked of [false, true]) {
        for (const supported of [false, true]) {
          const action: LockAction = pointerLockAction({ kind, locked, supported })
          if (action === 'request') requesting.push([kind, locked, supported])
        }
      }
    }
    expect(requesting).toEqual([['mouse', false, true]])
  })

  /*
   * And the same statement from the other side: given the touch gesture the
   * owner actually made — a tap on the canvas of a phone, nothing locked — the
   * decision is to leave the pointer alone.
   */
  it("decides 'none' for the tap in the owner's screenshot", () => {
    expect(
      pointerLockAction({
        kind: drivingKind('touch', 'touch'),
        locked: false,
        supported: true,
      }),
    ).toBe('none')
  })
})
