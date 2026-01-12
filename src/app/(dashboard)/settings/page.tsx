/**
 * Settings Page
 * User preferences and application settings
 */

'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { User, Bell, Key, Palette, Save, RefreshCw } from 'lucide-react';

interface ProfileSettings {
  name: string;
  email: string;
  organization: string;
  role: string;
}

interface NotificationSettings {
  emailAlerts: boolean;
  patternAlerts: boolean;
  weeklyDigest: boolean;
  criticalOnly: boolean;
}

interface ApiSettings {
  syncFrequency: 'hourly' | 'daily' | 'weekly';
  autoSync: boolean;
  lastSyncAt: Date | null;
}

interface AppearanceSettings {
  theme: 'light' | 'dark' | 'system';
  compactMode: boolean;
  showAnimations: boolean;
}

export default function SettingsPage() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const [profile, setProfile] = useState<ProfileSettings>({
    name: '',
    email: '',
    organization: '',
    role: 'analyst',
  });

  const [notifications, setNotifications] = useState<NotificationSettings>({
    emailAlerts: true,
    patternAlerts: true,
    weeklyDigest: false,
    criticalOnly: false,
  });

  const [api, setApi] = useState<ApiSettings>({
    syncFrequency: 'daily',
    autoSync: true,
    lastSyncAt: null,
  });

  const [appearance, setAppearance] = useState<AppearanceSettings>({
    theme: 'system',
    compactMode: false,
    showAnimations: true,
  });

  // Sync local appearance state with actual theme
  useEffect(() => {
    if (theme) {
      setAppearance((prev) => ({
        ...prev,
        theme: theme as 'light' | 'dark' | 'system',
      }));
    }
  }, [theme]);

  const handleSave = async (section: string) => {
    setIsSaving(true);
    setSaveSuccess(null);

    try {
      // Simulated API call
      await new Promise((resolve) => setTimeout(resolve, 500));
      setSaveSuccess(section);
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncNow = async () => {
    try {
      await fetch('/api/sync', { method: 'POST' });
      setApi((prev) => ({ ...prev, lastSyncAt: new Date() }));
    } catch (error) {
      console.error('Sync failed:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and application preferences
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="api" className="gap-2">
            <Key className="h-4 w-4" />
            <span className="hidden sm:inline">API & Sync</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2">
            <Palette className="h-4 w-4" />
            <span className="hidden sm:inline">Appearance</span>
          </TabsTrigger>
        </TabsList>

        {/* Profile Settings */}
        <TabsContent value="profile" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Settings</CardTitle>
              <CardDescription>
                Manage your personal information and account details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={profile.name}
                    onChange={(e) =>
                      setProfile((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profile.email}
                    onChange={(e) =>
                      setProfile((prev) => ({ ...prev, email: e.target.value }))
                    }
                    placeholder="john@lawfirm.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="organization">Organization</Label>
                  <Input
                    id="organization"
                    value={profile.organization}
                    onChange={(e) =>
                      setProfile((prev) => ({
                        ...prev,
                        organization: e.target.value,
                      }))
                    }
                    placeholder="Law Firm LLC"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select
                    value={profile.role}
                    onValueChange={(value) =>
                      setProfile((prev) => ({ ...prev, role: value }))
                    }
                  >
                    <SelectTrigger id="role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="analyst">Analyst</SelectItem>
                      <SelectItem value="attorney">Attorney</SelectItem>
                      <SelectItem value="paralegal">Paralegal</SelectItem>
                      <SelectItem value="admin">Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => handleSave('profile')}
                  disabled={isSaving}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
              {saveSuccess === 'profile' && (
                <p className="text-sm text-green-600">
                  Profile settings saved successfully!
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notification Settings */}
        <TabsContent value="notifications" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>
                Configure how and when you receive alerts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="emailAlerts"
                    checked={notifications.emailAlerts}
                    onCheckedChange={(checked) =>
                      setNotifications((prev) => ({
                        ...prev,
                        emailAlerts: checked === true,
                      }))
                    }
                  />
                  <div>
                    <Label htmlFor="emailAlerts" className="cursor-pointer">
                      Email Alerts
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Receive email notifications for important events
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="patternAlerts"
                    checked={notifications.patternAlerts}
                    onCheckedChange={(checked) =>
                      setNotifications((prev) => ({
                        ...prev,
                        patternAlerts: checked === true,
                      }))
                    }
                  />
                  <div>
                    <Label htmlFor="patternAlerts" className="cursor-pointer">
                      New Pattern Alerts
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified when new patterns are detected
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="weeklyDigest"
                    checked={notifications.weeklyDigest}
                    onCheckedChange={(checked) =>
                      setNotifications((prev) => ({
                        ...prev,
                        weeklyDigest: checked === true,
                      }))
                    }
                  />
                  <div>
                    <Label htmlFor="weeklyDigest" className="cursor-pointer">
                      Weekly Digest
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Receive a weekly summary of activity and patterns
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="criticalOnly"
                    checked={notifications.criticalOnly}
                    onCheckedChange={(checked) =>
                      setNotifications((prev) => ({
                        ...prev,
                        criticalOnly: checked === true,
                      }))
                    }
                  />
                  <div>
                    <Label htmlFor="criticalOnly" className="cursor-pointer">
                      Critical Alerts Only
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Only receive notifications for high-severity patterns
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => handleSave('notifications')}
                  disabled={isSaving}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? 'Saving...' : 'Save Preferences'}
                </Button>
              </div>
              {saveSuccess === 'notifications' && (
                <p className="text-sm text-green-600">
                  Notification preferences saved successfully!
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* API & Sync Settings */}
        <TabsContent value="api" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>API & Data Sync</CardTitle>
              <CardDescription>
                Configure NHTSA data synchronization settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="syncFrequency">Sync Frequency</Label>
                  <Select
                    value={api.syncFrequency}
                    onValueChange={(value: 'hourly' | 'daily' | 'weekly') =>
                      setApi((prev) => ({ ...prev, syncFrequency: value }))
                    }
                  >
                    <SelectTrigger id="syncFrequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Last Sync</Label>
                  <p className="text-sm text-muted-foreground py-2">
                    {api.lastSyncAt
                      ? api.lastSyncAt.toLocaleString()
                      : 'Never synced'}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="autoSync"
                  checked={api.autoSync}
                  onCheckedChange={(checked) =>
                    setApi((prev) => ({
                      ...prev,
                      autoSync: checked === true,
                    }))
                  }
                />
                <div>
                  <Label htmlFor="autoSync" className="cursor-pointer">
                    Auto-Sync
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically sync data based on the selected frequency
                  </p>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={handleSyncNow}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync Now
                </Button>
                <Button onClick={() => handleSave('api')} disabled={isSaving}>
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? 'Saving...' : 'Save Settings'}
                </Button>
              </div>
              {saveSuccess === 'api' && (
                <p className="text-sm text-green-600">
                  API settings saved successfully!
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appearance Settings */}
        <TabsContent value="appearance" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Customize the look and feel of the application
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="theme">Theme</Label>
                {mounted ? (
                  <Select
                    value={theme}
                    onValueChange={(value: 'light' | 'dark' | 'system') => {
                      setTheme(value);
                    }}
                  >
                    <SelectTrigger id="theme" className="w-full sm:w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="h-10 w-full sm:w-48 bg-muted animate-pulse rounded-md" />
                )}
                {mounted && resolvedTheme && (
                  <p className="text-xs text-muted-foreground">
                    Current: {resolvedTheme}
                  </p>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="compactMode"
                    checked={appearance.compactMode}
                    onCheckedChange={(checked) =>
                      setAppearance((prev) => ({
                        ...prev,
                        compactMode: checked === true,
                      }))
                    }
                  />
                  <div>
                    <Label htmlFor="compactMode" className="cursor-pointer">
                      Compact Mode
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Reduce spacing and padding for denser information display
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="showAnimations"
                    checked={appearance.showAnimations}
                    onCheckedChange={(checked) =>
                      setAppearance((prev) => ({
                        ...prev,
                        showAnimations: checked === true,
                      }))
                    }
                  />
                  <div>
                    <Label htmlFor="showAnimations" className="cursor-pointer">
                      Show Animations
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Enable smooth transitions and animations
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => handleSave('appearance')}
                  disabled={isSaving}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? 'Saving...' : 'Save Preferences'}
                </Button>
              </div>
              {saveSuccess === 'appearance' && (
                <p className="text-sm text-green-600">
                  Appearance settings saved successfully!
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
