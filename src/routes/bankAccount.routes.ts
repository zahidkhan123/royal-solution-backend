import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  listBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
} from "../controllers/bankAccount.controller.js";

const router = express.Router();

router.use(protect);
router.get("/", listBankAccounts);
router.post("/", createBankAccount);
router.patch("/:id", updateBankAccount);
router.delete("/:id", deleteBankAccount);

export default router;
