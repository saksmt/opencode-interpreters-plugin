/** biome-ignore-all lint/style/noMagicNumbers: Self-explanatory numbers */

import { setImmediate } from "node:timers/promises";

export type Seconds = number;
export const Seconds = {
  toMs(seconds: Seconds): Millis {
    return seconds * 1000;
  },
  fromMs(ms: Millis): Seconds {
    return ms / 1000;
  },
  fromMinutes(minutes: number): Seconds {
    return minutes * 60;
  },
  fromHours(hours: number): Seconds {
    return Seconds.fromMinutes(hours * 60);
  },
};
export type Millis = number;
export const Millis = {
  toSeconds(ms: Millis): Seconds {
    return ms / 1000;
  },
  fromSeconds(seconds: Seconds): Millis {
    return seconds * 1000;
  },
};

export function todo(text: string = "This function is not implemented yet"): never {
  throw new Error(text);
}

export function notFulfilled(): Promise<never> {
  return new Promise<never>(() => {});
}

export function fireAndForget(task: () => Promise<void>): void {
  async function run(): Promise<void> {
    await setImmediate();
    await task();
  }
  const _ = run();
}

export const voidPromise = Promise.resolve<void>(undefined);
