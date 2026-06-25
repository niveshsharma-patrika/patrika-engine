# Patrika Engine — Azure deployment runbook

Moves the app off Vercel + Supabase onto your **Azure VM** (PM2 + nginx, like
`patrika-flow` / `-hr` / `-newsroom`) with **Azure Database for PostgreSQL**.

The app is plain Node + Postgres now — no Supabase, no Vercel. These steps run
on the Azure box over SSH.

## 0. Prerequisites
- Azure VM: Ubuntu, **Node 22**, **PM2**, **nginx** (already present for the other sites).
- **Azure Database for PostgreSQL** (Flexible Server). Create an empty database `patrika_engine`.
- The VM can reach the database (firewall rule: allow the VM's IP / VNet).
- `postgresql-client` on the VM: `sudo apt install -y postgresql-client`
- This repo cloned on the VM, on branch `aws-rds-migration` (until it's merged).

## 1. Load the schema into the Azure database
```bash
cd /path/to/patrika-engine
psql "postgres://USER:PASS@your-db.postgres.database.azure.com:5432/patrika_engine?sslmode=require" \
     -f deploy/schema.sql
```

## 2. Copy the data over from Supabase
Get the Supabase **direct** connection string (Supabase Dashboard → Project
Settings → Database → Connection string → URI).
```bash
SOURCE_URL='postgres://postgres:...@db.xxxx.supabase.co:5432/postgres' \
DATABASE_URL='postgres://USER:PASS@your-db.postgres.database.azure.com:5432/patrika_engine?sslmode=require' \
bash deploy/migrate-data.sh
```
(Skips the unused `embedding` column and `profiles` automatically.)

## 3. Configure the environment
```bash
cp .env.production.example .env
nano .env        # set DATABASE_URL, PGSSL=require, PORT, OPENAI_API_KEY,
                 # and generate AUTH_SECRET + CRON_SECRET:  openssl rand -hex 32
```

## 4. Build + start under PM2
```bash
npm ci
npm run build
# Next "standalone" needs static assets copied next to the server:
cp -r .next/static .next/standalone/.next/static
cp -r public       .next/standalone/public
pm2 start ecosystem.config.cjs
pm2 save
```
Check it: `pm2 logs patrika-engine` and `curl -I http://127.0.0.1:3007`

## 5. Create the first admin
```bash
ADMIN_PASSWORD='choose-a-strong-password' \
  npx tsx scripts/create-admin.ts nivesh.sharma@in.patrika.com "Nivesh Sharma" admin
```
(Then sign in and add everyone else from **Users** in the app.)

## 6. nginx + HTTPS
```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/engine.patrika.com   # edit server_name + port
sudo ln -s /etc/nginx/sites-available/engine.patrika.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d engine.patrika.com
```

## 7. Schedule the 5-minute ingest
```bash
chmod +x deploy/cron-ingest.sh
crontab -e
# add:
*/5 * * * * /full/path/to/patrika-engine/deploy/cron-ingest.sh
```

## 8. Verify
- Visit `https://engine.patrika.com` → sign in → the six feed tabs load.
- `pm2 logs patrika-engine` shows ingest ticks every 5 min with no errors.
- Generate a draft + an interactive widget to confirm the AI keys work.

## Redeploying after a code change
```bash
git pull
npm ci && npm run build
cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public
pm2 restart patrika-engine
```

## Rollback
The old stack (Vercel + Supabase) stays live and untouched until you flip DNS to
`engine.patrika.com`. If anything's wrong, point DNS back — nothing was deleted.
