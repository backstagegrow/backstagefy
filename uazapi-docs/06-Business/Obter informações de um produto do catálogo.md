# Obter informações de um produto do catálogo

**Método:** `POST`  
**Endpoint:** `/business/catalog/product`

---

## Descrição

Obtém detalhes de um produto específico do catálogo.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `productId` | string | ✅ Sim | ID do produto | `123456` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/business/catalog/product' \\
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
