import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function Settings() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-primary" />
          System Preferences
        </h1>
        <p className="text-sm text-muted-foreground">Global configuration for the VMS environment.</p>
      </div>

      <div className="grid gap-6">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Organization Identity</CardTitle>
            <CardDescription>Details displayed on badges and communications.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Facility Name</Label>
                <Input defaultValue="Concept Trunk Interiors" className="bg-background" />
              </div>
              <div className="space-y-2">
                <Label>Contact Email</Label>
                <Input defaultValue="www.ctint.in" className="bg-background" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Security Defaults</CardTitle>
            <CardDescription>Automated rules for visitor handling.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Auto-Checkout</Label>
                <p className="text-sm text-muted-foreground">Automatically check out visitors at midnight.</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Require Host Approval</Label>
                <p className="text-sm text-muted-foreground">Hosts must approve visitors before check-in.</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Photo Capture Enforced</Label>
                <p className="text-sm text-muted-foreground">Prevent check-in without a captured photo.</p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <Save className="mr-2 h-4 w-4" /> Save Configuration
          </Button>
        </div>
      </div>
    </div>
  );
}
