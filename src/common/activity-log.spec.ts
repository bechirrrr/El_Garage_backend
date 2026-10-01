import { logActivity } from './activity-log.js';

describe('logActivity', () => {
  it("ecrit l'evenement avec la categorie GENERAL par defaut", async () => {
    const written: any[] = [];
    const client = { activityEvent: { create: (args: any) => (written.push(args.data), Promise.resolve({})) } };

    await logActivity(client, { garageId: 'g-1', actorId: 'u-1', customerId: 'c-1', type: 'CUSTOMER_CREATED', message: 'Client ajouté : Ali' });

    expect(written[0]).toMatchObject({ garageId: 'g-1', actorId: 'u-1', customerId: 'c-1', category: 'GENERAL' });
  });

  it("n'echoue jamais si l'ecriture du journal echoue", async () => {
    const client = { activityEvent: { create: () => Promise.reject(new Error('db down')) } };
    await expect(logActivity(client, { garageId: 'g-1', type: 'X', message: 'x' })).resolves.toBeUndefined();
  });
});
