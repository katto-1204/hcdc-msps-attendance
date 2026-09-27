import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import * as XLSX from "xlsx";
import { existsSync, readFileSync } from "node:fs";
import { MASTERLIST_HEADERS, parseMasterlist, rejectedRowsCsv } from "../client/src/lib/student-import";
import { localStore } from "../client/src/lib/local-store";
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
function workbook(rows: unknown[][]) {
  const sheet = XLSX.utils.aoa_to_sheet([MASTERLIST_HEADERS, ...rows]);
  sheet["!ref"] = "A1:XFD1273";
  return { SheetNames: ["Masterlist"], Sheets: { Masterlist: sheet } };
}
describe("masterlist format", () => {
  it("ignores inflated used ranges and footer notes, preserves IDs and optional blanks", async () => {
    const parsed = parseMasterlist(workbook([
      [1, "59800001", "Anna", "Cruz", "", "", "BSIT", ""],
      [2, "48400001", "", "Reyes", "", "", "", 4],
      [3, "00123456", "Maria", "Garcia", "", "", "BSCS", "1st Year"],
      ["nothing follows"], ["Prepared by:"],
    ]));
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.ignoredFooterRows).toBe(2);
    const result = await localStore.importStudents({ filename: "test.xlsx", rows: parsed.rows });
    expect(result.successfullyImported).toBe(3);
    expect(result.rejectedDetails).toHaveLength(0);
    expect(await localStore.list({ query: "BSIT" })).toMatchObject([{ studentId: "59800001", yearLevel: null, middleName: "" }]);
    expect(await localStore.list({ query: "00123456" })).toHaveLength(1);
    expect((await localStore.list()).length).toBe(result.successfullyImported);
  });
  it("stores actionable reports with original row numbers and values across reloads", async () => {
    const parsed = parseMasterlist(workbook([
      [1, "59800001", "Anna", "Cruz", "", "", "BSIT", 1],
      [2, "59800001", "Anna", "Cruz", "", "", "BSIT", 1],
      [3, "", "Missing", "ID", "", "", "", ""],
      [4, "59600001", "Bad", "Year", "", "", "", "1005"],
    ]));
    const result = await localStore.importStudents({ filename: "test.xlsx", rows: parsed.rows });
    expect(result).toMatchObject({ studentsFound: 4, successfullyImported: 1, rejectedRows: 3, duplicates: 1, invalidRecords: 2 });
    const saved = (await localStore.history())[0].rejectedDetails!;
    expect(saved.map(r => r.sourceRow)).toEqual([3, 4, 5]);
    expect(saved[1].reason).toContain("Missing ID NUMBER");
    expect(saved[2].rawYearLevel).toBe("1005");
    const report = rejectedRowsCsv(saved);
    expect(report).toContain("REASON / HOW TO FIX");
    expect(report).toContain('"1005"');
    const fixed = XLSX.read(Buffer.from(report, "utf8"), { type: "buffer" });
    expect(parseMasterlist(fixed).rows).toHaveLength(3);
  });
  it.runIf(existsSync("1ST SEM MASTERLIST.xlsx"))("imports the supplied real workbook into an isolated directory", async () => {
    const wb = XLSX.read(readFileSync("1ST SEM MASTERLIST.xlsx"), { type: "buffer" });
    const parsed = parseMasterlist(wb);
    const result = await localStore.importStudents({ filename: "1ST SEM MASTERLIST.xlsx", rows: parsed.rows });
    const directory = await localStore.list();
    console.log("Masterlist result", JSON.stringify({ sheet: parsed.sheetName, rows: result.studentsFound, imported: result.successfullyImported, duplicates: result.duplicates, invalid: result.invalidRecords, footerRows: parsed.ignoredFooterRows, issues: result.rejectedDetails.map(r => ({ row: r.sourceRow, reason: r.reason })) }));
    expect(result).toMatchObject({ studentsFound: 1262, successfullyImported: 1258, duplicates: 2, invalidRecords: 2 });
    expect(result.rejectedDetails.map(r => r.sourceRow)).toEqual([114, 1006, 1172, 1262]);
    expect(directory).toHaveLength(result.successfullyImported);
    expect(directory.some(s => s.studentId.startsWith("484"))).toBe(true);
    expect(directory.some(s => s.studentId.startsWith("596"))).toBe(true);
    expect(directory.some(s => s.yearLevel === null)).toBe(true);
    const repeated = await localStore.importStudents({ filename: "again.xlsx", rows: parsed.rows });
    expect(repeated.successfullyImported).toBe(0);
    expect(await localStore.list()).toHaveLength(directory.length);
  });
});
