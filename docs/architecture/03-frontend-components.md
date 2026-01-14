# CaseRadar Frontend Components Documentation

## Overview

CaseRadar's frontend is built with Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS 4. Components follow a hierarchical structure with shared UI primitives from Radix UI (shadcn/ui).

## Component Architecture

```mermaid
graph TB
    subgraph App["App Shell"]
        RootLayout["Root Layout<br/>(Providers, Fonts)"]
        DashboardLayout["Dashboard Layout<br/>(Sidebar, Header)"]
    end

    subgraph Pages["Page Components"]
        Dashboard["Dashboard Page"]
        Complaints["Complaints Page"]
        Patterns["Patterns Page"]
        Generator["Generator Page"]
        Settings["Settings Page"]
    end

    subgraph FeatureComponents["Feature Components"]
        subgraph DashboardComponents["Dashboard"]
            StatsCards["StatsCards"]
            ActivityFeed["ActivityFeed"]
            AlertsPanel["AlertsPanel"]
        end

        subgraph ComplaintsComponents["Complaints"]
            ComplaintFilters["ComplaintFilters"]
            ComplaintTable["ComplaintTable"]
            ComplaintDetail["ComplaintDetailDialog"]
        end

        subgraph PatternsComponents["Patterns"]
            PatternCard["PatternCard"]
            PatternDetail["PatternDetailDialog"]
        end

        subgraph GeneratorComponents["Generator"]
            ComplaintForm["ComplaintForm"]
            GeneratedList["GeneratedList"]
        end
    end

    subgraph UIComponents["UI Primitives (shadcn/ui)"]
        Button
        Card
        Dialog
        Table
        Badge
        Input
        Select
        Checkbox
        Form
        Alert
        Tabs
        Skeleton
    end

    RootLayout --> DashboardLayout
    DashboardLayout --> Pages

    Dashboard --> DashboardComponents
    Complaints --> ComplaintsComponents
    Patterns --> PatternsComponents
    Generator --> GeneratorComponents

    DashboardComponents --> UIComponents
    ComplaintsComponents --> UIComponents
    PatternsComponents --> UIComponents
    GeneratorComponents --> UIComponents
```

---

## Layouts

### Root Layout (`src/app/layout.tsx`)

**Purpose:** Provides global providers, fonts, and body structure.

```mermaid
graph TB
    subgraph RootLayout["Root Layout"]
        HTML["<html>"]
        Body["<body>"]
        ClerkProvider["ClerkProvider"]
        ThemeProvider["ThemeProvider"]
        Toaster["Sonner Toaster"]
        Children["Page Content"]
    end

    HTML --> Body
    Body --> ClerkProvider
    ClerkProvider --> ThemeProvider
    ThemeProvider --> Children
    ThemeProvider --> Toaster
```

**Providers:**
- `ClerkProvider` - Authentication context
- `ThemeProvider` - Light/dark mode support
- `Sonner Toaster` - Toast notifications

---

### Dashboard Layout (`src/app/(dashboard)/layout.tsx`)

**Purpose:** Provides sidebar navigation and header for authenticated pages.

```mermaid
graph TB
    subgraph DashboardLayout["Dashboard Layout"]
        Sidebar["Sidebar (64px width)"]
        Header["Header (h-16)"]
        Main["Main Content Area"]
    end

    subgraph Sidebar["Sidebar"]
        Logo["CaseRadar Logo"]
        NavItems["Navigation Links"]
    end

    subgraph Header["Header"]
        MenuToggle["Mobile Menu Toggle"]
        UserButton["Clerk UserButton"]
    end

    subgraph Navigation["Navigation Items"]
        NavDashboard["/dashboard"]
        NavComplaints["/complaints"]
        NavPatterns["/patterns"]
        NavGenerator["/generator"]
        NavSettings["/settings"]
    end

    DashboardLayout --> Sidebar
    DashboardLayout --> Header
    DashboardLayout --> Main
    Sidebar --> Logo
    Sidebar --> NavItems
    NavItems --> Navigation
```

