# Deletar etiqueta

**Método:** `POST`  
**Endpoint:** `/label/delete`

---

## Descrição

Remove uma etiqueta existente.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `labelId` | string | ✅ Sim | ID da etiqueta | `label123` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/label/delete' \\
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
