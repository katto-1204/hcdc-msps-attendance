import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localStore, transaction } from "../client/src/lib/local-store";
const student = { studentId: "54800001", firstName: "Anna", lastName: "Cruz", yearLevel: 1 };
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("fetch", () => { throw new Error("Network must not be used"); });
});
describe("offline attendance storage", () => {
  it("persists student creation across new connections and supports edit/search", async () => {
    const added = await localStore.create(student);
    expect(await localStore.list()).toMatchObject([{ ...student, barcode: student.studentId }]);
    await localStore.update({ ...student, id: added.id, firstName: "Maria" });
    expect(await localStore.list({ query: "maria" })).toHaveLength(1);
    expect(await localStore.list({ query: "Anna" })).toHaveLength(0);
  });
  it("rejects invalid and conflicting IDs/barcodes without losing saved rows", async () => {
    await localStore.create(student);
    await expect(localStore.create(student)).rejects.toThrow("already exists");
    await expect(localStore.create({ ...student, studentId: "54800002", barcode: student.studentId })).rejects.toThrow("already exists");
    await expect(localStore.create({ ...student, studentId: "123" })).rejects.toThrow("8 digits");
    expect(await localStore.list()).toHaveLength(1);
  });
  it("serializes simultaneous attendance scans and preserves timestamps", async () => {
    await localStore.create(student);
    const input = { identifier: student.studentId, session: "morning_in" as const, date: "2026-09-28" };
    const results = await Promise.all([localStore.record(input), localStore.record(input)]);
    expect(results.map(r => r.status).sort()).toEqual(["duplicate", "recorded"]);
    const dashboard = await localStore.dashboard({ date: input.date });
    expect(dashboard.counts.morning_in).toBe(1);
    expect(dashboard.records[0].recordedAt).toBeInstanceOf(Date);
    expect(await localStore.csv({ date: input.date })).toContain("Anna Cruz");
    expect((await localStore.dashboard({ date: "2026-09-29" })).records).toHaveLength(0);
  });
  it("archives students but keeps attendance history", async () => {
    const added = await localStore.create(student);
    const scan = { identifier: student.studentId, session: "morning_in" as const, date: "2026-09-28" };
    await localStore.record(scan);
    await localStore.archive({ id: added.id });
    expect(await localStore.list()).toHaveLength(0);
    expect((await localStore.record(scan)).status).toBe("not_found");
    expect((await localStore.dashboard({ date: scan.date })).records).toHaveLength(1);
  });
  it("imports offline, counts duplicates and invalid rows, preserves history on reset", async () => {
    const row = { ...student, controlNo: "1", middleName: "Reyes", email: "anna@hcdc.edu.ph", program: "BSIT" };
    const result = await localStore.importStudents({ filename: "test.csv", rows: [row, row, { ...row, studentId: "bad" }] });
    expect(result).toMatchObject({ successfullyImported: 1, duplicates: 1, invalidRecords: 1 });
    await expect(localStore.resetRoster({ confirmation: "wrong" })).rejects.toThrow();
    expect(await localStore.list()).toHaveLength(1);
    await localStore.resetRoster({ confirmation: "CLEAR CURRENT ROSTER" });
    expect(await localStore.list()).toHaveLength(0);
    expect(await localStore.history()).toHaveLength(1);
    expect(await localStore.masterlists()).toMatchObject([{ status: "archived" }]);
  });
  it("rolls back failed writes and surfaces unavailable storage", async () => {
    await localStore.create(student);
    await expect(transaction(true, s => { s.students = []; throw new Error("Interrupted"); })).rejects.toThrow("Interrupted");
    expect(await localStore.list()).toHaveLength(1);
    vi.stubGlobal("indexedDB", undefined);
    await expect(localStore.create(student)).rejects.toThrow("Local storage is unavailable");
  });
});
