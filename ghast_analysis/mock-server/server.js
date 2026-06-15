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
  if (urlPath === '/api/getConnectionSettings' && method === 'GET') return 'settings';
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
        status: 'ok',
        authenticated: true,
        user: {
          id: 'mock-user-12345',
          email: 'mock@ghast.local',
          username: 'MockGhastUser',
          plan: 'premium',
          plan_expires: '2099-12-31T23:59:59Z',
          created_at: '2024-01-01T00:00:00Z',
        },
      });

    case 'settings':
      return jsonResponse(res, {
        status: 'ok',
        authenticated: true,
        plan: 'premium',
        expires_at: '2099-12-31T23:59:59Z',
        settings: {
          dns_mode: 'system',
          kill_switch: false,
          auto_connect: false,
          latency_optimization: true,
          protocol: 'tcp',
          mtu: 1500,
        },
        servers: [
          { id: 'us-east-01', name: 'US East (New York)', host: 'ny1.mock.local', port: 443, latency_ms: 25, load: 12, region: 'us-east' },
          { id: 'us-west-01', name: 'US West (Los Angeles)', host: 'la1.mock.local', port: 443, latency_ms: 65, load: 34, region: 'us-west' },
          { id: 'eu-west-01', name: 'EU West (London)', host: 'lon1.mock.local', port: 443, latency_ms: 85, load: 18, region: 'eu-west' },
          { id: 'eu-cent-01', name: 'EU Central (Frankfurt)', host: 'fra1.mock.local', port: 443, latency_ms: 95, load: 22, region: 'eu-central' },
          { id: 'sa-east-01', name: 'SA East (Sao Paulo)', host: 'sao1.mock.local', port: 443, latency_ms: 150, load: 8, region: 'sa-east' },
          { id: 'ap-se-01', name: 'AP Southeast (Singapore)', host: 'sgp1.mock.local', port: 443, latency_ms: 200, load: 45, region: 'ap-southeast' },
        ],
        encryption: {
          algorithm: 'chacha20-poly1305',
          public_key: '3d7c5e9f2a1b8c4d6e0f3a5b7c9d1e2f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4',
        },
      });

    case 'update':
      return jsonResponse(res, {
        status: 'ok',
        update: { available: false, current_version: '1.0.0.4', latest_version: '1.0.0.4', link: '', checksum: '', release_notes: '', mandatory: false },
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
      return req.on('end', () => jsonResponse(res, { status: 'ok', authenticated: true, token: 'mock-jwt', user: { id: 'mock', email: 'mock@ghast.local', plan: 'premium' } }));
    }

    case 'v8login':
      return jsonResponse(res, { status: 'ok', authenticated: true, token: 'mock-jwt', user: { id: 'mock', email: 'mock@ghast.local', plan: 'premium' } });

    case 'upgrade':
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end('<html><body><h1>Ghast</h1><p>No upgrade available.</p></body></html>');

    case 'login_ok':
      return jsonResponse(res, {
        status: 'ok',
        authenticated: true,
        token: 'mock-jwt-full-auth-token',
        user: { id: 'mock-12345', email: 'mock@ghast.local', username: 'MockUser', plan: 'premium', plan_expires: '2099-12-31T23:59:59Z' },
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
