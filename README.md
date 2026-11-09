# Hotel California

Sistema de gestão de hóspedes e reservas para atendentes de hotel.

**Funcionalidades:** login de atendentes, cadastro e busca de hóspedes, reservas (com bloqueio de períodos sobrepostos), check-in (com alerta antes das 14h), check-out com conta detalhada e cancelamento. As listas têm paginação e ordenação por coluna.

**Regras de preço:** diária de R$ 120 (seg–sex) ou R$ 180 (sáb–dom); vaga de carro de R$ 15 ou R$ 20 por noite; check-out até 12h, e depois disso taxa de 50% da diária.

## Tecnologias

| Camada | Stack |
|---|---|
| Backend | Python 3.12, Django 5.2, Django REST Framework, PostgreSQL 16, Gunicorn |
| Frontend | React 19, Vite, React Router |
| Testes | Django TestCase, Vitest + Testing Library, Playwright (end-to-end) |
| Infra | Docker Compose, Caddy (HTTPS automático), GitHub Actions |

## Rodando localmente

Pré-requisitos: [Git](https://git-scm.com/) e [Docker](https://docs.docker.com/get-docker/) com Compose v2. As portas 5173, 8000 e 5432 precisam estar livres.

```bash
git clone <url-do-repositorio> hotel-california
cd hotel-california

# arquivos de ambiente (edite os valores: usuário/senha do Postgres e DJANGO_SECRET_KEY)
cp .env.example .env
cp backend/.env.example backend/.env.local

docker compose up --build
```

Com os containers no ar, em outro terminal, crie um atendente (não há cadastro público) e, se quiser, dados de exemplo:

```bash
docker compose exec backend python manage.py createsuperuser
docker compose exec backend python manage.py seed_demo      # opcional: 55 hóspedes com reservas
```

Acesse **http://localhost:5173** e faça login. Para parar: `docker compose down` (use `-v` para apagar o banco).

## Testes

```bash
# unitários e de API (backend)
docker compose run --rm backend python manage.py test

# unitários de componentes e telas (frontend)
docker compose run --rm --no-deps frontend npm test

# end-to-end: um navegador real usa o app, em um stack isolado com banco descartável
docker compose -f docker-compose.e2e.yaml up --build --abort-on-container-exit --exit-code-from e2e
docker compose -f docker-compose.e2e.yaml down -v
```

Os testes end-to-end cobrem login, layout das grades, paginação, ordenação, o fluxo de reserva, check-in, check-out e cancelamento. Para assistir à execução, use `docker compose -f docker-compose.e2e.yaml --profile ui up e2e-ui` e abra http://localhost:8080.

## Deploy e CI/CD

A aplicação está em produção em um Droplet da DigitalOcean, rodando `docker-compose.prod.yaml`: o Caddy faz o HTTPS automático e serve o build do React, e repassa `/api` e `/admin` para o Django (Gunicorn), que usa o PostgreSQL.

O pipeline do GitHub Actions (`.github/workflows/deploy.yml`) roda a cada push:

1. testes do backend, com Postgres;
2. lint, testes e build do frontend;
3. testes end-to-end com Playwright;
4. se tudo passar e o push for na `main`, deploy automático por SSH (`git pull` e `docker compose up -d --build` no servidor).

Pull requests executam apenas os testes.
