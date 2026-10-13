import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

/** A Zod schema per field of each request part, e.g. { query: { offset: z.coerce.number() } }. */
interface RequestShape {
  param?: z.ZodRawShape;
  query?: z.ZodRawShape;
}

type ValidatedInput<S extends RequestShape> = { [K in keyof S]: z.output<z.ZodObject<NonNullable<S[K]>>> };

/**
 * Validates the request's path params and query string against the given field schemas; the parsed
 * result is c.get("input"). Failures throw a 400 HTTPException, so they go through onError like everything else.
 */
export const validate = <Shape extends RequestShape>(shape: Shape) => {
  const schema = z.object({
    ...(shape.param && { param: z.object(shape.param) }),
    ...(shape.query && { query: z.object(shape.query) }),
  });
  return createMiddleware<{ Variables: { input: ValidatedInput<Shape> } }>(async (c, next) => {
    const result = await schema.safeParseAsync({ param: c.req.param(), query: c.req.query() });
    if (!result.success) throw new HTTPException(400, { message: "Bad request", cause: result.error });
    c.set("input", result.data as ValidatedInput<Shape>);
    await next();
  });
};
