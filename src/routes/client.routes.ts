import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  listClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
} from "../controllers/client.controller.js";

const router = express.Router();

router.use(protect);
router.get("/", listClients);
router.post("/", createClient);
router.get("/:id", getClient);
router.patch("/:id", updateClient);
router.delete("/:id", deleteClient);

export default router;
