export const STUDENT_ID_PATTERN = /^548\d{5}$/;
export type Session = "morning_in" | "morning_out" | "afternoon_in" | "afternoon_out";
export type StudentInput = { studentId: string; firstName: string; lastName: string; yearLevel: number; barcode?: string; controlNo?: string; middleName?: string; email?: string; program?: string };
export type Student = StudentInput & { id: number; status: "active" | "inactive" };
type RecordRow = { id: number; studentId: number; attendanceDate: string; session: Session; recordedAt: Date; studentNumber: string; firstName: string; lastName: string; yearLevel: number };
type Batch = { id: number; filename: string; studentsFound: number; successfullyImported: number; duplicates: number; invalidRecords: number; status: string; createdAt: Date };
type Masterlist = { id: number; filename: string; totalRows: number; importedRows: number; rejectedRows: number; duplicateRows: number; status: string; createdAt: Date };
export type State = { students: Student[]; records: RecordRow[]; imports: Batch[]; masterlists: Masterlist[]; nextId: number };
const emptyState = (): State => ({ students: [], records: [], imports: [], masterlists: [], nextId: 1 });

// Transactions serialize writes across tabs; imports and roster resets commit atomically.
export async function transaction<T>(write: boolean, action: (state: State) => T): Promise<T> {
  if (typeof indexedDB === "undefined") throw new Error("Local storage is unavailable. Enable browser storage and try again.");
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("hcdc-msps-attendance", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("workspace");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close other app tabs and try again."));
  });
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction("workspace", write ? "readwrite" : "readonly");
    const store = tx.objectStore("workspace");
    let result: T;
    let failure: unknown;
    const request = store.get("data");
    request.onsuccess = () => {
      try {
        const state: State = request.result ?? emptyState();
        result = action(state);
        if (write) store.put(state, "data");
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(failure ?? tx.error ?? new Error("Could not save locally. Check device storage.")); };
  });
}
function normalize(input: StudentInput): StudentInput {
  const value = { ...input, studentId: input.studentId.trim(), firstName: input.firstName.trim(), lastName: input.lastName.trim(), barcode: input.barcode?.trim() || input.studentId.trim() };
  if (!STUDENT_ID_PATTERN.test(value.studentId)) throw new Error("ID number must be exactly 8 digits and start with 548.");
  if (!value.firstName || !value.lastName) throw new Error("First and last name are required.");
  if (!Number.isInteger(value.yearLevel) || value.yearLevel < 1 || value.yearLevel > 12) throw new Error("Year level must be a whole number from 1 to 12.");
  return value;
}
function assertUnique(state: State, input: StudentInput, except?: number) {
  if (state.students.some(s => s.id !== except && (s.studentId === input.studentId || s.barcode === input.barcode || s.studentId === input.barcode || s.barcode === input.studentId))) throw new Error("A student with this ID or barcode already exists (including archived students).");
}
function addStudent(state: State, input: StudentInput) {
  const value = normalize(input);
  assertUnique(state, value);
  const student: Student = { ...value, id: state.nextId++, status: "active" };
  state.students.push(student);
  return student;
}
const list = (s: State, query = "") => s.students.filter(s => s.status === "active" && `${s.studentId} ${s.firstName} ${s.lastName}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
const dashboard = (s: State, date: string) => {
  const records = s.records.filter(r => r.attendanceDate === date).sort((a, b) => b.id - a.id);
  const counts = { morning_in: 0, morning_out: 0, afternoon_in: 0, afternoon_out: 0 };
  records.forEach(r => counts[r.session]++);
  return { date, totalStudents: list(s).length, counts, records };
};
export const localStore = {
  list: (input?: { query?: string }) => transaction(false, s => list(s, input?.query)),
  dashboard: (input: { date: string }) => transaction(false, s => dashboard(s, input.date)),
  history: () => transaction(false, s => [...s.imports].reverse()),
  masterlists: () => transaction(false, s => [...s.masterlists].reverse()),
  create: (input: StudentInput) => transaction(true, s => addStudent(s, input)),
  update: (input: StudentInput & { id: number }) => transaction(true, s => {
    const student = s.students.find(row => row.id === input.id);
    if (!student) throw new Error("Student no longer exists.");
    const value = normalize(input); assertUnique(s, value, input.id);
    Object.assign(student, value); return student;
  }),
  archive: (input: { id: number }) => transaction(true, s => {
    const student = s.students.find(row => row.id === input.id);
    if (!student) throw new Error("Student no longer exists.");
    student.status = "inactive"; return { success: true };
  }),
  record: (input: { identifier: string; session: Session; date: string }) => transaction(true, s => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Choose an attendance date.");
    const student = s.students.find(row => row.status === "active" && (row.studentId === input.identifier.trim() || row.barcode === input.identifier.trim()));
    if (!student) return { status: "not_found" as const };
    const existing = s.records.find(row => row.studentId === student.id && row.attendanceDate === input.date && row.session === input.session);
    if (existing) return { status: "duplicate" as const, student, record: existing };
    const record: RecordRow = { id: s.nextId++, studentId: student.id, attendanceDate: input.date, session: input.session, recordedAt: new Date(), studentNumber: student.studentId, firstName: student.firstName, lastName: student.lastName, yearLevel: student.yearLevel };
    s.records.push(record); return { status: "recorded" as const, student, record };
  }),
  importStudents: (input: { filename: string; rows: StudentInput[] }) => transaction(true, s => {
    let duplicates = 0, invalidRecords = 0, successfullyImported = 0;
    for (const row of input.rows) {
      let value: StudentInput;
      try { value = normalize(row); if (![row.controlNo, row.middleName, row.email, row.program].every(v => v?.trim())) throw new Error("Missing required fields"); }
      catch { invalidRecords++; continue; }
      try { assertUnique(s, value); } catch { duplicates++; continue; }
      addStudent(s, value); successfullyImported++;
    }
    const result = { studentsFound: input.rows.length, successfullyImported, duplicates, invalidRecords, rejectedRows: invalidRecords };
    s.imports.push({ id: s.nextId++, filename: input.filename, ...result, status: invalidRecords ? "review" : "completed", createdAt: new Date() });
    s.masterlists.push({ id: s.nextId++, filename: input.filename, totalRows: input.rows.length, importedRows: successfullyImported, rejectedRows: invalidRecords, duplicateRows: duplicates, status: successfullyImported ? "active" : "rejected", createdAt: new Date() });
    return result;
  }),
  resetRoster: (input: { confirmation: string }) => transaction(true, s => {
    if (input.confirmation !== "CLEAR CURRENT ROSTER") throw new Error("Confirmation required.");
    s.students = []; s.records = [];
    s.masterlists.forEach(m => { if (m.status === "active") m.status = "archived"; });
    return { success: true };
  }),
  csv: (input: { date: string }) => transaction(false, s => {
    const rows = dashboard(s, input.date).records.map(r => [r.attendanceDate, r.recordedAt.toISOString(), r.studentNumber, `${r.firstName} ${r.lastName}`, String(r.yearLevel), r.session.replaceAll("_", " ")]);
    const escape = (v: string) => `"${(/^[=+@\-\t\r]/.test(v) ? "'" : "") + v.replaceAll('"', '""')}"`;
    return [["Date", "Time", "ID Number", "Name", "Year Level", "Session"], ...rows].map(r => r.map(escape).join(",")).join("\n");
  }),
  backup: () => transaction(false, s => JSON.stringify({ version: 1, data: s }, null, 2)),
};
