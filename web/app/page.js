/**
 * Copyright (c) 2026 mamoor123
 * Licensed under the GNU Affero General Public License v3.0
 * See LICENSE for details.
 */

'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth';

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    router.push(user ? '/dashboard' : '/login');
  }, [user]);

  return null;
}
