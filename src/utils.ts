export type Seconds = number;
export type Millis = number;

export function todo(text: string = "This function is not implemented yet"): never {
  throw new Error(text);
}

export function sleep(ms: Millis): Promise<void>;
export function sleep<T>(ms: Millis, result: T): Promise<T>;
export function sleep<T>(ms: Millis, result?: T): Promise<T> {
  // biome-ignore lint/style/noNonNullAssertion: it's okay to use here
  return new Promise<T>((resolve) => setTimeout(() => resolve(result!), ms));
}

export function forever(): Promise<never> {
  return new Promise<never>(() => {});
}

export const voidPromise = Promise.resolve<void>(undefined);
