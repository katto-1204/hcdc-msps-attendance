import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import * as XLSX from "xlsx";
import {
  Activity,
  Archive,
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  Clock3,
  FileSpreadsheet,
  LayoutDashboard,
  Menu,
  Pencil,
  Plus,
  QrCode,
  Search,
  Settings2,
  ShieldCheck,
  Upload,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type View = "overview" | "students" | "records" | "imports";
type Session = "morning_in" | "morning_out" | "afternoon_in" | "afternoon_out";
type StudentForm = { studentId: string; firstName: string; lastName: string; yearLevel: string; barcode: string };
type ImportRow = { studentId: string; firstName: string; lastName: string; yearLevel: number; barcode?: string };

const sessions: Array<{ key: Session; label: string; short: string; tint: string }> = [
  { key: "morning_in", label: "Morning In", short: "AM IN", tint: "#174a3a" },
  { key: "morning_out", label: "Morning Out", short: "AM OUT", tint: "#6d8c7c" },
  { key: "afternoon_in", label: "Afternoon In", short: "PM IN", tint: "#b07a45" },
  { key: "afternoon_out", label: "Afternoon Out", short: "PM OUT", tint: "#c7986c" },
];

const emptyStudent: StudentForm = { studentId: "", firstName: "", lastName: "", yearLevel: "", barcode: "" };

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function formatTime(value: Date | string) {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function displaySession(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StatCard({ label, value, accent, sublabel }: { label: string; value: number; accent: string; sublabel: string }) {
  return (
    <div className="rounded-2xl border border-[#dbe5dd] bg-white p-5 shadow-[0_10px_30px_rgba(28,66,47,0.05)]">
      <div className="mb-6 flex items-start justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#718076]">{label}</span>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
      </div>
      <div className="flex items-end justify-between gap-3">
        <strong className="text-3xl font-semibold tracking-[-0.04em] text-[#19362b]">{value}</strong>
        <span className="pb-1 text-right text-xs text-[#819087]">{sublabel}</span>
      </div>
    </div>
  );
}

export default function Home() {
  const { user, isAuthenticated, logout } = useAuth();
  const [view, setView] = useState<View>("overview");
  const [date, setDate] = useState(todayString);
  const [session, setSession] = useState<Session>("morning_in");
  const [identifier, setIdentifier] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [recordSearch, setRecordSearch] = useState("");
  const [editingStudent, setEditingStudent] = useState<number | null>(null);
  const [studentForm, setStudentForm] = useState<StudentForm>(emptyStudent);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportRow[]>([]);
  const [importFilename, setImportFilename] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const dashboardInput = useMemo(() => ({ date }), [date]);
  const studentsInput = useMemo(() => ({ query: studentSearch || undefined }), [studentSearch]);
  const { data: dashboard, isLoading: dashboardLoading } = trpc.dashboard.byDate.useQuery(dashboardInput);
  const { data: students = [], isLoading: studentsLoading } = trpc.students.list.useQuery(studentsInput);
  const { data: imports = [] } = trpc.imports.history.useQuery();
  const utils = trpc.useUtils();

  const recordMutation = trpc.attendance.record.useMutation({
    onSuccess: async (result) => {
      if (result.status === "recorded") {
        toast.success(`${result.student.firstName} ${result.student.lastName} recorded`, { description: `${displaySession(session)} · ${formatTime(result.record.recordedAt)}` });
        await utils.dashboard.byDate.invalidate(dashboardInput);
      } else if (result.status === "duplicate") {
        toast.info("Attendance already recorded", { description: `${result.student.firstName} ${result.student.lastName} · ${displaySession(session)}` });
      } else {
        toast.error("Student not found", { description: "Check the ID number or barcode and try again." });
      }
      setIdentifier("");
      inputRef.current?.focus();
    },
    onError: (error) => toast.error("Could not record attendance", { description: error.message }),
  });
  const createMutation = trpc.students.create.useMutation({ onSuccess: async () => { toast.success("Student added"); setStudentForm(emptyStudent); setShowStudentForm(false); await utils.students.list.invalidate(); } });
  const updateMutation = trpc.students.update.useMutation({ onSuccess: async () => { toast.success("Student updated"); setEditingStudent(null); setStudentForm(emptyStudent); await utils.students.list.invalidate(); } });
  const archiveMutation = trpc.students.archive.useMutation({ onSuccess: async () => { toast.success("Student archived"); await utils.students.list.invalidate(); } });
  const importMutation = trpc.imports.students.useMutation({ onSuccess: async (result) => { toast.success("Import reviewed", { description: `${result.successfullyImported} students added to the roster.` }); setImportPreview([]); setImportFilename(""); await Promise.all([utils.students.list.invalidate(), utils.imports.history.invalidate()]); } });
  const csvQuery = trpc.attendance.csv.useQuery(dashboardInput, { enabled: false });

  const handleRecord = (event: FormEvent) => {
    event.preventDefault();
    if (!identifier.trim() || recordMutation.isPending) return;
    recordMutation.mutate({ identifier: identifier.trim(), session, date });
  };

  const startEdit = (student: (typeof students)[number]) => {
    setEditingStudent(student.id);
    setShowStudentForm(true);
    setStudentForm({ studentId: student.studentId, firstName: student.firstName, lastName: student.lastName, yearLevel: String(student.yearLevel), barcode: student.barcode || "" });
  };

  const saveStudent = (event: FormEvent) => {
    event.preventDefault();
    const input = { studentId: studentForm.studentId.trim(), firstName: studentForm.firstName.trim(), lastName: studentForm.lastName.trim(), yearLevel: Number(studentForm.yearLevel), barcode: studentForm.barcode.trim() || undefined };
    if (!input.studentId || !input.firstName || !input.lastName || !input.yearLevel) { toast.error("Complete all required student fields"); return; }
    if (editingStudent) updateMutation.mutate({ id: editingStudent, ...input }); else createMutation.mutate(input);
  };

  const parseImport = async (file: File) => {
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      const headerRow = (rows[0] || []).map((cell) => String(cell).trim().toUpperCase());
      const indexOf = (...names: string[]) => names.map((name) => headerRow.indexOf(name)).find((index) => index >= 0) ?? -1;
      const idIndex = indexOf("ID NUMBER", "ID", "STUDENT ID");
      const nameIndex = indexOf("NAME", "FIRST NAME", "GIVEN NAME");
      const lastNameIndex = indexOf("LAST NAME", "SURNAME");
      const yearIndex = indexOf("YEAR LEVEL", "YEAR", "GRADE");
      if ([idIndex, nameIndex, lastNameIndex, yearIndex].some((index) => index < 0)) { toast.error("Missing required columns", { description: "Required: ID NUMBER, NAME, LAST NAME, YEAR LEVEL" }); return; }
      const parsed = rows.slice(1).map((row) => ({ studentId: String(row[idIndex] || "").trim(), firstName: String(row[nameIndex] || "").trim(), lastName: String(row[lastNameIndex] || "").trim(), yearLevel: Number(row[yearIndex]), barcode: String(row[idIndex] || "").replace(/-/g, "") })).filter((row) => row.studentId || row.firstName || row.lastName);
      setImportFilename(file.name);
      setImportPreview(parsed);
      toast.success(`${parsed.length} rows ready for review`);
    } catch { toast.error("Could not read this spreadsheet"); }
  };

  const exportCsv = async () => {
    const result = await csvQuery.refetch();
    if (!result.data) return;
    const blob = new Blob([result.data], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `attendance-${date}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  const filteredRecords = dashboard?.records.filter((record) => `${record.studentNumber} ${record.firstName} ${record.lastName}`.toLowerCase().includes(recordSearch.toLowerCase())) || [];
  const currentSession = sessions.find((item) => item.key === session) || sessions[0];
  const navItems: Array<{ key: View; label: string; icon: typeof LayoutDashboard }> = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "students", label: "Students", icon: UsersRound },
    { key: "records", label: "Attendance records", icon: Activity },
    { key: "imports", label: "Import students", icon: FileSpreadsheet },
  ];

  return (
    <div className="min-h-screen bg-[#f7f9f7] text-[#1d2b25]">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-[#123d30] text-[#f2f8f3] transition-transform lg:translate-x-0 ${mobileMenu ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-[92px] items-center gap-3 border-b border-white/10 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d8ebdd] text-[#174a3a]"><BookOpen className="h-5 w-5" /></div>
          <div><div className="text-sm font-bold tracking-tight">HCDC-MSPS</div><div className="text-[11px] text-[#b8d1bf]">Attendance system</div></div>
          <button className="ml-auto rounded-lg p-1 text-[#b8d1bf] lg:hidden" onClick={() => setMobileMenu(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-4 pt-8"><div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#8fb39c]">Workspace</div>{navItems.map((item) => { const Icon = item.icon; return <button key={item.key} onClick={() => { setView(item.key); setMobileMenu(false); }} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] font-medium ${view === item.key ? "bg-[#d8ebdd] text-[#174a3a] shadow-sm" : "text-[#d1e3d5] hover:bg-white/10"}`}><Icon className="h-[17px] w-[17px]" /><span>{item.label}</span>{view === item.key && <ArrowRight className="ml-auto h-4 w-4" />}</button>; })}</div>
        <div className="mt-auto border-t border-white/10 p-4"><div className="mb-3 flex items-center gap-3 rounded-xl bg-white/[0.06] p-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d8ebdd] text-xs font-bold text-[#174a3a]">{(user?.name || "A").slice(0, 1).toUpperCase()}</div><div className="min-w-0"><div className="truncate text-xs font-semibold">{user?.name || "Attendance staff"}</div><div className="truncate text-[10px] text-[#a7c4af]">{isAuthenticated ? "Signed in" : "Local desk mode"}</div></div></div>{isAuthenticated ? <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-[#b8d1bf] hover:bg-white/10"><ShieldCheck className="h-4 w-4" /> Sign out</button> : <button onClick={() => startLogin()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-[#b8d1bf] hover:bg-white/10"><ShieldCheck className="h-4 w-4" /> Sign in to sync</button>}</div>
      </aside>

      <main className="min-h-screen lg:pl-[248px]">
        <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-[#e0e9e1]/80 bg-[#f7f9f7]/90 px-5 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3"><button className="rounded-lg p-2 text-[#355b49] lg:hidden" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button><div><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#819087]">HCDC • MSPS</p><h1 className="text-lg font-semibold tracking-[-0.03em] text-[#19362b]">{view === "overview" ? "Daily attendance" : navItems.find((item) => item.key === view)?.label}</h1></div></div>
          <div className="flex items-center gap-3"><div className="hidden items-center gap-2 rounded-xl border border-[#dce7de] bg-white px-3 py-2 text-xs text-[#607368] sm:flex"><Clock3 className="h-4 w-4 text-[#6d8c7c]" /> {formatDate(date)}</div><button onClick={() => setView("students")} className="flex h-9 items-center gap-2 rounded-xl bg-[#174a3a] px-3 text-xs font-semibold text-white shadow-[0_5px_12px_rgba(23,74,58,0.18)] hover:bg-[#0f3c2e]"><Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add student</span></button></div>
        </header>

        <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8">
          {view === "overview" && <section className="animate-rise-in space-y-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-sm text-[#718076]">Keep the flow moving. Every scan updates the live register.</p><h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#19362b] sm:text-[28px]">Good day, {user?.name?.split(" ")[0] || "team"}.</h2></div><label className="flex items-center gap-2 rounded-xl border border-[#dce7de] bg-white px-3 py-2 text-xs font-medium text-[#607368]">View date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="border-0 bg-transparent text-xs font-semibold text-[#19362b] outline-none" /></label></div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Morning in" value={dashboard?.counts.morning_in || 0} accent="#174a3a" sublabel="students recorded" /><StatCard label="Morning out" value={dashboard?.counts.morning_out || 0} accent="#6d8c7c" sublabel="students recorded" /><StatCard label="Afternoon in" value={dashboard?.counts.afternoon_in || 0} accent="#b07a45" sublabel="students recorded" /><StatCard label="Afternoon out" value={dashboard?.counts.afternoon_out || 0} accent="#c7986c" sublabel="students recorded" /></div>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_370px]">
              <div className="rounded-2xl border border-[#dbe5dd] bg-white p-5 shadow-[0_10px_30px_rgba(28,66,47,0.05)] sm:p-6"><div className="mb-5 flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#55a875]" /><h3 className="text-base font-semibold text-[#19362b]">Live activity</h3></div><p className="mt-1 text-xs text-[#819087]">Latest scans for {formatDate(date)}</p></div><button onClick={() => setView("records")} className="flex items-center gap-1 text-xs font-semibold text-[#174a3a] hover:underline">View all <ArrowRight className="h-3.5 w-3.5" /></button></div>{dashboardLoading ? <div className="flex h-44 items-center justify-center text-sm text-[#819087]">Loading today&apos;s activity…</div> : dashboard?.records.length ? <div className="divide-y divide-[#edf1ed]">{dashboard.records.slice(0, 6).map((record) => <div key={record.id} className="flex items-center justify-between gap-3 py-3 first:pt-0"><div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#edf4ee] text-xs font-bold text-[#174a3a]">{record.firstName.slice(0, 1)}{record.lastName.slice(0, 1)}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#254338]">{record.firstName} {record.lastName}</p><p className="text-[11px] text-[#819087]">{record.studentNumber} · Year {record.yearLevel}</p></div></div><div className="text-right"><p className="text-xs font-semibold text-[#355b49]">{formatTime(record.recordedAt)}</p><p className="text-[10px] uppercase tracking-[0.12em] text-[#9aa99e]">{displaySession(record.session)}</p></div></div>)}</div> : <div className="flex h-44 flex-col items-center justify-center rounded-xl bg-[#f7faf7] text-center"><Activity className="mb-2 h-6 w-6 text-[#9db4a5]" /><p className="text-sm font-medium text-[#587063]">No scans yet</p><p className="mt-1 text-xs text-[#8b9d91]">Recorded attendance will appear here.</p></div>}</div>
              <div className="rounded-2xl bg-[#174a3a] p-5 text-white shadow-[0_18px_35px_rgba(23,74,58,0.22)] sm:p-6"><div className="mb-6 flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#a8c8b1]">Quick capture</p><h3 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Record attendance</h3></div><div className="rounded-xl bg-white/10 p-2"><QrCode className="h-5 w-5 text-[#d8ebdd]" /></div></div><form onSubmit={handleRecord}><div className="mb-3 flex items-center justify-between"><label className="text-xs font-medium text-[#c4ddca]" htmlFor="student-id">ID number or barcode</label><span className="text-[10px] text-[#9fc2a9]">USB scanner ready</span></div><div className="flex rounded-xl bg-white p-1.5"><input ref={inputRef} id="student-id" autoFocus value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Type or scan ID…" className="min-w-0 flex-1 rounded-lg border-0 px-3 py-2.5 text-sm text-[#19362b] outline-none placeholder:text-[#9aa99e]" /><button className="rounded-lg bg-[#d8ebdd] px-3 text-[#174a3a] hover:bg-white" type="submit"><ArrowRight className="h-4 w-4" /></button></div><p className="mt-2 text-[10px] text-[#a8c8b1]">Press Enter after typing. Barcode scanners submit automatically.</p></form><div className="mt-7"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium text-[#c4ddca]">Active session</span><span className="text-[10px] uppercase tracking-[0.12em] text-[#a8c8b1]">Today</span></div><div className="grid grid-cols-2 gap-2">{sessions.map((item) => <button key={item.key} onClick={() => setSession(item.key)} className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${session === item.key ? "border-[#d8ebdd] bg-[#d8ebdd] text-[#174a3a]" : "border-white/15 bg-white/[0.06] text-[#c4ddca] hover:bg-white/10"}`}><span className="block text-[10px] font-bold uppercase tracking-[0.13em] opacity-70">{item.short}</span><span className="mt-1 block text-xs font-semibold">{item.label.replace("Morning ", "").replace("Afternoon ", "")}</span></button>)}</div></div><div className="mt-7 flex items-center justify-between border-t border-white/10 pt-4"><span className="text-xs text-[#a8c8b1]">Active now</span><span className="flex items-center gap-2 text-xs font-semibold text-[#d8ebdd]"><span className="h-2 w-2 rounded-full bg-[#8fd7a2]" /> {currentSession.label}</span></div></div>
            </div>
            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-[#e5dacd] bg-[#f2e8da] p-5 sm:flex-row sm:items-center sm:p-6"><div className="flex items-start gap-3"><div className="rounded-xl bg-[#e4cdb4] p-2.5 text-[#825938]"><BarChart3 className="h-5 w-5" /></div><div><h3 className="text-sm font-semibold text-[#4b382b]">Daily register</h3><p className="mt-1 text-xs text-[#796653]">{dashboard?.totalStudents || 0} active students in the roster · {dashboard?.records.length || 0} records today</p></div></div><button onClick={exportCsv} className="flex items-center justify-center gap-2 rounded-xl bg-[#fffaf4] px-4 py-2.5 text-xs font-semibold text-[#6b4b33] shadow-sm hover:bg-white"><ArrowDownToLine className="h-4 w-4" /> Export CSV</button></div>
          </section>}

          {view === "students" && <section className="animate-rise-in space-y-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-sm text-[#718076]">Add, update, or archive the active student roster.</p><h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#19362b]">Student directory</h2></div><div className="flex gap-2"><div className="flex items-center gap-2 rounded-xl border border-[#dce7de] bg-white px-3 py-2"><Search className="h-4 w-4 text-[#819087]" /><input value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Search students…" className="w-36 bg-transparent text-xs outline-none placeholder:text-[#9aa99e] sm:w-48" /></div><button onClick={() => { setEditingStudent(null); setStudentForm(emptyStudent); setShowStudentForm(!showStudentForm); }} className="flex items-center gap-2 rounded-xl bg-[#174a3a] px-3 py-2 text-xs font-semibold text-white"><Plus className="h-4 w-4" /> New student</button></div></div>{showStudentForm && <form onSubmit={saveStudent} className="rounded-2xl border border-[#dbe5dd] bg-white p-5 shadow-[0_10px_30px_rgba(28,66,47,0.05)]"><div className="mb-4 flex items-center justify-between"><div><h3 className="text-sm font-semibold text-[#19362b]">{editingStudent ? "Edit student" : "Add student"}</h3><p className="mt-1 text-xs text-[#819087]">Required fields are used for lookup and reporting.</p></div><button type="button" onClick={() => setShowStudentForm(false)} className="rounded-lg p-1 text-[#819087] hover:bg-[#f0f5f1]"><X className="h-4 w-4" /></button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><label className="text-xs font-medium text-[#587063]">ID number<input value={studentForm.studentId} onChange={(event) => setStudentForm({ ...studentForm, studentId: event.target.value })} className="mt-1.5 w-full rounded-lg border border-[#dbe5dd] px-3 py-2.5 text-sm outline-none focus:border-[#6da48a]" placeholder="2026-00006" /></label><label className="text-xs font-medium text-[#587063]">First name<input value={studentForm.firstName} onChange={(event) => setStudentForm({ ...studentForm, firstName: event.target.value })} className="mt-1.5 w-full rounded-lg border border-[#dbe5dd] px-3 py-2.5 text-sm outline-none focus:border-[#6da48a]" placeholder="Catherine" /></label><label className="text-xs font-medium text-[#587063]">Last name<input value={studentForm.lastName} onChange={(event) => setStudentForm({ ...studentForm, lastName: event.target.value })} className="mt-1.5 w-full rounded-lg border border-[#dbe5dd] px-3 py-2.5 text-sm outline-none focus:border-[#6da48a]" placeholder="Arnado" /></label><label className="text-xs font-medium text-[#587063]">Year level<input type="number" min="1" max="12" value={studentForm.yearLevel} onChange={(event) => setStudentForm({ ...studentForm, yearLevel: event.target.value })} className="mt-1.5 w-full rounded-lg border border-[#dbe5dd] px-3 py-2.5 text-sm outline-none focus:border-[#6da48a]" placeholder="4" /></label><label className="text-xs font-medium text-[#587063]">Barcode <span className="font-normal text-[#9aa99e]">(optional)</span><input value={studentForm.barcode} onChange={(event) => setStudentForm({ ...studentForm, barcode: event.target.value })} className="mt-1.5 w-full rounded-lg border border-[#dbe5dd] px-3 py-2.5 text-sm outline-none focus:border-[#6da48a]" placeholder="Auto-generated" /></label></div><div className="mt-4 flex justify-end"><button className="flex items-center gap-2 rounded-xl bg-[#174a3a] px-4 py-2.5 text-xs font-semibold text-white" type="submit"><Check className="h-4 w-4" /> Save student</button></div></form>}<div className="overflow-hidden rounded-2xl border border-[#dbe5dd] bg-white shadow-[0_10px_30px_rgba(28,66,47,0.05)]"><div className="flex items-center justify-between border-b border-[#edf1ed] px-5 py-4"><div><h3 className="text-sm font-semibold text-[#19362b]">Active roster</h3><p className="mt-1 text-xs text-[#819087]">{students.length} students shown</p></div><span className="rounded-full bg-[#edf4ee] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#47735b]">Live</span></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead className="bg-[#f8faf8] text-[10px] uppercase tracking-[0.14em] text-[#819087]"><tr><th className="px-5 py-3 font-semibold">Student</th><th className="px-5 py-3 font-semibold">ID number</th><th className="px-5 py-3 font-semibold">Year</th><th className="px-5 py-3 font-semibold">Barcode</th><th className="px-5 py-3 text-right font-semibold">Actions</th></tr></thead><tbody className="divide-y divide-[#edf1ed]">{studentsLoading ? <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-[#819087]">Loading roster…</td></tr> : students.length ? students.map((student) => <tr key={student.id} className="hover:bg-[#fbfdfb]"><td className="px-5 py-3.5"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e8f1ea] text-[10px] font-bold text-[#174a3a]">{student.firstName[0]}{student.lastName[0]}</div><div><p className="text-sm font-semibold text-[#355447]">{student.firstName} {student.lastName}</p><p className="text-[11px] text-[#9aa99e]">Active student</p></div></div></td><td className="px-5 py-3.5 text-xs font-medium text-[#587063]">{student.studentId}</td><td className="px-5 py-3.5 text-xs text-[#587063]">Year {student.yearLevel}</td><td className="px-5 py-3.5 font-mono text-[11px] text-[#819087]">{student.barcode || "—"}</td><td className="px-5 py-3.5"><div className="flex justify-end gap-1"><button onClick={() => startEdit(student)} className="rounded-lg p-2 text-[#6d8c7c] hover:bg-[#edf4ee]" title="Edit student"><Pencil className="h-4 w-4" /></button><button onClick={() => archiveMutation.mutate({ id: student.id })} className="rounded-lg p-2 text-[#a56e62] hover:bg-[#fff0ed]" title="Archive student"><Archive className="h-4 w-4" /></button></div></td></tr>) : <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-[#819087]">No students match that search.</td></tr>}</tbody></table></div></div></section>}

          {view === "records" && <section className="animate-rise-in space-y-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-sm text-[#718076]">Review, search, and export attendance records by day.</p><h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#19362b]">Attendance register</h2></div><div className="flex flex-wrap gap-2"><label className="flex items-center gap-2 rounded-xl border border-[#dce7de] bg-white px-3 py-2 text-xs font-medium text-[#607368]">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="border-0 bg-transparent text-xs font-semibold text-[#19362b] outline-none" /></label><button onClick={exportCsv} className="flex items-center gap-2 rounded-xl bg-[#174a3a] px-3 py-2 text-xs font-semibold text-white"><ArrowDownToLine className="h-4 w-4" /> Export CSV</button></div></div><div className="grid gap-4 sm:grid-cols-4"><StatCard label="All records" value={dashboard?.records.length || 0} accent="#174a3a" sublabel="for selected date" /><StatCard label="Morning in" value={dashboard?.counts.morning_in || 0} accent="#174a3a" sublabel="students recorded" /><StatCard label="Morning out" value={dashboard?.counts.morning_out || 0} accent="#6d8c7c" sublabel="students recorded" /><StatCard label="Afternoon" value={(dashboard?.counts.afternoon_in || 0) + (dashboard?.counts.afternoon_out || 0)} accent="#b07a45" sublabel="combined records" /></div><div className="overflow-hidden rounded-2xl border border-[#dbe5dd] bg-white shadow-[0_10px_30px_rgba(28,66,47,0.05)]"><div className="flex flex-col justify-between gap-3 border-b border-[#edf1ed] px-5 py-4 sm:flex-row sm:items-center"><div><h3 className="text-sm font-semibold text-[#19362b]">{formatDate(date)}</h3><p className="mt-1 text-xs text-[#819087]">Every record is protected against duplicate session entries.</p></div><div className="flex items-center gap-2 rounded-xl border border-[#dce7de] px-3 py-2"><Search className="h-4 w-4 text-[#819087]" /><input value={recordSearch} onChange={(event) => setRecordSearch(event.target.value)} placeholder="Search records…" className="w-44 bg-transparent text-xs outline-none" /></div></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead className="bg-[#f8faf8] text-[10px] uppercase tracking-[0.14em] text-[#819087]"><tr><th className="px-5 py-3 font-semibold">Student</th><th className="px-5 py-3 font-semibold">ID number</th><th className="px-5 py-3 font-semibold">Session</th><th className="px-5 py-3 font-semibold">Time</th><th className="px-5 py-3 text-right font-semibold">Status</th></tr></thead><tbody className="divide-y divide-[#edf1ed]">{filteredRecords.length ? filteredRecords.map((record) => <tr key={record.id}><td className="px-5 py-3.5 text-sm font-semibold text-[#355447]">{record.firstName} {record.lastName}</td><td className="px-5 py-3.5 text-xs text-[#587063]">{record.studentNumber}</td><td className="px-5 py-3.5"><span className="rounded-full bg-[#edf4ee] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#47735b]">{displaySession(record.session)}</span></td><td className="px-5 py-3.5 text-xs text-[#587063]">{formatTime(record.recordedAt)}</td><td className="px-5 py-3.5 text-right"><span className="inline-flex items-center gap-1 text-xs font-medium text-[#4f8a64]"><Check className="h-3.5 w-3.5" /> Recorded</span></td></tr>) : <tr><td colSpan={5} className="px-5 py-14 text-center text-sm text-[#819087]">No attendance records for this date.</td></tr>}</tbody></table></div></div></section>}

          {view === "imports" && <section className="animate-rise-in space-y-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-sm text-[#718076]">Upload an Excel workbook, review validation results, and import the roster.</p><h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#19362b]">Import students</h2></div><button onClick={() => { const csv = "ID NUMBER,NAME,LAST NAME,YEAR LEVEL\n2026-00006,Anna,Cruz,5\n"; const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "student-import-template.csv"; anchor.click(); URL.revokeObjectURL(url); }} className="flex items-center gap-2 text-xs font-semibold text-[#174a3a] hover:underline"><ArrowDownToLine className="h-4 w-4" /> Download template</button></div><label className="flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#b8d1bf] bg-[#f2f8f3] p-8 text-center transition hover:border-[#6da48a] hover:bg-[#edf5ef]"><Upload className="mb-3 h-8 w-8 text-[#4f8a64]" /><p className="text-sm font-semibold text-[#355447]">Choose an Excel file to upload</p><p className="mt-1 text-xs text-[#819087]">Supports .xlsx, .xls, and .csv · Required columns: ID NUMBER, NAME, LAST NAME, YEAR LEVEL</p><input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void parseImport(file); }} /></label>{importPreview.length > 0 && <div className="overflow-hidden rounded-2xl border border-[#dbe5dd] bg-white shadow-[0_10px_30px_rgba(28,66,47,0.05)]"><div className="flex flex-col justify-between gap-3 border-b border-[#edf1ed] px-5 py-4 sm:flex-row sm:items-center"><div><h3 className="text-sm font-semibold text-[#19362b]">Review import · {importFilename}</h3><p className="mt-1 text-xs text-[#819087]">{importPreview.length} student rows found. Invalid rows are kept for review.</p></div><button onClick={() => importMutation.mutate({ filename: importFilename, rows: importPreview })} disabled={importMutation.isPending} className="flex items-center justify-center gap-2 rounded-xl bg-[#174a3a] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"><Check className="h-4 w-4" /> {importMutation.isPending ? "Importing…" : "Complete import"}</button></div><div className="grid gap-3 border-b border-[#edf1ed] p-5 sm:grid-cols-4"><div className="rounded-xl bg-[#f7faf7] p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-[#819087]">Rows found</p><strong className="mt-1 block text-xl text-[#19362b]">{importPreview.length}</strong></div><div className="rounded-xl bg-[#f2f8f3] p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-[#819087]">Valid-looking</p><strong className="mt-1 block text-xl text-[#47735b]">{importPreview.filter((row) => row.studentId && row.firstName && row.lastName && row.yearLevel > 0).length}</strong></div><div className="rounded-xl bg-[#fff7ed] p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-[#819087]">Needs review</p><strong className="mt-1 block text-xl text-[#a06d3f]">{importPreview.filter((row) => !row.studentId || !row.firstName || !row.lastName || !row.yearLevel).length}</strong></div><div className="rounded-xl bg-[#f4f0ec] p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-[#819087]">Duplicates</p><strong className="mt-1 block text-xl text-[#765a43]">—</strong></div></div><div className="max-h-72 overflow-auto"><table className="w-full min-w-[580px] text-left"><thead className="sticky top-0 bg-[#f8faf8] text-[10px] uppercase tracking-[0.14em] text-[#819087]"><tr><th className="px-5 py-3 font-semibold">ID number</th><th className="px-5 py-3 font-semibold">Name</th><th className="px-5 py-3 font-semibold">Year</th><th className="px-5 py-3 text-right font-semibold">Validation</th></tr></thead><tbody className="divide-y divide-[#edf1ed]">{importPreview.map((row, index) => { const valid = row.studentId && row.firstName && row.lastName && row.yearLevel > 0; return <tr key={`${row.studentId}-${index}`}><td className="px-5 py-3 text-xs text-[#587063]">{row.studentId || "—"}</td><td className="px-5 py-3 text-xs font-medium text-[#355447]">{row.firstName} {row.lastName}</td><td className="px-5 py-3 text-xs text-[#587063]">{row.yearLevel || "—"}</td><td className="px-5 py-3 text-right">{valid ? <span className="text-xs font-medium text-[#4f8a64]">Ready</span> : <span className="text-xs font-medium text-[#b06e42]">Needs review</span>}</td></tr>; })}</tbody></table></div></div>}<div className="rounded-2xl border border-[#dbe5dd] bg-white shadow-[0_10px_30px_rgba(28,66,47,0.05)]"><div className="border-b border-[#edf1ed] px-5 py-4"><h3 className="text-sm font-semibold text-[#19362b]">Recent import history</h3><p className="mt-1 text-xs text-[#819087]">Validation summaries from the latest uploads.</p></div><div className="divide-y divide-[#edf1ed]">{imports.length ? imports.map((batch) => <div key={batch.id} className="flex flex-col justify-between gap-2 px-5 py-4 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><div className="rounded-xl bg-[#f2e8da] p-2 text-[#825938]"><FileSpreadsheet className="h-4 w-4" /></div><div><p className="text-sm font-semibold text-[#355447]">{batch.filename}</p><p className="mt-1 text-[11px] text-[#819087]">{batch.studentsFound} found · {batch.successfullyImported} imported · {batch.duplicates} duplicates · {batch.invalidRecords} invalid</p></div></div><span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${batch.status === "completed" ? "bg-[#edf4ee] text-[#47735b]" : "bg-[#fff3e4] text-[#a06d3f]"}`}>{batch.status}</span></div>) : <div className="px-5 py-10 text-center text-sm text-[#819087]">No imports yet. Upload a workbook to start your roster.</div>}</div></div></section>}
        </div>
      </main>
    </div>
  );
}
