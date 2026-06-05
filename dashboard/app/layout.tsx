import './globals.css'
import type { ReactNode } from 'react'

export const metadata = {
  title: 'choros — run dashboard',
  description: 'Visualize choros workflow runs: phases, agent conversations, tool calls, results.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="wrap">{children}</div>
      </body>
    </html>
  )
}
