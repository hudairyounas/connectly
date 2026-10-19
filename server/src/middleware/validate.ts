import { Request, Response, NextFunction } from 'express';
import { ZodSchema, z } from 'zod';
import mongoose from 'mongoose';
import { AppError } from '../shared/errors/AppError.js';

export const objectIdSchema = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid resource identifier' });

export function validate(schema: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }
      if (schema.query) {
        req.query = schema.query.parse(req.query);
      }
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function assertValidObjectId(id: string, label = 'identifier'): void {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(`Invalid ${label}`, 400, 'INVALID_ID');
  }
}
