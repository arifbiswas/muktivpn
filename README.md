# MuktiVPN — ১০০% ফ্রি, ওপেন সোর্স VPN

নিজের সার্ভারে চলে, কোনো মাসিক খরচ নেই।

| অংশ | কী দিয়ে চলে | কোথায় কাজ করে |
|---|---|---|
| **সার্ভার** | WireGuard + Squid HTTPS proxy | Oracle Cloud Always Free (ফ্রি সারাজীবন) |
| **ব্রাউজার এক্সটেনশন** | `extension/` (এই প্রজেক্ট) | Chrome, Edge, Brave, Opera, Vivaldi, Firefox |
| **ফোন / PC অ্যাপ** | অফিসিয়াল WireGuard অ্যাপ (ফ্রি, ওপেন সোর্স) | Android, iPhone, Windows, Mac, Linux |

> **জরুরি কথা:** ব্রাউজার এক্সটেনশন শুধু ওই ব্রাউজারের ট্রাফিক লুকায় (proxy)। পুরো ফোন/PC এর সব অ্যাপের ট্রাফিক লুকাতে WireGuard অ্যাপ ব্যবহার করুন। দুটোই একই সার্ভার থেকে চলে।

---

## ধাপ ১ — ফ্রি সার্ভার নিন (৳০)

1. <https://www.oracle.com/cloud/free/> এ অ্যাকাউন্ট খুলুন (কার্ড ভেরিফাই লাগে, চার্জ হয় না)।
2. **Create VM instance** → Image: **Ubuntu 22.04/24.04**, Shape: *Always Free eligible* (Ampere A1 বা E2.1.Micro)।
3. VCN → **Security List** → Ingress rules যোগ করুন:
   - TCP `80`, TCP `443` (source `0.0.0.0/0`)
   - UDP `51820` (source `0.0.0.0/0`)
4. পাবলিক IP টা কপি করুন।

> বিকল্প ফ্রি: Google Cloud e2-micro (Always Free), AWS free tier (১২ মাস)।

## ধাপ ২ — ফ্রি ডোমেইন (৳০)

1. <https://www.duckdns.org> এ লগইন করে একটা নাম নিন, যেমন `myvpn.duckdns.org`।
2. সেখানে আপনার সার্ভারের পাবলিক IP বসান।

