import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { Screen } from '@/components/layout/Screen';
import { GradientHeader } from '@/components/ui/GradientHeader';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useSessionStore } from '@/state/sessionStore';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Min 6 characters')
});

type LoginValues = z.infer<typeof loginSchema>;

export function AuthScreen() {
  const { theme } = useAppTheme();
  const login = useSessionStore((state) => state.login);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors }
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: ''
    }
  });

  useEffect(() => {
    register('email');
    register('password');
  }, [register]);

  return (
    <Screen scrollable={false}>
      <GradientHeader title="Welcome to FXMark" subtitle="Institutional-grade forex experience" />

      <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
        <Text style={[styles.label, { color: theme.muted }]}>Email</Text>
        <TextInput
          placeholder="you@fxmark.com"
          placeholderTextColor={theme.muted}
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={(value) => setValue('email', value, { shouldValidate: true })}
        />
        {errors.email ? <Text style={[styles.error, { color: theme.danger }]}>{errors.email.message}</Text> : null}

        <Text style={[styles.label, { color: theme.muted }]}>Password</Text>
        <TextInput
          placeholder="********"
          placeholderTextColor={theme.muted}
          secureTextEntry
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
          onChangeText={(value) => setValue('password', value, { shouldValidate: true })}
        />
        {errors.password ? <Text style={[styles.error, { color: theme.danger }]}>{errors.password.message}</Text> : null}

        <Pressable
          onPress={handleSubmit(() => login())}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.primary, opacity: pressed ? 0.82 : 1 }
          ]}
        >
          <Text style={styles.buttonText}>Sign in</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 10
  },
  label: {
    fontSize: 12,
    fontWeight: '600'
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15
  },
  error: {
    fontSize: 12,
    marginTop: -4
  },
  button: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center'
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16
  }
});