**Features:**
- Collapsible sidebar on mobile (off-canvas)
- Sticky header with backdrop blur
- Active route highlighting
- Clerk `UserButton` for logout/account management

---

## Feature Components

### Dashboard Components

#### StatsCards

**Purpose:** Displays key metrics in card grid format.

**File:** `src/components/dashboard/stats-cards.tsx`

```mermaid
graph LR
    subgraph StatsCards["StatsCards Component"]
        TotalComplaints["Total Complaints<br/>FileText Icon"]
        ActivePatterns["Active Patterns<br/>BarChart3 Icon"]
        Generated["Generated Complaints<br/>Scale Icon"]
        HighSeverity["High Severity<br/>AlertTriangle Icon"]
    end

    subgraph State["Component State"]
        Loading["isLoading: boolean"]
        Stats["stats: Stats"]
    end

    State --> StatsCards
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `stats` | `Stats` | Metrics data |
| `isLoading` | `boolean` | Show skeleton loaders |

**Stats Interface:**
```typescript
interface Stats {
  totalComplaints: number;
  activePatterns: number;
  generatedComplaints: number;
  highSeverityPatterns: number;
  trends?: {
    complaints?: { direction: 'up' | 'down'; value: number };
    patterns?: { direction: 'up' | 'down'; value: number };
  };
}
```

---

#### ActivityFeed

**Purpose:** Shows recent activity timeline.

**File:** `src/components/dashboard/activity-feed.tsx`

```mermaid
flowchart TB
    subgraph ActivityFeed["ActivityFeed Component"]
        ActivityList["Activity List"]
        EmptyState["Empty State"]
        LoadingState["Loading Skeletons"]
    end

    subgraph ActivityItem["Activity Item"]
        Icon["Type Icon"]
        Title["Activity Title"]
        Description["Description"]
        Timestamp["Relative Time"]
    end

    subgraph ActivityTypes["Activity Types"]
        PatternCreated["pattern_created<br/>TrendingUp Icon"]
        ComplaintGenerated["complaint_generated<br/>FileText Icon"]
        Alert["alert<br/>AlertTriangle Icon"]
    end

    ActivityFeed --> ActivityItem
    ActivityItem --> ActivityTypes
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `activities` | `Activity[]` | List of activities |
| `isLoading` | `boolean` | Show skeletons |
| `hasMore` | `boolean` | Show "View All" link |
| `onItemClick` | `(activity) => void` | Click handler |
| `onViewAll` | `() => void` | View all handler |

---

#### AlertsPanel

**Purpose:** Displays system alerts sorted by priority.

**File:** `src/components/dashboard/alerts-panel.tsx`

```mermaid
flowchart TB
    subgraph AlertsPanel["AlertsPanel Component"]
        AlertsList["Sorted Alert List"]
        EmptyState["No Alerts State"]
        LoadingState["Loading Skeletons"]
    end

    subgraph AlertItem["Alert Item"]
        TypeIcon["Alert Type Icon"]
        Title["Alert Title"]
        Message["Alert Message"]
        Action["Optional Action Link"]
        Dismiss["Dismiss Button"]
    end

    subgraph AlertTypes["Alert Types (Priority Order)"]
        Critical["critical (0)<br/>AlertCircle Icon"]
        Warning["warning (1)<br/>AlertTriangle Icon"]
        Info["info (2)<br/>Info Icon"]
    end

    AlertsPanel --> AlertItem
    AlertItem --> AlertTypes
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `alerts` | `Alert[]` | List of alerts |
| `isLoading` | `boolean` | Show skeletons |
| `onDismiss` | `(id: string) => void` | Dismiss handler |

---

### Complaint Components

#### ComplaintFilters

**Purpose:** Search and filter controls for complaints.

**File:** `src/components/complaints/complaint-filters.tsx`

```mermaid
graph TB
    subgraph ComplaintFilters["ComplaintFilters Component"]
        SearchBar["Search Input<br/>(Debounced)"]
        FilterGrid["Filter Grid"]
        SeverityCheckboxes["Severity Checkboxes"]
        QuickPresets["Quick Presets"]
        ClearButton["Clear All"]
    end

    subgraph FilterGrid["Filter Grid (3 columns)"]
        Make["Make Input"]
        Model["Model Input"]
        Component["Component Input"]
        YearFrom["Year From"]
        YearTo["Year To"]
    end

    subgraph SeverityCheckboxes["Severity Checkboxes"]
        Crash["Has Crash"]
        Fire["Has Fire"]
        Injury["Has Injury"]
        Death["Has Death"]
    end
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `filters` | `Filters` | Current filter state |
| `onFiltersChange` | `(filters) => void` | Filter change handler |
| `debounceMs` | `number` | Search debounce (default: 300) |
| `showPresets` | `boolean` | Show quick presets |

