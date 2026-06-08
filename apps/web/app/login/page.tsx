'use client';

import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import { FormButton } from '../../src/components/FormButton';
import { useAuth } from '../../src/providers/AuthProvider';



export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={{ padding: 24, maxWidth: 420 }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Login</h1>

      <label style={{ display: 'block', marginBottom: 8 }}>
        Email
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', padding: 10, marginTop: 6 }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: 8 }}>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', padding: 10, marginTop: 6 }}
        />
      </label>

      {error ? (
        <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>
      ) : null}

      <FormButton
        disabled={loading}
        onClick={async () => {
          try {
            setLoading(true);
            setError(null);
            await login({ email, password });
            router.push('/home');
          } catch (e) { const err = e as { message?: string };
            setError(err?.message ?? 'Login failed');
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading ? 'Logging in...' : 'Login'}
      </FormButton>


      <div style={{ marginTop: 16 }}>
        <a href="/register">Belum punya akun? Register</a>
      </div>
    </div>
  );
}

