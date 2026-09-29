import type { Entry, PaymentMethod } from "./finance";
import { adminTotals, barberPerf, brl, net, paid, pct, summarize, INCOME_CATEGORIES } from "./finance";

export type ReportKind = "diario" | "semanal" | "mensal" | "personalizado";

const TITLES: Record<ReportKind, string> = {
  diario: "RELATÓRIO FINANCEIRO DIÁRIO",
  semanal: "RELATÓRIO FINANCEIRO SEMANAL",
  mensal: "RELATÓRIO FINANCEIRO MENSAL",
  personalizado: "RELATÓRIO FINANCEIRO",
};

const fmtDay = (d: string) => d.split("-").reverse().join("/");

export function reportFileName(kind: ReportKind, range: { from: string; to: string }) {
  if (kind === "diario") return `LA_CREME_BARBER_Fechamento_${range.from}.pdf`;
  if (kind === "mensal") return `LA_CREME_BARBER_Relatorio_Financeiro_${range.from.slice(0, 7)}.pdf`;
  return `LA_CREME_BARBER_Relatorio_Financeiro_${range.from}_a_${range.to}.pdf`;
}

// Cores da marca (documento, não UI)
const PETROL: [number, number, number] = [16, 64, 74];
const GOLD: [number, number, number] = [184, 146, 74];
const INK: [number, number, number] = [34, 34, 34];

