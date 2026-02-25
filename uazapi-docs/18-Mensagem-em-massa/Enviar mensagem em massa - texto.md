# Enviar mensagem em massa - texto

**Método:** `POST`  
**Endpoint:** `/bulk/message/text`

---

## Descrição

Envia mensagens de texto para múltiplos destinatários.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `numbers` | array | ✅ Sim | Lista de números | `['5511999999999', '5511888888888']` |
| `text` | string | ✅ Sim | Texto da mensagem | `Olá a todos!` |
| `delay` | number | ❌ Não | Delay entre envios (ms) | `1000` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/bulk/message/text' \\
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
