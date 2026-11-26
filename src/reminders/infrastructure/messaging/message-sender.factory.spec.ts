import { FakeMessageSender } from './fake-message-sender';
import { isFakeSender, selectMessageSenders } from './message-sender.factory';

describe('the choice of the reminder sender', () => {
  it('uses the real channels by default', () => {
    expect(isFakeSender({})).toBe(false);
    const senders = selectMessageSenders({});
    expect(senders.whatsapp).toBeInstanceOf(FakeMessageSender);
  });

  it('uses the simulator when REMINDERS_SENDER=fake', () => {
    expect(isFakeSender({ REMINDERS_SENDER: 'fake' })).toBe(true);
    const senders = selectMessageSenders({ REMINDERS_SENDER: 'fake' });
    expect(senders.whatsapp).toBeInstanceOf(FakeMessageSender);
    expect(senders.email).toBeInstanceOf(FakeMessageSender);
  });

  it('refuses an unknown value', () => {
    expect(() =>
      selectMessageSenders({ REMINDERS_SENDER: 'carrier-pigeon' }),
    ).toThrow(/REMINDERS_SENDER="carrier-pigeon" is not supported/);
  });

  it('keeps the real senders when they are given', () => {
    const whatsapp = new FakeMessageSender('whatsapp');
    const senders = selectMessageSenders({}, { whatsapp, email: whatsapp });
    expect(senders.whatsapp).toBe(whatsapp);
  });
});
