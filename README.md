# RecrAI — Recrutamento & Seleção Inteligente

> Triagem de currículos com **fit por vaga robusto**, **ranking combinado** e uma **SPA** (HTML/CSS/JS puro) integrada a um **backend FastAPI**. Persistência simples via JSON em `data/`.

<p align="left">
  <img src="https://media.licdn.com/dms/image/v2/D4D03AQFWKIYIP-Tdng/profile-displayphoto-crop_800_800/B4DZjD2zUQGgAQ-/0/1755632584170?e=1762387200&v=beta&t=8o_qAlVtDbDcXEd5dBnzYPMsWsp2om48tpUSsTn2qoI" alt="Vinícius" height="72" style="border-radius:12px;margin-right:8px;vertical-align:middle;">
  <a href="https://github.com/ViniciusKanh"><img src="https://img.shields.io/badge/GitHub-ViniciusKanh-181717?logo=github" alt="GitHub"></a>
  <a href="https://www.linkedin.com/in/vinicius-souza-santoss/"><img src="https://img.shields.io/badge/LinkedIn-Vinicius%20Souza%20Santos-0A66C2?logo=linkedin" alt="LinkedIn"></a>
</p>

---

## 1) Sobre o projeto (visão geral)

* **Objetivo:** reduzir tempo e viés na triagem, priorizando candidatos com melhor **fit** para cada vaga e mantendo um **score base** de qualidade do CV.
* **Diferenciais técnicos:**

  * *Fit por vaga realmente confiável*: normalização com remoção de acentos, **sinonímia leve**, **bigrams** e **canonização** (ex.: “ci cd” → “cicd”, “node.js” → “node”).
  * **Ranking por vaga** com ponderação ajustável via env (`FIT_WEIGHT`).
  * **CRUD completo de vagas** com persistência em `data/jobs.json`.
  * **Banco de Talentos** com exclusão (hard via API + soft local no front), comparação e sugestões de vagas por perfil.
* **Arquitetura:**

  * Frontend: SPA em HTML/CSS/JS puro (sem build), pronto para **GitHub Pages**.
  * Backend: **FastAPI** + Uvicorn, pronto para **HF Spaces / Render / Railway / VPS**.
  * Persistência: arquivos JSON em `data/` (`jobs.json`, `cvs.json`).
---

## 2) Documentação do modelo utilizado

### 2.1. Qual modelo e por quê

* **LLM padrão:** `deepseek-r1-distill-llama-70b` (via **Groq API**), configurado por `PROVIDER` e `GROQ_API_KEY`.
* **Motivações da escolha:**

  * **Raciocínio/distilação:** a família *DeepSeek R1 (distill)* agrega bom custo-benefício em tarefas de **extração estruturada** e **avaliação textual curta**, com respostas estáveis para **instruções determinísticas** (temperaturas baixas).
  * **Latência e throughput (Groq):** a Groq prioriza **baixa latência** e **alto QPS**, importante para upload em lote de CVs.
  * **Disponibilidade multi-provedor:** a camada `llm_client.py` permite **trocar de provedor/modelo** sem alterar o restante do sistema.

> Você pode usar outro modelo compatível (ex.: Llama-3.1-70B-Instruct, Mixtral, etc.). Basta ajustar `PROVIDER`, `GROQ_API_KEY` (ou credencial equivalente) e `GROQ_MODEL_ID`/variável do provedor.

---

### 2.2. Entrada do modelo (contrato)

O backend chama o LLM com **duas entradas textuais**:

1. **`job_details`**: descrição consolidada da vaga (título, descrição, detalhes e requisitos).
2. **`cv_text`**: texto “plano” do currículo (extraído do PDF ou colado).

Ambas são passadas em um **prompt estruturado** (ver §2.4).

---

### 2.3. Saída do modelo (contrato)

O LLM deve retornar **JSON válido** seguindo o **schema** abaixo:

