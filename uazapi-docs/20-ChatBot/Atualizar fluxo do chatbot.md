# Atualizar fluxo do chatbot

**Método:** `POST`  
**Endpoint:** `/chatbot/flow/update`

---

## Descrição

Atualiza um fluxo de chatbot existente.

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
| `flow` | object | ✅ Sim | Nova definição | `{steps: []}` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/chatbot/flow/update' \\
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
