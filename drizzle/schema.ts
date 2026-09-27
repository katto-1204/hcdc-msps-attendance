// Compatibility types for unused template components. No database schema or driver.
export type User = { id: number; openId: string; name: string | null; email: string | null; loginMethod: string | null; role: "user" | "admin"; createdAt: Date; updatedAt: Date; lastSignedIn: Date };
export type InsertUser = Partial<User> & { openId: string };
export type { Student } from "../client/src/lib/local-store";
