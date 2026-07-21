import Joi from "joi";

export const imageUploadMetadataSchema = Joi.object({
  name: Joi.string().min(1).max(255).required().messages({
    "string.empty": "Name is required",
    "string.min": "Name must be at least 1 character",
    "string.max": "Name cannot exceed 255 characters",
    "any.required": "Name is required",
  }),
  description: Joi.string().max(2000).optional().allow(""),
  category: Joi.string().max(100).optional().allow(""),
}).options({ stripUnknown: true });