**Filters Interface:**
```typescript
interface Filters {
  search: string;
  make: string;
  model: string;
  yearFrom: number | undefined;
  yearTo: number | undefined;
  component: string;
  hasCrash: boolean;
  hasFire: boolean;
  hasInjury: boolean;
  hasDeath: boolean;
}
```

---

#### ComplaintTable

**Purpose:** Data table for NHTSA complaints with sorting and selection.

**File:** `src/components/complaints/complaint-table.tsx`

```mermaid
graph TB
    subgraph ComplaintTable["ComplaintTable Component"]
        TableHeader["Table Header<br/>(Sortable Columns)"]
        TableBody["Table Body"]
        EmptyState["No Complaints"]
        LoadingState["Row Skeletons"]
    end

    subgraph TableRow["Table Row"]
        SelectCheckbox["Selection Checkbox"]
        NHTSAId["NHTSA ID"]
        MakeModel["Make/Model"]
        Year["Year"]
        Component["Component Badge"]
        Severity["Severity Icons"]
        Description["Truncated Description"]
        Date["Date Added"]
    end

    subgraph SeverityIcons["Severity Icons"]
        CrashIcon["Car Icon (warning)"]
        FireIcon["Flame Icon (destructive)"]
        InjuryIcon["AlertTriangle Icon"]
        DeathIcon["Skull Icon (destructive)"]
    end

    ComplaintTable --> TableRow
    TableRow --> SeverityIcons
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `complaints` | `Complaint[]` | Complaint data |
| `isLoading` | `boolean` | Show skeletons |
| `selectable` | `boolean` | Enable selection |
| `selectedIds` | `string[]` | Selected IDs |
| `onSelect` | `(ids) => void` | Selection handler |
| `onRowClick` | `(complaint) => void` | Row click handler |
| `onSort` | `(config) => void` | Sort handler |
| `sortConfig` | `SortConfig` | Current sort state |

---

#### ComplaintDetailDialog

**Purpose:** Modal dialog showing full complaint details.

**File:** `src/components/complaints/complaint-detail-dialog.tsx`

```mermaid
graph TB
    subgraph ComplaintDetailDialog["ComplaintDetailDialog"]
        Header["Dialog Header<br/>(Year Make Model)"]
        VehicleInfo["Vehicle Info Grid"]
        DateInfo["Filed Date"]
        SeverityIndicators["Severity Indicators"]
        FullDescription["Full Description"]
    end

    subgraph VehicleInfo["Vehicle Info (2x2 Grid)"]
        Make["Make"]
        Model["Model"]
        Year["Year"]
        ComponentBadge["Component Badge"]
    end

    subgraph SeverityIndicators["Severity Indicators"]
        CrashBadge["Crash"]
        FireBadge["Fire"]
        InjuriesBadge["X Injuries"]
        DeathsBadge["X Deaths"]
    end
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `complaint` | `Complaint | null` | Complaint to display |
| `open` | `boolean` | Dialog open state |
| `onOpenChange` | `(open) => void` | Open state handler |

---

### Pattern Components

#### PatternCard

