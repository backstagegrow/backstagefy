# Enviar resposta rápida

**Método:** `POST`  
**Endpoint:** `/quick-reply/send`

---

## Descrição

Envia uma mensagem predefinida de resposta rápida.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `number` | string | ✅ Sim | Número do destinatário | `5511999999999` |
| `shortcut` | string | ✅ Sim | Atalho da resposta | `/ola` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/quick-reply/send' \\
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
