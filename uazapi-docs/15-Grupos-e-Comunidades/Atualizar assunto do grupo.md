# Atualizar assunto do grupo

**Método:** `POST`  
**Endpoint:** `/group/subject`

---

## Descrição

Atualiza o nome/assunto de um grupo.

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
| `subject` | string | ✅ Sim | Novo nome | `Novo Nome do Grupo` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/group/subject' \\
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
