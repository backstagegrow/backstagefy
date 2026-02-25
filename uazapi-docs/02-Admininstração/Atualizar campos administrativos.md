# Atualizar campos administrativos

**Método:** `POST`  
**Endpoint:** `/instance/update-admin-fields`

---

## Descrição

Atualiza os campos administrativos (adminField01 e adminField02) de uma instância específica.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `admintoken` | Token de administrador |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `instanceId` | string | ✅ Sim | ID da instância | `12345` |
| `adminField01` | string | ❌ Não | Campo administrativo 1 | `valor-1` |
| `adminField02` | string | ❌ Não | Campo administrativo 2 | `valor-2` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/instance/update-admin-fields' \\
  -H 'Content-Type: application/json' \\
  -H 'admintoken: SEU_ADMIN_TOKEN' \\
  -d '{
    "instanceId": "12345",
    "adminField01": "novo-valor-1",
    "adminField02": "novo-valor-2"
  }'
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
