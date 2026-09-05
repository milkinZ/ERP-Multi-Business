import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  const register = jest.fn();
  const login = jest.fn();
  const logout = jest.fn();
  const refresh = jest.fn();
  const service = {
    register,
    login,
    logout,
    refresh,
  } as unknown as AuthService;
  let controller: AuthController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController(service);
  });

  it('passes registration DTO to the auth service unchanged', async () => {
    const dto = {
      email: 'user-a@example.test',
      password: 'test-password',
      tenantId: 'tenant-a',
      roleId: 'role-a',
    } as never;
    register.mockResolvedValue({ id: 'user-a' });

    await controller.register(dto);

    expect(register).toHaveBeenCalledWith(dto);
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
    await controller.refresh(
      { refreshToken: 'selector.secret', csrfToken: 'csrf-token' },
      response,
    );
    await controller.logout({ refreshToken: 'selector.secret' }, response);

    expect(refresh).toHaveBeenCalledWith(
      'selector.secret',
      'csrf-token',
      response,
    );
    expect(logout).toHaveBeenCalledWith('selector.secret', response);
  });
});
