#!/usr/bin/env bash
# =============================================================================
#  MuktiVPN server installer  (Ubuntu 22.04 / 24.04, Debian 12)
#
#  Sets up on ONE free VPS (e.g. Oracle Cloud Always Free):
#    1. WireGuard VPN  (UDP 51820)  -> for Windows / Mac / Linux / Android / iOS apps
#    2. HTTPS proxy    (TCP 443)    -> for the MuktiVPN browser extension
#                                      (Chrome, Edge, Brave, Opera, Vivaldi, Firefox)
#
#  Usage (as root):
#    DOMAIN=myvpn.duckdns.org EMAIL=you@example.com CLIENTS=3 bash install.sh
#
#  DOMAIN must already point (A record) to this server's public IP.
#  A free domain from https://www.duckdns.org works fine.
# =============================================================================
set -euo pipefail

DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
CLIENTS="${CLIENTS:-3}"
WG_PORT="${WG_PORT:-51820}"
PROXY_PORT="${PROXY_PORT:-443}"
PROXY_USER="${PROXY_USER:-mukti}"
PROXY_PASS="${PROXY_PASS:-$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)}"
WG_NET="10.8.0"
OUT="/root/muktivpn"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
step()  { printf '\n\033[36m==> %s\033[0m\n' "$*"; }

[[ $EUID -eq 0 ]] || { red "Run as root:  sudo -i  then run again"; exit 1; }
[[ -n "$DOMAIN" ]] || { red "Set DOMAIN, e.g.  DOMAIN=myvpn.duckdns.org EMAIL=you@x.com bash install.sh"; exit 1; }
[[ -n "$EMAIL"  ]] || { red "Set EMAIL (used only by Let's Encrypt for expiry notices)"; exit 1; }

mkdir -p "$OUT"
chmod 700 "$OUT"

# -----------------------------------------------------------------------------
step "Installing packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y wireguard qrencode iptables curl certbot apache2-utils
apt-get install -y squid-openssl || apt-get install -y squid

PUBLIC_IP="$(curl -4 -fsS https://api.ipify.org || curl -4 -fsS https://ifconfig.me)"
WAN_IF="$(ip -4 route show default | awk '{print $5; exit}')"
green "Public IP: $PUBLIC_IP   Interface: $WAN_IF"

RESOLVED="$(getent ahostsv4 "$DOMAIN" | awk '{print $1; exit}' || true)"
if [[ "$RESOLVED" != "$PUBLIC_IP" ]]; then
  red "WARNING: $DOMAIN resolves to '$RESOLVED' but this server is $PUBLIC_IP."
  red "Fix the DNS (DuckDNS) first, or certificate creation will fail."
fi

# -----------------------------------------------------------------------------
step "Opening firewall ports (also fixes Oracle Cloud's default iptables REJECT rule)"
open_port() { # proto port
  iptables -C INPUT -p "$1" --dport "$2" -j ACCEPT 2>/dev/null || iptables -I INPUT -p "$1" --dport "$2" -j ACCEPT
}
open_port tcp 80
open_port tcp "$PROXY_PORT"
open_port udp "$WG_PORT"
iptables -C FORWARD -i wg0 -j ACCEPT 2>/dev/null || iptables -I FORWARD -i wg0 -j ACCEPT
iptables -C FORWARD -o wg0 -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null \
  || iptables -I FORWARD -o wg0 -m state --state RELATED,ESTABLISHED -j ACCEPT
if command -v ufw >/dev/null && ufw status | grep -q active; then
  ufw allow 80/tcp; ufw allow "$PROXY_PORT"/tcp; ufw allow "$WG_PORT"/udp
fi
if command -v netfilter-persistent >/dev/null; then netfilter-persistent save; fi

# -----------------------------------------------------------------------------
step "Enabling IP forwarding"
echo 'net.ipv4.ip_forward=1' > /etc/sysctl.d/99-muktivpn.conf
sysctl -p /etc/sysctl.d/99-muktivpn.conf

# -----------------------------------------------------------------------------
step "Configuring WireGuard"
umask 077
mkdir -p /etc/wireguard
if [[ ! -f /etc/wireguard/server.key ]]; then
  wg genkey | tee /etc/wireguard/server.key | wg pubkey > /etc/wireguard/server.pub
fi
SERVER_PRIV="$(cat /etc/wireguard/server.key)"
SERVER_PUB="$(cat /etc/wireguard/server.pub)"

cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address = ${WG_NET}.1/24
ListenPort = ${WG_PORT}
PrivateKey = ${SERVER_PRIV}
PostUp   = iptables -t nat -A POSTROUTING -s ${WG_NET}.0/24 -o ${WAN_IF} -j MASQUERADE
PostDown = iptables -t nat -D POSTROUTING -s ${WG_NET}.0/24 -o ${WAN_IF} -j MASQUERADE
EOF

for i in $(seq 1 "$CLIENTS"); do
  name="client${i}"
  ip="${WG_NET}.$((i + 1))"
  if [[ ! -f "$OUT/$name.key" ]]; then
    wg genkey | tee "$OUT/$name.key" | wg pubkey > "$OUT/$name.pub"
    wg genpsk > "$OUT/$name.psk"
  fi
  cat >> /etc/wireguard/wg0.conf <<EOF

