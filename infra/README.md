# infra — Deployment configuration

```text
infra/
├── docker/          # shared Docker bits (nginx.conf for serving the web build, init scripts)
├── rabbitmq/        # definitions.json: exchanges, queues, dead-letter setup (loaded at startup)
└── k8s/
    └── helm/
        └── swiftdrop/   # Helm chart (bonus +5)
            ├── Chart.yaml
            ├── values.yaml
            └── templates/
                ├── configmap.yaml
                ├── secret.yaml
                ├── api-deployment.yaml / api-service.yaml
                ├── worker-deployment.yaml
                ├── web-deployment.yaml / web-service.yaml
                ├── ai-assistant-deployment.yaml / service
                ├── postgres-statefulset.yaml / service
                ├── rabbitmq-statefulset.yaml / service
                └── ingress.yaml
```

Each app keeps its own `Dockerfile` inside its folder (`apps/api/Dockerfile`, etc.).
`docker-compose.yml` lives at the repo root.
