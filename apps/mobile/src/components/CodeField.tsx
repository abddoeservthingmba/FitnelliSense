/**
 * A six-digit code entry.
 *
 * The visible boxes are just decoration over one real `TextInput`. The usual
 * approach — six separate inputs with focus juggling — breaks paste, breaks
 * autofill of an SMS/email code, and gives screen readers six unlabelled
 * fields. One input keeps all of that working; the boxes only render what it
 * holds.
 */
import { forwardRef, useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
import { Text } from './Text';
import { useTheme } from '../theme';

const LENGTH = 6;

export interface CodeFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  /** Fired when the sixth digit lands, so the user need not press a button. */
  onComplete?: (value: string) => void;
  label?: string;
  error?: string | undefined;
  editable?: boolean;
  autoFocus?: boolean;
}

export const CodeField = forwardRef<TextInput, CodeFieldProps>(function CodeField(
  {
    value,
    onChangeText,
    onComplete,
    label = 'Verification code',
    error,
    editable = true,
    autoFocus = true,
  },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const digits = value.split('');

  const handleChange = (next: string) => {
    // Strip everything that is not a digit, so a pasted "123 456" works and a
    // pasted sentence cannot half-fill the field.
    const cleaned = next.replace(/\D/g, '').slice(0, LENGTH);
    onChangeText(cleaned);
    if (cleaned.length === LENGTH) onComplete?.(cleaned);
  };

  return (
    <View style={{ gap: theme.space.sm }}>
      <View style={{ position: 'relative' }}>
        {/* The real field, invisible but present: it holds focus, the caret,
            paste, and the platform's code autofill. */}
        <TextInput
          ref={ref}
          value={value}
          onChangeText={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={editable}
          autoFocus={autoFocus}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={LENGTH}
          accessibilityLabel={label}
          accessibilityHint="Six digits from the email we sent you"
          // The one-time-code hint is what lets the keyboard offer the code
          // straight from the notification.
          textContentType="oneTimeCode"
          autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            // Not `opacity: 0` alone — on Android a zero-opacity input can
            // still paint a caret over the boxes.
            color: 'transparent',
            backgroundColor: 'transparent',
            opacity: 0.01,
            zIndex: 2,
            textAlign: 'center',
            fontSize: 1,
          }}
        />

        {/* Purely decorative. The input above covers this row, so a tap on a
            box lands on the input and focuses it without any focus plumbing —
            and assistive technology sees the one labelled field, not six. */}
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={{ flexDirection: 'row', gap: theme.space.sm, justifyContent: 'center' }}
        >
          {Array.from({ length: LENGTH }, (_, index) => {
            const digit = digits[index];
            const isNext = focused && index === value.length;
            const borderColor = error
              ? theme.colors.danger
              : isNext || (focused && index < value.length)
                ? theme.colors.accent
                : theme.colors.border;

            return (
              <View
                key={index}
                style={{
                  width: 44,
                  height: 56,
                  borderRadius: theme.radius.sm,
                  borderWidth: isNext ? 2 : 1,
                  borderColor,
                  backgroundColor: theme.colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text variant="title" weight="heavy" tone={digit ? 'default' : 'faint'}>
                  {digit ?? '·'}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {error ? (
        <Text variant="caption" tone="danger" center>
          {error}
        </Text>
      ) : null}
    </View>
  );
});
