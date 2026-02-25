# Documentação uazapiGO V2

Esta é a documentação completa da API uazapiGO V2 - WhatsApp API.

---

## Sobre a API

A uazapiGO é uma API para gerenciamento de instâncias do WhatsApp e comunicações.

- **Versão:** 1.0.0
- **Total de Endpoints:** 103
- **Total de Schemas:** 15

---

## ⚠️ Recomendação Importante

É **ALTAMENTE RECOMENDADO** usar contas do **WhatsApp Business** em vez do WhatsApp normal para integração. O WhatsApp normal pode apresentar inconsistências, desconexões, limitações e instabilidades durante o uso com a nossa API.

---

## Autenticação

- **Endpoints regulares:** Requerem um header `'token'` com o token da instância
- **Endpoints administrativos:** Requerem um header `'admintoken'`

---

## Estados da Instância

| Estado | Descrição |
|--------|-----------|
| `disconnected` | Desconectado do WhatsApp |
| `connecting` | Em processo de conexão |
| `connected` | Conectado e autenticado com sucesso |

---

## Estrutura da Documentação

| Pasta | Descrição | Endpoints |
|-------|-----------|-----------|
| [01-Overview](./01-Overview) | Visão geral da API | - |
| [02-Admininstração](./02-Admininstração) | Administração geral | 5 |
| [03-Instancia](./03-Instancia) | Ciclo de vida da instância | 8 |
| [04-Proxy](./04-Proxy) | Configuração de proxy | 3 |
| [05-Perfil](./05-Perfil) | Perfil do WhatsApp | 2 |
| [06-Business](./06-Business) | Perfil comercial | 8 |
| [07-Chamadas](./07-Chamadas) | Chamadas de voz/vídeo | 2 |
| [08-Webhooks-e-SSE](./08-Webhooks-e-SSE) | Webhooks e SSE | 3 |
| [09-Enviar-Mensagem](./09-Enviar-Mensagem) | Envio de mensagens | 11 |
| [10-Acoes-na-mensagem-e-Buscar](./10-Acoes-na-mensagem-e-Buscar) | Ações em mensagens | 6 |
| [11-Chats](./11-Chats) | Gerenciamento de chats | 6 |
| [12-Contatos](./12-Contatos) | Gerenciamento de contatos | 6 |
| [13-Bloqueios](./13-Bloqueios) | Contatos bloqueados | 2 |
| [14-Etiquetas](./14-Etiquetas) | Labels/Etiquetas | 3 |
| [15-Grupos-e-Comunidades](./15-Grupos-e-Comunidades) | Grupos e comunidades | 16 |
| [16-Respostas-Rapidas](./16-Respostas-Rapidas) | Respostas rápidas | 2 |
| [17-CRM](./17-CRM) | Campos CRM | 2 |
| [18-Mensagem-em-massa](./18-Mensagem-em-massa) | Envio em massa | 7 |
| [19-Integracao-Chatwoot](./19-Integracao-Chatwoot) | Integração Chatwoot | 2 |
| [20-ChatBot](./20-ChatBot) | Fluxos de chatbot | 9 |
| [21-Schemas](./21-Schemas) | Estruturas de dados | 15 |

---

## Servidor da API

```
https://{subdomain}.uazapi.com
```

---

## Limites de Uso

- O servidor possui um limite máximo de instâncias conectadas
- Quando o limite é atingido, novas tentativas receberão erro **429**
- Servidores gratuitos/demo podem ter restrições adicionais de tempo de vida

---

## Uso com n8n

Para usar esta API com o n8n:

1. Configure as credenciais HTTP com o header `token`
2. Use o nó HTTP Request para fazer chamadas aos endpoints
3. Para webhooks, configure o webhook node para receber eventos

---

## Uso com Supabase

Para integrar com Supabase:

1. Use Edge Functions para fazer chamadas à API
2. Armazene os tokens de instância no banco de dados
3. Use triggers para automatizar envios

---

## Licença

Documentação extraída de: https://docs.uazapi.com/
