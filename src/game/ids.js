// Unique instance id generator. The engine operates on uids; content
// records are expanded into uid-bearing instances at setup.

export function createIdGen() {
  const counters = {};
  return function uid(prefix) {
    counters[prefix] = (counters[prefix] || 0) + 1;
    return `${prefix}-${counters[prefix]}`;
  };
}
