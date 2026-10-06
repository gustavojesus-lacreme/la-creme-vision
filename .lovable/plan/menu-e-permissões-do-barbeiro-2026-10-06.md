# Menu e permissões do barbeiro

Decisões já tomadas por você:
- **PDF:** o barbeiro não gera PDF. Só o administrador gera e, se quiser, entrega para ele.
- **Almoço:** o barbeiro muda o horário em que começa o almoço. A duração continua a do administrador, e o almoço precisa ficar dentro do expediente.
- **Foto:** aparece em Meu perfil e também na escolha do barbeiro quando o cliente agenda.
- **Encaixe e agendamento manual:** só em horários livres, com as mesmas regras do agendamento normal.

## Menu do barbeiro
Painel (Agenda) · Clientes · Serviços · Produtos · Meu Financeiro · Configurações

Dentro de **Configurações**:
- **Meu perfil:** dados pessoais (nome, sobrenome, WhatsApp, foto, e-mail) e segurança (trocar senha, recuperar senha, sair).
- **Minha disponibilidade:** dias e horários de trabalho (só para ver), almoço (pode mudar o horário de início), bloquear um período e **Minhas ausências** (emergência ou afastamento médico, dia inteiro ou horário específico, editar e excluir as próprias; férias não).
- **Notificações:** só mostra o que o administrador deixou ligado, sem botões para mudar.

O barbeiro não verá nada de gestão: outros barbeiros, horário da barbearia, serviços e preços, combinações, descontos, planos, financeiro geral, despesas, taxas, comissões, gestão de clientes e exclusões.

## Telas novas ou ajustadas
- **Clientes (barbeiro):** só clientes que ele já atendeu. Mostra nome, histórico, serviços e produtos comprados, **sem WhatsApp**. Ele pode cadastrar um cliente novo, mas não pode editar nem excluir.
- **Serviços (barbeiro):** lista só para ver os serviços que ele faz, com preço e duração.
- **Produtos (barbeiro):** lista só para ver os produtos à venda e a quantidade em estoque. A venda continua sendo feita na finalização do atendimento.
- **Meu Financeiro:** mostra os mesmos números de hoje, mas sem os botões de PDF ou relatório para baixar.
- **Agenda:** finalizar, marcar "não compareceu", criar encaixe ou agendamento manual na própria agenda. O botão de cancelar não aparece para o barbeiro.

## Segurança
As regras também valem no sistema, não só na tela:
- O barbeiro não consegue mudar a função dele, preços, produtos, estoque, serviços, notificações nem a agenda de outro barbeiro, nem cancelar agendamento, nem cadastrar férias.
- O WhatsApp do cliente fica bloqueado para ele.
- Se ele abrir direto o endereço de uma tela de administrador, vê "Acesso restrito" e não consegue fazer nada.

## Detalhes técnicos
- Banco de dados: colunas `barbers.photo_url` e `barbers.lunch_start` (pode ficar vazio = usa o almoço geral). `get_available_slots` passa a usar o almoço do barbeiro, com a duração geral. Bucket público `barber-photos` com política para o dono enviar a própria foto.
- Revisar RLS: o barbeiro não pode mudar `status` para cancelado nem `barber_id` de outro; trigger em `barbers` bloqueia mudanças do próprio barbeiro em `team_role`, `active`, `approved_at`, comissões e `service_ids`; trigger em `barber_absences` bloqueia `ferias` para quem não é admin (conferir o que já existe). Criar uma função `get_my_clients()` que devolve só nome e histórico (sem WhatsApp); cadastro de cliente pelo barbeiro por meio de uma função específica.
- Encaixe/manual: usa os horários livres de `get_available_slots` do próprio barbeiro e grava pelo mesmo fluxo de confirmação que já existe.
- E-mail e senha: `supabase.auth.updateUser`; recuperação pelo fluxo de redefinição.
- Rotas novas em `_authenticated/`: `meu-perfil`, `minha-disponibilidade`, `meus-clientes`, `meus-servicos`, `meus-produtos`; `configuracoes` mostra outro menu conforme o perfil.
- Ao final: rodar os 20 testes pedidos direto no sistema e esperar sua validação.
