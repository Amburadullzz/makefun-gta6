// The entry program: copies the game and its screenshots to the output directory and writes
// dossier.json, the summary the judge reads, with the kit's vendored library. Run it with
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// (Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.)
import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repository = fileURLToPath(new URL('.', import.meta.url));
const output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(output, { recursive: true });

// game/ is the playable thing; screenshots/ holds the four renders, cover first by name.
cpSync(join(repository, 'game'), join(output, 'game'), { recursive: true });
mkdirSync(join(output, 'screenshots'), { recursive: true });
if (existsSync(join(repository, 'screenshots'))) {
  cpSync(join(repository, 'screenshots'), join(output, 'screenshots'), { recursive: true });
}

// The same caps the scorer's gate applies, so a dossier that would be refused is refused here first.
writeFileSync(
  join(output, 'dossier.json'),
  buildDossier(output, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

const dossierBytes = statSync(join(output, 'dossier.json')).size;
console.log(`handed in: ${output}`);
console.log(`  game/        ${statSync(join(output, 'game')).isDirectory() ? 'ok' : 'missing'}`);
console.log(`  screenshots/ ${statSync(join(output, 'screenshots')).isDirectory() ? 'ok' : 'missing'}`);
console.log(`  dossier.json ${dossierBytes} bytes`);
