# Ghast Mock Server — By-pass de autenticación

## Requisitos en Windows

- Node.js 18+
- Acceso como Administrador
- Openssl (viene con Git Bash o instalar desde https://slproweb.com/products/Win32OpenSSL.html)

## Instalación

```powershell
# 1. Copiar la carpeta mock-server a Windows
# 2. Instalar dependencias
cd mock-server
npm install

# 3. Generar certificados (si no se generan automáticamente)
node setup-certs.js
```

## Configuración de Windows

### 1. Redirigir ghast.io a 127.0.0.1

Editar como Administrador:
```
C:\Windows\System32\drivers\etc\hosts
```

Agregar al final:
```
127.0.0.1 ghast.io
127.0.0.1 www.ghast.io
127.0.0.1 api.ghast.io
```

### 2. Instalar el certificado SSL en Windows

```powershell
# Como Administrador:
certutil -addstore Root certs\ghast.io.crt
```

### 3. Iniciar el servidor

```powershell
node server.js
```

### 4. Usar la app parcheada

Copiar `Loader_patched.exe` a `%LOCALAPPDATA%\Programs\Ghast\` y ejecutar.

## Cómo funciona

El servidor mock responde a TODAS las peticiones de la app como si tuvieras
una cuenta premium registrada, devolviendo:

- `/api/auth/me` → usuario autenticado (JWT firmado)
- `/api/getConnectionSettings` → 7 servidores proxy falsos
- `/api/updates/check-for-update/` → sin actualizaciones disponibles
- `/api/auth/google` → login OAuth exitoso