```json
{
  "name": "string",
  "area": "string",
  "summary": "string",
  "skills": ["string", "..."],
  "education": "string",
  "interview_questions": ["string", "..."],
  "strengths": ["string", "..."],
  "areas_for_development": ["string", "..."],
  "important_considerations": ["string", "..."],
  "final_recommendations": "string",
  "score": 0
}
```

* **`score`**: inteiro/float em **0–100** (qualidade geral do CV), **independente da vaga**.
* O backend valida e persiste este objeto em `data/cvs.json`.

> Caso o modelo devolva algo fora do formato, a chamada falha com **HTTP 500/503**, e a exceção é tratada no `app.py` (handlers de erro).

---

### 2.4. Estratégia de prompting

O `llm_client.py` monta um **prompt determinístico** do tipo *“system + user”*, contendo:

* **Instruções explícitas** (obrigatoriedade de JSON puro, sem comentários/markdown).
* **Campos e exemplos** do schema desejado.
* **Contexto da vaga** (`job_details`) + **texto do CV** (`cv_text`).
* **Regras de avaliação** (clareza, senioridade, organização, evidências de impacto, etc.) mapeadas para o `score`.

**Boas práticas adotadas:**

* **Temperatura baixa** (`TEMPERATURE`, ex.: `0.2–0.7`) para reduzir variação estocástica.
* **Proibição de texto fora do JSON** via instruções rígidas no *system prompt*.
* **Recuperação/validação**: o backend **valida o JSON** e, se necessário, retorna erro claro ao cliente (front).

---

### 2.5. Pré-processamento local (fit por vaga)

Após salvar o resultado do LLM, o **fit por vaga** é calculado **localmente**, sem depender do modelo:

1. **Deacentuação & limpeza**
   `á→a`, `ç→c`, minúsculas e remoção de símbolos ruidosos.

2. **Canonização (sinonímia leve)**
   Mapa de equivalências comuns:

   * `"ci cd" → "cicd"`, `"node.js" → "node"`, `"postgres" → "postgresql"`,
   * `"rest"/"apis rest" → "api"`, `"k8s" → "kubernetes"`, `"typescript" → "ts"` (apenas onde for seguro).

3. **Tokenização rica**

   * **Unigramas + bigramas**: ex. `"feature engineering"`, `"api rest"`.
   * **Versão colada** para capturar variações: `"ci cd" → "cicd"`.

4. **Matching permissivo e semântico leve**
   Para cada requisito `r`, gera-se o conjunto de tokens de `r`.
   Existe **match** se **qualquer token** de `r` estiver **contido** em **qualquer token** do CV (ou vice-versa).
   Ex.: `"typescript"` ↔ `"ts"`, `"k8s"` ↔ `"kubernetes"`.

**Fórmula do fit:**

```
fit(job, cv) = (#requisitos com match / #requisitos totais) * 100
```

> Se `requirements` vazio → `fit = 0`.
> Se o CV não gera tokens válidos → `fit = 0` (evita falso-positivo).

---

### 2.6. Score base (LLM) e score combinado

* **`base_score` (`score`)**: devolvido pelo LLM (**0–100**). Mede **qualidade geral do CV** (clareza, organização, escopo, impacto, senioridade).

* **`combined` (ranking por vaga)**:

  ```
  combined = fit * FIT_WEIGHT + base_score * (1 - FIT_WEIGHT)
  ```

  * **`FIT_WEIGHT`** (env): `0.0..1.0`.
    Recomendado: **`0.7`** (prioriza compatibilidade com a vaga).
  * `combined` é **reenquadrado para 0–100** no front.

---

### 2.7. Parâmetros de execução

