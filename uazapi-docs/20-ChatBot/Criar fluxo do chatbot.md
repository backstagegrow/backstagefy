# Criar fluxo do chatbot

**Método:** `POST`  
**Endpoint:** `/chatbot/flow/create`

---

## Descrição

Cria um novo fluxo de chatbot com regras e respostas automáticas.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `name` | string | ✅ Sim | Nome do fluxo | `Atendimento Inicial` |
| `flow` | object | ✅ Sim | Definição do fluxo | `{steps: []}` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/chatbot/flow/create' \\
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
