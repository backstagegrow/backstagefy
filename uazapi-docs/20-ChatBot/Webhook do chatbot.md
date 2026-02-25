# Webhook do chatbot

**Método:** `POST`  
**Endpoint:** `/chatbot/webhook`

---

## Descrição

Endpoint de webhook para processar mensagens recebidas pelo chatbot.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `event` | string | ✅ Sim | Tipo de evento | `message` |
| `data` | object | ✅ Sim | Dados do evento | `{}` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/chatbot/webhook' \\
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
