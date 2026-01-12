/**
 * Complaint Generator Page
 * Generate and manage legal complaints
 */

'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ComplaintForm } from '@/components/generator/complaint-form';
import { GeneratedList } from '@/components/generator/generated-list';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Loader2 } from 'lucide-react';

type ComplaintStatus = 'DRAFT' | 'FINALIZED' | 'ARCHIVED';

interface Pattern {
  id: string;
  name: string;
  make: string;
  model: string;
  yearStart: number;
  yearEnd: number;
  complaintCount: number;
}

interface GeneratedComplaint {
  id: string;
  title: string;
  status: ComplaintStatus;
  createdAt: Date;
  pattern: {
    id: string;
    name: string;
    make: string;
    model: string;
  };
  plaintiffInfo: {
    name: string;
    state: string;
  };
}

interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
}

function GeneratorContent() {
  const searchParams = useSearchParams();
  const patternIdFromUrl = searchParams.get('patternId');

  const [activeTab, setActiveTab] = useState<'generate' | 'history'>(
    patternIdFromUrl ? 'generate' : 'history'
  );
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);
  const [complaints, setComplaints] = useState<GeneratedComplaint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Fetch pattern if provided in URL
  useEffect(() => {
    if (patternIdFromUrl) {
      fetch(`/api/patterns/${patternIdFromUrl}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.pattern) {
            setSelectedPattern(data.pattern);
            setActiveTab('generate');
          }
        })
        .catch(console.error);
    }
  }, [patternIdFromUrl]);

  // Fetch generated complaints
  useEffect(() => {
    async function fetchComplaints() {
      try {
        const res = await fetch('/api/generator');
        if (res.ok) {
          const data = await res.json();
          setComplaints(
            data.complaints.map((c: GeneratedComplaint) => ({
              ...c,
              createdAt: new Date(c.createdAt),
            }))
          );
        }
      } catch (error) {
        console.error('Failed to fetch complaints:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchComplaints();
  }, []);

  const handleGenerateComplaint = async (formData: {
    patternId: string;
    plaintiffInfo: { name: string; state: string };
    court?: string;
    complaintType?: 'class_action' | 'individual';
    classDefinition?: string;
    estimatedClassSize?: number;
    causesOfAction?: string[];
  }) => {
    setIsGenerating(true);
    setError(undefined);

    try {
      const res = await fetch('/api/generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate complaint');
      }

      const data = await res.json();

      // Add to complaints list
      setComplaints((prev) => [
        {
          ...data.complaint,
          createdAt: new Date(data.complaint.createdAt),
        },
        ...prev,
      ]);

      // Switch to history tab
      setActiveTab('history');
      setSelectedPattern(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteComplaint = async (id: string) => {
    try {
      const res = await fetch(`/api/generator/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setComplaints((prev) => prev.filter((c) => c.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete complaint:', error);
    }
  };

  const handleDownloadPdf = async (id: string) => {
    try {
      const res = await fetch(`/api/generator/${id}/pdf`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `complaint-${id}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to download PDF:', error);
    }
  };

  const handleViewComplaint = (id: string) => {
    console.log('View complaint:', id);
    // Could open a modal or navigate to detail page
  };

  const handleEditComplaint = (id: string) => {
    console.log('Edit complaint:', id);
    // Could open editor modal
  };

  const handleSort = (config: SortConfig) => {
    console.log('Sort:', config);
    // Client-side sorting or fetch with sort params
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Complaint Generator</h1>
          <p className="text-muted-foreground">
            Generate and manage legal complaints from detected patterns
          </p>
        </div>
        {activeTab === 'history' && (
          <Button onClick={() => setActiveTab('generate')}>
            <Plus className="h-4 w-4 mr-2" />
            New Complaint
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'generate' | 'history')}>
        <TabsList>
          <TabsTrigger value="history">Generated Complaints</TabsTrigger>
          <TabsTrigger value="generate">Generate New</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-6">
          <GeneratedList
            complaints={complaints}
            isLoading={isLoading}
            onView={handleViewComplaint}
            onEdit={handleEditComplaint}
            onDownload={handleDownloadPdf}
            onDelete={handleDeleteComplaint}
            onSort={handleSort}
          />
        </TabsContent>

        <TabsContent value="generate" className="mt-6">
          {selectedPattern ? (
            <ComplaintForm
              pattern={selectedPattern}
              onSubmit={handleGenerateComplaint}
              onCancel={() => {
                setSelectedPattern(null);
                setActiveTab('history');
              }}
              isLoading={isGenerating}
              error={error}
            />
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                Select a pattern to generate a complaint
              </p>
              <Button
                variant="outline"
                onClick={() => (window.location.href = '/patterns')}
              >
                Browse Patterns
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GeneratorLoading() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function GeneratorPage() {
  return (
    <Suspense fallback={<GeneratorLoading />}>
      <GeneratorContent />
    </Suspense>
  );
}
