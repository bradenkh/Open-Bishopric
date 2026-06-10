import "server-only";

/**
 * The free GLM flash tier permits only one in-flight request at a time — a
 * second concurrent call is rejected. To keep the assistant usable when more
 * than one bishopric member is chatting, we serialize agent requests through a
 * single-slot async mutex: each request waits for the previous one to finish
 * its upstream call before starting its own.
 *
 * This is per-process (best effort on serverless), which is plenty for a single
 * ward's traffic. A safety timeout releases the lock if a holder never does
 * (e.g. the client disconnects mid-stream) so the queue can't wedge.
 */

const MAX_HOLD_MS = 120_000;

let tail: Promise<void> = Promise.resolve();

/**
 * Acquire the AI slot. Resolves once the slot is free; call the returned
 * function exactly once when the upstream request is done. Calling it more than
 * once is harmless.
 */
export function acquireAISlot(): Promise<() => void> {
  const prev = tail;

  let release!: () => void;
  tail = new Promise<void>((resolve) => {
    release = resolve;
  });

  return prev.then(() => {
    let released = false;
    const timer = setTimeout(() => done(), MAX_HOLD_MS);
    const done = () => {
      if (released) return;
      released = true;
      clearTimeout(timer);
      release();
    };
    return done;
  });
}
