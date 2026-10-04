// Pure business logic. No network. Covered by test/logic.test.js.
const crypto = require('crypto');

const DEPOSIT_RATE = 0.6;

function depositFor(total) { return Math.round(total * DEPOSIT_RATE); }

// What the customer must pay RIGHT NOW for a given plan, computed on the server only.
function amountDue({ total, amountPaid, plan }) {
  if (!Number.isInteger(total) || total <= 0) return { error: 'No payable total yet' };
  const balance = total - amountPaid;
  if (balance <= 0) return { error: 'Order is already fully paid' };
  if (amountPaid > 0) return { amount: balance, plan: 'balance' }; // any later payment settles the rest
  if (plan === 'full') return { amount: total, plan: 'full' };
  if (plan === 'deposit') return { amount: depositFor(total), plan: 'deposit' };
  return { error: 'Choose a payment plan' };
}

function paymentStatus(total, paid) {
  if (paid > 0 && total != null && paid >= total) return 'fully_paid';
  if (paid > 0) return 'partially_paid';
  return 'pending';
}

function orderNumber(seq, year) { return `GM-${year}-${String(seq).padStart(4, '0')}`; }

function verifyPaystackSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const h = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const a = Buffer.from(h), b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const ACCEPTED = { 'image/jpeg': 'jpg', 'image/png': 'png' };
const MAX_BYTES = 10 * 1024 * 1024;
function checkFileMeta(f) {
  if (!f || typeof f.name !== 'string') return 'Invalid file';
  if (!ACCEPTED[f.type]) return `${f.name}: only JPG and PNG are accepted`;
  if (!Number.isFinite(f.size) || f.size <= 0 || f.size > MAX_BYTES) return `${f.name}: must be under 10 MB`;
  return null;
}
const safeName = (n) => String(n).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');

const STATUS_LABEL = {
  new_order: 'New Order', payment_pending: 'Payment Pending', partially_paid: 'Partially Paid', fully_paid: 'Fully Paid',
  information_received: 'Information Received', design_in_progress: 'Design in Progress', design_proof_sent: 'Design Proof Sent',
  revision_requested: 'Revision Requested', awaiting_approval: 'Awaiting Approval', approved: 'Approved',
  in_production: 'In Production', completed: 'Completed'
};

module.exports = { depositFor, amountDue, paymentStatus, orderNumber, verifyPaystackSignature, checkFileMeta, safeName, naira, STATUS_LABEL, MAX_BYTES, ACCEPTED };
