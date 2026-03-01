# Superset AWS CDK Deployment

Deploy Superset to AWS using CDK with ECS, RDS PostgreSQL, and ElastiCache Redis.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           AWS Cloud (VPC)                           │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                      Public Subnets (2 AZs)                  │   │
│  │                                                              │   │
│  │  ┌────────────────────────────────────────────────────┐      │   │
│  │  │  Application Load Balancer (ALB)                   │      │   │
│  │  │  - Port 80 (HTTP)                                  │      │   │
│  │  │  - Health checks: /health                          │      │   │
│  │  └────────────────────────────────────────────────────┘      │   │
│  │                           │                                  │   │
│  └───────────────────────────┼──────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                   Private Subnets (2 AZs)                    │   │
│  │                                                              │   │
│  │  ┌─────────────────────────────────────────────────────┐     │   │
│  │  │         ECS Fargate Cluster                         │     │   │
│  │  │                                                     │     │   │
│  │  │  ┌──────────────────────────────────────────────┐   │     │   │
│  │  │  │  Superset Web Service (2 tasks)              │   │     │   │
│  │  │  │  - Port 8088                                 │   │     │   │
│  │  │  │  - Gunicorn with 4 workers                   │   │     │   │
│  │  │  │  - 2048 MB / 1024 CPU                        │   │     │   │
│  │  │  └──────────────────────────────────────────────┘   │     │   │
│  │  │                                                     │     │   │
│  │  │  ┌──────────────────────────────────────────────┐   │     │   │
│  │  │  │  Celery Worker Service (2 tasks)             │   │     │   │
│  │  │  │  - Async task processing                     │   │     │   │
│  │  │  │  - 2048 MB / 1024 CPU                        │   │     │   │
│  │  │  └──────────────────────────────────────────────┘   │     │   │
│  │  │                                                     │     │   │
│  │  │  ┌──────────────────────────────────────────────┐   │     │   │
│  │  │  │  Celery Beat Service (1 task)                │   │     │   │
│  │  │  │  - Scheduled task scheduler                  │   │     │   │
│  │  │  │  - 1024 MB / 512 CPU                         │   │     │   │
│  │  │  └──────────────────────────────────────────────┘   │     │   │
│  │  └─────────────────────────────────────────────────────┘     │   │
│  │                              │                               │   │
│  │                              │                               │   │
│  │  ┌───────────────────────────┼──────────────────────────┐    │   │
│  │  │                           ▼                          │    │   │
│  │  │  ┌──────────────────────────────────────────────┐    │    │   │
│  │  │  │  RDS PostgreSQL (t3.small)                   │    │    │   │
│  │  │  │  - Metadata database                         │    │    │   │
│  │  │  │  - 20 GB storage (auto-scaling to 100 GB)    │    │    │   │
│  │  │  │  - Multi-AZ: No (single instance)            │    │    │   │
│  │  │  └──────────────────────────────────────────────┘    │    │   │
│  │  │                                                      │    │   │
│  │  │  ┌──────────────────────────────────────────────┐    │    │   │
│  │  │  │  ElastiCache Redis (t3.micro)                │    │    │   │
│  │  │  │  - Cache & Celery message broker             │    │    │   │
│  │  │  │  - Single node                               │    │    │   │
│  │  │  └──────────────────────────────────────────────┘    │    │   │
│  │  └──────────────────────────────────────────────────────┘    │   │
│  │                                                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    NAT Gateway (1 AZ)                        │   │
│  │  - Provides internet access for private subnets              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        Supporting Services                          │
├─────────────────────────────────────────────────────────────────────┤
│  • ECR: Docker image repository                                     │
│  • Secrets Manager: DB credentials, Superset secret, admin password │
│  • CloudWatch Logs: Application logs (7-day retention)              │
│  • IAM Roles: Task execution & task roles with least privilege      │
│  • Security Groups: Network isolation between services              │
└─────────────────────────────────────────────────────────────────────┘
```

### Architecture Components

- **VPC**: Multi-AZ with public and private subnets (no isolated subnets)
- **ECS Fargate**: Superset web app (2 tasks), Celery workers (2 tasks), Celery beat (1 task)
- **RDS PostgreSQL**: t3.small instance for metadata storage
- **ElastiCache Redis**: t3.micro for caching and Celery message broker
- **ALB**: Application Load Balancer for HTTP traffic with health checks
- **ECR**: Container registry for Superset Docker images
- **Secrets Manager**: Secure storage for database, Superset, and admin credentials
- **IAM**: Least-privilege roles for task execution and runtime
- **CloudWatch**: Centralized logging with Container Insights enabled

## Prerequisites

- AWS CLI configured with credentials
- Node.js 18+ and npm
- Docker
- AWS CDK CLI: `npm install -g aws-cdk`

## Setup

```bash
# Install dependencies
npm install

# Bootstrap CDK (first time only)
cdk bootstrap

# Build TypeScript
npm run build
```

## Deployment

### 1. Deploy Infrastructure

```bash
# Preview changes
cdk diff

# Deploy stack
cdk deploy
```

### 2. Build and Push Docker Image

```bash
# Build and push to ECR
./deploy-image.sh
```

### 3. Initialize Superset

```bash
# Get ECS cluster name
CLUSTER=$(aws ecs list-clusters --query 'clusterArns[0]' --output text)

# Run init task
aws ecs run-task \
  --cluster $CLUSTER \
  --task-definition SupersetStack-SupersetTask \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx]}" \
  --overrides '{"containerOverrides":[{"name":"superset","command":["/docker/superset-init.sh"]}]}'
```

### 4. Access Superset

Get the ALB DNS from stack outputs:
```bash
aws cloudformation describe-stacks \
  --stack-name SupersetStack \
  --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDNS`].OutputValue' \
  --output text
```

Navigate to `http://<ALB-DNS>` and login with admin credentials.

## Configuration

Update environment variables in `lib/superset-stack.ts`:
- GUNICORN_WORKERS
- GUNICORN_TIMEOUT
- Task memory/CPU
- Desired task count

## Secrets

Secrets are auto-generated in AWS Secrets Manager:
- `SupersetStack-DbSecret`: Database credentials
- `SupersetStack-SupersetSecret`: Superset secret key

Update manually if needed:
```bash
aws secretsmanager update-secret \
  --secret-id SupersetStack-SupersetSecret \
  --secret-string '{"password":"your-secret-key"}'
```

## Scaling

Modify in `lib/superset-stack.ts`:
- Superset service: `desiredCount: 2`
- Celery workers: `desiredCount: 2`
- RDS instance type: `ec2.InstanceType.of(...)`
- Redis node type: `cacheNodeType: 'cache.t3.micro'`

## Monitoring

- CloudWatch Logs: `/aws/ecs/superset*`
- ECS Container Insights enabled
- ALB health checks on `/health`

## Cleanup

```bash
# Destroy all resources
cdk destroy

# Note: RDS has deletion protection enabled
# Disable it first in the console
```

## Costs

Estimated monthly costs (us-east-1):
- ECS Fargate: ~$50-100
- RDS t3.small: ~$30
- ElastiCache t3.micro: ~$15
- ALB: ~$20
- NAT Gateway: ~$35
- Total: ~$150-200/month

## Troubleshooting

Check ECS task logs:
```bash
aws logs tail /aws/ecs/superset --follow
```

Check service status:
```bash
aws ecs describe-services \
  --cluster <cluster-name> \
  --services SupersetStack-SupersetService
```
