/**
 * A labelled text input with an error slot.
 *
 * The error lives under the field rather than in an alert, so a validation
 * failure never costs the user their place. Labels are real labels, so a screen
 * reader announces the field it belongs to (NFR-U-05).
 */
import { forwardRef } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { Text } from './Text';
import { useTheme } from '../theme';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | undefined;
  hint?: string;
  /** Hides the label visually but keeps it for assistive technology. */
  labelHidden?: boolean;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, labelHidden = false, ...rest },
  ref,
) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.space.xs }}>
      {!labelHidden && (
        <Text variant="label" tone="muted">
          {label}
        </Text>
      )}
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={theme.colors.textFaint}
        {...rest}
        style={{
          minHeight: theme.hitSlop,
          paddingHorizontal: theme.space.md,
          paddingVertical: theme.space.sm,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: error ? theme.colors.danger : theme.colors.border,
          backgroundColor: theme.colors.surfaceRaised,
          color: theme.colors.text,
          fontSize: theme.fontSize.body,
        }}
      />
      {error ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="faint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});
