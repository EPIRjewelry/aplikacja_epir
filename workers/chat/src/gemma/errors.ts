export type GemmaTurnErrorKind = 'intent_transport' | 'unexpected';

export class GemmaTurnError extends Error {
  readonly kind: GemmaTurnErrorKind;

  constructor(kind: GemmaTurnErrorKind, cause?: unknown) {
    super(kind);
    this.name = 'GemmaTurnError';
    this.kind = kind;
    if (cause instanceof Error && cause.stack) {
      this.cause = cause;
    }
  }
}
