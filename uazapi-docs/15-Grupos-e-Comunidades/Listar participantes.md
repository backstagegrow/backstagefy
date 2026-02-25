# Listar participantes

**Método:** `GET`  
**Endpoint:** `/group/participants`

---

## Descrição

Retorna a lista de todos os participantes de um grupo.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

---

## Exemplo de Request

```bash
curl -X GET 'https://free.uazapi.com/group/participants' \\
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
