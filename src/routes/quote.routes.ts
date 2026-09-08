import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  listQuotes,
  getQuote,
  createQuote,
  updateQuote,
  sendQuote,
  acceptQuote,
  declineQuote,
  convertQuote,
} from "../controllers/quote.controller.js";

const router = express.Router();

router.use(protect);
router.get("/", listQuotes);
router.post("/", createQuote);
router.get("/:id", getQuote);
router.patch("/:id", updateQuote);
router.post("/:id/send", sendQuote);
router.post("/:id/accept", acceptQuote);
router.post("/:id/decline", declineQuote);
router.post("/:id/convert", convertQuote);

export default router;
