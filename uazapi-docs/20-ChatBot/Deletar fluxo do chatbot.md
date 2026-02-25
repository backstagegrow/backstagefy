# Deletar fluxo do chatbot

**Método:** `POST`  
**Endpoint:** `/chatbot/flow/delete`

---

## Descrição

Remove um fluxo de chatbot permanentemente.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `flowId` | string | ✅ Sim | ID do fluxo | `flow123` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/chatbot/flow/delete' \\
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
