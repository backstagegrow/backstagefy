# Adicionar participante

**Método:** `POST`  
**Endpoint:** `/group/participant/add`

---

## Descrição

Adiciona um ou mais participantes ao grupo.

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
| `participants` | array | ✅ Sim | Lista de números | `['5511999999999']` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/group/participant/add' \\
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
