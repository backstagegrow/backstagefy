# Enviar localização

**Método:** `POST`  
**Endpoint:** `/message/send/location`

---

## Descrição

Envia uma localização no mapa.

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
| `latitude` | number | ✅ Sim | Latitude | `-23.550520` |
| `longitude` | number | ✅ Sim | Longitude | `-46.633308` |
| `description` | string | ❌ Não | Descrição do local | `São Paulo` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/message/send/location' \\
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
