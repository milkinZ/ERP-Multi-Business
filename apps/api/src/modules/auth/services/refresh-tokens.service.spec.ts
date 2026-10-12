import { requestContext } from '../../../core/request-context/request-context';
import { PrismaService } from '../../../core/database/prisma.service';
import { RefreshTokensService } from './refresh-tokens.service';

describe('RefreshTokensService', () => {
  it('executes the pre-auth selector lookup inside its request context', async () => {
    const prisma = {
      refreshToken: {
        findUnique: jest.fn(),
      },
    };
    const service = new RefreshTokensService(
      prisma as unknown as PrismaService,
    );
    let allowPreAuthLookup: boolean | undefined;

    prisma.refreshToken.findUnique.mockReturnValue({
      then(resolve: (value: null) => unknown) {
        allowPreAuthLookup =
          requestContext.get().allowPreAuthRefreshTokenLookup;
        return Promise.resolve(null).then(() => resolve(null));
      },
    });

    await requestContext.run({}, async () => {
      await expect(
        service.getBySelectorForAuthentication('selector'),
      ).resolves.toBeNull();
    });

    expect(allowPreAuthLookup).toBe(true);
  });
});
