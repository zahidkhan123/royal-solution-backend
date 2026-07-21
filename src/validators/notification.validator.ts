import Joi from "joi";

export const notificationPrefsBody = Joi.object({
  pushEnabled: Joi.boolean(),
  emailEnabled: Joi.boolean(),
  preferredTimezone: Joi.string().trim().max(64).allow("", null),
  pushTokens: Joi.array().items(Joi.string().trim().max(512)).max(20),
}).min(1);
