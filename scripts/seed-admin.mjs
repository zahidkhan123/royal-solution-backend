/**
 * Seed a contractor/admin user for the portal.
 * Usage: node scripts/seed-admin.mjs
 * Env: MONGODB_URI, ADMIN_EMAIL, ADMIN_PASSWORD
 */
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/salah360";
const email = (process.env.ADMIN_EMAIL || "contractor@example.com").toLowerCase();
const password = process.env.ADMIN_PASSWORD || "Admin123!";
const fullName = process.env.ADMIN_NAME || "Contractor Admin";

async function main() {
  await mongoose.connect(uri);
  const users = mongoose.connection.collection("users");
  const existing = await users.findOne({ email });
  const hash = await bcrypt.hash(password, 10);

  if (existing) {
    await users.updateOne(
      { email },
      {
        $set: {
          role: ["Admin"],
          password: hash,
          isVerified: true,
          fullName: existing.fullName || fullName,
        },
      }
    );
    console.log(`Updated existing user to Admin: ${email}`);
  } else {
    await users.insertOne({
      fullName,
      email,
      password: hash,
      role: ["Admin"],
      provider: "local",
      isVerified: true,
      isProfileCompleted: true,
      blockedUsers: [],
      notificationPreferences: { pushEnabled: true, emailEnabled: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`Created Admin user: ${email}`);
  }
  console.log(`Password: ${password}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
