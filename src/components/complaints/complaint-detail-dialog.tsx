/**
 * Complaint Detail Dialog
 * Shows full complaint details when clicking a row
 */

'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { Car, Flame, AlertTriangle, Skull, Calendar, Hash } from 'lucide-react';

interface Complaint {
  id: string;
  nhtsaId: string;
  make: string;
  model: string;
  year: number;
  component: string;
  description: string;
  crash: boolean;
  fire: boolean;
  injuries: number;
  deaths: number;
  dateAdded: Date;
}

interface ComplaintDetailDialogProps {
  complaint: Complaint | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComplaintDetailDialog({
  complaint,
  open,
  onOpenChange,
}: ComplaintDetailDialogProps) {
  if (!complaint) return null;

  const formatDate = (date: Date) => {
    try {
      if (!date) return 'N/A';
      const d = new Date(date);
      return isNaN(d.getTime()) ? 'N/A' : format(d, 'MMMM d, yyyy');
    } catch {
      return 'N/A';
    }
  };

  const severityItems = [
    { condition: complaint.crash, icon: Car, label: 'Crash', color: 'text-warning' },
    { condition: complaint.fire, icon: Flame, label: 'Fire', color: 'text-destructive' },
    { condition: complaint.injuries > 0, icon: AlertTriangle, label: `${complaint.injuries} Injuries`, color: 'text-warning' },
    { condition: complaint.deaths > 0, icon: Skull, label: `${complaint.deaths} Deaths`, color: 'text-destructive' },
  ].filter(item => item.condition);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {complaint.year} {complaint.make} {complaint.model}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Hash className="h-4 w-4" />
            NHTSA ID: {complaint.nhtsaId}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Vehicle & Component Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Make</p>
              <p className="font-medium">{complaint.make}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Model</p>
              <p className="font-medium">{complaint.model}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Year</p>
              <p className="font-medium">{complaint.year}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Component</p>
              <Badge variant="outline">{complaint.component}</Badge>
            </div>
          </div>

          <Separator />

          {/* Date */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            Filed: {formatDate(complaint.dateAdded)}
          </div>

          {/* Severity Indicators */}
          {severityItems.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-2">Severity Indicators</p>
                <div className="flex flex-wrap gap-3">
                  {severityItems.map((item, index) => (
                    <div key={index} className="flex items-center gap-1.5">
                      <item.icon className={`h-5 w-5 ${item.color}`} />
                      <span className="text-sm font-medium">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Full Description */}
          <div>
            <p className="text-sm text-muted-foreground mb-2">Full Description</p>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {complaint.description || 'No description available.'}
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
