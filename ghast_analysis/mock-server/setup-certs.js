const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CERTS_DIR = path.join(__dirname, 'certs');
const KEY_PATH = path.join(CERTS_DIR, 'ghast.io.key');
const CERT_PATH = path.join(CERTS_DIR, 'ghast.io.crt');

if (!fs.existsSync(CERTS_DIR)) fs.mkdirSync(CERTS_DIR, { recursive: true });

if (fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH)) {
  const cert = fs.readFileSync(CERT_PATH, 'utf8');
  if (cert.includes('BEGIN CERTIFICATE')) {
    console.log('Certs already exist (PEM format, OK).');
    console.log(`  ${CERT_PATH}`);
    console.log(`  ${KEY_PATH}`);
    console.log('\nTo regenerate, delete them and run again.');
    process.exit(0);
  } else {
    console.log('Certs exist but not PEM format. Removing...');
    fs.unlinkSync(KEY_PATH);
    fs.unlinkSync(CERT_PATH);
  }
}

console.log('Generating TLS certs for ghast.io...\n');

// Strategy 1: openssl (unix, Git Bash, or standalone install)
try {
  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout "${KEY_PATH}" -out "${CERT_PATH}" -days 3650 -nodes -subj "/CN=ghast.io" -addext "subjectAltName=DNS:ghast.io,DNS:www.ghast.io"`,
    { stdio: 'inherit' }
  );
  console.log('\nCerts generated with openssl (PEM).');
  printNextStep();
  process.exit(0);
} catch { console.log('openssl not found, trying native Node.js...'); }

// Strategy 2: Node.js native (Node 22.3+ with X509Certificate)
try {
  const { generateKeyPairSync, X509Certificate } = require('crypto');

  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const cert = X509Certificate({
    subject: { CN: 'ghast.io' },
    subjectAltName: 'DNS:ghast.io, DNS:www.ghast.io',
    validFrom: new Date(),
    validTo: new Date(Date.now() + 3650 * 86400000),
    publicKey,
    signingKey: privateKey,
  });

  fs.writeFileSync(KEY_PATH, privateKey);
  fs.writeFileSync(CERT_PATH, cert.toString());
  console.log('Certs generated with Node.js crypto (PEM).');
  printNextStep();
  process.exit(0);
} catch {
  console.log('Node.js X509Certificate not available, trying PowerShell...');
}

// Strategy 3: PowerShell (Windows only)
try {
  execSync(
    `powershell -Command "`
    + `$cert = New-SelfSignedCertificate -DnsName 'ghast.io','www.ghast.io' -KeyUsage DigitalSignature -CertStoreLocation 'cert:\\LocalMachine\\My'; `
    + `Export-Certificate -Cert $cert -FilePath '${CERT_PATH}' -Type CERT; `
    + `$pwd = ConvertTo-SecureString -String 'temp123' -Force -AsPlainText; `
    + `Export-PfxCertificate -Cert $cert -FilePath '${CERT_PATH.replace('.crt','.pfx')}' -Password $pwd; `
    + `$cert.HasPrivateKey; `
    + `$cert.Thumbprint"`,
    { stdio: 'inherit' }
  );

  const crtRaw = fs.readFileSync(CERT_PATH);
  if (crtRaw[0] === 0x30 && !crtRaw.includes(Buffer.from('BEGIN CERTIFICATE'))) {
    const pem = '-----BEGIN CERTIFICATE-----\n'
      + crtRaw.toString('base64').match(/.{1,64}/g).join('\n')
      + '\n-----END CERTIFICATE-----\n';
    fs.writeFileSync(CERT_PATH, pem);
    console.log('Cert converted from DER to PEM.');
  }

  console.log('\nNOTE: PowerShell cert has no separate .key file.');
  console.log('The server needs the .key. Install OpenSSL or use Node 22+ for the .key.');
  console.log('  Download: https://slproweb.com/products/Win32OpenSSL.html (Win64 OpenSSL Light)');
  process.exit(1);
} catch (e) {
  console.error('All methods failed:', e.message);
  process.exit(1);
}

function printNextStep() {
  console.log('\nNext step:');
  console.log('  certutil -addstore Root certs\\ghast.io.crt');
  console.log('\nThen:');
  console.log('  1. Edit C:\\Windows\\System32\\drivers\\etc\\hosts');
  console.log('  2. Add: 127.0.0.1 ghast.io');
  console.log('  3. Run as Admin: node server.js');
}