(HTTPS proxy এর জন্য ডোমেইন + Let's Encrypt সার্টিফিকেট লাগে — দুটোই ফ্রি।)

## ধাপ ৩ — সার্ভারে ইনস্টল (১টা কমান্ড)

আপনার PC থেকে স্ক্রিপ্টটা সার্ভারে পাঠান ও চালান:

```bash
scp server/install.sh ubuntu@YOUR_SERVER_IP:~
```

```bash
ssh ubuntu@YOUR_SERVER_IP
```

```bash
sudo DOMAIN=myvpn.duckdns.org EMAIL=you@example.com CLIENTS=3 bash install.sh
```

শেষে স্ক্রিনে দেখাবে:
- এক্সটেনশনের জন্য একটা **JSON** (host, port, username, password)
- `/root/muktivpn/client1.conf` … — WireGuard অ্যাপের কনফিগ ও QR কোড

QR কোড টার্মিনালে দেখতে:

```bash
sudo qrencode -t ansiutf8 < /root/muktivpn/client1.conf
```

## ধাপ ৪ — ব্রাউজার এক্সটেনশন

বিল্ড করুন (Node.js লাগবে):

```bash
./extension/build.sh
```

তৈরি হবে `extension/dist/chrome`, `extension/dist/firefox` আর দুটো `.zip`।

**Chrome / Edge / Brave / Opera / Vivaldi**
1. `chrome://extensions` (Edge এ `edge://extensions`) খুলুন
2. **Developer mode** অন করুন → **Load unpacked** → `extension/dist/chrome` সিলেক্ট করুন

**Firefox**
1. `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → `extension/dist/firefox/manifest.json`
2. স্থায়ীভাবে ইনস্টলের জন্য ফ্রিতে <https://addons.mozilla.org/developers/> এ সাইন করিয়ে নিন (unlisted রাখলে রিভিউ লাগে না প্রায়)।

**ব্যবহার:** এক্সটেনশনের ⚙ → *Import* বক্সে সার্ভারের JSON পেস্ট করুন → পপআপে বড় বাটন চাপুন → **Connected**। পপআপে আপনার নতুন IP দেখাবে।

ফিচার:
- এক ক্লিকে Connect / Disconnect, একাধিক সার্ভার
- প্রক্সি পাসওয়ার্ড অটো লগইন
- **WebRTC leak protection** (আসল IP লিক হয় না)
- localhost / লোকাল নেটওয়ার্ক বাইপাস
- টুলবারে সবুজ **ON** ব্যাজ

## ধাপ ৪.৫ — সবার জন্য ফ্রি সার্ভার (Free servers)

এক্সটেনশন ইনস্টল করলেই ইউজার **Free servers** লিস্ট দেখে — কিছু সেটআপ করতে হয় না, শুধু Connect চাপলেই চলে।
লিস্টটা আসে এই repo-র [`servers.json`](servers.json) থেকে। এক্সটেনশন প্রতি ৬ ঘণ্টায় এটা নতুন করে পড়ে,
তাই **নতুন সার্ভার যোগ করতে নতুন এক্সটেনশন ভার্সন পাবলিশ করতে হয় না** — শুধু `servers.json` এডিট করে push করুন।

1. প্রতিটা ফ্রি VPS এ `install.sh` চালান (Oracle Free Tier এ একাধিক VM বানানো যায়, বিভিন্ন region এ)।
2. স্ক্রিপ্ট যে JSON দেখায় সেটা `servers.json` এ যোগ করুন, সাথে `country` (২ অক্ষরের দেশ কোড, ফ্ল্যাগ দেখানোর জন্য):

```json
{
  "version": 1,
  "servers": [
    { "name": "Singapore 1", "country": "SG", "host": "sg1.duckdns.org", "port": 443, "username": "mukti", "password": "..." },
    { "name": "Germany 1",   "country": "DE", "host": "de1.duckdns.org", "port": 443, "username": "mukti", "password": "..." }
  ]
}
```

3. `git commit` + `git push` — কয়েক ঘণ্টার মধ্যে সব ইউজারের লিস্টে চলে আসবে (Options → *Refresh list* চাপলে সাথে সাথে)।

> **সতর্কতা:** এই লিস্ট public — এর পাসওয়ার্ড যে কেউ দেখতে পারবে, তাই সার্ভারটা কার্যত সবার জন্য খোলা।
> সার্ভারের ব্যান্ডউইথ সীমা (Oracle Free: মাসে ১০ TB) আর ক্লাউড কোম্পানির নিয়ম খেয়াল রাখুন; কেউ অপব্যবহার করলে সেটা আপনার সার্ভারের IP থেকে হবে।
> দরকার হলে সার্ভারে `htpasswd /etc/squid/passwd mukti` দিয়ে পাসওয়ার্ড বদলে `servers.json` আপডেট করুন।

## ধাপ ৫ — ফোন ও PC অ্যাপ

<https://www.wireguard.com/install/> থেকে অফিসিয়াল অ্যাপ নামান →
*Add tunnel* → **Scan QR** (ফোন) অথবা **Import from file** → `client1.conf` (PC)।

---

## স্টোরে পাবলিশ (ঐচ্ছিক)

| স্টোর | খরচ |
|---|---|
| Firefox Add-ons | ফ্রি |
| Microsoft Edge Add-ons | ফ্রি |
| Opera Add-ons | ফ্রি |
| Chrome Web Store | একবার $5 (না দিলে *Load unpacked* করে ফ্রিতে চালান) |

আপলোডের জন্য `extension/dist/muktivpn-*.zip` ব্যবহার করুন।
**Safari** proxy API সাপোর্ট করে না — Mac/iPhone এ WireGuard অ্যাপ ব্যবহার করুন।

## সমস্যা হলে

- **Proxy connect হয় না:** সার্ভার থেকে টেস্ট — `curl -x https://USER:PASS@DOMAIN:443 https://api.ipify.org` ; Oracle Security List এ 443 খোলা কিনা দেখুন।
- **"Another extension is controlling the proxy":** অন্য VPN/proxy এক্সটেনশন বন্ধ করুন।
- **Firefox এ কাজ করছে না:** পপআপে *Allow access to all sites* বাটন থাকলে চাপুন।
- **সার্টিফিকেট এরর:** DuckDNS এ IP ঠিক আছে কিনা দেখুন, তারপর আবার `install.sh` চালান।

## ফাইল

```
server/install.sh            সার্ভার সেটআপ (WireGuard + HTTPS proxy + ফ্রি SSL)
extension/src/               এক্সটেনশনের কোড (সব ব্রাউজারে এক কোড)
extension/manifest.*.json    Chrome ও Firefox এর manifest
servers.json                 সবার জন্য ফ্রি সার্ভার লিস্ট (এক্সটেনশন এখান থেকে পড়ে)
extension/build.sh           বিল্ড + zip
extension/tools/make-icons.mjs  আইকন জেনারেটর
```

লাইসেন্স: MIT — যে কেউ ফ্রিতে ব্যবহার/পরিবর্তন করতে পারবে।
