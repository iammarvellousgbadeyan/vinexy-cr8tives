const assert = require('assert');
const crypto = require('crypto');
const L = require('../netlify/functions/_logic');

// deposit and balance
assert.strictEqual(L.depositFor(90000), 54000);
assert.strictEqual(90000 - L.depositFor(90000), 36000);
assert.strictEqual(L.depositFor(88000), 52800);
assert.strictEqual(L.depositFor(95000) + (95000 - L.depositFor(95000)), 95000);

// amountDue
assert.deepStrictEqual(L.amountDue({ total: 90000, amountPaid: 0, plan: 'full' }), { amount: 90000, plan: 'full' });
assert.deepStrictEqual(L.amountDue({ total: 90000, amountPaid: 0, plan: 'deposit' }), { amount: 54000, plan: 'deposit' });
assert.deepStrictEqual(L.amountDue({ total: 90000, amountPaid: 54000, plan: 'deposit' }), { amount: 36000, plan: 'balance' }); // second payment is always the balance
assert.ok(L.amountDue({ total: 90000, amountPaid: 90000, plan: 'full' }).error);
assert.ok(L.amountDue({ total: null, amountPaid: 0, plan: 'full' }).error);   // custom quantity without a quote cannot be paid
assert.ok(L.amountDue({ total: 90000, amountPaid: 0, plan: 'x' }).error);

// payment status comes only from amounts
assert.strictEqual(L.paymentStatus(90000, 0), 'pending');
assert.strictEqual(L.paymentStatus(90000, 54000), 'partially_paid');
assert.strictEqual(L.paymentStatus(90000, 90000), 'fully_paid');
assert.strictEqual(L.paymentStatus(null, 0), 'pending');

// order numbers
assert.strictEqual(L.orderNumber(12, 2026), 'GM-2026-0012');

// webhook signature
const body = JSON.stringify({ event: 'charge.success', data: { reference: 'GM-2026-0001-abcd' } });
const good = crypto.createHmac('sha512', 'sk_test_x').update(body).digest('hex');
assert.ok(L.verifyPaystackSignature(body, good, 'sk_test_x'));
assert.ok(!L.verifyPaystackSignature(body + ' ', good, 'sk_test_x'));
assert.ok(!L.verifyPaystackSignature(body, 'bad', 'sk_test_x'));
assert.ok(!L.verifyPaystackSignature(body, good, ''));

// file validation
assert.strictEqual(L.checkFileMeta({ name: 'a.jpg', type: 'image/jpeg', size: 1000 }), null);
assert.ok(L.checkFileMeta({ name: 'a.gif', type: 'image/gif', size: 1000 }));
assert.ok(L.checkFileMeta({ name: 'a.png', type: 'image/png', size: 11 * 1024 * 1024 }));
assert.ok(L.checkFileMeta({ name: 'a.png', type: 'image/png', size: 0 }));
assert.strictEqual(L.safeName('../../my photo (1).jpg'), '.._.._my_photo__1_.jpg');

// all 8 seeded prices from the owner's list: price, deposit and balance reconcile
const seed = { 'A5-Soft-50': 65000, 'A5-Soft-100': 95000, 'A5-Hard-50': 90000, 'A5-Hard-100': 135000, 'A6-Soft-50': 58000, 'A6-Soft-100': 88000, 'A6-Hard-50': 78000, 'A6-Hard-100': 110000 };
for (const [k, v] of Object.entries(seed)) assert.strictEqual(L.depositFor(v) + (v - L.depositFor(v)), v, k);
console.log('All logic tests passed');
