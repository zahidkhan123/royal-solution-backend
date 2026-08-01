import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
} from "../controllers/item.controller.js";

const router = express.Router();

router.use(protect);
router.get("/", listItems);
router.get("/:id", getItem);
router.post("/", createItem);
router.patch("/:id", updateItem);
router.delete("/:id", deleteItem);

export default router;
