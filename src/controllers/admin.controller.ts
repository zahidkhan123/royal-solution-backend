import { Request, Response, NextFunction } from "express";
import User from "../models/User.model.js";

function getPeriodRange(period: string): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  switch (period) {
    case "week":
      start.setDate(start.getDate() - 7);
      break;
    case "month":
      start.setDate(start.getDate() - 30);
      break;
    case "year":
      start.setFullYear(start.getFullYear() - 1);
      break;
    default:
      start.setDate(start.getDate() - 30);
  }
  return { start, end };
}

/**
 * List users for admin CRM.
 */
export const listAdminUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(
      200,
      Math.max(1, parseInt(String(req.query.limit || "100"), 10) || 100)
    );
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const sortRaw =
      typeof req.query.sort === "string" ? req.query.sort.trim() : "newest";

    const filter: Record<string, unknown> = {};
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ email: re }, { fullName: re }, { username: re }];
    }

    const total = await User.countDocuments(filter);
    let sort: Record<string, 1 | -1> = { createdAt: -1 };
    if (sortRaw === "name") {
      sort = { fullName: 1, email: 1 };
    }

    const users = await User.find(filter)
      .select(
        "fullName email username role city country isVerified createdAt provider"
      )
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.status(200).json({
      success: true,
      data: {
        users: users.map((u) => ({
          _id: String(u._id),
          fullName: u.fullName ?? null,
          email: u.email,
          username: u.username ?? null,
          role: u.role,
          city: u.city ?? null,
          country: u.country ?? null,
          isVerified: Boolean(u.isVerified),
          createdAt: u.createdAt,
          provider: u.provider,
        })),
        summary: {
          totalUsers: total,
        },
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminStats = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [totalUsers, verifiedUsers, usersThisWeek] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isVerified: true }),
      User.countDocuments({ createdAt: { $gte: weekAgo } }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        verifiedUsers,
        usersThisWeek,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const period = String(req.query.period || "month");
    const { start, end } = getPeriodRange(period);

    const [usersInPeriod, dailyUsers] = await Promise.all([
      User.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      User.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        period,
        start: start.toISOString(),
        end: end.toISOString(),
        counts: {
          users: usersInPeriod,
        },
        dailyCounts: dailyUsers.map((r) => ({
          date: r._id,
          count: r.count,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};
