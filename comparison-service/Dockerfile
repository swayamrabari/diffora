FROM golang:1.27-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM alpine:3.22

ARG OASDIFF_VERSION=1.38.0
ARG TARGETARCH

RUN apk add --no-cache ca-certificates wget \
    && addgroup -S app \
    && adduser -S app -G app

RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
      amd64) checksum="613037fd6a1d3362a1b742d6d86c338c0eb5ab3511f4942ce3948e78720ea2da" ;; \
      arm64) checksum="a5ebb16d90f729f6b436a92d3054c11ba5633ddfb639dfdfb64b0023cd03680c" ;; \
      *) echo "unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    url="https://github.com/oasdiff/oasdiff/releases/download/v${OASDIFF_VERSION}/oasdiff_${OASDIFF_VERSION}_linux_${TARGETARCH:-amd64}.tar.gz"; \
    wget -qO /tmp/oasdiff.tar.gz "$url"; \
    echo "${checksum}  /tmp/oasdiff.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/oasdiff.tar.gz -C /usr/local/bin oasdiff; \
    chmod 0755 /usr/local/bin/oasdiff; \
    rm -f /tmp/oasdiff.tar.gz; \
    /usr/local/bin/oasdiff --version

COPY --from=build /out/server /usr/local/bin/server

ENV OASDIFF_BIN=/usr/local/bin/oasdiff
ENV PORT=8080

USER app
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/server"]
