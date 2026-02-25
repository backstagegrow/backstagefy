# Listar comunidades

**Método:** `GET`  
**Endpoint:** `/community/list`

---

## Descrição

Retorna a lista de todas as comunidades.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

---

## Exemplo de Request

```bash
curl -X GET 'https://free.uazapi.com/community/list' \\
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