| Variável         | Função                         | Exemplo                         |
| ---------------- | ------------------------------ | ------------------------------- |
| `FIT_WEIGHT`     | Peso do `fit` no `combined`    | `0.7`                           |
| `PROVIDER`       | Provedor do LLM                | `groq`                          |
| `GROQ_API_KEY`   | Chave do provedor              | `***`                           |
| `GROQ_MODEL_ID`  | Modelo LLM utilizado           | `deepseek-r1-distill-llama-70b` |
| `TEMPERATURE`    | Aleatoriedade do LLM           | `0.2–0.7`                       |
| `ALLOWED_ORIGIN` | Domínio do GitHub Pages (CORS) | `https://...`                   |

---

### 2.8. Determinismo, latência e custos

* **Determinismo:** usar **temperatura baixa** e **prompts estáveis** reduz variação.
  (O mesmo CV pode variar um pouco; persistimos o resultado para garantir reprodutibilidade local.)
* **Latência:** depende do provedor; a Groq prioriza **inferencia de baixa latência**.
* **Custos:** diretamente proporcionais a tokens de entrada/saída; prompts compactos ajudam.

> Se quiser **máximo determinismo**: fixe `TEMPERATURE` baixo e **evite reprocessar** o mesmo CV desnecessariamente.

---

### 2.9. Falhas conhecidas & mitigação

* **JSON inválido do LLM:** raramente o modelo insere texto fora do JSON.
  *Mitigação:* *prompting* restritivo + validação de JSON + erro HTTP amigável.
* **Falsos positivos de fit:** o *matching* permissivo pode marcar “API” quando o CV cita “conhecimento básico”.
  *Mitigação:* ajustar **mapa de canonização** e, se necessário, **exigir evidências** (ex.: palavras “projetou”, “manteve”, “em produção”) — pode ser adicionada como **regra futura**.
* **Dependência de qualidade do PDF:** extração ruim → score ruim.
  *Mitigação:* use PDFs exportados (não escaneados) ou colagem de texto (aba “Colar Texto”).

---

### 2.10. Tuning prático (como ajustar para seu contexto)

1. **Agressividade do fit:**

   * Aumente `FIT_WEIGHT` se quiser **priorizar requisitos**.
   * Diminua se preferir **balancear com qualidade geral** do CV.

2. **Sinonímia/canonização:**

   * Edite o mapa no front (`app.js`) e/ou inclua **“sinônimos setoriais”** (ex.: “ORM” ↔ “Prisma/SQLAlchemy”, “mensageria” ↔ “Kafka/RabbitMQ”).

3. **Critérios do `score` (LLM):**

   * Refine o *prompt* no `llm_client.py`: detalhe **o que pontua alto** (impacto, escalabilidade, métricas) e **o que penaliza** (vaguidão, buzzwords sem evidência).

4. **Temperatura:**

   * Para **batch** grandes, use **`TEMPERATURE` menor** (mais consistência).

---

### 2.11. Auditoria e explicabilidade

* **Rastreabilidade**: `cvs.json` guarda o **payload estruturado** gerado pelo LLM.
* **Explicabilidade**:

  * O **fit** é auditável (derivado do texto do CV e dos requisitos, com regras claras).
  * O **score base** é inferido pelo LLM conforme **critérios do prompt** (documentados no código).
* **Inspeção**: `GET /jobs/{job_id}/fit/{cv_id}` permite ver **fit** e **combined** por par vaga-CV (útil para QA).

---

### 2.12. Exemplo E2E

1. **POST** `/analyze_cv` com `file=@cv.pdf` e `job_id=1`.
2. Backend:

   * Extrai texto do PDF.
   * Monta `job_details`.
   * Chama o **LLM** → recebe JSON estruturado + `score`.
   * Persiste em `cvs.json`.
3. Front:

   * Exibe o CV no **Banco de Talentos**.
   * Em **Vagas**, calcula **fit** por requisito e rankeia por `combined`.
   * **Top Talentos** mostra os melhores para cada vaga.

---


## 3) Documentação do sistema (telas & rotas)

### 3.1. Splash / Header

* **Splash** animado:

  * Logo (`frontend/RecrAI_logo.png`), blur com *blobs*, barra de carregamento animada.
  * Some automaticamente quando o app inicializa (JS).
