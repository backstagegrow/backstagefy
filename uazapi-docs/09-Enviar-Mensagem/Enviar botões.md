# Enviar botões

**Método:** `POST`  
**Endpoint:** `/message/send/buttons`

---

## Descrição

Envia uma mensagem com botões interativos.

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
| `text` | string | ✅ Sim | Texto da mensagem | `Escolha uma opção:` |
| `buttons` | array | ✅ Sim | Botões | `[{buttonId: '1', buttonText: 'Opção 1'}]` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/message/send/buttons' \\
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
