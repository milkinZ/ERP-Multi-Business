'use client';

import React from 'react';

export function FormButton({
  children,
  onClick,
  disabled,
  type,
}: {
  children: React.ReactNode;
  onClick?: () => void | Promise<void>;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type ?? 'button'}
      onClick={() => {
        void onClick?.();
      }}
      disabled={disabled}
      style={{
        width: '100%',
        padding: 12,
        background: disabled ? '#999' : '#111',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

