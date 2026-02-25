# Atualizar status de presença da instância

**Método:** `POST`  
**Endpoint:** `/instance/presence`

---

## Descrição

Atualiza o status de presença da instância (online/offline).

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `presence` | string | ✅ Sim | Status de presença | `online` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/instance/presence' \\
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
