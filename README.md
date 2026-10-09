# Rimivo Insights API

Serviço separado para métricas anônimas dos sites públicos e centralização de leads.

Não armazena IP, user-agent, fingerprint, URL completa de referência nem identificador anônimo em texto puro. O visitante e a sessão são transformados em HMAC antes da persistência.

## Variáveis obrigatórias

- `INSIGHTS_DB_PATH`: caminho do SQLite em disco persistente.
- `INSIGHTS_HASH_SECRET`: segredo aleatório com 32+ caracteres.
- `INSIGHTS_ADMIN_TOKEN`: token com 24+ caracteres para relatórios.
- `INSIGHTS_ALLOWED_ORIGINS`: origens permitidas, separadas por vírgula.
- `INSIGHTS_EVENT_RETENTION_DAYS`: retenção das métricas (padrão técnico: 400 dias).
- `INSIGHTS_LEAD_RETENTION_DAYS`: retenção dos leads (padrão técnico: 730 dias). A Rimivo deve aprovar o prazo antes da publicação comercial.

## Rotas

- `GET /health`
- `POST /v1/events`
- `POST /v1/leads`
- `GET /v1/reports/weekly?site=rimivo&days=7` com Bearer administrativo.
- `GET /v1/admin/leads` e `PATCH /v1/admin/leads/:id/status` com Bearer administrativo.
- `POST /v1/admin/privacy/search` e `DELETE /v1/admin/leads/:id` para rotinas de titular, sempre com Bearer administrativo e procedimento interno de verificação da identidade.

O deploy e a criação de disco/secrets exigem autorização separada. Nunca reutilize banco, disco ou secrets do É Massa Delivery.
