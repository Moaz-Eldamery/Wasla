# Single-VM deployment

The repository now contains a Docker Compose production overlay and a gated
GitHub Actions deploy job. This prepares deployment; it does not create a VM,
configure DNS, obtain a certificate, or publish a live site.

## Current external prerequisites

- A Linux VM with Docker Engine and the Compose plugin, reachable by SSH. An
  Oracle Cloud Always Free VM may fit this project, subject to account, region,
  quota, and capacity availability. No VM is provisioned by this repository.
- A domain you control, with an A record pointing to the VM. Allow inbound TCP
  80 and 443 and restrict SSH to trusted source addresses.
- The DNS name and email must be set as `DOMAIN` and `ACME_EMAIL` in the VM's
  `/opt/wasla/.env`. Traefik requests and renews a Let's Encrypt certificate
  after DNS and HTTP reachability work. HTTPS is not operational until that
  succeeds.
- Production values for the database, MinIO, Anthropic, and Gemini secrets.
  Create `/opt/wasla/.env` on the VM with mode `600`; never put it in GitHub or
  the source archive. Keep a secure backup of the database and the
  `/letsencrypt` volume before upgrades.
- KAN-22 requires Claude through Anthropic. Anthropic API usage is paid; that
  requirement conflicts with a strict free-only operating budget. Do not enable
  production deployment until an authorized billing decision or a Jira-approved
  provider change resolves this conflict. Gemini's official pricing currently
  lists a free tier for text embeddings, subject to account, quota, and rate
  limits; verify the selected Google project remains on the free tier before
  generating the initial vectors.

## First installation

1. Provision and secure the Linux VM. Install Docker Engine and the Docker
   Compose plugin. Create `/opt/wasla/releases` and give the deployment account
   write access. Create `/opt/wasla/.env`, set mode `600`, and fill every
   required value with unique production secrets. Set `GATEWAY_PORT=80`, the
   real `DOMAIN`, and a monitored `ACME_EMAIL`.
2. Configure the domain A record and VM firewall. Confirm public TCP 80 and 443
   reach the VM before expecting an ACME certificate.
3. Load the matching source release on the VM and validate it with:

   ```sh
   docker compose --project-name wasla --project-directory "$PWD" \
     --env-file /opt/wasla/.env \
     -f docker-compose.yml -f docker-compose.production.yml config --quiet
   ```

4. Apply migrations and start the Compose stack through `ops/deploy-vm.sh`.
   This script checks the private env file, validates Compose configuration,
   waits for healthy services, and restores the previous release if startup
   fails. It does not remove named volumes. Do not run a second independent
   `docker compose down -v` or remove database volumes.
5. Populate the knowledge base once, after confirming Gemini free-tier access:

   ```sh
   docker compose --project-name wasla --project-directory "$PWD" \
     --env-file /opt/wasla/.env \
     -f docker-compose.yml -f docker-compose.production.yml \
     --profile knowledge-base-sync run --rm ai-sync
   ```

   The sync is intentionally a one-time, explicit operation. It makes Gemini
   API requests and writes the 36 synthetic records and their bilingual
   embeddings to the AI database. Back up that database before re-syncing.
6. Verify the public site, HTTPS certificate, login, Core API, and an admin
   chatbot question from the deployed host. The public URL is the real
   `https://$DOMAIN`; no URL is configured in this repository.

## Automatic deploys from `main`

The `deploy` job in `.github/workflows/ci.yml` runs only for a push to `main`,
after all CI jobs pass, and only when repository variable `DEPLOY_ENABLED` is
exactly `true`. It sends a source archive over pinned-host SSH and builds images
on the VM, so it does not require a paid container registry. Before enabling
that variable:

- Add GitHub Actions secrets `DEPLOY_HOST`, `DEPLOY_USER`,
  `DEPLOY_SSH_PRIVATE_KEY`, and `DEPLOY_KNOWN_HOSTS`.
- Restrict the SSH key to the deployment account and the VM. Populate
  `DEPLOY_KNOWN_HOSTS` from a trusted fingerprint verification; the workflow
  enforces strict host-key checking.
- Install Docker/Compose on the VM, create `/opt/wasla/releases`, set up the
  private production `/opt/wasla/.env`, and verify first deployment manually.
- Resolve the paid Anthropic API requirement and approve production operation.
- Set `DEPLOY_ENABLED=true` only after the first manual deployment and health
  checks succeed. With the variable absent or false, the job is skipped.

The workflow does not pass application secrets to GitHub Actions. The SSH key
and host pin are temporary runner files removed when the job exits. Releases
are retained under `/opt/wasla/releases`; establish and test a backup and
retention policy before operating the VM long term.

## Android preview APK

The patient app has an EAS `preview` profile that produces an internal Android
APK. It does not contain a fabricated public endpoint. After a real deployment,
configure `EXPO_PUBLIC_API_URL=https://YOUR-REAL-DOMAIN/api` in the EAS build
environment, then run:

```sh
cd apps/patient-app
eas build --platform android --profile preview
```

The app is not confirmed to connect until an APK built with the actual URL is
installed and tested against the live server. EAS free build quotas and account
availability are controlled by Expo and can change.

## Operational security notes

- The base Compose file mounts Docker's socket into Traefik as read-only. A
  read-only mount does not make the Docker API itself read-only. Treat gateway
  compromise as host compromise; before production, approve and implement a
  restricted Docker socket proxy or another provider configuration.
- The application does not publish PostgreSQL, MinIO, AI, or Core ports to the
  host. Uptime Kuma is bound to loopback. Keep the VM firewall limited to SSH,
  80, and 443.
- Compose currently passes production credentials as container environment
  variables. Protect VM access and process inspection. A later hardening step
  can migrate supported services to Docker secrets without committing values.
- KAN-22 requires an Anthropic API key and real service requests can incur
  charges. Local and CI mocks do not verify live Claude behavior.
