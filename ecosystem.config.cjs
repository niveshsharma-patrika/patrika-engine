// PM2 process definition for the Azure VM (same pattern as patrika-flow / -hr /
// -newsroom). Runs the Next.js standalone server in fork mode.
//
//   pm2 start ecosystem.config.cjs && pm2 save
//
// Node 22's --env-file loads .env (DATABASE_URL, AUTH_SECRET, the AI keys,
// CRON_SECRET, PORT) into the process — keep real secrets in .env, never here.
module.exports = {
  apps: [
    {
      name: "patrika-news-engine",
      script: ".next/standalone/server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      node_args: "--env-file=.env",
      env: { NODE_ENV: "production" },
      // Image generation holds a ~2 MB base64 payload in memory; a 600M cap let
      // PM2 kill the process mid-request, so nginx returned an HTML error page
      // and the client saw "Unexpected token '<'". 1.5G gives headroom.
      // (If the VM is small — check `free -m` — lower this to ~1024M.)
      max_memory_restart: "1500M",
      time: true,
    },
    {
      // Twitter/X scraper shim (Python + Scweet). Deliberately its OWN process:
      // if it crashes, hangs or gets banned, the news engine above is untouched.
      // Setup once:  cd twitter-crawler && python3 -m venv venv \
      //              && ./venv/bin/pip install -r requirements.txt
      name: "patrika-twitter-shim",
      script: "venv/bin/uvicorn",
      args: "app:app --host 127.0.0.1 --port 8791",
      cwd: __dirname + "/twitter-crawler",
      interpreter: "none",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "400M",
      time: true,
    },
  ],
};