* **Header dinâmico**:

  * Fixa no topo, **shrink** ao rolar, paleta coerente com tema claro/escuro.
  * Logo + navegação (Dashboard, Vagas, Analisar, Banco de Talentos, Configurações).
  * **Toggle de tema** (dark/light).

### 3.2. Dashboard

* **Status do backend** (`/health`) e informações de runtime (`/info`).
* KPIs: **#Talentos**, **#Vagas**, **último CV analisado**.
* **Distribuição de scores** (gráfico canvas).
* **Mais recentes** (últimos perfis).
* **Ações rápidas**: analisar, criar vaga, abrir Banco de Talentos.

### 3.3. Vagas (CRUD completo + Ranking)

* Lista de vagas com **chips** de requisitos.
* Botão “**Top Talentos**” abre modal com **ranking por `combined`** (fit+base).
* **Formulário de cadastro** com *preview* dos requisitos (chips).
* Ao **publicar**: modal com sugestões (ranking imediato).
* **Persistência**: todas operações refletem diretamente em `data/jobs.json`.

> **API Jobs (CRUD):**
>
> * `GET /jobs` — lista todas
> * `GET /jobs/{id}` — detalhe
> * `POST /jobs` — cria `{title, description, details, requirements[]}`
> * `PUT /jobs/{id}` — atualiza
> * `DELETE /jobs/{id}` — exclui

> **API Ranking / Fit:**
>
> * `GET /jobs/{job_id}/candidates?order_by=combined&desc=true&limit=50`
> * `GET /jobs/{job_id}/fit/{cv_id}` — inspeciona `fit` e `combined` para 1 CV

### 3.4. Analisar

* **3 modos**: 1 PDF, vários PDFs (multipart) e **texto colado**.
* Pode **associar uma vaga** (via `job_id`) ou analisar **genérico**.
* **Progresso animado** no upload/lote.
* **Endpoints**:

  * `POST /analyze_cv` — `file` **ou** `cv_text`, e `job_id` **ou** `job`.
  * `POST /analyze_cv_batch_multipart` — `files[]`, `job_id`/`job`.
  * `POST /analyze_cv_batch` — JSON (`{"items":[...]}`).

### 3.5. Banco de Talentos

* Cards com **nome, área, data, score** e resumo.
* **Excluir** (tenta `DELETE /cvs/{id}`; se não houver suporte no backend, oculta localmente com persistência em `localStorage`).
* **Comparação**: selecione ≥2 perfis e abra a tabela comparativa.

> **API CVs:**
>
> * `GET /cvs?job_id=...` — lista (com filtro por vaga)
> * `GET /cvs/{id}` — detalhe
> * `DELETE /cvs/{id}` — remove CV (se implementado no seu backend)

### 3.6. Detalhe do Talento

* Barra de score base, resumo, educação, skills, perguntas de entrevista, forças, gaps, considerações e recomendações.
* **Vagas sugeridas** para o perfil (ranking por `combined`).
* Ações: **Excluir/ocultar**, **Copiar perguntas**, **Exportar JSON**.

### 3.7. Comparar

* Tabela com **Score**, **Top skills**, **Forças**, **Recomendação** para n≥2 perfis.
* Destaque visual para o **melhor score**.

### 3.8. Configurações

* **Backend URL** e **API prefix** (persistência em `localStorage`).
* **Tema** (dark/light).
* Teste de conexão (`/health`).

---

## 4) Estrutura do repositório

```
RecrAI/
├─ backend/
│  ├─ app.py
│  ├─ models_schemas.py
│  ├─ llm_client.py
│  ├─ parsers.py
│  └─ requirements.txt
├─ data/
│  ├─ jobs.json   # CRUD total das vagas
│  └─ cvs.json    # resultados de análises
├─ frontend/
│  ├─ index.html
│  ├─ app.js
│  ├─ styles.css
│  └─ RecrAI_logo.png
└─ README.md
```

