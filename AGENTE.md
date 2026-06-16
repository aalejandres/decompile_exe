# AGENTE — Instrucciones para continuar el reverse engineering de Ghast

## Qué es este proyecto

Estamos haciendo ingeniería inversa de `Ghast_Setup_1.0.0.4.exe`, un instalador de una app proxy/QoS para Minecraft PvP (empresa VP Deploy, Francia, dominio `ghast.io`). El objetivo es ejecutar la app sin conexión a sus servidores reales, mediante binarios parcheados + un servidor mock local.

---

## Cómo está armado el proyecto

```
descompile_exe/
├── Ghast_Setup_1.0.0.4.exe              ← instalador ORIGINAL (46 MB, NO tocar)
├── ghast_analysis/
│   ├── Loader_patched.exe               ← binario parcheado (5 parches: auth + update)
│   ├── Ghast_patched.exe                ← binario parcheado (5 parches: auth)
│   ├── Common_patched.dll               ← binario parcheado (1 parche: skip login UI)
│   ├── 00_GHOST_APP_INDEX.html          ← frontend React completo extraído
│   ├── 01_CSS_styles.css
│   ├── 02_JS_block_0_1518b.js           ← webpack runtime
│   ├── 02_JS_block_1_373727b.js          ← React 16 + Redux (código principal)
│   ├── 02_JS_block_2_33664b.js           ← más componentes + SVG
│   ├── 03_libsodium_exports.txt          ← 299 funciones criptográficas exportadas
│   ├── 04_Loader_strings.txt             ← todos los strings de Loader.exe (UTF-8)
│   ├── 05_GhastApp_strings.txt           ← todos los strings de Ghast.exe (UTF-8)
│   ├── 06_EXTRACTED_FILES.txt            ← manifiesto de archivos instalados
│   ├── 07_SUMMARY.json                   ← resumen estructurado
│   ├── GUIA_WINDOWS.md                   ← guía paso a paso para Windows
│   ├── RESUMEN_ANALISIS.md               ← historial cronológico de pruebas
│   ├── mock-server/
│   │   ├── server.js                     ← servidor HTTPS mock (emula ghast.io)
│   │   ├── setup-certs.js                ← generador de certificados TLS
│   │   ├── package.json
│   │   └── README.md
│   └── (posible) server.js — variable global "bypassActive" activo
```

---

## Arquitectura de la app

```
Loader.exe (C++, MSVC + MFC)
  ├── /api/auth/me              → verifica sesión
  ├── /api/updates/check-for-update/<ver> → update check
  ├── /api/getConnectionSettings → QoS settings
  └── Spawnea Ghast.exe cuando auth OK

Ghast.exe (C++, CEF browser host)
  ├── Embebe CEF (libcef.dll, 96 MB = Chromium completo)
  ├── Carga Common.dll → HTML/JS/CSS del frontend React
  ├── Expone bindings nativos via V8:
  │     login.SignInWithGoogle()
  │     login.SignOutFromGoogle()
  │     app.Minimize(), app.Close(), app.SetUsername()
  │     app.SaveConfiguration(...), app.GetAccountType()
  │     app.SavePath(sPath)     ← setea window.state.path
  │     config.Run(), config.Stop()
  │     config.getServers(), config.saveServers(sServers)
  └── Usa cpprestsdk (C++ REST SDK) para HTTP/JSON

Common.dll (422 KB)
  └── HTML con React 16 + Redux + React-Router + Tailwind CSS
      minificado por webpack, cargado via CEF
```

---

## PARCHE #1 — Loader.exe (auth + update bypass)

**Binario objetivo:** `Loader.exe` extraído del instalador (SHA256 original: `c8a65acd...`)

**Toolchain:** objdump + Python para calcular offsets

**Parches aplicados (5):**

| # | VA | Descripción | Bytes originales | Bytes nuevos |
|---|---|---|---|---|
| 1 | `0x407E12` | Auth: status 401 → redirige al handler 200 OK | `0f 85 b5 00 00 00` | `e9 27 ff ff ff 90` |
| 2 | `0x407DAF` | Auth: null-check 404 path → NOP | `0f 84 78 01 00 00` | `90 90 90 90 90 90` |
| 3 | `0x407E39` | Auth: null-check 401 path → NOP | `0f 84 f8 00 00 00` | `90 90 90 90 90 90` |
| 4 | `0x40804C` | Update: status field check → NOP | `0f 84 08 06 00 00` | `90 90 90 90 90 90` |
| 5 | `0x408371` | Update: link field check → NOP | `0f 84 e3 02 00 00` | `90 90 90 90 90 90` |

SHA256 del parcheado: `8711dbfcc5d9069413b56be25c6f6489d128f4480b3bf2e919142330c45f5791`

**Lógica de la función parcheada (0x407CF0):**
- Recibe HTTP status code en AX
- `CMP AX, 0xC8` (200) → handler normal → set result=1 → OK
- `CMP AX, 0x194` (404) → crea error → null-check → E_FAIL (ahi aplicamos NOP)
- `CMP AX, 0x191` (401) → crea error → null-check → E_FAIL (redirigimos al 200 handler)

