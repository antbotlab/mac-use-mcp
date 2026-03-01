import { describe, it, expect } from "vitest";
import { enqueue } from "../queue.js";

describe("enqueue", () => {
  it("returns the result of the async function", async () => {
    const result = await enqueue(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it("executes tasks in FIFO order", async () => {
    const order: number[] = [];

    const p1 = enqueue(async () => {
      await delay(30);
      order.push(1);
    });
    const p2 = enqueue(() => {
      order.push(2);
      return Promise.resolve();
    });
    const p3 = enqueue(() => {
      order.push(3);
      return Promise.resolve();
    });

    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("isolates errors — one rejection does not block the next", async () => {
    const p1 = enqueue(() => Promise.reject(new Error("task 1 failed")));
    const p2 = enqueue(() => Promise.resolve("task 2 ok"));

    await expect(p1).rejects.toThrow("task 1 failed");
    await expect(p2).resolves.toBe("task 2 ok");
  });

  it("passes through return values correctly", async () => {
    const result = await enqueue(() => Promise.resolve({ key: "value" }));
    expect(result).toEqual({ key: "value" });
  });

  it("handles multiple concurrent enqueue calls", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => enqueue(() => Promise.resolve(i))),
    );
    expect(results).toEqual([0, 1, 2, 3, 4]);
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
