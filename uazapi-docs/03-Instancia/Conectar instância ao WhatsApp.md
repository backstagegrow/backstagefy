# Conectar instância ao WhatsApp

**Método:** `POST`  
**Endpoint:** `/instance/connect`

---

## Descrição

Inicia o processo de conexão da instância com o WhatsApp. Retorna um QR Code que deve ser escaneado pelo aplicativo WhatsApp no celular.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `waitQrCode` | boolean | ❌ Não | Aguardar QR Code (padrão: true) | `true` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/instance/connect' \\
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
