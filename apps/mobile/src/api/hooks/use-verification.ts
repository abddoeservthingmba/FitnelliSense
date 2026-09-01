/**
 * Email verification and password reset by one-time code (FR-AUTH-06).
 *
 * Requesting a code is a mutation that reports whether delivery is even
 * configured, so the screen can tell "check your inbox" apart from "this
 * cannot be sent yet" rather than leaving the user staring at an empty inbox.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  routes,
  type CodeRequestResponse,
  type PasswordResetConfirm,
  type VerificationStatus,
} from '@fi/shared';
import { api } from '../client';
import { keys } from '../query-client';

export function useRequestVerificationCode() {
  return useMutation({
    mutationFn: () => api.post<CodeRequestResponse>(routes.auth.verifyEmailRequest, {}),
  });
}

export function useConfirmVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      api.post<VerificationStatus>(routes.auth.verifyEmailConfirm, { code }),
    onSuccess: () => {
      // `emailVerified` lives on /me, which the reminder banner reads.
      void queryClient.invalidateQueries({ queryKey: keys.me });
    },
  });
}

/** Unauthenticated: the whole point is that the user cannot get in. */
export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (email: string) =>
      api.post<CodeRequestResponse>(routes.auth.passwordResetRequest, { email }),
  });
}

export function useConfirmPasswordReset() {
  return useMutation({
    mutationFn: (input: PasswordResetConfirm) =>
      api.post<{ ok: true }>(routes.auth.passwordResetConfirm, input),
  });
}
