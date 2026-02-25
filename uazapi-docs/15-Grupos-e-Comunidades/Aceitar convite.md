# Aceitar convite

**Método:** `POST`  
**Endpoint:** `/group/invite/accept`

---

## Descrição

Aceita um convite para entrar em um grupo usando o código.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `inviteCode` | string | ✅ Sim | Código do convite | `ABC123DEF` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/group/invite/accept' \\
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
