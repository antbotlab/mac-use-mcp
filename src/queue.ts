/**
 * Serial execution queue that ensures system-level operations run one at a
 * time in FIFO order, preventing race conditions.
 */

/** Pending work item stored in the queue. */
interface QueueItem {
  fn: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

const queue: QueueItem[] = [];
let running = false;

/** Drain the queue sequentially until empty. */
async function drain(): Promise<void> {
  if (running) return;
  running = true;

  while (queue.length > 0) {
    const item = queue.shift()!;
    try {
      const result = await item.fn();
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    }
  }

  running = false;
}

/**
 * Enqueue an async function for serial execution.
 *
 * The returned promise resolves (or rejects) with the result of `fn` once it
 * has been executed. Tasks run in FIFO order; an error in one task does not
 * prevent subsequent tasks from running.
 *
 * @param fn - Async function to execute.
 * @returns A promise that settles with the return value of `fn`.
 */
export function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({
      fn: fn as () => Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    void drain();
  });
}
