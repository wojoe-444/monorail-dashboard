import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@/styles/theme.css'
// Applies the saved palette and mode before the first render.
import '@/lib/theme'

import { HubShell } from '@/app/HubShell'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HubShell />
  </StrictMode>,
)
