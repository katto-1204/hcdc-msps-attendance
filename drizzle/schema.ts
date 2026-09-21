import { int, mysqlEnum, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/** Core Manus-authenticated user table. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const students = mysqlTable("students", {
  id: int("id").autoincrement().primaryKey(),
  studentId: varchar("studentId", { length: 32 }).notNull().unique(),
  controlNo: varchar("controlNo", { length: 32 }),
  firstName: varchar("firstName", { length: 100 }).notNull(),
  lastName: varchar("lastName", { length: 100 }).notNull(),
  middleName: varchar("middleName", { length: 100 }),
  email: varchar("email", { length: 320 }),
  program: varchar("program", { length: 255 }),
  yearLevel: int("yearLevel").notNull(),
  barcode: varchar("barcode", { length: 64 }),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const attendance = mysqlTable("attendance", {
  id: int("id").autoincrement().primaryKey(),
  studentId: int("studentId").notNull(),
  attendanceDate: varchar("attendanceDate", { length: 10 }).notNull(),
  session: mysqlEnum("session", ["morning_in", "morning_out", "afternoon_in", "afternoon_out"]).notNull(),
  recordedAt: timestamp("recordedAt").notNull(),
  recordedBy: int("recordedBy"),
}, (table) => ({
  studentDateSession: uniqueIndex("student_date_session").on(table.studentId, table.attendanceDate, table.session),
}));

export const importBatches = mysqlTable("importBatches", {
  id: int("id").autoincrement().primaryKey(),
  filename: varchar("filename", { length: 255 }).notNull(),
  studentsFound: int("studentsFound").default(0).notNull(),
  successfullyImported: int("successfullyImported").default(0).notNull(),
  duplicates: int("duplicates").default(0).notNull(),
  invalidRecords: int("invalidRecords").default(0).notNull(),
  status: mysqlEnum("status", ["completed", "review"]).default("completed").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const masterlistHistory = mysqlTable("masterlistHistory", {
  id: int("id").autoincrement().primaryKey(),
  filename: varchar("filename", { length: 255 }).notNull(),
  totalRows: int("totalRows").default(0).notNull(),
  importedRows: int("importedRows").default(0).notNull(),
  rejectedRows: int("rejectedRows").default(0).notNull(),
  duplicateRows: int("duplicateRows").default(0).notNull(),
  status: mysqlEnum("status", ["active", "rejected", "archived"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Student = typeof students.$inferSelect;
export type Attendance = typeof attendance.$inferSelect;
export type ImportBatch = typeof importBatches.$inferSelect;
export type MasterlistHistory = typeof masterlistHistory.$inferSelect;
