import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  getCompanySettings,
  listInvoiceTemplates,
  upsertCompanySettings,
} from "../controllers/companySettings.controller.js";

const router = express.Router();

router.use(protect);
router.get("/", getCompanySettings);
router.put("/", upsertCompanySettings);
router.get("/templates", listInvoiceTemplates);

export default router;
