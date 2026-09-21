import { describe, expect, it } from "vitest";
import { STUDENT_ID_PATTERN } from "./db";

describe("student ID validation", () => {
  it("accepts exactly eight digits beginning with 548", () => {
    expect(STUDENT_ID_PATTERN.test("54800001")).toBe(true);
    expect(STUDENT_ID_PATTERN.test("54899999")).toBe(true);
  });

  it("rejects other prefixes, separators, and incorrect lengths", () => {
    for (const value of ["59843754", "5480001", "548000001", "548-0001", "548ABCDE", " 54800001 "]) {
      expect(STUDENT_ID_PATTERN.test(value)).toBe(false);
    }
  });
});
