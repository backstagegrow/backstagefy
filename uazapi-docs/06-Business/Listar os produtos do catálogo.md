# Listar os produtos do catálogo

**Método:** `POST`  
**Endpoint:** `/business/catalog/products`

---

## Descrição

Lista todos os produtos cadastrados no catálogo do WhatsApp Business.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/business/catalog/products' \\
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
