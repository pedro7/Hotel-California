# Hotel — gestão de hóspedes

Aplicação para atendentes de hotel: login, cadastro e busca de hóspedes, reservas, check-in e check-out com cálculo detalhado da conta.

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.12, Django 5.2, Django REST Framework, PostgreSQL 16 |
| Frontend | React 19, Vite, React Router |
| Infraestrutura | Docker Compose (`db`, `backend`, `frontend`) |

## Sumário

1. [Pré-requisitos](#1-pré-requisitos)
2. [Configurando o ambiente com Docker (recomendado)](#2-configurando-o-ambiente-com-docker-recomendado)
3. [Executando sem Docker (alternativa)](#3-executando-sem-docker-alternativa)
4. [Variáveis de ambiente](#4-variáveis-de-ambiente)
5. [Comandos do dia a dia](#5-comandos-do-dia-a-dia)
6. [Testes](#6-testes)
7. [Solução de problemas](#7-solução-de-problemas)
8. [Estrutura do repositório](#8-estrutura-do-repositório)
9. [Regras de negócio](#9-regras-de-negócio)
10. [API](#10-api)

---

## 1. Pré-requisitos

**Para o caminho com Docker (recomendado) você só precisa de:**

- [Git](https://git-scm.com/)
- [Docker](https://docs.docker.com/get-docker/) com **Docker Compose v2** (`docker compose version` deve funcionar). No Windows e no macOS, o Docker Desktop já inclui o Compose.

**Só se for rodar sem Docker** ([seção 3](#3-executando-sem-docker-alternativa)):

- Python 3.12
- Node.js 20 ou superior (com npm)
- PostgreSQL 16 (ou compatível) em execução

Portas usadas na sua máquina: **5173** (frontend), **8000** (backend) e **5432** (Postgres). Se alguma estiver ocupada, veja a [solução de problemas](#7-solução-de-problemas).

## 2. Configurando o ambiente com Docker (recomendado)

### 2.1 Clonar o repositório

```bash
git clone <url-do-repositorio> hotel
cd hotel
```

### 2.2 Criar os arquivos de ambiente

São dois arquivos, ambos ignorados pelo Git (nunca são versionados). Cada um tem um modelo `.env.example` versionado.

| Arquivo | Para quê | Modelo |
|---|---|---|
| `.env` (raiz) | credenciais do Postgres, lidas pelo Docker Compose | `.env.example` |
| `backend/.env.local` | configurações do Django | `backend/.env.example` |

Linux, macOS ou Git Bash:

```bash
cp .env.example .env
cp backend/.env.example backend/.env.local
```

PowerShell (Windows):

```powershell
Copy-Item .env.example .env
Copy-Item backend\.env.example backend\.env.local
```

Depois **edite os valores**:

- `.env`: defina `POSTGRES_DB`, `POSTGRES_USER` e `POSTGRES_PASSWORD` (valores livres; o banco é criado com eles na primeira subida).
- `backend/.env.local`: troque `DJANGO_SECRET_KEY` por uma chave própria. Para gerar uma:
  ```bash
  docker run --rm python:3.12-slim python -c "import secrets; print(secrets.token_urlsafe(50))"
  ```
  Mantenha `DJANGO_DEBUG=True` em desenvolvimento.

> **Atenção:** se algum valor do `.env` contiver o caractere `$`, escreva `$$`. Caso contrário o Compose o interpreta como variável e avisa `The "xyz" variable is not set`.

### 2.3 Subir os containers

```bash
docker compose up --build
```

Na primeira vez isso baixa as imagens, instala as dependências, cria o banco e aplica as migrações automaticamente. Quando aparecer `Starting development server at http://0.0.0.0:8000/`, está pronto. Para rodar em segundo plano, use `docker compose up -d --build`.

### 2.4 Criar o primeiro atendente

Não existe cadastro público: só atendentes cadastrados acessam o sistema. Com os containers no ar, em outro terminal:

```bash
docker compose exec backend python manage.py createsuperuser
```

Informe usuário e senha (e-mail é opcional). Outros atendentes podem ser criados depois pelo Django admin.

### 2.5 Acessar

| O quê | Endereço |
|---|---|
| Aplicação (faça login aqui) | http://localhost:5173 |
| API | http://localhost:8000/api/ |
| Django admin | http://localhost:8000/admin/ |

O frontend conversa com a API pelo mesmo endereço (`/api` é repassado pelo servidor do Vite ao Django), então não há configuração de CORS a fazer no uso normal.

### 2.6 Parar e limpar

```bash
docker compose down        # para os containers, mantém o banco
docker compose down -v     # para e APAGA o banco (volume do Postgres)
```

## 3. Executando sem Docker (alternativa)

Útil para depurar. Você precisa de um PostgreSQL local.

### 3.1 Banco de dados

Crie um banco e um usuário (exemplo com `psql`):

```sql
CREATE USER hotel WITH PASSWORD 'hotel';
CREATE DATABASE hotel OWNER hotel;
ALTER USER hotel CREATEDB;  -- necessário para o Django criar o banco temporário dos testes
```

### 3.2 Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt

# variáveis de ambiente (Windows PowerShell: $env:NOME="valor")
export DB_NAME=hotel DB_USER=hotel DB_PASSWORD=hotel DB_HOST=localhost DB_PORT=5432
export DJANGO_SECRET_KEY=troque-esta-chave DJANGO_DEBUG=True

python manage.py migrate
python manage.py createsuperuser
python manage.py runserver        # http://localhost:8000
```

> `DB_HOST` precisa ser `localhost`: o valor padrão (`db`) só existe dentro da rede do Docker Compose.

### 3.3 Frontend

Em outro terminal:

```bash
cd frontend
npm install
VITE_API_PROXY_TARGET=http://localhost:8000 npm run dev   # http://localhost:5173
# Windows PowerShell: $env:VITE_API_PROXY_TARGET="http://localhost:8000"; npm run dev
```

## 4. Variáveis de ambiente

| Variável | Onde | Padrão | Descrição |
|---|---|---|---|
| `POSTGRES_DB` | `.env` | — | nome do banco criado pelo container `db` |
| `POSTGRES_USER` | `.env` | — | usuário do Postgres |
| `POSTGRES_PASSWORD` | `.env` | — | senha do Postgres |
| `DJANGO_SECRET_KEY` | `backend/.env.local` | chave insegura de desenvolvimento | chave secreta do Django (obrigatório trocar em produção) |
| `DJANGO_DEBUG` | `backend/.env.local` | `False` | só o valor exato `True` ativa o modo debug |
| `DJANGO_ALLOWED_HOSTS` | ambiente do backend | `localhost,127.0.0.1` | hosts aceitos, separados por vírgula |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | definidas pelo Compose a partir de `POSTGRES_*` | — | conexão do Django com o banco |
| `DB_HOST`, `DB_PORT` | definidas pelo Compose | `db`, `5432` | endereço do Postgres (use `localhost` fora do Docker) |
| `VITE_API_PROXY_TARGET` | ambiente do frontend | `http://backend:8000` | para onde o Vite repassa `/api` (use `http://localhost:8000` fora do Docker) |

## 5. Comandos do dia a dia

```bash
docker compose up -d                                   # sobe tudo em segundo plano
docker compose logs -f backend                         # acompanha os logs
docker compose exec backend python manage.py migrate   # aplica migrações
docker compose exec backend python manage.py makemigrations
docker compose exec backend python manage.py shell
docker compose exec db psql -U <POSTGRES_USER> -d <POSTGRES_DB>
docker compose build frontend                          # necessário ao alterar dependências do frontend
npm run lint                                           # (em frontend/) análise estática
```

Alterações em `backend/` e em `frontend/src/` são recarregadas automaticamente. Mudou `requirements.txt` ou `package.json`? Rode `docker compose up --build`.

## 6. Testes

Backend (runner do Django; cria e remove um banco `test_*` no Postgres do Compose, que precisa estar no ar):

```bash
docker compose run --rm backend python manage.py test
```

Frontend (Vitest + React Testing Library):

```bash
docker compose run --rm --no-deps frontend npm test
```

O que os testes cobrem:

| Área | Onde | O que valida |
|---|---|---|
| Preços e horários | `backend/apps/reservations/tests/test_pricing.py` | diária R$ 120 / R$ 180, vaga R$ 15 / R$ 20, check-in a partir das 14h, check-out até 12h, taxa de 50% |
| Fluxos | `.../tests/test_services.py` | check-in, check-out, cancelamento, transições de status inválidas, total gravado no check-out |
| API de reservas | `.../tests/test_api.py` | validações, filtros, alerta de check-in antecipado, conta detalhada |
| Hóspedes | `backend/apps/guests/tests/` | cadastro, documento único, busca por nome/documento/telefone, "no hotel" e "aguardando check-in" |
| Login | `backend/apps/accounts/tests/` | sessão, CSRF, limite de tentativas |
| Frontend | `frontend/src/**/*.test.*` | formatação, cliente da API, login e rotas protegidas, listas e filtros, check-in (com alerta), check-out (com conta), cadastro de hóspede e reserva |

## 7. Solução de problemas

| Sintoma | Causa e solução |
|---|---|
| `InconsistentMigrationHistory: Migration admin.0001_initial is applied before its dependency accounts.0001_initial` | O banco foi migrado antes do usuário customizado existir. Em desenvolvimento, recrie o banco: `docker compose down -v` e depois `docker compose up --build`. **Apaga os dados locais.** |
| `ModuleNotFoundError` ou `Failed to resolve import` no frontend | A imagem está desatualizada em relação ao `package.json`. Rode `docker compose build frontend`. |
| `env file ... backend/.env.local not found` | Falta criar o arquivo (passo [2.2](#22-criar-os-arquivos-de-ambiente)). |
| `port is already allocated` / porta ocupada | Outro programa usa 5173, 8000 ou 5432 (muitas vezes um Postgres local). Pare-o, ou troque o lado esquerdo do mapeamento em `docker-compose.yaml` (por exemplo `"5433:5432"`). |
| `The "xyz" variable is not set` ao rodar o Compose | Um valor do `.env` contém `$`. Use `$$`. |
| `Invalid HTTP_HOST header` / `DisallowedHost` | O host acessado não está em `DJANGO_ALLOWED_HOSTS`. |
| Login retorna 401 | Usuário ou senha incorretos, ou nenhum atendente criado (passo [2.4](#24-criar-o-primeiro-atendente)). |
| Muitas tentativas de login (429) | Limite de 10 tentativas por minuto. Aguarde um minuto. |
| A API responde 403 sem estar logado | Esperado: todas as rotas, exceto `/api/auth/csrf/` e `/api/auth/login/`, exigem sessão. |

## 8. Estrutura do repositório

```
.
├── docker-compose.yaml
├── .env.example                  # modelo do .env (Postgres)
├── backend/
│   ├── .env.example              # modelo do backend/.env.local (Django)
│   ├── hotel/                    # configuração do projeto Django (settings, urls)
│   └── apps/
│       ├── accounts/             # atendentes, login por sessão + CSRF
│       ├── guests/               # cadastro e busca de hóspedes
│       └── reservations/         # reservas, check-in/out, preços (pricing.py), fluxos (services.py)
└── frontend/
    └── src/
        ├── api/                  # cliente HTTP e endpoints
        ├── auth/                 # contexto de sessão
        ├── components/           # componentes compartilhados
        ├── pages/                # telas (login, reservas, hóspedes)
        └── hooks/, utils/, test/
```

## 9. Regras de negócio

- Diária: seg–sex R$ 120,00 · sáb–dom R$ 180,00 (uma diária por noite, pelo dia da semana de cada noite).
- Vaga de carro: seg–sex R$ 15,00 · sáb–dom R$ 20,00 por noite.
- Check-in a partir das 14h00; antes disso o sistema alerta e o atendente confirma.
- Check-out até 12h00; depois disso, taxa de 50% da diária do dia da saída (não inclui a vaga). Sair antes do dia previsto de saída nunca gera a taxa.
- No check-out a conta é exibida em detalhes e o total fica gravado na reserva.
- Fuso horário do hotel: `America/Sao_Paulo`.

## 10. API

Todas as rotas exigem sessão, exceto `csrf` e `login`. Requisições que alteram dados enviam o cookie `csrftoken` no cabeçalho `X-CSRFToken` (o frontend já faz isso).

| Método e rota | Descrição |
|---|---|
| `GET /api/auth/csrf/` | define o cookie CSRF |
| `POST /api/auth/login/` · `POST /api/auth/logout/` · `GET /api/auth/me/` | sessão do atendente |
| `GET/POST /api/guests/` · `GET/PATCH /api/guests/{id}/` | hóspedes. Filtros: `name`, `document`, `phone`, `search`, `in_hotel=true`, `awaiting_check_in=true` |
| `GET/POST /api/reservations/` · `GET/PATCH /api/reservations/{id}/` | reservas. Filtros: `status` (`RESERVED`, `CHECKED_IN`, `CHECKED_OUT`, `CANCELED`, separados por vírgula), `guest`, `search`, `name`, `document`, `phone` |
| `POST /api/reservations/{id}/check-in/` | check-in; antes das 14h responde 409 `early_check_in` até enviar `{"confirm_early": true}` |
| `GET /api/reservations/{id}/bill/` | conta detalhada (prévia, se o hóspede ainda está no hotel) |
| `POST /api/reservations/{id}/check-out/` | check-out; devolve a reserva e a conta detalhada |
| `POST /api/reservations/{id}/cancel/` | cancela uma reserva ainda não iniciada |
