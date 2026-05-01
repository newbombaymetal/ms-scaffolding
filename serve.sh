#!/bin/bash
# Serve the PWA on the local network for iPhone testing.

cd "$(dirname "$0")"

PORT=8000
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")

echo ""
echo "  Sales & Maintenance — PWA"
echo "  ─────────────────────────"
echo "  On this Mac:    http://localhost:$PORT"
echo "  On your iPhone: http://$IP:$PORT"
echo ""
echo "  iPhone install steps:"
echo "    1. Connect iPhone to same Wi-Fi as this Mac"
echo "    2. Open Safari and go to: http://$IP:$PORT"
echo "    3. Tap the Share button (square with arrow)"
echo "    4. Scroll and tap 'Add to Home Screen'"
echo "    5. Tap 'Add' — the app icon appears on your Home Screen"
echo ""
echo "  Press Ctrl-C to stop the server."
echo ""

exec python3 -m http.server "$PORT" --bind 0.0.0.0
