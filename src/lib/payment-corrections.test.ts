import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

function query(sql: string) {
  return execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], { encoding: "utf8" }).trim();
}
const correction = "public.correct_appointment_payment(uuid,text,text,jsonb,integer,text)";
describe("Financial correction database access rules", () => {
  it("anonymous users cannot execute payment corrections", () => {
    expect(query(`select has_function_privilege('anon','${correction}','EXECUTE')`)).toBe("f");
  });
  it("signed-in users must enter the authorization-checked correction function", () => {
    expect(query(`select has_function_privilege('authenticated','${correction}','EXECUTE') and prosecdef from pg_proc where oid='${correction}'::regprocedure`)).toBe("t");
    expect(query(`select position('IF NOT public.can_correct_appointment_payment()' in pg_get_functiondef('${correction}'::regprocedure))>0`)).toBe("t");
  });
  it("individual leader permission is required in addition to active leader status", () => {
    expect(query(`select position('financial_correction_permissions' in pg_get_functiondef('public.can_correct_appointment_payment()'::regprocedure))>0 and position('team_role = ''lider''' in pg_get_functiondef('public.can_correct_appointment_payment()'::regprocedure))>0`)).toBe("t");
  });
  it("leaders cannot directly authorize themselves or write arbitrary financial entries", () => {
    expect(query(`select count(*) from pg_policies where schemaname='public' and tablename in ('financial_entries','financial_correction_permissions') and cmd in ('ALL','INSERT','UPDATE') and qual not like '%has_role(auth.uid(), ''admin''%'`)).toBe("0");
  });
  it("correction history is append-only for signed-in users", () => {
    expect(query(`select has_table_privilege('authenticated','public.financial_payment_corrections','SELECT') and not has_table_privilege('authenticated','public.financial_payment_corrections','UPDATE') and not has_table_privilege('authenticated','public.financial_payment_corrections','DELETE')`)).toBe("t");
  });
  it("unfinished appointments and stale versions are rejected by the payment operation", () => {
    expect(query(`select position('status = ''finalizado''' in pg_get_functiondef('${correction}'::regprocedure))>0 and position('_expected IS NULL OR _expected IS DISTINCT FROM' in pg_get_functiondef('${correction}'::regprocedure))>0`)).toBe("t");
  });
});