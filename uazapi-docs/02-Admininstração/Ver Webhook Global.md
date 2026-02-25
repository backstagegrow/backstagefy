# Ver Webhook Global

**Método:** `GET`  
**Endpoint:** `/webhook/global`

---

## Descrição

Retorna a configuração atual do webhook global do sistema.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `admintoken` | Token de administrador |

---

---

## Exemplo de Request

```bash
curl -X GET 'https://free.uazapi.com/webhook/global' \\
  -H 'Content-Type: application/json' \\
  -H 'admintoken: SEU_TOKEN'
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
