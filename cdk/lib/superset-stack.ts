import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class SupersetStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC
    const vpc = new ec2.Vpc(this, 'SupersetVpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: 'Public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'Private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: 'Isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // Secrets
    const dbSecret = new secretsmanager.Secret(this, 'DbSecret', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'superset' }),
        generateStringKey: 'password',
        excludePunctuation: true,
      },
    });

    const supersetSecret = new secretsmanager.Secret(this, 'SupersetSecret', {
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    // RDS PostgreSQL
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc,
      description: 'Security group for RDS',
    });

    const database = new rds.DatabaseInstance(this, 'SupersetDb', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_15 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      credentials: rds.Credentials.fromSecret(dbSecret),
      databaseName: 'superset',
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      securityGroups: [dbSecurityGroup],
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      deletionProtection: false,
    });

    // ElastiCache Redis
    const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc,
      description: 'Security group for Redis',
    });

    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Subnet group for Redis',
      subnetIds: vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds,
    });

    const redis = new elasticache.CfnCacheCluster(this, 'SupersetRedis', {
      cacheNodeType: 'cache.t3.micro',
      engine: 'redis',
      numCacheNodes: 1,
      vpcSecurityGroupIds: [redisSecurityGroup.securityGroupId],
      cacheSubnetGroupName: redisSubnetGroup.ref,
    });

    // ECR Repository
    const repository = new ecr.Repository(this, 'SupersetRepo', {
      repositoryName: 'superset',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      imageScanOnPush: true,
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, 'SupersetCluster', {
      vpc,
      containerInsights: true,
    });

    // Task Execution Role
    const executionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    dbSecret.grantRead(executionRole);
    supersetSecret.grantRead(executionRole);

    // Task Role
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'SupersetTask', {
      memoryLimitMiB: 2048,
      cpu: 1024,
      executionRole,
      taskRole,
    });

    const logGroup = new logs.LogGroup(this, 'SupersetLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const redisEndpoint = `redis://${redis.attrRedisEndpointAddress}:${redis.attrRedisEndpointPort}`;

    taskDefinition.addContainer('superset', {
      image: ecs.ContainerImage.fromEcrRepository(repository, 'latest'),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'superset', logGroup }),
      environment: {
        FLASK_APP: 'superset.app:create_app()',
        SUPERSET_PORT: '8088',
        GUNICORN_WORKERS: '4',
        GUNICORN_TIMEOUT: '120',
        REDIS_HOST: redis.attrRedisEndpointAddress,
        REDIS_PORT: redis.attrRedisEndpointPort,
        CELERY_BROKER_URL: `${redisEndpoint}/0`,
        CELERY_RESULT_BACKEND: `${redisEndpoint}/1`,
        DATABASE_HOST: database.dbInstanceEndpointAddress,
        DATABASE_PORT: database.dbInstanceEndpointPort,
        DATABASE_DB: 'superset',
      },
      secrets: {
        SUPERSET_SECRET_KEY: ecs.Secret.fromSecretsManager(supersetSecret),
        SUPERSET_META_USER: ecs.Secret.fromSecretsManager(dbSecret, 'username'),
        SUPERSET_META_PASS: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
      },
      portMappings: [{ containerPort: 8088 }],
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:8088/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    // Celery Worker Task
    const celeryTaskDefinition = new ecs.FargateTaskDefinition(this, 'CeleryTask', {
      memoryLimitMiB: 2048,
      cpu: 1024,
      executionRole,
      taskRole,
    });

    celeryTaskDefinition.addContainer('celery-worker', {
      image: ecs.ContainerImage.fromEcrRepository(repository, 'latest'),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'celery', logGroup }),
      command: ['/docker/superset-celery.sh', 'worker'],
      environment: {
        FLASK_APP: 'superset.app:create_app()',
        REDIS_HOST: redis.attrRedisEndpointAddress,
        REDIS_PORT: redis.attrRedisEndpointPort,
        CELERY_BROKER_URL: `${redisEndpoint}/0`,
        CELERY_RESULT_BACKEND: `${redisEndpoint}/1`,
        DATABASE_HOST: database.dbInstanceEndpointAddress,
        DATABASE_PORT: database.dbInstanceEndpointPort,
        DATABASE_DB: 'superset',
      },
      secrets: {
        SUPERSET_SECRET_KEY: ecs.Secret.fromSecretsManager(supersetSecret),
        SUPERSET_META_USER: ecs.Secret.fromSecretsManager(dbSecret, 'username'),
        SUPERSET_META_PASS: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
      },
    });

    // Celery Beat Task
    const celeryBeatTaskDefinition = new ecs.FargateTaskDefinition(this, 'CeleryBeatTask', {
      memoryLimitMiB: 1024,
      cpu: 512,
      executionRole,
      taskRole,
    });

    celeryBeatTaskDefinition.addContainer('celery-beat', {
      image: ecs.ContainerImage.fromEcrRepository(repository, 'latest'),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'celery-beat', logGroup }),
      command: ['/docker/superset-celery.sh', 'beat'],
      environment: {
        FLASK_APP: 'superset.app:create_app()',
        REDIS_HOST: redis.attrRedisEndpointAddress,
        REDIS_PORT: redis.attrRedisEndpointPort,
        CELERY_BROKER_URL: `${redisEndpoint}/0`,
        CELERY_RESULT_BACKEND: `${redisEndpoint}/1`,
        DATABASE_HOST: database.dbInstanceEndpointAddress,
        DATABASE_PORT: database.dbInstanceEndpointPort,
        DATABASE_DB: 'superset',
      },
      secrets: {
        SUPERSET_SECRET_KEY: ecs.Secret.fromSecretsManager(supersetSecret),
        SUPERSET_META_USER: ecs.Secret.fromSecretsManager(dbSecret, 'username'),
        SUPERSET_META_PASS: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
      },
    });

    // Security Groups
    const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc,
      description: 'Security group for ALB',
    });
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));

    const serviceSecurityGroup = new ec2.SecurityGroup(this, 'ServiceSecurityGroup', {
      vpc,
      description: 'Security group for ECS services',
    });
    serviceSecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.tcp(8088));

    dbSecurityGroup.addIngressRule(serviceSecurityGroup, ec2.Port.tcp(5432));
    redisSecurityGroup.addIngressRule(serviceSecurityGroup, ec2.Port.tcp(6379));

    // ALB
    const alb = new elbv2.ApplicationLoadBalancer(this, 'SupersetAlb', {
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
    });

    const listener = alb.addListener('HttpListener', {
      port: 80,
      open: true,
    });

    // Superset Service - deploy after image push
    const service = new ecs.FargateService(this, 'SupersetService', {
      cluster,
      taskDefinition,
      desiredCount: 2,
      securityGroups: [serviceSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    listener.addTargets('SupersetTarget', {
      port: 8088,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      healthCheck: {
        path: '/health',
        interval: cdk.Duration.seconds(30),
      },
    });

    // Celery Worker Service - deploy after image push
    new ecs.FargateService(this, 'CeleryWorkerService', {
      cluster,
      taskDefinition: celeryTaskDefinition,
      desiredCount: 2,
      securityGroups: [serviceSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    // Celery Beat Service - deploy after image push
    new ecs.FargateService(this, 'CeleryBeatService', {
      cluster,
      taskDefinition: celeryBeatTaskDefinition,
      desiredCount: 1,
      securityGroups: [serviceSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    // Outputs
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: alb.loadBalancerDnsName,
      description: 'Superset URL',
    });

    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: repository.repositoryUri,
      description: 'ECR Repository URI',
    });

    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: database.dbInstanceEndpointAddress,
      description: 'RDS Endpoint',
    });

    new cdk.CfnOutput(this, 'RedisEndpoint', {
      value: redis.attrRedisEndpointAddress,
      description: 'Redis Endpoint',
    });
  }
}
