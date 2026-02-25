# Deletar mensagem

**Método:** `POST`  
**Endpoint:** `/message/delete`

---

## Descrição

Deleta uma mensagem para todos os participantes.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `messageId` | string | ✅ Sim | ID da mensagem | `ABC123` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/message/delete' \\
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
