import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import 'mathlive/fonts.css'
import './styles.css'
import './redesign.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // The calculator stays usable online if offline caching is unavailable.
    })
  })
}
