/** Sydney local time → Date. Nov 2026 is AEDT (+11:00); July is AEST (+10:00). All data here is synthetic. */
export const syd = (local: string, offset = '+11:00'): Date => new Date(`${local}:00${offset}`);
export const sydWinter = (local: string): Date => syd(local, '+10:00');
export const minutes = (n: number) => n * 60_000;
export const hours = (n: number) => n * 3_600_000;
export const days = (n: number) => n * 86_400_000;
// 2026-11-02 Mon, 03 Tue, 04 Wed, 05 Thu, 06 Fri, 07 Sat, 08 Sun, 09 Mon.
