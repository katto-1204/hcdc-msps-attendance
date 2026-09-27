import { describe, expect, it } from "vitest";
import { STUDENT_ID_PATTERN } from "./db";

describe("student ID validation", () => {
  it("accepts IDs from any masterlist prefix", () => {
    expect(STUDENT_ID_PATTERN.test("54800001")).toBe(true);
    expect(STUDENT_ID_PATTERN.test("54899999")).toBe(true);
    for (const value of ["59843754", "48400001", "59600001", "00123456", "2026-00001"]) expect(STUDENT_ID_PATTERN.test(value)).toBe(true);
  });

  it("rejects empty IDs, spaces, and excessive length", () => {
    for (const value of ["", "123 456", " 54800001 ", "x".repeat(65)]) {
      expect(STUDENT_ID_PATTERN.test(value)).toBe(false);
    }
  });
});
