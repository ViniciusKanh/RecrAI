# -*- coding: utf-8 -*-
"""
Edite a variável VAGAS e execute para gravar backend-RecrAi/data/jobs.json
"""
import os, json

VAGAS = [
    {
        "id": "fullstack-pl",
        "titulo": "Desenvolvedor(a) Full Stack Pleno",
        "local": "Remoto - BR",
        "descricao": "Desenvolver e evoluir aplicações (front/back), integrações e CI/CD.",
        "detalhes": "React, Node, APIs REST, testes, boas práticas, cloud.",
        "requisitos": ["React","Node","JavaScript","TypeScript","APIs REST","SQL","Docker"]
    },
    {
        "id": "cientista-dados-pl",
        "titulo": "Cientista de Dados Pleno",
        "local": "Híbrido - SP",
        "descricao": "Modelagem preditiva, EDA, métricas e MLOps.",
        "detalhes": "Pipelines, versionamento, documentação, comunicação.",
        "requisitos": ["Pandas","Scikit-learn","Feature Engineering","Métricas","MLOps"]
    }
]

root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
jobs_path = os.path.join(root, "backend-RecrAi", "data", "jobs.json")
os.makedirs(os.path.dirname(jobs_path), exist_ok=True)

with open(jobs_path, "w", encoding="utf-8") as f:
    json.dump(VAGAS, f, indent=2, ensure_ascii=False)

print(f"[OK] Gravado em: {jobs_path} (vagas: {len(VAGAS)})")