export async function generateFinancePdf(opts: {
  kind: ReportKind;
  range: { from: string; to: string };
  entries: Entry[];
  barbers: { id: string; name: string }[];
  methods: PaymentMethod[];
}) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const { kind, range, entries, barbers, methods } = opts;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;
  const s = summarize(entries);
  const name = (id: string | null) => barbers.find((b) => b.id === id)?.name ?? "Administrador";
  const mLabel = (id: string | null) => methods.find((m) => m.id === id)?.label ?? id ?? "—";
  const period = range.from === range.to ? fmtDay(range.from) : `${fmtDay(range.from)} a ${fmtDay(range.to)}`;
  const generated = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

  // Cabeçalho
  doc.setFillColor(...PETROL);
  doc.rect(0, 0, W, 4, "F");
  doc.setTextColor(...PETROL);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("LA CREME BARBER", M, 18);
  doc.setFontSize(11);
  doc.setTextColor(...GOLD);
  doc.text(TITLES[kind], M, 25);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...INK);
  doc.setFontSize(9.5);
  doc.text(`${kind === "diario" ? "Data" : "Período"}: ${period}`, W - M, 18, { align: "right" });
  doc.text(`Gerado em: ${generated}`, W - M, 25, { align: "right" });
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(M, 29, W - M, 29);

  let y = 36;
  const base = {
    margin: { left: M, right: M, top: 20, bottom: 20 },
    theme: "grid" as const,
    styles: { font: "helvetica", fontSize: 9, cellPadding: 1.8, textColor: INK, lineColor: [210, 210, 210] as [number, number, number], lineWidth: 0.2, overflow: "linebreak" as const },
    headStyles: { fillColor: PETROL, textColor: [255, 255, 255] as [number, number, number], fontStyle: "bold" as const },
    footStyles: { fillColor: [240, 236, 226] as [number, number, number], textColor: INK, fontStyle: "bold" as const },
    rowPageBreak: "avoid" as const,
    showHead: "everyPage" as const,
  };
  const section = (title: string) => {
    if (y > H - 40) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...PETROL);
    doc.text(title, M, y);
    y += 2.5;
  };
  const table = (head: string[], body: (string | number)[][], foot?: (string | number)[], rightFrom = 1) => {
    const colStyles: Record<number, { halign: "right" }> = {};
    for (let i = rightFrom; i < head.length; i++) colStyles[i] = { halign: "right" };
    autoTable(doc, { ...base, startY: y, head: [head], body: body.map((r) => r.map(String)), foot: foot ? [foot.map(String)] : undefined, showFoot: "lastPage", columnStyles: colStyles });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  };

  section("RESUMO");
  table(["Item", "Valor"], [
    ...(kind === "diario" ? [["Atendimentos", String(s.appointments)]] : []),
    ["Faturamento bruto", brl(s.gross)],
    ["(−) Descontos", brl(s.discounts)],
    ["(=) Valor pago pelos clientes", brl(s.paid)],
    ["(−) Taxas de pagamento", brl(s.fees)],
    ["(=) Valor líquido", brl(s.net)],
    ["(−) Comissões", brl(s.commissions)],
    ["(−) Despesas", brl(s.expenses)],
  ], ["Resultado operacional", brl(s.result)]);

  if (kind !== "diario") {
    section("FATURAMENTO POR CATEGORIA");
    const cats = Object.entries(s.byCategory);
    table(["Categoria", "Qtd.", "Bruto", "Descontos", "Taxas", "Líquido"],
      cats.map(([k, a]) => [INCOME_CATEGORIES[k] ?? k, a.count, brl(a.gross), brl(a.discounts), brl(a.fees), brl(a.net)]),
      ["Total", s.count, brl(s.gross), brl(s.discounts), brl(s.fees), brl(s.net)]);
  }

  section("FORMAS DE PAGAMENTO");
  table(["Forma", "Qtd.", "Bruto", "Descontos", "Taxa", "Líquido"],
    methods.map((m) => { const a = s.byMethod[m.id]; return [m.label, a?.count ?? 0, brl(a?.gross ?? 0), brl(a?.discounts ?? 0), brl(a?.fees ?? 0), brl(a?.net ?? 0)]; }),
    ["Total", s.count, brl(s.gross), brl(s.discounts), brl(s.fees), brl(s.net)]);

  section("FATURAMENTO POR BARBEIRO");
  const perf = barberPerf(entries, barbers);
  const adm = adminTotals(entries);
  table(["Responsável", "Bruto", "Descontos", "Taxas", "Líquido", "Comissão"],
    [
      ...perf.map((p) => [p.name, brl(p.totals.gross), brl(p.totals.discounts), brl(p.totals.fees), brl(p.totals.net), brl(p.commission)]),
      ["Administrador", brl(adm.gross), brl(adm.discounts), brl(adm.fees), brl(adm.net), brl(0)],
    ],
    ["Faturamento geral", brl(s.gross), brl(s.discounts), brl(s.fees), brl(s.net), brl(s.commissions)]);

  if (kind !== "diario") {
    const svc = Object.entries(s.byService);
    if (svc.length) { section("SERVIÇOS"); table(["Serviço", "Qtd.", "Valor pago"], svc.map(([k, a]) => [k, a.count, brl(a.paid)])); }
    const prd = Object.entries(s.byProduct);
    if (prd.length) { section("PRODUTOS"); table(["Produto", "Qtd.", "Valor pago"], prd.map(([k, a]) => [k, a.count, brl(a.paid)])); }
    const pln = Object.entries(s.byPlan);
    if (pln.length) { section("PLANOS"); table(["Plano", "Qtd.", "Valor pago"], pln.map(([k, a]) => [k, a.count, brl(a.paid)])); }
    const exp = Object.entries(s.byExpense);
    if (exp.length) { section("DESPESAS"); table(["Categoria", "Valor"], exp.map(([k, v]) => [k, brl(v)]), ["Total", brl(s.expenses)]); }
    if (perf.some((p) => p.commission > 0)) {
      section("COMISSÕES");
      table(["Barbeiro", "Base líquida", "Comissão", "Pendente", "Paga"],
        perf.filter((p) => p.commission > 0).map((p) => [p.name, brl(p.commissionBase), brl(p.commission), brl(p.pending), brl(p.paid)]),
        ["Total", "", brl(s.commissions), "", ""]);
    }
  }

  section(kind === "diario" ? "MOVIMENTAÇÕES DO DIA" : "MOVIMENTAÇÕES");
  const rows = [...entries].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  table(["Data/hora", "Descrição", "Forma", "Pago", "Taxa", "Líquido", "Comissão"],
    rows.map((e) => [
      new Date(e.occurred_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }),
      `${e.kind === "saida" ? "Despesa · " : ""}${e.description || e.category}${e.kind === "entrada" ? ` · ${name(e.category === "servico" ? e.barber_id : e.seller_barber_id)}` : ""}`,
      mLabel(e.payment_method),
      e.kind === "saida" ? `−${brl(e.amount_cents)}` : brl(paid(e)),
      e.kind === "saida" ? "—" : `${brl(e.fee_cents)} (${pct(e.fee_percent)})`,
      e.kind === "saida" ? "—" : brl(net(e)),
      e.kind === "saida" ? "—" : brl(e.commission_cents),
    ]), undefined, 3);

  section("RESULTADO FINAL");
  table(["Item", "Valor"], [["Valor líquido", brl(s.net)], ["(−) Comissões", brl(s.commissions)], ["(−) Despesas", brl(s.expenses)]],
    ["Resultado operacional", brl(s.result)]);

  // Rodapé em todas as páginas
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.3);
    doc.line(M, H - 12, W - M, H - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text("LA CREME BARBER · Relatório financeiro", M, H - 7);
    doc.text(`Página ${i} de ${total}`, W - M, H - 7, { align: "right" });
  }

  doc.save(reportFileName(kind, range));
}
