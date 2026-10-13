import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ZodType } from "zod";

/** zValidator that throws a 400 HTTPException, so bad input goes through onError like everything else. */
export const validate = <T extends keyof ValidationTargets, S extends ZodType>(target: T, schema: S) =>
  zValidator(target, schema, (result) => {
    if (!result.success) throw new HTTPException(400, { message: `Bad ${target}`, cause: result.error });
  });
