import {
  DOMAIN_EVENTS,
  type DomainEvent,
} from '../../core/events/domain-events';
import { resolveNotificationRoute } from './notification-routing';

describe('notification routing', () => {
  it.each(Object.values(DOMAIN_EVENTS))(
    'routes the %s domain event',
    (type) => {
      const event = {
        type,
        payload: { tenantId: 'tenant-a' },
      } as unknown as DomainEvent;

      expect(resolveNotificationRoute(event)).not.toBeNull();
    },
  );
});
