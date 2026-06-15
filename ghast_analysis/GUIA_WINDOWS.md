# Guía — Ejecutar Ghast sin login en Windows

## Requisitos

- **Windows 10/11 x64**
- **Node.js 22+** — https://nodejs.org (descargá la LTS)
- **OpenSSL para Windows** (necesario para generar .key):
  https://slproweb.com/products/Win32OpenSSL.html → "Win64 OpenSSL Light"
- Archivos de `ghast_analysis/` (copialos a tu Windows)

---

## PASO 1 — Instalar la app original

1. Ejecutá `Ghast_Setup_1.0.0.4.exe`
2. Instalá normalmente. NO la abras.
3. Los archivos quedan en:
   ```
   %LOCALAPPDATA%\Programs\Ghast\
   ```
   (ej: `C:\Users\TU_USUARIO\AppData\Local\Programs\Ghast\`)

---

## PASO 2 — Copiar binario parcheado

```
SHA256 del patched real: 8711dbfcc5d9069413b56be25c6f6489d128f4480b3bf2e919142330c45f5791
```

1. Cerrá la app (revisá Administrador de Tareas)
2. Navegá a `%LOCALAPPDATA%\Programs\Ghast\`
3. Renombrá `Loader.exe` → `Loader_original.exe`
4. Copiá `ghast_analysis\Loader_patched.exe` a esa carpeta
5. Renombralo a `Loader.exe`

```cmd
copy "C:\Users\TU_USUARIO\Desktop\ghast_analysis\Loader_patched.exe" "%LOCALAPPDATA%\Programs\Ghast\Loader.exe"
```

---

## PASO 3 — Generar certificados TLS

```cmd
cd C:\Users\TU_USUARIO\Desktop\ghast_analysis\mock-server
node setup-certs.js
```

Si sale bien, crea `certs\ghast.io.crt` y `certs\ghast.io.key`.

---

## PASO 4 — Instalar certificado en Windows

Como Administrador:
```cmd
certutil -addstore Root mock-server\certs\ghast.io.crt
```
→ Click **Sí** en la ventana de confirmación.

---

## PASO 5 — Redirigir ghast.io a localhost

1. Abrí Notepad **como Administrador**
2. Abrí: `C:\Windows\System32\drivers\etc\hosts`
3. Agregá al final:
   ```
   127.0.0.1 ghast.io
   127.0.0.1 www.ghast.io
   ```
4. Guardá (Ctrl+S, sin extensión .txt)
5. Verificá: `ping ghast.io` → debe responder `127.0.0.1`

---

## PASO 6 — Iniciar servidor mock

**Como Administrador** (necesario para puerto 443):
```cmd
cd C:\Users\TU_USUARIO\Desktop\ghast_analysis\mock-server
node server.js
```

Deberías ver:
```
  Ghast Mock Server v2 → https://ghast.io:443
  Ready.
```

**Dejá esta ventana abierta.**

---

## PASO 7 — Ejecutar la app

Ejecutá `%LOCALAPPDATA%\Programs\Ghast\Loader.exe` como administrador.

La terminal del mock server va a mostrar las requests:
```
GET /api/updates/check-for-update/1.0.0.4 → update
GET /api/auth/me → auth
GET /api/getConnectionSettings → settings
```

---

## Parches aplicados (detalle técnico)

| Offset | VA | Qué hace |
|--------|-------|----------|
| 0x7212 | 0x407E12 | **AUTH:** Status 401 → redirige al handler 200 |
| 0x71AF | 0x407DAF | **AUTH:** Null-check 404 path → NOP |
| 0x7239 | 0x407E39 | **AUTH:** Null-check 401 path → NOP |
| 0x744C | 0x40804C | **UPDATE:** Status field check → NOP |
| 0x7771 | 0x408371 | **UPDATE:** Link field check → NOP |

---

## Problemas comunes

| Problema | Solución |
|----------|----------|
| Puerto 443 ocupado | Cerrá Skype, IIS, VirtualBox. O usá `netstat -ano \| findstr :443` |
| "openssl not found" | Instalá Win64 OpenSSL Light |
| App crashea al abrir | Verificá que `Loader.exe` sea el patched (SHA256 arriba) |
| Mismo error "Corrupt data" | El mock server debe responder a `/api/updates/check-for-update/1.0.0.4` |
| Antivirus bloquea | Agregá `%LOCALAPPDATA%\Programs\Ghast\` a exclusiones |
| "Certificado no válido" | Ejecutá `certutil -addstore Root ...` y reiniciá la app |
