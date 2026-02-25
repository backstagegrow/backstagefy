# Regras de Negócio – Shield Lock (Whitelist) & IA

> Documento oficial das regras de operação da IA spHAUS Concierge.

---

## Regra 1 – Whitelist com Números
Se existir **qualquer número** cadastrado na lista Shield Lock (Whitelist), a IA deve responder **apenas** aos números que estiverem nessa lista.

## Regra 2 – Whitelist Vazia
Se a lista Shield Lock (Whitelist) estiver **vazia**, a IA deve responder automaticamente a **todos** os números que entrarem na instância.

## Regra 3 – QR Code = Instância Ativa
A IA sempre funcionará no número conectado via QR Code (instância ativa). Qualquer número que for conectado escaneando o QR Code será o número onde a IA irá operar.

## Regra 4 – Atendimento Humano ≠ Whitelist
O campo "Atendimento Humano" (`handoverNumber`) **NÃO** tem relação com a whitelist. Ele deve ser usado exclusivamente para:
- Follow-up de agendamento
- Aviso automático 1h30 antes do horário agendado

---

## Resumo Operacional

| Conceito | Descrição |
|----------|-----------|
| **Número conectado via QR Code** | Número onde a IA funciona |
| **Números na Shield Lock** | Quem pode testar a IA quando a lista não estiver vazia |
| **Lista vazia** | IA responde a todos |
| **Atendimento Humano** | Apenas para notificações e follow-up de agendamento |

---

## Implementação Técnica

### Edge Function: `ai-concierge-v5-final`
- **Linhas 131-161**: Lógica de whitelist com comentários das 4 regras.
- A IA lê `config.whitelistNumbers` do campo `settings` (JSON) da tabela `whatsapp_instances`.
- Se a lista tem números → filtra (Regra 1).
- Se a lista está vazia → responde a todos (Regra 2).

### Dashboard: `WhatsAppConfig.tsx`
- O componente salva `whitelistNumbers` como array via `whatsapp-manager?action=save-settings`.
- O toggle de "Célula de Teste" é visual — o backend verifica apenas a presença de números na lista.

---
*Última atualização: 13/02/2026*
