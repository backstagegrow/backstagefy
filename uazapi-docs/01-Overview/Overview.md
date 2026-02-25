# uazapiGO V2 - WhatsApp API (v2.0)

**Versão:** 1.0.0

**Descrição:** API para gerenciamento de instâncias do WhatsApp e comunicações.

---

## ⚠️ Recomendação Importante: WhatsApp Business

É **ALTAMENTE RECOMENDADO** usar contas do **WhatsApp Business** em vez do WhatsApp normal para integração. O WhatsApp normal pode apresentar inconsistências, desconexões, limitações e instabilidades durante o uso com a nossa API.

---

## Autenticação

- **Endpoints regulares:** Requerem um header `'token'` com o token da instância
- **Endpoints administrativos:** Requerem um header `'admintoken'`

---

## Estados da Instância

As instâncias podem estar nos seguintes estados:

| Estado | Descrição |
|--------|-----------|
| `disconnected` | Desconectado do WhatsApp |
| `connecting` | Em processo de conexão |
| `connected` | Conectado e autenticado com sucesso |

---

## Limites de Uso

- O servidor possui um limite máximo de instâncias conectadas
- Quando o limite é atingido, novas tentativas receberão erro **429**
- Servidores gratuitos/demo podem ter restrições adicionais de tempo de vida

---

## Estatísticas da API

| Métrica | Valor |
|---------|-------|
| Endpoints | 103 |
| Schemas | 15 |
| Security | 2 |
| Servers | 1 |

---

## Baixar Especificação OpenAPI

Baixe a especificação OpenAPI completa com todas as referências resolvidas e pronta para uso.

**URL:** `https://docs.uazapi.com/openapi.json`

---

## API Servers

| Servidor | URL |
|----------|-----|
| Servidor da API uazapiGO | `https://{subdomain}.uazapi.com` |

---

## Estrutura da Documentação

1. **Administração** - 5 endpoints
2. **Instância** - 8 endpoints
3. **Proxy** - 3 endpoints
4. **Perfil** - 2 endpoints
5. **Business** - 8 endpoints
6. **Chamadas** - 2 endpoints
7. **Webhooks e SSE** - 3 endpoints
8. **Enviar Mensagem** - 11 endpoints
9. **Ações na mensagem e Buscar** - 6 endpoints
10. **Chats** - 6 endpoints
11. **Contatos** - 6 endpoints
12. **Bloqueios** - 2 endpoints
13. **Etiquetas** - 3 endpoints
14. **Grupos e Comunidades** - 16 endpoints
15. **Respostas Rápidas** - 2 endpoints
16. **CRM** - 2 endpoints
17. **Mensagem em massa** - 7 endpoints
18. **Integração Chatwoot** - 2 endpoints
19. **ChatBot** - 9 endpoints
20. **Schemas** - 15 schemas
