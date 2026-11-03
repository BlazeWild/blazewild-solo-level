#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "$0")/.." && pwd)"
node_bin="$(command -v node)"
unit_dir="$HOME/.config/systemd/user"
mkdir -p "$unit_dir"
python3 - "$project_dir" "$node_bin" "$unit_dir" <<'PY'
import pathlib,sys
project,node,units=sys.argv[1:]
def quote(s): return '"'+s.replace('\\','\\\\').replace('"','\\"').replace('%','%%')+'"'
for role in ['api','scheduler']:
 entry='index' if role=='api' else 'worker'
 text=f'''[Unit]
Description=Level Up local {role}
After=graphical-session.target
PartOf=graphical-session.target

[Service]
Type=simple
WorkingDirectory={quote(project)}
ExecStart={quote(node)} --import tsx server/{entry}.ts
Restart=on-failure
RestartSec=5
UMask=0077
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
'''
 pathlib.Path(units,f'level-up-{role}.service').write_text(text)
PY
systemctl --user daemon-reload
systemctl --user enable --now level-up-api.service level-up-scheduler.service
printf '%s\n' 'Installed local user services. Open http://127.0.0.1:3001'