**Purpose:** Card displaying pattern summary with severity badge.

**File:** `src/components/patterns/pattern-card.tsx`

```mermaid
graph TB
    subgraph PatternCard["PatternCard Component"]
        CardHeader["Card Header"]
        CardBody["Card Body"]
        ActionButtons["Action Buttons"]
    end

    subgraph CardHeader["Card Header"]
        PatternName["Pattern Name"]
        MakeModel["Make Model"]
        SeverityBadge["Severity Badge<br/>(0-10 score)"]
    end

    subgraph CardBody["Card Body"]
        Description["Description (2 lines)"]
        Badges["Year Range + Component"]
        TrendIndicator["Trend Indicator"]
        Statistics["Statistics"]
    end

    subgraph Statistics["Statistics"]
        ComplaintCount["Complaint Count"]
        Deaths["Deaths (if > 0)"]
        Injuries["Injuries (if > 0)"]
        Crashes["Crashes (if > 0)"]
    end

    subgraph TrendIndicator["Trend Indicator"]
        Increasing["TrendingUp (destructive)"]
        Decreasing["TrendingDown (success)"]
        Stable["Minus (muted)"]
    end
```

**Severity Color Mapping:**
| Score | Color Class |
|-------|-------------|
| >= 7 | `bg-destructive` |
| >= 4 | `bg-warning` |
| < 4 | `bg-success` |

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `pattern` | `Pattern` | Pattern data |
| `isLoading` | `boolean` | Show skeleton |
| `isSelected` | `boolean` | Highlight ring |
| `showActions` | `boolean` | Show action buttons |
| `onClick` | `(pattern) => void` | Click handler |
| `onGenerateComplaint` | `(id) => void` | Generate handler |

---

#### PatternDetailDialog

**Purpose:** Modal dialog showing full pattern details with statistics.

**File:** `src/components/patterns/pattern-detail-dialog.tsx`

```mermaid
graph TB
    subgraph PatternDetailDialog["PatternDetailDialog"]
        Header["Header<br/>(Name + Severity Badge)"]
        SummaryStats["Summary Stats Grid"]
        PatternDetails["Pattern Details"]
        TrendSeverity["Trend & Severity"]
        Description["Pattern Description"]
        Dates["Detection Dates"]
        ActionButton["Generate Complaint Button"]
    end

    subgraph SummaryStats["Summary Stats (4 columns)"]
        Complaints["Complaint Count"]
        Deaths["Deaths (destructive)"]
        Injuries["Injuries (warning)"]
        Crashes["Crashes (warning)"]
    end

    subgraph PatternDetails["Pattern Details (2x2)"]
        Make["Make"]
        Model["Model"]
        YearRange["Year Range"]
        ComponentBadge["Component + Icon"]
    end
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `pattern` | `Pattern | null` | Pattern to display |
| `open` | `boolean` | Dialog open state |
| `onOpenChange` | `(open) => void` | Open state handler |
| `onGenerateComplaint` | `(id) => void` | Generate handler |

---

### Generator Components

#### ComplaintForm

**Purpose:** Multi-step form for generating legal complaints.

**File:** `src/components/generator/complaint-form.tsx`

```mermaid
graph TB
    subgraph ComplaintForm["ComplaintForm Component"]
        PatternInfo["Pattern Info Header"]
        PlaintiffSection["Plaintiff Information"]
        CourtSection["Court Selection"]
        TypeSection["Complaint Type"]
        ClassActionFields["Class Action Fields"]
        CausesOfAction["Causes of Action"]
        ActionButtons["Submit/Cancel"]
    end

    subgraph PlaintiffSection["Plaintiff Information"]
        Name["Name Input"]
        State["State Input"]
        IncidentDate["Incident Date"]
        InjuryDescription["Injury Description"]
    end

    subgraph TypeSection["Complaint Type Buttons"]
        ClassAction["Class Action"]
        Individual["Individual"]
    end

    subgraph ClassActionFields["Class Action Fields (conditional)"]
        ClassDefinition["Class Definition"]
        EstimatedSize["Estimated Class Size"]
    end

    subgraph CausesOfAction["Causes of Action (checkboxes)"]
        Negligence["Negligence"]
        StrictLiability["Strict Product Liability"]
        BreachWarranty["Breach of Warranty"]
        Fraud["Fraud"]
        UnjustEnrichment["Unjust Enrichment"]
    end
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `pattern` | `Pattern` | Source pattern |
| `onSubmit` | `(data) => void` | Form submit handler |
| `onCancel` | `() => void` | Cancel handler |
| `isLoading` | `boolean` | Disable form during submit |
| `error` | `string` | Error message to display |
| `initialData` | `Partial<FormData>` | Pre-fill data |

