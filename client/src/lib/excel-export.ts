import XLSX from "xlsx-js-style";

export type AttendanceRecordExport = {
  attendanceDate: string;
  recordedAt: Date | string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  yearLevel: number | null;
  session: string;
};

function formatTimeStr(value: Date | string) {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function displaySessionStr(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function exportStyledAttendanceExcel(records: AttendanceRecordExport[], date: string) {
  const wb = XLSX.utils.book_new();

  const createStyledSheet = (sheetRecords: AttendanceRecordExport[], sheetTitle: string) => {
    // 1. Define Title & Subtitle Headers
    const titleRow = ["HOLY CROSS OF DAVAO COLLEGE — MSPS ATTENDANCE REGISTER", "", "", "", "", ""];
    const subtitleRow = [`Date: ${date}   |   Session: ${sheetTitle}   |   Total Records: ${sheetRecords.length}`, "", "", "", "", ""];
    const emptyRow = ["", "", "", "", "", ""];
    const headerRow = ["Date", "Time", "ID Number", "Student Name", "Year Level", "Session"];

    const dataRows = sheetRecords.map((r) => [
      r.attendanceDate,
      formatTimeStr(r.recordedAt),
      r.studentNumber,
      `${r.firstName} ${r.lastName}`,
      r.yearLevel != null ? `Year ${r.yearLevel}` : "N/A",
      displaySessionStr(r.session),
    ]);

    const summaryRow = ["TOTAL RECORDS", "", "", "", "", `${sheetRecords.length} records`];

    const allRows = [titleRow, subtitleRow, emptyRow, headerRow, ...dataRows, summaryRow];
    const ws = XLSX.utils.aoa_to_sheet(allRows);

    // 2. Column Widths
    ws["!cols"] = [
      { wch: 16 }, // Date
      { wch: 16 }, // Time
      { wch: 18 }, // ID Number
      { wch: 34 }, // Student Name
      { wch: 14 }, // Year Level
      { wch: 20 }, // Session
    ];

    // 3. Row Heights
    const rowHeights = [
      { hpt: 30 }, // Title
      { hpt: 20 }, // Subtitle
      { hpt: 10 }, // Empty space
      { hpt: 26 }, // Table Header
      ...sheetRecords.map(() => ({ hpt: 20 })),
      { hpt: 24 }, // Footer Total
    ];
    ws["!rows"] = rowHeights;

    // 4. Merged Cells
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, // A1:F1
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }, // A2:F2
      { s: { r: allRows.length - 1, c: 0 }, e: { r: allRows.length - 1, c: 4 } }, // Summary footer A:E
    ];

    // 5. Apply Styles
    const borderStyle = {
      top: { style: "thin", color: { rgb: "D1DFD5" } },
      bottom: { style: "thin", color: { rgb: "D1DFD5" } },
      left: { style: "thin", color: { rgb: "D1DFD5" } },
      right: { style: "thin", color: { rgb: "D1DFD5" } },
    };

    // Style Title (Row 0 / A1)
    const titleCell = XLSX.utils.encode_cell({ r: 0, c: 0 });
    if (ws[titleCell]) {
      ws[titleCell].s = {
        font: { name: "Calibri", sz: 13, bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "123D30" } }, // Deep HCDC Emerald Green
        alignment: { horizontal: "center", vertical: "center" },
      };
    }

    // Style Subtitle (Row 1 / A2)
    const subCell = XLSX.utils.encode_cell({ r: 1, c: 0 });
    if (ws[subCell]) {
      ws[subCell].s = {
        font: { name: "Calibri", sz: 10, italic: true, color: { rgb: "EBF3EE" } },
        fill: { fgColor: { rgb: "1D4F40" } },
        alignment: { horizontal: "center", vertical: "center" },
      };
    }

    // Style Table Headers (Row 3 / A4 to F4)
    for (let c = 0; c < 6; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: 3, c });
      if (ws[cellRef]) {
        ws[cellRef].s = {
          font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "255447" } }, // Header Emerald Accent
          alignment: { horizontal: c === 3 ? "left" : "center", vertical: "center" },
          border: {
            top: { style: "medium", color: { rgb: "123D30" } },
            bottom: { style: "medium", color: { rgb: "123D30" } },
          },
        };
      }
    }

    // Style Data Rows (Row 4 onwards)
    const startDataRow = 4;
    sheetRecords.forEach((_, idx) => {
      const r = startDataRow + idx;
      const isEven = idx % 2 === 0;
      const bgRgb = isEven ? "FFFFFF" : "F4F8F5"; // Soft mint zebra striping

      for (let c = 0; c < 6; c++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        if (ws[cellRef]) {
          ws[cellRef].s = {
            font: { name: "Calibri", sz: 10, color: { rgb: "1D2B25" } },
            fill: { fgColor: { rgb: bgRgb } },
            alignment: { horizontal: c === 3 ? "left" : "center", vertical: "center" },
            border: borderStyle,
          };
        }
      }
    });

    // Style Summary Footer Row
    const footerR = allRows.length - 1;
    const footerLabelRef = XLSX.utils.encode_cell({ r: footerR, c: 0 });
    if (ws[footerLabelRef]) {
      ws[footerLabelRef].s = {
        font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "123D30" } },
        fill: { fgColor: { rgb: "E1ECE4" } },
        alignment: { horizontal: "right", vertical: "center" },
        border: { top: { style: "medium", color: { rgb: "123D30" } } },
      };
    }
    const footerValRef = XLSX.utils.encode_cell({ r: footerR, c: 5 });
    if (ws[footerValRef]) {
      ws[footerValRef].s = {
        font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "123D30" } },
        fill: { fgColor: { rgb: "E1ECE4" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: { top: { style: "medium", color: { rgb: "123D30" } } },
      };
    }

    return ws;
  };

  // 1. All Sessions Tab
  const masterSheet = createStyledSheet(records, "All Sessions");
  XLSX.utils.book_append_sheet(wb, masterSheet, "All Sessions");

  // 2. Individual Session Tabs
  const sessionTabs = [
    { key: "morning_in", name: "Morning In" },
    { key: "morning_out", name: "Morning Out" },
    { key: "afternoon_in", name: "Afternoon In" },
    { key: "afternoon_out", name: "Afternoon Out" },
  ];

  for (const tab of sessionTabs) {
    const filtered = records.filter((r) => r.session === tab.key);
    const sheet = createStyledSheet(filtered, tab.name);
    XLSX.utils.book_append_sheet(wb, sheet, tab.name);
  }

  XLSX.writeFile(wb, `HCDC-MSPS-Attendance-${date}.xlsx`);
}
