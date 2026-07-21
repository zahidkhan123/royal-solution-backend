import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  listItems,
  createItem,
  updateItem,
  deleteItem,
} from "../controllers/item.controller.js";

const router = express.Router();

router.use(protect);
router.get("/", listItems);
router.post("/", createItem);
router.patch("/:id", updateItem);
router.delete("/:id", deleteItem);

export default router;
