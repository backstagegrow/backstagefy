# Criar Instancia

**Método:** `POST`  
**Endpoint:** `/instance/init`

---

## Descrição

Cria uma nova instância do WhatsApp.

### Requisitos:
- Ter um admintoken válido
- Enviar pelo menos o nome da instância

### Comportamento:
- A instância será criada desconectada
- Será gerado um token único para autenticação
- Após criar a instância, guarde o token retornado pois ele será necessário para todas as outras operações

### Estados possíveis da instância:
- `disconnected`: Desconectado do WhatsApp
- `connecting`: Em processo de conexão
- `connected`: Conectado e autenticado

### Campos administrativos:
- `adminField01` e `adminField02` são opcionais e podem ser usados para armazenar metadados personalizados
- Os valores desses campos são visíveis para o dono da instância via token
- Apenas o administrador da API (via admin token) pode editá-los

---

## Autenticação

| Header | Valor |
|--------|-------|
| `admintoken` | Token de administrador |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `name` | string | ✅ Sim | Nome da instância | `"minha-instancia"` |
| `systemName` | string | ❌ Não | Nome do sistema (padrão: 'uazapiGO') | `"apilocal"` |
| `adminField01` | string | ❌ Não | Campo administrativo 1 | `"custom-metadata-1"` |
| `adminField02` | string | ❌ Não | Campo administrativo 2 | `"custom-metadata-2"` |
| `fingerprintProfile` | string | ❌ Não | Perfil de fingerprint | `"chrome"` |
| `browser` | string | ❌ Não | Tipo de navegador | `"chrome"` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/instance/init' \
  -H 'Content-Type: application/json' \
  -H 'admintoken: SEU_ADMIN_TOKEN' \
  -d '{
    "name": "minha-instancia",
    "systemName": "apilocal",
    "adminField01": "custom-metadata-1",
    "adminField02": "custom-metadata-2",
    "fingerprintProfile": "chrome",
    "browser": "chrome"
  }'
```

---

## Responses

### 200 - Sucesso

```json
{
  "status": "success",
  "instance": {
    "name": "minha-instancia",
    "token": "token_unico_da_instancia",
    "status": "disconnected",
    "adminField01": "custom-metadata-1",
    "adminField02": "custom-metadata-2"
  }
}
```

### 401 - Token inválido/expirado

```json
{
  "status": "error",
  "message": "Invalid or expired admin token"
}
```

### 404 - Instância não encontrada

```json
{
  "status": "error",
  "message": "Instance not found"
}
```

### 500 - Erro interno

```json
{
  "status": "error",
  "message": "Internal server error"
}
```
