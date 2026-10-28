<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Stock balance changes only via stock_movements (trigger-guarded); product sales go through finalize_appointment and financial_entries — single source for finance/commission.
- Client codes come only from the clients table sequence (DB-generated, immutable); staff walk-in bookings go through staff_create_appointment so availability and pricing rules stay in the database.
- Barber colors come from src/lib/barber-colors.ts (brand palette tokens --barber-N, then golden-angle generated; admin-chosen color wins) so every screen colors barbers consistently.
- Booked service removal goes through remove_appointment_service, which authorizes staff and recalculates combo totals and plan coverage in the database; never accept client-supplied totals.
- Appointment name/date/time editing uses edit_appointment and can_edit_appointment; managers only edit rows already in their permitted scope and regular bookings retain availability checks.
- Cash change is recorded atomically through finalize_appointment_with_change on the service financial entry; database-derived sale totals remain the source for revenue and commission, preventing change from becoming a duplicate expense.
- WhatsApp confirmations use an insert-triggered durable outbox with one row per appointment, a signed webhook inbox and transactional status reconciliation; sending stays blocked until a linked connector, approved template, durable processor wake-up and real delivery test exist, so preparation cannot accidentally send messages.
- Counter sales and bonuses (no appointment) go through register_counter_sale, gated by is_admin_or_leader; bonuses are R$0 entries with stock out and no commission, keeping finance/stock single-sourced.
