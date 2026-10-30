import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

// Exercises the actual database rules; all fixture changes roll back.
function databaseTest(body: string) {
  return execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-At"], { encoding: "utf8", input: `BEGIN;
DO $test$
DECLARE admin_id uuid; customer_id uuid; barber_id uuid; appt uuid; expected jsonb; before_rows jsonb; after_rows jsonb; total integer; rejected boolean;
BEGIN
 SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' LIMIT 1;
 SELECT id INTO customer_id FROM public.profiles WHERE id<>admin_id AND NOT public.has_role(id,'admin') LIMIT 1;
 IF admin_id IS NULL OR customer_id IS NULL THEN RAISE EXCEPTION 'Missing authenticated test accounts'; END IF;
 SELECT a.id INTO appt FROM public.appointments a WHERE a.status='finalizado' AND EXISTS(SELECT 1 FROM public.financial_entries f WHERE f.appointment_id=a.id AND f.kind='entrada' AND f.refunded_at IS NULL) ORDER BY a.created_at DESC LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 SELECT jsonb_agg(jsonb_build_object('id',f.id,'updated_at',f.updated_at) ORDER BY f.id),jsonb_agg(to_jsonb(f) ORDER BY f.id),sum(f.amount_cents-f.discount_cents) INTO expected,before_rows,total FROM public.financial_entries f WHERE f.appointment_id=appt AND f.kind='entrada' AND f.refunded_at IS NULL;
 ${body}
END $test$;
ROLLBACK;` });
}

describe("Completed appointment payment correction", () => {
  it("administrator corrects payment without changing revenue, stock, services or discounts", () => {
    expect(databaseTest(`
      PERFORM public.correct_appointment_payment(appt,'credito','Correção de pagamento de teste',expected);
      IF EXISTS(SELECT 1 FROM public.financial_entries f WHERE f.appointment_id=appt AND f.kind='entrada' AND f.refunded_at IS NULL AND (f.payment_method<>'credito' OR f.fee_cents<>round((f.amount_cents-f.discount_cents)*3.15/100))) THEN RAISE EXCEPTION 'Incorrect method or credit fee'; END IF;
      IF total<>(SELECT sum(amount_cents-discount_cents) FROM public.financial_entries WHERE appointment_id=appt AND kind='entrada' AND refunded_at IS NULL) THEN RAISE EXCEPTION 'Revenue changed'; END IF;
      IF NOT EXISTS(SELECT 1 FROM public.financial_payment_corrections WHERE appointment_id=appt AND changed_by=admin_id AND before_entries=before_rows) THEN RAISE EXCEPTION 'Missing audit'; END IF;
    `)).toContain("");
  });
  it("customer cannot correct payment", () => {
    databaseTest(`PERFORM set_config('request.jwt.claim.sub',customer_id::text,true);
      rejected:=false; BEGIN PERFORM public.correct_appointment_payment(appt,'pix','Correção teste',expected); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
      IF NOT rejected THEN RAISE EXCEPTION 'Customer gained correction access'; END IF;`);
  });
  it("leader requires individual admin authorization and loses access when revoked", () => {
    databaseTest(`
      INSERT INTO public.user_roles(user_id,role) VALUES(customer_id,'barbeiro') ON CONFLICT DO NOTHING;
      INSERT INTO public.barbers(name,user_id,team_role,active,approved_at) VALUES('Teste de autorização',customer_id,'lider',true,now()) RETURNING id INTO barber_id;
      PERFORM set_config('request.jwt.claim.sub',customer_id::text,true);
      IF public.can_correct_appointment_payment() THEN RAISE EXCEPTION 'Leader automatically authorized'; END IF;
      rejected:=false; BEGIN PERFORM public.set_financial_correction_permission(barber_id,true); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
      IF NOT rejected THEN RAISE EXCEPTION 'Leader self-authorized'; END IF;
      PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
      PERFORM public.set_financial_correction_permission(barber_id,true);
      PERFORM set_config('request.jwt.claim.sub',customer_id::text,true);
      IF NOT public.can_correct_appointment_payment() THEN RAISE EXCEPTION 'Selected leader denied'; END IF;
      PERFORM public.correct_appointment_payment(appt,'pix','Teste de líder autorizado',expected);
      PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
      PERFORM public.set_financial_correction_permission(barber_id,false);
      PERFORM set_config('request.jwt.claim.sub',customer_id::text,true);
      IF public.can_correct_appointment_payment() THEN RAISE EXCEPTION 'Revoked leader retained access'; END IF;
    `);
  });
  it("rejects unfinished appointments", () => {
    databaseTest(`SELECT id INTO appt FROM public.appointments WHERE status='agendado' LIMIT 1;
      rejected:=false; BEGIN PERFORM public.correct_appointment_payment(appt,'pix','Correção teste',expected); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
      IF NOT rejected THEN RAISE EXCEPTION 'Unfinished appointment corrected'; END IF;`);
  });
  it("rejects stale financial versions", () => {
    databaseTest(`rejected:=false; BEGIN PERFORM public.correct_appointment_payment(appt,'pix','Correção teste','[]'::jsonb); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
      IF NOT rejected THEN RAISE EXCEPTION 'Stale correction accepted'; END IF;`);
  });
  it("records cash change once and clears it when corrected to Pix", () => {
    databaseTest(`PERFORM public.correct_appointment_payment(appt,'dinheiro','Troco Pix teste',expected,total+1000,'pix');
      IF (SELECT count(*) FROM public.financial_entries WHERE appointment_id=appt AND kind='entrada' AND refunded_at IS NULL AND change_cents=1000 AND change_method='pix')<>1 THEN RAISE EXCEPTION 'Change duplicated or missing'; END IF;
      SELECT jsonb_agg(jsonb_build_object('id',f.id,'updated_at',f.updated_at) ORDER BY f.id) INTO expected FROM public.financial_entries f WHERE appointment_id=appt AND kind='entrada' AND refunded_at IS NULL;
      PERFORM public.correct_appointment_payment(appt,'pix','Correção Pix teste',expected);
      IF EXISTS(SELECT 1 FROM public.financial_entries WHERE appointment_id=appt AND kind='entrada' AND refunded_at IS NULL AND (cash_received_cents IS NOT NULL OR change_cents IS NOT NULL OR change_method IS NOT NULL)) THEN RAISE EXCEPTION 'Cash change retained for Pix'; END IF;`);
  });
});