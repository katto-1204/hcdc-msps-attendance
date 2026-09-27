import { LoadingModal } from "@/components/LoadingModal";
import { localApi } from "@/lib/local-api";
import { localStore } from "@/lib/local-store";
import { parseMasterlist, studentIssues, STUDENT_ID_PATTERN, type ImportRow } from "@/lib/student-import";
import { ImportStudentsPanel } from "@/components/ImportStudentsPanel";
import { TableSkeleton, ListSkeleton } from "@/components/LoadingSkeletons";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  Loader2,
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
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
  Trash2,
  ShieldCheck,
  Upload,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type View = "overview" | "students" | "records" | "imports";
type Session = "morning_in" | "morning_out" | "afternoon_in" | "afternoon_out";
type StudentForm = { studentId: string; firstName: string; lastName: string; yearLevel: string; barcode: string };

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const sessions: Array<{ key: Session; label: string; short: string; tint: string }> = [
  { key: "morning_in", label: "Morning In", short: "AM IN", tint: "#174a3a" },
  { key: "morning_out", label: "Morning Out", short: "AM OUT", tint: "#6d8c7c" },
  { key: "afternoon_in", label: "Afternoon In", short: "PM IN", tint: "#b07a45" },
  { key: "afternoon_out", label: "Afternoon Out", short: "PM OUT", tint: "#c7986c" },
];

const emptyStudent: StudentForm = { studentId: "", firstName: "", lastName: "", yearLevel: "", barcode: "" };

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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

function isValidStudentId(value: string) {
  return STUDENT_ID_PATTERN.test(value);
}

