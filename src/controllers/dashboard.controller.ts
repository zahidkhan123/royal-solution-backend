import { Response, NextFunction } from "express";
import Job from "../models/Job.model.js";
import Invoice from "../models/Invoice.model.js";
import Property from "../models/Property.model.js";
import Client from "../models/Client.model.js";
import AppNotification from "../models/AppNotification.model.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { isStaffRole } from "../constants/maintenance.js";

/** User (property owner) dashboard */
export const getUserDashboard = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!._id;
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const [
      upcomingJobs,
      pendingJobs,
      completedJobs,
      recentInvoices,
      unreadNotifications,
      propertyCount,
      recentJobs,
    ] = await Promise.all([
      Job.countDocuments({
        owner: userId,
        status: { $in: ["assigned", "accepted", "in_progress"] },
        preferredVisitDate: { $gte: startOfDay },
      }),
      Job.countDocuments({ owner: userId, status: "pending" }),
      Job.countDocuments({ owner: userId, status: "completed" }),
      (async () => {
        const ownedProps = await Property.find({
          owner: userId,
          isActive: true,
        })
          .select("_id")
          .lean();
        const propertyIds = ownedProps.map((p) => p._id);
        return Invoice.find({
          $or: [
            { billToUser: userId },
            ...(propertyIds.length
              ? [{ property: { $in: propertyIds } }]
              : []),
          ],
          status: { $ne: "draft" },
        })
          .sort({ createdAt: -1 })
          .limit(5)
          .populate("client", "name")
          .lean();
      })(),
      AppNotification.countDocuments({ user: userId, isRead: false }),
      Property.countDocuments({ owner: userId, isActive: true }),
      Job.find({ owner: userId })
        .sort({ priorityRank: 1, createdAt: -1 })
        .limit(8)
        .populate("property", "name address")
        .lean(),
    ]);

    // Upcoming list (next visits)
    const upcomingList = await Job.find({
      owner: userId,
      status: { $in: ["assigned", "accepted", "in_progress", "pending"] },
    })
      .sort({ preferredVisitDate: 1, priorityRank: 1 })
      .limit(5)
      .populate("property", "name address")
      .lean();

    res.status(200).json({
      success: true,
      data: {
        stats: {
          upcomingJobs,
          pendingJobs,
          completedJobs,
          propertyCount,
          unreadNotifications,
        },
        upcomingJobs: upcomingList,
        recentJobs,
        recentInvoices,
      },
    });
  } catch (error) {
    next(error);
  }
};

/** Admin / contractor dashboard */
export const getAdminDashboard = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Admin only" });
      return;
    }

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const uid = req.user!._id;
    const [
      todaysJobs,
      pendingJobs,
      emergencyJobs,
      openJobs,
      completedJobs,
      invoiceCounts,
      revenueAgg,
      pendingPaymentsAgg,
      clientCount,
      propertyCount,
      recentJobs,
      jobsByPriority,
      jobsByStatus,
      revenueByMonth,
    ] = await Promise.all([
      Job.countDocuments({
        owner: uid,
        createdAt: { $gte: startOfDay, $lte: endOfDay },
      }),
      Job.countDocuments({ owner: uid, status: "pending" }),
      Job.countDocuments({
        owner: uid,
        priority: "P1",
        status: { $nin: ["completed", "cancelled", "rejected"] },
      }),
      Job.countDocuments({
        owner: uid,
        status: { $in: ["pending", "assigned", "accepted", "in_progress"] },
      }),
      Job.countDocuments({ owner: uid, status: "completed" }),
      Invoice.aggregate([
        { $match: { createdBy: uid } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Invoice.aggregate([
        { $match: { createdBy: uid, status: "paid" } },
        { $group: { _id: null, total: { $sum: "$grandTotal" } } },
      ]),
      Invoice.aggregate([
        {
          $match: {
            createdBy: uid,
            status: { $in: ["sent", "pending", "overdue"] },
          },
        },
        { $group: { _id: null, total: { $sum: "$grandTotal" }, count: { $sum: 1 } } },
      ]),
      Client.countDocuments({ createdBy: uid, isActive: true }),
      Property.countDocuments({ owner: uid, isActive: true }),
      Job.find({ owner: uid })
        .sort({ priorityRank: 1, createdAt: -1 })
        .limit(10)
        .populate("property", "name address")
        .populate("owner", "fullName email")
        .lean(),
      Job.aggregate([
        {
          $match: {
            owner: uid,
            status: { $nin: ["completed", "cancelled", "rejected"] },
          },
        },
        { $group: { _id: "$priority", count: { $sum: 1 } } },
      ]),
      Job.aggregate([
        { $match: { owner: uid } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Invoice.aggregate([
        {
          $match: {
            createdBy: uid,
            status: "paid",
            paidAt: {
              $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1),
            },
          },
        },
        {
          $group: {
            _id: {
              y: { $year: "$paidAt" },
              m: { $month: "$paidAt" },
            },
            total: { $sum: "$grandTotal" },
          },
        },
        { $sort: { "_id.y": 1, "_id.m": 1 } },
      ]),
    ]);

    const monthRevenue = await Invoice.aggregate([
      {
        $match: {
          status: "paid",
          paidAt: { $gte: monthStart },
        },
      },
      { $group: { _id: null, total: { $sum: "$grandTotal" } } },
    ]);

    const invoiceStatusMap: Record<string, number> = {};
    for (const row of invoiceCounts) {
      invoiceStatusMap[row._id] = row.count;
    }

    res.status(200).json({
      success: true,
      data: {
        stats: {
          todaysJobs,
          pendingJobs,
          emergencyJobs,
          openJobs,
          completedJobs,
          revenue: revenueAgg[0]?.total || 0,
          monthRevenue: monthRevenue[0]?.total || 0,
          pendingPayments: pendingPaymentsAgg[0]?.total || 0,
          pendingPaymentCount: pendingPaymentsAgg[0]?.count || 0,
          clientCount,
          propertyCount,
          invoices: invoiceStatusMap,
        },
        recentJobs,
        charts: {
          jobsByPriority: jobsByPriority.map((r) => ({
            priority: r._id,
            count: r.count,
          })),
          jobsByStatus: jobsByStatus.map((r) => ({
            status: r._id,
            count: r.count,
          })),
          revenueByMonth: revenueByMonth.map((r) => ({
            year: r._id.y,
            month: r._id.m,
            total: r.total,
          })),
          invoiceStatus: Object.entries(invoiceStatusMap).map(
            ([status, count]) => ({ status, count })
          ),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
