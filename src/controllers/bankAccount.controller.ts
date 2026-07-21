import { Response, NextFunction } from "express";
import BankAccount from "../models/BankAccount.model.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { isStaffRole } from "../constants/maintenance.js";

export const listBankAccounts = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Admin only" });
      return;
    }

    const accounts = await BankAccount.find({ isActive: true })
      .sort({ isDefault: -1, createdAt: -1 })
      .lean();

    res.status(200).json({ success: true, data: { accounts } });
  } catch (error) {
    next(error);
  }
};

export const createBankAccount = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Admin only" });
      return;
    }

    const {
      bankName,
      accountHolder,
      accountNumber,
      iban,
      swift,
      branch,
      routingNumber,
      isDefault,
    } = req.body;

    if (!bankName?.trim() || !accountHolder?.trim() || !accountNumber?.trim()) {
      res.status(400).json({
        success: false,
        message: "Bank name, account holder, and account number are required",
      });
      return;
    }

    if (isDefault) {
      await BankAccount.updateMany(
        { createdBy: req.user!._id, isActive: true },
        { $set: { isDefault: false } }
      );
    }

    const account = await BankAccount.create({
      createdBy: req.user!._id,
      bankName: bankName.trim(),
      accountHolder: accountHolder.trim(),
      accountNumber: accountNumber.trim(),
      iban,
      swift,
      branch,
      routingNumber,
      isDefault: Boolean(isDefault),
    });

    res.status(201).json({
      success: true,
      message: "Bank account added",
      data: { account },
    });
  } catch (error) {
    next(error);
  }
};

export const updateBankAccount = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Admin only" });
      return;
    }

    const account = await BankAccount.findById(req.params.id);
    if (!account || !account.isActive) {
      res.status(404).json({ success: false, message: "Account not found" });
      return;
    }

    const fields = [
      "bankName",
      "accountHolder",
      "accountNumber",
      "iban",
      "swift",
      "branch",
      "routingNumber",
    ] as const;

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        (account as unknown as Record<string, unknown>)[f] = req.body[f];
      }
    }

    if (req.body.isDefault === true) {
      await BankAccount.updateMany(
        { isActive: true, _id: { $ne: account._id } },
        { $set: { isDefault: false } }
      );
      account.isDefault = true;
    } else if (req.body.isDefault === false) {
      account.isDefault = false;
    }

    await account.save();
    res.status(200).json({
      success: true,
      message: "Bank account updated",
      data: { account },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteBankAccount = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Admin only" });
      return;
    }
    const account = await BankAccount.findById(req.params.id);
    if (!account || !account.isActive) {
      res.status(404).json({ success: false, message: "Account not found" });
      return;
    }
    account.isActive = false;
    await account.save();
    res.status(200).json({ success: true, message: "Bank account deleted" });
  } catch (error) {
    next(error);
  }
};
