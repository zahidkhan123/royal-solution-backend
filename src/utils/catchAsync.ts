import { Request, Response, NextFunction } from "express";

type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

type AsyncHandlerWrapper = (
  req: Request,
  res: Response,
  next: NextFunction
) => void;

/**
 * Wraps async route handlers so rejected promises are passed to Express error middleware.
 */
export const catchAsync = (fn: AsyncHandler): AsyncHandlerWrapper => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
