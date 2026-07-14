import { zValidator } from "@hono/zod-validator";
import type { ZodSchema } from "zod";

/**
 * JSON body validator. On failure it throws the ZodError so the global
 * `onError` handler maps it to the standard 422 `VALIDATION_ERROR` envelope —
 * matching the previous `schema.parse(await readJson(req))` behavior exactly.
 * (Hono's json validator defaults an absent/non-JSON body to `{}`, so a missing
 * body still surfaces as field-level validation errors, not a 500.)
 */
export function zBody<T extends ZodSchema>(schema: T) {
  return zValidator("json", schema, (result) => {
    if (!result.success) {
      throw result.error;
    }
  });
}
