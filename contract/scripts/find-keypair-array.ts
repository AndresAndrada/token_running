// scripts/find-keypair-array.ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Keypair } from '@solana/web3.js';

const TARGET_PUBKEY = process.argv[2] || '4WW6X973F1owVAv1B5WibD9ZtwY5JoopFUiKz9nQUpUC';
const MAX_FILES_TO_SCAN = 30000;

const DIRECT_CANDIDATES = [
  'c:/Users/Pc/Desktop/list-token/contract/phantom-admin.json',
  'c:/Users/Pc/Desktop/list-token/contract/test-wallet.json',
  'c:/Users/Pc/Desktop/list-token/keypairs/mint-authority.json',
  'c:/Users/Pc/.config/solana/id.json',
  '/mnt/c/Users/Pc/Desktop/list-token/contract/phantom-admin.json',
  '/mnt/c/Users/Pc/Desktop/list-token/contract/test-wallet.json',
  '/mnt/c/Users/Pc/Desktop/list-token/keypairs/mint-authority.json',
  '/home/andres/.config/solana/id.json',
  path.join(os.homedir(), '.config/solana/id.json'),
  path.join(process.cwd(), 'phantom-admin.json'),
  path.join(process.cwd(), 'test-wallet.json'),
];

const SEARCH_ROOTS = [
  process.cwd(),
  path.resolve(process.cwd(), '..'),
  path.resolve(process.cwd(), '../..'),
  'c:/Users/Pc/Desktop/list-token',
  'c:/Users/Pc/Desktop/listi-app',
  '/mnt/c/Users/Pc/Desktop/list-token',
  '/mnt/c/Users/Pc/Desktop/listi-app',
  path.join(os.homedir(), '.config/solana'),
];

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'target',
  'dist',
  'build',
  '.turbo',
  '.vercel',
  '.idea',
  '.vscode',
]);

function isSecretArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    (value.length === 64 || value.length === 32) &&
    value.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
  );
}

function readSecretArray(filePath: string): number[] | null {
  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile() || stats.size > 20000) return null;
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw.startsWith('[') || !raw.endsWith(']')) return null;
    const parsed = JSON.parse(raw);
    if (!isSecretArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function collectJsonFiles(root: string, bucket: Set<string>, state: { scanned: number }) {
  if (!fs.existsSync(root)) return;
  const stack = [path.resolve(root)];
  while (stack.length && state.scanned < MAX_FILES_TO_SCAN) {
    const current = stack.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (state.scanned >= MAX_FILES_TO_SCAN) break;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      state.scanned += 1;
      if (!entry.name.toLowerCase().endsWith('.json')) continue;
      bucket.add(fullPath);
    }
  }
}

const filesToTry = new Set<string>();
for (const file of DIRECT_CANDIDATES) {
  filesToTry.add(path.resolve(file));
}
const crawlState = { scanned: 0 };
for (const root of SEARCH_ROOTS) {
  collectJsonFiles(root, filesToTry, crawlState);
}

console.log(`Buscando pubkey objetivo: ${TARGET_PUBKEY}`);
console.log(`Archivos candidatos: ${filesToTry.size}`);

let found = false;
for (const file of filesToTry) {
  const secret = readSecretArray(file);
  if (!secret) continue;
  try {
    const kp = Keypair.fromSecretKey(Uint8Array.from(secret));
    const pub = kp.publicKey.toBase58();
    if (pub !== TARGET_PUBKEY) continue;
    found = true;
    console.log('\n✅ MATCH');
    console.log(`FILE: ${file}`);
    console.log(`PUBKEY: ${pub}`);
    console.log(`ARRAY: ${JSON.stringify(secret)}`);
    console.log(`ADMIN_SECRET_KEY=${JSON.stringify(secret)}`);
    break;
  } catch {
    continue;
  }
}

if (!found) {
  console.log('\nNo encontré ese pubkey en los JSON escaneados.');
  console.log('Prueba pasando un root adicional o copia aquí la ruta exacta del keypair.');
}
