import { ArrowDownToLine, Loader2, Trash2, Upload } from "lucide-react";
import { ListSkeleton } from "./LoadingSkeletons";
import { MASTERLIST_HEADERS, rejectedRowsCsv, studentIssues, type ImportRow, type RejectedRow } from "@/lib/student-import";
type Batch = { id: number; filename: string; studentsFound: number; successfullyImported: number; duplicates: number; invalidRecords: number; rejectedDetails?: RejectedRow[] };
type Masterlist = { id: number; filename: string; totalRows: number; importedRows: number; rejectedRows: number; duplicateRows: number; status: string };
export function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ImportStudentsPanel(props: {
  rows: ImportRow[]; filename: string; parsing: boolean; importing: boolean;
  onFile: (file: File) => void; onImport: () => void; onReset: () => void;
  imports: Batch[]; masterlists: Masterlist[]; loadingHistory: boolean; loadingMasterlists: boolean;
}) {
  const { rows, filename, parsing, importing } = props;
  const issues = rows.map(studentIssues);
  const duplicateIds = new Set<string>();
  const seen = new Set<string>();
  rows.forEach(row => { if (seen.has(row.studentId)) duplicateIds.add(row.studentId); seen.add(row.studentId); });
  const report = (batch: Batch) => downloadText(rejectedRowsCsv(batch.rejectedDetails ?? []), `${batch.filename.replace(/\.[^.]+$/, "")}-rejected-rows.csv`);
  return <section className="animate-rise-in space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-sm text-[#718076]">Import the eight-column masterlist. IDs are kept as supplied, with no prefix restriction.</p><h2 className="text-2xl font-semibold text-[#19362b]">Import students</h2></div>
      <button onClick={() => downloadText(MASTERLIST_HEADERS.join(",") + "\n1,59800001,Anna,Cruz,,anna@hcdc.edu.ph,BSIT,1\n", "student-import-template.csv")} className="flex items-center gap-2 text-xs font-semibold text-[#174a3a]"><ArrowDownToLine className="h-4 w-4" />Download template</button>
      <button onClick={props.onReset} disabled={importing || parsing} className="flex items-center gap-2 text-xs text-[#a35d4e]"><Trash2 className="h-4 w-4" />Clear current roster</button>
    </div>
    <label className="flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[#b8d1bf] bg-[#f2f8f3] p-6 text-center">
      {parsing ? <Loader2 className="h-8 w-8 animate-spin" /> : <Upload className="h-8 w-8 text-[#4f8a64]" />}
      <span className="text-sm font-semibold">{parsing ? "Reading masterlist…" : "Choose an Excel or CSV masterlist"}</span>
      <span className="text-xs text-[#718076]">{MASTERLIST_HEADERS.join(" · ")}</span>
      <span className="text-xs text-[#718076]">Blank optional details are accepted. The first worksheet with matching headers is used; footer notes are ignored.</span>
      <input aria-label="Choose masterlist file" disabled={parsing || importing} type="file" accept=".xlsx,.xls,.csv" className="max-w-full text-xs" onChange={e => { const file = e.target.files?.[0]; if (file) props.onFile(file); e.target.value = ""; }} />
    </label>
    {parsing && <ListSkeleton />}
    {!!rows.length && <div className="overflow-hidden rounded-2xl border border-[#dbe5dd] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5"><div><h3 className="font-semibold">Review import · {filename}</h3><p className="mt-1 text-xs text-[#718076]">{rows.length} total rows · {issues.filter(i => !i.length).length} valid · {issues.filter(i => i.length).length} need correction · {duplicateIds.size} repeated IDs</p><p className="mt-1 text-xs text-[#718076]">Duplicates are checked against the directory when saving. Rejected rows remain downloadable in import history.</p></div><button disabled={importing || parsing} onClick={props.onImport} className="flex items-center gap-2 rounded-xl bg-[#174a3a] px-4 py-3 text-xs font-semibold text-white disabled:opacity-50">{importing && <Loader2 className="h-4 w-4 animate-spin" />}{importing ? `Saving ${rows.length} students…` : `Complete import (${rows.length} students)`}</button></div>
      <div className="max-h-96 overflow-auto"><table className="w-full min-w-[1500px] text-left text-xs"><thead className="sticky top-0 bg-[#f2f8f3]"><tr>{["Excel row", ...MASTERLIST_HEADERS, "Validation"].map(h => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-[#edf1ed]">{rows.map((row, i) => <tr key={`${row.sourceRow}-${i}`}>{[row.sourceRow, row.controlNo, row.studentId, row.firstName, row.lastName, row.middleName, row.email, row.program, row.rawYearLevel ?? row.yearLevel].map((value, j) => <td key={j} className="px-4 py-3">{value ?? "—"}</td>)}<td className="min-w-64 px-4 py-3 text-[#825938]">{issues[i].join(" ") || (duplicateIds.has(row.studentId) ? "Repeated ID — one entry will be kept" : "Ready")}</td></tr>)}</tbody></table></div>
      <p className="p-4 text-xs font-semibold text-[#174a3a] bg-[#edf4ee]">All {rows.length} rows loaded. Clicking "Complete import" will save every row into your student directory.</p>
    </div>}
    <div className="rounded-2xl border border-[#dbe5dd] bg-white"><h3 className="border-b border-[#edf1ed] p-5 text-sm font-semibold">Import history and rejected-row reports</h3>{props.loadingHistory ? <ListSkeleton /> : props.imports.length ? props.imports.map(batch => <div key={batch.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1ed] p-5"><div><p className="text-sm font-semibold">{batch.filename}</p><p className="mt-1 text-xs text-[#718076]">{batch.studentsFound} found · {batch.successfullyImported} imported · {batch.duplicates} duplicates skipped · {batch.invalidRecords} invalid</p>{!batch.rejectedDetails && (batch.invalidRecords > 0 || batch.duplicates > 0) && <p className="mt-1 text-xs text-[#825938]">This older import has no row report. Re-import the source file to generate one.</p>}</div>{!!batch.rejectedDetails?.length && <button onClick={() => report(batch)} className="flex items-center gap-2 rounded-lg border border-[#dbe5dd] px-3 py-2 text-xs font-semibold"><ArrowDownToLine className="h-4 w-4" />Download rejected rows ({batch.rejectedDetails.length})</button>}</div>) : <p className="p-8 text-center text-sm text-[#819087]">No imports yet.</p>}</div>
    <div className="rounded-2xl border border-[#dbe5dd] bg-white"><h3 className="border-b border-[#edf1ed] p-5 text-sm font-semibold">Masterlist history</h3>{props.loadingMasterlists ? <ListSkeleton /> : props.masterlists.length ? props.masterlists.map(m => <div key={m.id} className="flex justify-between gap-3 border-b border-[#edf1ed] p-5 text-xs"><div><p className="font-semibold">{m.filename}</p><p className="mt-1 text-[#718076]">{m.totalRows} rows · {m.importedRows} imported · {m.rejectedRows} invalid · {m.duplicateRows} duplicates</p></div><span>{m.status}</span></div>) : <p className="p-8 text-center text-sm text-[#819087]">No masterlists uploaded yet.</p>}</div>
  </section>;
}
