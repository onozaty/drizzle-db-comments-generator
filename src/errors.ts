/** An error caused by the user's input or environment. The CLI shows only its message. */
export class GeneratorError extends Error {
  override name = "GeneratorError";
}
