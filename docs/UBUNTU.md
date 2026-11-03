# Ubuntu operation

The normal `npm run dev` or `npm start` command runs the API, with its scheduler checking every 15 seconds. State, reminder jobs, backups, and photo proof are stored in Neon. `DATABASE_URL` is required and remains server-side.

## Optional user services

Build first and stop an existing dev/start command. The installer captures the exact current Node executable (including an nvm path) and project folder. Reinstall the units if you move the folder or change Node installation.

```bash
npm run build
bash scripts/install-service.sh
systemctl --user status level-up-api.service level-up-scheduler.service
journalctl --user -u level-up-api.service -u level-up-scheduler.service -f
```

The installer creates two units in `~/.config/systemd/user/` and enables them for your user session. No root system service, external account or public binding is created. It is optional and was not run during implementation. If the Ubuntu login lacks a running user systemd manager, use `npm start` in a terminal instead.

Restart or stop:

```bash
systemctl --user restart level-up-api.service level-up-scheduler.service
systemctl --user stop level-up-api.service level-up-scheduler.service
```

Disable and uninstall (tracking data is retained):

```bash
systemctl --user disable --now level-up-api.service level-up-scheduler.service
rm ~/.config/systemd/user/level-up-api.service ~/.config/systemd/user/level-up-scheduler.service
systemctl --user daemon-reload
```

## Desktop notifications

Install Ubuntu's notification client if missing:

```bash
sudo apt install libnotify-bin
cp -n .env.example .env
```

Edit `.env`, setting `DESKTOP_NOTIFICATIONS=true`. From the logged-in graphical terminal, import session environment into the user manager before restarting the scheduler:

```bash
systemctl --user import-environment DISPLAY WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS XDG_RUNTIME_DIR
systemctl --user restart level-up-scheduler.service
```

In Settings choose **desktop**, save, then click **Send test notification**. Check the recent delivery jobs and journal. GNOME/KDE Do Not Disturb, notification preferences and missing session D-Bus can suppress display even when `notify-send` exits successfully; `sent` means handed to the channel, not proof a person saw it. No sound is explicitly enabled.

Browser permission is requested only through a deliberate button click. Choose **browser** for tab-only notifications, **desktop** for Ubuntu, or configured **push**; only one is active to prevent duplicate channel alerts. Quiet hours and focus apply to scheduled reminders. An explicit test bypasses quiet hours so diagnostics are useful.

Powered-off or sleeping laptops cannot run the local scheduler. On wake it reconciles quest deadlines and skips reminders older than ten minutes. Long absence requires review in the UI. The user services do not promise operation while logged out or asleep; no system wake timer or lingering is configured.

## Local security and privacy

The API accepts loopback hostnames, checks browser origins, and requires a custom header for writes. It is a single local owner and has no hosted login. SQLite permissions are restricted; service UMask is 0077. Anyone with access to your OS account or local filesystem can inspect/alter the data, so it is not an anti-cheating system. Do not put this API behind a public reverse proxy.

Provider tokens are encrypted with your server-side key. No analytics, external fonts, automatic AI calls or automatic calendar writes occur. Keep `.env`, the database and exported logs private. Core operation needs no internet after installing dependencies.
