'use client';

import React, { useState } from 'react';

import { apiClient } from '../../../../src/lib/apiClient';
import { useAuth } from '../../../../src/providers/AuthProvider';
import { RequireAuth } from '../../../../src/components/RequireAuth';
import { FormButton } from '../../../../src/components/FormButton';
import Can from '../../../../src/components/Can';
import { PERMISSIONS } from '../../../../src/lib/permissions';

// NOTE: We rely on best-effort fields from backend CreatePaymentDto.
// If you share apps/api/src/modules/payments/dto/create-payment.dto.ts,
// we can make this form 100% accurate.

export default function PayPage() {
  return (
    <RequireAuth>
      <PayInner />
    </RequireAuth>
  );
}

function PayInner() {
  const { token } = useAuth();

  const [orderId, setOrderId] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState('CASH');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit() {
    if (!token) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!orderId) throw new Error('orderId is required');
      if (!amount || amount <= 0) throw new Error('amount must be > 0');

      await apiClient.post(
        '/payments/pay',
        {
          orderId,
          amount,
          method,
        },
        { token },
      );

      setSuccess('Payment recorded');
      setOrderId('');
      setAmount(0);
      setMethod('CASH');
    } catch (e) {
      const err = e as { message?: string };
      setError(err?.message ?? 'Failed to submit payment');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>Pay</h1>

      <Can permission={PERMISSIONS.PAYMENT_CREATE} fallback={<div>Forbidden</div>}>
        <div style={{ maxWidth: 520 }}>
          <label style={{ display: 'block', marginBottom: 10 }}>
            Order ID
            <input
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              style={{ width: '100%', padding: 10, marginTop: 6 }}
              placeholder="salesOrderId"
            />
          </label>

          <label style={{ display: 'block', marginBottom: 10 }}>
            Amount
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              style={{ width: '100%', padding: 10, marginTop: 6 }}
              placeholder="0"
            />
          </label>

          <label style={{ display: 'block', marginBottom: 10 }}>
            Method
            <input
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              style={{ width: '100%', padding: 10, marginTop: 6 }}
              placeholder="CASH"
            />
          </label>

          {error ? <div style={{ color: 'red', marginBottom: 10 }}>{error}</div> : null}
          {success ? <div style={{ color: 'green', marginBottom: 10 }}>{success}</div> : null}

          <FormButton disabled={loading} onClick={() => void submit()}>
            {loading ? 'Submitting...' : 'Submit Payment'}
          </FormButton>
        </div>
      </Can>
    </div>
  );
}

