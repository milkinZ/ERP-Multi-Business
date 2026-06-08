'use client';

import React from 'react';
import { useAuth } from '../providers/AuthProvider';

export default function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { user } = useAuth();
  const ok = !!user?.permissions?.includes(permission);
  return <>{ok ? children : fallback}</>;
}

