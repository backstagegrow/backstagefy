# Altera o nome do perfil do WhatsApp

**Método:** `POST`  
**Endpoint:** `/profile/name`

---

## Descrição

Atualiza o nome do perfil do WhatsApp Business vinculado à instância.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `name` | string | ✅ Sim | Novo nome do perfil | `Meu Negócio` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/profile/name' \\
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
