# Buscar mensagens

**Método:** `POST`  
**Endpoint:** `/message/fetch`

---

## Descrição

Busca mensagens de um chat específico com paginação.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `number` | string | ✅ Sim | Número do chat | `5511999999999` |
| `limit` | number | ❌ Não | Limite de mensagens | `50` |
| `cursor` | string | ❌ Não | Cursor para paginação | `cursor123` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/message/fetch' \\
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
