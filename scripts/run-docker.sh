#!/usr/bin/env sh

set -eu

# Override this when testing a local image, for example:
# VOX_IMAGE=vox-bot:local sh scripts/run-docker.sh
image="${VOX_IMAGE:-ghcr.io/filipelisboa40/vox:latest}"
env_file="${VOX_ENV_FILE:-.env}"

if [ ! -f "$env_file" ]; then
    echo "Missing $env_file. Copy .env.example to .env and add your Discord credentials." >&2
    exit 1
fi

if [ "$image" != "vox-bot:local" ]; then
    docker pull "$image"
fi
docker run --detach \
    --name vox \
    --restart unless-stopped \
    --env-file "$env_file" \
    --memory 512m \
    --memory-reservation 256m \
    --cpus 2 \
    --pids-limit 64 \
    --read-only \
    --tmpfs /tmp:size=64m,mode=1777 \
    --cap-drop ALL \
    --security-opt no-new-privileges:true \
    --log-opt max-size=5m \
    --log-opt max-file=2 \
    "$image"

echo "Vox started. Follow logs with: docker logs --follow vox"
