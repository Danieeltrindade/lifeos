import { zodResolver } from '@hookform/resolvers/zod';
import { Download, KeyRound, LogOut, ShieldAlert, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { SelectField, TextField } from '@/components/ui/Field';
import { downloadFile, recordsToCsv } from '@/lib/export';
import { Notice } from '@/components/ui/Notice';
import { useAuth } from '@/services/auth/auth-context';
import { toAppError } from '@/services/supabase/errors';
import { useSupabase } from '@/services/supabase/supabase-context';
import {
  CSV_TABLES,
  deleteMyAccount,
  exportFileName,
  exportMyData,
  exportTableRecords,
} from '../data/account-repository';
import { DELETE_CONFIRMATION, deleteAccountSchema } from '../schemas';

type Feedback = { ok: boolean; message: string } | null;

function downloadJson(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function AccountSection() {
  const client = useSupabase();
  const { state, signOut, requestPasswordReset, handleSessionExpired } = useAuth();
  const email = state.status === 'signed_in' ? (state.user.email ?? '') : '';
  const [exporting, setExporting] = useState(false);
  const [csvTable, setCsvTable] = useState<string>(CSV_TABLES[0]?.key ?? 'tasks');
  const [sendingReset, setSendingReset] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const onExport = async () => {
    setExporting(true);
    setFeedback(null);
    try {
      const data = await exportMyData(client);
      downloadJson(data, exportFileName(new Date()));
      setFeedback({ ok: true, message: 'Exportação concluída. O arquivo foi baixado.' });
    } catch (error) {
      const appError = toAppError(error);
      if (appError.kind === 'session_expired') handleSessionExpired();
      setFeedback({ ok: false, message: appError.message });
    } finally {
      setExporting(false);
    }
  };

  const onExportCsv = async () => {
    setExporting(true);
    setFeedback(null);
    try {
      const data = await exportMyData(client);
      const records = exportTableRecords(data, csvTable);
      downloadFile(
        recordsToCsv(records),
        `lifeos-${csvTable}-${new Date().toISOString().slice(0, 10)}.csv`,
        'text/csv;charset=utf-8',
      );
      setFeedback({
        ok: true,
        message: `CSV baixado com ${String(records.length)} registro(s).`,
      });
    } catch (error) {
      const appError = toAppError(error);
      if (appError.kind === 'session_expired') handleSessionExpired();
      setFeedback({ ok: false, message: appError.message });
    } finally {
      setExporting(false);
    }
  };

  const onPasswordReset = async () => {
    setSendingReset(true);
    setFeedback(null);
    const result = await requestPasswordReset(email);
    setSendingReset(false);
    setFeedback(
      result.ok
        ? { ok: true, message: `Enviamos para ${email} um link para criar uma nova senha.` }
        : { ok: false, message: result.message },
    );
  };

  return (
    <>
      <Card aria-labelledby="settings-account">
        <CardHeader
          title="Conta"
          titleId="settings-account"
          icon={<KeyRound className="size-4" />}
          description={email}
        />
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={sendingReset || !email}
              onClick={() => void onPasswordReset()}
              icon={<KeyRound className="size-4" />}
            >
              {sendingReset ? 'Enviando…' : 'Trocar senha por e-mail'}
            </Button>
            <Button
              variant="secondary"
              disabled={exporting}
              onClick={() => void onExport()}
              icon={<Download className="size-4" />}
            >
              {exporting ? 'Exportando…' : 'Exportar meus dados (JSON)'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => void signOut()}
              icon={<LogOut className="size-4" />}
            >
              Sair
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <SelectField
              label="Exportar uma tabela em CSV"
              hint="Para abrir numa planilha. O JSON completo traz todas as tabelas."
              value={csvTable}
              onChange={(e) => {
                setCsvTable(e.target.value);
              }}
            >
              {CSV_TABLES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </SelectField>
            <Button
              variant="secondary"
              disabled={exporting}
              onClick={() => void onExportCsv()}
              icon={<Download className="size-4" />}
            >
              Baixar CSV
            </Button>
          </div>
          {feedback && (
            <Notice tone={feedback.ok ? 'success' : 'danger'}>{feedback.message}</Notice>
          )}
        </CardBody>
      </Card>
      <DeleteAccountCard />
    </>
  );
}

function DeleteAccountCard() {
  const client = useSupabase();
  const { reauthenticate, handleAccountDeleted, handleSessionExpired } = useAuth();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: { password: '', confirmation: '' },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null);
    // 1) Confirma a identidade com a senha; 2) o banco apaga a conta e tudo em cascata.
    const auth = await reauthenticate(password);
    if (!auth.ok) {
      setError(auth.message);
      return;
    }
    try {
      await deleteMyAccount(client);
      await handleAccountDeleted();
    } catch (e) {
      const appError = toAppError(e);
      if (appError.kind === 'session_expired') handleSessionExpired();
      setError(appError.message);
    }
  });

  return (
    <Card aria-labelledby="settings-danger" className="border-danger/40">
      <CardHeader
        title="Excluir conta"
        titleId="settings-danger"
        icon={<ShieldAlert className="size-4 text-danger" />}
        description="Permanente e sem volta"
      />
      <CardBody className="flex flex-col gap-4">
        <p className="text-body-sm text-fg-muted">
          Remove sua conta e <strong>todos</strong> os seus registros: estudos, atividades, tarefas,
          metas, hábitos e diário. Exporte seus dados antes, se quiser guardá-los.
        </p>
        {!open ? (
          <div>
            <Button
              variant="danger"
              onClick={() => {
                setOpen(true);
              }}
              icon={<Trash2 className="size-4" />}
            >
              Quero excluir minha conta
            </Button>
          </div>
        ) : (
          <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Sua senha"
                type="password"
                autoComplete="current-password"
                error={errors.password?.message}
                {...register('password')}
              />
              <TextField
                label={`Digite ${DELETE_CONFIRMATION} para confirmar`}
                autoComplete="off"
                error={errors.confirmation?.message}
                {...register('confirmation')}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                variant="danger"
                disabled={isSubmitting}
                icon={<Trash2 className="size-4" />}
              >
                {isSubmitting ? 'Excluindo…' : 'Excluir conta definitivamente'}
              </Button>
              <Button
                variant="ghost"
                disabled={isSubmitting}
                onClick={() => {
                  reset();
                  setError(null);
                  setOpen(false);
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
