import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import connectDB from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import imageUploadRoutes from "./routes/imageUpload.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import notificationsRoutes from "./routes/notifications.routes.js";
import propertyRoutes from "./routes/property.routes.js";
import jobRoutes from "./routes/job.routes.js";
import clientRoutes from "./routes/client.routes.js";
import itemRoutes from "./routes/item.routes.js";
import bankAccountRoutes from "./routes/bankAccount.routes.js";
import invoiceRoutes from "./routes/invoice.routes.js";
import quoteRoutes from "./routes/quote.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import appNotificationRoutes from "./routes/appNotification.routes.js";
import companySettingsRoutes from "./routes/companySettings.routes.js";
import contactsRoutes from "./routes/contacts.routes.js";
import { initializeCronJobs } from "./utils/cron.js";
import {
  ensureSingleUser,
  isSingleUserMode,
} from "./config/singleUser.js";
import { s3CredentialDebug } from "./config/s3.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
app.set("trust proxy", 1);

connectDB();

const isDev = process.env.NODE_ENV !== "production";
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 500 : 100,
  message: "Too many requests from this IP, please try again later.",
});

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10mb", strict: false }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(limiter);

app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "OK",
    message: "API is running",
    timestamp: new Date().toISOString(),
    s3: s3CredentialDebug,
  });
});

// Auth + core
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/images", imageUploadRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationsRoutes);

// Property maintenance modules
app.use("/api/properties", propertyRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/bank-accounts", bankAccountRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/quotes", quoteRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/app-notifications", appNotificationRoutes);
app.use("/api/company-settings", companySettingsRoutes);
app.use("/api/contacts", contactsRoutes);

// Proxy-friendly aliases (path may arrive without /api)
app.use("/notifications", notificationsRoutes);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  console.error("Error:", err);
  const statusCode =
    (err as { statusCode?: number }).statusCode ||
    (err as { status?: number }).status ||
    500;
  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

app.use((_req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  if (isSingleUserMode()) {
    try {
      const u = await ensureSingleUser();
      console.log(
        `🔓 Single-user mode ON — local account ${u.email} (no login required)`
      );
    } catch (err) {
      console.error("[single-user] Failed to bootstrap local account:", err);
    }
  }
  console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  try {
    initializeCronJobs();
  } catch (error) {
    console.error("Error initializing app:", error);
  }
});

export default app;
