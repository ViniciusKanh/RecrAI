# RecrAi — Recrutamento e Seleção Inteligente (Local)

Projeto local (sem Docker, sem venv obrigatório) com **Flask** no backend e **HTML/CSS/JS** no frontend.
O objetivo é realizar **casamento de vagas com currículos** usando **TF‑IDF + cosseno** (modo local) ou **OpenAI Embeddings** (opcional).

## Estrutura de Pastas
```
RecrAi/
├─ backend-RecrAi/
│  ├─ app.py
│  ├─ requirements.txt
│  ├─ services/
│  │  └─ matcher.py
│  └─ data/
│     └─ jobs.json
├─ frontend/
│  ├─ index.html
│  ├─ app.js
│  └─ styles.css
├─ notebooks/
│  └─ cadastrar_vagas_exemplo.py
├─ .env.example
└─ README.md
```

## Como rodar (Windows / macOS / Linux)
1. Instale dependências (globalmente mesmo, se preferir):
   ```bash
   cd RecrAi/backend-RecrAi
   pip install -r requirements.txt
   ```

2. Copie `.env.example` para `.env` e ajuste se necessário:
   ```bash
   cd ..
   copy .env.example .env   # Windows (PowerShell: cp .env.example .env)
   # ou
   cp .env.example .env     # macOS/Linux
   ```

3. Rode o backend Flask:
   ```bash
   cd backend-RecrAi
   python app.py
   ```
   Por padrão, sobe em `http://127.0.0.1:8008/` e já **serve o frontend** (index.html).

4. Abra o navegador em: **http://127.0.0.1:8008/**

> **Observação**: Sem venv é mais rápido, mas recomendo futuramente isolar as libs para evitar conflitos.

## Cadastrar vagas via Notebook
No diretório `notebooks/` há um script de exemplo `cadastrar_vagas_exemplo.py` que grava um JSON em `backend-RecrAi/data/jobs.json`.
Abra seu Notebook, cole e execute o conteúdo (ou rode o `.py` diretamente):
```python
import json, os

# === 1) Edite sua lista de vagas aqui ===
VAGAS = [
    {
        "id": "dev-python-jr",
        "titulo": "Desenvolvedor(a) Python Júnior",
        "local": "Remoto - BR",
        "descricao": "Desenvolver APIs Flask, testes unitários, integração com bancos SQL. Git, boas práticas, inglês técnico.",
        "requisitos": [
            "Python", "Flask", "SQL", "Git", "Testes Unitários", "APIs REST"
        ]
    },
    {
        "id": "cientista-dados-pl",
        "titulo": "Cientista de Dados Pleno",
        "local": "Híbrido - SP",
        "descricao": "Modelagem preditiva, EDA, MLOps básico. Scikit-learn, Pandas, métricas, documentação clara.",
        "requisitos": [
            "Pandas", "Scikit-learn", "Feature Engineering", "Métricas", "MLOps"
        ]
    }
]

# === 2) Caminho do JSON que o backend lê ===
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
jobs_path = os.path.join(project_root, "backend-RecrAi", "data", "jobs.json")

# === 3) Persistir ===
os.makedirs(os.path.dirname(jobs_path), exist_ok=True)
with open(jobs_path, "w", encoding="utf-8") as f:
    json.dump(VAGAS, f, ensure_ascii=False, indent=2)

print(f"Gravado em: {jobs_path} (total vagas: {len(VAGAS)})")
```

Depois de gravar o `jobs.json`, o backend já expõe **GET /api/v1/jobs** e o frontend carrega o combo de vagas automaticamente.

## Endpoints (resumo)
- `GET /api/v1/jobs` — lista as vagas do `jobs.json`.
- `POST /api/v1/match` — corpo `multipart/form-data` ou `application/json`:
  - `job_id` (string, obrigatório)
  - `resume_text` (string **ou**)
  - `resume_file` (PDF opcional)
  - Resposta: score (0-100), termos_chave_presentes, lacunas.

## Modo Local vs OpenAI
- **Local (padrão)**: TF-IDF + cosseno (não exige chave).
- **OpenAI (opcional)**: defina no `.env`:
  ```
  EMBEDDINGS_PROVIDER=openai
  OPENAI_API_KEY=...sua_chave...
  ```

## Licença
MIT
