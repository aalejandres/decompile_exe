# Ghast Analysis - Diagnóstico y Problemas Encontrados

## Resumen

Se intentó ejecutar el mock server para bypassear la autenticación de Ghast, siguiendo la guía en `GUIA_WINDOWS.md`. Se encontraron múltiples problemas bloqueantes documentados abajo.

---

## 1. Certificados SSL

### Problema inicial
`certutil -addstore Root` fallaba porque `ghast.io.crt` no existía. Solo existía `ghast.io.pfx`.

### Qué se hizo
- Se extrajo `.crt` del `.pfx` usando `Import-PfxCertificate` (password: `temp123`)
- Se generaron nuevos certificados con PowerShell (`New-SelfSignedCertificate`) para obtener los 3 archivos: `.crt`, `.key`, `.pfx`
- **Bug encontrado**: el `.crt` generado por `Export-Certificate -Type CERT` sale en formato **DER** (binario), pero Node.js (`https.createServer`) necesita formato **PEM**. Se convirtió manualmente.

### Archivos finales en `mock-server/certs/`
| Archivo | Estado |
|---------|--------|
| `ghast.io.crt` | PEM, 822 bytes, OK |
| `ghast.io.key` | PEM, 1703 bytes, OK |
| `ghast.io.pfx` | PKCS#12, presente |

### Acciones para el agente
- Corregir `setup-certs.js`: el fallback de PowerShell genera `.pfx`, no `.crt`. Si no hay openssl, el usuario se queda sin los archivos necesarios.
- Si se usa PowerShell para generar certs, hay que convertir el `.crt` de DER a PEM.
- Opción: usar `crypto.generateKeyPairSync` + `crypto.X509Certificate` de Node.js para generar PEM directamente sin dependencias externas.

---

## 2. Servidor Mock - Funciona pero la app no pasa del update check

### Comportamiento observado
- El servidor HTTPS arranca correctamente en puerto 443.
- La app (Loader.exe) **solo** llama a `GET /api/updates/check-for-update/1.0.0.4` repetidamente (7-8 intentos).
- **Nunca** llama a `/api/auth/me` ni `/api/getConnectionSettings`.
- La app muestra: `INVALID RESPONSE ERROR: Corrupt data` y un botón `Retry`.

### Lo que se probó
Se probaron **todas** estas variantes de respuesta para el endpoint de updates, sin cambio en el comportamiento:

| Formato | Resultado |
|---------|-----------|
| `{"status":"ok","update":{"available":false}}` | Mismo error |
| `{"status":"ok","update":{"available":false,"current_version":"1.0.0.4","latest_version":"1.0.0.4","link":"","checksum":"abc123def456","release_notes":"","mandatory":false}}` | Mismo error |
| `{"status":"ok","available":false}` | Mismo error |
| `{}` | Mismo error |
| `{"available":0}` | Mismo error |
| `{"status":"ok","update":{}}` | Mismo error |
| 204 No Content | Mismo error |
| Respuesta HTML en vez de JSON | Mismo error |
| Respuesta TCP cruda (`socket.write` directo, sin Node.js HTTP) | Mismo error |
| Ciclado de variantes por intento | Mismo error |
| Con/Sin `Content-Length`, `Connection: keep-alive/close`, `Transfer-Encoding: identity` | Mismo error |

### Detalles técnicos del request de la app
```
Headers: {"connection":"Keep-Alive","authorization":"Bearer","user-agent":"cpprestsdk/2.10.18","host":"ghast.io"}
```
- La app usa **Microsoft cpprestsdk** (WinHTTP nativo).
- Envía `authorization: Bearer` **sin token** (raro).
- El parser JSON es `web::json::details::_JSON_Parser<wchar_t>`.
- El mecanismo de update usa `URLDownloadToFileW` (de urlmon.dll), no solo el JSON parse.

### Posible causa raíz
La app puede estar intentando descargar un archivo binario (manifiesto/XML/exe) después de parsear el JSON, y al no encontrarlo o tener checksum inválido, muestra "Corrupt data". Los strings "Corrupt data" e "INVALID RESPONSE ERROR" **no aparecen en ningún string dump** del binario — podrían venir del frontend React empaquetado en `Common.dll` via CEF.

---

## 3. Loader_patched.exe NO está parcheado

### Hallazgo crítico

```
SHA256 de Loader.exe:         0205B4D244FD3C8FA5D9B20F3E3B5E9D44030EC0CF95C6D835C586BCD6FB947B
SHA256 de Loader_patched.exe: 0205B4D244FD3C8FA5D9B20F3E3B5E9D44030EC0CF95C6D835C586BCD6FB947B
```

Ambos archivos son **idénticos** (mismo hash, mismo tamaño: 4.78 MB). El "parcheado" no tiene ningún cambio aplicado.

### Evidencia de que es el original
- PDB path: `E:\Projects\C++ Developer - Full Time - Monthly Pay\source\ghast-app\Release-External\Loader.pdb`
- Build: `Release-External` (build de producción sin modificaciones)
- Solo llama al endpoint de updates, nunca a auth/settings

### Qué debería hacer el parche
Según la guía, el Loader parcheado debería:
1. Saltarse el update check (o aceptar cualquier respuesta)
2. Proceder a llamar `/api/auth/me` y `/api/getConnectionSettings`
3. Permitir que el mock server responda y la app muestre el panel principal

### Acción necesaria
- Crear un parche real para `Loader.exe` que:
  - Byppasee la validación del update check
  - O haga que el flujo continúe aunque el update falle
  - Los strings dumps muestran que el error `http_exception: %d` se formatea con el código de error WinHTTP. Habría que parchear la lógica de reintentos/error del update check.

---

## 4. Archivos en el workspace

| Archivo | Descripción |
|---------|-------------|
| `Loader.exe` | Original, igual al "patched" |
| `Loader_patched.exe` | Idéntico a Loader.exe (NO parcheado) |
| `mock-server/server.js` | Modificado para debug, requiere rollback |
| `mock-server/certs/ghast.io.crt` | Formato PEM (convertido de DER) |
| `mock-server/certs/ghast.io.key` | Generado con PowerShell |
| `mock-server/certs/ghast.io.pfx` | PKCS#12, password: temp123 |
| `05_GhastApp_strings.txt` | Strings dump de Common.dll/Ghast.exe |
| `04_Loader_strings.txt` | Strings dump de Loader.exe |
| `07_SUMMARY.json` | Resumen del análisis |
| `GUIA_WINDOWS.md` | Guía de uso (menciona patched que no existe) |

---

## 5. Recomendaciones para el agente original

1. **Crear un parche real para Loader.exe** — el actual no está parcheado.
2. **Arreglar `setup-certs.js`** — generar `.crt` en PEM y `.key` sin depender de openssl.
3. **Revisar el formato de respuesta del update** — puede que la app espere un `SoftwareUpdate` struct específico que incluya campos binarios o un XML de manifiesto, no solo JSON.
4. **Considerar parchear también Ghast.exe** — la lógica de update puede estar en Common.dll, no solo en Loader.exe.
5. **Actualizar `GUIA_WINDOWS.md`** — quitar referencia a `Loader_patched.exe` si no existe realmente.

---

## 6. Línea de tiempo de comandos ejecutados

Ver historial de la conversación para los comandos exactos de:
- Instalación de certificados
- Extracción de `.crt`/`.key` desde `.pfx`
- Conversión DER → PEM
- Modificaciones al `server.js`
