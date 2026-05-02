type ProfileCompletionCardProps = {
  completion: number;
  missingFields?: string[];
};

export default function ProfileCompletionCard({ completion, missingFields }: ProfileCompletionCardProps) {
  return (
    <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-blue-100 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-slate-900">Perfil {completion}% completo</h3>
          <p className="mt-1 text-sm text-slate-600">Preencha os campos em falta para melhorar as suas chances</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="text-3xl font-bold text-blue-600">{completion}%</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-blue-200">
        <div className="h-full bg-blue-600 transition-all" style={{ width: `${completion}%` }} />
      </div>

      {missingFields && missingFields.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-slate-600">Campos em falta:</p>
          <ul className="mt-2 space-y-1">
            {missingFields.map((field) => (
              <li key={field} className="text-xs text-slate-600">
                • {field}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