**Form Validation:**
- Plaintiff name: Required
- State: Required
- Year range: Validated (from <= to)

---

#### GeneratedList

**Purpose:** Table of generated complaints with status filtering and actions.

**File:** `src/components/generator/generated-list.tsx`

```mermaid
graph TB
    subgraph GeneratedList["GeneratedList Component"]
        Header["Header + Status Filter"]
        BulkActions["Bulk Actions (if selected)"]
        TableHeader["Table Header (sortable)"]
        ComplaintRows["Complaint Rows"]
        DeleteDialog["Delete Confirmation Dialog"]
    end

    subgraph ComplaintRow["Complaint Row"]
        Checkbox["Selection Checkbox"]
        Title["Title + Created Date"]
        StatusBadge["Status Badge"]
        PatternInfo["Pattern Name"]
        Plaintiff["Plaintiff Name + State"]
        Actions["Action Buttons"]
    end

    subgraph Actions["Row Actions"]
        View["Eye - View"]
        Edit["Edit (DRAFT only)"]
        Download["Download (FINALIZED only)"]
        Delete["Delete (DRAFT only)"]
    end

    subgraph StatusBadges["Status Badge Colors"]
        Draft["DRAFT (warning)"]
        Finalized["FINALIZED (success)"]
        Archived["ARCHIVED (muted)"]
    end
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `complaints` | `GeneratedComplaint[]` | Complaint list |
| `isLoading` | `boolean` | Show skeletons |
| `selectable` | `boolean` | Enable selection |
| `selectedIds` | `string[]` | Selected IDs |
| `onSelect` | `(ids) => void` | Selection handler |
| `onView` | `(id) => void` | View handler |
| `onEdit` | `(id) => void` | Edit handler |
| `onDownload` | `(id) => void` | Download handler |
| `onDelete` | `(id) => void` | Delete handler |
| `onSort` | `(config) => void` | Sort handler |

---

## UI Components (shadcn/ui)

All UI components are built on Radix UI primitives with Tailwind CSS styling.

```mermaid
graph TB
    subgraph UIPrimitives["UI Primitives"]
        Button["Button<br/>CVA variants"]
        Card["Card<br/>CardHeader, CardContent"]
        Dialog["Dialog<br/>DialogHeader, DialogContent"]
        Table["Table<br/>TableRow, TableCell"]
        Badge["Badge<br/>Variant styles"]
        Input["Input<br/>Form control"]
        Select["Select<br/>Dropdown"]
        Checkbox["Checkbox<br/>Toggle control"]
        Form["Form<br/>react-hook-form"]
        Alert["Alert<br/>Notifications"]
        Tabs["Tabs<br/>Tab navigation"]
        Skeleton["Skeleton<br/>Loading placeholders"]
        Separator["Separator<br/>Divider line"]
    end
