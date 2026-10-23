import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { browserTimeZone } from '@/lib/date';
import { useAuth } from '@/services/auth/auth-context';
import { AuthLayout, linkClass } from './AuthLayout';
import { PASSWORD_MIN, signUpSchema } from './schemas';

export function SignUpPage() {
  const { signUp } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(signUpSchema),
    defaultValues: { displayName: '', email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ displayName, email, password }) => {
    setSubmitError(null);
    const result = await signUp({ displayName, email, password, timezone: browserTimeZone() });
    if (!result.ok) {
      setSubmitError(result.message);
      return;
    }
    // Sem confirmação de e-mail configurada, a sessão já existe e a rota redireciona.
    if (result.needsEmailConfirmation) setSentTo(email);
  });

  if (sentTo) {
    return (
      <AuthLayout
        title="Confirme seu e-mail"
        footer={
          <Link to="/entrar" className={linkClass}>
            Voltar para entrar
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-primary-soft text-primary">
            <MailCheck aria-hidden="true" className="size-6" />
          </span>
          <p role="status" className="text-body-sm text-fg-muted">
            Se <strong className="text-fg">{sentTo}</strong> puder ser usado, você receberá um link
            de confirmação em instantes. Abra-o <strong>neste navegador</strong> para entrar.
          </p>
          <p className="text-caption text-fg-subtle">
            Não chegou? Confira o spam. Se você já tem conta, use “Esqueci minha senha”.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Criar conta"
      description="Seus dados ficam isolados na sua conta e protegidos no banco."
      footer={
        <>
          Já tem conta?{' '}
          <Link to="/entrar" className={linkClass}>
            Entrar
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
        {submitError && <Notice tone="danger">{submitError}</Notice>}
        <TextField
          label="Como quer ser chamado"
          autoComplete="nickname"
          error={errors.displayName?.message}
          {...register('displayName')}
        />
        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Senha"
          type="password"
          autoComplete="new-password"
          hint={`Pelo menos ${PASSWORD_MIN} caracteres.`}
          error={errors.password?.message}
          {...register('password')}
        />
        <TextField
          label="Confirme a senha"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" disabled={isSubmitting} icon={<UserPlus className="size-4" />}>
          {isSubmitting ? 'Criando conta…' : 'Criar conta'}
        </Button>
      </form>
    </AuthLayout>
  );
}
