const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 443;
const HTTP_PORT = 8443;

function jsonResponse(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

const BYPASS_HTML = `<!DOCTYPE html>`

function matchRoute(method, urlPath) {
  if (urlPath === '/api/auth/me' && method === 'GET') return 'auth_me';
  if (urlPath.startsWith('/api/getConnectionSettings') && (method === 'GET' || method === 'POST')) return 'settings';
  if (urlPath.startsWith('/api/updates/check-for-update/') && method === 'GET') return 'update';
  if (urlPath.startsWith('/api/auth/google') && method === 'GET') return 'google_auth_get';
  if (urlPath === '/api/auth/google' && method === 'POST') return 'google_auth_post';
  if (urlPath === '/v8/login' && method === 'GET') return 'v8login';
  if (urlPath === '/upgrade' && method === 'GET') return 'upgrade';
  if (urlPath === '/login-success' && method === 'GET') return 'login_ok';
  if (urlPath === '/bypass-auth' && method === 'GET') return 'bypass';
  return null;
}

function handleRequest(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || 'ghast.io'}`);
  const route = matchRoute(req.method, url.pathname);
  console.log(`[${new Date().toISOString()}] ${req.method} ${url.pathname}${url.search} → ${route || '404'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });
    return res.end();
  }

  switch (route) {
    case 'auth_me':
      return jsonResponse(res, {
        name: 'MockGhastUser',
        email: 'mock@ghast.local',
        pictureURL: 'https://ghast.io/avatar.png',
        admin: false,
        lightning: true,
        basic: false
      });

    case 'settings':
      let postBody = '';
      req.on('data', c => postBody += c);
      return req.on('end', () => {
        try {
          if (postBody) console.log("      POST Data:", postBody.slice(0,500));
        } catch (e) {}
        jsonResponse(res, {
          "status": "ok",
          "time": 1704067200000,
          "setting": [
            {
              "action": "add",
              "appName": "Minecraft",
              "protocol": "TCP",
              "sourcePort": 25565,
              "destinationPort": 0,
              "sourceIp": "0.0.0.0",
              "destinationIp": "0.0.0.0",
              "dcspValue": 46,
              "throttleRate": 0,
              "sourceIpPrefix": 0,
              "destinationIpPrefix": 0,
              "version": 4
            },
            {
              "action": "add",
              "path": "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile",
              "regType": 4,
              "value": "1"
            }
          ]
        });
      });

    case 'update':
      return jsonResponse(res, {
        "status": "ok",
        "update": false,
        "link": "",
        "checksum": ""
      });

    case 'google_auth_get': {
      const appPort = url.searchParams.get('appPort') || '8080';
      const redirectUrl = `http://localhost:${appPort}/auth/callback?token=mock-jwt-full-auth`;
      console.log(`  → Redirecting to ${redirectUrl}`);
      res.writeHead(302, { Location: redirectUrl });
      return res.end(`<html><body>Logging in...<script>location.replace("${redirectUrl}")</script></body></html>`);
    }

    case 'google_auth_post': {
      let body = '';
      req.on('data', c => body += c);
      return req.on('end', () => jsonResponse(res, { name: 'mock', email: 'mock@ghast.local', pictureURL: '', admin: false, lightning: true, basic: false }));
    }

    case 'v8login':
      return jsonResponse(res, { name: 'mock', email: 'mock@ghast.local', pictureURL: '', admin: false, lightning: true, basic: false });

    case 'upgrade':
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end('<html><body><h1>Ghast</h1><p>No upgrade available.</p></body></html>');

    case 'login_ok':
      return jsonResponse(res, {
        name: 'MockUser',
        email: 'mock@ghast.local',
        pictureURL: 'https://ghast.io/avatar.png',
        admin: false,
        lightning: true,
        basic: false
      });

    case 'bypass':
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(BYPASS_HTML);

    default:
      return jsonResponse(res, { status: 'ok' }, 200);
  }
}

function printEndpoints(ssl) {
  const proto = ssl ? 'https' : 'http';
  const base = ssl ? 'https://ghast.io' : `http://localhost:${HTTP_PORT}`;
  console.log('  Endpoints:');
  for (const [method, url] of [
    ['GET','/api/auth/me'], ['GET','/api/getConnectionSettings'],
    ['GET','/api/updates/check-for-update/<ver>'], ['GET','/api/auth/google'],
    ['GET','/v8/login'], ['GET','/upgrade'], ['GET','/login-success'],
  ]) { console.log(`    ${method.padEnd(6)} ${base}${url}`); }
}

const CERTS_DIR = path.join(__dirname, 'certs');
const KEY_PATH = path.join(CERTS_DIR, 'ghast.io.key');
const CERT_PATH = path.join(CERTS_DIR, 'ghast.io.crt');

if (!fs.existsSync(CERTS_DIR)) fs.mkdirSync(CERTS_DIR, { recursive: true });

if (!fs.existsSync(KEY_PATH) || !fs.existsSync(CERT_PATH)) {
  console.log('No TLS certs found. Run: node setup-certs.js');
  console.log('Starting HTTP-only.\n');
  http.createServer(handleRequest).listen(HTTP_PORT, () => {
    console.log(`  HTTP server on ${HTTP_PORT}`);
    printEndpoints(false);
  });
} else {
  try {
    https.createServer({ key: fs.readFileSync(KEY_PATH), cert: fs.readFileSync(CERT_PATH) }, handleRequest)
      .listen(PORT, () => {
        console.log(`\n  Ghast Mock v3 → https://ghast.io:${PORT}\n`);
        printEndpoints(true);
        console.log('\n  Ready.\n');
      });
  } catch (e) {
    console.error('HTTPS failed:', e.message);
    http.createServer(handleRequest).listen(HTTP_PORT, () => console.log(`HTTP on ${HTTP_PORT}`));
  }
}

process.on('uncaughtException', err => console.error('ERR:', err.message));
