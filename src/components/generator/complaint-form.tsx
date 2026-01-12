/**
 * Complaint Form Component
 * Form for generating legal complaints
 */

'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Pattern {
  id: string;
  name: string;
  make: string;
  model: string;
  yearStart: number;
  yearEnd: number;
  complaintCount: number;
}

interface PlaintiffInfo {
  name: string;
  state: string;
  incidentDate?: string;
  injuryDescription?: string;
}

interface FormData {
  patternId: string;
  plaintiffInfo: PlaintiffInfo;
  court?: string;
  complaintType?: 'class_action' | 'individual';
  classDefinition?: string;
  estimatedClassSize?: number;
  causesOfAction?: string[];
}

interface ComplaintFormProps {
  pattern: Pattern;
  onSubmit: (data: FormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string;
  initialData?: Partial<FormData>;
}

const courts = [
  'US District Court, Northern District of California',
  'US District Court, Southern District of California',
  'US District Court, Central District of California',
  'US District Court, Eastern District of California',
  'US District Court, Southern District of Texas',
  'US District Court, Northern District of Texas',
  'US District Court, Southern District of New York',
  'US District Court, Northern District of Illinois',
];

const causesOfActionOptions = [
  { id: 'negligence', label: 'Negligence' },
  { id: 'strict_product_liability', label: 'Strict Product Liability' },
  { id: 'breach_of_warranty', label: 'Breach of Warranty' },
  { id: 'fraud', label: 'Fraud' },
  { id: 'unjust_enrichment', label: 'Unjust Enrichment' },
];

export function ComplaintForm({
  pattern,
  onSubmit,
  onCancel,
  isLoading,
  error,
  initialData,
}: ComplaintFormProps) {
  const [formData, setFormData] = useState<Partial<FormData>>({
    patternId: pattern.id,
    plaintiffInfo: initialData?.plaintiffInfo || { name: '', state: '' },
    court: initialData?.court || '',
    complaintType: initialData?.complaintType || 'class_action',
    classDefinition: initialData?.classDefinition || '',
    estimatedClassSize: initialData?.estimatedClassSize,
    causesOfAction: initialData?.causesOfAction || [],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    const newErrors: Record<string, string> = {};
    if (!formData.plaintiffInfo?.name) {
      newErrors.name = 'Plaintiff name is required';
    }
    if (!formData.plaintiffInfo?.state) {
      newErrors.state = 'State is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    onSubmit(formData as FormData);
  };

  const handlePlaintiffChange = (field: keyof PlaintiffInfo, value: string) => {
    setFormData({
      ...formData,
      plaintiffInfo: {
        ...formData.plaintiffInfo!,
        [field]: value,
      },
    });
    if (errors[field]) {
      setErrors({ ...errors, [field]: '' });
    }
  };

  const toggleCauseOfAction = (id: string) => {
    const current = formData.causesOfAction || [];
    if (current.includes(id)) {
      setFormData({
        ...formData,
        causesOfAction: current.filter((c) => c !== id),
      });
    } else {
      setFormData({
        ...formData,
        causesOfAction: [...current, id],
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate Legal Complaint</CardTitle>
        <div className="text-muted-foreground text-sm">
          <p className="font-medium">
            {pattern.make} {pattern.model}
          </p>
          <p>{pattern.name}</p>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Plaintiff Information */}
          <div className="space-y-4">
            <h3 className="font-medium">Plaintiff Information</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="plaintiff-name">Plaintiff Name</Label>
                <Input
                  id="plaintiff-name"
                  value={formData.plaintiffInfo?.name || ''}
                  onChange={(e) => handlePlaintiffChange('name', e.target.value)}
                  className={cn(errors.name && 'border-destructive')}
                />
                {errors.name && (
                  <p className="text-destructive text-sm mt-1">{errors.name}</p>
                )}
              </div>
              <div>
                <Label htmlFor="plaintiff-state">State</Label>
                <Input
                  id="plaintiff-state"
                  value={formData.plaintiffInfo?.state || ''}
                  onChange={(e) => handlePlaintiffChange('state', e.target.value)}
                  className={cn(errors.state && 'border-destructive')}
                />
                {errors.state && (
                  <p className="text-destructive text-sm mt-1">{errors.state}</p>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="incident-date">Incident Date</Label>
              <Input
                id="incident-date"
                type="date"
                value={formData.plaintiffInfo?.incidentDate || ''}
                onChange={(e) => handlePlaintiffChange('incidentDate', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="injury-description">Injury Description</Label>
              <Textarea
                id="injury-description"
                value={formData.plaintiffInfo?.injuryDescription || ''}
                onChange={(e) => handlePlaintiffChange('injuryDescription', e.target.value)}
                rows={3}
              />
            </div>
          </div>

          {/* Court Selection */}
          <div>
            <Label htmlFor="court">Court</Label>
            <select
              id="court"
              value={formData.court || ''}
              onChange={(e) => setFormData({ ...formData, court: e.target.value })}
              className="w-full h-10 px-3 rounded-md border border-input bg-background"
            >
              <option value="">Select a court...</option>
              {courts.map((court) => (
                <option key={court} value={court}>
                  {court}
                </option>
              ))}
            </select>
          </div>

          {/* Complaint Type */}
          <div>
            <Label>Complaint Type</Label>
            <div className="flex gap-4 mt-2">
              <Button
                type="button"
                variant={formData.complaintType === 'class_action' ? 'default' : 'outline'}
                onClick={() => setFormData({ ...formData, complaintType: 'class_action' })}
              >
                Class Action
              </Button>
              <Button
                type="button"
                variant={formData.complaintType === 'individual' ? 'default' : 'outline'}
                onClick={() => setFormData({ ...formData, complaintType: 'individual' })}
              >
                Individual
              </Button>
            </div>
          </div>

          {/* Class Action Fields */}
          {formData.complaintType === 'class_action' && (
            <div className="space-y-4 border-l-2 border-primary/20 pl-4">
              <div>
                <Label htmlFor="class-definition">Proposed Class Definition</Label>
                <Textarea
                  id="class-definition"
                  value={formData.classDefinition || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, classDefinition: e.target.value })
                  }
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="class-size">Estimated Class Size</Label>
                <Input
                  id="class-size"
                  type="number"
                  value={formData.estimatedClassSize || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      estimatedClassSize: parseInt(e.target.value) || undefined,
                    })
                  }
                />
              </div>
            </div>
          )}

          {/* Causes of Action */}
          <div>
            <Label>Causes of Action</Label>
            <div className="grid gap-2 mt-2">
              {causesOfActionOptions.map((cause) => (
                <div key={cause.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`cause-${cause.id}`}
                    checked={(formData.causesOfAction || []).includes(cause.id)}
                    onCheckedChange={() => toggleCauseOfAction(cause.id)}
                  />
                  <Label htmlFor={`cause-${cause.id}`}>{cause.label}</Label>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && (
                <Loader2 data-testid="loading-spinner" className="h-4 w-4 mr-2 animate-spin" />
              )}
              {isLoading ? 'Generating...' : 'Generate Complaint'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
