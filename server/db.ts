// Legacy server compatibility only. The app now runs entirely in the browser.
// There are no SQL connections, database URLs, or remote persistence fallbacks.
import type { InsertUser, User } from "../drizzle/schema";
import { localStore } from "../client/src/lib/local-store";
export { STUDENT_ID_PATTERN } from "../client/src/lib/local-store";
export const getUserByOpenId = async (_id: string): Promise<User | undefined> => undefined;
export const upsertUser = async (_user: InsertUser): Promise<void> => { throw new Error("Online sign-in has been removed. Use the local app."); };
export const ensureDemoStudents = async () => {};
export const listStudents = (query?: string) => localStore.list({ query });
export const findStudent = async (identifier: string) => (await localStore.list()).find(s => s.studentId === identifier || s.barcode === identifier);
export const getDashboard = (date: string) => localStore.dashboard({ date });
export const createStudent = localStore.create;
export const updateStudent = (id: number, input: Parameters<typeof localStore.create>[0]) => localStore.update({ ...input, id });
export const archiveStudent = (id: number) => localStore.archive({ id });
export const recordAttendance = (identifier: string, session: Parameters<typeof localStore.record>[0]["session"], date: string, _recordedBy?: number) => localStore.record({ identifier, session, date });
export const importStudents = (filename: string, rows: Parameters<typeof localStore.importStudents>[0]["rows"]) => localStore.importStudents({ filename, rows });
export const listImportBatches = localStore.history;
export const listMasterlistHistory = localStore.masterlists;
export const resetCurrentRoster = () => localStore.resetRoster({ confirmation: "CLEAR CURRENT ROSTER" });
