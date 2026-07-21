import Joi from "joi";

/**
 * Google login validation schema
 */
export const googleLoginSchema = Joi.object({
  idToken: Joi.string().optional(),
  accessToken: Joi.string().optional(),
}).or("idToken", "accessToken").messages({
  "object.missing": "Either Google ID token or access token is required",
});

/**
 * Facebook login validation schema
 */
export const facebookLoginSchema = Joi.object({
  accessToken: Joi.string().min(1).required().messages({
    "string.empty": "Facebook access token is required",
  }),
});

/**
 * Apple login validation schema
 */
export const appleLoginSchema = Joi.object({
  idToken: Joi.string().required().messages({
    "string.empty": "Apple ID token is required",
  }),
  user: Joi.object({
    fullName: Joi.object({
      givenName: Joi.string(),
      familyName: Joi.string(),
    }).optional(),
    email: Joi.string().email().optional(),
  }).optional(),
});

