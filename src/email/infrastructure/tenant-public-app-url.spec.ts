import { TenantPublicAppUrl } from './tenant-public-app-url';

const context = (tenant?: {
  id: string;
  slug: string;
  isDefault?: boolean;
}) => ({
  current: () => {
    if (!tenant) throw new Error('no business');
    return tenant;
  },
});

describe('TenantPublicAppUrl', () => {
  const saved = process.env.PUBLIC_APP_URL;
  beforeEach(() => {
    process.env.PUBLIC_APP_URL = 'https://app.example.com/';
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = saved;
  });

  it('keeps the plain URL for the default business', () => {
    const url = new TenantPublicAppUrl(
      context({ id: '1', slug: 'principal', isDefault: true }),
    );
    expect(url.read()).toBe('https://app.example.com');
  });

  it('points to the route of another business', () => {
    const url = new TenantPublicAppUrl(
      context({ id: '2', slug: 'sur', isDefault: false }),
    );
    expect(url.read()).toBe('https://app.example.com/n/sur');
  });

  it('keeps the plain URL when there is no business in the context', () => {
    expect(new TenantPublicAppUrl(context()).read()).toBe(
      'https://app.example.com',
    );
  });

  it('is null when the URL is not configured', () => {
    delete process.env.PUBLIC_APP_URL;
    expect(
      new TenantPublicAppUrl(context({ id: '2', slug: 'sur' })).read(),
    ).toBeNull();
  });
});
