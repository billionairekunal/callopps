/** §8.5: how a call is placed. `tel:` today; a browser (WebRTC) dialer is a second implementation later. */
export type Dialer = { placeCall(phone: string): void };

export const telDialer: Dialer = {
  placeCall: (phone) => { window.location.href = `tel:+91${phone}`; },
};
