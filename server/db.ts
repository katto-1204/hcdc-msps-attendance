import { and, asc, desc, eq, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { attendance, importBatches, students, InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= new Date();
  updateSet.lastSignedIn ??= new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function countStudents() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ id: students.id }).from(students).where(eq(students.status, "active"));
  return result.length;
}

export async function ensureDemoStudents() {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select({ id: students.id }).from(students).limit(1);
  if (existing.length > 0) return;
  await db.insert(students).values([
    { studentId: "2026-00001", firstName: "Catherine", lastName: "Arnado", yearLevel: 4, barcode: "202600001" },
    { studentId: "2026-00002", firstName: "John", lastName: "Doe", yearLevel: 4, barcode: "202600002" },
    { studentId: "2026-00003", firstName: "Maria", lastName: "Santos", yearLevel: 5, barcode: "202600003" },
    { studentId: "2026-00004", firstName: "Liam", lastName: "Reyes", yearLevel: 6, barcode: "202600004" },
    { studentId: "2026-00005", firstName: "Sofia", lastName: "Garcia", yearLevel: 3, barcode: "202600005" },
  ]);
}

export async function listStudents(query?: string) {
  const db = await getDb();
  if (!db) return [];
  await ensureDemoStudents();
  const normalized = query?.trim();
  const where = normalized
    ? and(eq(students.status, "active"), or(like(students.studentId, `%${normalized}%`), like(students.firstName, `%${normalized}%`), like(students.lastName, `%${normalized}%`)))
    : eq(students.status, "active");
  return db.select().from(students).where(where).orderBy(asc(students.lastName), asc(students.firstName));
}

export async function findStudent(identifier: string) {
  const db = await getDb();
  if (!db) return undefined;
  await ensureDemoStudents();
  const value = identifier.trim();
  const result = await db.select().from(students).where(and(eq(students.status, "active"), or(eq(students.studentId, value), eq(students.barcode, value)))).limit(1);
  return result[0];
}

export async function getAttendanceForDate(date: string) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    id: attendance.id,
    studentId: attendance.studentId,
    attendanceDate: attendance.attendanceDate,
    session: attendance.session,
    recordedAt: attendance.recordedAt,
    studentNumber: students.studentId,
    firstName: students.firstName,
    lastName: students.lastName,
    yearLevel: students.yearLevel,
  }).from(attendance).innerJoin(students, eq(attendance.studentId, students.id)).where(eq(attendance.attendanceDate, date)).orderBy(desc(attendance.recordedAt));
  return rows;
}

export async function getDashboard(date: string) {
  const [studentRows, records] = await Promise.all([listStudents(), getAttendanceForDate(date)]);
  const sessions = ["morning_in", "morning_out", "afternoon_in", "afternoon_out"] as const;
  const counts = Object.fromEntries(sessions.map((session) => [session, records.filter((record) => record.session === session).length])) as Record<(typeof sessions)[number], number>;
  return { date, totalStudents: studentRows.length, counts, records };
}

export async function recordAttendance(identifier: string, session: "morning_in" | "morning_out" | "afternoon_in" | "afternoon_out", date: string, recordedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const student = await findStudent(identifier);
  if (!student) return { status: "not_found" as const };
  const existing = await db.select().from(attendance).where(and(eq(attendance.studentId, student.id), eq(attendance.attendanceDate, date), eq(attendance.session, session))).limit(1);
  if (existing[0]) return { status: "duplicate" as const, student, record: existing[0] };
  const recordedAt = new Date();
  await db.insert(attendance).values({ studentId: student.id, attendanceDate: date, session, recordedAt, recordedBy });
  return { status: "recorded" as const, student, record: { attendanceDate: date, session, recordedAt } };
}

export async function createStudent(input: { studentId: string; firstName: string; lastName: string; yearLevel: number; barcode?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(students).values({ ...input, barcode: input.barcode || input.studentId.replace(/-/g, "") });
  return findStudent(input.studentId);
}

export async function updateStudent(id: number, input: { studentId: string; firstName: string; lastName: string; yearLevel: number; barcode?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(students).set({ ...input, barcode: input.barcode || input.studentId.replace(/-/g, "") }).where(eq(students.id, id));
  const rows = await db.select().from(students).where(eq(students.id, id)).limit(1);
  return rows[0];
}

export async function archiveStudent(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(students).set({ status: "inactive" }).where(eq(students.id, id));
  return { success: true };
}

export async function importStudents(filename: string, rows: Array<{ studentId: string; firstName: string; lastName: string; yearLevel: number; barcode?: string }>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  let duplicates = 0;
  let invalidRecords = 0;
  let successfullyImported = 0;
  const seen = new Set<string>();
  for (const row of rows) {
    const id = row.studentId.trim();
    if (!id || !row.firstName.trim() || !row.lastName.trim() || !Number.isFinite(row.yearLevel) || row.yearLevel < 1) {
      invalidRecords += 1;
      continue;
    }
    if (seen.has(id) || (await findStudent(id))) {
      duplicates += 1;
      continue;
    }
    seen.add(id);
    await createStudent(row);
    successfullyImported += 1;
  }
  await db.insert(importBatches).values({ filename, studentsFound: rows.length, successfullyImported, duplicates, invalidRecords, status: invalidRecords > 0 ? "review" : "completed" });
  return { studentsFound: rows.length, successfullyImported, duplicates, invalidRecords };
}

export async function listImportBatches() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(importBatches).orderBy(desc(importBatches.createdAt)).limit(10);
}
