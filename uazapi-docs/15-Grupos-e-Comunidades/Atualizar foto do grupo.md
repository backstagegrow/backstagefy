# Atualizar foto do grupo

**Método:** `POST`  
**Endpoint:** `/group/picture`

---

## Descrição

Atualiza a foto de um grupo.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `groupId` | string | ✅ Sim | ID do grupo | `123456789@g.us` |
| `image` | string | ✅ Sim | Imagem em base64 ou URL | `data:image/jpeg;base64,...` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/group/picture' \\
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
