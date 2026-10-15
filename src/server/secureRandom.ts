/**
 * A drop-in replacement for `Math.random` backed by the platform CSPRNG.
 *
 * `Math.random` is fine for a shuffle nobody is trying to predict, but on the
 * server it also mints seat tokens (the only proof of which seat is yours) and
 * deals hands other players must not be able to infer. V8's generator can be
 * reconstructed from a handful of outputs, so anything security-relevant uses
 * this instead. Same signature, so every `random` parameter still accepts a
 * seeded function in tests.
 */
export function secureRandom(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] / 0x1_0000_0000;
}
