import useTheme from '../theme/useTheme.js';
import { setThemeMode } from '../theme/themeStore.js';

const OPTIONS = [
  { value: 'light', label: '☀️', title: 'Modo claro' },
  { value: 'dark', label: '🌙', title: 'Modo oscuro' },
  { value: 'auto', label: '🖥️', title: 'Automático (según el sistema)' },
];

export default function ThemeToggle() {
  const { mode } = useTheme();

  return (
    <div className="theme-toggle" role="group" aria-label="Tema de la aplicación">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.title}
          aria-pressed={mode === opt.value}
          className={`theme-toggle-btn${mode === opt.value ? ' active' : ''}`}
          onClick={() => setThemeMode(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
