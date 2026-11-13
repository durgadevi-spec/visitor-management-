import { useLanguage } from "@/contexts/LanguageContext";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <label className={`inline-flex items-center gap-2 text-sm ${className}`}>
      <span className="sr-only">{t("Language")}</span>
      <select
        aria-label={t("Language")}
        value={language}
        onChange={(event) => {
          const nextLanguage = event.target.value;
          if (nextLanguage === "en" || nextLanguage === "ta") setLanguage(nextLanguage);
        }}
        className="h-9 rounded-md border border-border bg-background px-2 text-foreground"
      >
        <option value="en">English</option>
        <option value="ta">தமிழ்</option>
      </select>
    </label>
  );
}
