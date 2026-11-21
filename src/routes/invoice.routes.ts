import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  markInvoicePaid,
  addInvoicePayment,
  deleteInvoicePayment,
} from "../controllers/invoice.controller.js";

const router = express.Router();

router.use(protect);
router.get("/", listInvoices);
router.post("/", createInvoice);
router.get("/:id", getInvoice);
router.patch("/:id", updateInvoice);
router.post("/:id/pay", markInvoicePaid);
router.post("/:id/payments", addInvoicePayment);
router.delete("/:id/payments/:paymentId", deleteInvoicePayment);

export default router;