function StatCard({ label, value, accent, sublabel, loading }: { label: string; value: number; accent: string; sublabel: string; loading?: boolean }) {
  return (
    <div className="rounded-2xl border border-[#dbe5dd] bg-white p-5 shadow-[0_10px_30px_rgba(28,66,47,0.05)]">
      <div className="mb-6 flex items-start justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#718076]">{label}</span>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
      </div>
      <div className="flex items-end justify-between gap-3">
        {loading ? <Skeleton role="status" aria-label={`Loading ${label}`} className="h-9 w-20" /> : <strong className="text-3xl font-semibold tracking-[-0.04em] text-[#19362b]">{value}</strong>}
        <span className="pb-1 text-right text-xs text-[#819087]">{sublabel}</span>
      </div>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [date, setDate] = useState(todayString);
  const [session, setSession] = useState<Session>("morning_in");
  const [identifier, setIdentifier] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [recordSearch, setRecordSearch] = useState("");
  const [editingStudent, setEditingStudent] = useState<number | null>(null);
  const [studentForm, setStudentForm] = useState<StudentForm>(emptyStudent);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportRow[]>([]);
  const [importFilename, setImportFilename] = useState("");
  const [parsingImport, setParsingImport] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const dashboardInput = useMemo(() => ({ date }), [date]);
  const studentsInput = useMemo(() => ({ query: studentSearch || undefined }), [studentSearch]);
  const { data: dashboard, isLoading: dashboardLoading } = localApi.dashboard.byDate.useQuery(dashboardInput);
  const { data: students = [], isLoading: studentsLoading } = localApi.students.list.useQuery(studentsInput);
  const { data: imports = [], isLoading: importsLoading } = localApi.imports.history.useQuery();
  const { data: masterlists = [], isLoading: masterlistsLoading } = localApi.imports.masterlists.useQuery();
  const utils = localApi.useUtils();

  const recordMutation = localApi.attendance.record.useMutation({
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
  const mutationError = (action: string) => (error: { message: string }) => toast.error(action, { description: error.message });
  const createMutation = localApi.students.create.useMutation({ onSuccess: async () => { toast.success("Student added"); setStudentForm(emptyStudent); setShowStudentForm(false); await utils.students.list.invalidate(); }, onError: mutationError("Could not add student") });
  const updateMutation = localApi.students.update.useMutation({ onSuccess: async () => { toast.success("Student updated"); setEditingStudent(null); setStudentForm(emptyStudent); setShowStudentForm(false); await utils.students.list.invalidate(); }, onError: mutationError("Could not update student") });
  const archiveMutation = localApi.students.archive.useMutation({ onSuccess: async () => { toast.success("Student archived"); await utils.students.list.invalidate(); }, onError: mutationError("Could not archive student") });
  const importMutation = localApi.imports.students.useMutation({ onSuccess: async (result) => { toast.success("Import complete", { description: `${result.successfullyImported} students added to the directory. ${result.rejectedRows} rows skipped; download their reasons from Import students.` }); setImportPreview([]); setImportFilename(""); setStudentSearch(""); if (result.successfullyImported > 0) setView("students"); await Promise.all([utils.students.list.invalidate(), utils.imports.history.invalidate(), utils.imports.masterlists.invalidate()]); }, onError: mutationError("Could not import students") });
  const resetRosterMutation = localApi.imports.resetRoster.useMutation({ onSuccess: async () => { toast.success("Current roster cleared", { description: "The masterlist history was preserved for reference." }); setShowResetModal(false); await Promise.all([utils.students.list.invalidate(), utils.dashboard.byDate.invalidate(), utils.imports.masterlists.invalidate()]); }, onError: mutationError("Could not clear roster") });
  const csvQuery = localApi.attendance.csv.useQuery(dashboardInput, { enabled: false });

  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const clearPrompt = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", clearPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", clearPrompt);
    };
  }, []);

  const openStudentForm = () => {
    setView("students");
    setEditingStudent(null);
    setStudentForm(emptyStudent);
    setShowStudentForm(true);
  };

  const installApp = async () => {
    if (!installPrompt) {
      toast.info("Install this app", { description: "Chrome / Edge: browser menu → Install app. iPhone / iPad: Safari → Share → Add to Home Screen. Use the production app on HTTPS or localhost." });
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const handleRecord = (event: FormEvent) => {
    event.preventDefault();
    if (!identifier.trim() || recordMutation.isPending) return;
    recordMutation.mutate({ identifier: identifier.trim(), session, date });
  };

  const startEdit = (student: (typeof students)[number]) => {
    setEditingStudent(student.id);
    setShowStudentForm(true);
    setStudentForm({ studentId: student.studentId, firstName: student.firstName, lastName: student.lastName, yearLevel: student.yearLevel == null ? "" : String(student.yearLevel), barcode: student.barcode || "" });
  };

  const saveStudent = (event: FormEvent) => {
    event.preventDefault();
    const input = { studentId: studentForm.studentId.trim(), firstName: studentForm.firstName.trim(), lastName: studentForm.lastName.trim(), yearLevel: studentForm.yearLevel.trim() ? Number(studentForm.yearLevel) : null, barcode: studentForm.barcode.trim() || undefined };
    if (!input.studentId || (!input.firstName && !input.lastName)) { toast.error("Complete all required student fields"); return; }
    if (!isValidStudentId(input.studentId)) { toast.error("Invalid student ID", { description: "Use the ID from the masterlist, without spaces. Any prefix is accepted." }); return; }
    if (input.yearLevel !== null && (!Number.isInteger(input.yearLevel) || input.yearLevel < 1 || input.yearLevel > 12)) { toast.error("Invalid year level", { description: "Year level must be blank or a whole number from 1 to 12." }); return; }
    if (editingStudent) updateMutation.mutate({ id: editingStudent, ...input }); else createMutation.mutate(input);
  };

  const parseImport = async (file: File) => {
    setParsingImport(true);
    setImportPreview([]);
    setImportFilename("");
    try {
      const xlsxMod = await import("xlsx");
      // In Vite's CJS→ESM transform the library may land on .default; fall back to the namespace.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const XLSX = (xlsxMod as any).default ?? xlsxMod;
      const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
      const parsed = parseMasterlist(workbook);
      if (!parsed.rows.length) throw new Error("No student rows were found.");
      setImportFilename(file.name);
      setImportPreview(parsed.rows);
      toast.success(`${parsed.rows.length} student rows ready for review`, { description: `${parsed.sheetName}: ${parsed.rows.filter(row => !studentIssues(row).length).length} valid. ${parsed.ignoredFooterRows} footer rows ignored.` });
    } catch (error) { toast.error("Could not read this spreadsheet", { description: (error as Error).message }); }
    finally { setParsingImport(false); }
  };

  const exportExcel = async () => {
    setIsExporting(true);
    try {
      const records = dashboard?.records || [];
      const xlsxMod = await import("xlsx");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const XLSX = (xlsxMod as any).default ?? xlsxMod;

      const header = ["Date", "Time", "ID Number", "Student Name", "Year Level", "Session"];
      const dataRows = records.map((row) => [
        row.attendanceDate,
        formatTime(row.recordedAt),
        row.studentNumber,
        `${row.firstName} ${row.lastName}`,
        row.yearLevel != null ? `Year ${row.yearLevel}` : "N/A",
        displaySession(row.session),
      ]);

      const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);

      // Set explicit auto-fit column widths so no ### date truncation or clipped names occur
      ws["!cols"] = [
        { wch: 16 }, // Date
        { wch: 16 }, // Time
        { wch: 18 }, // ID Number
        { wch: 32 }, // Student Name
        { wch: 14 }, // Year Level
        { wch: 18 }, // Session
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Attendance Register");

      XLSX.writeFile(wb, `HCDC-MSPS-Attendance-${date}.xlsx`);
      toast.success("Excel sheet exported!", { description: `Exported ${records.length} formatted records to Excel (.xlsx).` });
    } catch (err) {
      toast.error("Export failed", { description: String(err) });
    } finally {
      setIsExporting(false);
    }
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const data = await localStore.backup();
      const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `msps-backup-${todayString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error("Backup failed", { description: String(error) });
    } finally {
      setIsBackingUp(false);
    }
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
          <img src="/hcdc-msps-logo.png" alt="HCDC-MSPS logo" className="h-12 w-12 shrink-0 object-contain" />
          <div><div className="text-sm font-bold tracking-tight">HCDC-MSPS</div><div className="text-[11px] text-[#b8d1bf]">Attendance system</div></div>
          <button className="ml-auto rounded-lg p-1 text-[#b8d1bf] lg:hidden" onClick={() => setMobileMenu(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-4 pt-8"><div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#8fb39c]">Workspace</div>{navItems.map((item) => { const Icon = item.icon; return <button key={item.key} onClick={() => { setView(item.key); setMobileMenu(false); }} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] font-medium ${view === item.key ? "bg-[#d8ebdd] text-[#174a3a] shadow-sm" : "text-[#d1e3d5] hover:bg-white/10"}`}><Icon className="h-[17px] w-[17px]" /><span>{item.label}</span>{view === item.key && <ArrowRight className="ml-auto h-4 w-4" />}</button>; })}</div>
        <div className="mt-auto border-t border-white/10 p-4"><div className="rounded-xl bg-white/[0.06] p-3"><div className="text-xs font-semibold">MSPS ADMIN</div><div className="mt-1 text-[11px] text-[#a7c4af]">Offline · Saved on this device</div><button onClick={handleBackup} className="mt-3 text-xs underline">Download data backup</button></div></div>
      </aside>

      <main className="min-h-screen lg:pl-[248px]">
        <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-[#e0e9e1]/80 bg-[#f7f9f7]/90 px-5 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3"><button className="rounded-lg p-2 text-[#355b49] lg:hidden" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button><div><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#819087]">HCDC • MSPS</p><h1 className="text-lg font-semibold tracking-[-0.03em] text-[#19362b]">{view === "overview" ? "Daily attendance" : navItems.find((item) => item.key === view)?.label}</h1></div></div>
          <div className="flex items-center gap-2 sm:gap-3">{<button onClick={installApp} className="flex h-9 items-center gap-2 rounded-xl border border-[#cbdccf] bg-white px-3 text-xs font-semibold text-[#174a3a] hover:bg-[#edf4ee]" title="Install HCDC-MSPS Attendance"><ArrowDownToLine className="h-4 w-4" /> <span className="hidden md:inline">Install app</span></button>}<div className="hidden items-center gap-2 rounded-xl border border-[#dce7de] bg-white px-3 py-2 text-xs text-[#607368] sm:flex"><Clock3 className="h-4 w-4 text-[#6d8c7c]" /> {formatDate(date)}</div><button onClick={openStudentForm} className="flex h-9 items-center gap-2 rounded-xl bg-[#174a3a] px-3 text-xs font-semibold text-white shadow-[0_5px_12px_rgba(23,74,58,0.18)] hover:bg-[#0f3c2e]"><Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add student</span></button></div>
        </header>

        <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8">
          {view === "overview" && <section className="animate-rise-in space-y-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-sm text-[#718076]">Keep the flow moving. Every scan updates the live register.</p><h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#19362b] sm:text-[28px]">Good day, MSPS ADMIN.</h2></div><label className="flex items-center gap-2 rounded-xl border border-[#dce7de] bg-white px-3 py-2 text-xs font-medium text-[#607368]">View date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="border-0 bg-transparent text-xs font-semibold text-[#19362b] outline-none" /></label></div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard loading={dashboardLoading} label="Morning in" value={dashboard?.counts.morning_in || 0} accent="#174a3a" sublabel="students recorded" /><StatCard loading={dashboardLoading} label="Morning out" value={dashboard?.counts.morning_out || 0} accent="#6d8c7c" sublabel="students recorded" /><StatCard loading={dashboardLoading} label="Afternoon in" value={dashboard?.counts.afternoon_in || 0} accent="#b07a45" sublabel="students recorded" /><StatCard loading={dashboardLoading} label="Afternoon out" value={dashboard?.counts.afternoon_out || 0} accent="#c7986c" sublabel="students recorded" /></div>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_370px]">
              <div className="rounded-2xl border border-[#dbe5dd] bg-white p-5 shadow-[0_10px_30px_rgba(28,66,47,0.05)] sm:p-6"><div className="mb-5 flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#55a875]" /><h3 className="text-base font-semibold text-[#19362b]">Live activity</h3></div><p className="mt-1 text-xs text-[#819087]">Latest scans for {formatDate(date)}</p></div><button onClick={() => setView("records")} className="flex items-center gap-1 text-xs font-semibold text-[#174a3a] hover:underline">View all <ArrowRight className="h-3.5 w-3.5" /></button></div>{dashboardLoading ? <ListSkeleton /> : dashboard?.records.length ? <div className="divide-y divide-[#edf1ed]">{dashboard.records.slice(0, 6).map((record) => <div key={record.id} className="flex items-center justify-between gap-3 py-3 first:pt-0"><div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#edf4ee] text-xs font-bold text-[#174a3a]">{record.firstName.slice(0, 1)}{record.lastName.slice(0, 1)}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#254338]">{record.firstName} {record.lastName}</p><p className="text-[11px] text-[#819087]">{record.studentNumber} · Year {record.yearLevel}</p></div></div><div className="text-right"><p className="text-xs font-semibold text-[#355b49]">{formatTime(record.recordedAt)}</p><p className="text-[10px] uppercase tracking-[0.12em] text-[#9aa99e]">{displaySession(record.session)}</p></div></div>)}</div> : <div className="flex h-44 flex-col items-center justify-center rounded-xl bg-[#f7faf7] text-center"><Activity className="mb-2 h-6 w-6 text-[#9db4a5]" /><p className="text-sm font-medium text-[#587063]">No scans yet</p><p className="mt-1 text-xs text-[#8b9d91]">Recorded attendance will appear here.</p></div>}</div>
              <div className="rounded-2xl bg-[#174a3a] p-5 text-white shadow-[0_18px_35px_rgba(23,74,58,0.22)] sm:p-6"><div className="mb-6 flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#a8c8b1]">Quick capture</p><h3 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Record attendance</h3></div><div className="rounded-xl bg-white/10 p-2"><QrCode className="h-5 w-5 text-[#d8ebdd]" /></div></div><form onSubmit={handleRecord}><div className="mb-3 flex items-center justify-between"><label className="text-xs font-medium text-[#c4ddca]" htmlFor="student-id">ID number or barcode</label><span className="text-[10px] text-[#9fc2a9]">USB scanner ready</span></div><div className="flex rounded-xl bg-white p-1.5"><input ref={inputRef} id="student-id" autoFocus value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Type or scan ID…" className="min-w-0 flex-1 rounded-lg border-0 px-3 py-2.5 text-sm text-[#19362b] outline-none placeholder:text-[#9aa99e]" /><button disabled={recordMutation.isPending} className="rounded-lg bg-[#d8ebdd] px-3 text-[#174a3a] hover:bg-white disabled:cursor-wait disabled:opacity-70" type="submit">{recordMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}</button></div><p className="mt-2 text-[10px] text-[#a8c8b1]">Press Enter after typing. Barcode scanners submit automatically.</p></form><div className="mt-7"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium text-[#c4ddca]">Active session</span><span className="text-[10px] uppercase tracking-[0.12em] text-[#a8c8b1]">Today</span></div><div className="grid grid-cols-2 gap-2">{sessions.map((item) => <button key={item.key} onClick={() => setSession(item.key)} className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${session === item.key ? "border-[#d8ebdd] bg-[#d8ebdd] text-[#174a3a]" : "border-white/15 bg-white/[0.06] text-[#c4ddca] hover:bg-white/10"}`}><span className="block text-[10px] font-bold uppercase tracking-[0.13em] opacity-70">{item.short}</span><span className="mt-1 block text-xs font-semibold">{item.label.replace("Morning ", "").replace("Afternoon ", "")}</span></button>)}</div></div><div className="mt-7 flex items-center justify-between border-t border-white/10 pt-4"><span className="text-xs text-[#a8c8b1]">Active now</span><span className="flex items-center gap-2 text-xs font-semibold text-[#d8ebdd]"><span className="h-2 w-2 rounded-full bg-[#8fd7a2]" /> {currentSession.label}</span></div></div>
            </div>
            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-[#e5dacd] bg-[#f2e8da] p-5 sm:flex-row sm:items-center sm:p-6"><div className="flex items-start gap-3"><div className="rounded-xl bg-[#e4cdb4] p-2.5 text-[#825938]"><BarChart3 className="h-5 w-5" /></div><div><h3 className="text-sm font-semibold text-[#4b382b]">Daily register</h3><p className="mt-1 text-xs text-[#796653]">{dashboard?.totalStudents || 0} active students in the roster · {dashboard?.records.length || 0} records today</p></div></div><button onClick={exportExcel} className="flex items-center justify-center gap-2 rounded-xl bg-[#fffaf4] px-4 py-2.5 text-xs font-semibold text-[#6b4b33] shadow-sm hover:bg-white"><ArrowDownToLine className="h-4 w-4" /> Export Excel (.xlsx)</button></div>
          </section>}

          {view === "students" && <section className="animate-rise-in space-y-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-sm text-[#718076]">Add, update, or archive the active student roster.</p><h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#19362b]">Student directory</h2></div><div className="flex gap-2"><div className="flex items-center gap-2 rounded-xl border border-[#dce7de] bg-white px-3 py-2"><Search className="h-4 w-4 text-[#819087]" /><input value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Search students…" className="w-36 bg-transparent text-xs outline-none placeholder:text-[#9aa99e] sm:w-48" /></div><button onClick={() => { setEditingStudent(null); setStudentForm(emptyStudent); setShowStudentForm(!showStudentForm); }} className="flex items-center gap-2 rounded-xl bg-[#174a3a] px-3 py-2 text-xs font-semibold text-white"><Plus className="h-4 w-4" /> New student</button></div></div>{showStudentForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#123d30]/45 p-4 backdrop-blur-sm"><form onSubmit={saveStudent} className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-[#dbe5dd] bg-white p-5 shadow-[0_24px_70px_rgba(18,61,48,0.28)] sm:p-6"><div className="mb-4 flex items-center justify-between"><div><h3 className="text-sm font-semibold text-[#19362b]">{editingStudent ? "Edit student" : "Add student"}</h3><p className="mt-1 text-xs text-[#819087]">Required fields are used for lookup and reporting.</p></div><button type="button" onClick={() => setShowStudentForm(false)} className="rounded-lg p-1 text-[#819087] hover:bg-[#f0f5f1]"><X className="h-4 w-4" /></button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><label className="text-xs font-medium text-[#587063]">ID number<input value={studentForm.studentId} onChange={(event) => setStudentForm({ ...studentForm, studentId: event.target.value })} className="mt-1.5 w-full rounded-lg border border-[#dbe5dd] px-3 py-2.5 text-sm outline-none focus:border-[#6da48a]" placeholder="54800001" /></label><label className="text-xs font-medium text-[#587063]">First name<input value={studentForm.firstName} onChange={(event) => setStudentForm({ ...studentForm, firstName: event.target.value })} className="mt-1.5 w-full rounded-lg border border-[#dbe5dd] px-3 py-2.5 text-sm outline-none focus:border-[#6da48a]" placeholder="Catherine" /></label><label className="text-xs font-medium text-[#587063]">Last name<input value={studentForm.lastName} onChange={(event) => setStudentForm({ ...studentForm, lastName: event.target.value })} className="mt-1.5 w-full rounded-lg border border-[#dbe5dd] px-3 py-2.5 text-sm outline-none focus:border-[#6da48a]" placeholder="Arnado" /></label><label className="text-xs font-medium text-[#587063]">Year level<input type="number" min="1" max="12" value={studentForm.yearLevel} onChange={(event) => setStudentForm({ ...studentForm, yearLevel: event.target.value })} className="mt-1.5 w-full rounded-lg border border-[#dbe5dd] px-3 py-2.5 text-sm outline-none focus:border-[#6da48a]" placeholder="4" /></label><label className="text-xs font-medium text-[#587063]">Barcode <span className="font-normal text-[#9aa99e]">(optional)</span><input value={studentForm.barcode} onChange={(event) => setStudentForm({ ...studentForm, barcode: event.target.value })} className="mt-1.5 w-full rounded-lg border border-[#dbe5dd] px-3 py-2.5 text-sm outline-none focus:border-[#6da48a]" placeholder="Auto-generated" /></label></div><div className="mt-4 flex justify-end"><button disabled={createMutation.isPending || updateMutation.isPending} className="flex items-center gap-2 rounded-xl bg-[#174a3a] px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-70" type="submit">{createMutation.isPending || updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {createMutation.isPending || updateMutation.isPending ? "Saving…" : "Save student"}</button></div></form></div>}<div className="overflow-hidden rounded-2xl border border-[#dbe5dd] bg-white shadow-[0_10px_30px_rgba(28,66,47,0.05)]"><div className="flex items-center justify-between border-b border-[#edf1ed] px-5 py-4"><div><h3 className="text-sm font-semibold text-[#19362b]">Active roster</h3><p className="mt-1 text-xs text-[#819087]">{students.length} students shown</p></div><span className="rounded-full bg-[#edf4ee] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#47735b]">Live</span></div><div className="overflow-x-auto"><table className="w-full min-w-[1300px] text-left"><thead className="bg-[#f8faf8] text-[10px] uppercase tracking-[0.14em] text-[#819087]"><tr><th className="px-5 py-3 font-semibold">Control No.</th><th className="px-5 py-3 font-semibold">Student</th><th className="px-5 py-3 font-semibold">ID number</th><th className="px-5 py-3 font-semibold">HCDC email</th><th className="px-5 py-3 font-semibold">Program</th><th className="px-5 py-3 font-semibold">Year level</th><th className="px-5 py-3 font-semibold">Barcode</th><th className="px-5 py-3 text-right font-semibold">Actions</th></tr></thead><tbody className="divide-y divide-[#edf1ed]">{studentsLoading ? <TableSkeleton columns={8} /> : students.length ? students.map((student) => <tr key={student.id} className="hover:bg-[#fbfdfb]"><td className="px-5 py-3.5 text-xs">{student.controlNo || "—"}</td><td className="px-5 py-3.5"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e8f1ea] text-[10px] font-bold text-[#174a3a]">{student.firstName[0]}{student.lastName[0]}</div><div><p className="text-sm font-semibold text-[#355447]">{student.firstName} {student.lastName}</p><p className="text-[11px] text-[#9aa99e]">Active student</p></div></div></td><td className="px-5 py-3.5 text-xs font-medium text-[#587063]">{student.studentId}</td><td className="px-5 py-3.5 text-xs">{student.email || "—"}</td><td className="min-w-64 px-5 py-3.5 text-xs">{student.program || "—"}</td><td className="px-5 py-3.5 text-xs text-[#587063]">{student.yearLevel == null ? "Not provided" : `Year ${student.yearLevel}`}</td><td className="px-5 py-3.5 font-mono text-[11px] text-[#819087]">{student.barcode || "—"}</td><td className="px-5 py-3.5"><div className="flex justify-end gap-1"><button onClick={() => startEdit(student)} className="rounded-lg p-2 text-[#6d8c7c] hover:bg-[#edf4ee]" title="Edit student"><Pencil className="h-4 w-4" /></button><button onClick={() => archiveMutation.mutate({ id: student.id })} className="rounded-lg p-2 text-[#a56e62] hover:bg-[#fff0ed]" title="Archive student"><Archive className="h-4 w-4" /></button></div></td></tr>) : <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-[#819087]">No students match that search.</td></tr>}</tbody></table></div></div></section>}

          {view === "records" && <section className="animate-rise-in space-y-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-sm text-[#718076]">Review, search, and export attendance records by day.</p><h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#19362b]">Attendance register</h2></div><div className="flex flex-wrap gap-2"><label className="flex items-center gap-2 rounded-xl border border-[#dce7de] bg-white px-3 py-2 text-xs font-medium text-[#607368]">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="border-0 bg-transparent text-xs font-semibold text-[#19362b] outline-none" /></label><button onClick={exportExcel} className="flex items-center gap-2 rounded-xl bg-[#174a3a] px-3 py-2 text-xs font-semibold text-white"><ArrowDownToLine className="h-4 w-4" /> Export Excel (.xlsx)</button></div></div><div className="grid gap-4 sm:grid-cols-4"><StatCard loading={dashboardLoading} label="All records" value={dashboard?.records.length || 0} accent="#174a3a" sublabel="for selected date" /><StatCard loading={dashboardLoading} label="Morning in" value={dashboard?.counts.morning_in || 0} accent="#174a3a" sublabel="students recorded" /><StatCard loading={dashboardLoading} label="Morning out" value={dashboard?.counts.morning_out || 0} accent="#6d8c7c" sublabel="students recorded" /><StatCard loading={dashboardLoading} label="Afternoon" value={(dashboard?.counts.afternoon_in || 0) + (dashboard?.counts.afternoon_out || 0)} accent="#b07a45" sublabel="combined records" /></div><div className="overflow-hidden rounded-2xl border border-[#dbe5dd] bg-white shadow-[0_10px_30px_rgba(28,66,47,0.05)]"><div className="flex flex-col justify-between gap-3 border-b border-[#edf1ed] px-5 py-4 sm:flex-row sm:items-center"><div><h3 className="text-sm font-semibold text-[#19362b]">{formatDate(date)}</h3><p className="mt-1 text-xs text-[#819087]">Every record is protected against duplicate session entries.</p></div><div className="flex items-center gap-2 rounded-xl border border-[#dce7de] px-3 py-2"><Search className="h-4 w-4 text-[#819087]" /><input value={recordSearch} onChange={(event) => setRecordSearch(event.target.value)} placeholder="Search records…" className="w-44 bg-transparent text-xs outline-none" /></div></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead className="bg-[#f8faf8] text-[10px] uppercase tracking-[0.14em] text-[#819087]"><tr><th className="px-5 py-3 font-semibold">Student</th><th className="px-5 py-3 font-semibold">ID number</th><th className="px-5 py-3 font-semibold">Session</th><th className="px-5 py-3 font-semibold">Time</th><th className="px-5 py-3 text-right font-semibold">Status</th></tr></thead><tbody className="divide-y divide-[#edf1ed]">{dashboardLoading ? <TableSkeleton columns={5} /> : filteredRecords.length ? filteredRecords.map((record) => <tr key={record.id}><td className="px-5 py-3.5 text-sm font-semibold text-[#355447]">{record.firstName} {record.lastName}</td><td className="px-5 py-3.5 text-xs text-[#587063]">{record.studentNumber}</td><td className="px-5 py-3.5"><span className="rounded-full bg-[#edf4ee] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#47735b]">{displaySession(record.session)}</span></td><td className="px-5 py-3.5 text-xs text-[#587063]">{formatTime(record.recordedAt)}</td><td className="px-5 py-3.5 text-right"><span className="inline-flex items-center gap-1 text-xs font-medium text-[#4f8a64]"><Check className="h-3.5 w-3.5" /> Recorded</span></td></tr>) : <tr><td colSpan={5} className="px-5 py-14 text-center text-sm text-[#819087]">No attendance records for this date.</td></tr>}</tbody></table></div></div></section>}          {view === "imports" && <ImportStudentsPanel rows={importPreview} filename={importFilename} parsing={parsingImport} importing={importMutation.isPending} onFile={parseImport} onImport={() => importMutation.mutate({ filename: importFilename, rows: importPreview })} onReset={() => setShowResetModal(true)} imports={imports} masterlists={masterlists} loadingHistory={importsLoading} loadingMasterlists={masterlistsLoading} />}
        </div>
      {showResetModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#123d30]/45 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby="clear-roster-title" className="w-full max-w-md rounded-2xl border border-[#eadbd0] bg-white p-6 shadow-[0_24px_70px_rgba(18,61,48,0.28)]"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#fff1eb] text-[#b05d4d]"><AlertTriangle className="h-5 w-5" /></div><h2 id="clear-roster-title" className="text-lg font-semibold tracking-[-0.03em] text-[#19362b]">Clear current roster?</h2><p className="mt-2 text-sm leading-6 text-[#718076]">This removes the current students and attendance records. Masterlist history stays available so another roster can be tested safely.</p><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setShowResetModal(false)} className="rounded-xl border border-[#dbe5dd] px-4 py-2.5 text-xs font-semibold text-[#587063] hover:bg-[#f7faf7]">Cancel</button><button type="button" disabled={resetRosterMutation.isPending} onClick={() => resetRosterMutation.mutate({ confirmation: "CLEAR CURRENT ROSTER" })} className="flex items-center gap-2 rounded-xl bg-[#a35d4e] px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60">{resetRosterMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {resetRosterMutation.isPending ? "Clearing…" : "Clear roster"}</button></div></div></div>}

        <LoadingModal
          isOpen={parsingImport}
          title="Reading Spreadsheet..."
          description="Parsing student rows and detecting column headers. Please wait."
        />
        <LoadingModal
          isOpen={importMutation.isPending}
          title="Importing Students..."
          description="Saving student records into the local database. Please do not close or refresh this page."
        />
        <LoadingModal
          isOpen={resetRosterMutation.isPending}
          title="Clearing Roster..."
          description="Removing student records and resetting the active roster. Please wait."
        />
        <LoadingModal
          isOpen={isExporting}
          title="Exporting Attendance..."
          description="Generating your CSV report. Download will start shortly."
        />
        <LoadingModal
          isOpen={isBackingUp}
          title="Creating Backup..."
          description="Exporting system data. Your download will start automatically."
        />
      </main>
    </div>
  );
}
