# Obter status de envio em massa

**Método:** `GET`  
**Endpoint:** `/bulk/message/status`

---

## Descrição

Retorna o status atual de um envio em massa em andamento ou concluído.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

---

## Exemplo de Request

```bash
curl -X GET 'https://free.uazapi.com/bulk/message/status' \\
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
