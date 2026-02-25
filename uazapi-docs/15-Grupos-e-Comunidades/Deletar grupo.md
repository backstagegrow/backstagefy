# Deletar grupo

**Método:** `POST`  
**Endpoint:** `/group/delete`

---

## Descrição

Deleta um grupo permanentemente (requer ser admin).

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `groupId` | string | ✅ Sim | ID do grupo | `123456789@g.us` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/group/delete' \\
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
