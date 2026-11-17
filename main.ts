// Entry point for the make.fun grader (Node 22, standard library only).
// It copies the static game and its screenshots to the output directory and writes
// dossier.json — the Game block and source text the judge reads — with the kit's
// buildDossier. The game itself is plain files under game/; nothing here is bundled.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repositoryRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDirectory = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDirectory, { recursive: true });
cpSync(join(repositoryRoot, 'game'), join(outputDirectory, 'game'), { recursive: true });
mkdirSync(join(outputDirectory, 'screenshots'), { recursive: true });
if (existsSync(join(repositoryRoot, 'screenshots'))) {
  cpSync(join(repositoryRoot, 'screenshots'), join(outputDirectory, 'screenshots'), { recursive: true });
}

writeFileSync(
  join(outputDirectory, 'dossier.json'),
  buildDossier(outputDirectory, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
