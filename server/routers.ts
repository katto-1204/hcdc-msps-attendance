import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME } from "@shared/const";
import { publicProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { archiveStudent, createStudent, findStudent, getDashboard, importStudents, listImportBatches, listStudents, recordAttendance, updateStudent } from "./db";

const sessionSchema = z.enum(["morning_in", "morning_out", "afternoon_in", "afternoon_out"]);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const studentInput = z.object({
  studentId: z.string().min(1).max(32),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  yearLevel: z.number().int().min(1).max(12),
  barcode: z.string().max(64).optional(),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboard: router({
    byDate: publicProcedure.input(z.object({ date: dateSchema })).query(({ input }) => getDashboard(input.date)),
  }),
  students: router({
    list: publicProcedure.input(z.object({ query: z.string().optional() }).optional()).query(({ input }) => listStudents(input?.query)),
    find: publicProcedure.input(z.object({ identifier: z.string().min(1) })).query(({ input }) => findStudent(input.identifier)),
    create: publicProcedure.input(studentInput).mutation(({ input }) => createStudent(input)),
    update: publicProcedure.input(studentInput.extend({ id: z.number().int() })).mutation(({ input }) => {
      const { id, ...student } = input;
      return updateStudent(id, student);
    }),
    archive: publicProcedure.input(z.object({ id: z.number().int() })).mutation(({ input }) => archiveStudent(input.id)),
  }),
  attendance: router({
    record: publicProcedure.input(z.object({ identifier: z.string().min(1), session: sessionSchema, date: dateSchema })).mutation(({ ctx, input }) => recordAttendance(input.identifier, input.session, input.date, ctx.user?.id)),
    csv: publicProcedure.input(z.object({ date: dateSchema })).query(async ({ input }) => {
      const dashboard = await getDashboard(input.date);
      const header = ["Date", "Time", "ID Number", "Name", "Year Level", "Session"];
      const lines = dashboard.records.map((row) => [row.attendanceDate, row.recordedAt.toISOString(), row.studentNumber, `${row.firstName} ${row.lastName}`, String(row.yearLevel), row.session.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())]);
      const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
      return [header, ...lines].map((line) => line.map(escape).join(",")).join("\n");
    }),
  }),
  imports: router({
    history: publicProcedure.query(() => listImportBatches()),
    students: publicProcedure.input(z.object({ filename: z.string().min(1), rows: z.array(studentInput) })).mutation(({ input }) => importStudents(input.filename, input.rows)),
  }),
});

export type AppRouter = typeof appRouter;
