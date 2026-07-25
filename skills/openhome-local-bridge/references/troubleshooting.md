# Troubleshooting

Work from the network inward. Do not rewrite the ability before proving which
boundary failed.

## Health endpoint is unreachable

1. Confirm the Local Ability is attached, synced, and restarted.
2. Inspect the ability log for `missing_bridge_token` or a bind failure.
3. Confirm the Mac and DevKit have private addresses on the same reachable LAN.
4. Test `curl http://DEVKIT_IP:PORT/health` from the Mac.
5. Disable VPNs temporarily when they route private subnets elsewhere.
6. Check venue Wi-Fi client isolation; same SSID does not guarantee peer access.
7. Confirm the chosen port is not already occupied.

## Health works but POST is unauthorized

- Confirm both sides use the same token without whitespace.
- Confirm the header is `X-OPENHOME-BRIDGE-TOKEN`.
- Do not debug by logging the token.
- Restart the ability after changing private runtime configuration.

## Native Mac app works but browser does not

- Inspect the browser console for CORS, mixed-content, or private-network errors.
- Add the exact scheme, host, and port to
  `OPENHOME_BRIDGE_ALLOWED_ORIGINS`.
- Avoid calling an HTTP DevKit from a public HTTPS page.
- Use a local server relay when browser policy blocks direct access.

## Browser works on the Mac but another device does not

- Start the server on `0.0.0.0`, not loopback only.
- Open the Mac's LAN URL instead of `localhost`.
- Confirm the firewall permits incoming connections.
- Confirm the other device is not on an isolated guest network.

## Event returns accepted but OpenHome says nothing

- Check the background ability log and queue.
- Confirm the ability is System-scoped and its background worker started.
- Confirm the active Agent can speak outside the custom ability.
- Send a simple `speak` event before testing `prompt` or custom actions.
- Keep text short and free of markup.

## DevKit cannot fetch a Mac-hosted asset

- Replace `127.0.0.1` with the Mac's LAN address.
- Bind the Mac server to a LAN-reachable interface.
- Confirm the asset URL works from another device on the same network.
- Keep assets private, short-lived, size-bounded, and content-type checked.

## Timing drifts

- Measure on the real network and device.
- Send voice events before the visual event by a configurable lead.
- Never wait for speech before performing the authoritative local action.