---

## 5) Rodando localmente

### 5.1. Backend (FastAPI)

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt

# (opcional) pesos do ranking
# PowerShell: $env:FIT_WEIGHT="0.7"
# macOS/Linux: export FIT_WEIGHT=0.7

uvicorn app:app --reload --port 7860
```

**Swagger:** `http://127.0.0.1:7860/docs`
**Health:** `GET /health`

**Env úteis:**

```
FIT_WEIGHT=0.7
PROVIDER=groq
GROQ_API_KEY=xxxxx
TEMPERATURE=0.7
ALLOWED_ORIGIN=https://seuusuario.github.io
```

### 5.2. Frontend (SPA)

Edite em `frontend/index.html`:

```html
<script>
  window.BACKEND_URL = "http://127.0.0.1:7860";
  window.API_PREFIX  = "";
</script>
```

Sirva a pasta:

```bash
cd frontend
python -m http.server 8080
# http://127.0.0.1:8080
```

---

## 6) Formatos em `data/`

### 6.1. `data/jobs.json` (padrão exigido)

```json
[
  {
    "id": "1",
    "title": "Desenvolvedor(a) Full Stack Pleno",
    "description": "Desenvolver e evoluir aplicações (front/back), integrações e CI/CD.",
    "details": "React, Node, APIs REST, testes, boas práticas, cloud.",
    "requirements": [
      "React",
      "Node",
      "JavaScript",
      "TypeScript",
      "APIs REST",
      "SQL",
      "Docker"
    ],
    "created_at": "2025-10-04T00:00:00Z"
  },
  {
    "id": "2",
    "title": "Cientista de Dados Pleno",
    "description": "Modelagem preditiva, EDA, métricas e MLOps.",
    "details": "Pipelines, versionamento, documentação, comunicação.",
    "requirements": [
      "Pandas",
      "Scikit-learn",
      "Feature Engineering",
      "Métricas",
      "MLOps"
    ],
    "created_at": "2025-10-04T00:00:00Z"
  }
]
```

> IDs podem ser **numéricos** (`"1"`, `"2"`) **ou UUID** — o backend aceita ambos.

### 6.2. `data/cvs.json`

* Criado/atualizado automaticamente após análise.
* Estrutura segue `AnalyzeResponse` (ver `models_schemas.py`).

---

## 7) Deploy

### 7.1. GitHub Pages (Frontend)

**Opção docs/**

* Copie `frontend/` para `docs/` e habilite Pages em `Settings → Pages → Branch: main /docs`.

**Opção gh-pages**

```bash
git subtree push --prefix frontend origin gh-pages
```

Depois selecione o branch `gh-pages` em **Settings → Pages**.

> No `index.html`, ajuste `window.BACKEND_URL` para o endpoint público do FastAPI e configure `ALLOWED_ORIGIN` no backend.

### 7.2. Backend

* **HF Spaces / Render / Railway / VPS**: rode com `uvicorn app:app --host 0.0.0.0 --port 7860`.
* Garanta **persistência** da pasta `/data` (bind/volume).
* Configure `ALLOWED_ORIGIN` com a URL do seu Pages.

---

## 8) QA/Validação

* Compare **Top Talentos** (por vaga) com os requisitos exigidos.
* Teste `GET /jobs/{job_id}/candidates` e `GET /jobs/{job_id}/fit/{cv_id}`.
* Um mesmo CV deve ter `combined` **diferente** entre vagas — comportamento esperado.

---

## 9) Autor

**Vinicius de Souza Santos**
*Engenheiro da Computação & Mestrando em Ciência da Computação (ênfase em Data Science)*

* GitHub: [https://github.com/ViniciusKanh](https://github.com/ViniciusKanh)
* LinkedIn: [https://www.linkedin.com/in/vinicius-souza-santoss/](https://www.linkedin.com/in/vinicius-souza-santoss/)