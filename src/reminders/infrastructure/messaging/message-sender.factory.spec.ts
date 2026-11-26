import { FakeMessageSender } from './fake-message-sender';
import { isFakeSender, selectMessageSenders } from './message-sender.factory';

describe('the choice of the reminder sender', () => {
  it('uses the real channel by default', () => {
    expect(isFakeSender({})).toBe(false);
    const senders = selectMessageSenders({});
    expect(senders.email).toBeInstanceOf(FakeMessageSender);
  });

  it('uses the simulator when REMINDERS_SENDER=fake', () => {
    expect(isFakeSender({ REMINDERS_SENDER: 'fake' })).toBe(true);
    const senders = selectMessageSenders({ REMINDERS_SENDER: 'fake' });
    expect(senders.email).toBeInstanceOf(FakeMessageSender);
  });

  it('refuses an unknown value', () => {
    expect(() =>
      selectMessageSenders({ REMINDERS_SENDER: 'carrier-pigeon' }),
    ).toThrow(/REMINDERS_SENDER="carrier-pigeon" is not supported/);
  });

  it('keeps the real senders when they are given', () => {
    const email = new FakeMessageSender('email');
    const senders = selectMessageSenders({}, { email });
    expect(senders.email).toBe(email);
  });
});
