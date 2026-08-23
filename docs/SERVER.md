# Kadaima LMS — production server

## Target host

| Item | Value |
|------|--------|
| SSH | `root@84.247.138.71` |
| API (Docker) | host port `4000` → container `kadaima-api` |
| Postgres (Docker) | host port `5433` → container `5432` (`kadaima-db`) — **5432 is already used** by other apps on this VPS |
| Public API (preferred) | `https://api.kadaima.com` (Nginx → `127.0.0.1:4000`) |
| Frontend | `https://www.kadaima.com` |

> Same VPS also hosts other apps (e.g. chatbot / smart-study). Do not reuse their DB names or ports. Keep Kadaima on **4000** (API), **5433** (Postgres published), and its own DB user/database.

## Copy backup to this server

From your PC (after creating `kadaima_backup.dump` on the old host):

```bash
scp kadaima_backup.dump root@84.247.138.71:~/
scp uploads_backup.tar.gz root@84.247.138.71:~/
```

## SSH in

```bash
ssh root@84.247.138.71
```

## Restore on this server (Docker Postgres)

```bash
# Start DB only (from the folder that has docker-compose.yml)
docker compose up -d db

docker cp ~/kadaima_backup.dump kadaima-db:/tmp/kadaima_backup.dump

docker exec -it kadaima-db pg_restore \
  -U myuser \
  -d kadaimadb \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  /tmp/kadaima_backup.dump

# Restore uploads volume (replace volume name if different)
docker run --rm -v lms-api_uploads:/data -v $HOME:/backup alpine \
  tar xzf /backup/uploads_backup.tar.gz -C /data

docker compose up -d --build
```

## Env on server

Set in compose / `.env` (do not commit secrets):

```env
DATABASE_URL=postgresql://USER:PASSWORD@db:5432/kadaimadb
FRONTEND_URL=https://www.kadaima.com
```

## After cutover

1. Point DNS / Nginx for `api.kadaima.com` at this host (`84.247.138.71`).
2. Confirm SSL certs cover the API host.
3. Smoke-test login, one quiz, and `/uploads` images.
4. Stop writing on the old server.
