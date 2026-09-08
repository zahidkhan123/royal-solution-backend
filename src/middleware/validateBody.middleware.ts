import { Request, Response, NextFunction } from "express";
import Joi from "joi";

/**
 * Request interface with validated body
 */
export interface ValidatedRequest<T = any> extends Request {
  validatedBody?: T;
}

export interface ValidatedQueryRequest<T = any> extends Request {
  validatedQuery?: T;
}

/**
 * Validate request body against Joi schema
 * @param schema - Joi validation schema
 * @returns Express middleware function
 */
export const validateBody = (schema: Joi.ObjectSchema) => {
  return (req: ValidatedRequest, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true, // Strip fields not in schema
      allowUnknown: true, // Allow unknown fields (schema controls this with .unknown())
    });

    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      const errorDetails = error.details.map((detail) => ({
        message: detail.message,
        path: detail.path,
        type: detail.type,
        context: detail.context,
      }));
      console.error("Validation error:", {
        errors: errorDetails,
        body: req.body,
      });
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: errorMessages,
        details: errorDetails,
      });
      return;
    }

    // Attach validated data to request
    req.validatedBody = value;
    next();
  };
};

export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: ValidatedQueryRequest, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: errorMessages,
      });
      return;
    }
    req.validatedQuery = value;
    next();
  };
};
