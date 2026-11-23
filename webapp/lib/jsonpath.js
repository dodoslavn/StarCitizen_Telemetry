'use strict';

// Resolve a dotted path like "telemetry.actor.state.uec_balance" or "a.0.b".
// Returns the value, or the given default (undefined) if any step is missing.

function getByPath(obj, path, dflt) {
  if (!path) return obj;
  let cur = obj;
  for (const key of String(path).split('.')) {
    if (cur == null || typeof cur !== 'object') return dflt;
    cur = cur[key];
    if (cur === undefined) return dflt;
  }
  return cur === undefined ? dflt : cur;
}

module.exports = { getByPath };
