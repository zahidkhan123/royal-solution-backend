# Route validators (Joi schemas)

All request validation is done here using **Joi** schemas. Controllers do not validate; they use `req.validatedBody` or `req.validatedQuery` set by middleware.

## Usage

1. **Body validation** – In routes, add `validateBody(schema)` before the controller:

   ```ts
   import { validateBody } from "../middleware/validateBody.middleware.js";
   import { createMarketplaceSchema } from "../validators/marketplace.validator.js";

   router.post("/", protect, validateBody(createMarketplaceSchema), createMarketplaceAd);
   ```

2. **Query validation** – Use `validateQuery(schema)` for `req.query`:

   ```ts
   import { validateQuery } from "../middleware/validateBody.middleware.js";
   import { getMessagesQuerySchema } from "../validators/chat.validator.js";

   router.get("/:chatId/messages", validateQuery(getMessagesQuerySchema), getMessages);
   ```

3. **In controllers** – Use `ValidatedRequest` and read from `req.validatedBody` or `req.validatedQuery`:

   ```ts
   import { ValidatedRequest } from "../middleware/validateBody.middleware.js";

   export const createReview = async (
     req: AuthRequest & ValidatedRequest,
     res: Response,
     next: NextFunction
   ) => {
     const { listingId, rating, comment } = req.validatedBody!;
     // ...
   };
   ```

## Files

| File                     | Schemas / purpose                          |
|--------------------------|--------------------------------------------|
| `auth.validator.ts`      | register, login, forgotPassword, OTP, profile |
| `socialAuth.validator.ts`| Google, Facebook, Apple login              |
| `imageUpload.validator.ts` | Image upload metadata                    |
| `marketplace.validator.ts` | create/update marketplace ad             |
| `formSchema.validator.ts`  | create/update form schema               |
| `review.validator.ts`      | create review                            |
| `package.validator.ts`     | purchase package                         |
| `chat.validator.ts`        | send message, report, getMessages query   |
| `listing.validator.ts`     | create listing                           |

## Middleware

- **`validateBody(schema)`** – Validates `req.body`, sets `req.validatedBody`, returns 400 with first error message on failure.
- **`validateQuery(schema)`** – Validates `req.query`, sets `req.validatedQuery`, returns 400 on failure.

Both live in `middleware/validateBody.middleware.ts`.