# ${name}
[Peer]
PublicKey = $(cat "$OUT/$name.pub")
PresharedKey = $(cat "$OUT/$name.psk")
AllowedIPs = ${ip}/32
EOF
  cat > "$OUT/$name.conf" <<EOF
[Interface]
PrivateKey = $(cat "$OUT/$name.key")
Address = ${ip}/32
DNS = 1.1.1.1, 9.9.9.9

[Peer]
PublicKey = ${SERVER_PUB}
PresharedKey = $(cat "$OUT/$name.psk")
Endpoint = ${DOMAIN}:${WG_PORT}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
EOF
  qrencode -t png -o "$OUT/$name.png" < "$OUT/$name.conf"
done

systemctl enable wg-quick@wg0
systemctl restart wg-quick@wg0

# -----------------------------------------------------------------------------
if [[ "${SELF_SIGNED:-0}" == "1" ]]; then
  # Test mode only: browsers will NOT trust this certificate.
  step "Creating self-signed TLS certificate (SELF_SIGNED=1, testing only)"
  mkdir -p "/etc/letsencrypt/live/$DOMAIN" /etc/letsencrypt/renewal-hooks/deploy
  openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=$DOMAIN" \
    -keyout "/etc/letsencrypt/live/$DOMAIN/privkey.pem" -out "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" 2>/dev/null
else
  step "Getting free TLS certificate from Let's Encrypt for $DOMAIN"
  systemctl stop squid 2>/dev/null || true
  certbot certonly --standalone --non-interactive --agree-tos -m "$EMAIL" -d "$DOMAIN" --keep-until-expiring
fi

# Copy certs where squid (user 'proxy') can read them; refresh on every renewal.
cat > /etc/letsencrypt/renewal-hooks/deploy/muktivpn-squid.sh <<EOF
#!/bin/sh
mkdir -p /etc/squid/certs
cp /etc/letsencrypt/live/${DOMAIN}/fullchain.pem /etc/squid/certs/fullchain.pem
cp /etc/letsencrypt/live/${DOMAIN}/privkey.pem   /etc/squid/certs/privkey.pem
chown -R proxy:proxy /etc/squid/certs
chmod 600 /etc/squid/certs/privkey.pem
systemctl restart squid || true
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/muktivpn-squid.sh
# certbot standalone needs port 80 free during renewal; squid does not use 80, so nothing to stop.
/etc/letsencrypt/renewal-hooks/deploy/muktivpn-squid.sh || true

# -----------------------------------------------------------------------------
step "Configuring HTTPS proxy (squid) for the browser extension"
htpasswd -bcB /etc/squid/passwd "$PROXY_USER" "$PROXY_PASS" >/dev/null
chown proxy:proxy /etc/squid/passwd
chmod 640 /etc/squid/passwd

[[ -f /etc/squid/squid.conf.orig ]] || cp /etc/squid/squid.conf /etc/squid/squid.conf.orig
AUTH_HELPER="$(ls /usr/lib/squid/basic_ncsa_auth /usr/lib64/squid/basic_ncsa_auth 2>/dev/null | head -n1 || true)"
[[ -n "$AUTH_HELPER" ]] || { red "basic_ncsa_auth not found"; exit 1; }

cat > /etc/squid/squid.conf <<EOF
# MuktiVPN - authenticated HTTPS forward proxy
https_port ${PROXY_PORT} tls-cert=/etc/squid/certs/fullchain.pem tls-key=/etc/squid/certs/privkey.pem

auth_param basic program ${AUTH_HELPER} /etc/squid/passwd
auth_param basic realm MuktiVPN
auth_param basic credentialsttl 8 hours
acl authed proxy_auth REQUIRED

acl SSL_ports port 443
acl Safe_ports port 80 443 1025-65535
acl CONNECT method CONNECT
http_access deny !Safe_ports
http_access deny CONNECT !SSL_ports
http_access deny to_localhost
http_access allow authed
http_access deny all

# privacy: do not leak the user's real IP or proxy identity
forwarded_for delete
via off
request_header_access X-Forwarded-For deny all
request_header_access Via deny all
httpd_suppress_version_string on

cache deny all
access_log none
cache_log /var/log/squid/cache.log
EOF
squid -k parse

systemctl enable squid
systemctl restart squid

# -----------------------------------------------------------------------------
step "Writing extension server file"
cat > "$OUT/extension-server.json" <<EOF
{
  "name": "My Server (${DOMAIN})",
  "host": "${DOMAIN}",
  "port": ${PROXY_PORT},
  "username": "${PROXY_USER}",
  "password": "${PROXY_PASS}"
}
EOF

green "
==================================================================
 MuktiVPN is ready!

 Browser extension -> Options -> Import, paste this:
$(cat "$OUT/extension-server.json")

 Phone / PC app (official free WireGuard app):
   configs : $OUT/client*.conf
   QR codes: $OUT/client*.png
   show QR in terminal:  qrencode -t ansiutf8 < $OUT/client1.conf

 Test proxy from your PC:
   curl -x https://${PROXY_USER}:${PROXY_PASS}@${DOMAIN}:${PROXY_PORT} https://api.ipify.org
==================================================================
"
