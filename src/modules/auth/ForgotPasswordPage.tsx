import { zodResolver } from '@hookform/resolvers/zod';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { useAuth } from '@/services/auth/auth-context';
import { AuthLayout, linkClass } from './AuthLayout';
import { forgotPasswordSchema } from './schemas';

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });

  const onSubmit = handleSubmit(async ({ email }) => {
    setSubmitError(null);
    const result = await requestPasswordReset(email);
    if (result.ok) setSent(true);
    else setSubmitError(result.message);
  });

  return (
    <AuthLayout
      title="Recuperar senha"
      description="Enviaremos um link para você criar uma nova senha."
      footer={
        <Link to="/entrar" className={linkClass}>
          Voltar para entrar
        </Link>
      }
    >
      {sent ? (
        // Mesma resposta exista ou não a conta: não revela quem está cadastrado.
        <Notice tone="success" title="Verifique seu e-mail">
          Se houver uma conta com este endereço, você receberá um link em instantes. Abra-o neste
          navegador.
        </Notice>
      ) : (
        <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          {submitError && <Notice tone="danger">{submitError}</Notice>}
          <TextField
            label="E-mail"
            type="email"
            autoComplete="email"
            inputMode="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <Button type="submit" disabled={isSubmitting} icon={<Send className="size-4" />}>
            {isSubmitting ? 'Enviando…' : 'Enviar link'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
