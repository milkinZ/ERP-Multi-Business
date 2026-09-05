import { KitchenStatus } from './kitchen-status.enum';
import { KitchenTicketAggregate } from './kitchen-ticket.aggregate';

describe('KitchenTicketAggregate', () => {
  const createTicket = () =>
    KitchenTicketAggregate.create({
      id: 'ticket-a',
      ticketNumber: 'T-A',
      salesOrderId: 'order-a',
      tenantId: 'tenant-a',
      outletId: 'outlet-a',
      items: [],
      createdById: null,
    });

  it('supports the valid queued cooking ready served lifecycle', () => {
    const ticket = createTicket();

    ticket.enqueue();
    ticket.startCooking();
    ticket.markReady();
    ticket.markServed();

    expect(ticket.status).toBe(KitchenStatus.SERVED);
  });

  it('rejects invalid transitions and clamps negative priority', () => {
    const ticket = createTicket();

    expect(() => ticket.markReady()).toThrow(
      'Only COOKING tickets can be marked READY',
    );
    ticket.setPriority(-10);
    expect(ticket.priority).toBe(0);
    ticket.enqueue();
    ticket.cancel();
    expect(ticket.status).toBe(KitchenStatus.CANCELLED);
    expect(() => ticket.startCooking()).toThrow(
      'Invalid kitchen ticket transition',
    );
  });
});
