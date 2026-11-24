import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildCollection } from '../src/docs/postman';

export const POSTMAN_PATH = resolve(__dirname, '../postman/session-booking-api.postman_collection.json');

mkdirSync(dirname(POSTMAN_PATH), { recursive: true });
writeFileSync(POSTMAN_PATH, `${JSON.stringify(buildCollection(), null, 2)}\n`);
console.log(`Postman collection written to ${POSTMAN_PATH}`);
