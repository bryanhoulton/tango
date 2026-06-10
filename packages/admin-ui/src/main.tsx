import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SlateProvider } from 'slate-ui'

import { App } from './App.js'
import './index.css'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Missing #root element.')
}

createRoot(root).render(
  <StrictMode>
    <SlateProvider>
      <App />
    </SlateProvider>
  </StrictMode>
)
