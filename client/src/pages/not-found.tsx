import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function NotFound() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="mb-4 flex justify-end"><LanguageSwitcher /></div>
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">{t("404 Page Not Found")}</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            {t("Did you forget to add the page to the router?")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
