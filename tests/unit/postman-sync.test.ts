import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCollection } from '../../src/docs/postman';
import { routes } from '../../src/routes/registry';

describe('Postman collection', () => {
  it('is in sync with the route registry (run `npm run postman` if this fails)', () => {
    const file = resolve(__dirname, '../../postman/session-booking-api.postman_collection.json');
    const committed = JSON.parse(readFileSync(file, 'utf8'));
    expect(committed).toEqual(JSON.parse(JSON.stringify(buildCollection())));
  });

  it('covers every route in the registry', () => {
    const collection = buildCollection();
    const happyPath = collection.item[0].item as unknown[];
    expect(happyPath).toHaveLength(routes.length);
  });
});
