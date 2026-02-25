# Configurar integração Chatwoot

**Método:** `POST`  
**Endpoint:** `/chatwoot/config`

---

## Descrição

Configura a integração com a plataforma Chatwoot para gerenciamento de conversas.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `chatwootUrl` | string | ✅ Sim | URL da instância Chatwoot | `https://chatwoot.exemplo.com` |
| `apiToken` | string | ✅ Sim | Token de API do Chatwoot | `token123` |
| `accountId` | number | ✅ Sim | ID da conta | `1` |
| `inboxId` | number | ✅ Sim | ID da caixa de entrada | `1` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/chatwoot/config' \\
  -H 'Content-Type: application/json' \\
  -H 'token: SEU_TOKEN'
```

---

## Responses

### 200 - Sucesso

```json
{
  "status": "success"
}
```

### 401 - Token inválido/expirado

```json
{
  "status": "error",
  "message": "Invalid or expired token"
}
```

### 500 - Erro interno

```json
{
  "status": "error",
  "message": "Internal server error"
}
```
