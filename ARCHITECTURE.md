# System Architecture

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Browser                            │
│                      http://localhost:8088                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTP
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Superset Web App                             │
│                   (Gunicorn + Gevent)                           │
│                      Port: 8088                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  - Dashboard rendering                                   │   │
│  │  - Query execution                                       │   │
│  │  - User authentication                                   │   │
│  │  - API endpoints                                         │   │
│  └──────────────────────────────────────────────────────────┘   │
└───┬─────────────────┬─────────────────┬──────────────────────── ┘
    │                 │                 │
    │                 │                 │
    ▼                 ▼                 ▼
┌─────────┐    ┌──────────┐    ┌──────────────┐
│ Redis   │    │PostgreSQL│    │   Celery     │
│ Cache   │    │Metadata  │    │   Broker     │
│Port:6379│    │  DB      │    │ (Redis)      │
└─────────┘    │Port:5432 │    └──────┬───────┘
               └──────────┘           │
                                      │ Tasks
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
            ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
            │Celery Worker │  │Celery Worker │  │ Celery Beat  │
            │              │  │              │  │  (Scheduler) │
            │- Async tasks │  │- Async tasks │  │              │
            │- SQL queries │  │- SQL queries │  │- Cron jobs   │
            │- Reports     │  │- Reports     │  │- Alerts      │
            │- Alerts      │  │- Alerts      │  │              │
            └──────────────┘  └──────────────┘  └──────────────┘
                    │                 │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  External DBs   │
                    │  - Snowflake    │
                    │  - PostgreSQL   │
                    │  - MySQL        │
                    │  - etc.         │
                    └─────────────────┘
```

## Component Details

### 1. Superset Web App
- **Technology**: Python, Flask, Gunicorn, Gevent
- **Purpose**: Main application server
- **Responsibilities**:
  - Serve web UI
  - Handle user requests
  - Execute synchronous queries
  - Manage authentication/authorization
  - Coordinate with Celery for async tasks

### 2. PostgreSQL (Metadata DB)
- **Technology**: PostgreSQL 16.6
- **Purpose**: Store Superset metadata
- **Data Stored**:
  - User accounts & permissions
  - Dashboard configurations
  - Chart definitions
  - Database connections
  - Query history

### 3. Redis
- **Technology**: Redis 7
- **Purpose**: Dual role - Cache & Message Broker
- **Functions**:
  - Cache query results
  - Cache dashboard data
  - Celery message broker
  - Session storage

### 4. Celery Workers
- **Technology**: Celery with prefork pool
- **Purpose**: Execute async tasks
- **Tasks**:
  - Long-running SQL queries
  - Report generation
  - Alert execution
  - Email sending
  - Screenshot capture

### 5. Celery Beat
- **Technology**: Celery Beat scheduler
- **Purpose**: Schedule periodic tasks
- **Functions**:
  - Trigger scheduled reports
  - Run alert checks
  - Prune old logs
  - Cache warming

## Data Flow

### Synchronous Request Flow
```
User → Superset App → Check Redis Cache
                    ↓ (cache miss)
                    → Query External DB
                    → Store in Redis
                    → Return to User
```

### Asynchronous Task Flow
```
User → Superset App → Push task to Redis Queue
                    ↓
                Celery Worker picks task
                    ↓
                Execute task (query/report/alert)
                    ↓
                Store result in PostgreSQL
                    ↓
                Notify user (email/UI)
```

### Scheduled Task Flow
```
Celery Beat → Check schedule
            ↓
            Push task to Redis Queue
            ↓
        Celery Worker executes
            ↓
        Send email/notification
```

## Network & Ports

| Service        | Port | Protocol | Purpose              |
|----------------|------|----------|----------------------|
| Superset       | 8088 | HTTP     | Web UI & API         |
| PostgreSQL     | 5432 | TCP      | Database connections |
| Redis          | 6379 | TCP      | Cache & messaging    |

## Scalability

### Horizontal Scaling
- **Superset App**: Add more replicas behind load balancer
- **Celery Workers**: Scale workers based on queue depth
- **Redis**: Use Redis Cluster for high availability
- **PostgreSQL**: Use read replicas for query distribution

### Vertical Scaling
- Increase Gunicorn workers
- Increase Celery worker concurrency
- Allocate more memory to Redis
- Optimize PostgreSQL configuration

## High Availability

```
┌─────────────┐
│Load Balancer│
└──────┬──────┘
       │
   ┌───┴───┐
   ▼       ▼
┌────┐  ┌────┐
│App1│  │App2│  (Multiple Superset instances)
└────┘  └────┘
   │       │
   └───┬───┘
       ▼
┌─────────────┐
│Redis Cluster│  (Master-Replica setup)
└─────────────┘
       │
       ▼
┌─────────────┐
│PostgreSQL HA│  (Primary-Standby replication)
└─────────────┘
```

## Security Layers

1. **Application Layer**
   - Secret key for session encryption
   - CSRF protection
   - SQL injection prevention

2. **Network Layer**
   - Internal Docker network
   - Port exposure control
   - TLS/SSL for external connections

3. **Data Layer**
   - Database credentials in env files
   - Encrypted connections to external DBs
   - Redis password protection (optional)

4. **Authentication**
   - Built-in user management
   - LDAP/OAuth integration support
   - Role-based access control (RBAC)
