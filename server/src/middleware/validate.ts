import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

type Source = 'body' | 'query' | 'params';

// Usage: router.post('/menu', validate(createMenuItemSchema), handler)
// On success, req.body (or query/params) is REPLACED with the parsed +
// coerced result, so handlers can trust their types instead of re-checking.
export function validate(schema: ZodSchema, source: Source = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten(),
      });
    }
    (req as any)[source] = result.data;
    next();
  };
}