```

### Component Files

| Component | File | Dependencies |
|-----------|------|--------------|
| Button | `ui/button.tsx` | Radix Slot, CVA |
| Card | `ui/card.tsx` | - |
| Dialog | `ui/dialog.tsx` | @radix-ui/react-dialog |
| Table | `ui/table.tsx` | - |
| Badge | `ui/badge.tsx` | CVA |
| Input | `ui/input.tsx` | - |
| Select | `ui/select.tsx` | @radix-ui/react-select |
| Checkbox | `ui/checkbox.tsx` | @radix-ui/react-checkbox |
| Form | `ui/form.tsx` | react-hook-form |
| Alert | `ui/alert.tsx` | - |
| Tabs | `ui/tabs.tsx` | @radix-ui/react-tabs |
| Skeleton | `ui/skeleton.tsx` | - |
| Separator | `ui/separator.tsx` | @radix-ui/react-separator |
| Label | `ui/label.tsx` | @radix-ui/react-label |
| Dropdown | `ui/dropdown-menu.tsx` | @radix-ui/react-dropdown-menu |
| Textarea | `ui/textarea.tsx` | - |
| Sonner | `ui/sonner.tsx` | sonner |

---

## State Management

```mermaid
graph TB
    subgraph ClientState["Client-Side State"]
        useState["React useState"]
        usePathname["Next.js usePathname"]
    end

    subgraph ServerState["Server-Side State"]
        ServerComponents["Server Components"]
        APIRoutes["API Route Handlers"]
    end

    subgraph DataFetching["Data Fetching"]
        Fetch["Native fetch()"]
        UseEffect["useEffect + fetch"]
    end

    ClientState --> DataFetching
    DataFetching --> ServerState
```

**Pattern:** CaseRadar uses a simple data fetching pattern:
1. Server components fetch initial data
2. Client components use `useState` + `fetch` for dynamic updates
3. No global state management library (Redux, Zustand)

---

## Component Data Flow

```mermaid
sequenceDiagram
    participant Page as Page Component
    participant Feature as Feature Component
    participant UI as UI Component
    participant API as API Route

    Page->>Feature: props (data, handlers)
    Feature->>UI: props (value, onChange)
    UI-->>Feature: event (onChange)
    Feature->>API: fetch (POST/GET)
    API-->>Feature: JSON response
    Feature-->>Page: callback (onUpdate)
```

---

## Styling Patterns

### Tailwind CSS 4 Classes

**Layout:**
- Grid: `grid grid-cols-2 md:grid-cols-4 gap-4`
- Flexbox: `flex items-center justify-between`
- Spacing: `p-4 md:p-6 lg:p-8`

**Colors:**
- Primary: `text-primary`, `bg-primary`
- Muted: `text-muted-foreground`, `bg-muted`
- Destructive: `text-destructive`, `bg-destructive`
- Warning: `text-warning`, `bg-warning`
- Success: `text-success`, `bg-success`

**States:**
- Hover: `hover:bg-muted/50`
- Active: `ring-2 ring-primary`
- Disabled: `disabled:opacity-50`

### Dark Mode Support

```mermaid
graph TB
    subgraph ThemeProvider["ThemeProvider (next-themes)"]
        Attribute["attribute='class'"]
        DefaultTheme["defaultTheme='system'"]
        EnableSystem["enableSystem=true"]
    end

    subgraph Variants["Color Variants"]
        LightBg["bg-background (light)"]
        DarkBg["dark:bg-background"]
        AutoSwitch["Automatic switching"]
    end

    ThemeProvider --> Variants
```

---

## Testing

Components use Vitest + Testing Library:

```
src/components/
├── complaints/__tests__/
│   ├── complaint-filters.test.tsx
│   └── complaint-table.test.tsx
├── dashboard/__tests__/
│   ├── activity-feed.test.tsx
│   ├── alerts-panel.test.tsx
│   └── stats-cards.test.tsx
├── generator/__tests__/
│   ├── complaint-form.test.tsx
│   └── generated-list.test.tsx
└── patterns/__tests__/
    └── pattern-card.test.tsx
```

**Test Patterns:**
- Render tests with test IDs
- User interaction with `@testing-library/user-event`
- Loading state tests
- Empty state tests

---

**Previous:** [02-api-routes.md](./02-api-routes.md) - API Routes
**Next:** [04-authentication.md](./04-authentication.md) - Authentication
