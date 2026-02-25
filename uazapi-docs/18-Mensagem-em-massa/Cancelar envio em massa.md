# Cancelar envio em massa

**Método:** `POST`  
**Endpoint:** `/bulk/message/cancel`

---

## Descrição

Cancela um envio em massa que está em andamento.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `batchId` | string | ✅ Sim | ID do lote | `batch123` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/bulk/message/cancel' \\
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
