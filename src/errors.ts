/**
 * Machine-readable error codes raised by this library.
 */
export type ErrorCode =
  | "InvalidChecksum"
  | "InvalidHrp"
  | "InvalidLength"
  | "InvalidCharacter"
  | "MixedCase"
  | "MissingSeparator"
  | "InvalidPadding"
  | "InvalidHex"
  | "NetworkMismatch"
  | "UnknownHeader"
  | "InvalidPointer"
  | "UnsupportedAddress"
  | "InvalidCredential"
  | "InvalidNetwork";

/**
 * The single error class thrown by every throwing function in this library.
 * Use the `code` property to branch on the failure reason.
 */
export class CardanoBech32Error extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "CardanoBech32Error";
    this.code = code;
  }
}

/** Result object returned by every `try*` function. Never throws. */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: CardanoBech32Error };

/** Narrowing helper: `true` when `err` is a {@link CardanoBech32Error}. */
export function isCardanoBech32Error(err: unknown): err is CardanoBech32Error {
  return err instanceof CardanoBech32Error;
}

/** @internal */
export function fail(code: ErrorCode, message: string): never {
  throw new CardanoBech32Error(code, message);
}

/** @internal Wraps a throwing function into a `Result`. */
export function attempt<T>(fn: () => T): Result<T> {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    if (err instanceof CardanoBech32Error) return { ok: false, error: err };
    throw err;
  }
}
