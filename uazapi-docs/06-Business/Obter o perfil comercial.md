# Obter o perfil comercial

**Método:** `POST`  
**Endpoint:** `/business/get/profile`

---

## Descrição

Retorna o perfil comercial da instância do WhatsApp Business. Requer uma conta WhatsApp Business.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `jid` | string | ❌ Não | JID do perfil comercial a consultar | `5511999999999@s.whatsapp.net` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/business/get/profile' \\
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
