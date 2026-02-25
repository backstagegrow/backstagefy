# Criar comunidade

**Método:** `POST`  
**Endpoint:** `/community/create`

---

## Descrição

Cria uma nova comunidade no WhatsApp.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `subject` | string | ✅ Sim | Nome da comunidade | `Minha Comunidade` |
| `groups` | array | ❌ Não | IDs dos grupos | `['123@g.us']` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/community/create' \\
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
