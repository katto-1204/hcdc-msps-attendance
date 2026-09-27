import { utils, type WorkBook } from "xlsx";
export const STUDENT_ID_PATTERN = /^\S{1,64}$/;
export type StudentInput = { studentId: string; firstName: string; lastName: string; yearLevel: number | null; barcode?: string; controlNo?: string; middleName?: string; email?: string; program?: string };
export type ImportRow = StudentInput & { sourceRow?: number; sourceSheet?: string; rawYearLevel?: string };
export type RejectedRow = ImportRow & { reason: string; kind: "invalid" | "duplicate" };
export const MASTERLIST_HEADERS = ["Control No.", "ID NUMBER", "FIRST NAME", "LAST NAME", "MIDDLE NAME", "HCDC EMAIL", "PROGRAM", "YEAR LEVEL"];
export function studentIssues(row: StudentInput): string[] {
  const issues: string[] = [];
  if (!row.studentId.trim()) issues.push("Missing ID NUMBER. Supply the student's actual ID.");
  else if (!STUDENT_ID_PATTERN.test(row.studentId.trim())) issues.push("ID NUMBER must contain 1–64 characters without spaces; no prefix restriction.");
  if (!row.firstName.trim() && !row.lastName.trim()) issues.push("Missing student name. Fill FIRST NAME or LAST NAME.");
  if (row.yearLevel !== null && (!Number.isInteger(row.yearLevel) || row.yearLevel < 1 || row.yearLevel > 12)) issues.push("YEAR LEVEL must be blank or a whole number from 1 to 12.");
  return issues;
}
function cleanHeader(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchColType(str: unknown): string | null {
  const c = cleanHeader(str);
  if (!c) return null;

  if (
    c === "id" ||
    c.includes("idno") ||
    c.includes("idnumber") ||
    c.includes("studentid") ||
    c.includes("studentno") ||
    c.includes("idnum") ||
    c === "lrn" ||
    c === "srcode" ||
    c === "studid" ||
    c === "stdid" ||
    c === "stno"
  ) {
    if (c.includes("control") || c === "seq" || c === "item") return "controlNo";
    return "studentId";
  }

  if (c.includes("firstname") || c.includes("givenname") || c === "first" || c === "fname") {
    return "firstName";
  }

  if (c.includes("lastname") || c.includes("surname") || c.includes("familyname") || c === "last" || c === "lname") {
    return "lastName";
  }

  if (c.includes("middlename") || c.includes("midname") || c === "middle" || c === "middleinitial" || c === "mi" || c === "mname" || c === "initial") {
    return "middleName";
  }

  if (c.includes("fullname") || c.includes("studentname") || c === "name" || c === "completename") {
    return "fullName";
  }

  if (c.includes("control") || c.includes("ctrl") || c === "seq" || c === "item" || c === "itemno" || c === "sn") {
    return "controlNo";
  }

  if (c.includes("email") || c.includes("mail")) {
    return "email";
  }

  if (c.includes("program") || c.includes("course") || c.includes("strand") || c.includes("degree") || c.includes("dept") || c === "major" || c === "track") {
    return "program";
  }

  if (c.includes("year") || c.includes("level") || c.includes("grade") || c === "yr" || c === "yrlvl") {
    return "yearLevel";
  }

  return null;
}

export function parseMasterlist(workbook: WorkBook) {
  const allRows: ImportRow[] = [];
  let totalIgnoredFooterRows = 0;
  const processedSheets: string[] = [];
  const seenSheetStudentIds = new Set<string>();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    let safeRef: string | undefined = undefined;
    if (sheet["!ref"]) {
      safeRef = sheet["!ref"].replace(/:([A-Z]{2,})(\d+)$/, ":Z$2");
    }

    const rawRows: unknown[][] = utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      ...(safeRef ? { range: safeRef } : {}),
    });

    if (!rawRows || rawRows.length === 0) continue;

    let headerIdx = -1;
    let colMap: Record<string, number> = {};

    for (let i = 0; i < Math.min(rawRows.length, 100); i++) {
      const row = rawRows[i];
      if (!Array.isArray(row)) continue;

      const currentMap: Record<string, number> = {};
      row.forEach((cell, colIndex) => {
        const type = matchColType(cell);
        if (type && !(type in currentMap)) {
          currentMap[type] = colIndex;
        }
      });

      const hasId = "studentId" in currentMap;
      const hasFirst = "firstName" in currentMap;
      const hasLast = "lastName" in currentMap;
      const hasFull = "fullName" in currentMap;

      if ((hasId && (hasFirst || hasLast || hasFull)) || (hasFirst && hasLast)) {
        headerIdx = i;
        colMap = currentMap;
        break;
      }
    }

    if (headerIdx === -1) continue;

    processedSheets.push(sheetName);
    let footer = false;

    const refStartRow = safeRef ? parseInt(safeRef.match(/\d+/)?.[0] ?? "1", 10) : 1;
    const excelRow = (i: number) => refStartRow + i;

    const getVal = (row: unknown[], key: string): string => {
      const idx = colMap[key];
      if (idx === undefined || !row || idx >= row.length) return "";
      const v = row[idx];
      return v === null || v === undefined ? "" : String(v).trim();
    };

    for (let i = headerIdx + 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!Array.isArray(row)) continue;

      const controlNo = getVal(row, "controlNo");
      const rawId = getVal(row, "studentId");
      let firstName = getVal(row, "firstName");
      let lastName = getVal(row, "lastName");
      let middleName = getVal(row, "middleName");
      const fullName = getVal(row, "fullName");

      if (
        (controlNo && /nothing follows|^note:|^data generated|^prepared by:/i.test(controlNo)) ||
        (rawId && /nothing follows|^note:|^data generated|^prepared by:/i.test(rawId))
      ) {
        footer = true;
      }
      if (footer) {
        if (row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== "")) {
          totalIgnoredFooterRows++;
        }
        continue;
      }

      if (!controlNo && !rawId && !firstName && !lastName) continue;

      if (processedSheets.length > 1 && (!rawId || seenSheetStudentIds.has(rawId.trim().toLowerCase()))) {
        continue;
      }
      if (rawId) {
        seenSheetStudentIds.add(rawId.trim().toLowerCase());
      }

      if ((!firstName || !lastName) && fullName) {
        if (fullName.includes(",")) {
          const parts = fullName.split(",").map(p => p.trim());
          lastName = parts[0] || "";
          const rest = parts.slice(1).join(" ");
          const nameWords = rest.split(/\s+/).filter(Boolean);
          firstName = nameWords[0] || "";
          if (nameWords.length > 1 && !middleName) {
            middleName = nameWords.slice(1).join(" ");
          }
        } else {
          const words = fullName.split(/\s+/).filter(Boolean);
          if (words.length === 1) {
            firstName = words[0];
          } else if (words.length === 2) {
            firstName = words[0];
            lastName = words[1];
          } else if (words.length === 3) {
            firstName = words[0];
            middleName = words[1];
            lastName = words[2];
          } else if (words.length > 3) {
            firstName = words[0];
            middleName = words[1];
            lastName = words.slice(2).join(" ");
          }
        }
      }

      if (!controlNo && !rawId && !firstName && !lastName) continue;

      const cleanedId = cleanHeader(rawId);
      if (cleanedId === "idnumber" || cleanedId === "studentid" || cleanedId === "id" || cleanedId === "idno") continue;

      const email = getVal(row, "email");
      const program = getVal(row, "program");
      const rawYearLevel = getVal(row, "yearLevel");

      let yearLevel: number | null = null;
      if (rawYearLevel) {
        const yearMatch = /(\d+)/.exec(rawYearLevel);
        if (yearMatch) {
          yearLevel = parseInt(yearMatch[1], 10);
        } else if (/^i$/i.test(rawYearLevel)) yearLevel = 1;
        else if (/^ii$/i.test(rawYearLevel)) yearLevel = 2;
        else if (/^iii$/i.test(rawYearLevel)) yearLevel = 3;
        else if (/^iv$/i.test(rawYearLevel)) yearLevel = 4;
        else if (/^v$/i.test(rawYearLevel)) yearLevel = 5;
        else yearLevel = NaN;
      }

      allRows.push({
        controlNo,
        studentId: rawId,
        firstName,
        lastName,
        middleName,
        email,
        program,
        yearLevel,
        barcode: rawId,
        sourceRow: excelRow(i),
        sourceSheet: sheetName,
        rawYearLevel,
      });
    }
  }

  if (allRows.length > 0) {
    return {
      rows: allRows,
      sheetName: processedSheets.length > 1 ? `Combined (${processedSheets.join(", ")})` : processedSheets[0] || "Sheet1",
      ignoredFooterRows: totalIgnoredFooterRows,
    };
  }

  throw new Error(
    "No valid student data found in the spreadsheet. Please ensure the file has columns for Student ID and Student Name."
  );
}
export function rejectedRowsCsv(rows: RejectedRow[]) {
  const escape = (v: unknown) => { const text = String(v ?? ""); return `"${(/^[=+@\-\t\r]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`; };
  const values = rows.map(r => [r.controlNo, r.studentId, r.firstName, r.lastName, r.middleName, r.email, r.program, r.rawYearLevel ?? r.yearLevel, r.sourceSheet, r.sourceRow, r.kind, r.reason]);
  return "\uFEFF" + [[...MASTERLIST_HEADERS, "SOURCE SHEET", "EXCEL ROW", "ISSUE TYPE", "REASON / HOW TO FIX"], ...values].map(row => row.map(escape).join(",")).join("\r\n");
}
