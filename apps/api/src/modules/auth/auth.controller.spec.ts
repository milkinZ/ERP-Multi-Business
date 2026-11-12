import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersInvitationsService } from '../users/users-invitations.service';
import { TenantRegistrationService } from './tenant-registration.service';

describe('AuthController', () => {
  const login = jest.fn();
  const logout = jest.fn();
  const refresh = jest.fn();
  const accept = jest.fn();
  const registerTenant = jest.fn();
  const listPlans = jest.fn();
  const service = { login, logout, refresh } as unknown as AuthService;
  const invitations = { accept } as unknown as UsersInvitationsService;
  const registration = {
    register: registerTenant,
    listPlans,
  } as unknown as TenantRegistrationService;
  let controller: AuthController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController(service, invitations, registration);
  });

  it('returns plans that can be selected for public tenant registration', async () => {
    const result = [{ id: 'plan-free', type: 'FREE' }];
    listPlans.mockResolvedValue(result);

    await expect(controller.listTenantRegistrationPlans()).resolves.toBe(
      result,
    );
    expect(listPlans).toHaveBeenCalledTimes(1);
  });

  it('starts public tenant registration with the submitted details', async () => {
    const input = {
      name: 'Cafe Example',
      email: 'owner@example.test',
      planId: 'plan-free',
      businessType: 'CAFE',
      currencyCode: 'IDR',
    } as const;
    const result = { message: 'check your email' };
    registerTenant.mockResolvedValue(result);

    await expect(controller.registerTenant(input)).resolves.toBe(result);
    expect(registerTenant).toHaveBeenCalledWith(input);
  });

  it('accepts a user invitation with the token and password', async () => {
    const result = { id: 'user-a' };
    accept.mockResolvedValue(result);

    await expect(
      controller.acceptInvitation({
        token: 'invitation-token',
        password: 'a-long-enough-password',
      }),
    ).resolves.toBe(result);
    expect(accept).toHaveBeenCalledWith(
      'invitation-token',
      'a-long-enough-password',
    );
  });

  it('passes login credentials and response object to authentication', async () => {
    const response = { cookie: jest.fn() } as never;
    login.mockResolvedValue({ accessToken: 'access-token' });

    await controller.login(
      { email: 'user-a@example.test', password: 'test-password' },
      response,
    );

    expect(login).toHaveBeenCalledWith(
      'user-a@example.test',
      'test-password',
      response,
    );
  });

  it('passes refresh and logout inputs to their service operations', async () => {
    const response = {} as never;
    const request = {
      cookies: { refresh_token: 'selector.secret' },
    } as never;
    await controller.refresh({ csrfToken: 'csrf-token' }, request, response);
    await controller.logout({ csrfToken: 'csrf-token' }, request, response);

    expect(refresh).toHaveBeenCalledWith(
      'selector.secret',
      'csrf-token',
      response,
    );
    expect(logout).toHaveBeenCalledWith('selector.secret', response);
  });
});
