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
  ],
};
