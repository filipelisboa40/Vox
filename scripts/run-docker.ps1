param(
    [string]$Image = 'ghcr.io/filipelisboa40/vox:latest',
    [string]$EnvFile = '.env'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
    throw "Missing $EnvFile. Copy .env.example to .env and add your Discord credentials."
}

if ($Image -ne 'vox-bot:local') {
    docker pull $Image
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

docker run --detach `
    --name vox `
    --restart unless-stopped `
    --env-file $EnvFile `
    --memory 512m `
    --memory-reservation 256m `
    --cpus 2 `
    --pids-limit 64 `
    --read-only `
    --tmpfs /tmp:size=64m,mode=1777 `
    --cap-drop ALL `
    --security-opt no-new-privileges:true `
    --log-opt max-size=5m `
    --log-opt max-file=2 `
    $Image
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Vox started. Follow logs with: docker logs --follow vox'
