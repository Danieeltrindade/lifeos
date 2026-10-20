import { Monitor, Moon, Sun } from 'lucide-react';
import { SegmentedControl, type SegmentedOption } from '@/components/ui/SegmentedControl';
import type { ThemePreference } from '@/lib/theme/theme';
import { useTheme } from '@/lib/theme/theme-context';

const OPTIONS: SegmentedOption<ThemePreference>[] = [
  { value: 'light', label: 'Claro', icon: <Sun aria-hidden="true" className="size-4" /> },
  { value: 'dark', label: 'Escuro', icon: <Moon aria-hidden="true" className="size-4" /> },
  { value: 'system', label: 'Sistema', icon: <Monitor aria-hidden="true" className="size-4" /> },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { preference, setPreference } = useTheme();
  return (
    <SegmentedControl
      label="Tema"
      options={OPTIONS}
      value={preference}
      onChange={setPreference}
      hideLabels={compact}
    />
  );
}
