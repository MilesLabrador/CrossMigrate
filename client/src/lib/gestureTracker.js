/**
 * Tracks where each discrete wheel/scroll gesture originated.
 * A new gesture is declared when no wheel event has fired for GESTURE_GAP ms
 * AND the previous gesture's momentum phase has ended.
 *
 * Used by NodeShell to decide whether to block canvas panning:
 *   - gesture started inside a node  → that node intercepts, canvas doesn't pan
 *   - gesture started on the canvas  → canvas pans even if pointer drifts over a node
 *
 * Momentum detection: when the combined delta magnitude drops sharply between
 * successive events, the user has lifted their fingers and inertia has taken over.
 * We keep the current gesture origin through the momentum phase so the node
 * keeps intercepting; only after events stop (GESTURE_GAP silence) is a new
 * gesture allowed.
 */

const GESTURE_GAP = 200;   // ms of silence after momentum ends → new gesture allowed
const MOMENTUM_DECAY = 0.65; // delta < 65 % of previous → momentum phase started

let _lastWheelTime = 0;
let _gestureOrigin = null; // the DOM element the current gesture started on
let _prevAbsDelta = 0;
let _inMomentum = false;

/** Called in the capture phase (before any other handlers). */
export function recordGestureOrigin(e) {
  const now = Date.now();
  const absDelta = Math.abs(e.deltaX) + Math.abs(e.deltaY);

  if (now - _lastWheelTime > GESTURE_GAP) {
    // True silence after momentum drained → fingers are off, new gesture begins.
    _gestureOrigin = e.target;
    _inMomentum = false;
    _prevAbsDelta = absDelta;
  } else if (!_inMomentum) {
    if (_prevAbsDelta > 1 && absDelta < _prevAbsDelta * MOMENTUM_DECAY) {
      // Delta dropped sharply → fingers just lifted, momentum phase starting.
      // Keep _gestureOrigin so the node continues to intercept momentum events.
      _inMomentum = true;
    } else {
      _prevAbsDelta = absDelta;
    }
  }
  // While in momentum: _gestureOrigin is unchanged; a new gesture can only
  // start once events stop for GESTURE_GAP ms (handled by the first branch).

  _lastWheelTime = now;
}

/** Returns true if the current gesture's first event was inside `el`. */
export function gestureStartedInside(el) {
  return !!_gestureOrigin && el.contains(_gestureOrigin);
}
