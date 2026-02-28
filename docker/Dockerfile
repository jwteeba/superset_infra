FROM apache/superset:6.0.0

WORKDIR /app

USER root

# Install system packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    procps \
    gcc \
    pkg-config \
    curl \
    wget \
    unzip \
    gnupg \
    ca-certificates \
    firefox-esr \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Geckodriver
ENV GECKODRIVER_VERSION=0.33.0
RUN wget -q https://github.com/mozilla/geckodriver/releases/download/v${GECKODRIVER_VERSION}/geckodriver-v${GECKODRIVER_VERSION}-linux64.tar.gz && \
    tar -x geckodriver -zf geckodriver-v${GECKODRIVER_VERSION}-linux64.tar.gz -O > /usr/bin/geckodriver && \
    chmod 755 /usr/bin/geckodriver && \
    rm geckodriver-v${GECKODRIVER_VERSION}-linux64.tar.gz

# Copy and install Python dependencies
COPY requirements/ /app/requirements/
RUN uv pip install -r /app/requirements/prod.txt

# Copy scripts
COPY docker/scripts/*.sh /docker/
RUN chmod +x /docker/*.sh && chown superset:superset /docker/*.sh

# Copy configuration
COPY --chown=superset config/superset_config.py /app/
COPY --chown=superset config/gunicorn_config.py /app/
ENV SUPERSET_CONFIG_PATH=/app/superset_config.py

# Create a folder for custom logos
RUN mkdir -p /app/superset/static/assets/images/custom_logos/
# Copy custom images
COPY ../assets/img /app/superset/static/assets/images/custom_logos/

# Create directories
RUN mkdir -p /app/celerybeat && chown -R superset:superset /app/celerybeat

USER superset

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8088/health || exit 1

CMD ["/docker/superset-entrypoint.sh"]
