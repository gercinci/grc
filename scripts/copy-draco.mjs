// Draco çözücüsünü (Google 3D karoları için gerekli) three paketinden public/draco altına kopyalar.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(root, 'node_modules/three/examples/jsm/libs/draco/gltf');
const to = resolve(root, 'public/draco');
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
