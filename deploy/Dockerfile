# Apache Jena Fuseki, built from the official distribution.
#
# Jena 5.6.0 — CVE-2025-49656 (path traversal) and CVE-2025-50151 (config path
# validation) are fixed in Jena >= 5.5.0. Both inputs are pinned, so the build is
# reproducible and auditable:
#   * base image  -> pinned by digest
#   * Fuseki tar  -> verified by SHA-512
FROM eclipse-temurin:17-jre@sha256:cbc584b3776ab71410502680e6e85b5f1cd18c92c7bd680c10bc2a40bf678558

ARG FUSEKI_VERSION=5.6.0
ARG FUSEKI_SHA512=53dfe13cdd5f6387a0c62917e275fde2cd2e2f2052bfe7515384934f24915228b8512a2dd2b50b7060cc300c976254349d991fcea239484cae48e0a59d67cd54

ENV FUSEKI_HOME=/opt/fuseki
WORKDIR /opt

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl ca-certificates; \
    curl -fSsL -o fuseki.tar.gz "https://archive.apache.org/dist/jena/binaries/apache-jena-fuseki-${FUSEKI_VERSION}.tar.gz"; \
    echo "${FUSEKI_SHA512}  fuseki.tar.gz" | sha512sum -c -; \
    mkdir -p "${FUSEKI_HOME}"; \
    tar xzf fuseki.tar.gz -C "${FUSEKI_HOME}" --strip-components=1; \
    rm fuseki.tar.gz; \
    mkdir -p /fuseki/databases; \
    apt-get purge -y --auto-remove curl; \
    rm -rf /var/lib/apt/lists/*

COPY config.ttl /opt/fuseki/config.ttl

# Run as a non-root user.
RUN useradd -r -u 1001 fuseki && chown -R fuseki:fuseki /opt/fuseki /fuseki
USER 1001

EXPOSE 3030
ENTRYPOINT ["/opt/fuseki/fuseki-server"]
CMD ["--port=3030", "--config=/opt/fuseki/config.ttl"]
