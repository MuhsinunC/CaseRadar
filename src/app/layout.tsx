import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/theme-provider';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'CaseRadar',
    template: '%s | CaseRadar',
  },
  description:
    'Monitor NHTSA vehicle complaints, identify class action patterns, and generate legal complaints with AI-powered analysis.',
  keywords: [
    'class action',
    'vehicle complaints',
    'NHTSA',
    'legal technology',
    'automotive defects',
    'law firm software',
  ],
  authors: [{ name: 'CaseRadar' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'CaseRadar',
    title: 'CaseRadar - Class Action Pattern Detection',
    description:
      'AI-powered platform for law firms to monitor vehicle complaints and identify class action opportunities.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CaseRadar',
    description: 'AI-powered class action pattern detection for law firms.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
