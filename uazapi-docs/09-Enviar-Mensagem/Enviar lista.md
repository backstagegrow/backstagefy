# Enviar lista

**Método:** `POST`  
**Endpoint:** `/message/send/list`

---

## Descrição

Envia uma mensagem com lista de opções interativas.

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
| `title` | string | ✅ Sim | Título da lista | `Escolha uma opção` |
| `sections` | array | ✅ Sim | Seções da lista | `[{title: 'Opções', rows: [{title: 'Opção 1'}]}]` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/message/send/list' \\
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
