import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono, Manrope } from 'next/font/google'
import { THEME_BOOT_SCRIPT } from '@/lib/client/theme'
import './globals.css'

const manrope = Manrope({ variable: '--font-manrope', subsets: ['latin'], weight: ['400', '500'] })
const inter = Inter({ variable: '--font-inter', subsets: ['latin'] })
const jetbrains = JetBrains_Mono({ variable: '--font-jetbrains', subsets: ['latin'], weight: ['400', '500'] })

const SITE_URL = 'https://korrin-steel.vercel.app'
const DESCRIPTION = 'Put your stablecoin liquidity on Tempo’s order book. Set your prices and sizes, approve each order, and see what really reached the book.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Korrin · Stablecoin market making on Tempo', template: '%s · Korrin' },
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'Korrin',
    title: 'Korrin · Stablecoin market making on Tempo',
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Korrin · Stablecoin market making on Tempo',
    description: DESCRIPTION,
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f6f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0c0e' },
  ],
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${manrope.variable} ${inter.variable} ${jetbrains.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
