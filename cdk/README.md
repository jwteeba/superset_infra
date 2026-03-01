# Superset AWS CDK Deployment

Deploy Superset to AWS using CDK with ECS, RDS PostgreSQL, and ElastiCache Redis.

## Architecture

- **VPC**: Multi-AZ with public, private, and isolated subnets
- **ECS Fargate**: Superset web app, Celery workers, and Celery beat
- **RDS PostgreSQL**: Metadata database
- **ElastiCache Redis**: Cache and Celery broker
- **ALB**: Application Load Balancer for HTTPS/HTTP traffic
- **ECR**: Container registry for Superset images
- **Secrets Manager**: Secure credential storage
- **IAM**: Least-privilege access control

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
