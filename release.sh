#!/bin/bash
set -e

REGISTRY="${REGISTRY_URL:-registry.yurii.live}"
IMAGE_NAME="profiler"
TAG="${1:-latest}"

echo "Building frontend..."
(cd frontend && npm run build)

docker buildx inspect multiarch >/dev/null 2>&1 || \
    docker buildx create --name multiarch --use

if [ -n "$REGISTRY_USER" ] && [ -n "$REGISTRY_PASSWORD" ]; then
    echo "$REGISTRY_PASSWORD" | docker login "$REGISTRY" -u "$REGISTRY_USER" --password-stdin
fi

docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --tag "$REGISTRY/$IMAGE_NAME:$TAG" \
    --tag "$REGISTRY/$IMAGE_NAME:latest" \
    --push \
    .

echo "Pushed $REGISTRY/$IMAGE_NAME:$TAG"
