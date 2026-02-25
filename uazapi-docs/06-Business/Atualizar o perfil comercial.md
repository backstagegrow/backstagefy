# Atualizar o perfil comercial

**Método:** `POST`  
**Endpoint:** `/business/update/profile`

---

## Descrição

Atualiza as informações do perfil comercial do WhatsApp Business.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `description` | string | ❌ Não | Descrição do negócio | `Descrição da empresa` |
| `address` | string | ❌ Não | Endereço | `Rua Exemplo, 123` |
| `email` | string | ❌ Não | Email de contato | `contato@empresa.com` |
| `category` | string | ❌ Não | Categoria do negócio | `TECHNOLOGY` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/business/update/profile' \\
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
