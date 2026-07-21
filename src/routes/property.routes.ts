import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  listProperties,
  getProperty,
  createProperty,
  updateProperty,
  deleteProperty,
} from "../controllers/property.controller.js";

const router = express.Router();

router.use(protect);
router.get("/", listProperties);
router.post("/", createProperty);
router.get("/:id", getProperty);
router.patch("/:id", updateProperty);
router.delete("/:id", deleteProperty);

export default router;
