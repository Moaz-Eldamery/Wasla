#!/usr/bin/env bash
set -Eeuo pipefail

# Invoked only by the gated GitHub Actions deployment job on the VM.
readonly deploy_root=/opt/wasla
readonly release_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly current_link="$deploy_root/current"
readonly project_name=wasla

compose_at() {
  local source_dir="$1"
  shift
  docker compose \
    --project-name "$project_name" \
    --project-directory "$source_dir" \
    --env-file "$deploy_root/.env" \
    -f "$source_dir/docker-compose.yml" \
    -f "$source_dir/docker-compose.production.yml" \
    "$@"
}

if [[ ! -f "$deploy_root/.env" ]]; then
  echo 'Missing /opt/wasla/.env; install production configuration before enabling deployment.' >&2
  exit 1
fi
if [[ "$(stat -c '%a' "$deploy_root/.env")" != 600 ]]; then
  echo '/opt/wasla/.env must have mode 600.' >&2
  exit 1
fi

compose_at "$release_dir" config --quiet

previous_release=''
if [[ -L "$current_link" ]]; then
  previous_release="$(readlink -f "$current_link")"
fi
next_link="$deploy_root/.current-$RANDOM"
ln -s "$release_dir" "$next_link"
mv -Tf "$next_link" "$current_link"

rollback() {
  status=$?
  if (( status != 0 )); then
    echo 'New release did not become healthy; restoring the previous release.' >&2
    if [[ -n "$previous_release" ]]; then
      rollback_link="$deploy_root/.rollback-$RANDOM"
      ln -s "$previous_release" "$rollback_link"
      mv -Tf "$rollback_link" "$current_link"
      compose_at "$previous_release" up --build --detach --remove-orphans --wait || true
    else
      compose_at "$release_dir" down || true
    fi
  fi
  exit "$status"
}
trap rollback EXIT

compose_at "$release_dir" up --build --detach --remove-orphans --wait
trap - EXIT
echo "Release deployed and healthy: $(basename "$release_dir")"