---

## PARCHE #2 — Ghast.exe (auth bypass)

**Binario objetivo:** `Ghast.exe` extraído del instalador

**Parches aplicados (5):**

| # | VA | Descripción | Bytes originales | Bytes nuevos |
|---|---|---|---|---|
| 1 | `0x4082BA` | Auth: status 401 → redirige al path success | `0f 85 e1 00 00 00` | `e9 ed ff ff ff 90` |
| 2 | `0x408210` | Auth: null-check 404 path 1 → NOP | `0f 84 e9 01 00 00` | `90 90 90 90 90 90` |
| 3 | `0x408256` | Auth: null-check 404 path 2 → NOP | `0f 84 99 01 00 00` | `90 90 90 90 90 90` |
| 4 | `0x4082C9` | Auth: null-check 401 path 1 → NOP | `0f 84 30 01 00 00` | `90 90 90 90 90 90` |
| 5 | `0x40830F` | Auth: null-check 401 path 2 → NOP | `0f 84 f4 00 00 00` | `90 90 90 90 90 90` |

SHA256 del parcheado: `fb92c165ac0147321e0232abb26fedbf2f87074ac1cedf791eab90d331369e4d`

---

## PARCHE #3 — Common.dll (skip login UI)

**Binario objetivo:** `Common.dll` extraído del instalador

**Un solo parche:**

| Offset en archivo | Descripción |
|---|---|
| `0x672A6` | Reemplaza `initialEntries:[window.state.path]` por `initialEntries:['/']              ` |

Esto fuerza a React Router a arrancar siempre en el dashboard (`/`) sin importar lo que C++ setee en `window.state.path`.

SHA256 del parcheado: `c87e7fc25132db0a10b2fc4fe3623f7c8d454c6762b2a2ba25441564342a71fc`

---

## Estado actual (al último push)

✅ **Update check** — funciona, devuelve `"update": false`  
✅ **Login/autenticación** — funciona, campos: `name`, `email`, `pictureURL`, `admin`, `lightning`, `basic`  
✅ **UI carga** — funciona, Common.dll parcheado muestra dashboard directo  
✅ **Mock server HTTPS** — funciona en puerto 443 con certificado autofirmado  
🔄 **Botón "Run" (QoS)** — servidor acepta POST 200 OK, pero C++ crashea con `"Invalid response"`

---

## Cómo extraer binarios frescos del instalador (en Linux)

```bash
innoextract -d /tmp/ghast_fresh Ghast_Setup_1.0.0.4.exe
ls /tmp/ghast_fresh/localappdata/Programs/Ghast/
```

---

## Cómo encontrar campos JSON esperados (técnica)

El binario usa `cpprestsdk` que extrae valores por nombre de campo. Las claves están en la sección `.rdata` como strings UTF-16LE.

```bash
# Buscar strings UTF-16LE en un rango
strings -e l Ghast_patched.exe | sort -u > utf16_strings.txt

# O con Python para tener offsets exactos:
python3 -c "
data = open('Ghast_patched.exe','rb').read()
# buscar wide strings con patrón byte[0x20-0x7f] + 0x00...
"
```

### Campos descubiertos hasta ahora

**Auth (`/api/auth/me` y `/login-success`):**
- `name` (string)
- `email` (string)  
- `pictureURL` (string)
- `admin` (bool)
- `lightning` (bool)
- `basic` (bool)

**Update (`/api/updates/check-for-update/`):**
- `status` (string: "ok")
- `update` (bool: false)
- `link` (string)
- `checksum` (string)

**QoS settings (`/api/getConnectionSettings`):**
- `status` (string: "ok")
- `time` (número, epoch ms)
- `setting` (array de objetos)

**Objetos dentro de `setting[]` — reglas QoS:**
- `action` (string: "add"/"delete")
- `appName` (string)
- `protocol` (string: "TCP"/"UDP")
- `sourcePort` (número entero)
- `destinationPort` (número entero)
- `sourceIp` (string: "0.0.0.0")
- `destinationIp` (string)
- `dcspValue` (número entero, 0-63)
- `throttleRate` (número entero, kbps)
- `sourceIpPrefix` (número entero)
- `destinationIpPrefix` (número entero)
- `version` (número entero: 4 o 6)

**Objetos dentro de `setting[]` — modificaciones de registro:**
- `action` (string: "add")
- `path` (string: ruta de registro Windows)
- `regType` (número entero: 4 = REG_DWORD)
- `value` (string)

**Strings de debug encontrados en el binario:**
- `"Settings applied for optimization"` → éxito
- `"Failed to apply settings"` → error
- `"No settings available"` → vacío
- `"Invalid response, Error code:%d"` → error de parseo cpprestsdk

