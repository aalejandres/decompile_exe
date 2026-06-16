# Resumen del Análisis de Ghast - Mock Server y Errores de Parseo

Este documento recopila de forma cronológica todos los hallazgos técnicos, el estado inicial del código, las pruebas realizadas y los parches aplicados durante el análisis de la arquitectura de red y el cliente C++ de la aplicación Ghast.

---

## 1. Arquitectura General Descubierta
* **Frontend (UI):** Desarrollado en React, empaquetado con Webpack. Los archivos Javascript están ofuscados e incrustados mediante CEF (Chromium Embedded Framework). La UI reside en `Common.dll` y los bloques `.js` extraídos.
* **Backend Local (Cliente C++):** Los ejecutables `Ghast.exe` y `Loader.exe` están programados en C++ nativo para Windows.
* **Librería de Red/JSON:** Utilizan **Microsoft `cpprestsdk`** (C++ REST SDK) para peticiones HTTP y parseo JSON (`web::json::value`). Esta librería es conocida por su tipado estricto: si se extrae un valor con tipo incorrecto (ej. `.as_integer()` sobre un string) o la llave no existe, lanza una excepción (`web::json::json_exception`), lo que la app captura y muestra genéricamente como `"Invalid response"`.

---

## 2. Historial de Pruebas, Problemas y Soluciones

A continuación se detalla cómo estaba el mock server inicialmente, qué fallaba y qué arreglamos paso a paso extrayendo datos de la memoria (UTF-16) de los ejecutables.

### Fase 1: El Bucle de Actualización (Update Check)
* **Estado Original:** La aplicación (Loader) se quedaba en un bucle infinito haciendo peticiones a `/api/updates/check-for-update/1.0.0.4`. El mock server respondía con:
  `"update": { "available": false, "current_version": "1.0.0.4", ... }`
* **Problema:** El binario fallaba con el error `"Invalid response"`. Encontramos que en el ejecutable, las variables esperadas eran estrictamente `status`, `update`, `link`, `checksum`. 
* **Lo que arreglamos:** Descubrimos que el C++ esperaba que el campo `update` fuera un **booleano** (`false`), no un objeto. Al aplanar la respuesta a `"update": false`, el error desapareció y permitió que la aplicación cargara la interfaz gráfica principal.

### Fase 2: El Login con Google (`/api/auth/me`)
* **Estado Original:** Al darle a "Log in with Google", el mock server (vía `/login-success` y `auth_me`) devolvía datos como:
  `"user": { "id": "mock-12345", "plan": "premium", "plan_expires": "2099-12-31T23:59:59Z" }`
* **Problema:** La interfaz lanzaba inmediatamente `"Invalid response"`.
* **Lo que arreglamos:** Analizando las cadenas UTF-16 de `Ghast.exe`, nos dimos cuenta de que el sistema de Ghast NO usa un objeto `"user"`, ni conoce la palabra `"premium"`. El código C++ buscaba llaves planas en la raíz para validar la suscripción. Cambiamos la respuesta en `server.js` a:
  ```json
  {
    "name": "MockGhastUser",
    "email": "mock@ghast.local",
    "pictureURL": "https://ghast.io/avatar.png",
    "admin": false,
    "lightning": true,
    "basic": false
  }
  ```
  **Resultado:** ¡Éxito! El error desapareció y se logró el inicio de sesión falso (mock) permitiendo acceder a los controles de la aplicación.

### Fase 3: El Botón "Run" y el Método HTTP
* **Estado Original:** Al presionar "Run" en la UI, el frontend recopilaba los ajustes (`latency`, `tuning`, `mtu`, etc.) y llamaba a una función nativa en C++. La terminal del mock server imprimía:
  `POST /api/getConnectionSettings → 404`
* **Problema:** La ruta en `server.js` estaba configurada para aceptar únicamente peticiones `GET`.
* **Lo que arreglamos:** Modificamos el servidor para aceptar `POST` en esa ruta, logrando que Node.js empezara a responder con código HTTP `200 OK`.

### Fase 4: Formato de Calidad de Servicio (QoS) y Registro
* **Estado Original:** Para el endpoint `getConnectionSettings`, el mock server de pruebas devolvía un array falso de servidores VPN (`{ "servers": [ { "ip": "...", "latency_ms": 25 } ] }`).
* **Problema:** La UI volvió a arrojar `"Invalid response, Error code:0"`.
* **El Descubrimiento:** Ghast no es una VPN estándar, es un optimizador de red para juegos. A través del análisis del C++, revelamos que la respuesta esperada no son servidores, sino un arreglo llamado `"setting"` y un `"time"`.
  Las políticas de QoS esperadas por la aplicación tienen las llaves: `appName`, `protocol`, `sourcePort`, `destinationPort`, `sourceIp`, `destinationIp`, `dcspValue`, `throttleRate`, `sourceIpPrefix`, `destinationIpPrefix`, `version`.
  Y para modificación del registro de Windows: `action`, `path`, `regType`, `value`.
* **Estado Final de la Prueba:** Editamos `server.js` para enviar este formato exacto, intentando evadir los errores con arrays vacíos (`"setting": []`). Sin embargo, el error 0 de parseo persiste, confirmando que el cliente exige tipos de variables numéricas muy estrictas (ej. enteros sin comillas para `throttleRate` o `regType`) y posiblemente una estructura que no se puede adivinar sin depurar (debugger) la excepción de `cpprestsdk` en tiempo de ejecución.

---

## 3. Detalle Técnico: El falso cuelgue de 5 segundos
Durante las pruebas de la Fase 4, se notó un retraso de 3 a 4 segundos antes de poder volver a darle click al botón "Run", sugiriendo que la app estaba procesando la inyección de la red. 
* **Resolución:** Investigando el archivo ofuscado del frontend (`02_JS_block_2_33664b.js` línea 400), se localizó la instrucción `setTimeout(function(){ r(!1); }, 5e3);`.
* Esto demuestra que la interfaz bloquea (hace *debounce*) del botón por 5 segundos intencionalmente. El error nativo en C++ ocurre de forma inmediata en el instante que procesa el JSON.

## 4. Conclusión Final
Hemos documentado exitosamente la estructura general, sorteado el sistema de login y el validador de actualizaciones reconstruyendo las estructuras nativas de la aplicación. 
El último muro es la deserialización del endpoint de QoS (`getConnectionSettings`). Para superarlo, se requiere conocer el tipo de dato primitivo exacto de C++ (string, bool, long, uint32) de las ~15 llaves que exige el payload de optimización de Windows, ya que `web::json::value` bloquea la ejecución de la función ante el más mínimo desajuste de tipos estructurales.