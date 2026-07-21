import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { listContacts } from "../controllers/contacts.controller.js";

const router = express.Router();

router.use(protect);
router.get("/", listContacts);

export default router;