**Otros strings relevantes:**
- `state.path = '%s';` — C++ setea el path inicial de React Router
- `state.lastRunSettings = ...` — C++ persiste última config
- `{ smartPackets: %s, latency: %d, responsiveness: %d, tuning: '%s', isConnectionStable: %s, connectionType: '%s', antiCheatCmpt: '%s' }` — estructura exacta de la configuración

---

## Windows: Procedimiento de prueba

### Requisitos
- Node.js 22+
- OpenSSL (Win64 OpenSSL Light)
- Certificado en Trusted Root Store

### Pasos

1. **Instalar la app original** (Ghast_Setup_1.0.0.4.exe)

2. **Reemplazar binarios:**
```cmd
cd %LOCALAPPDATA%\Programs\Ghast\

ren Loader.exe Loader_original.exe
ren Ghast.exe Ghast_original.exe
ren Common.dll Common_original.dll

copy ghast_analysis\Loader_patched.exe Loader.exe
copy ghast_analysis\Ghast_patched.exe Ghast.exe
copy ghast_analysis\Common_patched.dll Common.dll
```

3. **Configurar mock server:**
```cmd
cd ghast_analysis\mock-server
node setup-certs.js
certutil -addstore Root certs\ghast.io.crt
```

4. **Editar hosts** (`C:\Windows\System32\drivers\etc\hosts`):
```
127.0.0.1 ghast.io
127.0.0.1 www.ghast.io
```

5. **Iniciar mock server** (como Admin):
```cmd
cd ghast_analysis\mock-server
node server.js
```

6. **Ejecutar `Ghast.exe`** (no Loader)

---

## Si el botón "Run" sigue fallando

### Estrategia A: Debuggear con más variantes de respuesta

El error es `cpprestsdk::json_exception`. Hay que probar combinaciones hasta que no crashee. Cosas para probar en `server.js`:

1. **Probar con `"setting": null`** — si acepta null, el array vacío era el problema
2. **Probar sin el campo `"setting"`** — si no crashea, los elementos individuales fallan
3. **Probar con 1 solo elemento en el array** — ir agregando campos de a uno
4. **Probar con campos extra** — `cpprestsdk` ignora campos sobrantes, pero crashea si falta uno
5. **Probar tipo numérico vs string** — cambiar `throttleRate: 0` por `throttleRate: "0"` y viceversa
6. **Probar `"regType"` con diferentes valores** — `1` = REG_SZ, `4` = REG_DWORD, `11` = REG_QWORD

Agregá esto al mock server para loguear:
```js
case 'settings':
  let postBody = '';
  req.on('data', c => postBody += c);
  return req.on('end', () => {
    console.log("      POST:", postBody);
    // probar variante 1, 2, 3...
    jsonResponse(res, { "status": "ok", "time": 1704067200000, "setting": null });
  });
```

### Estrategia B: Parchear el handler de configuración en Ghast.exe

Si el problema persiste, hay que encontrar y NOPear la validación de respuesta en el handler nativo de `config.Run()`:

1. Buscar `"Invalid response"` en el binario → `strings -t x Ghast_patched.exe | grep "Invalid response"`
2. Encontrar referencias al string en `.text` con objdump
3. Identificar la función que parsea el JSON de `/api/getConnectionSettings`
4. NOPear los `je` que saltan al error

### Estrategia C: Hacer que el botón Run funcione aunque la API falle

Modificar el JS en `02_JS_block_2_33664b.js` para que no dependa del resultado de `window.config.Run()`. Buscar:
```js
"@DASHBOARD/RUN",function(e){return function(){return window.config.Run(),e()}
```
Cambiar por algo que siempre retorne éxito.

### Estrategia D: Usar un debugger en Windows

Instalar x64dbg y:
1. Abrir Ghast_patched.exe
2. Poner breakpoint en el handler de respuesta HTTP de cpprestsdk
3. Ver exactamente qué campo y tipo crashea
4. Ajustar el mock server

---

## Convenciones

- **Lenguaje del agente:** español, técnico y directo
- **Commits:** conventional commits (`fix:`, `feat:`, `docs:`)
- **NO commitear binarios originales** (están en .gitignore)
- **SÍ commitear binarios parcheados** (Loader_patched.exe, Ghast_patched.exe, Common_patched.dll)
- **Estructura de respuesta JSON:** usar tipos nativos de JS (números sin comillas para campos integer, booleanos sin comillas)
- **cpprestsdk** es EXTREMADAMENTE quisquilloso con tipos. Si `.as_integer()` recibe un string, crashea. Si `.at("campo")` no existe, crashea.

---

## Herramientas útiles en Linux

```bash
# Extraer binarios del instalador
innoextract -d /tmp/ext Ghast_Setup_1.0.0.4.exe

# Strings UTF-16LE
strings -e l binary.exe

# Desensamblar un rango de direcciones
objdump -d --start-address=0xVA_INICIO --stop-address=0xVA_FIN binary.exe

# Import/export tables
objdump -p binary.exe

# Encontrar referencias a un string en .text
python3 find_xref.py binary.exe "texto a buscar"
```

