import NotificationPreference from "../models/NotificationPreference.model.js";

export async function getOrCreatePrefs(userId: string) {
  let doc = await NotificationPreference.findOne({ userId });
  if (!doc) {
    doc = await NotificationPreference.create({ userId });
  }
  return doc;
}

export async function updatePrefs(
  userId: string,
  patch: Partial<{
    pushEnabled: boolean;
    emailEnabled: boolean;
    preferredTimezone: string;
    pushTokens: string[];
  }>
) {
  const doc = await getOrCreatePrefs(userId);
  if (typeof patch.pushEnabled === "boolean") {
    doc.pushEnabled = patch.pushEnabled;
  }
  if (typeof patch.emailEnabled === "boolean") {
    doc.emailEnabled = patch.emailEnabled;
  }
  if (patch.preferredTimezone !== undefined) {
    doc.preferredTimezone = patch.preferredTimezone;
  }
  if (Array.isArray(patch.pushTokens)) {
    doc.pushTokens = patch.pushTokens.slice(0, 20);
  }
  await doc.save();
  return doc;
}
